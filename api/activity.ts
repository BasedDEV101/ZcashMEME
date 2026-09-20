// What the launchpad has actually done: every collection on it, and every
// burn against those collections.
//
// The source of truth is both chains, not a database we keep. A launch is a
// transaction that paid the fee and carried a deploy memo, so listing the
// operator address's history IS the list of launches. A burn is judged by
// evaluateBurn — the same rule the bridge uses — so what this page calls a
// burn and what actually earns a certificate cannot drift apart.
//
// Ranking is by burns verified under that rule, not by how far supply has
// fallen. Supply falls for reasons that have nothing to do with us, and
// crediting a collection for those would be a number we cannot stand behind.
//
// Scanning is bounded: a traded mint carries millions of signatures, so each
// pass reads only the newest window and merges the older history from
// _history.json (written by scripts/export-burns.ts). Only signatures whose
// listing already carries a memo are fetched — SPEC 3.8 requires one, so that
// filter can never drop a valid burn.

import type { IncomingMessage, ServerResponse } from "node:http";
import { decodeBase58, inParallel, json, lamportsTransferredTo, loadSnapshot, readCurves, readOnchainMetadata, readPumpCreate, rpc, saveSnapshot } from "./_rpc.ts";
import { parseDeployRequest, REQUEST_PREFIX } from "../src/core/deploy-request.ts";
import { normalizeTransaction, resolveKeys, type RpcTransaction } from "../src/solana/normalize.ts";
import { evaluateBurn } from "../src/core/validity.ts";
import type { BridgeConfig } from "../src/core/types.ts";
import { LAUNCH_FEE_LAMPORTS, OPERATOR_ADDRESS, FLAGSHIP } from "./_launchpad.ts";
import history from "./_history.json" with { type: "json" };

const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const FEE_PAGES = 10;      // operator history: low volume, read it all
const BURN_PAGES = 2;      // per mint, newest first; older burns come from the snapshot
const WIDTH = 5;           // concurrent RPC streams
const MAX_FETCH = 160;     // transactions per request, across all mints
const MAX_BURN_ROWS = 300;

export interface Burn {
  signature: string; mint: string; symbol: string; slot: number; blockTime: number | null;
  burner: string | null; amount: string | null; zcashAddress: string | null;
  ok: boolean; reason?: string;
}

export interface Collection {
  mint: string; symbol: string; name: string | null; image: string | null;
  minWholeTokens: string; signature: string | null;
  /** Raw supply the coin was created with, when its launch tx is ours to
      read. Null for a coin registered here after launching elsewhere. */
  initialSupply: string | null;
  launchedAt: number | null; launchedBy: string | null;
  decimals: number;
  burnedTokens: string;   // whole tokens destroyed under the protocol rule
  burnCount: number;      // certificates earned
  refusedCount: number;
  burners: number;        // distinct wallets that burned
  /** Whole tokens gone from supply, however they went. Always at least
      burnedTokens, and larger when tokens were burned without a memo — those
      earn no certificate but they are still destroyed. */
  destroyedTokens: string | null;
  /** Market cap in lamports, null when there is no honest number to give. */
  marketCapLamports: string | null;
  graduated: boolean;
  /** Raw supply and owning program, read from chain; pricing needs both. */
  supplyRaw: string | null;
  tokenProgramId: string | null;
}

/** How long a rebuild's answer stands before another one is worth doing. */
const FRESH_MS = 3 * 60 * 1000;

