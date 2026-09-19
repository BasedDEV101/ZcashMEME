// Create a devnet token that behaves like a pump.fun mint: 6 decimals,
// 1,000,000,000 supply, mint authority revoked, no freeze authority.
// Writes config/devnet.json. Devnet only -- never touches mainnet.

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { loadOrCreateKeypair } from "../src/solana/wallet.ts";

const RPC = process.env.SOLANA_RPC_URL ?? process.env.SOLANA_DEVNET_RPC ?? "https://api.devnet.solana.com";
const CONFIG_PATH = process.env.BRIDGE_CONFIG ?? "config/devnet.json";
const DECIMALS = 6;
const SUPPLY = 1_000_000_000n;

const conn = new Connection(RPC, "confirmed");
const { keypair: payer, created } = loadOrCreateKeypair(process.env.PAYER_KEY ?? "keys/devnet-payer.json");
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

if (existsSync(CONFIG_PATH)) {
  console.log("config/devnet.json exists:", readFileSync(CONFIG_PATH, "utf8").trim());
  process.exit(0);
}

console.log("creating mint…");
const mint = await createMint(conn, payer, payer.publicKey, null, DECIMALS, undefined, undefined, TOKEN_2022_PROGRAM_ID);
const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID);
await mintTo(conn, payer, mint, ata.address, payer, SUPPLY * 10n ** BigInt(DECIMALS), [], undefined, TOKEN_2022_PROGRAM_ID);
console.log("revoking mint authority (like pump.fun after launch)…");
await setAuthority(conn, payer, mint, payer, AuthorityType.MintTokens, null, [], undefined, TOKEN_2022_PROGRAM_ID);

const cfg = {
  network: process.env.NETWORK_LABEL ?? "devnet",
  rpc: RPC,
  solanaMint: mint.toBase58(),
  tokenProgramId: TOKEN_2022_PROGRAM_ID.toBase58(),
  decimals: DECIMALS,
  supply: SUPPLY.toString(),
  minBurnRaw: (1_000_000n * 10n ** BigInt(DECIMALS)).toString(),
  startSlot: 0,
  zcashNetwork: "test",
  protocol: "zsam",
  holderAta: ata.address.toBase58(),
};
writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
console.log(`wrote ${CONFIG_PATH}:`, cfg.solanaMint);
void Keypair; void PublicKey;
