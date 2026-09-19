import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBurnInstructions, checkBurnRequest, type BurnRequest } from "../../src/solana/burn-tx.ts";
import { normalizeTransaction } from "../../src/solana/normalize.ts";
import { evaluateBurn } from "../../src/core/validity.ts";
import { MEMO_V3, TOKEN_2022 } from "../../src/solana/programs.ts";
import { rawTx } from "./raw.ts";
import { CFG, MINT, ALICE, ALICE_ATA, ALICE_Z, taddr, fakeSig } from "../core/fixtures.ts";

const req = (over: Partial<BurnRequest> = {}): BurnRequest => ({
  mint: MINT, tokenProgramId: TOKEN_2022, tokenAccount: ALICE_ATA, owner: ALICE,
  amountRaw: 7_350_000n * 1_000_000n, decimals: 6, zcashAddress: ALICE_Z,
  zcashNetwork: "test", minBurnRaw: CFG.minBurnRaw, ...over,
});

test("what the UI builds is exactly what the rule accepts", () => {
  const ixs = buildBurnInstructions(req());
  assert.equal(ixs.length, 2);
  assert.equal(ixs[1].programId.toBase58(), MEMO_V3);
  // Feed the built instructions back through the verifier's own parser.
  const tx = rawTx({
    signature: fakeSig("ui"), signers: [ALICE],
    ixs: [
      { program: ixs[0].programId.toBase58(), accounts: ixs[0].keys.map((k) => k.pubkey.toBase58()), data: Uint8Array.from(ixs[0].data) },
      { program: ixs[1].programId.toBase58(), data: Uint8Array.from(ixs[1].data) },
    ],
    balances: [{ account: ALICE_ATA, mint: MINT, owner: ALICE, pre: 8_000_000n * 1_000_000n, post: 650_000n * 1_000_000n }],
  });
  const v = evaluateBurn(normalizeTransaction(tx, { finalized: true }), CFG);
  assert.ok(v.ok, v.ok ? "" : v.reason);
  assert.equal(v.burn.zcashAddress, ALICE_Z);
  assert.equal(v.burn.amount, 7_350_000_000_000n);
});

test("refuses, with messages a user can act on, before any tokens are burned", () => {
  assert.throws(() => checkBurnRequest(req({ zcashAddress: "nonsense" })), /t1 or t3/);
  assert.throws(() => checkBurnRequest(req({ zcashAddress: taddr("m", "main") })), /mainnet\. Use a testnet/);
  assert.throws(() => checkBurnRequest(req({ zcashAddress: ` ${ALICE_Z} ` })), /whitespace/);
  assert.throws(() => checkBurnRequest(req({ amountRaw: 5n })), /minimum burn is 1,000,000 tokens/);
});
