// Build on the live site, simulate, and read the curve account as it would be
// AFTER the instructions run. Checks what pump stores, not what we asked for.
import { chromium } from "playwright";
import { Connection, Keypair, PublicKey, VersionedTransaction, TransactionMessage } from "@solana/web3.js";
import { bondingCurvePda, PumpSdk } from "@pump-fun/pump-sdk";
import { readFileSync } from "node:fs";

const conn = new Connection("https://solana-rpc.publicnode.com", "confirmed");
const LOOKUP = new PublicKey("3zEFdQiMCRF5ew9KuLkeT4XVnRSRJjv58HWv8LSxvzJP");
const table = (await conn.getAddressLookupTable(LOOKUP)).value;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const dec = (s) => { let n = 0n; for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  const b = []; while (n > 0n) { b.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; b.unshift(0); } return Uint8Array.from(b); };
const payer = Keypair.fromSecretKey(dec(JSON.parse(readFileSync("../keys/test-launcher.json", "utf8")).secretKeyBase58));

const WALLET = `
(() => {
  const bytes = new Uint8Array([${Array.from(payer.publicKey.toBytes()).join(",")}]);
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const b58 = (u8) => { let n = 0n; for (const b of u8) n = (n << 8n) | BigInt(b);
    let s = ""; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
    for (const b of u8) { if (b !== 0) break; s = "1" + s; } return s; };
  window.__captured = [];
  const account = { address: b58(bytes), publicKey: bytes, chains: ["solana:mainnet"],
    features: ["solana:signAndSendTransaction","solana:signTransaction"], label: "T", icon: "data:image/svg+xml;base64,PHN2Zy8+" };
  const wallet = { version: "1.0.0", name: "MockWallet", icon: "data:image/svg+xml;base64,PHN2Zy8+",
    chains: ["solana:mainnet"], accounts: [], features: {
      "standard:connect": { version: "1.0.0", connect: async () => { wallet.accounts = [account]; return { accounts: wallet.accounts }; } },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => { wallet.accounts = []; } },
      "standard:events": { version: "1.0.0", on: () => () => {} },
      "solana:signAndSendTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0],
        signAndSendTransaction: async (...i) => { for (const x of i) window.__captured.push(Array.from(x.transaction)); return [{ signature: new Uint8Array(64) }]; } },
      "solana:signTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0],
        signTransaction: async (...i) => { for (const x of i) window.__captured.push(Array.from(x.transaction)); return i.map((x) => ({ signedTransaction: x.transaction })); } },
    } };
  const reg = (api) => api.register(wallet);
  window.addEventListener("wallet-standard:app-ready", (e) => reg(e.detail));
  window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: reg }));
})();`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
await page.addInitScript(WALLET);
await page.route("**/api/metadata", (r) => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ uri: "https://www.zcashstamp.com/m/kpchw7yxw.json", image: "https://example.com/i.png" }) }));
await page.goto(`${process.argv[2]}/launch`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
console.log("page displays 1.5%:", /1\.5% creator fee/i.test(await page.locator("body").innerText()));
await page.getByRole("button", { name: /mockwallet/i }).click();
await page.waitForTimeout(900);
await page.getByLabel(/^name$/i).fill("Fee Check");
await page.getByLabel(/ticker/i).fill("FEECHK");
await page.setInputFiles('input[type="file"]', { name: "c.png", mimeType: "image/png", buffer: Buffer.from([137,80,78,71,13,10,26,10]) });
await page.waitForTimeout(500);
await page.getByRole("button", { name: /launch for/i }).click();
await page.waitForTimeout(5000);
const cap = await page.evaluate(() => window.__captured ?? []);
await browser.close();

const tx = VersionedTransaction.deserialize(Uint8Array.from(cap[0]));
// The mint is the only non-payer signer; find it to derive its curve.
const decompiled = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: [table] });
const create = decompiled.instructions.find((i) => i.programId.toBase58() === "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const mint = create.keys.find((k) => k.isSigner && !k.pubkey.equals(payer.publicKey)).pubkey;
const curve = bondingCurvePda(mint);

const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true,
  accounts: { encoding: "base64", addresses: [curve.toBase58()] } });
if (sim.value.err) { console.log("simulation failed:", JSON.stringify(sim.value.err)); process.exit(1); }
const acc = sim.value.accounts?.[0];
if (!acc) { console.log("no curve returned"); process.exit(1); }
const c = new PumpSdk().decodeBondingCurve({ data: Buffer.from(acc.data[0], "base64"),
  owner: new PublicKey(acc.owner), lamports: 0, executable: false });
console.log("stored creatorFeeBps:", c.creatorFeeBps?.toString(), "=", Number(c.creatorFeeBps) / 100 + "%");
console.log("stored creator      :", c.creator.toBase58());
console.log("stored quote        :", c.quoteMint.toBase58());
