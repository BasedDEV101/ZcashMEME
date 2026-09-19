import { test } from "node:test";
import assert from "node:assert/strict";
import { watchPass } from "../../src/solana/watcher.ts";
import { Store } from "../../src/store/db.ts";
import type { SolanaRpc } from "../../src/solana/rpc.ts";
import { TOKEN_2022, MEMO_V3 } from "../../src/solana/programs.ts";
import { FakeRpc } from "./fake-rpc.ts";
import { rawTx, burnData } from "./raw.ts";
import { CFG, MINT, ALICE, ALICE_ATA, ALICE_Z, BOB_Z, fake32, fakeSig } from "../core/fixtures.ts";

const utf8 = (s: string) => new TextEncoder().encode(s);
const AMOUNT = 5_000_000n * 1_000_000n;
let n = 0;

function make(kind: "burn" | "transfer" | "burn-no-memo" | "other-memo", opts: { amount?: bigint; memo?: string } = {}) {
  n++;
  const sig = fakeSig(`w${n}`);
  const amount = opts.amount ?? AMOUNT;
  const ixs: { program: string; accounts?: string[]; data: Uint8Array }[] = [];
  if (kind === "burn" || kind === "burn-no-memo") {
    ixs.push({ program: TOKEN_2022, accounts: [ALICE_ATA, MINT, ALICE], data: burnData(amount, 6) });
  }
  if (kind === "transfer") {
    ixs.push({ program: TOKEN_2022, accounts: [ALICE_ATA, MINT, fake32("dest"), ALICE], data: Uint8Array.from([12, 1, 0, 0, 0, 0, 0, 0, 0, 6]) });
  }
  let memo: string | null = null;
  if (kind === "burn" || kind === "other-memo") {
    const text = opts.memo ?? (kind === "burn" ? ALICE_Z : "gm");
    ixs.push({ program: MEMO_V3, data: utf8(text) });
    memo = `[${text.length}] ${text}`;
  }
  const tx = rawTx({
    signature: sig, slot: 1000 + n, signers: [ALICE], ixs,
    balances: [{ account: ALICE_ATA, mint: MINT, owner: ALICE, pre: amount + 1000n, post: 1000n }],
  });
  return { tx, memo };
}

function setup() {
  const rpc = new FakeRpc();
  const store = new Store(":memory:");
  const add = (...items: ReturnType<typeof make>[]) => items.forEach((i) => rpc.push(i.tx, i.memo));
  const pass = (pageSize = 1000) => watchPass(rpc as unknown as SolanaRpc, store, CFG, { pageSize });
  return { rpc, store, add, pass };
}

test("records valid and rejected burns; fetches only memo-carrying txs", async () => {
  const { rpc, store, add, pass } = setup();
  add(make("transfer"), make("burn"), make("transfer"), make("burn", { amount: 1n }), make("burn-no-memo"), make("other-memo"));
  const r = await pass();
  assert.equal(r.scanned, 6);
  assert.equal(r.fetched, 3, "only memo-carrying txs are fetched");
  assert.equal(r.burnAttempts, 2);
  assert.equal(r.valid, 1);
  assert.equal(r.rejected, 1);
  assert.equal(rpc.calls.get, 3);
  assert.deepEqual(store.counts(), { valid: 1, rejected: 1, total: 2 });
});

test("second pass only sees what is new, across many pages", async () => {
  const { rpc, store, add, pass } = setup();
  for (let i = 0; i < 25; i++) add(make("transfer"));
  add(make("burn"));
  await pass(10);
  const listBefore = rpc.calls.list;
  for (let i = 0; i < 12; i++) add(make("transfer"));
  add(make("burn", { memo: BOB_Z }), make("burn"));
  const r2 = await pass(10);
  assert.equal(r2.scanned, 14);
  assert.equal(r2.valid, 2);
  assert.equal(rpc.calls.list - listBefore, 2, "14 new sigs at page size 10 = 2 list calls");
  assert.equal(store.validBurns().length, 3);
});

test("a crash mid-pass loses nothing: cursor does not move, next pass completes", async () => {
  const { rpc, store, add, pass } = setup();
  const a = make("burn"), b = make("burn"), c = make("burn");
  add(a, b, c);
  rpc.failGetOnce.add(b.tx.transaction.signatures[0]);
  await assert.rejects(pass(), /simulated RPC outage/);
  assert.equal(store.getCursor(`solana:${MINT}`), null, "cursor unchanged after a failed pass");
  assert.equal(store.validBurns().length, 1, "a was recorded before the failure");
  const r = await pass();
  assert.equal(r.valid, 2, "b and c picked up; a skipped as already recorded");
  assert.deepEqual(store.validBurns().map((x) => x.signature), [a, b, c].map((t) => t.tx.transaction.signatures[0]));
});

test("idle pass is cheap and does not move the cursor", async () => {
  const { rpc, store, add, pass } = setup();
  add(make("burn"));
  await pass();
  const cur = store.getCursor(`solana:${MINT}`);
  const r = await pass();
  assert.equal(r.scanned, 0);
  assert.equal(store.getCursor(`solana:${MINT}`), cur);
  assert.equal(rpc.calls.get, 1);
});

test("survives an RPC that no longer knows the cursor signature", async () => {
  const { rpc, store, add, pass } = setup();
  const first = make("burn");
  add(first);
  await pass();
  const cursor = store.getCursor(`solana:${MINT}`)!;
  assert.equal(store.validBurns().length, 1);

  // The RPC forgets it: pruned history, or a different provider.
  rpc.unknownSignatures.add(cursor);
  add(make("burn", { memo: BOB_Z }));

  const r = await pass();
  assert.equal(r.valid, 1, "the new burn is still found");
  assert.equal(store.validBurns().length, 2, "and the old one is not lost or duplicated");
  assert.notEqual(store.getCursor(`solana:${MINT}`), cursor, "cursor advanced past the unknown signature");
});

test("the slot cursor stops a re-scan from re-fetching old transactions", async () => {
  const { rpc, store, add, pass } = setup();
  for (let i = 0; i < 5; i++) add(make("burn", { memo: BOB_Z }));
  await pass();
  const gets = rpc.calls.get;
  rpc.unknownSignatures.add(store.getCursor(`solana:${MINT}`)!);
  add(make("burn"));
  await pass();
  assert.equal(rpc.calls.get - gets, 1, "only the one new tx is fetched, not all six again");
});
