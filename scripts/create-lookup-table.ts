// Create the address lookup table every launch transaction uses.
//
// A launch touches 18 accounts that are the same whoever launches and
// whatever the mint is: the pump programs and their PDAs, the token and memo
// programs, WSOL, and the operator address. Spelled out in full they cost 32
// bytes each, which is what pushed the one-signature launch to 1422 bytes
// against Solana's 1232-byte limit. Referenced through a lookup table they
// cost one byte each, saving about 520 bytes net and leaving the launch
// comfortably inside one transaction -- one wallet prompt instead of two.
//
// Run once. The table is reused by every launch afterwards and costs nothing
// further. The addresses come from scripts/../web/alt-accounts.mjs, which
// derives them by building two launches and keeping what both have in common,
// rather than by listing them from memory.
//
//   node --experimental-strip-types scripts/create-lookup-table.ts            # dry run
//   node --experimental-strip-types scripts/create-lookup-table.ts --confirm  # spends SOL
//
// Needs keys/operator-solana.json. Nothing is sent without --confirm.

import {
  AddressLookupTableProgram, Connection, Keypair, PublicKey,
  Transaction, TransactionInstruction,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { solanaRpcUrl } from "../src/env.ts";
import { assertNotForbidden } from "../src/core/forbidden.ts";

/** Accounts fixed across every launch. Order is irrelevant; membership is not. */
const FIXED = [
  "BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s",
  "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e",
  "11111111111111111111111111111111",
  "13ec7XdrjF3h3YcqBTFDSReRcUFwbCnJaAQspM4j6DDJ",
  "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",
  "mAQdwbg2EUGLgTfCV6Ts6S3PNFSiUW7pCwo1341p5FS",
  "D6QxXDt6hhcCpto4HiZKkN2YQ2iZRF5R7S3caCHpUsML",
  "GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR",
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ",
  "So11111111111111111111111111111111111111112",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
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

// The launch wallet is off limits for every operation, this one included.
assertNotForbidden(operator.publicKey.toBase58(), "creating the lookup table");

const conn = new Connection(solanaRpcUrl().split(",")[0].trim(), "confirmed");
const balance = await conn.getBalance(operator.publicKey);
console.log(`operator ${operator.publicKey.toBase58()}`);
console.log(`balance  ${balance / 1e9} SOL`);
console.log(`table    ${FIXED.length} addresses`);

const slot = await conn.getSlot("finalized");
const [createIx, table] = AddressLookupTableProgram.createLookupTable({
  authority: operator.publicKey,
  payer: operator.publicKey,
  recentSlot: slot,
});
const extendIx = AddressLookupTableProgram.extendLookupTable({
  payer: operator.publicKey,
  authority: operator.publicKey,
  lookupTable: table,
  addresses: FIXED,
});

const rent = await conn.getMinimumBalanceForRentExemption(56 + 32 * FIXED.length);
console.log(`address  ${table.toBase58()}`);
console.log(`rent     ~${rent / 1e9} SOL, plus network fees`);

if (!confirm) {
  console.log("\nDry run. Nothing sent. Re-run with --confirm to create it.");
  process.exit(0);
}
if (balance < rent + 10_000_000) {
  throw new Error(`operator holds ${balance / 1e9} SOL; needs about ${(rent + 10_000_000) / 1e9}`);
}

const send = async (label: string, ixs: TransactionInstruction[]) => {
  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("finalized");
  tx.recentBlockhash = blockhash;
  tx.feePayer = operator.publicKey;
  tx.sign(operator);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log(`${label}: ${sig}`);
};

// Two transactions, not one: the table must exist before it can be extended.
await send("created ", [createIx]);
await send("extended", [extendIx]);

console.log(`\nlookup table ready: ${table.toBase58()}`);
console.log("Put this in web/src/lib/launchpad.ts as LOOKUP_TABLE.");
console.log("It becomes usable one slot after this confirmation.");
