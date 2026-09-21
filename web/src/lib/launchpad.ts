import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { encodeDeployRequest } from "@protocol/core/deploy-request.ts";
import { MEMO_V3 } from "@protocol/solana/programs.ts";
import { assertNotForbidden } from "@protocol/core/forbidden.ts";

/** What it costs to launch, and who receives it.
 *
 * Deliberately small: the pad earns from pump.fun's creator fees on every
 * trade, so the launch fee is not the business model. It exists to make
 * spamming the register cost something. */
export const LAUNCH_FEE_SOL = 0.5;
export const LAUNCH_FEE_LAMPORTS = BigInt(Math.round(LAUNCH_FEE_SOL * 1e9));

/** Fees land here. Change this to move launch revenue to a different wallet. */
export const OPERATOR_ADDRESS = "26oK69pYx7R25ULts9hLYF2HpTnZ421jPYMPsds9GtYA";

/**
 * The creator fee every coin launched here charges, and where it goes.
 *
 * pump.fun caps a configurable creator fee at 300 bps and only honours one
 * while its `creatorFeeConfigurable` gate is on; both were checked against the
 * live Global before settling on 200. The launcher still creates the coin and
 * is its creator on pump.fun -- the fee is redirected by a fee-sharing config,
 * not by taking their name off it.
 */
export const CREATOR_FEE_BPS = 200;

/**
 * What coins launched here trade against.
 *
 * ZEC, not SOL. A pad whose whole subject is Zcash quoting its coins in
 * somebody else's currency is a detail people notice. pump.fun's `create_v2`
 * takes a quote mint from an admin-managed list, and this one is on it --
 * checked against the live QuoteControl account, not assumed.
 *
 * Its token program is read from chain at build time rather than guessed:
 * every quote ATA, the pool's and each shareholder's, is derived with it.
 */
export const QUOTE_MINT = "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS";
export const QUOTE_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const QUOTE_SYMBOL = "ZEC";

/**
 * The address lookup table every launch is compiled against.
 *
 * A launch touches 18 accounts that never change -- the pump programs and
 * their PDAs, the token and memo programs, WSOL, the operator address. At 32
 * bytes each they pushed the transaction to 1422 bytes against Solana's 1232
 * limit, which is why the launch briefly needed two signatures. Through the
 * table they cost a byte each, and it fits in one again.
 *
 * Created once by scripts/create-lookup-table.ts; its contents are derived,
 * not listed by hand. Replacing it means re-running that script.
 */
export const LOOKUP_TABLE = "3zEFdQiMCRF5ew9KuLkeT4XVnRSRJjv58HWv8LSxvzJP";

/**
 * What a coin launched here actually charges its traders, as a percentage.
 *
 * Derived from pump's live schedule rate, NOT from CREATOR_FEE_BPS: the
 * instruction asks for 200 bps and the program stores zero, so a site that
 * printed the requested number would be telling launchers something untrue
 * about their own coin.
 */
export const SCHEDULE_CREATOR_FEE_BPS = 30;
export const CREATOR_FEE_PERCENT = SCHEDULE_CREATOR_FEE_BPS / 100;

/** Roughly what one stamp costs the collection's funding balance, in ZEC. */
export const STAMP_COST_ZEC = 0.00030546;

/** Stamps the launch fee pays for. Matches ALLOWANCE_STAMPS in
    src/zcash/autofund.ts, which is what actually enforces it. */
export const ALLOWANCE_STAMPS = 2000;

export interface Collection {
  sym: string;
  mint: string;
  dec: number;
  min: string;
  from: number;
  inscriptionId: string;
  height: number;
  funding: string;
  stamps?: number;
  fundedZat?: string;
}

/**
 * A deploy request: pay the fee, say what you are registering.
 *
 * Same shape as a burn — one transaction, a payment and a memo — so the
 * operator's watcher verifies it by the same kind of rule, and the request is
 * public and checkable rather than an email nobody else can audit.
 */
export function buildDeployRequest(payer: string, mint: string, symbol: string, minWholeTokens: bigint): TransactionInstruction[] {
  assertNotForbidden(payer, "a collection registration");
  const from = new PublicKey(payer);
  return [
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: new PublicKey(OPERATOR_ADDRESS),
      lamports: Number(LAUNCH_FEE_LAMPORTS),
    }),
    new TransactionInstruction({
      keys: [{ pubkey: from, isSigner: true, isWritable: false }],
      programId: new PublicKey(MEMO_V3),
      data: new TextEncoder().encode(
        encodeDeployRequest({ mint, symbol, minWholeTokens }),
      ) as unknown as Buffer,
    }),
  ];
}
