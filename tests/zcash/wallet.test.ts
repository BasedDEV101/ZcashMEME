import { test } from "node:test";
import assert from "node:assert/strict";
import * as secp from "@noble/secp256k1";
import { TransparentKey, addressFromHash, hash160, p2pkhScript, p2shScript } from "../../src/zcash/wallet.ts";
import { parseTransparentAddress } from "../../src/core/zcash-address.ts";
import { derToCompact, compactToDer } from "../../src/zcash/der.ts";
import { hex, unhex } from "../../src/zcash/script.ts";
import { txid, signatureHash, type TxSkeleton } from "../../src/zcash/zip244.ts";
import { readFileSync } from "node:fs";

test("hash160 matches a known Bitcoin/Zcash test vector", () => {
  // hash160 of the secp256k1 generator point (well-known value).
  const g = unhex("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798");
  assert.equal(hex(hash160(g)), "751e76e8199196d454941c45d1b3a323f1433bd6");
});

test("addresses derive to the right network and round-trip through the parser", () => {
  const key = new TransparentKey(unhex("11".repeat(32)));
  for (const network of ["main", "test"] as const) {
    const addr = key.address(network);
    const parsed = parseTransparentAddress(addr);
    assert.ok(parsed, addr);
    assert.equal(parsed.network, network);
    assert.equal(parsed.kind, "p2pkh");
    assert.deepEqual(parsed.hash, key.hash160);
    assert.ok(addr.startsWith(network === "main" ? "t1" : "tm"));
  }
  const p2sh = addressFromHash(key.hash160, "test", "p2sh");
  assert.equal(parseTransparentAddress(p2sh)?.kind, "p2sh");
});

test("scriptPubKey shapes", () => {
  const h = unhex("751e76e8199196d454941c45d1b3a323f1433bd6");
  assert.equal(hex(p2pkhScript(h)), "76a914751e76e8199196d454941c45d1b3a323f1433bd688ac");
  assert.equal(hex(p2shScript(h)), "a914751e76e8199196d454941c45d1b3a323f1433bd687");
});

test("signatures are DER, low-S, and verify", () => {
  const key = TransparentKey.generate();
  const digest = new Uint8Array(32).fill(3);
  const sig = key.signDigest(digest);
  assert.equal(sig[sig.length - 1], 0x01, "sighash type appended");
  const der = sig.subarray(0, sig.length - 1);
  assert.equal(der[0], 0x30);
  const compact = derToCompact(der);
  assert.ok(compact);
  assert.ok(secp.verify(secp.Signature.fromBytes(compact), digest, key.publicKey));
  assert.equal(secp.Signature.fromBytes(compact).hasHighS(), false, "high-S is non-standard");
  assert.deepEqual(compactToDer(compact), der, "DER round-trips");
});

test("txid of the REAL mainnet reveal matches the explorer", () => {
  const prevout = JSON.parse(readFileSync("tests/zcash/fixtures/prevout-88a8da6b-0.json", "utf8"));
  const tx: TxSkeleton = {
    consensusBranchId: 0x37a5165b,
    lockTime: 0,
    expiryHeight: 3_489_262,
    inputs: [{ txid: prevout.txid, vout: prevout.vout, valueZat: BigInt(prevout.valueZat), scriptPubKey: unhex(prevout.scriptPubKey) }],
    outputs: [{ valueZat: 4000n, scriptPubKey: unhex("76a914521911dd5cc14fe051effa05335b76f3a758873488ac") }],
  };
  assert.equal(txid(tx), "4f7763afbd1d3f5092ec5519bf390b41d50282a2421901d8ed9b3b7c94fab2c3");
  // The txid does not cover scriptSigs, which is why the envelope commits to its own content.
  assert.notEqual(hex(signatureHash(tx, 0)), "");
});
