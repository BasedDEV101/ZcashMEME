// Run one minting pass: inscribe every valid burn that has no NFT yet.
//   BRIDGE_CONFIG=config/localnet.json BRIDGE_DB=... node scripts/mint.ts
import { readFileSync } from "node:fs";
import { Store } from "../src/store/db.ts";
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";
import { loadOrCreateKey } from "../src/zcash/keyfile.ts";
import { mintPass, pendingBurns } from "../src/zcash/minter.ts";
import type { BridgeConfig } from "../src/core/types.ts";

const raw = JSON.parse(readFileSync(process.env.BRIDGE_CONFIG ?? "config/devnet.json", "utf8"));
const cfg: BridgeConfig = {
  solanaMint: raw.solanaMint, tokenProgramId: raw.tokenProgramId, decimals: raw.decimals,
  minBurnRaw: BigInt(raw.minBurnRaw), startSlot: Number(raw.startSlot ?? 0),
  zcashNetwork: raw.zcashNetwork, protocol: raw.protocol,
};
const store = new Store(process.env.BRIDGE_DB ?? `state-${raw.network}.db`);
const { key } = loadOrCreateKey(process.env.ZCASH_KEY ?? `keys/zcash-${cfg.zcashNetwork}net.hex`);
const lwd = new Lightwalletd(process.env.LIGHTWALLETD ?? (cfg.zcashNetwork === "test" ? "testnet.zec.rocks:443" : "zec.rocks:443"));

console.log(`minter ${key.address(cfg.zcashNetwork)} on ${cfg.zcashNetwork}net`);
console.log(`pending burns: ${pendingBurns(store).length}`);
const results = await mintPass({ key, lwd, cfg, log: (m) => console.log(`  ${m}`) }, store);
console.log(`minted ${results.length} inscription(s)`);
for (const r of results) console.log(`  ${r.inscription.inscriptionId}  cost ${r.inscription.totalCostZat} zat`);
lwd.close();
store.close();
