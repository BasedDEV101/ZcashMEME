import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLedger, type InscriptionRecord } from "../../src/core/ledger.ts";
import { evaluateBurn } from "../../src/core/validity.ts";
import { contentForBurn, encodeNftBytes, CONTENT_TYPE } from "../../src/core/nft.ts";
import type { BurnVerdict, ValidBurn } from "../../src/core/types.ts";
import { burnTx, CFG, ALICE_Z, BOB_Z, fakeSig } from "./fixtures.ts";

function validBurn(label: string, amount = 2_000_000_000_000n, memo = ALICE_Z, slot = 100): ValidBurn {
  const v = evaluateBurn(burnTx({ sig: fakeSig(label), amount, memo, slot }), CFG);
  assert.ok(v.ok);
  return v.burn;
}

let seq = 0;
function inscribe(burn: ValidBurn, over: Partial<InscriptionRecord> = {}, content?: Uint8Array): InscriptionRecord {
  seq++;
  return {
    id: `tx${seq}i0`, txid: `tx${seq}`, height: 1000 + seq, txIndex: 1, index: 0,
    contentType: CONTENT_TYPE,
    content: content ?? encodeNftBytes(contentForBurn(burn, CFG)),
    firstOwner: burn.zcashAddress,
    ...over,
  };
}

const verdicts = (...bs: ValidBurn[]) =>
  new Map<string, BurnVerdict>(bs.map((b) => [b.signature, { ok: true, burn: b }]));

test("one burn, one inscription -> NFT #1, nothing unclaimed", () => {
  const b = validBurn("a");
  const l = buildLedger([inscribe(b)], verdicts(b), CFG);
  assert.equal(l.nfts.length, 1);
  assert.equal(l.nfts[0].number, 1);
  assert.equal(l.unclaimed.length, 0);
});

test("a burn with no inscription yet is in the minter's queue", () => {
  const b = validBurn("queued");
  const l = buildLedger([], verdicts(b), CFG);
  assert.deepEqual(l.unclaimed.map((u) => u.signature), [b.signature]);
});

test("second inscription citing the same burn is rejected; earliest in chain order wins", () => {
  const b = validBurn("dup");
  const late = inscribe(b, { height: 5000 });
  const early = inscribe(b, { height: 4000 });
  const l = buildLedger([late, early], verdicts(b), CFG); // deliberately passed out of order
  assert.equal(l.nfts.length, 1);
  assert.equal(l.nfts[0].inscriptionId, early.id);
  assert.deepEqual(l.rejected, [{ inscriptionId: late.id, reason: "burn already claimed" }]);
});

test("tampered inscriptions are rejected with a specific reason", () => {
  const b = validBurn("t");
  const c = contentForBurn(b, CFG);
  const cases: [InscriptionRecord, string][] = [
    [inscribe(b, {}, encodeNftBytes({ ...c, amt: c.amt * 10n })), "amount does not match burn"],
    [inscribe(b, {}, encodeNftBytes({ ...c, to: BOB_Z })), "recipient does not match burn memo"],
    [inscribe(b, { firstOwner: BOB_Z }), "delivered to a different address"],
    [inscribe(b, { contentType: "text/plain" }), "wrong content type"],
    [inscribe(b, {}, new TextEncoder().encode("gm")), "not canonical protocol content"],
    [inscribe(b, {}, encodeNftBytes({ ...c, mint: "SomeOtherMint1111111111111111111111111111111" })), "different mint"],
  ];
  const l = buildLedger(cases.map(([i]) => i), verdicts(b), CFG);
  assert.equal(l.nfts.length, 0);
  assert.deepEqual(l.rejected.map((r) => r.reason), cases.map(([, r]) => r));
  assert.equal(l.unclaimed.length, 1, "the real burn is still owed an NFT");
});

test("a burn this verifier cannot see is UNRESOLVED, never invalid", () => {
  // "the burn does not exist" and "my RPC cannot see it" look identical
  // locally. Treating the second as the first would erase real NFTs whenever
  // history is pruned -- which happened for real against a live validator.
  const b = validBurn("pruned");
  const l = buildLedger([inscribe(b)], new Map(), CFG);
  assert.equal(l.nfts.length, 0);
  assert.equal(l.rejected.length, 0, "not rejected");
  assert.deepEqual(l.unresolved.map((u) => u.burn), [b.signature]);
});

test("an inscription citing an invalid burn is rejected with the burn's reason", () => {
  const b = validBurn("inv");
  const bad = new Map<string, BurnVerdict>([[b.signature, { ok: false, reason: "not finalized" }]]);
  const l = buildLedger([inscribe(b)], bad, CFG);
  assert.deepEqual(l.rejected.map((r) => r.reason), ["invalid burn: not finalized"]);
});

test("REPORT worked example: stolen minter key cannot inflate supply", () => {
  // 3 real burns. An attacker with the minter key inscribes 50 extra NFTs:
  // citing made-up signatures, re-citing real ones, and inflating amounts.
  const real = [validBurn("r1"), validBurn("r2"), validBurn("r3")];
  const honest = real.map((b) => inscribe(b));
  const forged: InscriptionRecord[] = [];
  for (let i = 0; i < 50; i++) {
    const target = real[i % 3];
    const c = contentForBurn(target, CFG);
    const kind = i % 3;
    if (kind === 0) forged.push(inscribe(target, {}, encodeNftBytes({ ...c, burn: fakeSig(`made-up-${i}`) })));
    if (kind === 1) forged.push(inscribe(target));                                    // re-cite a real burn
    if (kind === 2) forged.push(inscribe(target, {}, encodeNftBytes({ ...c, amt: c.amt * 1000n })));
  }
  const l = buildLedger([...honest, ...forged], verdicts(...real), CFG);
  assert.equal(l.nfts.length, 3, "supply stays exactly equal to real burns");
  assert.equal(l.rejected.length + l.unresolved.length, 50, "every forgery is kept out");
  assert.ok(l.unresolved.length > 0, "made-up burn signatures are unresolved, not proven invalid");
  const totalNft = l.nfts.reduce((s, n) => s + n.burn.amount, 0n);
  const totalBurned = real.reduce((s, b) => s + b.amount, 0n);
  assert.equal(totalNft, totalBurned, "NFT-represented amount equals burned amount");
});

test("numbers are assigned in chain order and are gap-free", () => {
  const bs = [validBurn("n1"), validBurn("n2"), validBurn("n3")];
  const ins = [inscribe(bs[0], { height: 30 }), inscribe(bs[1], { height: 10 }), inscribe(bs[2], { height: 20, txIndex: 0 })];
  const l = buildLedger(ins, verdicts(...bs), CFG);
  assert.deepEqual(l.nfts.map((n) => [n.number, n.height]), [[1, 10], [2, 20], [3, 30]]);
});