export default async function handler(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Serve the last rebuild if it is recent, without touching an RPC.
  //
  // A rebuild takes over a minute, so without this every cache miss started
  // another one and they saturated the RPC between them -- the page then
  // showed "could not read Solana" while the data it needed was sitting in
  // the snapshot. Rebuild frequency is now bounded by time, not by traffic.
  const cached = await loadSnapshot();
  const computedAt = typeof cached?.computedAt === "string" ? Date.parse(cached.computedAt) : 0;
  if (cached && Date.now() - computedAt < FRESH_MS) {
    return json(res, 200, cached, 120);
  }

  try {
    const r = rpc();

    // ---- 1. collections: the flagship, plus everything launched through the pad.
    const collections = new Map<string, Collection>();
    const uris = new Map<string, string>();
    collections.set(FLAGSHIP.mint, {
      mint: FLAGSHIP.mint, symbol: FLAGSHIP.symbol, name: FLAGSHIP.name, image: FLAGSHIP.image,
      minWholeTokens: FLAGSHIP.minWholeTokens, signature: null, initialSupply: null,
      launchedAt: FLAGSHIP.launchedAt, launchedBy: null, decimals: 6,
      burnedTokens: "0", burnCount: 0, refusedCount: 0, burners: 0,
      destroyedTokens: null, marketCapLamports: null, graduated: false,
      supplyRaw: null, tokenProgramId: null,
    });

    const sigs = [];
    let before: string | undefined;
    for (let page = 0; page < FEE_PAGES; page++) {
      const batch = await r.getSignaturesForAddress(OPERATOR_ADDRESS, { before, limit: 1000 });
      sigs.push(...batch);
      if (batch.length < 1000) break;
      before = batch[batch.length - 1].signature;
    }

    // oldest first, so the first launch of a mint is the one that counts
    const paid = sigs.filter((s) => !s.err && s.memo?.includes(REQUEST_PREFIX)).reverse();
    // Fetched in parallel but folded in order below, so which launch of a mint
    // wins does not depend on which request happened to answer first.
    const launchTxs = new Map<string, RpcTransaction>();
    let partial = false;
    await inParallel(paid, WIDTH, async (s) => {
      try {
        const raw = await r.getTransaction(s.signature, "finalized");
        if (raw) launchTxs.set(s.signature, raw);
        else partial = true;
      } catch {
        // A launch we could not read this time is missing from the list, not
        // wrong in it: the page still renders, but this rebuild is incomplete
        // and must not be saved over a complete one. Coins vanished from the
        // leaderboard between refreshes until this counted as partial.
        partial = true;
      }
    });

    for (const s of paid) {
      const raw = launchTxs.get(s.signature);
      if (!raw) continue;
      const tx = normalizeTransaction(raw, { finalized: true });
      if (!tx.succeeded || tx.memos.length !== 1) continue;
      const req = parseDeployRequest(tx.memos[0]);
      if (!req || collections.has(req.mint)) continue;

      // The fee must actually have been paid, or anyone could list for free.
      const keys = resolveKeys(raw);
      if (lamportsTransferredTo(raw, keys, OPERATOR_ADDRESS) < LAUNCH_FEE_LAMPORTS) continue;

      // Name and image come from the create instruction in this same
      // transaction, so they are what the coin actually launched with. A coin
      // registered after launching elsewhere has none, and shows its ticker.
      let name: string | null = null;
      for (const ix of raw.transaction.message.instructions ?? []) {
        if (keys[ix.programIdIndex] !== PUMP) continue;
        const meta = readPumpCreate(decodeBase58(ix.data));
        if (meta && meta.symbol.toUpperCase() === req.symbol) { name = meta.name; uris.set(req.mint, meta.uri); }
      }

      // Supply minted by the create itself. Used only to skip scanning a coin
      // whose supply has never moved -- a burn always reduces supply, so
      // "supply unchanged" is proof of "no burns" and saves listing its
      // history entirely.
      const minted = (raw.meta?.postTokenBalances ?? [])
        .filter((b) => b.mint === req.mint)
        .reduce((t, b) => t + BigInt(b.uiTokenAmount.amount), 0n);

      collections.set(req.mint, {
        mint: req.mint, symbol: req.symbol, name, image: null,
        minWholeTokens: req.minWholeTokens.toString(), signature: tx.signature,
        initialSupply: minted > 0n ? minted.toString() : null,
        launchedAt: tx.blockTime, launchedBy: tx.signers[0] ?? null, decimals: 6,
        burnedTokens: "0", burnCount: 0, refusedCount: 0, burners: 0,
        destroyedTokens: null, marketCapLamports: null, graduated: false,
        supplyRaw: null, tokenProgramId: null,
      });
    }

    // ---- 2. burns, newest window per mint, merged with the history snapshot.
    const rows = new Map<string, Burn>();
    for (const b of (history as { burns: Burn[] }).burns) rows.set(b.signature, b);

    let fetched = 0;
    // Newest collections first. The flagship has 1.28M signatures and its
    // history already lives in the snapshot, so it must not spend the whole
    // per-request fetch budget before a day-old coin gets looked at.
    const scanOrder = [...collections.values()].sort((a, b) => (b.launchedAt ?? 0) - (a.launchedAt ?? 0));
    await inParallel(scanOrder, WIDTH, async (c) => {
      try {
        await scanMint(r, c, rows, () => fetched, (n) => { fetched = n; });
      } catch {
        // A throttled or failing RPC on one mint leaves that mint's recent
        // window unread. Its history and every other mint still show, flagged
        // partial, rather than the page going blank.
        partial = true;
      }
    });

    async function scanMint(
      r: ReturnType<typeof rpc>, c: Collection, rows: Map<string, Burn>,
      getFetched: () => number, setFetched: (n: number) => void,
    ): Promise<void> {
      const info = await r.getAccountInfo(c.mint);
      const parsed = (info.value?.data as { parsed?: { info?: { decimals?: number; supply?: string } } } | undefined)?.parsed;
      if (!info.value || typeof parsed?.info?.decimals !== "number") return;
      c.decimals = parsed.info.decimals;
      c.tokenProgramId = info.value.owner;
      if (typeof parsed.info.supply === "string") c.supplyRaw = parsed.info.supply;

      // Nothing has been burned, so there is nothing to find: skip the scan.
      // Listing a pump.fun mint's signatures is the expensive part of this
      // request -- fourteen of them in sequence took 114 seconds -- and most
      // coins on the pad have never had a single token destroyed.
      if (c.initialSupply && typeof parsed.info.supply === "string") {
        const gone = BigInt(c.initialSupply) - BigInt(parsed.info.supply);
        c.destroyedTokens = (gone > 0n ? gone / 10n ** BigInt(c.decimals) : 0n).toString();
      }
      if (c.initialSupply && parsed.info.supply === c.initialSupply) return;
      if (!c.name) {
        const meta = await readOnchainMetadata(r, c.mint, parsed.info);
        if (meta) { c.name = meta.name; if (meta.uri) uris.set(c.mint, meta.uri); }
      }
      const unit = 10n ** BigInt(c.decimals);
      const cfg: BridgeConfig = {
        solanaMint: c.mint, tokenProgramId: info.value.owner, decimals: c.decimals,
        minBurnRaw: BigInt(c.minWholeTokens) * unit, startSlot: 0,
        zcashNetwork: "main", protocol: "zsam",
      };

      const mintSigs = [];
      let cursor: string | undefined;
      for (let page = 0; page < BURN_PAGES; page++) {
        const batch = await r.getSignaturesForAddress(c.mint, { before: cursor, limit: 1000 });
        mintSigs.push(...batch);
        if (batch.length < 1000) break;
        cursor = batch[batch.length - 1].signature;
      }

      for (const s of mintSigs) {
        if (!s.memo || s.err || rows.has(s.signature)) continue;
        if (getFetched() >= MAX_FETCH) break;
        const raw = await r.getTransaction(s.signature, "finalized");
        if (!raw) continue;
        setFetched(getFetched() + 1);
        const tx = normalizeTransaction(raw, { finalized: true });
        const burned = tx.burns.find((b) => b.mint === c.mint);
        if (!burned) continue;   // ordinary memo traffic, not a burn attempt
        const v = evaluateBurn(tx, cfg);
        rows.set(tx.signature, v.ok
          ? { signature: tx.signature, mint: c.mint, symbol: c.symbol, slot: tx.slot, blockTime: tx.blockTime,
              burner: v.burn.authority, amount: (v.burn.amount / unit).toString(),
              zcashAddress: v.burn.zcashAddress, ok: true }
          : { signature: tx.signature, mint: c.mint, symbol: c.symbol, slot: tx.slot, blockTime: tx.blockTime,
              burner: burned.sourceOwner, amount: (burned.amount / unit).toString(),
              zcashAddress: null, ok: false, reason: v.reason });
      }
    }

    // ---- 3. totals per collection.
    const wallets = new Map<string, Set<string>>();
    for (const b of rows.values()) {
      const c = collections.get(b.mint);
      if (!c) continue;
      if (b.ok) {
        c.burnCount++;
        c.burnedTokens = (BigInt(c.burnedTokens) + BigInt(b.amount ?? "0")).toString();
        if (b.burner) (wallets.get(b.mint) ?? wallets.set(b.mint, new Set()).get(b.mint)!).add(b.burner);
      } else {
        c.refusedCount++;
      }
    }
    for (const [mint, set] of wallets) collections.get(mint)!.burners = set.size;

    // ---- 3b. market caps, one call for every coin.
    try {
      const curves = await readCurves(r, [...collections.values()]
        .filter((c) => c.supplyRaw && c.tokenProgramId)
        .map((c) => ({ mint: c.mint, tokenProgramId: c.tokenProgramId!, supply: BigInt(c.supplyRaw!) })));
      for (const [mint, state] of curves) {
        const c = collections.get(mint);
        if (!c) continue;
        c.marketCapLamports = state.marketCapLamports?.toString() ?? null;
        c.graduated = state.graduated;
      }
    } catch {
      // No market caps this time. The leaderboard still ranks by burns, which
      // is its default and does not need them.
    }

    // ---- 4. images, best effort: a launcher's host being down must not empty
    //         the leaderboard.
    await Promise.all([...collections.values()].map(async (c) => {
      const uri = uris.get(c.mint);
      if (!uri || !/^https:\/\//.test(uri)) return;
      try {
        const m = await fetch(uri, { signal: AbortSignal.timeout(4000) });
        if (!m.ok) return;
        const meta = (await m.json()) as { image?: string };
        if (typeof meta.image === "string" && /^https:\/\//.test(meta.image)) c.image = meta.image;
      } catch { /* leave it without an image */ }
    }));

    const ranked = [...collections.values()].sort((a, b) => {
      const d = BigInt(b.burnedTokens) - BigInt(a.burnedTokens);
      if (d !== 0n) return d > 0n ? 1 : -1;
      return (b.launchedAt ?? 0) - (a.launchedAt ?? 0);
    });
    const burns = [...rows.values()].sort((a, b) => b.slot - a.slot).slice(0, MAX_BURN_ROWS);

    const body = {
      collections: ranked,
      burns,
      feeSol: Number(LAUNCH_FEE_LAMPORTS) / 1e9,
      historyUpdated: (history as { updated: string | null }).updated,
      computedAt: new Date().toISOString(),
      partial,
      stale: false,
    };
    // Only a complete rebuild is worth keeping: saving a partial one would let
    // a throttled minute overwrite a good answer with a worse one.
    if (!partial && ranked.length > 0) await saveSnapshot(body);
    return json(res, 200, body, 120);
  } catch (e) {
    if (cached) return json(res, 200, { ...cached, stale: true }, 60);
    return json(res, 502, { error: (e as Error).message, collections: [], burns: [] });
  }
}
