import { chromium } from "playwright";
import { MOCK } from "./mock-wallet.mjs";
const URL = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on("requestfailed", (r) => console.log("NET FAIL:", r.url().slice(0, 70), r.failure()?.errorText));
page.on("console", (m) => { if (m.type() !== "warning") console.log(`[${m.type()}]`, m.text().slice(0, 160)); });
await page.addInitScript(MOCK);
await page.goto(`${URL}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.getByRole("button", { name: /mockwallet/i }).click();
await page.waitForTimeout(900);
{
  const t = await page.locator("body").innerText();
  const step = t.split("WHERE THE CERTIFICATE GOES")[0].split("YOUR SOLANA WALLET")[1] ?? "";
  console.log("step 1 shows:", JSON.stringify(step.trim().slice(0, 90)));
}
await page.getByRole("button", { name: /create a zcash address/i }).click();
await page.waitForTimeout(400);
await page.getByRole("checkbox").check();
await page.getByLabel(/amount of/i).fill("1500000");
await page.waitForTimeout(300);
const btn = page.getByRole("button", { name: /destroy|confirm/i });
console.log("before click :", (await btn.innerText()).trim(), "| disabled:", await btn.isDisabled());
await btn.click();
await page.evaluate(() => {
  window.__clicks = 0;
  document.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { window.__clicks++; }));
});
await btn.click();
for (const ms of [1000, 3000, 6000]) {
  await page.waitForTimeout(ms);
  const b = page.getByRole("button", { name: /destroy|confirm/i });
  console.log(`after ${ms}ms  :`, (await b.innerText()).trim(), "| captured:", await page.evaluate(() => window.__captured?.length ?? 0), "| clicks:", await page.evaluate(() => window.__clicks ?? -1));
}
const red = await page.evaluate(() => [...document.querySelectorAll(".text-stamp-deep")].map((e) => e.textContent).filter(Boolean));
console.log("red messages:", red.slice(0, 4));
const body = await page.locator("body").innerText();
const after = body.split("\n").filter((l) => /error|fail|cannot|invalid|rpc|403|429|fetch/i.test(l));
console.log("visible messages:", after.slice(0, 5));
console.log("captured txs:", (await page.evaluate(() => window.__captured?.length ?? 0)));
await browser.close();
