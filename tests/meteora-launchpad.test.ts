import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  METEORA_DBC_CONFIG,
  METEORA_DBC_CONFIG_KEY,
  METEORA_LAUNCH_ENABLED,
  PARTNER_FEE_RECEIVER,
  STAMP_QUOTE_MINT,
} from "../src/solana/meteora-launchpad.ts";

test("the deployed DBC config keeps the Pump-shaped supply split", () => {
  assert.equal(METEORA_DBC_CONFIG.token.totalSupply, 1_000_000_000);
  assert.equal(METEORA_DBC_CONFIG.token.curveSupply, 793_100_000);
  assert.equal(METEORA_DBC_CONFIG.token.migrationSupply, 206_900_000);
  assert.equal(
    METEORA_DBC_CONFIG.token.curveSupply + METEORA_DBC_CONFIG.token.migrationSupply,
    METEORA_DBC_CONFIG.token.totalSupply,
  );
});

test("the 1.5% fee resolves to 0.3% protocol and 1.2% partner", () => {
  const fees = METEORA_DBC_CONFIG.fees;
  assert.equal(fees.totalTradingFeeBps, 150);
  assert.equal(fees.protocolTradingFeeBps, 30);
  assert.equal(fees.partnerTradingFeeBps, 120);
  assert.equal(fees.protocolTradingFeeBps + fees.partnerTradingFeeBps, fees.totalTradingFeeBps);
  assert.equal(fees.creatorTradingFeePercent, 0);
  assert.equal(fees.dynamicFee, false);
});

test("STAMP is the fixed quote and the requested wallet authorizes and receives partner claims", () => {
  assert.equal(METEORA_DBC_CONFIG.quote.mint, STAMP_QUOTE_MINT);
  assert.equal(METEORA_DBC_CONFIG.quote.symbol, "STAMP");
  assert.equal(METEORA_DBC_CONFIG.fees.partnerReceiver, PARTNER_FEE_RECEIVER);
  assert.doesNotThrow(() => new PublicKey(STAMP_QUOTE_MINT));
  assert.doesNotThrow(() => new PublicKey(PARTNER_FEE_RECEIVER));
  assert.equal(METEORA_DBC_CONFIG.feeClaimAuthority, PARTNER_FEE_RECEIVER);
});

test("the source config records the deployed mainnet PoolConfig", () => {
  assert.equal(METEORA_DBC_CONFIG.status, "mainnet-live");
  assert.equal(METEORA_DBC_CONFIG.configKey, METEORA_DBC_CONFIG_KEY);
  assert.doesNotThrow(() => new PublicKey(METEORA_DBC_CONFIG_KEY));
  assert.equal(METEORA_DBC_CONFIG.configDeployed, true);
  assert.equal(METEORA_LAUNCH_ENABLED, true);
  assert.equal(METEORA_DBC_CONFIG.migration.destination, "DAMM v2");
  assert.equal(METEORA_DBC_CONFIG.migration.permanentlyLockedLiquidityPercent, 100);
});
