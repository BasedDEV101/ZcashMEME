import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegistry, encodeCollectionBytes, parseCollection, type CollectionCandidate, type CollectionContent } from "../../src/core/collection.ts";
import { MINT, ALICE_Z, BOB_Z, fake32, taddr } from "./fixtures.ts";

const C: CollectionContent = {
  p: "zsam", op: "deploy", v: 2,
  mint: MINT, sym: "STAMP", dec: 6, min: 1_000_000_000_000n, from: 448811893, by: ALICE_Z,
};
const enc = (s: string) => new TextEncoder().encode(s);
let n = 0;
const cand = (content: Uint8Array, over: Partial<CollectionCandidate> = {}): CollectionCandidate => ({
  inscriptionId: `d${++n}i0`, height: 1000 + n, txIndex: 0, index: 0,
  contentType: "application/json", content, ...over,
});

test("a deploy record round-trips", () => {
  assert.deepEqual(parseCollection(encodeCollectionBytes(C), "zsam"), C);
});

test("rejects non-canonical and malformed records", () => {
  const s = new TextDecoder().decode(encodeCollectionBytes(C));
  for (const v of [
    s.replace('"dec":6', '"dec": 6'),
    s.replace('"from":448811893', '"from":"448811893"'),
    s.replace("}", ',"x":1}'),
    s.replace('"min":"1000000000000"', '"min":1000000000000'),
    s.replace('"sym":"STAMP"', '"sym":"STAMP!"'),
    s.replace('"dec":6', '"dec":99'),
    s.replace(ALICE_Z, "not-an-address"),
    s.replace('"p":"zsam"', '"p":"other"'),
  ]) {
    assert.equal(parseCollection(enc(v), "zsam"), null, v.slice(0, 60));
  }
});

test("first deploy wins: a mint cannot be redeployed", () => {
  // Otherwise anyone could redeploy a live collection with a different
  // minimum and split its history.
  const first = cand(encodeCollectionBytes(C), { height: 10 });
  const later = cand(encodeCollectionBytes({ ...C, min: 1n, by: BOB_Z }), { height: 50 });
  const r = buildRegistry([later, first], "zsam", "test");
  assert.equal(r.collections.length, 1);
  assert.equal(r.collections[0].min, C.min);
  assert.equal(r.collections[0].by, ALICE_Z);
  assert.match(r.rejected[0].reason, /already deployed/);
});

test("different mints each get their own collection, in chain order", () => {
  const a = cand(encodeCollectionBytes({ ...C, sym: "AAA" }), { height: 20 });
  const b = cand(encodeCollectionBytes({ ...C, mint: fake32("mint-b"), sym: "BBB" }), { height: 10 });
  const r = buildRegistry([a, b], "zsam", "test");
  assert.deepEqual(r.collections.map((c) => c.sym), ["BBB", "AAA"]);
  assert.equal(r.rejected.length, 0);
});

test("a deployer on the wrong network is refused", () => {
  const r = buildRegistry([cand(encodeCollectionBytes({ ...C, by: taddr("x", "main") }))], "zsam", "test");
  assert.equal(r.collections.length, 0, "a mainnet address cannot deploy a testnet collection");
  assert.match(r.rejected[0].reason, /not a testnet address/);
});

test("junk inscriptions are rejected with a reason, never silently dropped", () => {
  const r = buildRegistry([
    cand(enc("gm")),
    cand(encodeCollectionBytes(C), { contentType: "text/plain" }),
  ], "zsam", "test");
  assert.equal(r.collections.length, 0);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["not a canonical deploy record", "wrong content type"]);
});
