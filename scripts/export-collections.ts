// Export the on-chain registry to a file the site can read.
//
// The browser cannot talk to lightwalletd (gRPC, not HTTP), so the collections
// list ships as a snapshot. The chain stays authoritative; this is a cache,
// and the site says so.
import { solanaRpcUrl } from "../src/env.ts";
import { writeFileSync } from "node:fs";
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";
import { loadOrCreateKey } from "../src/zcash/keyfile.ts";
import { readRegistry, indexPass } from "../src/zcash/indexer.ts";
import { fundingAddressFor } from "../src/zcash/funding.ts";
import { Store } from "../src/store/db.ts";
import { SolanaRpc, readMint } from "../src/solana/rpc.ts";
import type { BridgeConfig } from "../src/core/types.ts";

const network = (process.env.ZCASH_NETWORK ?? "main") as "main" | "test";
const protocol = process.env.PROTOCOL ?? "zsam";
const out = process.env.OUT ?? "web/public/collections.json";

const lwd = new Lightwalletd(network === "main" ? "zec.rocks:443" : "testnet.zec.rocks:443");
const rpc = new SolanaRpc(solanaRpcUrl());
const { key: master } = loadOrCreateKey(process.env.ZCASH_KEY ?? `keys/zcash-${network}net.hex`);
const registry = await readRegistry(lwd, protocol, network);

const collections = [];
for (const c of registry.collections) {
  const funding = fundingAddressFor(master, c.mint, network);
  const fundedZat = (await lwd.utxos(funding)).reduce((s, u) => s + u.valueZat, 0n);
  let stamps = 0;
  try {
    const onChain = await readMint(rpc, c.mint);
    const cfg: BridgeConfig = {
      solanaMint: c.mint, tokenProgramId: onChain.tokenProgramId, decimals: onChain.decimals,
      minBurnRaw: c.min, startSlot: c.from, zcashNetwork: network, protocol,
    };
    const store = new Store(`state-${c.mint.slice(0, 8)}.db`);
    stamps = (await indexPass(lwd, store, cfg)).nfts.length;
    store.close();
  } catch { /* a collection we cannot price still belongs in the list */ }
  collections.push({
    sym: c.sym, mint: c.mint, dec: c.dec, min: c.min.toString(), from: c.from,
    inscriptionId: c.inscriptionId, height: c.height, funding,
    fundedZat: fundedZat.toString(), stamps,
  });
}

writeFileSync(out, JSON.stringify({ updated: new Date().toISOString(), network, collections }, null, 2) + "\n");
console.log(`wrote ${out}: ${collections.length} collection(s)`);
lwd.close();
