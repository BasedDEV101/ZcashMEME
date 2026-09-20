// Gap-free burn discovery (SPEC §6).
//
// Every burn instruction writes to the mint account, so every burn appears in
// getSignaturesForAddress(mint). So does every transfer and swap, which on a
// busy token is thousands per minute. We only fetch transactions whose listing
// carries a memo: §3 rule 8 requires one, so this filter can never drop a
// valid burn.
//
// One pass:
//   1. page backwards from the newest finalized signature until we reach the
//      cursor (the newest signature a previous pass fully processed)
//   2. process the new signatures oldest -> newest, recording a verdict for
//      every one that carries a memo
//   3. advance the cursor to the newest signature seen
// A crash mid-pass leaves the cursor where it was; the next pass re-fetches
// and INSERT OR IGNORE makes re-recording harmless. Nothing is skipped.

import type { BridgeConfig } from "../core/types.ts";
import { evaluateBurn } from "../core/validity.ts";
import { normalizeTransaction } from "./normalize.ts";
import { RpcError, type SignatureInfo, type SolanaRpc } from "./rpc.ts";
import type { Store } from "../store/db.ts";

export interface PassResult {
  scanned: number;        // new signatures listed
  fetched: number;        // carried a memo, so fetched
  burnAttempts: number;   // fetched AND burned our mint: a verdict was recorded
  valid: number;
  rejected: number;
  cursor: string | null;
}

type Log = (msg: string) => void;

export async function watchPass(
  rpc: SolanaRpc, store: Store, cfg: BridgeConfig,
  opts: { pageSize?: number; log?: Log; maxInitialPages?: number } = {},
): Promise<PassResult> {
  const cursorName = `solana:${cfg.solanaMint}`;
  const slotName = `${cursorName}:slot`;
  const until = store.getCursor(cursorName) ?? undefined;
  const lastSlot = Number(store.getCursor(slotName) ?? "0");
  const pageSize = opts.pageSize ?? 1000;
  const log = opts.log ?? (() => {});
  // A traded mint accumulates millions of signatures -- 1.28M for $STAMP one
  // day after launch, 250s to list even on a paid endpoint, growing hourly.
  // A first pass therefore reads only the newest window and records its
  // cursor there. Anything older is reached the cheap way: an inscription
  // citing an old burn resolves it with a single getTransaction (SPEC 4.2.1).
  const maxInitialPages = opts.maxInitialPages ?? 20;

  // 1. collect everything newer than the cursor (newest first).
  //
  // `until` is an optimisation, not the source of truth: an RPC that no longer
  // knows that signature (pruned history, a different provider) errors on it,
  // which would wedge the watcher forever. On that error we re-scan without it
  // and stop at the last processed slot instead. Observed for real against a
  // local validator whose history had aged out.
  const fresh: SignatureInfo[] = [];
  let before: string | undefined;
  let useUntil = until;
  let pages = 0;
  let cappedAt: string | undefined;
  for (;;) {
    let page: SignatureInfo[];
    try {
      page = await rpc.getSignaturesForAddress(cfg.solanaMint, { before, until: useUntil, limit: pageSize });
    } catch (e) {
      if (useUntil && e instanceof RpcError && /not found/i.test(e.message)) {
        log(`cursor signature unknown to the RPC; falling back to slot ${lastSlot}`);
        useUntil = undefined;
        fresh.length = 0;
        before = undefined;
        continue;
      }
      throw e;
    }
    // Always stop at the collection's start slot, not only in the fallback
    // path: a traded token accumulates tens of thousands of signatures, and
    // paging to genesis on every fresh store makes the first pass unusable.
    pages++;
    const floor = Math.max(useUntil ? 0 : lastSlot, cfg.startSlot - 1);
    const stop = page.findIndex((s) => s.slot <= floor);
    fresh.push(...(stop >= 0 ? page.slice(0, stop) : page));
    if (stop >= 0 || page.length < pageSize) break;
    before = page[page.length - 1].signature;
    if (!until && pages >= maxInitialPages) {
      cappedAt = before;
      log(`first pass stopped after ${pages * pageSize} signatures; older burns resolve on demand`);
      break;
    }
  }
  const result: PassResult = { scanned: fresh.length, fetched: 0, burnAttempts: 0, valid: 0, rejected: 0, cursor: until ?? null };
  if (fresh.length === 0) return result;

  // 2. oldest -> newest
  for (const s of fresh.reverse()) {
    if (!s.memo) continue;              // no memo -> cannot be a valid burn (§3.8)
    if (store.hasBurn(s.signature)) continue;
    const raw = await rpc.getTransaction(s.signature, "finalized");
    if (!raw) throw new Error(`finalized tx ${s.signature} not returned by RPC; retrying next pass`);
    result.fetched++;
    const tx = normalizeTransaction(raw, { finalized: true });
    // A memo-carrying tx that burns nothing of ours is ordinary traffic, not a
    // burn attempt: don't clutter the table with it.
    if (!tx.burns.some((b) => b.mint === cfg.solanaMint)) continue;
    const v = evaluateBurn(tx, cfg);
    store.recordVerdict(tx.signature, tx.slot, tx.blockTime, v);
    result.burnAttempts++;
    if (v.ok) {
      result.valid++;
      log(`burn ${short(tx.signature)} valid: ${v.burn.amount} -> ${v.burn.zcashAddress}`);
    } else {
      result.rejected++;
      log(`burn ${short(tx.signature)} rejected: ${v.reason}`);
    }
  }

  // 3. advance. `fresh` is now oldest-first, so the last element is newest.
  const newest = fresh[fresh.length - 1];
  store.setCursor(cursorName, newest.signature);
  store.setCursor(slotName, String(Math.max(newest.slot, lastSlot)));
  result.cursor = newest.signature;
  return result;
}

const short = (s: string) => `${s.slice(0, 8)}…`;
