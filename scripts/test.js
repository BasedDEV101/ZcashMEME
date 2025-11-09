#!/usr/bin/env node

/**
 * Test script for Zcash Meme Coin
 * Tests token configuration and utilities
 */

import { TokenManager } from '../src/token-manager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing Zcash Shielded Assets (meme) Setup...\n');

// Test 1: Check token configuration
console.log('1. Testing token configuration...');
try {
  const tokenManager = new TokenManager();
  const config = tokenManager.getConfig();
  
  console.log('   [OK] Token config loaded successfully');
  console.log(`   - Name: ${config.name}`);
  console.log(`   - Symbol: ${config.symbol}`);
  console.log(`   - Supply: ${config.totalSupply}`);
  console.log(`   - Decimals: ${config.decimals}`);
  console.log(`   - Network: ${config.network}\n`);
} catch (error) {
  console.log('   [FAIL] Failed to load token config:', error.message, '\n');
}

// Test 2: Check if .env exists
console.log('2. Checking environment configuration...');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  console.log('   [OK] .env file exists\n');
} else {
  console.log('   [WARN] .env file not found. Run "npm run setup" to create it.\n');
}

// Test 3: Check token config file
console.log('3. Checking token configuration file...');
const configPath = path.join(__dirname, '..', 'token-config.json');
if (fs.existsSync(configPath)) {
  console.log('   [OK] token-config.json exists\n');
} else {
  console.log('   [FAIL] token-config.json not found\n');
}

// Test 4: Mock balance test
console.log('4. Testing mock balance functionality...');
try {
  const tokenManager = new TokenManager();
  const mockBalance = tokenManager.getMockBalance('test-address');
  console.log(`   [OK] Mock balance: ${mockBalance} ${tokenManager.getConfig().symbol}\n`);
} catch (error) {
  console.log('   [FAIL] Balance test failed:', error.message, '\n');
}

// Test 5: Check token creator
console.log('5. Testing token creator...');
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
