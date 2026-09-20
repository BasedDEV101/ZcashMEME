// Zcash transparent keys, addresses and signing.
//
// Keys live only in git-ignored files with 0600 permissions and are never
// logged or committed. Only addresses and public keys are printed.

import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { ripemd160 } from "@noble/hashes/legacy";
import { base58CheckEncode } from "../core/base58.ts";
import { TRANSPARENT_PREFIXES, type ZcashNetwork } from "../core/zcash-address.ts";
import { compactToDer } from "./der.ts";
import { concat, OP_CHECKSIG, OP_DUP, OP_EQUAL, OP_EQUALVERIFY, OP_HASH160, pushData } from "./script.ts";
import { SIGHASH_ALL } from "./zip244.ts";

// @noble/secp256k1 v2 needs its HMAC hook wired up before synchronous signing.
secp.etc.hmacSha256Sync = (k: Uint8Array, ...m: Uint8Array[]) => hmac(sha256, k, secp.etc.concatBytes(...m));

export function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

export function p2pkhScript(hash: Uint8Array): Uint8Array {
  return concat(Uint8Array.from([OP_DUP, OP_HASH160]), pushData(hash), Uint8Array.from([OP_EQUALVERIFY, OP_CHECKSIG]));
}
export function p2shScript(scriptHash: Uint8Array): Uint8Array {
  return concat(Uint8Array.from([OP_HASH160]), pushData(scriptHash), Uint8Array.from([OP_EQUAL]));
}
export function addressFromHash(hash: Uint8Array, network: ZcashNetwork, kind: "p2pkh" | "p2sh"): string {
  const [a, b] = TRANSPARENT_PREFIXES[network][kind];
  return base58CheckEncode(concat(Uint8Array.from([a, b]), hash));
}

export class TransparentKey {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;   // 33-byte compressed

  constructor(privateKey: Uint8Array) {
    if (privateKey.length !== 32) throw new Error("private key must be 32 bytes");
    this.privateKey = privateKey;
    this.publicKey = secp.getPublicKey(privateKey, true);
  }

  static generate(): TransparentKey {
    for (;;) {
      const k = crypto.getRandomValues(new Uint8Array(32));
      try { return new TransparentKey(k); } catch { /* out of range, retry */ }
    }
  }

  get hash160(): Uint8Array { return hash160(this.publicKey); }
  address(network: ZcashNetwork): string { return addressFromHash(this.hash160, network, "p2pkh"); }
  scriptPubKey(): Uint8Array { return p2pkhScript(this.hash160); }

  /**
   * DER signature with the sighash-type byte appended, as scripts carry it.
   * S is normalised low: high-S signatures are non-standard and get rejected
   * by relays even though they are cryptographically valid.
   */
  signDigest(digest: Uint8Array, hashType: number = SIGHASH_ALL): Uint8Array {
    const sig = secp.sign(digest, this.privateKey);
    const low = sig.hasHighS() ? sig.normalizeS() : sig;
    return concat(compactToDer(low.toBytes()), Uint8Array.from([hashType]));
  }
}
