import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
} from "@solana/web3.js";
import { encodeDeployRequest } from "@protocol/core/deploy-request.ts";
import { assertNotForbidden } from "@protocol/core/forbidden.ts";
import { MEMO_V3 } from "@protocol/solana/programs.ts";
import {
  METEORA_DBC_CONFIG,
  METEORA_DBC_CONFIG_KEY,
  METEORA_DBC_PROGRAM,
  PARTNER_FEE_RECEIVER,
  STAMP_QUOTE_MINT,
} from "@protocol/solana/meteora-launchpad.ts";
import type { CoinDetails } from "./createCoin.ts";

export type MeteoraConfigStatus =
  | { state: "ready" }
  | { state: "missing"; message: string }
  | { state: "invalid"; message: string };

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Verify the public config before the website offers a launch. The config
 * signer is never used here: once the PoolConfig exists, its public address is
 * all the browser needs.
 */
export async function inspectMeteoraConfig(connection: Connection): Promise<MeteoraConfigStatus> {
  const config = new PublicKey(METEORA_DBC_CONFIG_KEY);
  const account = await connection.getAccountInfo(config, "confirmed");
  if (!account) {
    return {
      state: "missing",
      message: "The launchpad config has not been created on mainnet yet.",
    };
  }
  if (!account.owner.equals(new PublicKey(METEORA_DBC_PROGRAM))) {
    return {
      state: "invalid",
      message: "The configured address exists, but it is not a Meteora DBC PoolConfig.",
    };
  }

  const {
    DynamicBondingCurveClient,
    MigrationOption,
    TokenType,
  } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const state = await client.state.getPoolConfig(config);
  if (!state) {
    return { state: "invalid", message: "The Meteora PoolConfig could not be decoded." };
  }

  const expectedRawSupply = BigInt(METEORA_DBC_CONFIG.token.totalSupply)
    * 10n ** BigInt(METEORA_DBC_CONFIG.token.decimals);
  const expectedQuoteThreshold = BigInt(METEORA_DBC_CONFIG.curve.graduationQuoteTarget)
    * 10n ** BigInt(METEORA_DBC_CONFIG.quote.decimals);
  const checks: Array<[boolean, string]> = [
    [state.quoteMint.equals(new PublicKey(STAMP_QUOTE_MINT)), "quote mint is not STAMP"],
    [state.feeClaimer.equals(new PublicKey(PARTNER_FEE_RECEIVER)), "fee claimer is not the configured receiver"],
    [state.leftoverReceiver.equals(new PublicKey(PARTNER_FEE_RECEIVER)), "leftover receiver is not the configured receiver"],
    [state.tokenType === TokenType.SPLToken, "new tokens are not configured as standard SPL tokens"],
    [state.tokenDecimal === METEORA_DBC_CONFIG.token.decimals, "token decimals do not match"],
    [state.preMigrationTokenSupply.toString() === expectedRawSupply.toString(), "token supply does not match"],
    [state.migrationQuoteThreshold.toString() === expectedQuoteThreshold.toString(), "graduation target does not match"],
    [state.migrationOption === MigrationOption.MET_DAMM_V2, "migration destination is not DAMM v2"],
    [state.partnerPermanentLockedLiquidityPercentage === 100, "migrated liquidity is not fully locked"],
    [state.creatorTradingFeePercentage === 0, "creator trading fee is not locked to zero"],
    [state.migratedPoolFeeBps === METEORA_DBC_CONFIG.migration.tradingFeeBps, "migrated pool fee does not match"],
    [state.poolCreationFee.isZero(), "Meteora pool creation fee is not zero"],
  ];
  const failure = checks.find(([valid]) => !valid);
  return failure
    ? { state: "invalid", message: `The on-chain config is not the launchpad config: ${failure[1]}.` }
    : { state: "ready" };
}

export interface BuiltMeteoraLaunch {
  transaction: VersionedTransaction;
  mint: Keypair;
  pool: PublicKey;
}

/** Build one wallet-signed transaction that creates the pool and registers it. */
export async function buildMeteoraLaunch(
  payer: PublicKey,
  uri: string,
  details: CoinDetails,
  connection: Connection,
): Promise<BuiltMeteoraLaunch> {
  assertNotForbidden(payer.toBase58(), "a coin launch");
  const status = await inspectMeteoraConfig(connection);
  if (status.state !== "ready") throw new Error(status.message);

  const {
    DynamicBondingCurveClient,
    deriveDbcPoolAddress,
  } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const config = new PublicKey(METEORA_DBC_CONFIG_KEY);
  const quoteMint = new PublicKey(STAMP_QUOTE_MINT);
  const mint = Keypair.generate();
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const createPool = await client.creator.createPool({
    baseMint: mint.publicKey,
    config,
    name: details.name.trim(),
    symbol: details.symbol,
    uri,
    payer,
    poolCreator: payer,
  });

  const launchFee = SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: new PublicKey(PARTNER_FEE_RECEIVER),
    lamports: Math.round(METEORA_DBC_CONFIG.fees.launchFeeSol * LAMPORTS_PER_SOL),
  });
  const register = new TransactionInstruction({
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    programId: new PublicKey(MEMO_V3),
    data: new TextEncoder().encode(
      encodeDeployRequest({
        mint: mint.publicKey.toBase58(),
        symbol: details.symbol,
        minWholeTokens: details.minWholeTokens,
      }),
    ) as unknown as Buffer,
  });

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [...createPool.instructions, launchFee, register],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([mint]);

  try {
    transaction.serialize();
  } catch {
    throw new Error("The launch transaction is too large for Solana. Shorten the token name or links and try again.");
  }

  return {
    transaction,
    mint,
    pool: deriveDbcPoolAddress(quoteMint, mint.publicKey, config),
  };
}
