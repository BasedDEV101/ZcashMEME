// Shared bits for the read-only data endpoints.
//
// The RPC key lives in a Vercel env var, never in the bundle: the browser gets
// our JSON, not our endpoint.

import { SolanaRpc, FailoverRpc, DEFAULT_RPC } from "../src/solana/rpc.ts";
import type { RpcTransaction } from "../src/solana/normalize.ts";
// No Solana SDK here, on purpose. The pump SDK could not be imported at all
// -- dynamically it threw "Cannot use import statement outside a module",
// statically "does not provide an export named 'PumpSdk'" -- and importing
// web3.js for PublicKey alone dragged in rpc-websockets, which throws
// ERR_REQUIRE_ESM in this runtime. Each attempt took the whole endpoint down
// with it. All that is actually needed is program-address derivation, which
// is fifteen lines, so it is written out here against @noble primitives that
// this repo already depends on and already trusts for signing.
import { sha256 } from "@noble/hashes/sha2";
import { ed25519 } from "@noble/curves/ed25519.js";

/**
 * Every endpoint we have, tried in order.
 *
 * SOLANA_RPC may list several, comma separated. One free-tier key answering
 * 429 used to empty the market cap column for everyone; with a second key and
 * the public endpoint behind it, that outage has to happen three times over
 * before the page notices.
 */
export const rpc = (): SolanaRpc =>
  new FailoverRpc([...(process.env.SOLANA_RPC ?? "").split(",").map((u) => u.trim()), DEFAULT_RPC], 2);

/** Cache at the edge: this data changes per block, not per request. */
export function json(res: { statusCode: number; setHeader(k: string, v: string): void; end(b: string): void },
                     status: number, body: unknown, seconds = 60): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", status === 200
    ? `public, s-maxage=${seconds}, stale-while-revalidate=600`
    : "no-store");
  res.end(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

/**
 * Read the first three strings of a pump.fun create instruction: name, symbol,
 * uri. Borsh puts each behind a u32 length, after the 8-byte discriminator.
 *
 * Only the leading three fields are read, so a later change to the argument
 * list cannot shift them. The caller checks the symbol against the memo, so a
 * misparse is caught rather than displayed.
 */
export function readPumpCreate(data: Uint8Array): { name: string; symbol: string; uri: string } | null {
  let i = 8;
  const out: string[] = [];
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let f = 0; f < 3; f++) {
    if (i + 4 > data.length) return null;
    const len = dv.getUint32(i, true);
    i += 4;
    if (len > 300 || i + len > data.length) return null;
    out.push(new TextDecoder().decode(data.subarray(i, i + len)));
    i += len;
  }
  return { name: out[0], symbol: out[1], uri: out[2] };
}

const METAPLEX = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

/**
 * A mint's name and metadata URI, for coins that registered here after
 * launching elsewhere: those have no create instruction of ours to read them
 * from, and would otherwise sit on the leaderboard as a bare ticker.
 *
 * Two places to look. A Token-2022 mint can carry metadata as an extension on
 * the mint itself, which the RPC already parsed for us. An SPL Token mint
 * keeps it in a separate Metaplex account, whose address is derived from the
 * mint. Neither is required to exist.
 */
export async function readOnchainMetadata(
  r: SolanaRpc, mint: string, parsedInfo: unknown,
): Promise<{ name: string; uri: string } | null> {
  const ext = (parsedInfo as { extensions?: { extension?: string; state?: { name?: string; uri?: string } }[] })
    ?.extensions?.find((e) => e.extension === "tokenMetadata");
  if (ext?.state?.name) return { name: ext.state.name, uri: ext.state.uri ?? "" };

  try {
    const address = encodeBase58(pda(
      [new TextEncoder().encode("metadata"), decodeBase58(METAPLEX), decodeBase58(mint)],
      METAPLEX,
    ));
    const acc = await r.call<{ value: { data: [string, string] } | null }>(
      "getAccountInfo", [address, { encoding: "base64", commitment: "finalized" }],
    );
    if (!acc.value) return null;
    // key(1) + update authority(32) + mint(32), then name, symbol, uri as
    // length-prefixed strings padded with NULs to their fixed widths.
    const data = Buffer.from(acc.value.data[0], "base64");
    let i = 65;
    const fields: string[] = [];
    for (let f = 0; f < 3; f++) {
      if (i + 4 > data.length) return null;
      const len = data.readUInt32LE(i);
      i += 4;
      if (len > 300 || i + len > data.length) return null;
      fields.push(data.subarray(i, i + len).toString("utf8").replace(/\0+$/, "").trim());
      i += len;
    }
    return fields[0] ? { name: fields[0], uri: fields[2] } : null;
  } catch {
    return null;
  }
}

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const SYSTEM_TRANSFER = 2;

