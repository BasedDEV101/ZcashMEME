import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { firstScriptSig } from "../../src/zcash/indexer.ts";
import { decodeEnvelope } from "../../src/zcash/inscription.ts";
import { hex, unhex } from "../../src/zcash/script.ts";
import { serializeV5, type TxSkeleton } from "../../src/zcash/zip244.ts";

const raw = unhex(readFileSync("tests/zcash/fixtures/reveal-4f7763af.raw.hex", "utf8").trim());
const scriptSigHex = readFileSync("tests/zcash/fixtures/reveal-4f7763af.scriptsig.hex", "utf8").trim();

test("extracts the scriptSig from a REAL mainnet transaction", () => {
  const ss = firstScriptSig(raw);
  assert.ok(ss);
  assert.equal(hex(ss), scriptSigHex);
  assert.ok(decodeEnvelope(ss), "and it decodes as an inscription");
});

test("handles a 3-byte varint length (scriptSig over 252 bytes)", () => {
  const big = new Uint8Array(400).fill(0x51);
  const tx: TxSkeleton = {
    consensusBranchId: 0x37a5165b, expiryHeight: 1,
    inputs: [{ txid: "aa".repeat(32), vout: 0, valueZat: 1000n, scriptPubKey: unhex("76a914" + "11".repeat(20) + "88ac") }],
    outputs: [{ valueZat: 546n, scriptPubKey: unhex("76a914" + "22".repeat(20) + "88ac") }],
  };
  const ss = firstScriptSig(serializeV5(tx, [big]));
  assert.ok(ss);
  assert.equal(ss.length, 400);
});

test("returns null on truncated or malformed input rather than guessing", () => {
  assert.equal(firstScriptSig(new Uint8Array(10)), null);
  assert.equal(firstScriptSig(raw.subarray(0, 30)), null);
  assert.equal(firstScriptSig(new Uint8Array(0)), null);
});
