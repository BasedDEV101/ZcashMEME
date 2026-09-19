import { test } from "node:test";
import assert from "node:assert/strict";
import { conventionalFee, inputSize, outputSize, logicalActions, marginalFee, GRACE_ACTIONS, MARGINAL_FEE_BEFORE, MARGINAL_FEE_AFTER, MARGINAL_FEE_DROP_HEIGHT } from "../../src/zcash/fees.ts";

test("a tiny transaction still pays the grace minimum", () => {
  // One logical action, but the fee is charged for GRACE_ACTIONS (2).
  assert.equal(logicalActions(inputSize(107), outputSize(25)), 1);
  assert.equal(conventionalFee(inputSize(107), outputSize(25), 5000n), BigInt(GRACE_ACTIONS) * 5000n);
  assert.equal(conventionalFee(inputSize(107), outputSize(25), 5000n), 10_000n, "the fee the testnet node accepted for our commit");
});

test("a large scriptSig raises the action count", () => {
  // The reveal's scriptSig is ~425 bytes, so its input is ~470 -> ceil(470/150) = 4 actions.
  const actions = logicalActions(inputSize(425), outputSize(25));
  assert.equal(actions, 4);
  assert.equal(conventionalFee(inputSize(425), outputSize(25), 5000n), 20_000n, "matches the fee the testnet node accepted");
});

test("many outputs can dominate the action count", () => {
  assert.equal(logicalActions(inputSize(107), outputSize(25) * 10), 10);
});

test("the reduced marginal fee applies only where it is known active", () => {
  // Proved by a real testnet rejection: the cut is not live there.
  assert.equal(marginalFee(4_368_528, "test"), MARGINAL_FEE_BEFORE);
  assert.equal(marginalFee(MARGINAL_FEE_DROP_HEIGHT + 1, "test"), MARGINAL_FEE_BEFORE);
  assert.equal(marginalFee(MARGINAL_FEE_DROP_HEIGHT - 1, "main"), MARGINAL_FEE_BEFORE);
  assert.equal(marginalFee(MARGINAL_FEE_DROP_HEIGHT, "main"), MARGINAL_FEE_AFTER);
});

test("size helpers account for the varint length prefix", () => {
  assert.equal(inputSize(107), 36 + 1 + 107 + 4);
  assert.equal(inputSize(425), 36 + 3 + 425 + 4, "scriptSig over 252 bytes needs a 3-byte varint");
  assert.equal(outputSize(25), 8 + 1 + 25);
});
