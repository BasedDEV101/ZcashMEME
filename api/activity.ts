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
import { decodeBase58, inParallel, json, lamportsTransferredTo, loadSnapshot, readCurves, readLaunchMetadata, readMints, readOnchainMetadata, readRates, rpc, saveSnapshot, type Rates } from "./_rpc.ts";
import { parseDeployRequest, REQUEST_PREFIX } from "../src/core/deploy-request.ts";
import { normalizeTransaction, resolveKeys, type RpcTransaction } from "../src/solana/normalize.ts";
import { evaluateBurn } from "../src/core/validity.ts";
import type { BridgeConfig } from "../src/core/types.ts";
import { FEE_ADDRESSES, LAUNCH_FEE_LAMPORTS, MIN_ACCEPTED_FEE_LAMPORTS, REGISTER_OPENS_AT_SLOT, FLAGSHIP } from "./_launchpad.ts";
import history from "./_history.json" with { type: "json" };

const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const METEORA_DBC = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const LAUNCH_PLATFORM_SCHEMA = 1;
const FEE_PAGES = 10;      // operator history: low volume, read it all
const BURN_PAGES = 2;      // per mint, newest first; older burns come from the snapshot
const WIDTH = 5;           // concurrent RPC streams
const MAX_FETCH = 160;     // transactions per request, across all mints
const MAX_BURN_ROWS = 300;
const PRICE_BATCH = 40;    // coins re-priced per rebuild, oldest price first
const DEX_BATCH = 30;      // DexScreener accepts at most 30 token addresses per request
const IMAGE_BATCH = 40;    // newest missing images to backfill without flooding pump's API

interface DexMarket {
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  image: string | null;
  liquidityUsd: number;
  pairAddress: string | null;
}

/** Live market data fallback for coins whose public Solana RPC read was throttled. */
async function readDexMarketData(mints: string[]): Promise<Map<string, DexMarket>> {
  const wanted = new Set(mints);
  const batches = Array.from({ length: Math.ceil(mints.length / DEX_BATCH) }, (_, i) =>
    mints.slice(i * DEX_BATCH, (i + 1) * DEX_BATCH));
  const out = new Map<string, DexMarket>();

  await Promise.all(batches.map(async (batch) => {
    if (batch.length === 0) return;
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${batch.join(",")}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const pairs = (await res.json()) as {
        baseToken?: { address?: string };
        pairAddress?: string;
        marketCap?: number | null;
        fdv?: number | null;
        volume?: { h24?: number | null };
        liquidity?: { usd?: number | null };
        info?: { imageUrl?: string | null };
      }[];
      for (const pair of pairs) {
        const mint = pair.baseToken?.address;
        if (!mint || !wanted.has(mint)) continue;
        const liquidityUsd = Number.isFinite(pair.liquidity?.usd) ? pair.liquidity!.usd! : 0;
        const current = out.get(mint);
        if (current && current.liquidityUsd > liquidityUsd) continue;
        const rawCap = pair.marketCap ?? pair.fdv;
        const marketCapUsd = typeof rawCap === "number" && Number.isFinite(rawCap) && rawCap >= 0
          ? rawCap : null;
        const volume24hUsd = typeof pair.volume?.h24 === "number" && Number.isFinite(pair.volume.h24)
          ? pair.volume.h24 : null;
        const image = typeof pair.info?.imageUrl === "string" && /^https:\/\//.test(pair.info.imageUrl)
          ? pair.info.imageUrl : null;
        const pairAddress = typeof pair.pairAddress === "string" ? pair.pairAddress : null;
        out.set(mint, { marketCapUsd, volume24hUsd, image, liquidityUsd, pairAddress });
      }
    } catch { /* on-chain pricing and existing artwork remain authoritative */ }
  }));

  return out;
}

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
  /** Market cap in the coin's own quote units, null when there is no honest
      number to give, with the quote it is denominated in. */
  marketCapQuote: string | null;
  /** Direct USD fallback from the most liquid indexed trading pair. */
  marketCapUsd?: number | null;
  /** Rolling 24-hour USD trading volume from the most liquid indexed pair. */
  volume24hUsd?: number | null;
  /** Most-liquid indexed DexScreener pair, used for the embedded live chart. */
  dexPairAddress?: string | null;
  quoteMint: string | null;
  /** When this row was last priced, so refreshing can rotate. */
  pricedAt: number | null;
  /** Raw supply and owning program, read from chain; pricing needs both. */
  supplyRaw: string | null;
  tokenProgramId: string | null;
  /** True when this coin's mint was created by the same transaction that
      registered it -- i.e. it was launched here, not attached afterwards. */
  createdHere: boolean;
  /** Which launch route created the mint. Older stored rows predate this field
      and are Pump launches, so clients treat a missing value as `pump`. */
  launchPlatform?: "pump" | "meteora";
  /** The slot it was registered at, so the register's opening can be applied
      to entries seeded from a previous reading too. */
  slot: number;
}

