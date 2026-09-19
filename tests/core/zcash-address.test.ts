import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTransparentAddress, isTransparentAddressFor } from "../../src/core/zcash-address.ts";
import { taddr } from "./fixtures.ts";

test("recognises all four transparent address kinds by prefix", () => {
  const cases = [
    ["main", "p2pkh", "t1"], ["main", "p2sh", "t3"],
    ["test", "p2pkh", "tm"], ["test", "p2sh", "t2"],
  ] as const;
  for (const [network, kind, lead] of cases) {
    const a = taddr(`x-${network}-${kind}`, network, kind);
    assert.ok(a.startsWith(lead), `${a} should start with ${lead}`);
    const p = parseTransparentAddress(a);
    assert.ok(p);
    assert.equal(p.network, network);
    assert.equal(p.kind, kind);
    assert.equal(p.hash.length, 20);
  }
});

test("rejects bad checksum, unified, TEX, sprout/sapling-looking and junk", () => {
  const good = taddr("good");
  const bad = good.slice(0, -1) + (good.endsWith("a") ? "b" : "a");
  for (const s of [
    bad,
    "u1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    "tex1s2rt77ggv6q989lr49rkgzmh5slsksa9khdgte",
    "zs1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    "", "t1", "not an address at all, definitely not",
  ]) {
    assert.equal(parseTransparentAddress(s), null, s);
  }
});

test("parse trims surrounding whitespace; strict network check does not", () => {
  const a = taddr("ws");
  assert.equal(parseTransparentAddress(`  ${a}\n`)?.address, a);
  assert.equal(isTransparentAddressFor(a, "test"), true);
  assert.equal(isTransparentAddressFor(`${a}\n`, "test"), false);
  assert.equal(isTransparentAddressFor(a, "main"), false);
});
