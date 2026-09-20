// Deploy a collection: inscribe its record to the registry address.
//
//   node scripts/deploy-collection.ts --mint <solana mint> --symbol STAMP [--min 1000000] [--yes]
//
// Reads decimals and the token program from chain rather than trusting flags.
// Costs one inscription (~$0.5) from the operator wallet.

import { readFileSync } from "node:fs";
import { SolanaRpc, readMint } from "../src/solana/rpc.ts";
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";
import { loadOrCreateKey } from "../src/zcash/keyfile.ts";
import { fundingAddressFor, registryAddress } from "../src/zcash/funding.ts";
import { buildInscription } from "../src/zcash/inscribe.ts";
import { encodeCollectionBytes, type CollectionContent } from "../src/core/collection.ts";
import { readRegistry } from "../src/zcash/indexer.ts";
import { CONTENT_TYPE } from "../src/core/nft.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i].replace(/^--/, "");
  if (k === "yes") { args.set("yes", "1"); i -= 1; continue; }
  args.set(k, process.argv[i + 1]);
}
const network = (process.env.ZCASH_NETWORK ?? "main") as "main" | "test";
const protocol = process.env.PROTOCOL ?? "zsam";
const mint = args.get("mint");
const symbol = args.get("symbol");
if (!mint || !symbol) throw new Error("usage: --mint <solana mint> --symbol <TICKER> [--min <whole tokens>]");

const rpc = new SolanaRpc(process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com");
const onChain = await readMint(rpc, mint);
const minWhole = BigInt(args.get("min") ?? "1000000");

// The slot burns count from. Pass --from to skip the lookup; otherwise walk
// back to the mint's first signature. That walk is cheap for a new token and
// expensive for one already trading, which is exactly why the value is
// recorded once at deploy instead of rediscovered on every pass.
let from = Number(args.get("from") ?? 0);
if (!from) {
  process.stdout.write("finding the mint's first slot… ");
  let before: string | undefined, oldest;
  for (let i = 0; i < 60; i++) {
    const page = await rpc.getSignaturesForAddress(mint, { before, limit: 1000 });
    if (page.length === 0) break;
    oldest = page[page.length - 1];
    if (page.length < 1000) break;
    before = oldest.signature;
  }
  from = oldest?.slot ?? 0;
  console.log(from);
}
const content: CollectionContent = {
  p: protocol, op: "deploy", v: 2,
  mint, sym: symbol.toUpperCase(),
  dec: onChain.decimals,
  min: minWhole * 10n ** BigInt(onChain.decimals),
  from,
  by: loadOrCreateKey(process.env.ZCASH_KEY ?? `keys/zcash-${network}net.hex`).key.address(network),
};

const { key } = loadOrCreateKey(process.env.ZCASH_KEY ?? `keys/zcash-${network}net.hex`);
const lwd = new Lightwalletd(network === "main" ? "zec.rocks:443" : "testnet.zec.rocks:443");
const info = await lwd.info();

console.log(`collection   ${content.sym}  (${mint})`);
console.log(`token program ${onChain.tokenProgramId}`);
console.log(`decimals      ${content.dec}   supply ${(onChain.supply / 10n ** BigInt(content.dec)).toLocaleString("en-US")}`);
console.log(`minimum burn  ${minWhole.toLocaleString("en-US")} tokens`);
console.log(`burns from     slot ${from}`);
console.log(`registry      ${registryAddress(network)}`);
console.log(`funding       ${fundingAddressFor(key, mint, network)}   <- the launcher funds this`);

const existing = await readRegistry(lwd, protocol, network);
if (existing.collections.some((c) => c.mint === mint)) {
  console.log("\nalready deployed; first deploy wins, so this would be rejected.");
  process.exit(0);
}
if (!args.has("yes")) {
  console.log("\ndry run. re-run with --yes to inscribe.");
  process.exit(0);
}

const utxos = await lwd.utxos(key.address(network));
const ins = buildInscription({
  key, utxos, content: encodeCollectionBytes(content), contentType: CONTENT_TYPE,
  recipient: registryAddress(network), network,
  consensusBranchId: info.consensusBranchId, chainHeight: info.blockHeight,
});
await lwd.send(ins.commit.raw, info.blockHeight);
await lwd.send(ins.reveal.raw, info.blockHeight);
console.log(`\ndeployed: ${ins.inscriptionId}  (cost ${ins.totalCostZat} zat)`);
lwd.close();
