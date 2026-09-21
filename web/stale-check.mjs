import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`${process.argv[2]}/launch`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const body = await page.locator("body").innerText();
console.log("notice hidden on a fresh load :", !/has been open since before/i.test(body));
// Pretend the served build moved on, and check the notice appears.
await page.route("**/", (r) => r.fulfill({ status: 200, contentType: "text/html",
  body: '<html><body><script type="module" src="/assets/main-OTHER.js"></script></body></html>' }));
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await page.waitForTimeout(1500);
console.log("notice appears when it moves  :", /has been open since before/i.test(await page.locator("body").innerText()));
console.log("console errors                :", errs.length);
await browser.close();
