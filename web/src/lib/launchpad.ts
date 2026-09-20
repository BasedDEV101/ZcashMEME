import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { encodeDeployRequest } from "@protocol/core/deploy-request.ts";
import { MEMO_V3 } from "@protocol/solana/programs.ts";

/** What it costs to register a collection, and who receives it. */
export const LAUNCH_FEE_SOL = 0.5;
export const LAUNCH_FEE_LAMPORTS = BigInt(Math.round(LAUNCH_FEE_SOL * 1e9));

/** Fees land here. Change this to move launch revenue to a different wallet. */
export const OPERATOR_ADDRESS = "CkYBWStJkXMDM1XqyBTukYHxivjDmhBv8A7i1wcMgj3o";

/** Roughly what one stamp costs the collection's funding balance, in ZEC. */
export const STAMP_COST_ZEC = 0.00030546;

export interface Collection {
  sym: string;
  mint: string;
  dec: number;
  min: string;
  from: number;
  inscriptionId: string;
  height: number;
  funding: string;
  stamps?: number;
  fundedZat?: string;
}

/**
 * A deploy request: pay the fee, say what you are registering.
 *
 * Same shape as a burn — one transaction, a payment and a memo — so the
 * operator's watcher verifies it by the same kind of rule, and the request is
 * public and checkable rather than an email nobody else can audit.
 */
export function buildDeployRequest(payer: string, mint: string, symbol: string, minWholeTokens: bigint): TransactionInstruction[] {
  const from = new PublicKey(payer);
  return [
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: new PublicKey(OPERATOR_ADDRESS),
      lamports: Number(LAUNCH_FEE_LAMPORTS),
    }),
    new TransactionInstruction({
      keys: [{ pubkey: from, isSigner: true, isWritable: false }],
      programId: new PublicKey(MEMO_V3),
      data: new TextEncoder().encode(
        encodeDeployRequest({ mint, symbol, minWholeTokens }),
      ) as unknown as Buffer,
    }),
  ];
}
