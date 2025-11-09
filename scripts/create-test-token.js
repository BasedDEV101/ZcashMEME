#!/usr/bin/env node

/**
 * Quick script to create a test token
 * Creates "test" token with ticker "test1" and 100,000,000 supply
 */

import { TokenCreator } from '../src/token-creator.js';
import { WalletManager } from '../src/wallet.js';

async function createTestToken() {
  console.log('Creating test token...\n');

  const walletManager = new WalletManager();
  const tokenCreator = new TokenCreator();

  try {
    // Step 1: Create a wallet
    console.log('[1/2] Creating wallet...');
    const wallet = walletManager.createWallet('test-wallet', 'sapling');
    console.log('[OK] Wallet created:', wallet.name);
    console.log('     Address:', wallet.address);
    console.log('');

    // Step 2: Create the token
    console.log('[2/2] Creating token...');
    const token = await tokenCreator.createToken({
      name: 'test',
      symbol: 'test1',
      description: 'Test meme coin',
      initialSupply: '100000000',
      recipientAddress: wallet.address,
      finalize: false
    });

    console.log('[OK] Token created successfully!');
    console.log('');
    console.log('--- Token Details ---');
    console.log('Name:', token.name);
    console.log('Symbol:', token.symbol);
    console.log('Asset ID:', token.assetId);
    console.log('Issuer:', token.issuer);
    console.log('Initial Supply:', parseInt(token.initialSupply).toLocaleString());
    console.log('Recipient Address:', token.recipientAddress);
    console.log('Finalized:', token.finalized ? 'Yes' : 'No');
    console.log('Status:', token.status);
    console.log('');
    console.log('--- Next Steps ---');
    console.log('1. Use the CLI to check on-chain status: npm start -> option 11');
    console.log('2. View token info: npm start -> option 7');
    console.log('3. List all assets: npm start -> option 6');
    console.log('');
    console.log('[NOTE] Token is stored locally and ready for deployment when ZSAs become available.');

  } catch (error) {
    console.error('[ERROR] Failed to create token:', error.message);
    process.exit(1);
  }
}

createTestToken();


