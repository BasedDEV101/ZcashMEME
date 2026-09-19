import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateBurn } from "../../src/core/validity.ts";
import { burn, burnTx, CFG, ALICE, ALICE_Z, MINT, TOKEN_PROGRAM, fake32, taddr } from "./fixtures.ts";
import { INCINERATOR, SYSTEM_PROGRAM } from "../../src/solana/programs.ts";

const reason = (tx: Parameters<typeof evaluateBurn>[0]) => {
  const v = evaluateBurn(tx, CFG);
  return v.ok ? "ok" : v.reason;
};

test("a well-formed burn is valid and carries the memo address and amount", () => {
  const v = evaluateBurn(burnTx(), CFG);
  assert.ok(v.ok);
  assert.equal(v.burn.zcashAddress, ALICE_Z);
  assert.equal(v.burn.amount, 7_350_000_000_000n);
});

test("finality and success are required", () => {
  assert.equal(reason(burnTx({ finalized: false })), "not finalized");
  assert.equal(reason(burnTx({ succeeded: false })), "transaction failed");
});

test("exactly one top-level burn of our mint, by the expected program, signed by its authority", () => {
  assert.equal(reason(burnTx({ burns: [] })), "no burn of our mint");
  const b = burnTx().burns[0];
  assert.equal(reason(burnTx({ burns: [b, { ...b, account: fake32("other") }] })), "more than one burn of our mint");
  assert.equal(reason(burnTx({ burns: [burn({ topLevel: false })] })), "burn executed via CPI, not top-level");
  assert.match(reason(burnTx({ burns: [burn({ programId: fake32("evil-program") })] })), /unexpected token program/);
  assert.equal(reason(burnTx({ signers: [fake32("someone-else")] })), "burn authority did not sign");
});

test("burns of OTHER mints in the same tx are ignored", () => {
  const b = burnTx().burns[0];
  assert.equal(reason(burnTx({ burns: [{ ...b, mint: fake32("other-mint") }, b] })), "ok");
});

test("burns before the start slot do not count", () => {
  const cfgWas = CFG.startSlot;
  (CFG as { startSlot: number }).startSlot = 42;
  try {
    assert.match(reason(burnTx({ slot: 41 })), /before start slot 42/);
    assert.equal(reason(burnTx({ slot: 42 })), "ok");
  } finally {
    (CFG as { startSlot: number }).startSlot = cfgWas;
  }
});

test("the token account owner decides, not the instruction's authority account", () => {
  // Anyone may burn tokens sitting in a system- or incinerator-owned account,
  // with no signature. A stranger must not be able to claim the NFT for them.
  for (const owner of [SYSTEM_PROGRAM, INCINERATOR]) {
    const tx = burnTx({ burns: [burn({ sourceOwner: owner, authority: owner })], signers: [owner] });
    assert.match(reason(tx), /system program or incinerator/);
  }
  assert.equal(reason(burnTx({ burns: [burn({ sourceOwner: fake32("someone-else") })] })),
    "burn authority is not the token account owner");
  assert.equal(reason(burnTx({ burns: [burn({ sourceOwner: null })] })),
    "token balances do not record the source owner");
});

test("the recorded balance change must match the burned amount", () => {
  assert.equal(reason(burnTx({ burns: [burn({ preAmount: 5n })] })), "balance change does not match the burned amount");
  assert.equal(reason(burnTx({ burns: [burn({ preAmount: null })] })), "token balances do not record the source balance");
});

test("burnChecked decimals must match the mint", () => {
  assert.match(reason(burnTx({ burns: [burn({ decimalsChecked: 9 })] })), /decimals 9 != 6/);
  assert.equal(reason(burnTx({ burns: [burn({ decimalsChecked: null })] })), "ok", "plain burn carries no decimals byte");
});

test("minimum is inclusive", () => {
  assert.equal(reason(burnTx({ amount: CFG.minBurnRaw })), "ok");
  assert.match(reason(burnTx({ amount: CFG.minBurnRaw - 1n })), /below minimum/);
});

test("memo must be exactly one transparent address on the configured network", () => {
  assert.equal(reason(burnTx({ memos: [] })), "no memo");
  assert.equal(reason(burnTx({ memos: [ALICE_Z, ALICE_Z] })), "more than one memo");
  assert.equal(reason(burnTx({ memo: "hello" })), "memo is not a Zcash transparent address");
  assert.match(reason(burnTx({ memo: taddr("m", "main") })), /expected testnet/);
  assert.equal(reason(burnTx({ memo: `${ALICE_Z}\n` })), "ok"); // a trailing newline must not cost a burner their NFT
});

void ALICE; void MINT; void TOKEN_PROGRAM;
