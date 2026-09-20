// Visual + behavioural check in a real browser. Node tests cannot catch a
// browser-only failure: node:crypto exists in Node and not in the browser, so
// a green suite said nothing about whether wallet generation actually works.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const browser = await chromium.launch();
let failures = 0;

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://100.86.39.78:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/${name}-top.png` });
  await page.screenshot({ path: `shots/${name}-full.png`, fullPage: true });

  // The step the whole funnel depends on: generating a Zcash wallet.
  await page.getByRole("button", { name: /create a zcash address/i }).click();
  await page.waitForTimeout(400);
  const body = await page.locator("body").innerText();
  // The hero shows a real mainnet address as proof. Matching the first t1 on
  // the page would pass even if generation were broken, so exclude it and
  // require the 12 words alongside.
  const PROOF_ADDRESS = "t1P2GcxGhzeM5tPk3r3JsGh1tEVArD4C2fB";
  const all = [...body.matchAll(/\bt1[a-km-zA-HJ-NP-Z1-9]{20,}\b/g)].map((m) => m[0]);
  const address = all.find((a) => a !== PROOF_ADDRESS);
  const words = body.match(/^(?:[a-z]+ ){11}[a-z]+$/m);
  const ok = Boolean(address) && Boolean(words);
  if (!ok) failures++;
  console.log(`${name}: generated address ${address ? address.slice(0, 14) + "…" : "MISSING"}, 12 words ${words ? "yes" : "MISSING"}`);

  await page.screenshot({ path: `shots/${name}-wallet.png`, fullPage: name === "mobile" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(`${name}: horizontal overflow ${overflow}, console errors ${errors.length}`);
  errors.slice(0, 3).forEach((e) => { failures++; console.log(`   ! ${e.slice(0, 150)}`); });
  await page.close();
}
await browser.close();
console.log(failures === 0 ? "BROWSER CHECK PASSED" : `BROWSER CHECK FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
