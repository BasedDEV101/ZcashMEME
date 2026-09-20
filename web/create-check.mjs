import { chromium } from "playwright";
import { MOCK } from "./mock-wallet.mjs";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
const URL = process.argv[2];
const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const SYSTEM = "11111111111111111111111111111111";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1300 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await page.addInitScript(MOCK);

// STUB_UPLOAD=1 stands in for the upload when storage is unreachable;
// unset, the run exercises the real /api/metadata.
if (process.env.STUB_UPLOAD) await page.route("**/api/metadata", (route) =>
  route.fulfill({ status: 200, contentType: "application/json",
    // Same shape and length as a real one, so the size this measures is the
    // size production actually builds.
    body: JSON.stringify({ uri: "https://www.zcashstamp.com/m/muaen0pm3ja.json", image: "https://example.com/i.png" }) }));

// The mock wallet returns a signature no RPC has heard of, so confirmation
// would never resolve and the second transaction would never be built. Report
// it confirmed so the rest of the flow runs.
await page.route(/solana-rpc|helius|mainnet-beta/, async (route) => {
  const body = JSON.parse(route.request().postData() ?? "{}");
  if (body.method === "getSignatureStatuses") {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      jsonrpc: "2.0", id: body.id,
      result: { context: { slot: 1 }, value: [{ slot: 1, confirmations: 1, err: null, confirmationStatus: "confirmed" }] },
    })});
  }
  return route.continue();
});

await page.goto(`${URL}/launch`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
console.log("1. page           :", (await page.locator("h1").innerText()).trim());
console.log("2. register table :", (await page.locator("body").innerText()).includes("The register") ? "present" : "MISSING");

await page.getByRole("button", { name: /mockwallet/i }).click();
await page.waitForTimeout(800);
await page.getByLabel(/^name$/i).fill("Thirty Two Character Coin Name!!");
await page.getByLabel(/ticker/i).fill("TENCHARTIK");
await page.getByLabel(/description/i).fill("a test");
await page.getByLabel(/^website$/i).fill("https://example.com");
await page.getByLabel(/x link/i).fill("https://x.com/test");
await page.setInputFiles('input[type="file"]', { name: "c.png", mimeType: "image/png", buffer: Buffer.from([137,80,78,71,13,10,26,10]) });
await page.waitForTimeout(500);

const btn = page.getByRole("button", { name: /launch for/i });
console.log("3. launch button  :", (await btn.innerText()).trim(), "| enabled:", !(await btn.isDisabled()));
await btn.click();
await page.waitForTimeout(3500);

const captured = await page.evaluate(() => window.__captured ?? []);
console.log("4. txs built      :", captured.length);
for (const [n, cap] of captured.entries()) {
  const raw = Uint8Array.from(cap);
  console.log(`   --- tx ${n + 1}: ${raw.length} bytes (limit 1232) ---`);
  let msg;
  try { msg = VersionedTransaction.deserialize(raw).message; } catch { msg = Transaction.from(raw).compileMessage(); }
  const keys = (msg.staticAccountKeys ?? msg.accountKeys).map((k) => k.toBase58());
  for (const ix of (msg.compiledInstructions ?? msg.instructions)) {
    const prog = keys[ix.programIdIndex];
    const data = Uint8Array.from(ix.data);
    if (prog === PUMP) console.log("   pump.fun create   : yes,", (ix.accountKeyIndexes ?? ix.accounts).length, "accounts");
    else if (prog === SYSTEM) {
      let l = 0n; for (let i = 11; i >= 4; i--) l = (l << 8n) | BigInt(data[i]);
      console.log("   launch fee        :", Number(l)/1e9, "SOL ->", keys[(ix.accountKeyIndexes ?? ix.accounts)[1]].slice(0,10)+"…");
    } else if (prog === MEMO) console.log("   registers as      :", new TextDecoder().decode(data));
    else console.log("   other program     :", prog.slice(0, 10) + "…", data.length, "bytes");
  }
}
console.log("console errors    :", errs.length);
errs.slice(0,2).forEach(e => console.log("   !", e.slice(0,130)));
await page.screenshot({ path: "shots/launch-create.png", fullPage: false });
await browser.close();
