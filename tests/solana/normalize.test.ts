import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTransaction, resolveKeys } from "../../src/solana/normalize.ts";
import { evaluateBurn } from "../../src/core/validity.ts";
import { SPL_TOKEN, TOKEN_2022, MEMO_V1, MEMO_V3, MEMO_V4, INCINERATOR } from "../../src/solana/programs.ts";
import { CFG, MINT, ALICE, ALICE_ATA, ALICE_Z, fake32, fakeSig } from "../core/fixtures.ts";
import { rawTx, burnData } from "./raw.ts";

const utf8 = (s: string) => new TextEncoder().encode(s);
const AMOUNT = 7_350_000n * 1_000_000n;

const burnIx = (amount = AMOUNT, decimals: number | null = 6, program = TOKEN_2022, authority = ALICE) =>
  ({ program, accounts: [ALICE_ATA, MINT, authority], data: burnData(amount, decimals) });
const memoIx = (text: string, program = MEMO_V3) => ({ program, data: utf8(text) });
const bal = (owner = ALICE, pre = AMOUNT + 1000n, post = 1000n) => [{ account: ALICE_ATA, mint: MINT, owner, pre, post }];

test("a burnChecked + memo tx normalises and passes the rule end to end", () => {
  const n = normalizeTransaction(rawTx({ signature: fakeSig("a"), signers: [ALICE], ixs: [burnIx(), memoIx(ALICE_Z)], balances: bal() }), { finalized: true });
  assert.equal(n.burns.length, 1);
  assert.equal(n.burns[0].amount, AMOUNT);
  assert.equal(n.burns[0].sourceOwner, ALICE);
  assert.equal(n.burns[0].decimalsChecked, 6);
  assert.deepEqual(n.memos, [ALICE_Z]);
  const v = evaluateBurn(n, CFG);
  assert.ok(v.ok, v.ok ? "" : v.reason);
});

test("plain burn (tag 8) carries no decimals byte", () => {
  const n = normalizeTransaction(rawTx({ signature: fakeSig("b"), signers: [ALICE], ixs: [burnIx(AMOUNT, null), memoIx(ALICE_Z)], balances: bal() }), { finalized: true });
  assert.equal(n.burns[0].decimalsChecked, null);
  assert.ok(evaluateBurn(n, CFG).ok);
});

test("all three memo programs are read", () => {
  for (const p of [MEMO_V1, MEMO_V3, MEMO_V4]) {
    const n = normalizeTransaction(rawTx({ signature: fakeSig(`m${p}`), signers: [ALICE], ixs: [burnIx(), memoIx(ALICE_Z, p)], balances: bal() }), { finalized: true });
    assert.deepEqual(n.memos, [ALICE_Z], `memo program ${p}`);
    assert.ok(evaluateBurn(n, CFG).ok);
  }
});

test("extra accounts on the burn do not confuse the owner (the jsonParsed multisig trap)", () => {
  const ix = { program: TOKEN_2022, accounts: [ALICE_ATA, MINT, ALICE, fake32("extra-1"), fake32("extra-2")], data: burnData(AMOUNT, 6) };
  const n = normalizeTransaction(rawTx({ signature: fakeSig("x"), signers: [ALICE], ixs: [ix, memoIx(ALICE_Z)], balances: bal() }), { finalized: true });
  assert.equal(n.burns[0].authority, ALICE);
  assert.ok(evaluateBurn(n, CFG).ok, "a real burn must not be rejected because accounts were appended");
});

test("unrelated instructions (ComputeBudget, Lighthouse) are ignored", () => {
  const n = normalizeTransaction(rawTx({
    signature: fakeSig("c"), signers: [ALICE], balances: bal(),
    ixs: [{ program: "ComputeBudget111111111111111111111111111111", data: Uint8Array.from([2, 0, 0, 0, 0]) }, burnIx(), memoIx(ALICE_Z), { program: fake32("lighthouse"), data: utf8("assert") }],
  }), { finalized: true });
  assert.equal(n.burns.length, 1);
  assert.ok(evaluateBurn(n, CFG).ok);
});

test("keys from an address lookup table resolve correctly", () => {
  const tx = rawTx({ signature: fakeSig("lut"), signers: [ALICE], ixs: [burnIx(), memoIx(ALICE_Z)], balances: bal(), lookup: [MINT] });
  assert.ok(resolveKeys(tx).includes(MINT));
  const n = normalizeTransaction(tx, { finalized: true });
  assert.equal(n.burns[0].mint, MINT);
  assert.ok(evaluateBurn(n, CFG).ok);
});

test("a CPI burn is seen and marked, then rejected by the rule", () => {
  const n = normalizeTransaction(rawTx({ signature: fakeSig("cpi"), signers: [ALICE], ixs: [memoIx(ALICE_Z)], innerIxs: [burnIx()], balances: bal() }), { finalized: true });
  assert.equal(n.burns[0].topLevel, false);
  assert.match((evaluateBurn(n, CFG) as { reason: string }).reason, /CPI/);
});

test("a memo invoked via CPI is not counted", () => {
  const n = normalizeTransaction(rawTx({ signature: fakeSig("cpimemo"), signers: [ALICE], ixs: [burnIx()], innerIxs: [memoIx(ALICE_Z)], balances: bal() }), { finalized: true });
  assert.deepEqual(n.memos, []);
  assert.equal((evaluateBurn(n, CFG) as { reason: string }).reason, "no memo");
});

test("classic SPL Token burns are parsed but rejected for a Token-2022 mint", () => {
  const n = normalizeTransaction(rawTx({ signature: fakeSig("spl"), signers: [ALICE], ixs: [burnIx(AMOUNT, 6, SPL_TOKEN), memoIx(ALICE_Z)], balances: bal() }), { finalized: true });
  assert.equal(n.burns[0].programId, SPL_TOKEN);
  assert.match((evaluateBurn(n, CFG) as { reason: string }).reason, /unexpected token program/);
});

test("burning tokens abandoned in the incinerator cannot be claimed", () => {
  const n = normalizeTransaction(rawTx({
    signature: fakeSig("inc"), signers: [fake32("stranger")],
    ixs: [{ program: TOKEN_2022, accounts: [ALICE_ATA, MINT, INCINERATOR], data: burnData(AMOUNT, 6) }, memoIx(ALICE_Z)],
    balances: bal(INCINERATOR),
  }), { finalized: true });
  assert.match((evaluateBurn(n, CFG) as { reason: string }).reason, /system program or incinerator/);
});

test("malformed instruction data is skipped, never guessed", () => {
  const n = normalizeTransaction(rawTx({ signature: fakeSig("bad"), signers: [ALICE], ixs: [{ program: TOKEN_2022, accounts: [ALICE_ATA, MINT, ALICE], data: Uint8Array.from([15, 1, 2]) }, memoIx(ALICE_Z)], balances: bal() }), { finalized: true });
  assert.equal(n.burns.length, 0);
});

test("non-UTF8 memo bytes are not treated as an address", () => {
  const n = normalizeTransaction(rawTx({ signature: fakeSig("nu"), signers: [ALICE], ixs: [burnIx(), { program: MEMO_V3, data: Uint8Array.from([0xff, 0xfe]) }], balances: bal() }), { finalized: true });
  assert.deepEqual(n.memos, []);
});

test("failed transactions are marked", () => {
  const n = normalizeTransaction(rawTx({ signature: fakeSig("e"), signers: [ALICE], ixs: [burnIx(), memoIx(ALICE_Z)], balances: bal(), err: { InstructionError: [0, "Custom"] } }), { finalized: true });
  assert.equal(n.succeeded, false);
});
