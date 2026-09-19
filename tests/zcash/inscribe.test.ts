import { test } from "node:test";
import assert from "node:assert/strict";
import * as secp from "@noble/secp256k1";
import { buildInscription, type Utxo } from "../../src/zcash/inscribe.ts";
import { decodeEnvelope, assemble, commitment, DUST_ZAT } from "../../src/zcash/inscription.ts";
import { signatureHash, serializeV5 } from "../../src/zcash/zip244.ts";
import { TransparentKey, hash160, p2shScript } from "../../src/zcash/wallet.ts";
import { derToCompact } from "../../src/zcash/der.ts";
import { hex, parseScript, unhex } from "../../src/zcash/script.ts";
import { conventionalFee, inputSize, outputSize, MARGINAL_FEE_BEFORE } from "../../src/zcash/fees.ts";
import { contentForBurn, encodeNftBytes, CONTENT_TYPE } from "../../src/core/nft.ts";
import { CFG, ALICE_Z, fakeSig } from "../core/fixtures.ts";

const IRONWOOD = 0x37a5165b;
const key = new TransparentKey(unhex("42".repeat(32)));
const burn = { signature: fakeSig("inscribe"), slot: 10, blockTime: null, authority: "A", amount: 7_350_000_000_000n, zcashAddress: ALICE_Z };
const content = encodeNftBytes(contentForBurn(burn, CFG));

const utxo = (valueZat: bigint, n = 0): Utxo => ({ txid: "aa".repeat(32), vout: n, valueZat, scriptPubKey: key.scriptPubKey() });

const build = (utxos: Utxo[] = [utxo(1_000_000n)]) => buildInscription({
  key, utxos, content, contentType: CONTENT_TYPE, recipient: ALICE_Z,
  network: "test", consensusBranchId: IRONWOOD, chainHeight: 4_368_528,
});

test("the reveal carries exactly our NFT content, readable by any indexer", () => {
  const ins = build();
  const env = decodeEnvelope(ins.reveal.scriptSigs[0]);
  assert.ok(env);
  assert.equal(env.contentType, CONTENT_TYPE);
  assert.deepEqual(assemble(env.pieces), content);
  assert.deepEqual(env.commitment, commitment(CONTENT_TYPE, content));
  assert.equal(ins.inscriptionId, `${ins.reveal.txid}i0`);
});

test("the reveal's signature verifies against its own ZIP 244 sighash", () => {
  // Same code path that was proved correct against a real mainnet signature.
  const ins = build();
  const items = parseScript(ins.reveal.scriptSigs[0])!;
  const sigWithType = items[items.length - 2].data!;
  const compact = derToCompact(sigWithType.subarray(0, sigWithType.length - 1))!;
  const digest = signatureHash(ins.reveal.skeleton, 0);
  assert.ok(secp.verify(secp.Signature.fromBytes(compact), digest, key.publicKey));
});

test("every commit input is correctly signed", () => {
  const ins = build([utxo(400_000n, 0), utxo(400_000n, 1), utxo(400_000n, 2)]);
  assert.ok(ins.commit.skeleton.inputs.length >= 1);
  ins.commit.scriptSigs.forEach((ss, i) => {
    const items = parseScript(ss)!;
    const sigWithType = items[0].data!;
    const compact = derToCompact(sigWithType.subarray(0, sigWithType.length - 1))!;
    assert.ok(secp.verify(secp.Signature.fromBytes(compact), signatureHash(ins.commit.skeleton, i), key.publicKey), `input ${i}`);
    assert.deepEqual(items[1].data, key.publicKey);
  });
});

test("the reveal spends exactly the commit's P2SH output", () => {
  const ins = build();
  assert.equal(ins.reveal.skeleton.inputs[0].txid, ins.commit.txid);
  assert.equal(ins.reveal.skeleton.inputs[0].vout, 0);
  const redeem = parseScript(ins.reveal.scriptSigs[0])!.at(-1)!.data!;
  assert.deepEqual(ins.commit.skeleton.outputs[0].scriptPubKey, p2shScript(hash160(redeem)),
    "commit pays the hash of the very redeem script the reveal presents");
  assert.equal(ins.reveal.skeleton.inputs[0].valueZat, ins.commit.skeleton.outputs[0].valueZat);
});

test("money is conserved and the recipient gets the postage", () => {
  const ins = build([utxo(1_000_000n)]);
  const inTotal = 1_000_000n;
  const commitOut = ins.commit.skeleton.outputs.reduce((s, o) => s + o.valueZat, 0n);
  assert.equal(inTotal - commitOut, ins.commit.feeZat, "commit fee is inputs minus outputs");
  assert.equal(ins.reveal.skeleton.outputs[0].valueZat, DUST_ZAT);
  assert.equal(ins.reveal.skeleton.inputs[0].valueZat - ins.reveal.skeleton.outputs[0].valueZat, ins.reveal.feeZat);
  assert.equal(ins.totalCostZat, ins.commit.feeZat + ins.reveal.feeZat + DUST_ZAT);
  assert.equal(ins.changeZat, inTotal - ins.totalCostZat);
});

test("ZIP 317 fees match a hand calculation", () => {
  const ins = build();
  const revealScriptSigLen = ins.reveal.scriptSigs[0].length;
  const expected = conventionalFee(inputSize(revealScriptSigLen), outputSize(25), MARGINAL_FEE_BEFORE);
  // the builder sizes with a 72-byte signature; real ones may be 70-71
  assert.ok(ins.reveal.feeZat >= expected, `reveal fee ${ins.reveal.feeZat} >= ${expected}`);
  assert.ok(ins.reveal.feeZat <= expected + MARGINAL_FEE_BEFORE, "and never wildly over");
  assert.ok(ins.totalCostZat < 40_000n, `total ${ins.totalCostZat} zat`);
});

test("raw transactions serialise and the scriptSig stays within envelope limits", () => {
  const ins = build();
  assert.deepEqual(ins.reveal.raw, serializeV5(ins.reveal.skeleton, ins.reveal.scriptSigs));
  assert.ok(ins.reveal.scriptSigs[0].length < 1650);
  assert.equal(hex(ins.commit.raw.subarray(0, 4)), "05000080", "v5 header");
});

test("refuses bad recipients and insufficient funds", () => {
  assert.throws(() => buildInscription({ key, utxos: [utxo(1_000_000n)], content, contentType: CONTENT_TYPE, recipient: key.address("main"), network: "test", consensusBranchId: IRONWOOD, chainHeight: 1 }), /mainnet address/);
  assert.throws(() => buildInscription({ key, utxos: [utxo(1_000_000n)], content, contentType: CONTENT_TYPE, recipient: "not-an-address", network: "test", consensusBranchId: IRONWOOD, chainHeight: 1 }), /not a transparent address/);
  assert.throws(() => build([utxo(500n)]), /insufficient funds/);
});
