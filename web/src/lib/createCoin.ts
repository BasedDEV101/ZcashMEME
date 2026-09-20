import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { PumpSdk } from "@pump-fun/pump-sdk";
import { encodeDeployRequest } from "@protocol/core/deploy-request.ts";
import { MEMO_V3 } from "@protocol/solana/programs.ts";
import { assertNotForbidden } from "@protocol/core/forbidden.ts";
import { LAUNCH_FEE_LAMPORTS, OPERATOR_ADDRESS } from "./launchpad.ts";

export interface CoinDetails {
  name: string;
  symbol: string;
  description: string;
  website: string;
  twitter: string;
  minWholeTokens: bigint;
}

export interface UploadedMetadata { uri: string; image: string }

/** Send the image and details to our own storage; pump.fun's is closed to us. */
export async function uploadMetadata(file: File, d: CoinDetails): Promise<UploadedMetadata> {
  const form = new FormData();
  form.append("file", file);
  form.append("name", d.name);
  form.append("symbol", d.symbol);
  form.append("description", d.description);
  form.append("website", d.website);
  form.append("twitter", d.twitter);
  const res = await fetch("/api/metadata", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { uri?: string; image?: string; error?: string };
  if (!res.ok || !body.uri) throw new Error(body.error ?? `Upload failed (${res.status}).`);
  return { uri: body.uri, image: body.image! };
}

export interface BuiltLaunch {
  transaction: Transaction;
  mint: Keypair;
}

/**
 * One transaction that does the whole launch:
 *   1. create the coin on pump.fun
 *   2. pay the launch fee
 *   3. request its collection, as a memo the operator's watcher reads
 *
 * One signature, so a launcher cannot end up with a coin and no collection, or
 * a paid fee and no coin.
 */
export async function buildLaunch(payer: PublicKey, uri: string, d: CoinDetails): Promise<BuiltLaunch> {
  assertNotForbidden(payer.toBase58(), "a coin launch");
  const mint = Keypair.generate();
  const sdk = new PumpSdk();

  const create = await sdk.createV2Instruction({
    mint: mint.publicKey,
    name: d.name,
    symbol: d.symbol,
    uri,
    creator: payer,
    user: payer,
    // Never on. Mayhem doubles the supply to 2B and lets pump's agent burn
    // tokens on its own -- burns nobody authorised, which would mint stamps
    // and wreck the collection's accounting.
    mayhemMode: false,
  });

  const fee = SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: new PublicKey(OPERATOR_ADDRESS),
    lamports: Number(LAUNCH_FEE_LAMPORTS),
  });

  const register = new TransactionInstruction({
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    programId: new PublicKey(MEMO_V3),
    data: new TextEncoder().encode(
      encodeDeployRequest({
        mint: mint.publicKey.toBase58(),
        symbol: d.symbol,
        minWholeTokens: d.minWholeTokens,
      }),
    ) as unknown as Buffer,
  });

  return { transaction: new Transaction().add(create, fee, register), mint };
}
