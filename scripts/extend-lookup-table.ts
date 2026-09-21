// Add addresses to the launch lookup table.
//
// Quoting coins in ZEC changes which accounts a launch names: the ZEC mint,
// its quote-control PDA, the pool's ZEC vault and the fee wallet are fixed
// for every launch but were not in the table, so the transaction came to 1220
// bytes of the 1232 allowed -- twelve bytes of headroom, which is not enough
// to ship. Each address added is 31 bytes back.
//
//   node --experimental-strip-types scripts/extend-lookup-table.ts            # dry run
//   node --experimental-strip-types scripts/extend-lookup-table.ts --confirm  # spends SOL
//
// The addresses come from web/alt-accounts.mjs, which derives them by building
// two launches and keeping what both have in common.

import { AddressLookupTableProgram, Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { solanaRpcUrl } from "../src/env.ts";
import { assertNotForbidden } from "../src/core/forbidden.ts";

const TABLE = new PublicKey("3zEFdQiMCRF5ew9KuLkeT4XVnRSRJjv58HWv8LSxvzJP");

/** Fixed for a ZEC-quoted launch and absent from the table. */
const ADD = [
  "G4kdEu9kKtM4WhoqJKLFwxiQAp85TbJvT2UBt3U96i8y",
  "26oK69pYx7R25ULts9hLYF2HpTnZ421jPYMPsds9GtYA",
  "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS",
  "6z6GDdfb2AjR9ZhJmAUQ5cipJCVxQvLJhB2H8mCwTFBP",
].map((a) => new PublicKey(a));

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const v = B58.indexOf(c);
    if (v < 0) throw new Error("not base58");
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

const confirm = process.argv.includes("--confirm");
const keyfile = JSON.parse(readFileSync("keys/operator-solana.json", "utf8")) as { secretKeyBase58: string };
const operator = Keypair.fromSecretKey(decodeBase58(keyfile.secretKeyBase58));
assertNotForbidden(operator.publicKey.toBase58(), "extending the lookup table");

// Falls back to the public endpoint: the paid keys are shared with the live
// site and answer 429 under load, and a one-off setup script should not
// compete with it.
const endpoints = [...solanaRpcUrl().split(",").map((u) => u.trim()), "https://solana-rpc.publicnode.com"];
const conn = new Connection(process.env.SETUP_RPC ?? endpoints[endpoints.length - 1], "confirmed");
const existing = await conn.getAddressLookupTable(TABLE);
if (!existing.value) throw new Error(`lookup table ${TABLE.toBase58()} not found`);

const have = new Set(existing.value.state.addresses.map((a) => a.toBase58()));
const missing = ADD.filter((a) => !have.has(a.toBase58()));
console.log(`table ${TABLE.toBase58()}`);
console.log(`holds ${have.size} addresses; ${missing.length} of ${ADD.length} to add`);
for (const a of missing) console.log("  +", a.toBase58());

if (missing.length === 0) { console.log("Nothing to do."); process.exit(0); }
const rent = await conn.getMinimumBalanceForRentExemption(32 * missing.length);
console.log(`rent  ~${rent / 1e9} SOL, plus network fees`);
if (!confirm) { console.log("\nDry run. Nothing sent. Re-run with --confirm."); process.exit(0); }

const tx = new Transaction().add(AddressLookupTableProgram.extendLookupTable({
  payer: operator.publicKey, authority: operator.publicKey, lookupTable: TABLE, addresses: missing,
}));
const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("finalized");
tx.recentBlockhash = blockhash;
tx.feePayer = operator.publicKey;
tx.sign(operator);
const sig = await conn.sendRawTransaction(tx.serialize());
await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
console.log(`extended: ${sig}`);
console.log("Usable one slot after this confirmation.");
