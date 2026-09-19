// Read-only probe: confirm live RPC shapes match what normalize.ts expects,
// across transaction versions.
import { SolanaRpc, readMint } from "../src/solana/rpc.ts";
import { normalizeTransaction } from "../src/solana/normalize.ts";
import { MEMO_V3 } from "../src/solana/programs.ts";

const rpc = new SolanaRpc(process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com");
const usdc = await readMint(rpc, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
console.log("readMint(USDC):", { ...usdc, supply: usdc.supply.toString() });

const sigs = await rpc.getSignaturesForAddress(MEMO_V3, { limit: 40 });
const byVersion = new Map<string, number>();
let memoOk = 0, memoMissing = 0;
for (const s of sigs) {
  if (s.err) continue;
  const tx = await rpc.getTransaction(s.signature) as any;
  if (!tx) continue;
  const v = String(tx.version ?? "legacy");
  byVersion.set(v, (byVersion.get(v) ?? 0) + 1);
  const n = normalizeTransaction(tx, { finalized: true });
  n.memos.length > 0 ? memoOk++ : memoMissing++;
}
console.log("tx versions seen:", Object.fromEntries(byVersion));
console.log(`memo extracted: ${memoOk}, memo program touched but no memo extracted: ${memoMissing}`);
