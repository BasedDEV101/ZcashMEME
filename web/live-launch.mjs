// Launch a coin THROUGH THE SITE, for real.
//
// The site is driven with a Wallet Standard wallet whose public key is the
// test wallet's, so the page builds the transaction it would build for that
// user. The bytes it hands the wallet are then signed with the real key here
// and broadcast. Nothing about the transaction is reconstructed: what goes on
// chain is what the site produced.
//
//   node live-launch.mjs <url>            # build and simulate only
//   node live-launch.mjs <url> --confirm  # sign and broadcast

import { chromium } from "playwright";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { readFileSync } from "node:fs";

const URL = process.argv[2];
const confirm = process.argv.includes("--confirm");

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const dec = (s) => {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  const b = [];
  while (n > 0n) { b.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; b.unshift(0); }
  return Uint8Array.from(b);
};
const payer = Keypair.fromSecretKey(dec(JSON.parse(readFileSync("../keys/test-launcher.json", "utf8")).secretKeyBase58));
const conn = new Connection("https://solana-rpc.publicnode.com", "confirmed");
console.log("launcher:", payer.publicKey.toBase58(), (await conn.getBalance(payer.publicKey)) / 1e9, "SOL");

const WALLET = `
(() => {
  const bytes = new Uint8Array([${Array.from(payer.publicKey.toBytes()).join(",")}]);
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const b58 = (u8) => { let n = 0n; for (const b of u8) n = (n << 8n) | BigInt(b);
    let s = ""; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
    for (const b of u8) { if (b !== 0) break; s = "1" + s; } return s; };
  window.__captured = [];
  const account = { address: b58(bytes), publicKey: bytes, chains: ["solana:mainnet"],
    features: ["solana:signAndSendTransaction", "solana:signTransaction"], label: "Test", icon: "data:image/svg+xml;base64,PHN2Zy8+" };
  const wallet = { version: "1.0.0", name: "MockWallet", icon: "data:image/svg+xml;base64,PHN2Zy8+",
    chains: ["solana:mainnet"], accounts: [],
    features: {
      "standard:connect": { version: "1.0.0", connect: async () => { wallet.accounts = [account]; return { accounts: wallet.accounts }; } },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => { wallet.accounts = []; } },
      "standard:events": { version: "1.0.0", on: () => () => {} },
      "solana:signAndSendTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0],
        signAndSendTransaction: async (...inputs) => { for (const i of inputs) window.__captured.push(Array.from(i.transaction));
          return [{ signature: new Uint8Array(64) }]; } },
      "solana:signTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0],
        signTransaction: async (...inputs) => { for (const i of inputs) window.__captured.push(Array.from(i.transaction));
          return inputs.map((i) => ({ signedTransaction: i.transaction })); } },
    } };
  const register = (api) => api.register(wallet);
  window.addEventListener("wallet-standard:app-ready", (e) => register(e.detail));
  window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
})();
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.addInitScript(WALLET);
await page.goto(`${URL}/launch`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.getByRole("button", { name: /mockwallet/i }).click();
await page.waitForTimeout(1000);
await page.getByLabel(/^name$/i).fill("Shielded Test Stamp");
await page.getByLabel(/ticker/i).fill("ZSTEST");
await page.getByLabel(/description/i).fill("First coin launched through the pad, paired to ZEC.");
// A real 1x1 PNG, uploaded through the site's own metadata endpoint.
await page.setInputFiles('input[type="file"]', { name: "coin.png", mimeType: "image/png",
  buffer: Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000002000001e221bc330000000049454e44ae426082", "hex") });
await page.waitForTimeout(600);
await page.getByRole("button", { name: /launch for/i }).click();
await page.waitForTimeout(9000);
const captured = await page.evaluate(() => window.__captured ?? []);
const shown = await page.locator("body").innerText();
await browser.close();

console.log("console errors:", errs.length);
errs.slice(0, 2).forEach((e) => console.log("   !", e.slice(0, 140)));
if (!captured.length) { console.log("the site built no transaction.\n", shown.slice(0, 400)); process.exit(1); }

const tx = VersionedTransaction.deserialize(Uint8Array.from(captured[0]));
console.log("site built    :", captured[0].length, "bytes");

const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
if (sim.value.err) {
  console.log("SIMULATION FAILS:", JSON.stringify(sim.value.err));
  for (const l of (sim.value.logs ?? []).slice(-6)) console.log("   ", l.slice(0, 140));
  process.exit(1);
}
console.log("simulation    : OK");
if (!confirm) { console.log("\nNot sent. Re-run with --confirm."); process.exit(0); }

// The mint already signed inside the page; add the launcher's signature.
tx.sign([payer]);
const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
console.log("sent          :", sig);
for (let i = 0; i < 40; i++) {
  const st = await conn.getSignatureStatuses([sig], { searchTransactionHistory: true });
  const s = st.value[0];
  if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") {
    console.log("status        :", s.confirmationStatus, "err =", JSON.stringify(s.err));
    break;
  }
  await new Promise((r) => setTimeout(r, 2000));
}
