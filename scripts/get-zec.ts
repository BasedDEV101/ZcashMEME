// Convert a little SOL into ZEC for inscription fees, via NEAR Intents.
//
// The operator has SOL but no ZEC. NEAR Intents pays out to Zcash TRANSPARENT
// addresses, which is exactly what the minter uses. Flow: get a quote, send
// SOL to the deposit address it returns, wait for ZEC to arrive at our t1.
//
// Guards: hard cap on how much SOL this may ever move, a dry run by default,
// and refundTo points back at our own Solana wallet so a failed swap returns
// the funds rather than stranding them.

import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { loadOrCreateKeypair } from "../src/solana/wallet.ts";
import { loadOrCreateKey } from "../src/zcash/keyfile.ts";
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";

const MAX_SOL = 0.06;                                    // hard ceiling
const SOL_TO_SWAP = Number(process.env.SWAP_SOL ?? 0.05);
const go = process.argv.includes("--yes");
if (SOL_TO_SWAP > MAX_SOL) throw new Error(`refusing to swap ${SOL_TO_SWAP} SOL, ceiling is ${MAX_SOL}`);

const conn = new Connection(process.env.SOLANA_MAINNET_RPC ?? "https://api.mainnet-beta.solana.com", "confirmed");
const { keypair: payer } = loadOrCreateKeypair("keys/solana-mainnet.json");
const { key: zkey } = loadOrCreateKey("keys/zcash-mainnet.hex");
const zaddr = zkey.address("main");
const lwd = new Lightwalletd("zec.rocks:443");

const balance = await conn.getBalance(payer.publicKey) / LAMPORTS_PER_SOL;
const before = (await lwd.utxos(zaddr)).reduce((s, u) => s + u.valueZat, 0n);
console.log(`payer ${payer.publicKey.toBase58()}: ${balance} SOL`);
console.log(`minter ${zaddr}: ${before} zat`);
if (balance < SOL_TO_SWAP + 0.01) {
  console.log(`\nNEED at least ${(SOL_TO_SWAP + 0.01).toFixed(3)} SOL at ${payer.publicKey.toBase58()}`);
  process.exit(1);
}

const body = {
  dry: !go,
  swapType: "EXACT_INPUT", slippageTolerance: 100,
  originAsset: "nep141:sol.omft.near", depositType: "ORIGIN_CHAIN",
  destinationAsset: "nep141:zec.omft.near",
  amount: String(Math.round(SOL_TO_SWAP * LAMPORTS_PER_SOL)),
  refundTo: payer.publicKey.toBase58(), refundType: "ORIGIN_CHAIN",
  recipient: zaddr, recipientType: "DESTINATION_CHAIN",
  deadline: new Date(Date.now() + 3600_000).toISOString(),
};
const res = await fetch("https://1click.chaindefuser.com/v0/quote", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const q = await res.json() as { quote?: Record<string, string>; depositAddress?: string; message?: string };
if (!q.quote) throw new Error(`quote failed: ${JSON.stringify(q).slice(0, 300)}`);
console.log(`quote: ${SOL_TO_SWAP} SOL -> ${q.quote.amountOutFormatted} ZEC (~${q.quote.timeEstimate}s)`);

const deposit = q.depositAddress ?? (q as unknown as { quote: { depositAddress?: string } }).quote.depositAddress;
if (!go) { console.log("\ndry run. re-run with --yes to send real SOL."); process.exit(0); }
if (!deposit) throw new Error("no deposit address returned");

console.log(`sending ${SOL_TO_SWAP} SOL to ${deposit}…`);
const tx = new Transaction().add(SystemProgram.transfer({
  fromPubkey: payer.publicKey, toPubkey: new PublicKey(deposit),
  lamports: Math.round(SOL_TO_SWAP * LAMPORTS_PER_SOL),
}));
const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: "finalized" });
console.log(`sent: ${sig}`);

console.log("waiting for ZEC…");
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 15_000));
  const now = (await lwd.utxos(zaddr)).reduce((s, u) => s + u.valueZat, 0n);
  if (now > before) { console.log(`ZEC arrived: ${now} zat (${Number(now) / 1e8} ZEC)`); break; }
  if (i % 4 === 3) console.log(`  still waiting (${(i + 1) * 15}s)…`);
}
lwd.close();