/**
 * Fold this reading into whatever is stored right now, rather than replacing
 * it.
 *
 * Two rebuilds can run at once. Both read the snapshot, one prices forty coins
 * and saves, the other is refused by the RPC and saves zero over it -- each
 * one's guard compared against a copy read before the other wrote. The column
 * flickered 0, 40, 0, 40 and never accumulated. A guard cannot fix a
 * read-modify-write race; not replacing can.
 *
 * So a save re-reads, unions the coins and the burns, and for each coin keeps
 * whichever price was taken later. Concurrent rebuilds then add to each other
 * instead of cancelling out.
 */
async function mergedWithLatest(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const latest = (await loadSnapshot()).data;
  if (!latest) return body;

  const mine = (body.collections ?? []) as Collection[];
  const theirs = (Array.isArray(latest.collections) ? latest.collections : []) as Collection[];
  const byMint = new Map<string, Collection>();
  for (const c of theirs) if (c?.mint) byMint.set(c.mint, c);
  for (const c of mine) {
    if (!c?.mint) continue;
    const other = byMint.get(c.mint);
    // Keep the later price, whichever reading took it.
    const keepTheirs = other?.marketCapQuote && (other.pricedAt ?? 0) > (c.pricedAt ?? 0);
    byMint.set(c.mint, keepTheirs
      ? { ...c, marketCapQuote: other!.marketCapQuote, quoteMint: other!.quoteMint, pricedAt: other!.pricedAt }
      : c);
  }

  const burns = new Map<string, unknown>();
  for (const b of (Array.isArray(latest.burns) ? latest.burns : []) as { signature?: string }[]) {
    if (b?.signature) burns.set(b.signature, b);
  }
  for (const b of ((body.burns ?? []) as { signature?: string }[])) {
    if (b?.signature) burns.set(b.signature, b);
  }

  return {
    ...body,
    collections: [...byMint.values()].sort((a, b) => {
      const d = (toBig(b.burnedTokens) - toBig(a.burnedTokens));
      return d === 0n ? (b.launchedAt ?? 0) - (a.launchedAt ?? 0) : d > 0n ? 1 : -1;
    }),
    burns: [...burns.values()].slice(0, MAX_BURN_ROWS),
  };
}

const toBig = (v: unknown): bigint =>
  typeof v === "string" && /^\d+$/.test(v) ? BigInt(v) : 0n;

/** How long a rebuild's answer stands before another one is worth doing. */
const FRESH_MS = 3 * 60 * 1000;

