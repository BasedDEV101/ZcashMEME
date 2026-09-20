import { chromium } from "playwright";
const URL = process.argv[2] ?? "https://www.zcashstamp.com";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));

await page.goto(`${URL}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const body0 = await page.locator("body").innerText();
console.log("shows 'not launched' notice :", /has not launched/i.test(body0));

// 1. destination wallet
await page.getByRole("button", { name: /create a zcash address/i }).click();
await page.waitForTimeout(500);
await page.getByRole("checkbox").check();

// 2. amount
const amount = page.getByLabel(/amount of/i);
await amount.fill("1000000");
await page.waitForTimeout(400);

const burn = page.getByRole("button", { name: /destroy/i });
console.log("burn button label           :", (await burn.innerText()).trim());
console.log("burn button ENABLED         :", !(await burn.isDisabled()));
console.log("wallet step shows a wallet  :", /No Solana wallet detected/i.test(await page.locator("body").innerText()) ? "no wallet in this headless browser (expected)" : "wallet detected");
console.log("console errors              :", errs.length);
errs.slice(0, 3).forEach((e) => console.log("   !", e.slice(0, 140)));
await page.screenshot({ path: "shots/burn-flow.png", fullPage: false });
await browser.close();
