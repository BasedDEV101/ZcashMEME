// Request testnet TAZ from the jinolabs faucet.
//
// The faucet gates drips with hashcash proof-of-work rather than a captcha:
// find a nonce where sha256("<seed>:<nonce>") has `difficulty` leading zero
// bits, then post it with the claim. Testnet only, one request, within the
// faucet's own published limits (0.1 TAZ per address per 24h).

import { createHash } from "node:crypto";
import { loadOrCreateKey } from "../src/zcash/wallet.ts";

const BASE = process.env.FAUCET ?? "https://zcashfaucet.jinolabs.xyz";
const { key } = loadOrCreateKey(process.env.ZCASH_KEY ?? "keys/zcash-testnet.hex");
const address = key.address("test");
console.log(`requesting TAZ for ${address}`);

const status = await (await fetch(`${BASE}/api/status`)).json() as Record<string, unknown>;
console.log(`faucet: ${status.dripTaz} TAZ per ${status.cooldownSeconds}s, balance ${status.balanceTaz} TAZ, challenge=${status.challenge}`);

const ch = await (await fetch(`${BASE}/api/pow/challenge`)).json() as { ok: boolean; seed: string; difficulty: number; exp: number; sig: string };
if (!ch.ok) throw new Error(`challenge refused: ${JSON.stringify(ch)}`);
console.log(`solving proof of work: difficulty ${ch.difficulty} bits`);

function leadingZeroBits(buf: Buffer): number {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) { bits += 8; continue; }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

const started = Date.now();
let nonce = 0;
for (;;) {
  const digest = createHash("sha256").update(`${ch.seed}:${nonce}`).digest();
  if (leadingZeroBits(digest) >= ch.difficulty) break;
  nonce++;
}
console.log(`solved: nonce ${nonce} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

const res = await fetch(`${BASE}/api/faucet`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address, pow: { seed: ch.seed, difficulty: ch.difficulty, exp: ch.exp, sig: ch.sig, nonce: String(nonce) } }),
});
const body = await res.text();
console.log(`faucet responded ${res.status}: ${body.slice(0, 400)}`);
