// Rebuild and print the NFT ledger from chain data (SPEC §4).
import { readFileSync } from "node:fs";
import { Store } from "../src/store/db.ts";
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";
import { indexPass } from "../src/zcash/indexer.ts";
import type { BridgeConfig } from "../src/core/types.ts";

const raw = JSON.parse(readFileSync(process.env.BRIDGE_CONFIG ?? "config/devnet.json", "utf8"));
const cfg: BridgeConfig = {
  solanaMint: raw.solanaMint, tokenProgramId: raw.tokenProgramId, decimals: raw.decimals,
  minBurnRaw: BigInt(raw.minBurnRaw), startSlot: Number(raw.startSlot ?? 0),
  zcashNetwork: raw.zcashNetwork, protocol: raw.protocol,
};
const store = new Store(process.env.BRIDGE_DB ?? `state-${raw.network}.db`);
const lwd = new Lightwalletd(process.env.LIGHTWALLETD ?? (cfg.zcashNetwork === "test" ? "testnet.zec.rocks:443" : "zec.rocks:443"));

const ledger = await indexPass(lwd, store, cfg, (m) => console.log(`  ${m}`));
const dec = 10n ** BigInt(cfg.decimals);

console.log(`\nNFTs (${ledger.nfts.length}):`);
for (const n of ledger.nfts) {
  console.log(`  #${n.number}  ${n.burn.amount / dec} tokens  -> ${n.burn.zcashAddress}`);
  console.log(`        inscription ${n.inscriptionId}`);
  console.log(`        burn        ${n.burn.signature}`);
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
