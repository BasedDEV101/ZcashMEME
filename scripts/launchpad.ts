// The launchpad bridge: serve every collection in the on-chain registry.
//
//   node scripts/launchpad.ts [--once]
//
// Each pass reads the registry, then for every collection watches its Solana
// mint for burns and inscribes stamps paid from THAT collection's own funding
// address. A collection with an empty balance stalls only itself.

import { solanaRpcUrl } from "../src/env.ts";
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
const rpc = new SolanaRpc(solanaRpcUrl());
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
        startSlot: c.from,
        zcashNetwork: network,
        protocol,
      };
      const store = new Store(`state-${c.mint.slice(0, 8)}.db`);
      const fundKey = fundingKeyFor(master, c.mint);

      try {
        const w = await watchPass(rpc, store, cfg, { log: (m) => console.log(`${tag} ${m}`) });
        if (w.burnAttempts) console.log(`${tag} ${w.valid} valid, ${w.rejected} rejected`);

        // Ask the chain what is actually owed before spending anything: a
        // fresh store has no memory of stamps already inscribed, and paying to
        // mint a duplicate burns fees for an inscription the ledger rejects.
        const ledger = await indexPass(lwd, store, cfg, (m) => console.log(`${tag} ${m}`));
        const funds = (await lwd.utxos(fundKey.address(network))).reduce((s, u) => s + u.valueZat, 0n);

        if (ledger.unclaimed.length === 0) {
          if (pass % 10 === 1) console.log(`${tag} ${ledger.nfts.length} stamps, nothing owed, ${Number(funds) / 1e8} ZEC funding`);
        } else if (funds < STAMP_COST) {
          console.log(`${tag} ${ledger.unclaimed.length} stamp(s) owed but funding is empty (${funds} zat)`);
          console.log(`${tag} fund ${fundingAddressFor(master, c.mint, network)} to release them`);
        } else {
          const minted = await mintPass({ key: fundKey, lwd, cfg, log: (m) => console.log(`${tag} ${m}`) }, store, ledger.unclaimed);
          console.log(`${tag} minted ${minted.length}, ${ledger.nfts.length} stamps total`);
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
