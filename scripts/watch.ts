// Run the burn watcher against a configured network.
//   node scripts/watch.ts [--once] [--interval 15]
import { readFileSync } from "node:fs";
import { SolanaRpc, readMint } from "../src/solana/rpc.ts";
import { Store } from "../src/store/db.ts";
import { watchPass } from "../src/solana/watcher.ts";
import type { BridgeConfig } from "../src/core/types.ts";

const args = new Set(process.argv.slice(2));
const file = process.env.BRIDGE_CONFIG ?? "config/devnet.json";
const raw = JSON.parse(readFileSync(file, "utf8"));
const cfg: BridgeConfig = {
  solanaMint: raw.solanaMint,
  tokenProgramId: raw.tokenProgramId,
  decimals: raw.decimals,
  minBurnRaw: BigInt(raw.minBurnRaw),
  startSlot: Number(raw.startSlot ?? 0),
  zcashNetwork: raw.zcashNetwork,
  protocol: raw.protocol,
};
const rpc = new SolanaRpc(raw.rpc);

// Config must agree with the chain, or the rule would judge by the wrong program.
const onChain = await readMint(rpc, cfg.solanaMint);
if (onChain.tokenProgramId !== cfg.tokenProgramId) throw new Error(`config says token program ${cfg.tokenProgramId}, chain says ${onChain.tokenProgramId}`);
if (onChain.decimals !== cfg.decimals) throw new Error(`config says ${cfg.decimals} decimals, chain says ${onChain.decimals}`);
console.log(`watching ${cfg.solanaMint} on ${raw.network} (${onChain.decimals} decimals, supply ${onChain.supply})`);

const store = new Store(process.env.BRIDGE_DB ?? `state-${raw.network}.db`);
const interval = Number(process.env.WATCH_INTERVAL ?? 15) * 1000;
for (;;) {
  const r = await watchPass(rpc, store, cfg, { log: (m) => console.log(`  ${m}`) });
  console.log(`pass: scanned ${r.scanned}, fetched ${r.fetched}, burns ${r.burnAttempts} (valid ${r.valid}, rejected ${r.rejected}); totals ${JSON.stringify(store.counts())}`);
  if (args.has("--once")) break;
  await new Promise((r) => setTimeout(r, interval));
}
store.close();
