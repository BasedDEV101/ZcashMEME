import { chromium } from "playwright";
import { MOCK } from "./mock-wallet.mjs";
const URL = process.argv[2];
const browser = await chromium.launch();
let bad = 0;

async function visit(name, steps, { wallet = true, width = 1440 } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const seen = [];
  page.on("pageerror", (e) => seen.push(`THROWN  ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/status of (5\d\d|429|4\d\d)/.test(m.text()) && seen.push(`CONSOLE ${m.text()}`));
  if (wallet) await page.addInitScript(MOCK);
  try { await steps(page); } catch (e) { seen.push(`STEP    ${String(e).split("\n")[0].slice(0, 150)}`); }
  if (await page.evaluate(() => (document.getElementById("root")?.childElementCount ?? 0) === 0)) seen.push("BLANK   #root empty");
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (ov > 1) seen.push(`OVERFLOW ${ov}px`);
  await page.close();
  const u = [...new Set(seen)];
  if (u.length) bad += u.length;
  console.log(`${u.length ? "✗" : "✓"} ${name}`);
  u.forEach((s) => console.log("    " + s.slice(0, 160)));
}

const go = (p) => async (page) => { await page.goto(`${URL}${p}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(4500); };

await visit("burn form: bad addresses and amounts", async (page) => {
  await go("/")(page);
  await page.getByRole("button", { name: /mockwallet/i }).first().click();
  await page.waitForTimeout(1500);
  const fields = page.locator('input[type="text"], input:not([type])');
  const n = await fields.count();
  for (const v of ["", "not-an-address", "t1P2GcxGhzeM5tPk3r3JsGh1tEVArD4C2fB", "0", "-5", "999999999999999999999999", "1e9", "abc"]) {
    for (let i = 0; i < Math.min(n, 3); i++) {
      const f = fields.nth(i);
      if (await f.isEditable().catch(() => false)) await f.fill(v).catch(() => {});
    }
    await page.waitForTimeout(200);
  }
  const burn = page.getByRole("button", { name: /burn/i }).last();
  if (await burn.count() && !(await burn.isDisabled().catch(() => true))) { await burn.click(); await page.waitForTimeout(2500); }
});

await visit("unknown route", go("/does-not-exist"), { wallet: false });
await visit("/burns route", go("/burns"), { wallet: false });
await visit("deep link mid-path", go("/leaderboard/extra/segments"), { wallet: false });

await visit("rapid clicking the sorts", async (page) => {
  await go("/leaderboard")(page);
  for (let i = 0; i < 12; i++) {
    for (const l of ["Burns", "Market cap", "Newest", "Oldest"]) {
      await page.getByRole("button", { name: new RegExp(`^${l}$`, "i") }).click({ timeout: 4000 }).catch(() => {});
    }
  }
  await page.waitForTimeout(500);
}, { wallet: false });

await visit("typing fast in search", async (page) => {
  await go("/leaderboard")(page);
  const box = page.getByPlaceholder(/name, ticker or contract/i);
  await box.type("zecstampburnxyz", { delay: 12 });
  await page.waitForTimeout(400);
  for (let i = 0; i < 15; i++) await box.press("Backspace");
  await page.waitForTimeout(600);
}, { wallet: false });

await visit("slow api (10s)", async (page) => {
  await page.route("**/api/activity*", async (r) => { await new Promise((x) => setTimeout(x, 10000)); await r.continue(); });
  await page.goto(`${URL}/leaderboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const t = await page.locator("body").innerText();
  if (!/Reading both chains/i.test(t)) console.log("      (no loading state shown while waiting)");
  await page.waitForTimeout(9000);
}, { wallet: false });

await visit("leaderboard on a phone, expanded", async (page) => {
  await go("/leaderboard")(page);
  const all = page.getByRole("button", { name: /all \d+ coins/i });
  if (await all.count()) { await all.click(); await page.waitForTimeout(1200); }
}, { wallet: false, width: 390 });

await visit("launch page on a phone", go("/launch"), { width: 390 });

await browser.close();
console.log(`\n${bad} problem line(s)`);
