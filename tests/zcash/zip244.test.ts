import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as secp from "@noble/secp256k1";
import { signatureHash, serializeV5, SIGHASH_ALL, V5_HEADER, VERSION_GROUP_ID_V5, type TxSkeleton } from "../../src/zcash/zip244.ts";
import { decodeEnvelope } from "../../src/zcash/inscription.ts";
import { hex, parseScript, unhex } from "../../src/zcash/script.ts";
import { derToCompact } from "../../src/zcash/der.ts";

// The real mainnet inscription reveal 4f7763af… (height 3,489,223) and the
// commit output it spends. Fetched from Blockchair; see docs/research.
const NU6_3_IRONWOOD = 0x37a5165b;
const prevout = JSON.parse(readFileSync("tests/zcash/fixtures/prevout-88a8da6b-0.json", "utf8"));
const scriptSig = unhex(readFileSync("tests/zcash/fixtures/reveal-4f7763af.scriptsig.hex", "utf8").trim());
const rawTx = unhex(readFileSync("tests/zcash/fixtures/reveal-4f7763af.raw.hex", "utf8").trim());

const tx: TxSkeleton = {
  consensusBranchId: NU6_3_IRONWOOD,
  lockTime: 0,
  expiryHeight: 3_489_262,
  inputs: [{ txid: prevout.txid, vout: prevout.vout, valueZat: BigInt(prevout.valueZat), scriptPubKey: unhex(prevout.scriptPubKey) }],
  outputs: [{ valueZat: 4000n, scriptPubKey: unhex("76a914521911dd5cc14fe051effa05335b76f3a758873488ac") }],
};

test("ZIP 244: a REAL on-chain signature verifies against our recomputed sighash", () => {
  // Pull the signature and pubkey straight out of the on-chain scriptSig.
  const items = parseScript(scriptSig)!;
  const sigWithType = items[items.length - 2].data!;
  assert.equal(sigWithType[sigWithType.length - 1], SIGHASH_ALL, "signed with SIGHASH_ALL");
  const der = sigWithType.subarray(0, sigWithType.length - 1);
  const pubkey = decodeEnvelope(scriptSig)!.pubkey!;

  const digest = signatureHash(tx, 0, SIGHASH_ALL);
  assert.equal(digest.length, 32);

  const sig = secp.Signature.fromBytes(derToCompact(der)!);
  assert.ok(
    secp.verify(sig, digest, pubkey, { lowS: false }),
    "if this fails, our ZIP 244 implementation does not match Zcash consensus",
  );
});

test("a tampered sighash does NOT verify (the test above is not vacuous)", () => {
  const items = parseScript(scriptSig)!;
  const sigWithType = items[items.length - 2].data!;
  const sig = secp.Signature.fromBytes(derToCompact(sigWithType.subarray(0, sigWithType.length - 1))!);
  const pubkey = decodeEnvelope(scriptSig)!.pubkey!;
  for (const wrong of [
    { ...tx, expiryHeight: tx.expiryHeight + 1 },
    { ...tx, consensusBranchId: 0x77190ad8 },                       // NU7's intended branch id
    { ...tx, outputs: [{ ...tx.outputs[0], valueZat: 4001n }] },
    { ...tx, inputs: [{ ...tx.inputs[0], valueZat: 24001n }] },
  ]) {
    assert.equal(secp.verify(sig, signatureHash(wrong, 0, SIGHASH_ALL), pubkey, { lowS: false }), false);
  }
});

test("ZIP 225: re-serialising the real transaction reproduces its exact bytes", () => {
  const ours = serializeV5(tx, [scriptSig]);
  assert.equal(hex(ours), hex(rawTx), "byte-identical to what is on chain");
  assert.equal(hex(ours.subarray(0, 4)), hex(new Uint8Array([0x05, 0x00, 0x00, 0x80])));
  void V5_HEADER; void VERSION_GROUP_ID_V5;
});
