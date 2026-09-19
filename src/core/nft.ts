// NFT inscription content: canonical JSON, byte-exact.
//
//   {"p":"zsam","op":"mint","v":1,"mint":"<solana mint>","burn":"<solana tx sig>","amt":"<raw>","to":"<zcash t-addr>"}
//
// Encoding is canonical: fixed key order, no whitespace, amt as a decimal
// string with no leading zeros. A parser accepts ONLY the exact bytes that
// encodeNftContent would produce for the same fields, so there is exactly one
// valid encoding of any NFT and no ambiguity between indexers.

import type { BridgeConfig, ValidBurn } from "./types.ts";

export const CONTENT_TYPE = "application/json";
export const OP_MINT = "mint";
export const VERSION = 1;

export interface NftContent {
  p: string;
  op: typeof OP_MINT;
  v: typeof VERSION;
  mint: string;
  burn: string;
  amt: bigint;
  to: string;
}

export function contentForBurn(burn: ValidBurn, cfg: BridgeConfig): NftContent {
  return {
    p: cfg.protocol,
    op: OP_MINT,
    v: VERSION,
    mint: cfg.solanaMint,
    burn: burn.signature,
    amt: burn.amount,
    to: burn.zcashAddress,
  };
}

export function encodeNftContent(c: NftContent): string {
  // Built by hand, not JSON.stringify(obj), so key order is fixed by this code.
  return (
    `{"p":${JSON.stringify(c.p)},"op":"${OP_MINT}","v":${VERSION},` +
    `"mint":${JSON.stringify(c.mint)},"burn":${JSON.stringify(c.burn)},` +
    `"amt":"${c.amt.toString()}","to":${JSON.stringify(c.to)}}`
  );
}

export function encodeNftBytes(c: NftContent): Uint8Array {
  return new TextEncoder().encode(encodeNftContent(c));
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;

/** Parse inscription bytes. Returns null unless the bytes are the canonical encoding. */
export function parseNftContent(bytes: Uint8Array, protocol: string): NftContent | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o);
  const want = ["p", "op", "v", "mint", "burn", "amt", "to"];
  if (keys.length !== want.length || !want.every((k) => keys.includes(k))) return null;
  if (o.p !== protocol || o.op !== OP_MINT || o.v !== VERSION) return null;
  if (typeof o.mint !== "string" || typeof o.burn !== "string" || typeof o.to !== "string") return null;
  if (typeof o.amt !== "string" || !DECIMAL.test(o.amt)) return null;

  const c: NftContent = {
    p: o.p as string, op: OP_MINT, v: VERSION,
    mint: o.mint, burn: o.burn, amt: BigInt(o.amt), to: o.to,
  };
  // Reject any non-canonical encoding (whitespace, key order, escapes…).
  if (encodeNftContent(c) !== text) return null;
  return c;
}
