#!/usr/bin/env node

/**
 * Check token status - both local and on-chain
 */

import { TokenCreator } from '../src/token-creator.js';
import { ZcashBlockchain } from '../src/zcash-blockchain.js';

async function checkTokenStatus() {
  const tokenCreator = new TokenCreator();
  const blockchain = new ZcashBlockchain();

  try {
    // Get all tokens
    const tokens = tokenCreator.getAllTokens();
    
    if (tokens.length === 0) {
      console.log('[INFO] No tokens found.');
      console.log('[INFO] Create a token first using: npm run create-test-token');
      return;
    }

    console.log(`Found ${tokens.length} token(s):\n`);

    for (const token of tokens) {
      console.log('--- Token: ' + token.name + ' (' + token.symbol + ') ---');
      console.log('Asset ID:', token.assetId);
      console.log('Supply:', parseInt(token.totalSupply).toLocaleString());
      console.log('Status:', token.status);
      console.log('Finalized:', token.finalized ? 'Yes' : 'No');
      console.log('');

      // Check on-chain status
      console.log('Checking on-chain status...');
      const onChainStatus = await blockchain.checkTokenOnChain(token.assetId);
      console.log('On-Chain Status:', onChainStatus.exists ? 'DEPLOYED' : 'NOT DEPLOYED');
      console.log('Message:', onChainStatus.message);
      console.log('');
      console.log('---');
      console.log('');
    }

    console.log('[NOTE] ZSAs are not yet available on testnet.');
    console.log('[NOTE] Tokens are stored locally and ready for deployment when ZSAs become available.');

  } catch (error) {
    console.error('[ERROR] Failed to check token status:', error.message);
    process.exit(1);
  }
}

checkTokenStatus();



