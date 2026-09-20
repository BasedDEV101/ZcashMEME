// Mainnet dress rehearsal with a THROWAWAY token.
//
// Creates a worthless Token-2022 mint on Solana mainnet, burns some of it with
// a memo, then inscribes the NFT on Zcash mainnet. Real money, real fees, real
// consensus -- but nothing of value is destroyed, and the inscriptions carry a
// separate protocol tag so they can never be confused with the real
// collection (SPEC §2: validity is scoped to protocol + mint).
//
// Refuses to spend more than a hard ceiling. Run with --yes to proceed.

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType, TOKEN_2022_PROGRAM_ID, createBurnCheckedInstruction } from "@solana/spl-token";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadOrCreateKeypair } from "../src/solana/wallet.ts";
import { loadOrCreateKey } from "../src/zcash/wallet.ts";
import { Lightwalletd } from "../src/zcash/lightwalletd.ts";
import { MEMO_V3 } from "../src/solana/programs.ts";

const PROTOCOL = "zsamtest";                 // NOT the real collection's tag
const DECIMALS = 6;
const SUPPLY = 1_000_000_000n;
const BURN_TOKENS = 1_500_000n;
const MAX_SOL = 0.05;                        // hard ceiling on this script's spend
const CONFIG = "config/mainnet-smoke.json";

if (!process.argv.includes("--yes")) {
  console.log("dry run. re-run with --yes to spend real funds.");
}
const go = process.argv.includes("--yes");

const conn = new Connection(process.env.SOLANA_MAINNET_RPC ?? "https://api.mainnet-beta.solana.com", "confirmed");
const { keypair: payer } = loadOrCreateKeypair("keys/solana-mainnet.json");
const { key: zkey } = loadOrCreateKey("keys/zcash-mainnet.hex");
const zaddr = zkey.address("main");
const lwd = new Lightwalletd("zec.rocks:443");

const sol = await conn.getBalance(payer.publicKey) / LAMPORTS_PER_SOL;
const zats = (await lwd.utxos(zaddr)).reduce((s, u) => s + u.valueZat, 0n);
console.log(`solana payer ${payer.publicKey.toBase58()}  ${sol} SOL`);
console.log(`zcash minter ${zaddr}  ${zats} zat`);

const needSol = 0.01, needZat = 40_000n;
if (sol < needSol) { console.log(`\nNEED: ${needSol} SOL at ${payer.publicKey.toBase58()}`); process.exit(1); }
if (zats < needZat) { console.log(`\nNEED: ${needZat} zat (${Number(needZat)/1e8} ZEC) at ${zaddr}`); process.exit(1); }
if (sol > MAX_SOL) { console.log(`refusing: payer holds ${sol} SOL, above the ${MAX_SOL} ceiling for a throwaway test`); process.exit(1); }
if (!go) { console.log("\nfunded and ready. re-run with --yes."); process.exit(0); }

// 1. throwaway mint
let cfg: Record<string, unknown>;
if (existsSync(CONFIG)) {
  cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
  console.log(`reusing mint ${cfg.solanaMint}`);
} else {
  console.log("creating throwaway Token-2022 mint on mainnet…");
  const mint = await createMint(conn, payer, payer.publicKey, null, DECIMALS, undefined, undefined, TOKEN_2022_PROGRAM_ID);
  const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID);
  await mintTo(conn, payer, mint, ata.address, payer, SUPPLY * 10n ** BigInt(DECIMALS), [], undefined, TOKEN_2022_PROGRAM_ID);
  await setAuthority(conn, payer, mint, payer, AuthorityType.MintTokens, null, [], undefined, TOKEN_2022_PROGRAM_ID);
  const slot = await conn.getSlot("finalized");
  cfg = {
    network: "mainnet-smoke", rpc: conn.rpcEndpoint,
    solanaMint: mint.toBase58(), tokenProgramId: TOKEN_2022_PROGRAM_ID.toBase58(),
    decimals: DECIMALS, supply: SUPPLY.toString(),
    minBurnRaw: (1_000_000n * 10n ** BigInt(DECIMALS)).toString(),
    startSlot: slot, zcashNetwork: "main", protocol: PROTOCOL,
    holderAta: ata.address.toBase58(),
  };
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + "\n");
  console.log(`mint ${cfg.solanaMint} created, authority revoked, config written`);
}

// 2. burn with memo -> our own Zcash mainnet address, so the NFT lands somewhere we control
console.log(`burning ${BURN_TOKENS} tokens with memo ${zaddr}…`);
const tx = new Transaction().add(
  createBurnCheckedInstruction(
    new PublicKey(cfg.holderAta as string), new PublicKey(cfg.solanaMint as string), payer.publicKey,
    BURN_TOKENS * 10n ** BigInt(DECIMALS), DECIMALS, [], TOKEN_2022_PROGRAM_ID),
  new TransactionInstruction({
    keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
    programId: new PublicKey(MEMO_V3), data: Buffer.from(zaddr, "utf8"),
  }),
);
const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: "finalized" });
console.log(`burn signature ${sig}`);
console.log(`\nnext: BRIDGE_CONFIG=${CONFIG} BRIDGE_DB=state-mainnet-smoke.db node scripts/bridge.ts --once`);
lwd.close();
