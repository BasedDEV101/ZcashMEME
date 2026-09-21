import {
  Keypair, PublicKey, SystemProgram, TransactionInstruction,
  TransactionMessage, VersionedTransaction, type Connection,
} from "@solana/web3.js";
import { PumpSdk } from "@pump-fun/pump-sdk";
import { encodeDeployRequest } from "@protocol/core/deploy-request.ts";
import { MEMO_V3 } from "@protocol/solana/programs.ts";
import { assertNotForbidden } from "@protocol/core/forbidden.ts";
import BN from "bn.js";
import { CREATOR_FEE_BPS, LAUNCH_FEE_LAMPORTS, LOOKUP_TABLE, OPERATOR_ADDRESS } from "./launchpad.ts";

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
  /** The whole launch, in one signature. */
  transaction: VersionedTransaction;
  mint: Keypair;
}

/**
 * One transaction that does the whole launch:
 *   1. create the coin on pump.fun, with its creator fee set
 *   2. point that fee at the pad
 *   3. pay the launch fee
 *   4. request its collection, as a memo the operator's watcher reads
 *
 * One signature, so a launcher cannot end up with a coin whose fee is not
 * routed, a collection with no coin, or a paid fee and no coin.
 *
 * It is a versioned transaction because a legacy one cannot hold it: spelled
 * out in full these instructions come to 1422 bytes against a 1232-byte
 * limit. The 18 accounts that are the same for every launch are referenced
 * through a lookup table instead, at a byte each.
 */
export async function buildLaunch(
  payer: PublicKey, uri: string, d: CoinDetails, conn: Connection,
): Promise<BuiltLaunch> {
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
    // ZEC pairing is OFF. create_v2 accepts the ZEC quote happily -- that part
    // simulates clean -- but updateFeeSharesV2 then fails the whole
    // transaction with InvalidAccountData out of DistributeCreatorFeesV2, so
    // no coin gets created at all. Shipped and reverted 2026-09-21; see
    // QUOTE_MINT for what still needs solving before it can go back on.
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

  const lookup = await conn.getAddressLookupTable(new PublicKey(LOOKUP_TABLE));
  if (!lookup.value) throw new Error("The launch lookup table could not be read. Try again in a moment.");

  const { blockhash } = await conn.getLatestBlockhash("finalized");
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [create, sharingConfig, shares, fee, register],
  }).compileToV0Message([lookup.value]);

  const transaction = new VersionedTransaction(message);
  // The mint is a fresh keypair and must sign its own creation. Signing here
  // leaves the wallet's slot empty for the wallet to fill.
  transaction.sign([mint]);
  return { transaction, mint };
}
