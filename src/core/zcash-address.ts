// Zcash transparent address validation.
//
// NFTs are transparent inscriptions, so the recipient named in a burn memo must
// be a transparent address. Shielded, unified (u1…) and TEX (tex1…) addresses
// are rejected: an inscription cannot be sent to them. See docs/SPEC.md.
//
// Layout: base58check( 2-byte version prefix || 20-byte hash ).

import { base58CheckDecode } from "./base58.ts";

export type ZcashNetwork = "main" | "test";
export type TransparentKind = "p2pkh" | "p2sh";

const PREFIXES: Record<ZcashNetwork, Record<TransparentKind, [number, number]>> = {
  main: { p2pkh: [0x1c, 0xb8], p2sh: [0x1c, 0xbd] }, // t1…, t3…
  test: { p2pkh: [0x1d, 0x25], p2sh: [0x1c, 0xba] }, // tm…, t2…
};

export interface TransparentAddress {
  address: string;
  network: ZcashNetwork;
  kind: TransparentKind;
  hash: Uint8Array; // 20 bytes
}

export function parseTransparentAddress(input: string): TransparentAddress | null {
  const address = input.trim();
  if (address.length < 30 || address.length > 40) return null;
  const payload = base58CheckDecode(address);
  if (!payload || payload.length !== 22) return null;
  for (const network of ["main", "test"] as const) {
    for (const kind of ["p2pkh", "p2sh"] as const) {
      const [a, b] = PREFIXES[network][kind];
      if (payload[0] === a && payload[1] === b) {
        return { address, network, kind, hash: payload.slice(2) };
      }
    }
  }
  return null;
}

export function isTransparentAddressFor(input: string, network: ZcashNetwork): boolean {
  const parsed = parseTransparentAddress(input);
  return parsed !== null && parsed.network === network && parsed.address === input;
}

export { PREFIXES as TRANSPARENT_PREFIXES };
