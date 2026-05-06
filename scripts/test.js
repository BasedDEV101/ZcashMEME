#!/usr/bin/env node

/**
 * Smoke test script for Zcash Meme Coin
 * Verifies config files, env, and that the TokenCreator initializes.
 * For unit tests, run `npm run test:unit`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing Zcash Shielded Assets (meme) Setup...\n');

console.log('1. Checking token configuration file...');
const configPath = path.join(__dirname, '..', 'token-config.json');
let config = null;
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('   [OK] token-config.json loaded');
    console.log(`   - Name: ${config.name}`);
    console.log(`   - Symbol: ${config.symbol}`);
    console.log(`   - Supply: ${config.totalSupply}`);
    console.log(`   - Decimals: ${config.decimals}`);
    console.log(`   - Network: ${config.network}\n`);
  } catch (error) {
    console.log('   [FAIL] token-config.json is malformed:', error.message, '\n');
  }
} else {
  console.log('   [FAIL] token-config.json not found\n');
}

console.log('2. Checking environment configuration...');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  console.log('   [OK] .env file exists\n');
} else {
  console.log('   [WARN] .env file not found. Run "npm run setup" to create it.\n');
}

console.log('3. Testing token creator...');
try {
  const { TokenCreator } = await import('../src/token-creator.js');
  const tokenCreator = new TokenCreator();
  const tokens = tokenCreator.getAllTokens();
  console.log(`   [OK] Token creator initialized. Found ${tokens.length} token(s).\n`);
} catch (error) {
  let message = error.message;
  if (error.code === 'ERR_MODULE_NOT_FOUND' && message.includes('uuid')) {
    message = "Missing dependency 'uuid'. Run `npm install` to install project dependencies.";
  }
  console.log('   [FAIL] Token creator test failed:', message, '\n');
}

console.log('Tests complete!\n');
console.log('Note: Full functionality will be available when ZSAs are implemented on testnet.\n');
