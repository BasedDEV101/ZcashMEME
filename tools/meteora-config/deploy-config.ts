import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2BaseFeeMode,
  DammV2DynamicFeeMode,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  DynamicBondingCurveClient,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurve,
  deriveTokenBadgeAddress,
  getTokenDecimals,
  getTokenType,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  METEORA_DBC_CONFIG,
  METEORA_DBC_CONFIG_KEY,
  PARTNER_FEE_RECEIVER,
  STAMP_QUOTE_MINT,
} from "../../src/solana/meteora-launchpad.ts";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const CONFIG_KEYPAIR_PATH = resolve(
  process.env.METEORA_CONFIG_KEYPAIR ?? resolve(REPO_ROOT, "keys/meteora-dbc-config.keypair.json"),
);
const DEPLOYER_KEYPAIR_PATH = resolve(
  process.env.METEORA_DEPLOYER_KEYPAIR ?? resolve(REPO_ROOT, "keys/meteora-dbc-deployer.keypair.json"),
);
const CONFIRM_COMMAND = "deploy-mainnet";
const VALIDATE_COMMAND = "validate-keys";
const HELP_COMMANDS = new Set(["help", "--help", "-h"]);

function usage(): string {
  return [
    "Create the launchpad-owned Meteora DBC PoolConfig.",
    "",
    "Dry-run against mainnet (default; reads no private keys and sends nothing):",
    "  npm run meteora:config",
    "",
    "Validate both local key files with a signed simulation (sends nothing):",
    `  npm run meteora:config -- ${VALIDATE_COMMAND}`,
    "",
    "Create the config on mainnet after a successful dry run:",
    `  npm run meteora:config -- ${CONFIRM_COMMAND} ${METEORA_DBC_CONFIG_KEY}`,
    "",
    `Config signer: ${CONFIG_KEYPAIR_PATH}`,
    `SOL-funded payer: ${DEPLOYER_KEYPAIR_PATH}`,
    "Override either path with METEORA_CONFIG_KEYPAIR or METEORA_DEPLOYER_KEYPAIR.",
    "Override the RPC with METEORA_RPC. Never put private keys in environment variables.",
  ].join("\n");
}

