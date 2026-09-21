// Exercise the live site and report anything it throws.
import { chromium } from "playwright";
import { MOCK } from "./mock-wallet.mjs";

const URL = process.argv[2];
const browser = await chromium.launch();
const problems = [];

async function visit(name, width, steps, { wallet = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const seen = [];
  page.on("pageerror", (e) => seen.push(`THROWN  ${e.message}`));
  // The browser logs its own console error for any failed response. Two of
  // these cases break the API on purpose, so that log is the test working,
  // not the site failing -- counting it meant the suite never read as clean
  // and a real regression would have hidden among the noise.
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource: the server responded with a status of \d\d\d/.test(m.text())) return;
    seen.push(`CONSOLE ${m.text()}`);
  });
  page.on("requestfailed", (r) => seen.push(`REQFAIL ${r.url().slice(0, 80)} ${r.failure()?.errorText ?? ""}`));
  if (wallet) await page.addInitScript(MOCK);
  try {
    await steps(page);
  } catch (e) {
    seen.push(`STEP    ${String(e).split("\n")[0].slice(0, 160)}`);
  }
  // A crashed React tree leaves an empty root.
  const rootEmpty = await page.evaluate(() => (document.getElementById("root")?.childElementCount ?? 0) === 0);
  if (rootEmpty) seen.push("BLANK   #root rendered nothing");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) seen.push(`OVERFLOW page scrolls sideways by ${overflow}px`);
  await page.close();
  const unique = [...new Set(seen)];
  console.log(`${unique.length ? "✗" : "✓"} ${name} (${width}px)`);
  for (const s of unique) { console.log("    " + s.slice(0, 165)); problems.push(`${name}: ${s}`); }
}

const load = (path) => async (page) => {
  await page.goto(`${URL}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
};

for (const w of [1440, 768, 390]) {
  await visit("home", w, load("/"));
  await visit("launch", w, load("/launch"));
  await visit("leaderboard", w, load("/leaderboard"));
}

await visit("leaderboard: every sort + search", 1440, async (page) => {
  await load("/leaderboard")(page);
  for (const label of ["Market cap", "Supply gone", "Newest", "Oldest", "Burns"]) {
    await page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).click();
    await page.waitForTimeout(350);
  }
  const box = page.getByPlaceholder(/name, ticker or contract/i);
  for (const q of ["z", "ZEC", "  ", "'; DROP TABLE--", "😀", "4tZDUmwZBSjmaguBZFtN8VwtR2CULdP5n15R8MZqPkxX", ""]) {
    await box.fill(q);
    await page.waitForTimeout(250);
  }
  const all = page.getByRole("button", { name: /all \d+ coins/i });
  if (await all.count()) { await all.click(); await page.waitForTimeout(600); }
});

await visit("navigation back and forth", 1440, async (page) => {
  await load("/")(page);
  for (const label of ["Launch a coin", "Leaderboard", "Burn", "Leaderboard", "Burn"]) {
    await page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).click();
    await page.waitForTimeout(700);
  }
  await page.goBack(); await page.waitForTimeout(600);
  await page.goBack(); await page.waitForTimeout(600);
  await page.goForward(); await page.waitForTimeout(600);
});

await visit("launch form: empty and bad input", 1440, async (page) => {
  await load("/launch")(page);
  await page.getByRole("button", { name: /mockwallet/i }).click();
  await page.waitForTimeout(900);
  await page.getByLabel(/^name$/i).fill("x".repeat(60));
  await page.getByLabel(/ticker/i).fill("!!!!lowercase!!!!");
  await page.getByLabel(/description/i).fill("y".repeat(900));
  await page.getByLabel(/^website$/i).fill("not a url");
  await page.waitForTimeout(400);
  await page.getByLabel(/^name$/i).fill("");
  await page.getByLabel(/ticker/i).fill("");
  await page.waitForTimeout(400);
}, { wallet: true });

await visit("wallet connect then disconnect", 1440, async (page) => {
  await load("/launch")(page);
  await page.getByRole("button", { name: /mockwallet/i }).click();
  await page.waitForTimeout(1000);
  const dc = page.getByRole("button", { name: /^disconnect$/i });
  if (await dc.count()) { await dc.click(); await page.waitForTimeout(800); }
  await page.getByRole("button", { name: /mockwallet/i }).click();
  await page.waitForTimeout(800);
}, { wallet: true });

await visit("burn page with a wallet", 1440, async (page) => {
  await load("/")(page);
  await page.getByRole("button", { name: /mockwallet/i }).first().click();
  await page.waitForTimeout(1500);
}, { wallet: true });

await visit("api down: does the page survive", 1440, async (page) => {
  await page.route("**/api/activity*", (r) => r.fulfill({ status: 502, contentType: "application/json", body: '{"error":"boom"}' }));
  await load("/leaderboard")(page);
});

await visit("api returns junk shapes", 1440, async (page) => {
  await page.route("**/api/activity*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ collections: [{ mint: "abc", symbol: "X" }], burns: [{ signature: "s", mint: "abc" }] }) }));
  await load("/leaderboard")(page);
});

await browser.close();
console.log(`\n${problems.length} problem line(s) across the run`);
