import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeDeployRequest, parseDeployRequest, evaluateDeployRequest } from "../../src/core/deploy-request.ts";

const MINT = "EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc";
const REQ = { mint: MINT, symbol: "STAMP", minWholeTokens: 1_000_000n };
const FEE = 100_000_000n; // 0.1 SOL

test("a request round-trips through its memo", () => {
  assert.deepEqual(parseDeployRequest(encodeDeployRequest(REQ)), REQ);
  assert.equal(encodeDeployRequest({ ...REQ, symbol: "stamp" }), encodeDeployRequest(REQ), "symbol is normalised");
});

test("rejects malformed memos rather than guessing", () => {
  for (const m of [
    "gm",
    "zsam:deploy:1:" + MINT + ":STAMP",
    "zsam:deploy:1:not-a-mint:STAMP:1000000",
    "zsam:deploy:1:" + MINT + ":TOOLONGSYMBOL:1000000",
    "zsam:deploy:1:" + MINT + ":STAMP:0",
    "zsam:deploy:1:" + MINT + ":ST AMP:1000000",
  ]) {
    assert.equal(parseDeployRequest(m), null, m.slice(0, 50));
  }
});

test("a request that did not pay the fee is not a request", () => {
  const base = { finalized: true, succeeded: true, memos: [encodeDeployRequest(REQ)] };
  assert.equal(evaluateDeployRequest({ ...base, transfersToOperator: FEE }, FEE).ok, true);
  assert.equal(evaluateDeployRequest({ ...base, transfersToOperator: FEE + 1n }, FEE).ok, true, "overpaying is fine");
  const short = evaluateDeployRequest({ ...base, transfersToOperator: FEE - 1n }, FEE);
  assert.equal(short.ok, false);
  assert.match(short.reason!, /launch fee is/);
});

test("finality, success and exactly one memo are required", () => {
  const paid = { transfersToOperator: FEE, memos: [encodeDeployRequest(REQ)] };
  assert.match(evaluateDeployRequest({ ...paid, finalized: false, succeeded: true }, FEE).reason!, /finalized/);
  assert.match(evaluateDeployRequest({ ...paid, finalized: true, succeeded: false }, FEE).reason!, /failed/);
  assert.match(evaluateDeployRequest({ finalized: true, succeeded: true, transfersToOperator: FEE, memos: [] }, FEE).reason!, /one memo/);
});
