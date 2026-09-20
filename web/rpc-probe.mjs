import { chromium } from "playwright";
const CANDIDATES = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://solana.drpc.org",
  "https://rpc.ankr.com/solana",
  "https://solana.api.onfinality.io/public",
];
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://www.zcashstamp.com/", { waitUntil: "domcontentloaded" });
for (const url of CANDIDATES) {
  const r = await page.evaluate(async (u) => {
    try {
      const res = await fetch(u, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [{ commitment: "confirmed" }] }),
      });
      const j = await res.json().catch(() => null);
      return { status: res.status, ok: Boolean(j?.result?.value?.blockhash) };
    } catch (e) { return { status: "CORS/network", ok: false, err: String(e).slice(0, 60) }; }
  }, url);
  console.log(`${r.ok ? "OK  " : "FAIL"} ${String(r.status).padEnd(14)} ${url} ${r.err ?? ""}`);
}
await browser.close();
