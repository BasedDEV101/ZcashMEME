import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2 });
await page.goto(`${process.argv[2]}/leaderboard`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4500);
await page.evaluate(() => window.scrollTo(0, 1250));
await page.waitForTimeout(400);
await page.screenshot({ path: "shots/phone-leaderboard.png" });
// does anything overflow sideways?
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("horizontal overflow:", overflow, "px");
await browser.close();
