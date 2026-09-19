// The Zcash inscription envelope: the "ord" scriptSig format used by ~113,000
// mainnet inscriptions and read by every live indexer, in the Universe
// Zerdinals v1 profile (docs/research/zcash-minting.md).
//
// scriptSig of the reveal input:
//   PUSH "ord" | <totalPieces> | PUSH contentType | (<index> PUSH piece)... | PUSH sig | PUSH redeemScript
//
// redeem script (v1):
//   PUSH pubkey  OP_CHECKSIGVERIFY  PUSH commitment  OP_DROP  OP_DROP*(3+2*pieces)  OP_1
// legacy is the same without the commitment push and its OP_DROP.
//
// Commitment C = SHA-256("UZRD1" || contentType || 0x00 || content). scriptSig
// bytes are outside the txid and uncovered by any signature, so without C the
// content could be altered in flight without changing the txid.

import { createHash } from "node:crypto";
import { concat, OP_1, OP_CHECKSIGVERIFY, OP_DROP, parseScript, pushData, pushNumber, type ScriptItem } from "./script.ts";

export const MAGIC = new TextEncoder().encode("ord");
export const PIECE_SIZE = 240;
export const MAX_PIECES = 255;
export const MAX_CONTENT_BYTES = 61_200;
export const MAX_PIECES_PER_TX = 4;
export const MAX_SCRIPTSIG_BYTES = 1_650;
export const DUST_ZAT = 546n;
const COMMIT_PREFIX = new TextEncoder().encode("UZRD1");

export function commitment(contentType: string, content: Uint8Array): Uint8Array {
  const ct = new TextEncoder().encode(contentType);
  return new Uint8Array(createHash("sha256")
    .update(Buffer.from(concat(COMMIT_PREFIX, ct, Uint8Array.from([0]), content))).digest());
}

/** Split content into 240-byte pieces, indexed descending (index 0 is last). */
export function chunk(content: Uint8Array): { index: number; data: Uint8Array }[] {
  if (content.length === 0) throw new Error("empty content is not inscribable");
  if (content.length > MAX_CONTENT_BYTES) throw new Error(`content exceeds ${MAX_CONTENT_BYTES} bytes`);
  const total = Math.ceil(content.length / PIECE_SIZE);
  if (total > MAX_PIECES) throw new Error(`content needs ${total} pieces, max ${MAX_PIECES}`);
  const out: { index: number; data: Uint8Array }[] = [];
  for (let i = 0; i < total; i++) {
    out.push({ index: total - 1 - i, data: content.subarray(i * PIECE_SIZE, (i + 1) * PIECE_SIZE) });
  }
  return out; // push order: highest index first, index 0 last
}

export function validateContentType(contentType: string): void {
  if (contentType.length < 3 || contentType.length > 96) throw new Error("content type must be 3-96 bytes");
  if (!contentType.includes("/")) throw new Error("content type must contain '/'");
  if (!/^[\x20-\x7e]+$/.test(contentType)) throw new Error("content type must be printable ASCII");
}

export function buildRedeemScript(pubkey: Uint8Array, piecesInTx: number, c: Uint8Array | null): Uint8Array {
  if (pubkey.length !== 33) throw new Error("expected a 33-byte compressed pubkey");
  const drops = 3 + 2 * piecesInTx;             // "ord", totalPieces, contentType, then index+data per piece
  const parts = [pushData(pubkey), Uint8Array.from([OP_CHECKSIGVERIFY])];
  if (c) parts.push(pushData(c), Uint8Array.from([OP_DROP]));   // v1 commitment
  parts.push(Uint8Array.from(new Array(drops).fill(OP_DROP)), Uint8Array.from([OP_1]));
  return concat(...parts);
}

/** The envelope part of the reveal scriptSig; the signature and redeem script are appended when signing. */
export function buildEnvelopePrefix(contentType: string, totalPieces: number, pieces: { index: number; data: Uint8Array }[]): Uint8Array {
  validateContentType(contentType);
  if (pieces.length < 1 || pieces.length > MAX_PIECES_PER_TX) throw new Error(`1-${MAX_PIECES_PER_TX} pieces per tx`);
  const parts = [pushData(MAGIC), pushNumber(totalPieces), pushData(new TextEncoder().encode(contentType))];
  for (const p of pieces) parts.push(pushNumber(p.index), pushData(p.data));
  return concat(...parts);
}

export interface DecodedEnvelope {
  totalPieces: number;
  contentType: string;
  pieces: { index: number; data: Uint8Array }[];
  commitment: Uint8Array | null;
  pubkey: Uint8Array | null;
}

/** Decode a reveal scriptSig. Returns null if it is not an inscription envelope. */
export function decodeEnvelope(scriptSig: Uint8Array): DecodedEnvelope | null {
  if (scriptSig.length > MAX_SCRIPTSIG_BYTES) return null;
  const items = parseScript(scriptSig);
  if (!items || items.length < 6) return null;
  const magic = items[0].data;
  if (!magic || Buffer.compare(Buffer.from(magic), Buffer.from(MAGIC)) !== 0) return null;

  const totalPieces = numberOf(items[1]);
  if (totalPieces === null || totalPieces < 1 || totalPieces > MAX_PIECES) return null;
  const ctBytes = items[2].data;
  if (!ctBytes) return null;
  const contentType = new TextDecoder().decode(ctBytes);

  // Everything between the content type and the final two pushes (signature,
  // redeem script) is index/piece pairs.
  const pieces: { index: number; data: Uint8Array }[] = [];
  const end = items.length - 2;
  for (let i = 3; i + 1 < end; i += 2) {
    const index = numberOf(items[i]);
    const data = items[i + 1].data;
    if (index === null || !data) return null;
    pieces.push({ index, data });
  }
  if (pieces.length === 0) return null;

  const redeem = items[items.length - 1].data;
  let c: Uint8Array | null = null;
  let pubkey: Uint8Array | null = null;
  if (redeem) {
    const r = parseScript(redeem);
    if (r) {
      if (r[0]?.data?.length === 33) pubkey = r[0].data;
      const found = r.find((it) => it.data?.length === 32);
      c = found?.data ?? null;
    }
  }
  return { totalPieces, contentType, pieces, commitment: c, pubkey };
}

function numberOf(item: ScriptItem): number | null {
  if (item.number !== null) return item.number;
  if (item.data && item.data.length <= 4) {
    let v = 0;
    for (let i = item.data.length - 1; i >= 0; i--) v = (v << 8) | item.data[i];
    return v;
  }
  return null;
}

/** Reassemble content from pieces gathered across reveal transactions, in push order. */
export function assemble(pieces: { index: number; data: Uint8Array }[]): Uint8Array {
  return concat(...pieces.map((p) => p.data));
}