function decodeBase58(value: string): Uint8Array {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const character of value.trim()) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("the Base58 secret contains an invalid character");
    number = number * 58n + BigInt(digit);
  }

  const bytes: number[] = [];
  while (number > 0n) {
    bytes.unshift(Number(number & 0xffn));
    number >>= 8n;
  }
  for (const character of value.trim()) {
    if (character !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

function readKeypair(path: string, label: string): Keypair {
  if (!existsSync(path)) {
    throw new Error(`${label} keypair is missing: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} keypair must be valid JSON: ${path}`);
  }

  let secret: Uint8Array;
  if (Array.isArray(parsed)) {
    secret = Uint8Array.from(parsed as number[]);
  } else if (parsed && typeof parsed === "object" && "secretKeyBase58" in parsed) {
    const encoded = (parsed as { secretKeyBase58?: unknown }).secretKeyBase58;
    if (typeof encoded !== "string") throw new Error(`${label} secretKeyBase58 must be a string`);
    secret = decodeBase58(encoded);
  } else if (parsed && typeof parsed === "object" && "secretKey" in parsed) {
    const bytes = (parsed as { secretKey?: unknown }).secretKey;
    if (!Array.isArray(bytes)) throw new Error(`${label} secretKey must be a byte array`);
    secret = Uint8Array.from(bytes as number[]);
  } else {
    throw new Error(`${label} keypair must be a Solana byte array or an object containing secretKeyBase58`);
  }

  if (secret.length !== 64) {
    throw new Error(`${label} secret must decode to exactly 64 bytes; received ${secret.length}`);
  }
  return Keypair.fromSecretKey(secret);
}

function assertConfigurationMath(): void {
  const { fees } = METEORA_DBC_CONFIG;
  const protocolBps = (fees.totalTradingFeeBps * fees.protocolSharePercent) / 100;
  if (protocolBps !== fees.protocolTradingFeeBps) {
    throw new Error("the configured protocol fee does not equal 20% of the total trading fee");
  }
  if (fees.totalTradingFeeBps - protocolBps !== fees.partnerTradingFeeBps) {
    throw new Error("the configured partner fee is inconsistent with the total and protocol fees");
  }
  if (METEORA_DBC_CONFIG.token.curveSupply + METEORA_DBC_CONFIG.token.migrationSupply !== METEORA_DBC_CONFIG.token.totalSupply) {
    throw new Error("curve supply and migration supply do not add up to total supply");
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((argument) => HELP_COMMANDS.has(argument))) {
    console.log(usage());
    return;
  }
  if (args.length > 0 && args[0] !== CONFIRM_COMMAND && args[0] !== VALIDATE_COMMAND) {
    throw new Error(`unknown command ${JSON.stringify(args[0])}; use "help" for usage`);
  }

  const confirmIndex = args.indexOf(CONFIRM_COMMAND);
  const live = confirmIndex >= 0;
  const validateKeys = args[0] === VALIDATE_COMMAND;
  const usePrivateKeys = live || validateKeys;
  const acknowledgement = live ? args[confirmIndex + 1] : undefined;
  if (live && args.length !== 2) {
    throw new Error(`${CONFIRM_COMMAND} requires exactly one public-key acknowledgement`);
  }
  if (live && acknowledgement !== METEORA_DBC_CONFIG_KEY) {
    throw new Error(`${CONFIRM_COMMAND} must be followed by the exact configured public key`);
  }
  if (validateKeys && args.length !== 1) {
    throw new Error(`${VALIDATE_COMMAND} does not accept additional arguments`);
  }

  assertConfigurationMath();

  const rpcUrl = process.env.METEORA_RPC ?? process.env.SOLANA_RPC?.split(",")[0]?.trim() ?? DEFAULT_RPC;
  const connection = new Connection(rpcUrl, "confirmed");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const config = new PublicKey(METEORA_DBC_CONFIG_KEY);
  const quoteMint = new PublicKey(STAMP_QUOTE_MINT);
  const feeAuthority = new PublicKey(PARTNER_FEE_RECEIVER);

  const existing = await connection.getAccountInfo(config, "confirmed");
  if (existing) {
    if (!existing.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)) {
      throw new Error(`config address already exists but is owned by ${existing.owner.toBase58()}`);
    }
    const state = await client.state.getPoolConfig(config);
    if (!state) throw new Error("config address is program-owned but could not be decoded as a PoolConfig");
    console.log(`DBC config already exists on mainnet: ${config.toBase58()}`);
    return;
  }

  const [quoteDecimals, quoteTokenType, tokenBadgeState] = await Promise.all([
    getTokenDecimals(connection, quoteMint),
    getTokenType(connection, quoteMint),
    client.state.getTokenBadge(quoteMint),
  ]);
  const configAccountSize = client.partner.program.account.poolConfig.size;
  const configRentLamports = await connection.getMinimumBalanceForRentExemption(configAccountSize, "confirmed");
  if (quoteDecimals !== METEORA_DBC_CONFIG.quote.decimals) {
    throw new Error(`STAMP has ${quoteDecimals} decimals on-chain; expected ${METEORA_DBC_CONFIG.quote.decimals}`);
  }
  if (quoteTokenType === null) throw new Error("STAMP quote mint does not exist on this network");

  const tokenBadge = tokenBadgeState ? deriveTokenBadgeAddress(quoteMint) : undefined;
  const migrationPercentage =
    (METEORA_DBC_CONFIG.token.migrationSupply / METEORA_DBC_CONFIG.token.totalSupply) * 100;
  const curveConfig = buildCurve({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.SIX,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: METEORA_DBC_CONFIG.token.totalSupply,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: METEORA_DBC_CONFIG.fees.totalTradingFeeBps,
          endingFeeBps: METEORA_DBC_CONFIG.fees.totalTradingFeeBps,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: METEORA_DBC_CONFIG.fees.dynamicFee,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: METEORA_DBC_CONFIG.fees.creatorTradingFeePercent,
      // The site's 0.25 SOL launch fee is a direct transfer to the receiver in
      // the pool-creation transaction. Keeping DBC's own creation fee at zero
      // avoids Meteora's separate 90/10 creation-fee split and double-charging.
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps: METEORA_DBC_CONFIG.migration.tradingFeeBps,
        baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
      },
    },
    liquidityDistribution: {
      partnerLiquidityPercentage: 0,
      partnerPermanentLockedLiquidityPercentage:
        METEORA_DBC_CONFIG.migration.permanentlyLockedLiquidityPercent,
      creatorLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    percentageSupplyOnMigration: migrationPercentage,
    migrationQuoteThreshold: METEORA_DBC_CONFIG.curve.graduationQuoteTarget,
  });

  const rawSupply = new BN(METEORA_DBC_CONFIG.token.totalSupply).mul(
    new BN(10).pow(new BN(METEORA_DBC_CONFIG.token.decimals)),
  );
  if (!curveConfig.tokenSupply?.preMigrationTokenSupply.eq(rawSupply)) {
    throw new Error("Meteora curve builder returned an unexpected pre-migration token supply");
  }

  let configSigner: Keypair | undefined;
  let deployer: Keypair | undefined;
  let payer = feeAuthority;
  if (usePrivateKeys) {
    configSigner = readKeypair(CONFIG_KEYPAIR_PATH, "config");
    deployer = readKeypair(DEPLOYER_KEYPAIR_PATH, "deployer");
    if (!configSigner.publicKey.equals(config)) {
      throw new Error(`config keypair resolves to ${configSigner.publicKey.toBase58()}, not ${config.toBase58()}`);
    }
    if (deployer.publicKey.equals(config)) {
      throw new Error("the config account cannot also be the funded deployment payer");
    }
    payer = deployer.publicKey;
  }

  const transaction = await client.partner.createConfig({
    payer,
    config,
    feeClaimer: feeAuthority,
    leftoverReceiver: feeAuthority,
    quoteMint,
    ...(tokenBadge ? { tokenBadge } : {}),
    ...curveConfig,
  });
  transaction.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: Number(process.env.METEORA_PRIORITY_FEE_MICROLAMPORTS ?? 100_000),
    }),
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: transaction.instructions,
  }).compileToV0Message();
  const versioned = new VersionedTransaction(message);
  const networkFeeLamports = (await connection.getFeeForMessage(message, "confirmed")).value;
  if (networkFeeLamports === null) throw new Error("could not estimate the mainnet transaction fee");

  console.log(`mode             ${live ? "MAINNET CREATE" : validateKeys ? "SIGNED SIMULATION ONLY" : "MAINNET SIMULATION ONLY"}`);
  console.log(`config           ${config.toBase58()}`);
  console.log(`quote            ${quoteMint.toBase58()} (${quoteDecimals} decimals, token type ${quoteTokenType})`);
  console.log(`fee authority    ${feeAuthority.toBase58()}`);
  console.log(`payer            ${payer.toBase58()}`);
  console.log(`token badge      ${tokenBadge?.toBase58() ?? "none detected"}`);
  console.log(`curve fee        ${METEORA_DBC_CONFIG.fees.totalTradingFeeBps / 100}% total / ${METEORA_DBC_CONFIG.fees.partnerTradingFeeBps / 100}% partner`);
  console.log(`migration        ${METEORA_DBC_CONFIG.curve.graduationQuoteTarget.toLocaleString("en-US")} STAMP / ${migrationPercentage}% supply / DAMM v2`);
  console.log(`liquidity        ${METEORA_DBC_CONFIG.migration.permanentlyLockedLiquidityPercent}% permanently locked`);
  console.log(`config rent      ${configRentLamports / 1_000_000_000} SOL (${configAccountSize} bytes)`);
  console.log(`network fee      ~${networkFeeLamports / 1_000_000_000} SOL at the configured priority fee`);
  console.log(`site launch fee  ${METEORA_DBC_CONFIG.fees.launchFeeSol} SOL direct transfer (not part of this config transaction)`);

  if (!usePrivateKeys) {
    const simulation = await connection.simulateTransaction(versioned, {
      commitment: "confirmed",
      replaceRecentBlockhash: true,
      sigVerify: false,
    });
    if (simulation.value.err) {
      for (const line of simulation.value.logs?.slice(-20) ?? []) console.error(line);
      if (!tokenBadge) {
        console.error(`No token badge exists for STAMP. If the logs report an unsupported quote mint, Meteora must create ${deriveTokenBadgeAddress(quoteMint).toBase58()} before deployment.`);
      }
      throw new Error(`mainnet simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }
    console.log(`compute units    ${simulation.value.unitsConsumed ?? "unknown"}`);
    console.log("\nSimulation passed. No private keys were read and no transaction was sent.");
    console.log(`To create the account, add both ignored key files and run:\n  npm run meteora:config -- ${CONFIRM_COMMAND} ${config.toBase58()}`);
    return;
  }

  const balance = await connection.getBalance(payer, "confirmed");
  console.log(`payer balance    ${balance / 1_000_000_000} SOL`);
  if (balance < configRentLamports + networkFeeLamports) {
    throw new Error(
      `deployer needs at least ${(configRentLamports + networkFeeLamports) / 1_000_000_000} SOL for rent and network fees`,
    );
  }
  versioned.sign([deployer!, configSigner!]);

  const signedSimulation = await connection.simulateTransaction(versioned, {
    commitment: "confirmed",
    sigVerify: true,
  });
  if (signedSimulation.value.err) {
    for (const line of signedSimulation.value.logs?.slice(-20) ?? []) console.error(line);
    throw new Error(`signed mainnet simulation failed; transaction was not sent: ${JSON.stringify(signedSimulation.value.err)}`);
  }
  if (validateKeys) {
    console.log(`compute units    ${signedSimulation.value.unitsConsumed ?? "unknown"}`);
    console.log("\nBoth key files are valid and the signed mainnet simulation passed. No transaction was sent.");
    return;
  }

  const signature = await connection.sendRawTransaction(versioned.serialize(), {
    maxRetries: 3,
    preflightCommitment: "confirmed",
    skipPreflight: false,
  });
  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw new Error(`config transaction failed after submission: ${JSON.stringify(confirmation.value.err)}`);
  }
  const deployed = await client.state.getPoolConfig(config);
  if (!deployed) throw new Error("transaction confirmed but the PoolConfig could not be read back");

  console.log(`\nDBC config created: ${config.toBase58()}`);
  console.log(`transaction: ${signature}`);
  console.log("The config private key is no longer needed by the website. Back it up offline; never upload it.");
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
