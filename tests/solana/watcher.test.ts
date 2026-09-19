import { test } from "node:test";
import assert from "node:assert/strict";
import { watchPass } from "../../src/solana/watcher.ts";
import { Store } from "../../src/store/db.ts";
import type { RpcTransaction } from "../../src/solana/normalize.ts";
import type { SolanaRpc } from "../../src/solana/rpc.ts";
import { SPL_TOKEN, MEMO_V2 } from "../../src/solana/programs.ts";
import { FakeRpc } from "./fake-rpc.ts";
import { CFG, MINT, ALICE, ALICE_Z, BOB_Z, fake32, fakeSig } from "../core/fixtures.ts";

let n = 0;
function tx(kind: "burn" | "transfer" | "burn-no-memo" | "other-memo", opts: { amount?: string; memo?: string } = {}): { tx: RpcTransaction; memo: string | null } {
  n++;
  const ata = fake32("ata");
  const ixs: any[] = [];
  if (kind === "burn" || kind === "burn-no-memo") {
    ixs.push({ programId: SPL_TOKEN, program: "spl-token", parsed: { type: "burnChecked", info: { account: ata, mint: MINT, authority: ALICE, tokenAmount: { amount: opts.amount ?? "5000000000000", decimals: 6 } } } });
  }
  if (kind === "transfer") {
    ixs.push({ programId: SPL_TOKEN, program: "spl-token", parsed: { type: "transferChecked", info: { source: ata, destination: fake32("d"), mint: MINT, authority: ALICE, tokenAmount: { amount: "1", decimals: 6 } } } });
  }
  let memo: string | null = null;
  if (kind === "burn" || kind === "other-memo") {
    const text = opts.memo ?? (kind === "burn" ? ALICE_Z : "gm");
    ixs.push({ programId: MEMO_V2, program: "spl-memo", parsed: text });
    memo = `[${text.length}] ${text}`;
  }
  return {
    memo,
    tx: {
      slot: 1000 + n, blockTime: 1_758_300_000 + n,
      meta: { err: null, innerInstructions: [] },
      transaction: { signatures: [fakeSig(`w${n}`)], message: { accountKeys: [{ pubkey: ALICE, signer: true }], instructions: ixs } },
    },
  };
}

function setup() {
  const rpc = new FakeRpc();
  const store = new Store(":memory:");
  const add = (...items: ReturnType<typeof tx>[]) => items.forEach((i) => rpc.push(i.tx, i.memo));
  const pass = (pageSize = 1000) => watchPass(rpc as unknown as SolanaRpc, store, CFG, { pageSize });
  return { rpc, store, add, pass };
}

test("records valid and rejected burns; fetches only memo-carrying txs", async () => {
  const { rpc, store, add, pass } = setup();
  add(tx("transfer"), tx("burn"), tx("transfer"), tx("burn", { amount: "1" }), tx("burn-no-memo"), tx("other-memo"));
  const r = await pass();
  assert.equal(r.scanned, 6);
  assert.equal(r.fetched, 3, "burn, small burn, other-memo; plain transfers and the memo-less burn are never fetched");
  assert.equal(r.burnAttempts, 2);
  assert.equal(r.valid, 1);
  assert.equal(r.rejected, 1);
  assert.equal(rpc.calls.get, 3);
  assert.deepEqual(store.counts(), { valid: 1, rejected: 1, total: 2 });
});

test("second pass only sees what is new, across many pages", async () => {
  const { rpc, store, add, pass } = setup();
  for (let i = 0; i < 25; i++) add(tx("transfer"));
  add(tx("burn"));
  await pass(10);
  const listBefore = rpc.calls.list;
  for (let i = 0; i < 12; i++) add(tx("transfer"));
  add(tx("burn", { memo: BOB_Z }), tx("burn"));
  const r2 = await pass(10);
  assert.equal(r2.scanned, 14);
  assert.equal(r2.valid, 2);
  assert.equal(rpc.calls.list - listBefore, 2, "14 new sigs at page size 10 = 2 list calls");
  assert.equal(store.validBurns().length, 3);
});

test("a crash mid-pass loses nothing: cursor does not move, next pass completes", async () => {
  const { rpc, store, add, pass } = setup();
  const a = tx("burn"), b = tx("burn"), c = tx("burn");
  add(a, b, c);
  rpc.failGetOnce.add(b.tx.transaction.signatures[0]);
  await assert.rejects(pass(), /simulated RPC outage/);
  assert.equal(store.getCursor(`solana:${MINT}`), null, "cursor unchanged after a failed pass");
  assert.equal(store.validBurns().length, 1, "a was recorded before the failure");
  const r = await pass();
  assert.equal(r.valid, 2, "b and c picked up; a skipped as already recorded");
  assert.deepEqual(store.validBurns().map((x) => x.signature),
    [a, b, c].map((t) => t.tx.transaction.signatures[0]));
});

test("idle pass is cheap and does not move the cursor", async () => {
  const { rpc, store, add, pass } = setup();
  add(tx("burn"));
  await pass();
  const cur = store.getCursor(`solana:${MINT}`);
  const r = await pass();
  assert.equal(r.scanned, 0);
  assert.equal(store.getCursor(`solana:${MINT}`), cur);
  assert.equal(rpc.calls.get, 1);
});
