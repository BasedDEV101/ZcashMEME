import type { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { PublicKey as SolanaPublicKey } from "@solana/web3.js";
import {
  METEORA_DBC_CONFIG_KEY,
  PARTNER_FEE_RECEIVER,
  STAMP_QUOTE_MINT,
} from "@protocol/solana/meteora-launchpad.ts";
import type { ActivityCollection } from "./activity.ts";

export interface MeteoraFeePool {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  pool: string;
  partnerBaseFeeRaw: string;
  partnerQuoteFeeRaw: string;
  migrated: boolean;
  error?: string;
}

export function isFeeAuthority(publicKey: PublicKey | null | undefined): boolean {
  return publicKey?.toBase58() === PARTNER_FEE_RECEIVER;
}

export function meteoraLaunches(collections: ActivityCollection[]): ActivityCollection[] {
  return collections
    .filter((collection) => collection.launchPlatform === "meteora")
    .sort((a, b) => (b.launchedAt ?? 0) - (a.launchedAt ?? 0));
}

export async function readMeteoraFeePools(
  connection: Connection,
  collections: ActivityCollection[],
): Promise<MeteoraFeePool[]> {
  const { DynamicBondingCurveClient, deriveDbcPoolAddress } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const client = new DynamicBondingCurveClient(connection, "confirmed");
  const config = new SolanaPublicKey(METEORA_DBC_CONFIG_KEY);
  const quoteMint = new SolanaPublicKey(STAMP_QUOTE_MINT);

  return Promise.all(meteoraLaunches(collections).map(async (collection) => {
    const baseMint = new SolanaPublicKey(collection.mint);
    const pool = deriveDbcPoolAddress(quoteMint, baseMint, config);
    try {
      const state = await client.state.getPool(pool);
      if (!state) throw new Error("Pool account was not found on mainnet.");
      if (!state.poolState.config.equals(config)) throw new Error("Pool is not owned by this launchpad config.");
      if (!state.poolState.baseMint.equals(baseMint)) throw new Error("Pool mint does not match the launch record.");
      return {
        mint: collection.mint,
        name: collection.name?.trim() || collection.symbol,
        symbol: collection.symbol,
        image: collection.image,
        pool: pool.toBase58(),
        partnerBaseFeeRaw: state.poolState.partnerBaseFee.toString(),
        partnerQuoteFeeRaw: state.poolState.partnerQuoteFee.toString(),
        migrated: state.poolState.isMigrated !== 0,
      };
    } catch (reason) {
      return {
        mint: collection.mint,
        name: collection.name?.trim() || collection.symbol,
        symbol: collection.symbol,
        image: collection.image,
        pool: pool.toBase58(),
        partnerBaseFeeRaw: "0",
        partnerQuoteFeeRaw: "0",
        migrated: false,
        error: (reason as Error).message,
      };
    }
  }));
}

export async function buildPartnerFeeClaim(
  connection: Connection,
  authority: PublicKey,
  pool: string,
): Promise<Transaction> {
  if (!isFeeAuthority(authority)) throw new Error("This wallet is not the configured fee authority.");
  const { DynamicBondingCurveClient, U64_MAX } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const client = new DynamicBondingCurveClient(connection, "confirmed");
  const transaction = await client.partner.claimPartnerTradingFee({
    feeClaimer: authority,
    payer: authority,
    pool: new SolanaPublicKey(pool),
    // Quote-only collection is configured today, but claiming both sides makes
    // this action complete if Meteora ever reports a small base-token residue.
    maxBaseAmount: U64_MAX,
    maxQuoteAmount: U64_MAX,
  });
  transaction.feePayer = authority;
  return transaction;
}

export function hasClaimableFees(pool: MeteoraFeePool): boolean {
  return BigInt(pool.partnerBaseFeeRaw) > 0n || BigInt(pool.partnerQuoteFeeRaw) > 0n;
}

export function formatTokenAmount(raw: string, decimals = 6): string {
  const value = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}
