// Shared bits for the read-only data endpoints.
//
// The RPC key lives in a Vercel env var, never in the bundle: the browser gets
// our JSON, not our endpoint.

import { SolanaRpc, FailoverRpc, DEFAULT_RPC } from "../src/solana/rpc.ts";

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
