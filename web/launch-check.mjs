import { chromium } from "playwright";
import { MOCK } from "./mock-wallet.mjs";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
const URL = process.argv[2];
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const SYSTEM = "11111111111111111111111111111111";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await page.addInitScript(MOCK);

await page.goto(`${URL}/launch`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
console.log("1. launch page renders   :", (await page.locator("h1").innerText()).trim());
console.log("2. registry shows STAMP  :", (await page.locator("body").innerText()).includes("STAMP"));

await page.getByRole("button", { name: /mockwallet/i }).click();
await page.waitForTimeout(900);
await page.getByLabel(/solana mint address/i).fill("EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc");
await page.waitForTimeout(2500);
const body = await page.locator("body").innerText();
console.log("3. reads mint from chain :", /already registered/i.test(body) ? "yes (and refuses a duplicate)" : /Decimals/.test(body) ? "yes" : "NO");

// a fresh mint that is not registered
await page.getByLabel(/solana mint address/i).fill("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
await page.waitForTimeout(2500);
await page.getByLabel(/collection ticker/i).fill("BONK");
await page.waitForTimeout(400);
const btn = page.getByRole("button", { name: /register for/i });
console.log("4. register button       :", (await btn.innerText()).trim(), "| enabled:", !(await btn.isDisabled()));
await btn.click();
await page.waitForTimeout(2500);
const captured = await page.evaluate(() => window.__captured ?? []);
console.log("5. request handed to wallet:", captured.length > 0);
if (captured.length) {
  const raw = Uint8Array.from(captured[0]);
  let msg;
  try { msg = VersionedTransaction.deserialize(raw).message; } catch { msg = Transaction.from(raw).compileMessage(); }
  const keys = (msg.staticAccountKeys ?? msg.accountKeys).map((k) => k.toBase58());
  for (const ix of (msg.compiledInstructions ?? msg.instructions)) {
    const prog = keys[ix.programIdIndex];
    const data = Uint8Array.from(ix.data);
    if (prog === SYSTEM) {
      let lamports = 0n;
      for (let i = 11; i >= 4; i--) lamports = (lamports << 8n) | BigInt(data[i]);
      console.log("   fee:", Number(lamports) / 1e9, "SOL ->", keys[(ix.accountKeyIndexes ?? ix.accounts)[1]].slice(0, 10) + "…");
    } else if (prog === MEMO) {
      console.log("   memo:", new TextDecoder().decode(data));
    }
  }
}
console.log("console errors           :", errs.length);
errs.slice(0, 2).forEach((e) => console.log("   !", e.slice(0, 140)));
await page.screenshot({ path: "shots/launch.png" });
await browser.close();
