import { chromium } from "playwright";
const URL = process.argv[2];
const browser = await chromium.launch();
for (const [name, path, width] of [
  ["leaderboard", "/leaderboard", 1440],
  ["leaderboard-phone", "/leaderboard", 400],
  ["home", "/", 1440],
]) {
  const page = await browser.newPage({ viewport: { width, height: 1200 }, deviceScaleFactor: 2 });
  await page.goto(`${URL}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `shots/now-${name}.png`, fullPage: true });
  console.log("shot", name);
  await page.close();
}
await browser.close();