/**
 * Lamports actually transferred to `to` by this transaction.
 *
 * Reads the transfer instructions rather than the account's balance change,
 * because those are not the same question. A launch paid from the operator's
 * own wallet transfers the fee AND pays the network and pump.fun costs, so its
 * net balance change is negative — and a balance check called that an unpaid
 * launch and dropped a real coin off the site. What matters is whether the fee
 * was sent, not whether the wallet came out ahead.
 */
export function lamportsTransferredTo(raw: RpcTransaction, keys: string[], to: string): bigint {
  const inner = (raw.meta?.innerInstructions ?? []).flatMap((g) => g.instructions);
  let total = 0n;
  for (const ix of [...(raw.transaction.message.instructions ?? []), ...inner]) {
    if (keys[ix.programIdIndex] !== SYSTEM_PROGRAM) continue;
    if (ix.accounts.length < 2 || keys[ix.accounts[1]] !== to) continue;
    const data = decodeBase58(ix.data);
    if (data.length < 12) continue;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (dv.getUint32(0, true) !== SYSTEM_TRANSFER) continue;
    total += dv.getBigUint64(4, true);
  }
  return total;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function encodeBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = "1" + s; }
  return s;
}

export function decodeBase58(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const v = B58.indexOf(c);
    if (v < 0) return new Uint8Array();
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

/**
 * Run `work` over every item, at most `width` at a time.
 *
 * Scanning fourteen mints one after another took 114 seconds, which is longer
 * than a visitor will wait and longer than the cache buys back on a cold hit.
 * They do not depend on each other, so they should not queue behind each
 * other — but firing all of them at once is how the RPC starts returning 429s,
 * hence a width rather than Promise.all.
 */
export async function inParallel<T>(items: T[], width: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(width, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) await work(items[i]);
  });
  await Promise.all(runners);
}

const SNAPSHOT = "activity/latest.json";

/**
 * The last good answer, kept so a bad minute on an RPC is invisible.
 *
 * Rebuilding this page needs dozens of RPC calls, and any one of them can be
 * rate-limited. Showing "could not read Solana" in that case is the wrong
 * trade: the data is minutes old at best anyway, so yesterday's answer beats
 * no answer. Only a successful rebuild overwrites it, so the fallback can go
 * stale but never wrong.
 */
export async function saveSnapshot(body: unknown): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  const { put } = await import("@vercel/blob");
  await put(SNAPSHOT, JSON.stringify(body), {
    access: "public", contentType: "application/json",
    addRandomSuffix: false, allowOverwrite: true,
  });
}

/**
 * The stored snapshot, and whether we were able to look.
 *
 * The distinction matters: "there is no snapshot" and "the snapshot could not
 * be read" look the same to a caller that only gets null, and treating a
 * failed read as an empty one let a rebuild that found five coins save itself
 * over one holding fifty-eight. A reading we could not compare against is a
 * reading we must not overwrite.
 */
export async function loadSnapshot(attempt = 0): Promise<{ readable: boolean; data: Record<string, unknown> | null }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { readable: false, data: null };
  try {
    const { list } = await import("@vercel/blob");
    const found = await list({ prefix: SNAPSHOT, limit: 1 });
    const blob = found.blobs[0];
    if (!blob) return { readable: true, data: null };   // definitely absent
    const res = await fetch(blob.url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return retry(attempt);
    return { readable: true, data: (await res.json()) as Record<string, unknown> };
  } catch {
    return retry(attempt);
  }
}

