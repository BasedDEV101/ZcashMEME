import { chromium } from "playwright";
const URL = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));

await page.goto(`${URL}/selftest.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
console.log("LIVE derivation:", (await page.locator("#out").innerText()).split("\n").pop());

await page.goto(`${URL}/`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /create a zcash address/i }).click();
await page.waitForTimeout(600);
const body = await page.locator("body").innerText();
const PROOF = "t1P2GcxGhzeM5tPk3r3JsGh1tEVArD4C2fB";
const addr = [...body.matchAll(/\bt1[a-km-zA-HJ-NP-Z1-9]{20,}\b/g)].map((m) => m[0]).find((a) => a !== PROOF);
const words = /^(?:[a-z]+ ){11}[a-z]+$/m.test(body);
console.log("LIVE wallet generation:", addr ? `${addr.slice(0, 14)}… + ${words ? "12 words" : "NO WORDS"}` : "FAILED");
console.log("LIVE console errors:", errs.length);
errs.slice(0, 3).forEach((e) => console.log("   !", e.slice(0, 140)));
await page.screenshot({ path: "shots/live.png" });
await browser.close();
