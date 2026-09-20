// Browser-generated Zcash wallets from a standard BIP39 seed.
//
// Solana traders do not have Zcash wallets, and the wallets they would install
// (Zashi/Zodl, Nighthawk) are shielded-by-default and expose only unified
// addresses, which cannot receive an inscription. So the site generates one.
//
// It is a STANDARD wallet, not a toy: 12-word BIP39 seed on the standard Zcash
// path (SLIP-44 coin type 133), so the same words import into Ywallet later
// and produce the same address. The user is never locked in.
//
// This module must only ever run client-side. A seed that reaches a server
// makes its operator a custodian of every NFT minted through the site.

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { TransparentKey } from "./wallet.ts";
import type { ZcashNetwork } from "../core/zcash-address.ts";

/** BIP44, Zcash transparent. SLIP-44 assigns coin type 133 to ZEC. */
export const ZCASH_COIN_TYPE = 133;
export const derivationPath = (account = 0, index = 0) =>
  `m/44'/${ZCASH_COIN_TYPE}'/${account}'/0/${index}`;

export interface GeneratedWallet {
  mnemonic: string;
  address: string;
  path: string;
}

/** A fresh 12-word wallet. The caller must show the words and confirm they are saved. */
export function createWallet(network: ZcashNetwork = "main", strengthBits: 128 | 256 = 128): GeneratedWallet {
  const mnemonic = generateMnemonic(wordlist, strengthBits);
  return { mnemonic, ...fromMnemonic(mnemonic, network) };
}

/** Re-derive an existing wallet. Throws on an invalid phrase rather than deriving nonsense. */
export function fromMnemonic(mnemonic: string, network: ZcashNetwork = "main", account = 0, index = 0): { address: string; path: string; key: TransparentKey } {
  const phrase = mnemonic.trim().replace(/\s+/g, " ").toLowerCase();
  if (!validateMnemonic(phrase, wordlist)) throw new Error("That is not a valid 12 or 24 word recovery phrase.");
  const path = derivationPath(account, index);
  const node = HDKey.fromMasterSeed(mnemonicToSeedSync(phrase)).derive(path);
  if (!node.privateKey) throw new Error("derivation produced no private key");
  const key = new TransparentKey(node.privateKey);
  return { address: key.address(network), path, key };
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim().replace(/\s+/g, " ").toLowerCase(), wordlist);
}
