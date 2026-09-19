// Turn a `getTransaction` response (encoding: "jsonParsed") into NormalizedTx.
//
// Plain JSON-RPC, no SDK: the RPC's own parser labels token and memo
// instructions, and the same response shape comes back from every provider.
// Anything we cannot parse is left out, which can only make a tx LESS valid
// under §3, never more.

import type { NormalizedTx, TokenBurn } from "../core/types.ts";
import { base58Decode } from "../core/base58.ts";
import { MEMO_PROGRAMS, TOKEN_PROGRAMS } from "./programs.ts";

// Loose shapes of the jsonParsed response: only the fields we read.
interface ParsedIx {
  programId: string;
  program?: string;
  parsed?: unknown;
  data?: string;
}
export interface RpcTransaction {
  slot: number;
  blockTime?: number | null;
  meta: { err: unknown; innerInstructions?: { index: number; instructions: ParsedIx[] }[] | null } | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: ({ pubkey: string; signer: boolean } | string)[];
      instructions: ParsedIx[];
    };
  };
}

function burnFrom(ix: ParsedIx, topLevel: boolean): TokenBurn | null {
  if (!TOKEN_PROGRAMS.has(ix.programId)) return null;
  const p = ix.parsed as { type?: string; info?: Record<string, unknown> } | undefined;
  if (!p || (p.type !== "burn" && p.type !== "burnChecked")) return null;
  const info = p.info ?? {};
  const raw =
    p.type === "burn"
      ? info.amount
      : (info.tokenAmount as { amount?: unknown } | undefined)?.amount;
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw)) return null;
  // A multisig burn has `multisigAuthority` instead of `authority`. The multisig
  // account itself never signs, so §3.6 will reject it, which is intended.
  const authority = (info.authority ?? info.multisigAuthority) as unknown;
  if (typeof info.mint !== "string" || typeof info.account !== "string" || typeof authority !== "string") {
    return null;
  }
  return {
    programId: ix.programId,
    mint: info.mint,
    account: info.account,
    authority,
    amount: BigInt(raw),
    topLevel,
  };
}

function memoFrom(ix: ParsedIx): string | null {
  if (!MEMO_PROGRAMS.has(ix.programId)) return null;
  if (typeof ix.parsed === "string") return ix.parsed;
  if (typeof ix.data === "string") {
    const bytes = base58Decode(ix.data);
    if (!bytes) return null;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeTransaction(tx: RpcTransaction, opts: { finalized: boolean }): NormalizedTx {
  const top = tx.transaction.message.instructions;
  const inner = (tx.meta?.innerInstructions ?? []).flatMap((g) => g.instructions);

  const burns: TokenBurn[] = [];
  const memos: string[] = [];
  for (const [list, topLevel] of [[top, true], [inner, false]] as const) {
    for (const ix of list) {
      const b = burnFrom(ix, topLevel);
      if (b) burns.push(b);
      const m = memoFrom(ix);
      if (m !== null) memos.push(m);
    }
  }

  const signers = tx.transaction.message.accountKeys
    .filter((k): k is { pubkey: string; signer: boolean } => typeof k === "object" && k.signer)
    .map((k) => k.pubkey);

  return {
    signature: tx.transaction.signatures[0],
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    finalized: opts.finalized,
    succeeded: tx.meta !== null && tx.meta.err === null,
    signers,
    burns,
    memos,
  };
}
