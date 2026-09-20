import { chromium } from "playwright";
const URL = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`${URL}/leaderboard`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4500);

const rows = () => page.locator("ol > li").count();
console.log("1. rows shown before search :", await rows(), "(capped at 20)");
console.log("2. 'All N coins' present    :", await page.getByRole("button", { name: /all \d+ coins/i }).count() > 0);

const box = page.getByPlaceholder(/name, ticker or contract/i);
await box.fill("zeb");
await page.waitForTimeout(400);
console.log("3. search 'zeb' ->", await rows(), "row(s):", (await page.locator("ol > li").first().innerText()).split("\n")[0]);

await box.fill("EqFG72Z35r8cAV8mKu3UK2L8NUTR1ZNyMr88E4BnwN8Q");
await page.waitForTimeout(400);
console.log("4. search by contract ->", await rows(), "row(s)");

await box.fill("zzzznotacoin");
await page.waitForTimeout(400);
const body = await page.locator("body").innerText();
console.log("5. no matches message       :", /Nothing matches/.test(body));

await box.fill("");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /^oldest$/i }).click();
await page.waitForTimeout(400);
const firstRow = await page.locator("ol > li").first().innerText();
console.log("6. oldest -> first row      :", firstRow.split("\n").slice(0, 2).join(" | "));
console.log("7. 'First entry' marked     :", /First entry/i.test(await page.locator("body").innerText()));
console.log("console errors              :", errs.length);
await browser.close();