/**
 * One more try before giving up on the stored reading.
 *
 * An unreadable snapshot is the one case with no safe answer: nothing to
 * compare a rebuild against, so a truncated one goes out as-is and the
 * leaderboard drops to a handful of coins. A single transient blob read was
 * enough to cause that, and asking twice costs a few hundred milliseconds.
 */
async function retry(attempt: number) {
  if (attempt > 0) return { readable: false, data: null };
  await new Promise((r) => setTimeout(r, 250));
  return loadSnapshot(attempt + 1);
}

export interface CurveState {
  /** Market cap in the coin's own quote units, or null when there is no
      honest price to read. */
  marketCapQuote: bigint | null;
  /** What it trades against, so the number can be labelled and scaled. */
  quoteMint: string | null;
}

const WSOL = "So11111111111111111111111111111111111111112";
const SPL_TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const PUMP_AMM_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const CANONICAL_POOL_INDEX = 0;
const ZERO_KEY = "11111111111111111111111111111111";

const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");
const text = (s: string) => new TextEncoder().encode(s);

/** True when these bytes are a point on ed25519, i.e. could be a real key. */
function onCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Solana's findProgramAddress: hash the seeds with a bump, and take the first
 * result that is NOT a valid ed25519 point -- which is what makes a program
 * address one nobody can hold a key for.
 */
function pda(seeds: Uint8Array[], program: string): Uint8Array {
  const programBytes = decodeBase58(program);
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), programBytes, PDA_MARKER];
    const total = parts.reduce((n, p) => n + p.length, 0);
    const buf = new Uint8Array(total);
    let o = 0;
    for (const part of parts) { buf.set(part, o); o += part.length; }
    const candidate = sha256(buf);
    if (!onCurve(candidate)) return candidate;
  }
  throw new Error(`no program address for ${program}`);
}

/** A coin's canonical pump.fun pool, for the pair it actually trades as. */
function poolFor(mint: string, quoteMint: string): Uint8Array {
  const authority = pda([text("pool-authority"), decodeBase58(mint)], PUMP_PROGRAM);
  const index = Uint8Array.of(CANONICAL_POOL_INDEX & 0xff, (CANONICAL_POOL_INDEX >> 8) & 0xff);
  return pda(
    [text("pool"), index, authority, decodeBase58(mint), decodeBase58(quoteMint)],
    PUMP_AMM_PROGRAM,
  );
}

const ataFor = (owner: Uint8Array, mint: string, tokenProgram: string) =>
  pda([owner, decodeBase58(tokenProgram), decodeBase58(mint)], ATA_PROGRAM);

/** An SPL token account's balance: amount is a u64 at offset 64. */
function balance(acc: { data: [string, string] } | null): bigint | null {
  if (!acc) return null;
  const d = Buffer.from(acc.data[0], "base64");
  return d.length >= 72 ? d.readBigUInt64LE(64) : null;
}

/**
 * Market caps, priced in whatever each coin actually trades against.
 *
 * Coins launched here are quoted in ZEC; the ones launched before that are
 * quoted in SOL. Pricing everything against SOL would have read blank for
 * every ZEC coin, so the quote is taken from the coin's own bonding curve and
 * the pool is derived for that pair.
 *
 * Two rounds. The curve says what the pair is and prices the coin while it is
 * still on a curve; only a coin that has moved to the AMM needs its pool
 * balances read, and by then the pair is known.
 */
