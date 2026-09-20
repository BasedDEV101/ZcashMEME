import { chromium } from "playwright";
const URL = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));

for (const path of ["/leaderboard", "/", "/launch"]) {
  await page.goto(`${URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText();
  const h = (await page.locator("h1, h2").first().innerText()).trim();
  console.log(`\n${path}  ->  ${h}`);
  if (path === "/leaderboard") {
    const rows = await page.locator("ol > li").count();
    console.log(`  leaderboard rows   : ${rows}`);
    console.log(`  ranked by burns    : ${/ranked by tokens destroyed/i.test(body)}`);
    console.log(`  burn feed present  : ${/Every burn/i.test(body)}`);
    console.log(`  still "Reading"    : ${/Reading (both chains|Solana)…/.test(body)}`);
  }
  if (path === "/launch") {
    console.log(`  funding is automatic: ${/already paid for/i.test(body)}`);
    console.log(`  no "Fund it" ask   : ${!/Fund it and stamps issue/i.test(body)}`);
  }
  const gh = page.locator('a[href="https://github.com/BasedDEV101/ZcashMEME"]');
  console.log(`  github links       : ${await gh.count()}`);
  await page.screenshot({ path: `shots/page${path.replace(/\//g, "-") || "-home"}.png` });
}
console.log(`\nconsole errors: ${errs.length}`);
errs.slice(0, 3).forEach((e) => console.log("  !", e.slice(0, 140)));
await browser.close();
