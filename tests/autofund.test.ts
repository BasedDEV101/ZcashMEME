import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWANCE_ZAT, LOW_WATER_STAMPS, OPERATOR_RESERVE_ZAT, STAMP_COST_ZAT, TOP_UP_STAMPS, planTopUp,
} from "../src/zcash/autofund.ts";

const rich = 1000n * STAMP_COST_ZAT + OPERATOR_RESERVE_ZAT;

test("a funded collection is left alone", () => {
  const p = planTopUp({ balanceZat: LOW_WATER_STAMPS * STAMP_COST_ZAT, sentZat: 0n, operatorZat: rich });
  assert.equal(p.amountZat, 0n);
});

test("an empty collection gets a top-up", () => {
  const p = planTopUp({ balanceZat: 0n, sentZat: 0n, operatorZat: rich });
  assert.equal(p.amountZat, TOP_UP_STAMPS * STAMP_COST_ZAT);
});

test("top-ups stop at the launch-fee allowance", () => {
  const p = planTopUp({ balanceZat: 0n, sentZat: ALLOWANCE_ZAT, operatorZat: rich });
  assert.equal(p.amountZat, 0n);
  assert.match(p.reason, /allowance/);
});

test("the last top-up is trimmed to what is left of the allowance", () => {
  const sent = ALLOWANCE_ZAT - 10n * STAMP_COST_ZAT;
  const p = planTopUp({ balanceZat: 0n, sentZat: sent, operatorZat: rich });
  assert.equal(p.amountZat, 10n * STAMP_COST_ZAT);
});

test("the operator reserve is never spent", () => {
  const p = planTopUp({ balanceZat: 0n, sentZat: 0n, operatorZat: OPERATOR_RESERVE_ZAT });
  assert.equal(p.amountZat, 0n);
  assert.match(p.reason, /reserve/);
});

test("a viral collection cannot drain the operator", () => {
  // Repeatedly emptied and topped up, it still stops at its own allowance.
  let sent = 0n;
  for (let i = 0; i < 1000; i++) {
    const p = planTopUp({ balanceZat: 0n, sentZat: sent, operatorZat: rich * 1000n });
    if (p.amountZat === 0n) break;
    sent += p.amountZat;
  }
  assert.equal(sent, ALLOWANCE_ZAT);
});

test("a dust-sized remainder is not sent", () => {
  const p = planTopUp({ balanceZat: 0n, sentZat: ALLOWANCE_ZAT - 1n, operatorZat: rich });
  assert.equal(p.amountZat, 0n);
});
