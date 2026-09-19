import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeNftContent, encodeNftBytes, parseNftContent, type NftContent } from "../../src/core/nft.ts";
import { MINT, ALICE_Z, fakeSig } from "./fixtures.ts";

const C: NftContent = { p: "zsam", op: "mint", v: 1, mint: MINT, burn: fakeSig("b"), amt: 7_350_000_000_000n, to: ALICE_Z };
const enc = (s: string) => new TextEncoder().encode(s);

test("canonical encoding round-trips", () => {
  const parsed = parseNftContent(encodeNftBytes(C), "zsam");
  assert.deepEqual(parsed, C);
});

test("encoding is compact and stable", () => {
  const s = encodeNftContent(C);
  assert.ok(s.startsWith('{"p":"zsam","op":"mint","v":1,"mint":'));
  assert.ok(!/\s/.test(s));
  assert.ok(s.length < 300, `content is ${s.length} bytes`);
});

test("rejects every non-canonical variant of the same data", () => {
  const s = encodeNftContent(C);
  const variants = [
    s.replace('"op":"mint"', '"op": "mint"'),                         // whitespace
    JSON.stringify({ op: "mint", p: "zsam", v: 1, mint: C.mint, burn: C.burn, amt: C.amt.toString(), to: C.to }), // key order
    s.replace("}", ',"x":1}'),                                        // extra key
    s.replace(`"amt":"${C.amt}"`, `"amt":"0${C.amt}"`),               // leading zero
    s.replace(`"amt":"${C.amt}"`, `"amt":${C.amt}`),                  // number not string
    s.replace('"v":1', '"v":2'),                                      // version
    s.replace('"p":"zsam"', '"p":"zsamx"'),                           // protocol
    s.replace('"to":"', '"to":"\\u0074'),                              // escaped char
  ];
  for (const v of variants) assert.equal(parseNftContent(enc(v), "zsam"), null, v);
});

test("rejects invalid UTF-8 and non-objects", () => {
  assert.equal(parseNftContent(Uint8Array.from([0xff, 0xfe]), "zsam"), null);
  assert.equal(parseNftContent(enc("[]"), "zsam"), null);
  assert.equal(parseNftContent(enc("null"), "zsam"), null);
});
