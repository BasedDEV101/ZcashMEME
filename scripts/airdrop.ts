// Devnet airdrop helper. Devnet only; the public faucet is frequently rate-limited.
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadOrCreateKeypair } from "../src/solana/wallet.ts";

const { keypair } = loadOrCreateKeypair("keys/devnet-payer.json");
const pk = keypair.publicKey;
const endpoints = (process.env.SOLANA_DEVNET_RPC ?? "https://api.devnet.solana.com").split(",");
console.log("payer:", pk.toBase58());
for (const url of endpoints) {
  for (const sol of [1, 0.5, 2]) {
    try {
      const c = new Connection(url, "confirmed");
      const sig = await c.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
      await c.confirmTransaction(sig, "confirmed");
      console.log(`OK ${sol} SOL sig=${sig.slice(0, 16)}… balance=${(await c.getBalance(pk)) / LAMPORTS_PER_SOL}`);
      process.exit(0);
    } catch (e) {
      console.log(`fail ${sol} SOL: ${(e as Error).message.slice(0, 100)}`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}
console.log(`\nAll airdrops failed. Fund manually at https://faucet.solana.com/ (devnet):\n  ${pk.toBase58()}`);
process.exit(1);
