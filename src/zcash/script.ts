// Minimal Bitcoin-style script encoding/decoding, as Zcash transparent scripts use.

export const OP_0 = 0x00;
export const OP_1 = 0x51;
export const OP_PUSHDATA1 = 0x4c;
export const OP_PUSHDATA2 = 0x4d;
export const OP_PUSHDATA4 = 0x4e;
export const OP_DUP = 0x76;
export const OP_EQUAL = 0x87;
export const OP_EQUALVERIFY = 0x88;
export const OP_HASH160 = 0xa9;
export const OP_CHECKSIG = 0xac;
export const OP_CHECKSIGVERIFY = 0xad;
export const OP_DROP = 0x75;

/** Minimal push of `data`, the encoding every decoder expects. */
export function pushData(data: Uint8Array): Uint8Array {
  const n = data.length;
  if (n < OP_PUSHDATA1) return Uint8Array.from([n, ...data]);
  if (n <= 0xff) return Uint8Array.from([OP_PUSHDATA1, n, ...data]);
  if (n <= 0xffff) return Uint8Array.from([OP_PUSHDATA2, n & 0xff, n >> 8, ...data]);
  return Uint8Array.from([OP_PUSHDATA4, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff, ...data]);
}

/** Small integers use OP_0 / OP_1..OP_16; larger ones are pushed as bytes. */
export function pushNumber(n: number): Uint8Array {
  if (n === 0) return Uint8Array.from([OP_0]);
  if (n >= 1 && n <= 16) return Uint8Array.from([OP_1 + n - 1]);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) { bytes.push(v & 0xff); v >>= 8; }
  if (bytes[bytes.length - 1] & 0x80) bytes.push(0); // keep it positive
  return pushData(Uint8Array.from(bytes));
}

export interface ScriptItem { op: number; data: Uint8Array | null; number: number | null }

/** Parse a script into pushes and opcodes. Returns null if it is malformed. */
export function parseScript(script: Uint8Array): ScriptItem[] | null {
  const items: ScriptItem[] = [];
  let i = 0;
  while (i < script.length) {
    const op = script[i++];
    if (op > 0 && op < OP_PUSHDATA1) {
      if (i + op > script.length) return null;
      items.push({ op, data: script.subarray(i, i + op), number: null });
      i += op;
    } else if (op === OP_PUSHDATA1 || op === OP_PUSHDATA2 || op === OP_PUSHDATA4) {
      const width = op === OP_PUSHDATA1 ? 1 : op === OP_PUSHDATA2 ? 2 : 4;
      if (i + width > script.length) return null;
      let len = 0;
      for (let k = width - 1; k >= 0; k--) len = (len << 8) | script[i + k];
      i += width;
      if (i + len > script.length) return null;
      items.push({ op, data: script.subarray(i, i + len), number: null });
      i += len;
    } else if (op === OP_0) {
      items.push({ op, data: new Uint8Array(0), number: 0 });
    } else if (op >= OP_1 && op <= OP_1 + 15) {
      items.push({ op, data: null, number: op - OP_1 + 1 });
    } else {
      items.push({ op, data: null, number: null });
    }
  }
  return items;
}

export const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

export const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
export const unhex = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s, "hex"));
