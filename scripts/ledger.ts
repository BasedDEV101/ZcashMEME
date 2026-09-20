// Rebuild and print the NFT ledger from chain data (SPEC §4).
import { solanaRpcUrl } from "../src/env.ts";
import { readFileSync } from "node:fs";
import { Store } from "../src/store/db.ts";
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";
import { indexPass } from "../src/zcash/indexer.ts";
import { SolanaRpc } from "../src/solana/rpc.ts";
import { normalizeTransaction } from "../src/solana/normalize.ts";
import { evaluateBurn } from "../src/core/validity.ts";
import type { BridgeConfig } from "../src/core/types.ts";

const raw = JSON.parse(readFileSync(process.env.BRIDGE_CONFIG ?? "config/devnet.json", "utf8"));
const cfg: BridgeConfig = {
  solanaMint: raw.solanaMint, tokenProgramId: raw.tokenProgramId, decimals: raw.decimals,
  minBurnRaw: BigInt(raw.minBurnRaw), startSlot: Number(raw.startSlot ?? 0),
  zcashNetwork: raw.zcashNetwork, protocol: raw.protocol,
};
const store = new Store(process.env.BRIDGE_DB ?? `state-${raw.network}.db`);
const lwd = new Lightwalletd(process.env.LIGHTWALLETD ?? (cfg.zcashNetwork === "test" ? "testnet.zec.rocks:443" : "zec.rocks:443"));

// A burn an inscription cites but the watcher never listed (history pruned,
// or a different RPC) is fetched directly rather than assumed non-existent.
const rpc = new SolanaRpc(process.env.SOLANA_RPC ?? solanaRpcUrl());
const resolve = async (signature: string) => {
  const tx = await rpc.getTransaction(signature, "finalized");
  if (!tx) throw new Error("not found by this RPC");
  const n = normalizeTransaction(tx, { finalized: true });
  store.recordVerdict(n.signature, n.slot, n.blockTime, evaluateBurn(n, cfg));
};

const ledger = await indexPass(lwd, store, cfg, (m) => console.log(`  ${m}`), resolve);
const dec = 10n ** BigInt(cfg.decimals);

console.log(`\nNFTs (${ledger.nfts.length}):`);
for (const n of ledger.nfts) {
  console.log(`  #${n.number}  ${n.burn.amount / dec} tokens  -> ${n.burn.zcashAddress}`);
  console.log(`        inscription ${n.inscriptionId}`);
  console.log(`        burn        ${n.burn.signature}`);
}
if (ledger.unresolved.length) {
  console.log(`\nUnresolved (${ledger.unresolved.length}) -- cited burn not visible to this RPC, NOT invalid:`);
  for (const u of ledger.unresolved) console.log(`  ${u.inscriptionId}: cites ${u.burn.slice(0, 16)}…`);
}
if (ledger.rejected.length) {
  console.log(`\nRejected (${ledger.rejected.length}):`);
  for (const r of ledger.rejected) console.log(`  ${r.inscriptionId}: ${r.reason}`);
}
console.log(`\nUnclaimed burns (owed an NFT): ${ledger.unclaimed.length}`);
for (const u of ledger.unclaimed) console.log(`  ${u.signature.slice(0, 16)}…  ${u.amount / dec} tokens -> ${u.zcashAddress}`);

const minted = ledger.nfts.reduce((s, n) => s + n.burn.amount, 0n);
const burned = store.validBurns().reduce((s, b) => s + b.amount, 0n);
console.log(`\nSupply invariant (SPEC 4.3):`);
console.log(`  represented by NFTs : ${minted / dec} tokens`);
console.log(`  validly burned      : ${burned / dec} tokens`);
console.log(`  ${minted <= burned ? "OK" : "VIOLATED"}: NFT-represented <= burned`);
lwd.close();
store.close();
