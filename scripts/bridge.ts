// Run the whole bridge: watch for burns, mint the NFTs, rebuild the ledger.
//   BRIDGE_CONFIG=config/devnet.json node scripts/bridge.ts [--once]
import { solanaRpcUrl } from "../src/env.ts";
import { readFileSync } from "node:fs";
import { Store } from "../src/store/db.ts";
import { SolanaRpc, readMint } from "../src/solana/rpc.ts";
import { watchPass } from "../src/solana/watcher.ts";
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";
import { loadOrCreateKey } from "../src/zcash/keyfile.ts";
import { mintPass } from "../src/zcash/minter.ts";
import { indexPass } from "../src/zcash/indexer.ts";
import { normalizeTransaction } from "../src/solana/normalize.ts";
import { evaluateBurn } from "../src/core/validity.ts";
import type { BridgeConfig } from "../src/core/types.ts";

const once = process.argv.includes("--once");
const raw = JSON.parse(readFileSync(process.env.BRIDGE_CONFIG ?? "config/devnet.json", "utf8"));
const cfg: BridgeConfig = {
  solanaMint: raw.solanaMint, tokenProgramId: raw.tokenProgramId, decimals: raw.decimals,
  minBurnRaw: BigInt(raw.minBurnRaw), startSlot: Number(raw.startSlot ?? 0),
  zcashNetwork: raw.zcashNetwork, protocol: raw.protocol,
};
const rpc = new SolanaRpc(process.env.SOLANA_RPC ?? solanaRpcUrl());
const onChain = await readMint(rpc, cfg.solanaMint);
if (onChain.tokenProgramId !== cfg.tokenProgramId || onChain.decimals !== cfg.decimals) {
  throw new Error("config disagrees with the chain about the token program or decimals");
}
const store = new Store(process.env.BRIDGE_DB ?? `state-${raw.network}.db`);
const { key } = loadOrCreateKey(process.env.ZCASH_KEY ?? `keys/zcash-${cfg.zcashNetwork}net.hex`);
const lwd = new Lightwalletd(process.env.LIGHTWALLETD ?? (cfg.zcashNetwork === "test" ? "testnet.zec.rocks:443" : "zec.rocks:443"));
const log = (stage: string) => (m: string) => console.log(`[${stage}] ${m}`);
const interval = Number(process.env.BRIDGE_INTERVAL ?? 30) * 1000;

console.log(`bridge: ${cfg.solanaMint} (${raw.network}) -> ${key.address(cfg.zcashNetwork)} (${cfg.zcashNetwork}net)`);

for (let pass = 1; ; pass++) {
  try {
    const w = await watchPass(rpc, store, cfg, { log: log("watch") });
    if (w.burnAttempts) console.log(`[watch] ${w.valid} valid, ${w.rejected} rejected`);
    const minted = await mintPass({ key, lwd, cfg, log: log("mint") }, store);
    if (minted.length || pass % 10 === 1) {
      // A cited burn the watcher never listed is fetched directly before we
      // call it unresolved. A fabricated signature stays unresolved forever,
      // which is correct: non-existence cannot be proved from an RPC, and
      // unresolved never counts as an NFT.
      const resolve = async (signature: string) => {
        const t = await rpc.getTransaction(signature, "finalized");
        if (!t) throw new Error("not found");
        const n = normalizeTransaction(t, { finalized: true });
        store.recordVerdict(n.signature, n.slot, n.blockTime, evaluateBurn(n, cfg));
      };
      const ledger = await indexPass(lwd, store, cfg, log("index"), resolve);
      console.log(`[ledger] ${ledger.nfts.length} NFTs, ${ledger.unclaimed.length} unclaimed, ${ledger.rejected.length} rejected, ${ledger.unresolved.length} unresolved`);
    }
  } catch (e) {
    console.error(`[pass ${pass}] ${(e as Error).message}`);
  }
  if (once) break;
  await new Promise((r) => setTimeout(r, interval));
}
lwd.close();
store.close();
