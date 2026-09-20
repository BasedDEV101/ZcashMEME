// Per-collection funding addresses.
//
// A launchpad cannot pay for everyone's stamps: one viral coin would drain the
// operator. So each collection carries its own ZEC balance, and its stamps are
// paid from it. When it runs dry that collection's stamps queue; every other
// collection is unaffected, and the operator is never exposed.
//
// The address is derived from the operator's minter key and the Solana mint,
// so:
//   - it is deterministic: the same collection always resolves to the same
//     address, on any machine, with no per-collection state to lose;
//   - it is recoverable from the single key file that already exists;
//   - the launcher only has to send ZEC to an address, never manage a key.
//
// This is fee money for inscriptions, not user funds. Nobody's stamp is held
// here, and losing a collection's balance costs only the fees it would have
// paid.

import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { addressFromHash, hash160, TransparentKey } from "./wallet.ts";
import { REGISTRY_PHRASE } from "../core/collection.ts";
import type { ZcashNetwork } from "../core/zcash-address.ts";

const DOMAIN = new TextEncoder().encode("zsam-collection-funding-v1");

/** The key that pays for one collection's stamps. */
export function fundingKeyFor(master: TransparentKey, solanaMint: string): TransparentKey {
  const material = hmac(sha256, DOMAIN, new TextEncoder().encode(`${solanaMint}`));
  // Domain-separated from the master key: knowing one collection's key must
  // not reveal the master or any sibling.
  const derived = hmac(sha256, master.privateKey, material);
  return new TransparentKey(derived);
}

export function fundingAddressFor(master: TransparentKey, solanaMint: string, network: ZcashNetwork): string {
  return fundingKeyFor(master, solanaMint).address(network);
}

/**
 * The registry address deploy records are sent to.
 *
 * hash160 of a fixed phrase, used directly as the P2PKH hash: finding a key
 * for it means inverting the hash. So entries can be added by anyone and
 * removed by no one, including us.
 */
export function registryAddress(network: ZcashNetwork): string {
  const h = hash160(new TextEncoder().encode(REGISTRY_PHRASE));
  return addressFromHash(h, network, "p2pkh");
}
