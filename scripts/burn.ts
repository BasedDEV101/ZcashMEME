// Perform a real burn+memo transaction: the exact shape SPEC §3 accepts.
// Used for devnet/localnet testing and as the reference for the burn UI.
//
//   node scripts/burn.ts --amount 2000000 --to tm...
//
// Amount is in whole tokens. Never run against mainnet without approval.

import { Connection, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createBurnCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { loadOrCreateKeypair } from "../src/solana/wallet.ts";
import { MEMO_V3 } from "../src/solana/programs.ts";
import { parseTransparentAddress } from "../src/core/zcash-address.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);

const cfg = JSON.parse(readFileSync(process.env.BRIDGE_CONFIG ?? "config/devnet.json", "utf8"));
if (cfg.network === "mainnet") throw new Error("refusing to burn on mainnet from this script");

const to = args.get("to");
const parsed = to ? parseTransparentAddress(to) : null;
if (!parsed) throw new Error("--to must be a Zcash transparent address");
if (parsed.network !== cfg.zcashNetwork) throw new Error(`--to is a ${parsed.network}net address, config wants ${cfg.zcashNetwork}net`);

const whole = BigInt(args.get("amount") ?? "1000000");
const amount = whole * 10n ** BigInt(cfg.decimals);
if (amount < BigInt(cfg.minBurnRaw)) throw new Error(`below minimum burn of ${BigInt(cfg.minBurnRaw) / 10n ** BigInt(cfg.decimals)} tokens`);

const conn = new Connection(cfg.rpc, "confirmed");
const { keypair: owner } = loadOrCreateKeypair(process.env.PAYER_KEY ?? "keys/devnet-payer.json");
const mint = new PublicKey(cfg.solanaMint);
const programId = new PublicKey(cfg.tokenProgramId);
const ata = await getAssociatedTokenAddress(mint, owner.publicKey, false, programId);

const tx = new Transaction().add(
  createBurnCheckedInstruction(ata, mint, owner.publicKey, amount, cfg.decimals, [], programId),
  new TransactionInstruction({
    keys: [{ pubkey: owner.publicKey, isSigner: true, isWritable: false }],
    programId: new PublicKey(MEMO_V3),
    data: Buffer.from(to, "utf8"),
  }),
);

const sig = await sendAndConfirmTransaction(conn, tx, [owner], { commitment: "finalized" });
console.log(`burned ${whole} tokens -> ${to}`);
console.log(`signature ${sig}`);
