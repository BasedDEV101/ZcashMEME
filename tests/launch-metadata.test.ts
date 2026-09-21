import assert from "node:assert/strict";
import test from "node:test";
import { readLaunchMetadata } from "../api/_rpc.ts";

function borshCreate(name: string, symbol: string, uri: string): Uint8Array {
  const fields = [name, symbol, uri].map((value) => new TextEncoder().encode(value));
  const size = 8 + fields.reduce((total, field) => total + 4 + field.length, 0);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  let offset = 8;
  for (const field of fields) {
    view.setUint32(offset, field.length, true);
    offset += 4;
    bytes.set(field, offset);
    offset += field.length;
  }
  return bytes;
}

test("reads the shared Pump and Meteora launch metadata layout", () => {
  const encoded = borshCreate("Anonymous Cat", "ZCAT", "https://example.com/zcat.json");
  assert.deepEqual(readLaunchMetadata(encoded), {
    name: "Anonymous Cat",
    symbol: "ZCAT",
    uri: "https://example.com/zcat.json",
  });
});

test("refuses truncated launch metadata", () => {
  assert.equal(readLaunchMetadata(borshCreate("Name", "SYM", "https://example.com").subarray(0, 15)), null);
});
