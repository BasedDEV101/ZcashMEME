// Export every protocol burn of a mint to a snapshot the site can serve.
//
// Why a snapshot at all: $STAMP carries 1.28M signatures and grows hourly, so
// walking its whole history cannot happen inside a web request. Young
// collections are scanned live by /api/activity; this fills in the history
// behind them, and the two are merged by signature.
//
//   node --experimental-strip-types scripts/export-burns.ts <mint> <SYMBOL> <minWholeTokens>

import { SolanaRpc, readMint } from "../src/solana/rpc.ts";
import { normalizeTransaction } from "../src/solana/normalize.ts";
import { evaluateBurn } from "../src/core/validity.ts";
import { solanaRpcUrl, describeRpc } from "../src/env.ts";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = new URL("../api/_history.json", import.meta.url);
const [mint, symbol, min = "0"] = process.argv.slice(2);
if (!mint || !symbol) throw new Error("usage: export-burns.ts <mint> <SYMBOL> <minWholeTokens>");

const url = solanaRpcUrl();
console.log(`scanning ${symbol} ${mint} via ${describeRpc(url)}`);
const rpc = new SolanaRpc(url);
const { tokenProgramId, decimals } = await readMint(rpc, mint);
const unit = 10n ** BigInt(decimals);
const cfg = {
  solanaMint: mint, tokenProgramId, decimals,
  minBurnRaw: BigInt(min) * unit, startSlot: 0,
  zcashNetwork: "main" as const, protocol: "zsam",
};

// 1. list the whole history, keeping only memo-carrying signatures. SPEC 3.8
//    requires a memo, so this filter cannot drop a valid burn.
const candidates: { signature: string }[] = [];
let before: string | undefined;
let listed = 0;
for (;;) {
  const page = await rpc.getSignaturesForAddress(mint, { before, limit: 1000 });
  listed += page.length;
  for (const s of page) if (s.memo && !s.err) candidates.push({ signature: s.signature });
  if (page.length < 1000) break;
  before = page[page.length - 1].signature;
  if (listed % 50_000 === 0) console.log(`  ${listed} signatures, ${candidates.length} carry a memo`);
}
console.log(`listed ${listed} signatures; ${candidates.length} carry a memo`);

// 2. fetch and judge each one by the same rule the bridge uses.
const burns = [];
for (const { signature } of candidates) {
  const raw = await rpc.getTransaction(signature, "finalized");
  if (!raw) continue;
  const tx = normalizeTransaction(raw, { finalized: true });
  const burned = tx.burns.find((b) => b.mint === mint);
  if (!burned) continue;
  const v = evaluateBurn(tx, cfg);
  burns.push(v.ok
    ? { signature: tx.signature, mint, symbol, slot: tx.slot, blockTime: tx.blockTime,
        burner: v.burn.authority, amount: (v.burn.amount / unit).toString(),
        zcashAddress: v.burn.zcashAddress, ok: true }
    : { signature: tx.signature, mint, symbol, slot: tx.slot, blockTime: tx.blockTime,
        burner: burned.sourceOwner, amount: (burned.amount / unit).toString(),
        zcashAddress: null, ok: false, reason: v.reason });
}

// 3. merge with whatever is already in the snapshot for other mints.
let existing: { burns?: typeof burns } = {};
try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch { /* first run */ }
const kept = (existing.burns ?? []).filter((b) => b.mint !== mint);
const all = [...kept, ...burns].sort((a, b) => b.slot - a.slot);
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), burns: all }, null, 2) + "\n");
console.log(`${symbol}: ${burns.filter((b) => b.ok).length} valid, ${burns.filter((b) => !b.ok).length} refused`);
console.log(`snapshot now holds ${all.length} burns across ${new Set(all.map((b) => b.mint)).size} mint(s)`);
