// DER <-> compact for secp256k1 signatures. Script signatures are DER encoded;
// @noble/secp256k1 v2 speaks 64-byte compact only.

import { concat } from "./script.ts";

const trimLeadingZeros = (b: Uint8Array): Uint8Array => {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  return b.subarray(i);
};

/** Parse DER (without the trailing sighash-type byte) into 64-byte compact r||s. */
export function derToCompact(der: Uint8Array): Uint8Array | null {
  if (der.length < 8 || der[0] !== 0x30) return null;
  if (der[1] !== der.length - 2) return null;
  if (der[2] !== 0x02) return null;
  const rLen = der[3];
  if (4 + rLen > der.length) return null;
  const r = der.subarray(4, 4 + rLen);
  const sTagAt = 4 + rLen;
  if (der[sTagAt] !== 0x02) return null;
  const sLen = der[sTagAt + 1];
  const s = der.subarray(sTagAt + 2, sTagAt + 2 + sLen);
  if (s.length === 0 || r.length === 0) return null;
  const out = new Uint8Array(64);
  const rb = trimLeadingZeros(r), sb = trimLeadingZeros(s);
  if (rb.length > 32 || sb.length > 32) return null;
  out.set(rb, 32 - rb.length);
  out.set(sb, 64 - sb.length);
  return out;
}

/** Encode 64-byte compact r||s as DER, with positive integers (leading 0x00 when the high bit is set). */
export function compactToDer(compact: Uint8Array): Uint8Array {
  if (compact.length !== 64) throw new Error("expected 64-byte compact signature");
  const int = (raw: Uint8Array): Uint8Array => {
    let v = trimLeadingZeros(raw);
    if (v[0] & 0x80) v = concat(Uint8Array.from([0]), v);
    return concat(Uint8Array.from([0x02, v.length]), v);
  };
  const body = concat(int(compact.subarray(0, 32)), int(compact.subarray(32, 64)));
  return concat(Uint8Array.from([0x30, body.length]), body);
}
