// Launch one coin through the pad's own code path, for real, to prove it.
//
// Mirrors web/src/lib/createCoin.ts instruction for instruction: the pad as
// creator so the creator fee is routed natively, the ZEC quote, the launch fee
// and the register memo, compiled against the same lookup table.
//
// Simulates first and refuses to send if the simulation fails -- the mistake
// this exists to catch is a transaction that builds correctly and then does
// not work.
//
//   node --experimental-strip-types scripts/test-launch-zec.ts            # dry run
//   node --experimental-strip-types scripts/test-launch-zec.ts --confirm  # spends SOL

import {
  Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction,
  TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { PumpSdk } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import { readFileSync } from "node:fs";
import { solanaRpcUrl } from "../src/env.ts";

const OPERATOR = new PublicKey("26oK69pYx7R25ULts9hLYF2HpTnZ421jPYMPsds9GtYA");
const ZEC = new PublicKey("A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS");
const ZEC_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const LOOKUP = new PublicKey("3zEFdQiMCRF5ew9KuLkeT4XVnRSRJjv58HWv8LSxvzJP");
const FEE_LAMPORTS = 500_000_000;
const CREATOR_FEE_BPS = 200;

const NAME = process.env.COIN_NAME ?? "Zcash Test Stamp";
const SYMBOL = process.env.COIN_SYMBOL ?? "ZTEST";

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
const key = JSON.parse(readFileSync("keys/test-launcher.json", "utf8")) as { secretKeyBase58: string };
const launcher = Keypair.fromSecretKey(decodeBase58(key.secretKeyBase58));

const endpoints = [...solanaRpcUrl().split(",").map((u) => u.trim()), "https://solana-rpc.publicnode.com"];
const conn = new Connection(process.env.SETUP_RPC ?? endpoints[endpoints.length - 1], "confirmed");

const balance = await conn.getBalance(launcher.publicKey);
console.log(`launcher ${launcher.publicKey.toBase58()}  ${balance / 1e9} SOL`);

// The metadata the site would have written.
const uri = process.env.COIN_URI;
if (!uri) throw new Error("set COIN_URI to a metadata url (the site's /api/metadata returns one)");
console.log(`metadata ${uri}`);

const sdk = new PumpSdk();
const mint = Keypair.generate();
const create = await sdk.createV2Instruction({
  mint: mint.publicKey,
  name: NAME,
  symbol: SYMBOL,
  uri,
  creator: OPERATOR,
  user: launcher.publicKey,
  mayhemMode: false,
  creatorFeeBps: new BN(CREATOR_FEE_BPS),
  quoteMint: ZEC,
  quoteTokenProgram: ZEC_PROGRAM,
});
const fee = SystemProgram.transfer({
  fromPubkey: launcher.publicKey, toPubkey: OPERATOR, lamports: FEE_LAMPORTS,
});
const register = new TransactionInstruction({
  keys: [{ pubkey: launcher.publicKey, isSigner: true, isWritable: false }],
  programId: MEMO,
  data: Buffer.from(`zsam:deploy:1:${mint.publicKey.toBase58()}:${SYMBOL}:1000000`, "utf8"),
});

const table = (await conn.getAddressLookupTable(LOOKUP)).value;
if (!table) throw new Error("lookup table not found");
const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("finalized");
const msg = new TransactionMessage({
  payerKey: launcher.publicKey, recentBlockhash: blockhash,
  instructions: [create, fee, register],
}).compileToV0Message([table]);
const tx = new VersionedTransaction(msg);
tx.sign([launcher, mint]);

console.log(`mint     ${mint.publicKey.toBase58()}`);
console.log(`size     ${tx.serialize().length} bytes of 1232`);

const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
if (sim.value.err) {
  console.log("SIMULATION FAILED:", JSON.stringify(sim.value.err));
  for (const l of (sim.value.logs ?? []).slice(-8)) console.log("   ", l.slice(0, 150));
  throw new Error("refusing to send a transaction that does not simulate");
}
console.log("simulation OK");

if (!confirm) {
  console.log("\nDry run. Nothing sent. Re-run with --confirm to launch for real.");
  process.exit(0);
}

const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
console.log(`sent     ${sig}`);
await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
console.log(`\nlaunched ${SYMBOL}`);
console.log(`mint     ${mint.publicKey.toBase58()}`);
console.log(`tx       ${sig}`);
