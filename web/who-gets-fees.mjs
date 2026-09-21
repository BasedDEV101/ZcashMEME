import { Connection, PublicKey } from "@solana/web3.js";
import { PumpSdk, bondingCurvePda, creatorVaultPda, feeSharingConfigPda } from "@pump-fun/pump-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const conn = new Connection("https://solana-rpc.publicnode.com", "confirmed");
const mint = new PublicKey(process.argv[2]);
const ZEC = new PublicKey("A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS");
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const OPERATOR = "26oK69pYx7R25ULts9hLYF2HpTnZ421jPYMPsds9GtYA";
const LAUNCHER = "8j8qPJrv9drpFkrqkR6wnnExeYK2qvXeAp3QQ1qYkQXg";

const acc = await conn.getAccountInfo(bondingCurvePda(mint));
if (!acc) { console.log("no bonding curve"); process.exit(1); }
const c = new PumpSdk().decodeBondingCurve(acc);
const creator = c.creator.toBase58();

console.log("coin          :", mint.toBase58());
console.log("quote / pair  :", c.quoteMint.toBase58(), c.quoteMint.equals(ZEC) ? "(ZEC)" : "(not ZEC)");
console.log("creator fee   :", c.creatorFeeBps?.toString(), "bps =", Number(c.creatorFeeBps) / 100 + "%");
console.log("creator field :", creator);
console.log("  which is    :", creator === OPERATOR ? "your operator wallet 26oK69…"
  : creator === LAUNCHER ? "the launching test wallet 8j8qPJ…" : "someone else");

// Is a fee-sharing config splitting it to anyone else?
const cfg = await conn.getAccountInfo(feeSharingConfigPda(mint));
console.log("fee sharing   :", cfg ? `present (${cfg.data.length} bytes) — split applies` : "none — the creator takes it all");

// Where the fee accrues, and what is in there now.
const vault = creatorVaultPda(c.creator);
const vaultZec = getAssociatedTokenAddressSync(ZEC, vault, true, TOKEN);
console.log("accrues to    :", vault.toBase58(), "(creator vault)");
for (const [label, addr] of [["  vault SOL", vault], ["  vault ZEC", vaultZec]]) {
  const info = await conn.getAccountInfo(addr);
  if (!info) { console.log(`${label}   : account not created yet (nothing claimed into it)`); continue; }
  if (addr.equals(vault)) { console.log(`${label}   : ${info.lamports / 1e9} SOL`); continue; }
  const bal = await conn.getTokenAccountBalance(addr).catch(() => null);
  console.log(`${label}   : ${bal?.value?.uiAmountString ?? "0"} ZEC`);
}
