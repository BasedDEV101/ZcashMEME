// Base58 (Bitcoin alphabet) and Base58Check with double-SHA256 checksum.
// Used for Solana addresses/signatures (plain base58) and Zcash transparent
// addresses (base58check).

// @noble/hashes, not node:crypto: this runs in the browser too, where the
// site derives a Zcash address client-side.
import { sha256 } from "@noble/hashes/sha2";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX = new Map([...ALPHABET].map((c, i) => [c, BigInt(i)]));

export function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

export function base58Decode(s: string): Uint8Array | null {
  if (s.length === 0) return null;
  let n = 0n;
  for (const c of s) {
    const v = INDEX.get(c);
    if (v === undefined) return null;
    n = n * 58n + v;
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

function sha256d(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

export function base58CheckEncode(payload: Uint8Array): string {
  const sum = sha256d(payload).subarray(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload);
  full.set(sum, payload.length);
  return base58Encode(full);
}

/** Returns the payload (without checksum) or null if malformed / bad checksum. */
export function base58CheckDecode(s: string): Uint8Array | null {
  const full = base58Decode(s);
  if (!full || full.length < 5) return null;
  const payload = full.subarray(0, full.length - 4);
  const sum = full.subarray(full.length - 4);
  const want = sha256d(payload).subarray(0, 4);
  for (let i = 0; i < 4; i++) if (sum[i] !== want[i]) return null;
  return payload;
}
