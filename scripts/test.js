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

console.log('🧪 Testing Zcash Meme Coin Setup...\n');

// Test 1: Check token configuration
console.log('1. Testing token configuration...');
try {
  const tokenManager = new TokenManager();
  const config = tokenManager.getConfig();
  
  console.log('   ✅ Token config loaded successfully');
  console.log(`   - Name: ${config.name}`);
  console.log(`   - Symbol: ${config.symbol}`);
  console.log(`   - Supply: ${config.totalSupply}`);
  console.log(`   - Decimals: ${config.decimals}`);
  console.log(`   - Network: ${config.network}\n`);
} catch (error) {
  console.log('   ❌ Failed to load token config:', error.message, '\n');
}

// Test 2: Check if .env exists
console.log('2. Checking environment configuration...');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  console.log('   ✅ .env file exists\n');
} else {
  console.log('   ⚠️  .env file not found. Run "npm run setup" to create it.\n');
}

// Test 3: Check token config file
console.log('3. Checking token configuration file...');
const configPath = path.join(__dirname, '..', 'token-config.json');
if (fs.existsSync(configPath)) {
  console.log('   ✅ token-config.json exists\n');
} else {
  console.log('   ❌ token-config.json not found\n');
}

// Test 4: Mock balance test
console.log('4. Testing mock balance functionality...');
try {
  const tokenManager = new TokenManager();
  const mockBalance = tokenManager.getMockBalance('test-address');
  console.log(`   ✅ Mock balance: ${mockBalance} ${tokenManager.getConfig().symbol}\n`);
} catch (error) {
  console.log('   ❌ Balance test failed:', error.message, '\n');
}

console.log('✨ Tests complete!\n');
console.log('💡 Note: Full functionality will be available when ZSAs are implemented on testnet.\n');
