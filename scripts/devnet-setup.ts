// Create a devnet token that behaves like a pump.fun mint: 6 decimals,
// 1,000,000,000 supply, mint authority revoked, no freeze authority.
// Writes config/devnet.json. Devnet only -- never touches mainnet.

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { loadOrCreateKeypair } from "../src/solana/wallet.ts";

const RPC = process.env.SOLANA_DEVNET_RPC ?? "https://api.devnet.solana.com";
const DECIMALS = 6;
const SUPPLY = 1_000_000_000n;

const conn = new Connection(RPC, "confirmed");
const { keypair: payer, created } = loadOrCreateKeypair("keys/devnet-payer.json");
console.log(`payer ${payer.publicKey.toBase58()}${created ? " (new)" : ""}`);

let balance = await conn.getBalance(payer.publicKey);
console.log(`balance ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
if (balance < 0.5 * LAMPORTS_PER_SOL) {
  console.log("requesting devnet airdrop…");
  try {
    const sig = await conn.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    balance = await conn.getBalance(payer.publicKey);
    console.log(`balance now ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  } catch (e) {
    console.error(`airdrop failed: ${(e as Error).message}`);
    console.error(`fund manually: https://faucet.solana.com/ -> ${payer.publicKey.toBase58()} (devnet)`);
    if (balance === 0) process.exit(1);
  }
}

if (existsSync("config/devnet.json")) {
  console.log("config/devnet.json exists:", readFileSync("config/devnet.json", "utf8").trim());
  process.exit(0);
}

console.log("creating mint…");
const mint = await createMint(conn, payer, payer.publicKey, null, DECIMALS, undefined, undefined, TOKEN_PROGRAM_ID);
const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
await mintTo(conn, payer, mint, ata.address, payer, SUPPLY * 10n ** BigInt(DECIMALS));
console.log("revoking mint authority (like pump.fun after launch)…");
await setAuthority(conn, payer, mint, payer, AuthorityType.MintTokens, null);

const cfg = {
  network: "devnet",
  rpc: RPC,
  solanaMint: mint.toBase58(),
  tokenProgramId: TOKEN_PROGRAM_ID.toBase58(),
  decimals: DECIMALS,
  supply: SUPPLY.toString(),
  minBurnRaw: (1_000_000n * 10n ** BigInt(DECIMALS)).toString(),
  zcashNetwork: "test",
  protocol: "zsam",
  holderAta: ata.address.toBase58(),
};
writeFileSync("config/devnet.json", JSON.stringify(cfg, null, 2) + "\n");
console.log("wrote config/devnet.json:", cfg.solanaMint);
void Keypair; void PublicKey;
