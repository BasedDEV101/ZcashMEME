// Fetch an inscription back from the chain and decode it independently:
// the end-to-end proof that what we broadcast is really there and readable.
//   node scripts/verify-inscription.ts <reveal-txid>
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";
import { decodeEnvelope, assemble, commitment } from "../src/zcash/inscription.ts";
import { parseNftContent } from "../src/core/nft.ts";
import { parseScript, hex } from "../src/zcash/script.ts";

const txidHex = process.argv[2];
if (!txidHex) throw new Error("usage: verify-inscription.ts <reveal-txid>");
const lwd = new Lightwalletd(process.env.LIGHTWALLETD ?? "testnet.zec.rocks:443");
const { raw, height } = await lwd.transaction(txidHex);
console.log(`fetched ${raw.length} bytes from chain, height ${height || "(mempool)"}`);

// Walk the raw v5 transaction to its first input's scriptSig.
let o = 4 + 4 + 4 + 4 + 4;             // header, versionGroupId, branchId, lockTime, expiry
const nIn = raw[o]; o += 1;
o += 32 + 4;                            // outpoint
let len = raw[o];
if (len < 0xfd) { o += 1; } else if (len === 0xfd) { len = raw[o + 1] | (raw[o + 2] << 8); o += 3; }
const scriptSig = raw.subarray(o, o + len);
console.log(`inputs: ${nIn}, scriptSig: ${scriptSig.length} bytes`);

const env = decodeEnvelope(scriptSig);
if (!env) throw new Error("not an inscription envelope");
const content = assemble(env.pieces);
console.log(`content type: ${env.contentType}`);
console.log(`content: ${new TextDecoder().decode(content)}`);
console.log(`commitment matches content: ${env.commitment && hex(env.commitment) === hex(commitment(env.contentType, content))}`);

const nft = parseNftContent(content, "zsam");
if (!nft) throw new Error("content is not canonical protocol content");
console.log(`\nNFT decoded:`);
console.log(`  solana mint : ${nft.mint}`);
console.log(`  burn sig    : ${nft.burn}`);
console.log(`  amount      : ${nft.amt} raw`);
console.log(`  recipient   : ${nft.to}`);
void parseScript;
lwd.close();
