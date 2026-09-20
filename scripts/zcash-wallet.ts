// Show (creating if needed) the minter's Zcash wallet address and balance.
// The private key is written to a 0600 git-ignored file and never printed.
import { loadOrCreateKey } from "../src/zcash/keyfile.ts";
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";

const network = (process.env.ZCASH_NETWORK ?? "test") as "main" | "test";
const path = process.env.ZCASH_KEY ?? `keys/zcash-${network}net.hex`;
const { key, created } = loadOrCreateKey(path);
const address = key.address(network);
console.log(`${network}net minter address: ${address}${created ? "  (new key created)" : ""}`);
console.log(`key file: ${path} (0600, git-ignored)`);

if (process.env.SKIP_BALANCE !== "1") {
  const l = new Lightwalletd(process.env.LIGHTWALLETD ?? (network === "test" ? "testnet.zec.rocks:443" : "zec.rocks:443"));
  const info = await l.info();
  const utxos = await l.utxos(address);
  const total = utxos.reduce((s, u) => s + u.valueZat, 0n);
  console.log(`chain: ${info.chainName} height ${info.blockHeight} branch ${info.consensusBranchId.toString(16)}`);
  console.log(`balance: ${total} zat (${(Number(total) / 1e8).toFixed(8)} ZEC) across ${utxos.length} utxo(s)`);
  l.close();
}
