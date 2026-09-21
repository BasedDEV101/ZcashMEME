/**
 * Launchpad-owned Meteora DBC configuration, created on Solana mainnet.
 *
 * The website still verifies the account owner and critical settings directly
 * from chain before it lets a wallet build a launch transaction.
 */
export const METEORA_DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
export const STAMP_QUOTE_MINT = "EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc";
export const METEORA_DBC_CONFIG_KEY = "F8YCGxB7KmWPJokzmwdvpfbnBkYk9rU8Um1sMz45aGrJ";

/** Public wallet selected to authorize and receive partner fee claims. */
export const PARTNER_FEE_RECEIVER = "26oK69pYx7R25ULts9hLYF2HpTnZ421jPYMPsds9GtYA";

export const METEORA_DBC_CONFIG = Object.freeze({
  status: "mainnet-live" as const,
  configKey: METEORA_DBC_CONFIG_KEY,
  configDeployed: true,
  feeClaimAuthority: PARTNER_FEE_RECEIVER,
  quote: Object.freeze({
    mint: STAMP_QUOTE_MINT,
    symbol: "STAMP",
    decimals: 6,
    collectTradingFeesIn: "quote" as const,
  }),
  token: Object.freeze({
    decimals: 6,
    totalSupply: 1_000_000_000,
    curveSupply: 793_100_000,
    migrationSupply: 206_900_000,
    authority: "immutable" as const,
  }),
  curve: Object.freeze({
    model: "pump-shaped-constant-product" as const,
    virtualBaseReserve: 1_073_000_000,
    virtualQuoteReserve: 875_000,
    graduationQuoteTarget: 2_480_000,
  }),
  fees: Object.freeze({
    totalTradingFeeBps: 150,
    protocolSharePercent: 20,
    protocolTradingFeeBps: 30,
    partnerTradingFeeBps: 120,
    creatorTradingFeePercent: 0,
    dynamicFee: false,
    launchFeeSol: 0.25,
    partnerReceiver: PARTNER_FEE_RECEIVER,
  }),
  migration: Object.freeze({
    destination: "DAMM v2" as const,
    tradingFeeBps: 150,
    additionalMigrationFeePercent: 0,
    permanentlyLockedLiquidityPercent: 100,
  }),
});

export const METEORA_LAUNCH_ENABLED =
  METEORA_DBC_CONFIG.configDeployed &&
  METEORA_DBC_CONFIG.configKey !== null &&
  METEORA_DBC_CONFIG.feeClaimAuthority !== null;

export function formatWholeNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatFeeBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
