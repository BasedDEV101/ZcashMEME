// Adversarial test on the real chain: use the minter's own key to inscribe a
// FORGED NFT citing a burn that never happened, delivered to a real burner's
// address. The ledger rule must reject it (SPEC 4.4: the burn must exist).
//
// This is the "stolen minter key" scenario for real. Testnet only.
import { readFileSync } from "node:fs";
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";
import { loadOrCreateKey } from "../src/zcash/keyfile.ts";
import { buildInscription } from "../src/zcash/inscribe.ts";
import { encodeNftBytes, CONTENT_TYPE, type NftContent } from "../src/core/nft.ts";
import { Store } from "../src/store/db.ts";

const raw = JSON.parse(readFileSync(process.env.BRIDGE_CONFIG!, "utf8"));
if (raw.zcashNetwork !== "test") throw new Error("testnet only");
const store = new Store(process.env.BRIDGE_DB!);
const victim = store.validBurns()[0];
if (!victim) throw new Error("need at least one real burn to target");

const { key } = loadOrCreateKey("keys/zcash-testnet.hex");
const lwd = new Lightwalletd("testnet.zec.rocks:443");
const info = await lwd.info();
const utxos = await lwd.utxos(key.address("test"));

// Forged: cites a burn signature that does not exist on Solana, and inflates
// the amount tenfold. Everything else is perfectly well-formed.
const forged: NftContent = {
  p: raw.protocol, op: "mint", v: 1,
  mint: raw.solanaMint,
  burn: "4".repeat(87) + "Z",             // never happened
  amt: victim.amount * 10n,
  to: victim.zcashAddress,
};
const content = encodeNftBytes(forged);
console.log(`forging: ${new TextDecoder().decode(content).slice(0, 120)}…`);

const ins = buildInscription({
  key, utxos, content, contentType: CONTENT_TYPE, recipient: victim.zcashAddress,
  network: "test", consensusBranchId: info.consensusBranchId, chainHeight: info.blockHeight,
});
await lwd.send(ins.commit.raw, info.blockHeight);
await lwd.send(ins.reveal.raw, info.blockHeight);
console.log(`forged inscription broadcast and ACCEPTED BY THE CHAIN: ${ins.inscriptionId}`);
console.log(`(the chain does not care; the ledger rule must)`);
lwd.close();
store.close();