export async function readCurves(
  r: SolanaRpc, mints: { mint: string; tokenProgramId: string; supply: bigint }[],
): Promise<Map<string, CurveState>> {
  const out = new Map<string, CurveState>();
  if (mints.length === 0) return out;

  const fetchAll = async (addresses: string[]) => {
    const acc: ({ data: [string, string] } | null)[] = [];
    // 50, not the protocol's 100: raising it to the maximum made the public
    // endpoint answer 403 and every market cap went blank. The saving was one
    // or two calls a rebuild; the cost was the whole column.
    for (let i = 0; i < addresses.length; i += 50) {
      const res = await r.call<{ value: ({ data: [string, string] } | null)[] }>(
        "getMultipleAccounts", [addresses.slice(i, i + 50), { encoding: "base64", commitment: "finalized" }]);
      acc.push(...res.value);
    }
    return acc;
  };

  // --- round 1: the curves, which name the pair.
  const curves = await fetchAll(mints.map((m) => encodeBase58(pda([text("bonding-curve"), decodeBase58(m.mint)], PUMP_PROGRAM))));

  const needPool: { mint: string; tokenProgramId: string; supply: bigint; quoteMint: string }[] = [];
  mints.forEach((m, i) => {
    const acc = curves[i];
    if (!acc) { out.set(m.mint, { marketCapQuote: null, quoteMint: null }); return; }
    const d = Buffer.from(acc.data[0], "base64");
    if (d.length < 123) { out.set(m.mint, { marketCapQuote: null, quoteMint: null }); return; }

    // discriminator(8) | virtualToken | virtualQuote | realToken | realQuote |
    // tokenTotalSupply | complete(1) | creator(32) | mayhem(1) | cashback(1) |
    // quoteMint(32). The zero key means SOL.
    const virtualToken = d.readBigUInt64LE(8);
    const virtualQuote = d.readBigUInt64LE(16);
    const supply = d.readBigUInt64LE(40);
    const complete = d[48] === 1;
    const quoteRaw = encodeBase58(d.subarray(83, 115));
    const quoteMint = quoteRaw === ZERO_KEY ? WSOL : quoteRaw;

    if (!complete && virtualToken > 0n) {
      out.set(m.mint, { marketCapQuote: (supply * virtualQuote) / virtualToken, quoteMint });
      return;
    }
    needPool.push({ ...m, quoteMint });
  });

  // --- round 2: pool balances for coins that have left the curve.
  if (needPool.length > 0) {
    const addrs = needPool.flatMap((m) => {
      const pool = poolFor(m.mint, m.quoteMint);
      return [
        encodeBase58(ataFor(pool, m.mint, m.tokenProgramId)),
        encodeBase58(ataFor(pool, m.quoteMint, SPL_TOKEN)),
      ];
    });
    const accounts = await fetchAll(addrs);
    needPool.forEach((m, i) => {
      const base = balance(accounts[i * 2]);
      const quote = balance(accounts[i * 2 + 1]);
      out.set(m.mint, {
        // The mint's decimals cancel between supply and the base reserve.
        marketCapQuote: base && base > 0n && quote !== null ? (m.supply * quote) / base : null,
        quoteMint: m.quoteMint,
      });
    });
  }

  return out;
}

/** What a mint account says about itself, for many mints in one call. */
export interface MintInfo { decimals: number; supply: string; owner: string; extensions?: unknown }

/**
 * A mint account's supply and decimals, from its raw bytes.
 *
 * Every mint, SPL Token and Token-2022 alike, starts with the same 82-byte
 * layout: a 36-byte authority field, then supply as a u64, then decimals.
 * Token-2022's extensions live past byte 82 and do not move these.
 */
function decodeMint(data: Buffer): { decimals: number; supply: string } | null {
  if (data.length < 45) return null;
  return { supply: data.readBigUInt64LE(36).toString(), decimals: data[44] };
}

/**
 * Read many mints at once.
 *
 * One getAccountInfo per coin cost 57 calls on a 57-coin pad and exhausted
 * the RPC quota before the request reached anything else. base64 rather than
 * jsonParsed, because a parsed mint is an object per account and 68 of them
 * made a response every endpoint refused; the raw account is 82 bytes and
 * says the same thing.
 */
export async function readMints(r: SolanaRpc, mints: string[]): Promise<Map<string, MintInfo>> {
  const out = new Map<string, MintInfo>();
  // 50 for the same reason as above: 100 is refused by the public endpoint.
  for (let i = 0; i < mints.length; i += 50) {
    const slice = mints.slice(i, i + 50);
    const res = await r.call<{ value: ({ owner: string; data: [string, string] } | null)[] }>(
      "getMultipleAccounts", [slice, { encoding: "base64", commitment: "finalized" }]);
    res.value.forEach((acc, j) => {
      if (!acc) return;
      const mint = decodeMint(Buffer.from(acc.data[0], "base64"));
      if (mint) out.set(slice[j], { ...mint, owner: acc.owner });
    });
  }
  return out;
}
