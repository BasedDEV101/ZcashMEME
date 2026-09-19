import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assemble, buildEnvelopePrefix, buildRedeemScript, chunk, commitment, decodeEnvelope, MAX_CONTENT_BYTES, PIECE_SIZE } from "../../src/zcash/inscription.ts";
import { concat, hex, pushData, unhex, OP_1, OP_CHECKSIGVERIFY, OP_DROP } from "../../src/zcash/script.ts";
import { contentForBurn, encodeNftBytes, CONTENT_TYPE } from "../../src/core/nft.ts";
import { CFG, ALICE_Z, fakeSig } from "../core/fixtures.ts";

const PUBKEY = unhex("02" + "11".repeat(32));

test("decodes a REAL mainnet inscription (4f7763af…, height 3,489,223)", () => {
  const scriptSig = unhex(readFileSync("tests/zcash/fixtures/reveal-4f7763af.scriptsig.hex", "utf8").trim());
  assert.equal(scriptSig.length, 198, "the on-chain scriptSig is 198 bytes");
  const env = decodeEnvelope(scriptSig);
  assert.ok(env, "our decoder must read what is actually on chain");
  assert.equal(env.contentType, "application/json");
  assert.equal(env.totalPieces, 1);
  assert.equal(env.pieces.length, 1);
  assert.equal(env.pieces[0].index, 0);
  const content = new TextDecoder().decode(assemble(env.pieces));
  assert.equal(content.length, 59);
  const parsed = JSON.parse(content);
  assert.equal(parsed.p, "zrc-20");
  assert.equal(parsed.op, "transfer");
  assert.equal(env.commitment, null, "this legacy inscription has no v1 commitment");
  assert.equal(env.pubkey?.length, 33);
});

test("our NFT content round-trips through the envelope", () => {
  const burn = { signature: fakeSig("z"), slot: 1, blockTime: null, authority: "A", amount: 7_350_000_000_000n, zcashAddress: ALICE_Z };
  const content = encodeNftBytes(contentForBurn(burn, CFG));
  const pieces = chunk(content);
  const prefix = buildEnvelopePrefix(CONTENT_TYPE, pieces.length, pieces);
  const redeem = buildRedeemScript(PUBKEY, pieces.length, commitment(CONTENT_TYPE, content));
  const scriptSig = concat(prefix, pushData(new Uint8Array(72)), pushData(redeem));
  const env = decodeEnvelope(scriptSig);
  assert.ok(env);
  assert.equal(env.contentType, CONTENT_TYPE);
  assert.deepEqual(assemble(env.pieces), content);
  assert.deepEqual(env.commitment, commitment(CONTENT_TYPE, content));
  assert.ok(scriptSig.length < 1650, `scriptSig is ${scriptSig.length} bytes`);
});

test("pieces are 240 bytes and indexed descending, index 0 last", () => {
  const content = Uint8Array.from({ length: 500 }, (_, i) => i % 251);
  const pieces = chunk(content);
  assert.deepEqual(pieces.map((p) => p.index), [2, 1, 0]);
  assert.deepEqual(pieces.map((p) => p.data.length), [PIECE_SIZE, PIECE_SIZE, 20]);
  assert.deepEqual(assemble(pieces), content);
});

test("the v1 commitment covers content type and content", () => {
  const c = new TextEncoder().encode("hello");
  const base = commitment("application/json", c);
  assert.equal(base.length, 32);
  assert.notDeepEqual(base, commitment("text/plain", c));
  assert.notDeepEqual(base, commitment("application/json", new TextEncoder().encode("hellp")));
  assert.deepEqual(base, commitment("application/json", c), "deterministic");
});

test("redeem script shape: legacy vs v1, drops = 3 + 2*pieces (+1 for the commitment)", () => {
  const legacy = buildRedeemScript(PUBKEY, 1, null);
  assert.equal(legacy.length, 41, "matches the 41-byte redeem script seen on chain");
  assert.equal(legacy[0], 0x21);
  assert.equal(legacy[34], OP_CHECKSIGVERIFY);
  assert.equal(hex(legacy.subarray(35, 40)), "7575757575", "5 drops for 1 piece");
  assert.equal(legacy[40], OP_1);

  const v1 = buildRedeemScript(PUBKEY, 1, new Uint8Array(32));
  assert.equal(v1.length, 41 + 34, "adds a 32-byte push plus its OP_DROP");
  assert.equal(v1.filter((b) => b === OP_DROP).length, 6);
  assert.equal(buildRedeemScript(PUBKEY, 4, null).filter((b) => b === OP_DROP).length, 11);
});

test("rejects content that cannot be inscribed", () => {
  assert.throws(() => chunk(new Uint8Array(0)), /empty/);
  assert.throws(() => chunk(new Uint8Array(MAX_CONTENT_BYTES + 1)), /exceeds/);
  assert.throws(() => buildEnvelopePrefix("nope", 1, [{ index: 0, data: new Uint8Array(1) }]), /'\/'/);
  assert.throws(() => buildEnvelopePrefix("ab/", 1, []), /1-4 pieces/);
});

test("non-inscription scripts decode to null", () => {
  assert.equal(decodeEnvelope(unhex("76a914" + "00".repeat(20) + "88ac")), null);
  assert.equal(decodeEnvelope(new Uint8Array(0)), null);
  assert.equal(decodeEnvelope(unhex("03" + Buffer.from("xrd").toString("hex") + "51")), null);
});
