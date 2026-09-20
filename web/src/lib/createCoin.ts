import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { PumpSdk } from "@pump-fun/pump-sdk";
import { encodeDeployRequest } from "@protocol/core/deploy-request.ts";
import { MEMO_V3 } from "@protocol/solana/programs.ts";
import { assertNotForbidden } from "@protocol/core/forbidden.ts";
import BN from "bn.js";
import { CREATOR_FEE_BPS, LAUNCH_FEE_LAMPORTS, OPERATOR_ADDRESS } from "./launchpad.ts";

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
  // base64 in JSON, not multipart: the function parses JSON reliably and
  // there is no form boundary handling to go wrong.
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const res = await fetch("/api/metadata", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: d.name, symbol: d.symbol, description: d.description,
      website: d.website, twitter: d.twitter,
      imageType: file.type, imageBase64: btoa(binary),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { uri?: string; image?: string; error?: string };
  if (!res.ok || !body.uri) throw new Error(body.error ?? `Upload failed (${res.status}).`);
  return { uri: body.uri, image: body.image! };
}

export interface BuiltLaunch {
  /** Creates the coin on pump.fun, with its 2% creator fee set. */
  create: Transaction;
  /** Points that fee at the pad, pays the launch fee, and asks for the
      collection — together, so a coin cannot be registered here without its
      fee being routed. */
  register: Transaction;
  mint: Keypair;
}

/**
 * The launch, in two signatures.
 *
 * It was one, until the fee-sharing instructions pushed it past Solana's
 * 1232-byte limit -- 1370 bytes with everything in one, and still 1268 with
 * the create alone once a 32-character name and a 10-character ticker were
 * used, which is what the form allows.
 *
 * So the create stands alone, and everything else rides together: pointing
 * the creator fee at the pad, paying the launch fee, and asking for the
 * collection. Those three are the ones that must not come apart -- a coin
 * cannot end up on this register without its fee routed, because the same
 * signature does both. A launcher who stops after the first signature has an
 * ordinary pump.fun coin, no collection, and has paid us nothing.
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
    // The launcher creates the coin and is its creator on pump.fun. The
    // creator FEE is redirected to the pad by the fee-sharing config below --
    // the coin is still theirs, and it is not launched from our wallet.
    creator: payer,
    user: payer,
    creatorFeeBps: new BN(CREATOR_FEE_BPS),
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

  // Route that creator fee to the pad. Two instructions: the config exists
  // first, then its shares are set. `pool: null` because a coin being created
  // has no pool yet -- it starts on a bonding curve. The launcher signs these,
  // because the config's authority is the coin's creator, which is them.
  const operator = new PublicKey(OPERATOR_ADDRESS);
  const sharingConfig = await sdk.createFeeSharingConfig({ creator: payer, mint: mint.publicKey, pool: null });
  const shares = await sdk.updateFeeShares({
    authority: payer,
    mint: mint.publicKey,
    currentShareholders: [payer],
    newShareholders: [{ address: operator, shareBps: 10_000 }],
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

  return {
    create: new Transaction().add(create),
    register: new Transaction().add(sharingConfig, shares, fee, register),
    mint,
  };
}
