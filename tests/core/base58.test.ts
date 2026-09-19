import { test } from "node:test";
import assert from "node:assert/strict";
import { base58Encode, base58Decode, base58CheckEncode, base58CheckDecode } from "../../src/core/base58.ts";

test("base58 round-trips, including leading zero bytes", () => {
  for (const bytes of [[0, 0, 1, 2, 3], [255, 254], [0], [1, 0, 0, 0]]) {
    const u = Uint8Array.from(bytes);
    assert.deepEqual(base58Decode(base58Encode(u)), u);
  }
});

test("base58 rejects characters outside the alphabet (0, O, I, l)", () => {
  for (const s of ["0abc", "Oabc", "Iabc", "labc", ""]) assert.equal(base58Decode(s), null);
});

test("base58check detects a corrupted character", () => {
  const s = base58CheckEncode(Uint8Array.from([1, 2, 3, 4, 5]));
  assert.deepEqual(base58CheckDecode(s), Uint8Array.from([1, 2, 3, 4, 5]));
  const i = 3;
  const swapped = s.slice(0, i) + (s[i] === "2" ? "3" : "2") + s.slice(i + 1);
  assert.equal(base58CheckDecode(swapped), null);
});
