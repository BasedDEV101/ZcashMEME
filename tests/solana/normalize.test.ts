import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTransaction, type RpcTransaction } from "../../src/solana/normalize.ts";
import { evaluateBurn } from "../../src/core/validity.ts";
import { base58Encode } from "../../src/core/base58.ts";
import { SPL_TOKEN, TOKEN_2022, MEMO_V2, MEMO_V1 } from "../../src/solana/programs.ts";
import { CFG, MINT, ALICE, ALICE_Z, fake32, fakeSig } from "../core/fixtures.ts";

const ATA = fake32("alice-ata");

function rpcTx(instructions: RpcTransaction["transaction"]["message"]["instructions"], over: Partial<RpcTransaction> = {}): RpcTransaction {
  return {
    slot: 321,
    blockTime: 1_758_300_000,
    meta: { err: null, innerInstructions: [] },
    transaction: {
      signatures: [fakeSig("real")],
      message: {
        accountKeys: [
          { pubkey: ALICE, signer: true },
          { pubkey: ATA, signer: false },
          { pubkey: MINT, signer: false },
        ],
        instructions,
      },
    },
    ...over,
  };
}

const burnChecked = (amount: string, programId = SPL_TOKEN) => ({
  programId, program: programId === SPL_TOKEN ? "spl-token" : "spl-token-2022",
  parsed: { type: "burnChecked", info: { account: ATA, mint: MINT, authority: ALICE, tokenAmount: { amount, decimals: 6, uiAmount: 0, uiAmountString: "" } } },
});
const burnPlain = (amount: string) => ({
  programId: SPL_TOKEN, program: "spl-token",
  parsed: { type: "burn", info: { account: ATA, mint: MINT, authority: ALICE, amount } },
});
const memo = (text: string) => ({ programId: MEMO_V2, program: "spl-memo", parsed: text });

test("burnChecked + memo normalises and passes the validity rule end to end", () => {
  const n = normalizeTransaction(rpcTx([burnChecked("7350000000000"), memo(ALICE_Z)]), { finalized: true });
  assert.equal(n.burns.length, 1);
  assert.equal(n.burns[0].amount, 7_350_000_000_000n);
  assert.equal(n.burns[0].topLevel, true);
  assert.deepEqual(n.memos, [ALICE_Z]);
  assert.deepEqual(n.signers, [ALICE]);
  const v = evaluateBurn(n, CFG);
  assert.ok(v.ok, v.ok ? "" : v.reason);
});

test("plain `burn` (not checked) reads the amount from info.amount", () => {
  const n = normalizeTransaction(rpcTx([burnPlain("2000000000000"), memo(ALICE_Z)]), { finalized: true });
  assert.equal(n.burns[0].amount, 2_000_000_000_000n);
});

test("Token-2022 burns are recognised (rule 5 then decides if the program is ours)", () => {
  const n = normalizeTransaction(rpcTx([burnChecked("5000000000000", TOKEN_2022), memo(ALICE_Z)]), { finalized: true });
  assert.equal(n.burns[0].programId, TOKEN_2022);
  const v = evaluateBurn(n, CFG); // CFG expects classic SPL Token
  assert.ok(!v.ok && /unexpected token program/.test(v.reason));
});

test("inner-instruction burns are marked topLevel=false and rejected by rule 4", () => {
  const n = normalizeTransaction(
    rpcTx([memo(ALICE_Z)], { meta: { err: null, innerInstructions: [{ index: 0, instructions: [burnChecked("5000000000000")] }] } }),
    { finalized: true },
  );
  assert.equal(n.burns[0].topLevel, false);
  const v = evaluateBurn(n, CFG);
  assert.ok(!v.ok && /CPI/.test(v.reason));
});

test("failed transactions normalise with succeeded=false", () => {
  const n = normalizeTransaction(rpcTx([burnChecked("5000000000000"), memo(ALICE_Z)], { meta: { err: { InstructionError: [0, "Custom"] }, innerInstructions: [] } }), { finalized: true });
  assert.equal(n.succeeded, false);
});

test("memo v1 with raw base58 data (unparsed) is decoded", () => {
  const data = base58Encode(new TextEncoder().encode(ALICE_Z));
  const n = normalizeTransaction(rpcTx([burnChecked("5000000000000"), { programId: MEMO_V1, data }]), { finalized: true });
  assert.deepEqual(n.memos, [ALICE_Z]);
});

test("unparseable token instructions are skipped, never guessed", () => {
  const n = normalizeTransaction(rpcTx([{ programId: SPL_TOKEN, data: "3Bxs4h24hBtQy9rw" }, memo(ALICE_Z)]), { finalized: true });
  assert.equal(n.burns.length, 0);
});

test("multisig burns carry the multisig as authority, which never signs", () => {
  const ms = fake32("multisig");
  const ix = { programId: SPL_TOKEN, program: "spl-token", parsed: { type: "burn", info: { account: ATA, mint: MINT, multisigAuthority: ms, signers: [ALICE], amount: "5000000000000" } } };
  const n = normalizeTransaction(rpcTx([ix, memo(ALICE_Z)]), { finalized: true });
  assert.equal(n.burns[0].authority, ms);
  const v = evaluateBurn(n, CFG);
  assert.ok(!v.ok && v.reason === "burn authority did not sign");
});
