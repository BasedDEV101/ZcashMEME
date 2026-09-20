// Which accounts a launch always touches, whoever launches and whatever the
// mint is.
//
// Derived rather than guessed: two launches are built with different mints,
// and whatever appears in both -- minus the wallet that signed them -- is
// fixed for every launch, so it belongs in the lookup table. An account that
// varies per launch (the mint, its curve, its config) cannot go in one.

import { chromium } from "playwright";
import { MOCK, MOCK_PUBKEY } from "./mock-wallet.mjs";
import { Transaction, VersionedTransaction } from "@solana/web3.js";

const URL = process.argv[2];
const RUNS = 2;

async function keysFor() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1300 } });
  await page.addInitScript(MOCK);
  await page.route("**/api/metadata", (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ uri: "https://www.zcashstamp.com/m/muaen0pm3ja.json", image: "https://example.com/i.png" }) }));
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
  await page.getByRole("button", { name: /mockwallet/i }).click();
  await page.waitForTimeout(800);
  await page.getByLabel(/^name$/i).fill("Thirty Two Character Coin Name!!");
  await page.getByLabel(/ticker/i).fill("TENCHARTIK");
  await page.getByLabel(/description/i).fill("a test");
  await page.setInputFiles('input[type="file"]', { name: "c.png", mimeType: "image/png", buffer: Buffer.from([137,80,78,71,13,10,26,10]) });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /launch for/i }).click();
  await page.waitForTimeout(4000);

  const captured = await page.evaluate(() => window.__captured ?? []);
  const keys = new Set();
  for (const cap of captured) {
    const raw = Uint8Array.from(cap);
    let msg;
    try { msg = VersionedTransaction.deserialize(raw).message; }
    catch { msg = Transaction.from(raw).compileMessage(); }
    for (const k of (msg.staticAccountKeys ?? msg.accountKeys)) keys.add(k.toBase58());
  }
  await browser.close();
  return keys;
}

const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await keysFor());

const everywhere = [...runs[0]].filter((k) => runs.every((r) => r.has(k)));
const fixed = everywhere.filter((k) => k !== MOCK_PUBKEY);
const varies = [...new Set(runs.flatMap((r) => [...r]))].filter((k) => !everywhere.includes(k));

console.log(`fixed accounts (${fixed.length}) -- these go in the lookup table:`);
for (const k of fixed) console.log(k);
console.error(`\nvaries per launch (${varies.length}), excluded: ${varies.length} account(s)`);
console.error(`signer excluded: ${MOCK_PUBKEY}`);
