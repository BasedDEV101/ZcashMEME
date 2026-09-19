// Build getTransaction("json") responses: raw instruction bytes, the shape
// normalize.ts actually parses.
import { base58Encode } from "../../src/core/base58.ts";
import type { RpcTransaction } from "../../src/solana/normalize.ts";
import { IX_BURN, IX_BURN_CHECKED } from "../../src/solana/programs.ts";

export function burnData(amount: bigint, decimals: number | null): Uint8Array {
  const out = [decimals === null ? IX_BURN : IX_BURN_CHECKED];
  let v = amount;
  for (let i = 0; i < 8; i++) { out.push(Number(v & 0xffn)); v >>= 8n; }
  if (decimals !== null) out.push(decimals);
  return Uint8Array.from(out);
}

export interface IxSpec { program: string; accounts?: string[]; data: Uint8Array }
export interface BalanceSpec { account: string; mint: string; owner?: string; pre: bigint; post: bigint }

export function rawTx(o: {
  signature: string;
  slot?: number;
  signers: string[];
  ixs: IxSpec[];
  innerIxs?: IxSpec[];
  balances?: BalanceSpec[];
  err?: unknown;
  lookup?: string[];          // keys delivered via an address lookup table
}): RpcTransaction {
  const lookup = o.lookup ?? [];
  const staticKeys: string[] = [...o.signers];
  // Register every non-lookup key first: a lookup key's index is
  // staticKeys.length + i, so it must not move afterwards.
  for (const ix of [...o.ixs, ...(o.innerIxs ?? [])]) {
    for (const k of [ix.program, ...(ix.accounts ?? [])]) {
      if (!lookup.includes(k) && !staticKeys.includes(k)) staticKeys.push(k);
    }
  }
  for (const b of o.balances ?? []) {
    if (!lookup.includes(b.account) && !staticKeys.includes(b.account)) staticKeys.push(b.account);
  }
  const keyIndex = (k: string) => {
    const viaLookup = lookup.indexOf(k);
    if (viaLookup >= 0) return staticKeys.length + viaLookup;
    let i = staticKeys.indexOf(k);
    if (i < 0) { staticKeys.push(k); i = staticKeys.length - 1; }
    return i;
  };
  const enc = (list: IxSpec[]) => list.map((ix) => ({
    programIdIndex: keyIndex(ix.program),
    accounts: (ix.accounts ?? []).map(keyIndex),
    data: base58Encode(ix.data),
  }));
  const instructions = enc(o.ixs);
  const inner = o.innerIxs ? [{ index: 0, instructions: enc(o.innerIxs) }] : [];
  const bal = (which: "pre" | "post") => (o.balances ?? []).map((b) => ({
    accountIndex: keyIndex(b.account), mint: b.mint, owner: b.owner,
    uiTokenAmount: { amount: (which === "pre" ? b.pre : b.post).toString() },
  }));
  return {
    slot: o.slot ?? 1000,
    blockTime: 1_758_300_000,
    version: 0,
    meta: {
      err: o.err ?? null,
      innerInstructions: inner,
      preTokenBalances: bal("pre"),
      postTokenBalances: bal("post"),
      loadedAddresses: { writable: lookup, readonly: [] },
    },
    transaction: {
      signatures: [o.signature],
      message: { accountKeys: staticKeys, header: { numRequiredSignatures: o.signers.length }, instructions },
    },
  };
}
