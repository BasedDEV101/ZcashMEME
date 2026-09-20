import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://www.zcashstamp.com/", { waitUntil: "domcontentloaded" });
const out = await page.evaluate(async () => {
  const results = [];
  for (const url of ["https://pump.fun/api/ipfs", "https://pump.fun/api/ipfs/"]) {
    try {
      const fd = new FormData();
      fd.append("file", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "t.png");
      fd.append("name", "probe"); fd.append("symbol", "PROBE");
      fd.append("description", "probe"); fd.append("showName", "true");
      const res = await fetch(url, { method: "POST", body: fd });
      const text = await res.text();
      results.push({ url, status: res.status, body: text.slice(0, 120) });
    } catch (e) {
      results.push({ url, status: "blocked", err: String(e).slice(0, 100) });
    }
  }
  return results;
});
out.forEach((r) => console.log(`${String(r.status).padEnd(10)} ${r.url}  ${r.body ?? r.err}`));
await browser.close();
