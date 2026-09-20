// The launchpad bridge: serve every collection in the on-chain registry.
//
//   node scripts/launchpad.ts [--once]
//
// Each pass reads the registry, then for every collection watches its Solana
// mint for burns and inscribes stamps paid from THAT collection's own funding
// address. A collection with an empty balance stalls only itself.

import { SolanaRpc, readMint } from "../src/solana/rpc.ts";
import { Store } from "../src/store/db.ts";
import { watchPass } from "../src/solana/watcher.ts";
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";
import { loadOrCreateKey } from "../src/zcash/keyfile.ts";
import { fundingKeyFor, fundingAddressFor } from "../src/zcash/funding.ts";
import { readRegistry } from "../src/zcash/indexer.ts";
import { mintPass } from "../src/zcash/minter.ts";
import { indexPass } from "../src/zcash/indexer.ts";
import type { BridgeConfig } from "../src/core/types.ts";

const once = process.argv.includes("--once");
const network = (process.env.ZCASH_NETWORK ?? "main") as "main" | "test";
const protocol = process.env.PROTOCOL ?? "zsam";
const rpc = new SolanaRpc(process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com");
const lwd = new Lightwalletd(network === "main" ? "zec.rocks:443" : "testnet.zec.rocks:443");
const { key: master } = loadOrCreateKey(process.env.ZCASH_KEY ?? `keys/zcash-${network}net.hex`);
const interval = Number(process.env.LAUNCHPAD_INTERVAL ?? 45) * 1000;
const STAMP_COST = 30546n;

console.log(`launchpad on ${network}net, protocol ${protocol}`);

for (let pass = 1; ; pass++) {
  try {
    const registry = await readRegistry(lwd, protocol, network);
    if (registry.rejected.length) {
      console.log(`[registry] ${registry.rejected.length} rejected deploy record(s)`);
    }
    console.log(`[registry] ${registry.collections.length} collection(s)`);

    for (const c of registry.collections) {
      const tag = `[${c.sym}]`;
      // Config comes from the deploy record, but the token program is read
      // from chain: a deploy record cannot make us judge burns by the wrong
      // program.
      let onChain;
      try {
        onChain = await readMint(rpc, c.mint);
      } catch (e) {
        console.log(`${tag} skipped: ${(e as Error).message}`);
        continue;
      }
      if (onChain.decimals !== c.dec) {
        console.log(`${tag} skipped: deploy record says ${c.dec} decimals, chain says ${onChain.decimals}`);
        continue;
      }

      const cfg: BridgeConfig = {
        solanaMint: c.mint,
        tokenProgramId: onChain.tokenProgramId,
        decimals: onChain.decimals,
        minBurnRaw: c.min,
        startSlot: 0,
        zcashNetwork: network,
        protocol,
      };
      const store = new Store(`state-${c.mint.slice(0, 8)}.db`);
      const fundKey = fundingKeyFor(master, c.mint);

      try {
        const w = await watchPass(rpc, store, cfg, { log: (m) => console.log(`${tag} ${m}`) });
        if (w.burnAttempts) console.log(`${tag} ${w.valid} valid, ${w.rejected} rejected`);

        const funds = (await lwd.utxos(fundKey.address(network))).reduce((s, u) => s + u.valueZat, 0n);
        const owed = store.validBurns().length;
        if (funds < STAMP_COST && owed > 0) {
          console.log(`${tag} funding empty (${funds} zat at ${fundingAddressFor(master, c.mint, network)}); stamps queued`);
        } else {
          const minted = await mintPass({ key: fundKey, lwd, cfg, log: (m) => console.log(`${tag} ${m}`) }, store);
          if (minted.length || pass % 10 === 1) {
            const ledger = await indexPass(lwd, store, cfg, (m) => console.log(`${tag} ${m}`));
            console.log(`${tag} ${ledger.nfts.length} stamps, ${ledger.unclaimed.length} owed, ${Number(funds) / 1e8} ZEC funding`);
          }
        }
      } finally {
        store.close();
      }
    }
  } catch (e) {
    console.error(`[pass ${pass}] ${(e as Error).message}`);
  }
  if (once) break;
  await new Promise((r) => setTimeout(r, interval));
}
lwd.close();
