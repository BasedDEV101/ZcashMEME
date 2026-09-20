// Shared bits for the read-only data endpoints.
//
// The RPC key lives in a Vercel env var, never in the bundle: the browser gets
// our JSON, not our endpoint.

import { SolanaRpc, FailoverRpc, DEFAULT_RPC } from "../src/solana/rpc.ts";
import type { RpcTransaction } from "../src/solana/normalize.ts";

/** The paid endpoint, with the public one behind it. */
export const rpc = (): SolanaRpc => new FailoverRpc(process.env.SOLANA_RPC || DEFAULT_RPC, DEFAULT_RPC, 2);

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
    const { PublicKey } = await import("@solana/web3.js");
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), new PublicKey(METAPLEX).toBuffer(), new PublicKey(mint).toBuffer()],
      new PublicKey(METAPLEX),
    );
    const acc = await r.call<{ value: { data: [string, string] } | null }>(
      "getAccountInfo", [pda.toBase58(), { encoding: "base64", commitment: "finalized" }],
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

export async function loadSnapshot(): Promise<Record<string, unknown> | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { list } = await import("@vercel/blob");
    const found = await list({ prefix: SNAPSHOT, limit: 1 });
    const blob = found.blobs[0];
    if (!blob) return null;
    const res = await fetch(blob.url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

export interface CurveState {
  /** Market cap in lamports, or null once the coin has graduated: the curve's
      reserves stop moving then and would price it at whatever it left at. */
  marketCapLamports: bigint | null;
  graduated: boolean;
}

/**
 * Each coin's bonding curve, in one RPC call for all of them.
 *
 * A pump.fun curve prices its token by its virtual reserves, so market cap is
 * total supply times solReserves/tokenReserves — no price feed, no oracle, and
 * no third-party API that can rate-limit the page. getMultipleAccounts fetches
 * every curve at once, which matters because this runs for every coin on the
 * pad on each rebuild.
 */
export async function readCurves(r: SolanaRpc, mints: string[]): Promise<Map<string, CurveState>> {
  const out = new Map<string, CurveState>();
  if (mints.length === 0) return out;
  const { PublicKey } = await import("@solana/web3.js");
  const program = new PublicKey(PUMP_PROGRAM);
  const pdas = mints.map((m) =>
    PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new PublicKey(m).toBuffer()], program)[0].toBase58());

  // getMultipleAccounts caps at 100 addresses per call.
  for (let i = 0; i < pdas.length; i += 100) {
    const slice = pdas.slice(i, i + 100);
    const res = await r.call<{ value: ({ data: [string, string] } | null)[] }>(
      "getMultipleAccounts", [slice, { encoding: "base64", commitment: "finalized" }]);
    res.value.forEach((acc, j) => {
      const mint = mints[i + j];
      if (!acc) return;
      const d = Buffer.from(acc.data[0], "base64");
      // discriminator(8) | virtualTokenReserves | virtualSolReserves |
      // realTokenReserves | realSolReserves | tokenTotalSupply | complete
      if (d.length < 49) return;
      const virtualToken = d.readBigUInt64LE(8);
      const virtualSol = d.readBigUInt64LE(16);
      const totalSupply = d.readBigUInt64LE(40);
      const graduated = d[48] === 1;
      if (graduated || virtualToken === 0n) {
        out.set(mint, { marketCapLamports: null, graduated });
        return;
      }
      out.set(mint, { marketCapLamports: (totalSupply * virtualSol) / virtualToken, graduated: false });
    });
  }
  return out;
}
