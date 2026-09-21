// Screenshots of the market record plate, in the states it actually reaches.
import { chromium } from "playwright";

const URL = process.argv[2];
const KEY = "zip227.market-history.v1";
const ZEC = "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS";
const SOL = "So11111111111111111111111111111111111111112";
const A = "A".repeat(43), B = "B".repeat(43), C = "C".repeat(43);

const coin = (mint, symbol, name, marketCapQuote, quoteMint) => ({
  mint, symbol, name, image: null, minWholeTokens: "1000000", signature: null,
  launchedAt: 1758300000, launchedBy: null, decimals: 6, burnedTokens: "12000000",
  burnCount: 4, refusedCount: 0, burners: 3, destroyedTokens: "14000000",
  marketCapQuote, quoteMint, slot: 1000,
});

const ACTIVITY = { collections: [
  coin(A, "INKWELL", "Inkwell", "489234567890", ZEC),
  coin(B, "FOLIO", "Folio Press", "91234567890", ZEC),
  coin("C".repeat(43), "STAMP", "Stamp", "4120000000000", SOL),
], burns: [], feeSol: 0.5, historyUpdated: null };

function drift(base, n, slope, jitter) {
  const now = Date.now();
  const out = [];
  let v = base;
  for (let i = n - 1; i >= 0; i--) {
    v *= 1 + slope + (Math.sin(i * 2.7) + Math.cos(i * 1.31)) * jitter;
    out.push({ t: now - i * 40 * 60_000, value: String(Math.max(1, Math.round(v))) });
  }
  return out;
}

const browser = await chromium.launch();

async function shot(name, width, height, seed, y) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.addInitScript(({ key, seed }) => {
    try { localStorage.clear(); if (seed) localStorage.setItem(key, JSON.stringify(seed)); } catch {}
  }, { key: KEY, seed });
  await page.route("**/api/activity*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ACTIVITY) }));
  await page.goto(`${URL}/leaderboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const el = page.locator("#market");
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await el.screenshot({ path: `shots/${name}.png` });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${name}: horizontal overflow ${over}px`);
  if (y !== undefined) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(300); }
  await page.close();
}

const seeded = { [A]: drift(310e9, 42, 0.012, 0.01), [B]: drift(120e9, 30, -0.006, 0.013), [C]: drift(3.1e12, 20, 0.008, 0.012) };
await shot("market-desktop", 1440, 1100, seeded);
await shot("market-phone", 390, 1000, seeded);
await shot("market-first-visit", 1440, 1100, null);
await shot("market-first-visit-phone", 390, 1000, null);
await shot("market-flat", 1440, 1100, { [A]: Array.from({ length: 24 }, (_, i) => ({ t: Date.now() - (23 - i) * 40 * 60_000, value: "489234567890" })) });
await shot("market-outlier", 1440, 1100, { [A]: [...drift(4e9, 18, 0.004, 0.006), { t: Date.now() - 40 * 60_000, value: "1600000000000" }, { t: Date.now(), value: "4300000000" }] });

await browser.close();
