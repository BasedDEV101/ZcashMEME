import { test } from "node:test";
import assert from "node:assert/strict";
import { fundingAddressFor, fundingKeyFor } from "../../src/zcash/funding.ts";
import { TransparentKey } from "../../src/zcash/wallet.ts";
import { parseTransparentAddress } from "../../src/core/zcash-address.ts";
import { unhex, hex } from "../../src/zcash/script.ts";

const master = new TransparentKey(unhex("11".repeat(32)));
const other = new TransparentKey(unhex("22".repeat(32)));
const MINT_A = "EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc";
const MINT_B = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

test("deterministic: the same collection always resolves to the same address", () => {
  const a = fundingAddressFor(master, MINT_A, "main");
  assert.equal(fundingAddressFor(master, MINT_A, "main"), a);
  assert.ok(parseTransparentAddress(a)?.network === "main");
  assert.ok(a.startsWith("t1"));
});

test("every collection gets a different address", () => {
  const a = fundingAddressFor(master, MINT_A, "main");
  const b = fundingAddressFor(master, MINT_B, "main");
  assert.notEqual(a, b);
});

test("a different operator key gives different addresses for the same mint", () => {
  assert.notEqual(fundingAddressFor(master, MINT_A, "main"), fundingAddressFor(other, MINT_A, "main"));
});

test("a collection key is not the master key, and siblings are unrelated", () => {
  const a = fundingKeyFor(master, MINT_A);
  const b = fundingKeyFor(master, MINT_B);
  assert.notEqual(hex(a.privateKey), hex(master.privateKey), "must not reuse the operator key");
  assert.notEqual(hex(a.privateKey), hex(b.privateKey));
  // Knowing one collection's key must not hand over the master or a sibling.
  assert.notEqual(hex(fundingKeyFor(a, MINT_B).privateKey), hex(b.privateKey));
});

test("networks are separate addresses from the same key", () => {
  const main = fundingAddressFor(master, MINT_A, "main");
  const test_ = fundingAddressFor(master, MINT_A, "test");
  assert.ok(main.startsWith("t1") && test_.startsWith("tm"));
  assert.notEqual(main, test_);
});
