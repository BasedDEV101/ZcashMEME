// Exercise the market record plate against every shape its data really takes.
// The cap history lives in localStorage, so the cases worth testing are the
// storage ones: absent, junk, throwing, flat, and one reading that dwarfs the
// rest. Run: node chart-check.mjs http://localhost:4178
import { chromium } from "playwright";

const URL = process.argv[2];
if (!URL) { console.error("usage: node chart-check.mjs <base-url>"); process.exit(1); }

const KEY = "zip227.market-history.v1";
const ZEC = "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS";
const SOL = "So11111111111111111111111111111111111111112";

const coin = (mint, symbol, name, marketCapQuote, quoteMint, extra = {}) => ({
  mint, symbol, name, image: null, minWholeTokens: "1000000", signature: null,
  launchedAt: 1758300000, launchedBy: null, decimals: 6, burnedTokens: "12000000",
  burnCount: 4, refusedCount: 0, burners: 3, destroyedTokens: "14000000",
  marketCapQuote, quoteMint, slot: 1000, ...extra,
});

const ACTIVITY = {
  collections: [
    coin("A".repeat(43), "INKWELL", "Inkwell", "489234567890", ZEC),
    coin("B".repeat(43), "FOLIO", "Folio Press", "91234567890", ZEC),
    coin("C".repeat(43), "STAMP", "Stamp", "4120000000000", SOL),
    coin("D".repeat(43), "QUILL", "Quill", "760000000", ZEC),
    coin("E".repeat(43), "NOCAP", "No cap yet", null, ZEC),
    coin("F".repeat(43), "JUNK", "Malformed cap", "not-a-number", ZEC),
    coin("G".repeat(43), "EMPTY", "Empty string cap", "", null),
  ],
  burns: [], feeSol: 0.5, historyUpdated: null, computedAt: new Date().toISOString(),
};

/** A believable series: readings every ~40 minutes, drifting with noise. */
function drift(base, n, slope, jitter) {
  const now = Date.now();
  const out = [];
  let v = base;
  for (let i = n - 1; i >= 0; i--) {
    v = v * (1 + slope + (Math.sin(i * 2.7) + Math.cos(i * 1.31)) * jitter);
    out.push({ t: now - i * 40 * 60_000, value: String(Math.max(1, Math.round(v))) });
  }
  return out;
}

const SEEDS = {
  rising: { [ "A".repeat(43) ]: drift(310e9, 42, 0.012, 0.01), [ "B".repeat(43) ]: drift(120e9, 30, -0.006, 0.013) },
  flat: { [ "A".repeat(43) ]: Array.from({ length: 24 }, (_, i) => ({ t: Date.now() - (23 - i) * 40 * 60_000, value: "489234567890" })) },
  outlier: { [ "A".repeat(43) ]: [
    ...drift(4e9, 18, 0.004, 0.006),
    { t: Date.now() - 40 * 60_000, value: "1600000000000" },
    { t: Date.now(), value: "4300000000" },
  ] },
  junk: null,       // storage holds a string that is not JSON
  poisoned: {},     // filled below with entries of the wrong shape
  throws: undefined, // storage itself is unavailable
};
SEEDS.poisoned = {
  [ "A".repeat(43) ]: [{ t: "yesterday", value: "1" }, { t: 0, value: undefined }, { value: "5" }, { t: Date.now(), value: "489234567890" }],
  [ "B".repeat(43) ]: "not an array",
};

const problems = [];
const browser = await chromium.launch();

async function run(name, width, seed, steps = async () => {}) {
  const page = await browser.newPage({ viewport: { width, height: 1200 } });
  const seen = [];
  page.on("pageerror", (e) => seen.push(`THROWN  ${e.message}`));
  // @solana/wallet-adapter-react's useLocalStorage logs the throw itself when
  // storage is unavailable, on every route including ones with no plate on
  // them. Not ours, and not something this check can fix from here.
  const THEIRS = /QuotaExceededError/;
  page.on("console", (m) => m.type() === "error" && !THEIRS.test(m.text()) && seen.push(`CONSOLE ${m.text()}`));

  await page.addInitScript(({ key, seed, kind }) => {
    try {
      if (kind === "throws") {
        const boom = () => { throw new DOMException("QuotaExceededError"); };
        Object.defineProperty(window, "localStorage", { configurable: true, get: () => ({ getItem: boom, setItem: boom, removeItem: boom }) });
        return;
      }
      localStorage.clear();
      if (kind === "junk") localStorage.setItem(key, "{{{ not json");
      else if (seed) localStorage.setItem(key, JSON.stringify(seed));
    } catch { /* the point of the test */ }
  }, { key: KEY, seed: SEEDS[seed] ?? null, kind: seed });

  await page.route("**/api/activity*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ACTIVITY) }));

  await page.goto(`${URL}/leaderboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  try { await steps(page); } catch (e) { seen.push(`STEP    ${String(e).split("\n")[0].slice(0, 150)}`); }

  const plate = await page.locator("#market").count();
  if (plate === 0) seen.push("MISSING #market did not render");
  const broke = await page.locator("#market").getByText(/could not be drawn/i).count();
  if (broke) seen.push("BOUNDARY the market record threw and fell back");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) seen.push(`OVERFLOW page scrolls sideways by ${overflow}px`);
  const wide = await page.evaluate(() => {
    const el = document.querySelector("#market");
    return el ? Math.round(el.scrollWidth - el.clientWidth) : 0;
  });
  if (wide > 1) seen.push(`SECTION  #market overflows its own box by ${wide}px`);

  await page.close();
  const unique = [...new Set(seen)];
  console.log(`${unique.length ? "✗" : "✓"} ${name} (${width}px)`);
  for (const s of unique) { console.log("    " + s.slice(0, 165)); problems.push(`${name}: ${s}`); }
}

for (const w of [1440, 768, 390]) {
  await run("fresh browser, first reading", w, "empty");
  await run("a real series", w, "rising");
}
await run("a cap that never moved", 1440, "flat");
await run("one reading dwarfing the rest", 1440, "outlier");
await run("storage holds junk", 1440, "junk");
await run("storage holds the wrong shapes", 1440, "poisoned");
await run("storage throws on every call", 1440, "throws");
await run("storage throws on every call", 390, "throws");

await run("switching coins", 1440, "rising", async (page) => {
  const select = page.locator("#market select");
  for (const label of [/FOLIO/, /STAMP/, /QUILL/, /INKWELL/]) {
    await select.selectOption({ label: await select.locator("option", { hasText: label }).first().innerText() });
    await page.waitForTimeout(400);
  }
});

await run("reload keeps appending", 1440, "rising", async (page) => {
  for (let i = 0; i < 3; i++) { await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(1500); }
  const n = await page.evaluate((k) => {
    try { return JSON.parse(localStorage.getItem(k))["AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"].length; } catch { return -1; }
  }, KEY);
  // Four loads inside one five-minute window must not become four readings.
  if (n !== 43) throw new Error(`expected 43 readings after four loads, got ${n}`);
});

await browser.close();
console.log(`\n${problems.length} problem line(s) across the run`);
process.exit(problems.length ? 1 : 0);
