// ZIP 244 signature hash for transparent inputs of a v5 Zcash transaction,
// and ZIP 225 v5 serialisation.
//
// Implemented directly from the ZIPs rather than pulling in a closed-source
// library, and proved correct by recomputing the sighash of a real mainnet
// transaction and checking its on-chain signature verifies against it
// (tests/zcash/zip244.test.ts).
//
// ZIP 244: https://zips.z.cash/zip-0244   ZIP 225: https://zips.z.cash/zip-0225

import { blake2b } from "@noble/hashes/blake2b";
import { concat } from "./script.ts";

export const SIGHASH_ALL = 0x01;
export const V5_HEADER = 0x80000005;          // fOverwintered | version 5
export const VERSION_GROUP_ID_V5 = 0x26a7270a;

export interface TxIn {
  txid: string;            // big-endian hex, as block explorers display it
  vout: number;
  valueZat: bigint;        // value of the output being spent
  scriptPubKey: Uint8Array;// script of the output being spent
  sequence?: number;
}
export interface TxOut {
  valueZat: bigint;
  scriptPubKey: Uint8Array;
}
export interface TxSkeleton {
  consensusBranchId: number;
  lockTime?: number;
  expiryHeight: number;
  inputs: TxIn[];
  outputs: TxOut[];
  versionGroupId?: number;
}

const enc = (s: string) => new TextEncoder().encode(s);
const h = (personal: string | Uint8Array, data: Uint8Array) =>
  blake2b(data, { dkLen: 32, personalization: typeof personal === "string" ? enc(personal) : personal });

export function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}
export function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}
export function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.from([n]);
  if (n <= 0xffff) return Uint8Array.from([0xfd, n & 0xff, n >> 8]);
  return concat(Uint8Array.from([0xfe]), u32le(n));
}
/** Explorer txids are displayed big-endian; the wire format is little-endian. */
export function txidLE(txid: string): Uint8Array {
  return Uint8Array.from(Buffer.from(txid, "hex").reverse());
}
const withLen = (b: Uint8Array) => concat(varint(b.length), b);
const seqOf = (i: TxIn) => i.sequence ?? 0xffffffff;

// --- ZIP 244 digests -------------------------------------------------------

function headerDigest(tx: TxSkeleton): Uint8Array {
  return h("ZTxIdHeadersHash", concat(
    u32le(V5_HEADER),
    u32le(tx.versionGroupId ?? VERSION_GROUP_ID_V5),
    u32le(tx.consensusBranchId),
    u32le(tx.lockTime ?? 0),
    u32le(tx.expiryHeight),
  ));
}

function transparentSigDigest(tx: TxSkeleton, index: number, hashType: number): Uint8Array {
  const prevouts = h("ZTxIdPrevoutHash", concat(...tx.inputs.map((i) => concat(txidLE(i.txid), u32le(i.vout)))));
  const amounts = h("ZTxTrAmountsHash", concat(...tx.inputs.map((i) => u64le(i.valueZat))));
  const scriptpubkeys = h("ZTxTrScriptsHash", concat(...tx.inputs.map((i) => withLen(i.scriptPubKey))));
  const sequence = h("ZTxIdSequencHash", concat(...tx.inputs.map((i) => u32le(seqOf(i)))));
  const outputs = h("ZTxIdOutputsHash", concat(...tx.outputs.map((o) => concat(u64le(o.valueZat), withLen(o.scriptPubKey)))));

  const input = tx.inputs[index];
  // For a P2SH input the script code is the script of the output being spent
  // (ZIP 244 S.2g), NOT the redeem script.
  const txin = h("Zcash___TxInHash", concat(
    txidLE(input.txid), u32le(input.vout),
    u64le(input.valueZat),
    withLen(input.scriptPubKey),
    u32le(seqOf(input)),
  ));

  return h("ZTxIdTranspaHash", concat(
    Uint8Array.from([hashType]), prevouts, amounts, scriptpubkeys, sequence, outputs, txin,
  ));
}

const EMPTY_SAPLING = () => h("ZTxIdSaplingHash", new Uint8Array(0));
const EMPTY_ORCHARD = () => h("ZTxIdOrchardHash", new Uint8Array(0));

/** Personalisation is "ZcashTxHash_" followed by the consensus branch id. */
function txPersonal(branchId: number): Uint8Array {
  return concat(enc("ZcashTxHash_"), u32le(branchId));
}

/** The 32-byte message a transparent input's signature commits to. */
export function signatureHash(tx: TxSkeleton, index: number, hashType: number = SIGHASH_ALL): Uint8Array {
  return h(txPersonal(tx.consensusBranchId), concat(
    headerDigest(tx),
    transparentSigDigest(tx, index, hashType),
    EMPTY_SAPLING(),
    EMPTY_ORCHARD(),
  ));
}

// --- ZIP 225 serialisation -------------------------------------------------

/** Serialise a transparent-only v5 transaction with the given scriptSigs. */
export function serializeV5(tx: TxSkeleton, scriptSigs: Uint8Array[]): Uint8Array {
  return concat(
    u32le(V5_HEADER),
    u32le(tx.versionGroupId ?? VERSION_GROUP_ID_V5),
    u32le(tx.consensusBranchId),
    u32le(tx.lockTime ?? 0),
    u32le(tx.expiryHeight),
    varint(tx.inputs.length),
    ...tx.inputs.map((i, n) => concat(txidLE(i.txid), u32le(i.vout), withLen(scriptSigs[n]), u32le(seqOf(i)))),
    varint(tx.outputs.length),
    ...tx.outputs.map((o) => concat(u64le(o.valueZat), withLen(o.scriptPubKey))),
    Uint8Array.from([0, 0, 0]), // no sapling spends, no sapling outputs, no orchard
  );
}
