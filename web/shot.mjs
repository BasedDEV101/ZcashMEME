import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch();
for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `shots/${name}-top.png` });
  await page.screenshot({ path: `shots/${name}-full.png`, fullPage: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(`${name}: height ${h}px, horizontal overflow: ${overflow}, console errors: ${errors.length}`);
  errors.slice(0, 4).forEach((e) => console.log(`   ! ${e.slice(0, 160)}`));
  await page.close();
}
await browser.close();