export default async function handler(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Serve the last rebuild if it is recent, without touching an RPC.
  //
  // A rebuild takes over a minute, so without this every cache miss started
  // another one and they saturated the RPC between them -- the page then
  // showed "could not read Solana" while the data it needed was sitting in
  // the snapshot. Rebuild frequency is now bounded by time, not by traffic.
  const snapshot = await loadSnapshot();
  const cached = snapshot.data;
  const computedAt = typeof cached?.computedAt === "string" ? Date.parse(cached.computedAt) : 0;
  const needsPlatformMigration = !!cached && cached.launchPlatformSchema !== LAUNCH_PLATFORM_SCHEMA;
  if (cached && !needsPlatformMigration && Date.now() - computedAt < FRESH_MS) {
    const stored = (Array.isArray(cached.collections) ? cached.collections : []) as Collection[];
    const dex = await readDexMarketData(stored.map((c) => c.mint));
    const collections = stored.map((c) => {
      const live = dex.get(c.mint);
      return live ? {
        ...c,
        marketCapUsd: live.marketCapUsd ?? c.marketCapUsd ?? null,
        volume24hUsd: live.volume24hUsd ?? c.volume24hUsd ?? null,
        dexPairAddress: live.pairAddress ?? c.dexPairAddress ?? null,
        image: c.image ?? live.image,
      } : c;
    });
    return json(res, 200, {
      ...cached,
      collections,
      feeSol: Number(LAUNCH_FEE_LAMPORTS) / 1e9,
      currentMarketCapUsd: dex.get(FLAGSHIP.mint)?.marketCapUsd ?? cached.currentMarketCapUsd ?? null,
      served: "snapshot",
    }, 120);
  }

  try {
    const r = rpc();
    let priceError: string | null = null;

    // ---- 1. collections: the flagship, plus everything launched through the pad.
    //
    // Seeded from the last snapshot rather than rediscovered from nothing. A
    // launch is immutable history: once a coin has been found, no later
    // reading of the chain can make it not a launch. Rebuilding the list from
    // scratch every three minutes meant ~70 getTransaction calls that the
    // free RPC tiers throttle partway through, and the leaderboard fell 69 ->
    // 46 -> 24 as each degraded run replaced the last. Now a throttled
    // rebuild can only delay a NEW coin appearing.
    const collections = new Map<string, Collection>();
    const uris = new Map<string, string>();
    const knownSignatures = new Set<string>();
    // A launch that could not be read this pass is simply not added this
    // pass; the ones already seeded are untouched, so the list only ever
    // grows and the next rebuild picks up what this one missed.
    let partial = false;
    let launchDiscoveryComplete = true;
    const eligible = (c: Collection) =>
      c.mint === FLAGSHIP.mint || (c.createdHere === true && (c.slot ?? 0) >= REGISTER_OPENS_AT_SLOT);

    for (const prior of (Array.isArray(cached?.collections) ? cached.collections : []) as Collection[]) {
      // A reading taken before the register opened can carry entries it no
      // longer admits; they are dropped here rather than inherited forever.
      if (!prior?.mint || !eligible(prior)) continue;
      // The old parser only admitted a row after finding a Pump create
      // instruction. Therefore every pre-schema row already in the snapshot
      // is provably Pump; only launches absent from that snapshot need replay.
      const launchPlatform = prior.launchPlatform ?? "pump";
      collections.set(prior.mint, {
        ...prior,
        launchPlatform,
        // Counted fresh below from the burns actually seen this pass.
        burnedTokens: "0", burnCount: 0, refusedCount: 0, burners: 0,
      });
      if (prior.signature) knownSignatures.add(prior.signature);
    }
    if (!collections.has(FLAGSHIP.mint)) collections.set(FLAGSHIP.mint, {
      mint: FLAGSHIP.mint, symbol: FLAGSHIP.symbol, name: FLAGSHIP.name, image: FLAGSHIP.image,
      minWholeTokens: FLAGSHIP.minWholeTokens, signature: null, initialSupply: null,
      launchedAt: FLAGSHIP.launchedAt, launchedBy: null, decimals: 6,
      burnedTokens: "0", burnCount: 0, refusedCount: 0, burners: 0,
      destroyedTokens: null, marketCapQuote: null, quoteMint: null, pricedAt: null,
      supplyRaw: null, tokenProgramId: null, createdHere: true, slot: 0,
      launchPlatform: "pump",
    });

    // Listing can fail part way and that is survivable: the collections are
    // already seeded, so a short list only delays a new coin. It is not worth
    // a 502.
    //
    // One failure mode is specific to having several endpoints: pagination
    // carries a `before` cursor, and when a call fails over to another
    // provider that provider may never have heard of that signature --
    // "Transaction ... not found" -- which used to take down the whole page.
    // Only what is new since the last reading.
    //
    // Re-listing both fee addresses in full cost up to twenty calls of a
    // thousand signatures each, every three minutes, to rediscover launches
    // already seeded above. That spent the whole RPC budget before anything
    // else ran, which is why market caps came back 403. With a cursor it is
    // one or two calls.
    const priorCursors = (cached?.cursors ?? {}) as Record<string, string>;
    const cursors: Record<string, string> = { ...priorCursors };

    const sigs = [];
    for (const address of FEE_ADDRESSES) {
      // One schema migration deliberately replays the recent fee history.
      // Once the marker is saved, normal cursor-bounded discovery resumes.
      const until = needsPlatformMigration ? undefined : priorCursors[address];
      let before: string | undefined;
      let newest: string | undefined;
      for (let page = 0; page < FEE_PAGES; page++) {
        let batch;
        try {
          batch = await r.getSignaturesForAddress(address, { before, until, limit: 1000 });
        } catch {
          // A cursor the endpoint has never heard of -- a different provider,
          // pruned history -- must not wedge discovery forever. Drop it and
          // this address gets a full listing next time.
          partial = true;
          launchDiscoveryComplete = false;
          delete cursors[address];
          break;
        }
        if (!newest && batch.length > 0) newest = batch[0].signature;
        sigs.push(...batch);
        if (batch.length < 1000) break;
        before = batch[batch.length - 1].signature;
        // Without a cursor this is a first read; do not walk all of history.
        if (!until && page >= 2) { partial = true; break; }
      }
      if (newest) cursors[address] = newest;
    }
    sigs.sort((a, b) => b.slot - a.slot);

    // oldest first, so the first launch of a mint is the one that counts
    const paid = sigs.filter((s) => !s.err && s.memo?.includes(REQUEST_PREFIX)).reverse();
    // Fetched in parallel but folded in order below, so which launch of a mint
    // wins does not depend on which request happened to answer first.
    // Only launches we have never read. Everything else is already seeded.
    const unseen = paid.filter((s) => !knownSignatures.has(s.signature));
    const launchTxs = new Map<string, RpcTransaction>();

    await inParallel(unseen, WIDTH, async (s) => {
      try {
        const raw = await r.getTransaction(s.signature, "finalized");
        if (raw) launchTxs.set(s.signature, raw);
        else { partial = true; launchDiscoveryComplete = false; }
      } catch {
        // A launch we could not read this time is missing from the list, not
        // wrong in it: the page still renders, but this rebuild is incomplete
        // and must not be saved over a complete one. Coins vanished from the
        // leaderboard between refreshes until this counted as partial.
        partial = true;
        launchDiscoveryComplete = false;
      }
    });

    for (const s of unseen) {
      const raw = launchTxs.get(s.signature);
      if (!raw) continue;
      const tx = normalizeTransaction(raw, { finalized: true });
      if (!tx.succeeded || tx.memos.length !== 1) continue;
      const req = parseDeployRequest(tx.memos[0]);
      const existing = req ? collections.get(req.mint) : undefined;
      if (!req || existing?.launchPlatform) continue;

      // The fee must actually have been paid, or anyone could list for free.
      const keys = resolveKeys(raw);
      const paidLamports = FEE_ADDRESSES.reduce(
        (most, address) => {
          const sent = lamportsTransferredTo(raw, keys, address);
          return sent > most ? sent : most;
        }, 0n);
      if (paidLamports < MIN_ACCEPTED_FEE_LAMPORTS) continue;

      // Name and image come from the create instruction in this same
      // transaction, so they are what the coin actually launched with. A coin
      // registered after launching elsewhere has none, and shows its ticker.
      let name: string | null = null;
      let launchPlatform: Collection["launchPlatform"];
      for (const ix of raw.transaction.message.instructions ?? []) {
        const program = keys[ix.programIdIndex];
        if (program === PUMP) {
          const meta = readLaunchMetadata(decodeBase58(ix.data));
          if (meta && meta.symbol.toUpperCase() === req.symbol) {
            name = meta.name;
            uris.set(req.mint, meta.uri);
            launchPlatform = "pump";
          }
        }
        // A DBC call alone is not enough: its account list must include the
        // mint named by the registration memo. That keeps the same invariant
        // as Pump -- the coin was created in this transaction, rather than an
        // unrelated mint being attached after paying the fee.
        if (program === METEORA_DBC && ix.accounts.some((account) => keys[account] === req.mint)) {
          const meta = readLaunchMetadata(decodeBase58(ix.data));
          if (meta && meta.symbol.toUpperCase() === req.symbol) {
            name = meta.name;
            uris.set(req.mint, meta.uri);
            launchPlatform = "meteora";
          }
        }
      }

      // Only coins created by the transaction that registered them. Paying the
      // fee with a memo naming somebody else's mint attaches a coin the pad
      // never launched, which is not what the register is for.
      if (!launchPlatform || tx.slot < REGISTER_OPENS_AT_SLOT) continue;

      // Supply minted by the create itself. Used only to skip scanning a coin
      // whose supply has never moved -- a burn always reduces supply, so
      // "supply unchanged" is proof of "no burns" and saves listing its
      // history entirely.
      const minted = (raw.meta?.postTokenBalances ?? [])
        .filter((b) => b.mint === req.mint)
        .reduce((t, b) => t + BigInt(b.uiTokenAmount.amount), 0n);

      collections.set(req.mint, {
        ...existing,
        mint: req.mint, symbol: req.symbol, name: name ?? existing?.name ?? null,
        image: existing?.image ?? null,
        minWholeTokens: req.minWholeTokens.toString(), signature: tx.signature,
        initialSupply: existing?.initialSupply ?? (minted > 0n ? minted.toString() : null),
        launchedAt: tx.blockTime, launchedBy: tx.signers[0] ?? null, decimals: 6,
        createdHere: true, launchPlatform, slot: tx.slot,
        burnedTokens: "0", burnCount: 0, refusedCount: 0, burners: 0,
        destroyedTokens: null, marketCapQuote: null, quoteMint: null, pricedAt: null,
        supplyRaw: null, tokenProgramId: null,
      });
    }

    // ---- 2. burns, newest window per mint, merged with the history snapshot.
    const rows = new Map<string, Burn>();
    for (const b of (history as { burns: Burn[] }).burns) rows.set(b.signature, b);

    // Every mint in one call, before anything else needs them. A throttled
    // RPC here used to fail the whole request -- and with it the launches
    // already discovered above, which needed no mint data at all. It now
    // degrades: the coins still list, without their burns or market caps.
    let mintsRead = true;
    let mintInfo = new Map<string, Awaited<ReturnType<typeof readMints>> extends Map<string, infer V> ? V : never>();
    try {
      mintInfo = await readMints(r, [...collections.keys()]);
    } catch {
      partial = true;
      mintsRead = false;
    }

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
      // Read in one batch before the scans start, not per coin.
      const info = mintInfo.get(c.mint);
      if (!info) return;
      c.decimals = info.decimals;
      c.tokenProgramId = info.owner;
      c.supplyRaw = info.supply;

      // Nothing has been burned, so there is nothing to find: skip the scan.
      // Listing a pump.fun mint's signatures is the expensive part of this
      // request -- fourteen of them in sequence took 114 seconds -- and most
      // coins on the pad have never had a single token destroyed.
      if (c.initialSupply) {
        const gone = BigInt(c.initialSupply) - BigInt(info.supply);
        c.destroyedTokens = (gone > 0n ? gone / 10n ** BigInt(c.decimals) : 0n).toString();
      }
      if (!c.name) {
        const meta = await readOnchainMetadata(r, c.mint, info);
        if (meta) { c.name = meta.name; if (meta.uri) uris.set(c.mint, meta.uri); }
      }
      // Metadata is still worth reading for a brand-new Meteora launch whose
      // supply has not moved. The expensive signature scan is not.
      if (c.initialSupply && info.supply === c.initialSupply) return;
      const unit = 10n ** BigInt(c.decimals);
      const cfg: BridgeConfig = {
        solanaMint: c.mint, tokenProgramId: info.owner, decimals: c.decimals,
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
    // Pricing every coin every rebuild is what the free RPC tiers refuse: at
    // 154 coins it is a dozen batched calls and they answer 403, so the whole
    // market cap column read blank. A price does not need to be three minutes
    // old -- it needs to exist. So each rebuild refreshes the coins priced
    // longest ago and everything else keeps the price it had, which the
    // snapshot already carries forward.
    const stalest = [...collections.values()]
      .filter((c) => c.supplyRaw && c.tokenProgramId)
      .sort((a, b) => (a.pricedAt ?? 0) - (b.pricedAt ?? 0))
      .slice(0, PRICE_BATCH);
    const priceable = stalest
      .map((c) => ({ mint: c.mint, tokenProgramId: c.tokenProgramId!, supply: BigInt(c.supplyRaw!) }));
    try {
      const curves = await readCurves(r, priceable);
      for (const [mint, state] of curves) {
        const c = collections.get(mint);
        if (!c) continue;
        c.marketCapQuote = state.marketCapQuote?.toString() ?? null;
        c.quoteMint = state.quoteMint;
        c.pricedAt = Date.now();
      }
    } catch (e) {
      // No market caps this time. The leaderboard still ranks by burns, which
      // is its default and does not need them. The reason is reported rather
      // than swallowed: a silently empty column looks like a broken page.
      priceError = (e as Error).message;
    }

    // ---- 3c. what the quote currencies are worth, so caps read as money.
    //          A failed fetch keeps the rates already stored rather than
    //          dropping every coin back to raw ZEC.
    const rates: Rates = (await readRates()) ?? ((cached?.rates as Rates | undefined) ?? {});
    const dex = await readDexMarketData([...collections.keys()]);
    for (const c of collections.values()) {
      const live = dex.get(c.mint);
      if (!live) continue;
      c.marketCapUsd = live.marketCapUsd ?? c.marketCapUsd ?? null;
      c.volume24hUsd = live.volume24hUsd ?? c.volume24hUsd ?? null;
      c.dexPairAddress = live.pairAddress ?? c.dexPairAddress ?? null;
      c.image ??= live.image;
    }
    const currentMarketCapUsd = dex.get(FLAGSHIP.mint)?.marketCapUsd ?? null;

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

    // A local rebuild has no production snapshot to carry old metadata URIs.
    // Backfill only the newest missing images from pump's public coin record.
    const missingImages = [...collections.values()]
      .filter((c) => !c.image)
      .sort((a, b) => (b.launchedAt ?? 0) - (a.launchedAt ?? 0))
      .slice(0, IMAGE_BATCH);
    await inParallel(missingImages, 5, async (c) => {
      try {
        const res = await fetch(`https://frontend-api-v3.pump.fun/coins/${c.mint}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const coin = (await res.json()) as { image_uri?: string | null };
        if (typeof coin.image_uri === "string" && /^https:\/\//.test(coin.image_uri)) c.image = coin.image_uri;
      } catch { /* initials remain as the honest empty-image state */ }
    });

    const priorEligible = (Array.isArray(cached?.collections) ? (cached.collections as Collection[]) : [])
      .filter((c) => c?.mint && eligible(c));
    const pricedBeforeCount = priorEligible.filter((c) => c.marketCapQuote).length;
    const pricedNowCount = [...collections.values()].filter((c) => c.marketCapQuote).length;

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
      // Do not mark the one-time replay complete if an RPC failure may have
      // hidden a launch. Without the marker, the next request retries it.
      launchPlatformSchema: launchDiscoveryComplete
        ? LAUNCH_PLATFORM_SCHEMA
        : cached?.launchPlatformSchema,
      cursors,
      rates,
      currentMarketCapUsd: currentMarketCapUsd ?? cached?.currentMarketCapUsd ?? null,
      // Diagnostics: the market cap column kept flickering and two rounds of
      // reasoning about why were wrong, so the answer is reported rather than
      // inferred.
      served: "rebuild",
      snapshotReadable: snapshot.readable,
      pricedBefore: pricedBeforeCount,
      pricedNow: pricedNowCount,
      priced: [...collections.values()].filter((c) => c.marketCapQuote).length,
      priceable: priceable.length,
      priceError,
      partial,
      stale: false,
    };
    // Worth keeping only if nothing is MISSING from it. A throttled burn scan
    // costs detail and is fine to save; a launch that could not be read costs
    // a whole coin, and such a rebuild once overwrote a 69-coin snapshot with
    // a 46-coin one. The count is checked against the previous snapshot too,
    // as a backstop for any other way of losing coins: the pad only grows, so
    // a shorter list is a worse one.
    // Compared against what the PREVIOUS reading would list under today's
    // rules, not its raw length: otherwise tightening the rules looks like
    // data loss and blocks every save from then on.
    const previous = priorEligible.length;
    // Prices are held to the same rule as coins. A rebuild whose pricing was
    // refused still lists every coin, so the count guard let it save over one
    // that had priced forty of them -- the column flickered 0, 40, 0, 40 and
    // never accumulated.
    const worse = ranked.length < previous || pricedNowCount < pricedBeforeCount;
    // A rebuild that found fewer coins than the last complete reading is a
    // worse answer, not a newer one. Refusing to SAVE it was not enough: it
    // was still served for that request and cached at the edge for two
    // minutes, which is what the leaderboard's 69 -> 60 -> 1 flicker actually
    // was. When we know the stored reading is better, that is the one to send.
    // Serve exactly what gets stored. Saving the merged reading but returning
    // the raw one meant a rebuild that priced a single coin still showed a
    // single coin priced, however much was already known.
    const merged = snapshot.readable ? await mergedWithLatest(body) : body;
    // A schema replay intentionally changes old rows and may add launches that
    // the previous parser rejected. `merged` already preserves every newer
    // price from the old snapshot, so the ordinary price-count guard must not
    // throw the migration away after it succeeded.
    const platformMigrationReady = needsPlatformMigration
      && launchDiscoveryComplete
      && ranked.length >= previous;
    if (platformMigrationReady && snapshot.readable && mintsRead) {
      await saveSnapshot(merged);
      return json(res, 200, merged, 120);
    }
    if (snapshot.readable && cached && worse) {
      return json(res, 200, { ...cached, stale: true }, 60);
    }
    if (snapshot.readable && mintsRead && !worse && ranked.length > 0) {
      await saveSnapshot(merged);
    }
    return json(res, 200, merged, 120);
  } catch (e) {
    // Ask for the snapshot again rather than trusting the copy read at the
    // start: that read can itself have failed, and answering 502 while a
    // perfectly good previous answer sits in storage is the one outcome
    // worth going out of the way to avoid.
    const last = cached ?? (await loadSnapshot()).data;
    if (last) return json(res, 200, { ...last, stale: true }, 60);
    return json(res, 502, { error: (e as Error).message, collections: [], burns: [] });
  }
}
