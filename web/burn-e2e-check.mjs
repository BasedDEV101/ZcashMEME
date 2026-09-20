// Drive the live site with a mock wallet and decode the transaction it builds.
// Nothing is broadcast: the mock signs and returns a fake signature.
import { chromium } from "playwright";
import { MOCK } from "./mock-wallet.mjs";
import { Transaction, VersionedTransaction } from "@solana/web3.js";

const URL = process.argv[2] ?? "https://www.zcashstamp.com";
const MINT = "EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await page.addInitScript(MOCK);

await page.goto(`${URL}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const connect = page.getByRole("button", { name: /mockwallet/i });
console.log("1. wallet detected          :", (await connect.count()) > 0);
await connect.click();
await page.waitForTimeout(900);

await page.getByRole("button", { name: /create a zcash address/i }).click();
await page.waitForTimeout(500);
const zaddr = (await page.locator("body").innerText()).match(/\bt1[a-km-zA-HJ-NP-Z1-9]{20,}\b/g)
  .find((a) => a !== "t1P2GcxGhzeM5tPk3r3JsGh1tEVArD4C2fB");
console.log("2. zcash address generated  :", zaddr ? zaddr.slice(0, 16) + "…" : "FAILED");
await page.getByRole("checkbox").check();
await page.getByLabel(/amount of/i).fill("1500000");
await page.waitForTimeout(400);

const burn = page.getByRole("button", { name: /destroy/i });
console.log("3. burn button enabled      :", !(await burn.isDisabled()));
await burn.click();
await page.waitForTimeout(2500);

const captured = await page.evaluate(() => window.__captured ?? []);
console.log("4. transaction handed to wallet:", captured.length > 0);
if (captured.length) {
  const raw = Uint8Array.from(captured[0]);
  let msg;
  try { msg = VersionedTransaction.deserialize(raw).message; }
  catch { msg = Transaction.from(raw).compileMessage(); }
  const keys = (msg.staticAccountKeys ?? msg.accountKeys).map((k) => k.toBase58());
  const ixs = msg.compiledInstructions ?? msg.instructions;
  console.log("5. instructions             :", ixs.length);
  for (const ix of ixs) {
    const prog = keys[ix.programIdIndex];
    const data = Uint8Array.from(ix.data);
    const accounts = (ix.accountKeyIndexes ?? ix.accounts).map((i) => keys[i]);
    if (prog === TOKEN_2022) {
      let amt = 0n;
      for (let i = 8; i >= 1; i--) amt = (amt << 8n) | BigInt(data[i]);
      console.log("   burn: tag", data[0], "| amount", (amt / 1000000n).toLocaleString(), "| decimals", data[9]);
      console.log("   mint matches           :", accounts[1] === MINT);
    } else if (prog === MEMO) {
      const text = new TextDecoder().decode(data);
      console.log("   memo:", text.slice(0, 20) + "…", "| matches generated address:", text === zaddr);
    } else {
      console.log("   other program:", prog.slice(0, 12) + "…");
    }
  }
}
console.log("console errors              :", errs.length);
errs.slice(0, 2).forEach((e) => console.log("   !", e.slice(0, 140)));
await browser.close();
