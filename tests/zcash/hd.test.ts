import { test } from "node:test";
import assert from "node:assert/strict";
import { createWallet, fromMnemonic, isValidMnemonic, derivationPath, ZCASH_COIN_TYPE } from "../../src/zcash/hd.ts";
import { parseTransparentAddress } from "../../src/core/zcash-address.ts";

test("uses the standard Zcash path so the phrase imports into a real wallet", () => {
  assert.equal(ZCASH_COIN_TYPE, 133, "SLIP-44 coin type for ZEC");
  assert.equal(derivationPath(), "m/44'/133'/0'/0/0");
  assert.equal(derivationPath(1, 2), "m/44'/133'/1'/0/2");
});

test("generates a usable mainnet t-address", () => {
  const w = createWallet("main");
  assert.equal(w.mnemonic.split(" ").length, 12);
  const p = parseTransparentAddress(w.address);
  assert.ok(p, w.address);
  assert.equal(p.network, "main");
  assert.equal(p.kind, "p2pkh");
  assert.ok(w.address.startsWith("t1"));
});

test("the same phrase always gives the same address", () => {
  const w = createWallet("main");
  assert.equal(fromMnemonic(w.mnemonic, "main").address, w.address);
  // and tolerates how people actually paste phrases
  assert.equal(fromMnemonic(`  ${w.mnemonic.toUpperCase()}\n`, "main").address, w.address);
});

test("a known phrase derives a known address (regression against silent drift)", () => {
  // If this ever changes, previously generated wallets would stop resolving.
  const phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const { address, path } = fromMnemonic(phrase, "main");
  assert.equal(path, "m/44'/133'/0'/0/0");
  assert.equal(address, "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F");
  // Cross-check the same phrase on testnet, so a prefix mix-up cannot pass.
  assert.equal(fromMnemonic(phrase, "test").address, "tmPLGq3RDkLhRcpr4jFXaNZMAHHXiVerN4Z");
});

test("different accounts and indexes give different addresses", () => {
  const phrase = createWallet().mnemonic;
  const a = fromMnemonic(phrase, "main", 0, 0).address;
  const b = fromMnemonic(phrase, "main", 0, 1).address;
  const c = fromMnemonic(phrase, "main", 1, 0).address;
  assert.equal(new Set([a, b, c]).size, 3);
});

test("testnet derivation gives a tm address from the same phrase", () => {
  const w = createWallet("main");
  const t = fromMnemonic(w.mnemonic, "test").address;
  assert.ok(t.startsWith("tm"));
  assert.notEqual(t, w.address);
});

test("refuses an invalid phrase instead of deriving nonsense", () => {
  assert.throws(() => fromMnemonic("not a real phrase at all"), /valid 12 or 24 word/);
  assert.throws(() => fromMnemonic(""), /valid 12 or 24 word/);
  // one word changed = invalid checksum
  assert.equal(isValidMnemonic("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon zoo"), false);
  assert.equal(isValidMnemonic("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"), true);
});
