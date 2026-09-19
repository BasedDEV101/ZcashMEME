// Turn a `getTransaction` response into NormalizedTx by reading RAW
// instruction bytes (encoding: "json", not "jsonParsed").
//
// Why not jsonParsed: its labels are not reliable enough to decide who owns
// burned tokens. When extra accounts are appended to a burn, it can report a
// normal owner as `multisigAuthority`; it also labels Token-2022 as
// "spl-token". Either could make us reject a real burn, and a burn cannot be
// undone. Raw bytes plus preTokenBalances are unambiguous, and any third party
// re-implementing SPEC §3 sees exactly the same bytes we do.

import type { NormalizedTx, TokenBurn } from "../core/types.ts";
import { base58Decode } from "../core/base58.ts";
import { IX_BURN, IX_BURN_CHECKED, MEMO_PROGRAMS, TOKEN_PROGRAMS } from "./programs.ts";

interface RawIx { programIdIndex: number; accounts: number[]; data: string }
interface TokenBalance { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } }

export interface RpcTransaction {
  slot: number;
  blockTime?: number | null;
  version?: number | "legacy";
  meta: {
    err: unknown;
    innerInstructions?: { index: number; instructions: RawIx[] }[] | null;
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
    loadedAddresses?: { writable: string[]; readonly: string[] } | null;
  } | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: string[];
      header: { numRequiredSignatures: number };
      instructions: RawIx[];
    };
  };
}

/** Full key list: static keys, then address-lookup-table keys (writable, then readonly). */
export function resolveKeys(tx: RpcTransaction): string[] {
  const l = tx.meta?.loadedAddresses;
  return [...tx.transaction.message.accountKeys, ...(l?.writable ?? []), ...(l?.readonly ?? [])];
}

function u64le(bytes: Uint8Array, offset: number): bigint | null {
  if (bytes.length < offset + 8) return null;
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bytes[offset + i]);
  return v;
}

function burnFrom(ix: RawIx, keys: string[], topLevel: boolean, balances: { pre: Map<number, TokenBalance>; post: Map<number, TokenBalance> }): TokenBurn | null {
  const programId = keys[ix.programIdIndex];
  if (!programId || !TOKEN_PROGRAMS.has(programId)) return null;
  const data = base58Decode(ix.data);
  if (!data || data.length < 9) return null;
  const tag = data[0];
  if (tag !== IX_BURN && tag !== IX_BURN_CHECKED) return null;
  // Accounts: [source, mint, authority]. Extra accounts (multisig signers) may follow.
  if (ix.accounts.length < 3) return null;
  const amount = u64le(data, 1);
  if (amount === null) return null;

  const sourceIndex = ix.accounts[0];
  const pre = balances.pre.get(sourceIndex);
  const post = balances.post.get(sourceIndex);
  return {
    programId,
    mint: keys[ix.accounts[1]],
    account: keys[sourceIndex],
    authority: keys[ix.accounts[2]],
    amount,
    topLevel,
    decimalsChecked: tag === IX_BURN_CHECKED ? data[9] ?? null : null,
    sourceOwner: pre?.owner ?? null,
    preAmount: pre ? BigInt(pre.uiTokenAmount.amount) : null,
    postAmount: post ? BigInt(post.uiTokenAmount.amount) : 0n,
  };
}

function memoFrom(ix: RawIx, keys: string[]): string | null {
  const programId = keys[ix.programIdIndex];
  if (!programId || !MEMO_PROGRAMS.has(programId)) return null;
  const data = base58Decode(ix.data);
  if (!data) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return null; // not UTF-8: cannot be an address
  }
}

export function normalizeTransaction(tx: RpcTransaction, opts: { finalized: boolean }): NormalizedTx {
  const keys = resolveKeys(tx);
  const balances = {
    pre: new Map((tx.meta?.preTokenBalances ?? []).map((b) => [b.accountIndex, b])),
    post: new Map((tx.meta?.postTokenBalances ?? []).map((b) => [b.accountIndex, b])),
  };

  const burns: TokenBurn[] = [];
  const memos: string[] = [];
  for (const ix of tx.transaction.message.instructions) {
    const b = burnFrom(ix, keys, true, balances);
    if (b) burns.push(b);
    const m = memoFrom(ix, keys);
    if (m !== null) memos.push(m);
  }
  for (const group of tx.meta?.innerInstructions ?? []) {
    for (const ix of group.instructions) {
      const b = burnFrom(ix, keys, false, balances);
      if (b) burns.push(b);
      // Memos invoked via CPI are not counted: SPEC §3.8 counts top-level memos,
      // so a program cannot slip an address in on the signer's behalf.
    }
  }

  const signerCount = tx.transaction.message.header?.numRequiredSignatures ?? 0;
  return {
    signature: tx.transaction.signatures[0],
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    finalized: opts.finalized,
    succeeded: tx.meta !== null && tx.meta.err === null,
    signers: tx.transaction.message.accountKeys.slice(0, signerCount),
    burns,
    memos,
  };
}
