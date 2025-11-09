#!/usr/bin/env node

/**
 * Zcash Meme Coin CLI Tool - ZIP 227 Implementation
 * Complete CLI for creating and managing Zcash Shielded Assets (meme) tokens
 */

import readline from 'readline';
import { TokenCreator } from './src/token-creator.js';
import { IssuanceKeys } from './src/keys.js';
import { WalletManager } from './src/wallet.js';
import { ZcashBlockchain } from './src/zcash-blockchain.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const tokenCreator = new TokenCreator();
const keys = new IssuanceKeys();
const walletManager = new WalletManager();
const blockchain = new ZcashBlockchain();

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function displayMenu() {
  console.log('\n=== Zcash Meme Coin CLI Tool (ZIP 227) ===\n');
  console.log('1. create-token    - Create a new meme coin');
  console.log('2. issue-more      - Issue additional tokens (if not finalized)');
  console.log('3. transfer        - Send tokens to another address');
  console.log('4. burn            - Burn tokens');
  console.log('5. balance         - Check token balance');
  console.log('6. list-assets     - List all your created assets');
  console.log('7. info            - Get asset information');
  console.log('8. finalize        - Finalize token (prevent further issuance)');
  console.log('9. create-wallet   - Create a new Zcash wallet');
  console.log('10. list-wallets   - List all wallets');
  console.log('11. check-onchain  - Check if token exists on blockchain');
  console.log('12. exit           - Exit CLI');
  console.log('');
}

async function cmdCreateToken() {
  console.log('\n--- Create New Token (ZIP 227) ---\n');
  
  try {
    const name = await question('Token Name: ');
    if (!name.trim()) {
      console.log('[ERROR] Token name is required.');
      return;
    }

    const symbol = await question('Token Symbol (2-10 characters): ');
    if (!symbol.trim() || symbol.length < 2 || symbol.length > 10) {
      console.log('[ERROR] Invalid symbol. Must be 2-10 characters.');
      return;
    }

    const description = await question('Description (optional): ');
    const initialSupply = await question('Initial Supply: ');
    if (!initialSupply.trim() || isNaN(initialSupply)) {
      console.log('[ERROR] Invalid initial supply. Must be a number.');
      return;
    }

    // Show existing wallets
    const wallets = walletManager.getAllWallets();
    let recipientAddress = '';
    
    if (wallets.length > 0) {
      console.log('\nYour Wallets:');
      wallets.forEach((wallet, index) => {
        console.log(`${index + 1}. ${wallet.name} - ${wallet.address}`);
      });
      console.log('');
      
      const useWallet = await question('Use existing wallet? (enter number or "n" for new address): ');
      if (useWallet.trim() !== 'n' && useWallet.trim() !== '') {
        const walletIndex = parseInt(useWallet) - 1;
        if (walletIndex >= 0 && walletIndex < wallets.length) {
          recipientAddress = wallets[walletIndex].address;
          console.log(`[INFO] Using wallet: ${wallets[walletIndex].name}`);
        }
      }
    }
    
    if (!recipientAddress) {
      recipientAddress = await question('Recipient Zcash Address (z-addr): ');
      if (!recipientAddress.trim()) {
        console.log('[ERROR] Recipient address is required.');
        return;
      }
    }

    const finalizeInput = await question('Finalize token? (yes/no, default: no): ');
    const finalize = finalizeInput.toLowerCase() === 'yes';

    console.log('\n[INFO] Creating token according to ZIP 227...');
    console.log('[INFO] Generating issuance keys...');
    
    const token = await tokenCreator.createToken({
      name: name.trim(),
      symbol: symbol.trim(),
      description: description.trim(),
      initialSupply: initialSupply.trim(),
      recipientAddress: recipientAddress.trim(),
      finalize: finalize
    });

    console.log('\n[SUCCESS] Token created successfully!');
    console.log('Name:', token.name);
    console.log('Symbol:', token.symbol);
    console.log('Asset ID:', token.assetId);
    console.log('Issuer:', token.issuer);
    console.log('Initial Supply:', parseInt(token.initialSupply).toLocaleString());
    console.log('Finalized:', token.finalized ? 'Yes' : 'No');
    console.log('Status:', token.status);
    console.log('\n[NOTE] Token is stored and ready for deployment when ZSAs become available on testnet.');
    console.log('[NOTE] Use "info" command with Asset ID to view full details.');
  } catch (error) {
    console.error('[ERROR] Error creating token:', error.message);
  }
}

async function cmdIssueMore() {
  console.log('\n--- Issue More Tokens ---\n');
  
  try {
    const assetId = await question('Asset ID: ');
    if (!assetId.trim()) {
      console.log('[ERROR] Asset ID is required.');
      return;
    }

    const amount = await question('Amount to issue: ');
    if (!amount.trim() || isNaN(amount)) {
      console.log('[ERROR] Invalid amount. Must be a number.');
      return;
    }

    const recipientAddress = await question('Recipient Zcash Address (z-addr): ');
    if (!recipientAddress.trim()) {
      console.log('[ERROR] Recipient address is required.');
      return;
    }

    console.log('\n[INFO] Issuing additional tokens...');
    const result = await tokenCreator.issueMore(assetId.trim(), amount.trim(), recipientAddress.trim());

    console.log('\n[SUCCESS] Additional tokens issued!');
    console.log('Amount issued:', parseInt(result.amountIssued).toLocaleString());
    console.log('New total supply:', parseInt(result.token.totalSupply).toLocaleString());
    console.log('Token:', result.token.name, '(', result.token.symbol, ')');
  } catch (error) {
    console.error('[ERROR] Error issuing tokens:', error.message);
  }
}

async function cmdTransfer() {
  console.log('\n--- Transfer Tokens ---\n');
  console.log('[NOTE] Transfer functionality requires ZSAs to be available on testnet.');
  console.log('[NOTE] This will use ZIP 226 (OrchardZSA) for transfers.\n');
  
  try {
    const assetId = await question('Asset ID: ');
    if (!assetId.trim()) {
      console.log('[ERROR] Asset ID is required.');
      return;
    }

    const toAddress = await question('Recipient Zcash Address (z-addr): ');
    if (!toAddress.trim()) {
      console.log('[ERROR] Recipient address is required.');
      return;
    }

    const amount = await question('Amount to transfer: ');
    if (!amount.trim() || isNaN(amount)) {
      console.log('[ERROR] Invalid amount. Must be a number.');
      return;
    }

    console.log('\n[INFO] Transfer functionality will be available when ZSAs are deployed.');
    console.log('[INFO] Transfer would use ZIP 226 (OrchardZSA protocol).');
    console.log('\nTransfer Details:');
    console.log('Asset ID:', assetId);
    console.log('To:', toAddress);
    console.log('Amount:', parseInt(amount).toLocaleString());
  } catch (error) {
    console.error('[ERROR] Error:', error.message);
  }
}

async function cmdBurn() {
  console.log('\n--- Burn Tokens ---\n');
  console.log('[NOTE] This mocks a burn by sending supply to the incinerator wallet for tracking purposes.\n');

  try {
    const assetId = await question('Asset ID: ');
    if (!assetId.trim()) {
      console.log('[ERROR] Asset ID is required.');
      return;
    }

    const amount = await question('Amount to burn: ');
    if (!amount.trim() || isNaN(amount)) {
      console.log('[ERROR] Invalid amount. Must be a number.');
      return;
    }

    const burnAmount = BigInt(amount.trim());
    if (burnAmount <= 0n) {
      console.log('[ERROR] Burn amount must be greater than zero.');
      return;
    }

    const result = await tokenCreator.burnTokens(assetId.trim(), burnAmount);
    const updatedToken = result.token;
    const incinerator = result.burnAddress;

    console.log('\n[SUCCESS] Burn request submitted.');
    if (result.transaction?.broadcast === 'mock') {
      console.log('[INFO] CLI disabled; burn recorded locally (mock).');
    }
    console.log('Asset ID:', updatedToken.assetId);
    console.log('Burned Amount:', parseInt(result.amountBurned).toLocaleString());
    console.log('Incinerator Wallet:', incinerator);
    console.log('New Total Supply:', parseInt(updatedToken.totalSupply).toLocaleString());
    console.log('Total Burned Supply:', parseInt(updatedToken.burnedSupply || '0').toLocaleString());
  } catch (error) {
    console.error('[ERROR] Error:', error.message);
  }
}

async function cmdBalance() {
  console.log('\n--- Check Token Balance ---\n');
  console.log('[NOTE] Balance queries require ZSAs to be available on testnet.\n');
  
  try {
    const assetId = await question('Asset ID (or "all" for all tokens): ');
    if (!assetId.trim()) {
      console.log('[ERROR] Asset ID is required.');
      return;
    }

    if (assetId.toLowerCase() === 'all') {
      const tokens = tokenCreator.getAllTokens();
      if (tokens.length === 0) {
        console.log('[INFO] No tokens found.');
        return;
      }
      console.log('\nYour Tokens:');
      tokens.forEach(token => {
        console.log(`  ${token.name} (${token.symbol}): ${parseInt(token.totalSupply).toLocaleString()} - Status: ${token.status}`);
      });
    } else {
      const token = tokenCreator.getTokenByAssetId(assetId.trim());
      if (!token) {
        console.log('[ERROR] Token not found.');
        return;
      }
      console.log('\nToken Information:');
      console.log('Name:', token.name);
      console.log('Symbol:', token.symbol);
      console.log('Total Supply:', parseInt(token.totalSupply).toLocaleString());
      console.log('[NOTE] Balance queries for specific addresses will be available when ZSAs are deployed.');
    }
  } catch (error) {
    console.error('[ERROR] Error:', error.message);
  }
}

async function cmdListAssets() {
  console.log('\n--- List All Assets ---\n');
  
  try {
    const tokens = tokenCreator.getAllTokens();
    
    if (tokens.length === 0) {
      console.log('[INFO] No tokens found.');
      return;
    }

    console.log(`Found ${tokens.length} token(s):\n`);
    console.log('┌─────────────┬──────────┬──────────────────────────────────────────┬─────────────┬──────────┐');
    console.log('│ Name        │ Symbol   │ Asset ID                                 │ Supply      │ Finalized│');
    console.log('├─────────────┼──────────┼──────────────────────────────────────────┼─────────────┼──────────┤');
    
    tokens.forEach(token => {
      const name = token.name.padEnd(11).substring(0, 11);
      const symbol = token.symbol.padEnd(8).substring(0, 8);
      const assetId = token.assetId.substring(0, 40) + '...';
      const supply = parseInt(token.totalSupply).toLocaleString().padEnd(11).substring(0, 11);
      const finalized = (token.finalized ? 'Yes' : 'No').padEnd(8).substring(0, 8);
      console.log(`│ ${name} │ ${symbol} │ ${assetId.padEnd(40)} │ ${supply} │ ${finalized} │`);
    });
    
    console.log('└─────────────┴──────────┴──────────────────────────────────────────┴─────────────┴──────────┘');
  } catch (error) {
    console.error('[ERROR] Error listing tokens:', error.message);
  }
}

async function cmdInfo() {
  console.log('\n--- Asset Information ---\n');
  
  try {
    const assetId = await question('Asset ID: ');
    if (!assetId.trim()) {
      console.log('[ERROR] Asset ID is required.');
      return;
    }

    const token = tokenCreator.getTokenByAssetId(assetId.trim());
    if (!token) {
      console.log('[ERROR] Token not found.');
      return;
    }

    console.log('\n--- Asset Details ---');
    console.log('Name:', token.name);
    console.log('Symbol:', token.symbol);
    console.log('Description:', token.description || 'N/A');
    console.log('Asset ID:', token.assetId);
    console.log('Asset Desc Hash:', token.assetDescHash);
    console.log('Issuer:', token.issuer);
    console.log('Total Supply:', parseInt(token.totalSupply).toLocaleString());
    console.log('Initial Supply:', parseInt(token.initialSupply).toLocaleString());
    console.log('Finalized:', token.finalized ? 'Yes' : 'No');
    console.log('Status:', token.status);
    console.log('Network:', token.network);
    console.log('Recipient Address:', token.recipientAddress);
    console.log('Created At:', new Date(token.createdAt).toLocaleString());
    if (token.deployedAt) {
      console.log('Deployed At:', new Date(token.deployedAt).toLocaleString());
    }
    if (token.transactionId) {
      console.log('Transaction ID:', token.transactionId);
    }
    console.log('Asset Description (ZIP 227):', token.assetDesc);
    if (token.history && token.history.length > 0) {
      console.log('\n--- History ---');
      token.history.forEach((event, index) => {
        const time = new Date(event.timestamp).toLocaleString();
        const base = `${index + 1}. ${event.type} @ ${time}`;
        const details = [];
        if (event.amount) {
          details.push(`amount=${parseInt(event.amount).toLocaleString()}`);
        }
        if (event.recipient) {
          details.push(`recipient=${event.recipient}`);
        }
        if (event.transactionId) {
          details.push(`tx=${event.transactionId}`);
        }
        if (event.finalized !== undefined) {
          details.push(`finalized=${event.finalized ? 'yes' : 'no'}`);
        }
        if (details.length > 0) {
          console.log(`${base} (${details.join(', ')})`);
        } else {
          console.log(base);
        }
      });
    }
  } catch (error) {
    console.error('[ERROR] Error:', error.message);
  }
}

async function cmdFinalize() {
  console.log('\n--- Finalize Token ---\n');
  console.log('[WARNING] Finalizing a token prevents any further issuance.\n');
  
  try {
    const assetId = await question('Asset ID: ');
    if (!assetId.trim()) {
      console.log('[ERROR] Asset ID is required.');
      return;
    }

    const confirm = await question('Are you sure you want to finalize this token? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('[INFO] Finalization cancelled.');
      return;
    }

    console.log('\n[INFO] Finalizing token...');
    const result = await tokenCreator.finalizeToken(assetId.trim());

    console.log('\n[SUCCESS] Token finalized!');
    console.log('Token:', result.token.name, '(', result.token.symbol, ')');
    console.log('Final Supply:', parseInt(result.token.totalSupply).toLocaleString());
    console.log('[WARNING] No more tokens can be issued for this asset.');
  } catch (error) {
    console.error('[ERROR] Error finalizing token:', error.message);
  }
}

async function cmdCreateWallet() {
  console.log('\n--- Create New Wallet ---\n');
  
  try {
    const name = await question('Wallet Name: ');
    if (!name.trim()) {
      console.log('[ERROR] Wallet name is required.');
      return;
    }

    const typeInput = await question('Address Type (sapling/orchard, default: sapling): ') || 'sapling';
    const type = typeInput.toLowerCase() === 'orchard' ? 'orchard' : 'sapling';

    console.log('\n[INFO] Generating wallet...');
    const wallet = walletManager.createWallet(name.trim(), type);

    console.log('\n[SUCCESS] Wallet created!');
    console.log('Wallet Name:', wallet.name);
    console.log('Wallet ID:', wallet.id);
    console.log('Address:', wallet.address);
    console.log('Type:', wallet.type);
    console.log('Network:', wallet.network);
    console.log('\n[WARNING] Private key is stored locally. Keep it secure!');
    console.log('[NOTE] This is a testnet wallet for testing purposes.');
  } catch (error) {
    console.error('[ERROR] Error creating wallet:', error.message);
  }
}

async function cmdListWallets() {
  console.log('\n--- My Wallets ---\n');
  
  try {
    const wallets = walletManager.getAllWallets();
    
    if (wallets.length === 0) {
      console.log('[INFO] No wallets found.');
      console.log('[INFO] Use "create-wallet" command to create a new wallet.');
      return;
    }

    console.log(`Found ${wallets.length} wallet(s):\n`);
    console.log('┌──────────────┬──────────────────────────────────────────┬──────────┬──────────┐');
    console.log('│ Name         │ Address                                  │ Type     │ Balance  │');
    console.log('├──────────────┼──────────────────────────────────────────┼──────────┼──────────┤');
    
    wallets.forEach(wallet => {
      const name = wallet.name.padEnd(12).substring(0, 12);
      const address = wallet.address.substring(0, 40) + '...';
      const type = wallet.type.padEnd(8).substring(0, 8);
      const balance = (wallet.balance || '0').padEnd(8).substring(0, 8);
      console.log(`│ ${name} │ ${address.padEnd(40)} │ ${type} │ ${balance} │`);
    });
    
    console.log('└──────────────┴──────────────────────────────────────────┴──────────┴──────────┘');
  } catch (error) {
    console.error('[ERROR] Error listing wallets:', error.message);
  }
}

async function cmdCheckOnChain() {
  console.log('\n--- Check Token On-Chain ---\n');
  
  try {
    const assetId = await question('Asset ID: ');
    if (!assetId.trim()) {
      console.log('[ERROR] Asset ID is required.');
      return;
    }

    console.log('\n[INFO] Checking token on blockchain...');
    const result = await blockchain.checkTokenOnChain(assetId.trim());

    console.log('\n--- On-Chain Status ---');
    console.log('Asset ID:', result.assetId);
    console.log('Exists on-chain:', result.exists ? 'Yes' : 'No');
    console.log('Status:', result.status);
    
    if (result.transactionId) {
      console.log('Transaction ID:', result.transactionId);
    }
    if (result.blockHeight) {
      console.log('Block Height:', result.blockHeight);
    }
    
    console.log('\nMessage:', result.message);
    
    // Also show local token info if available
    const token = tokenCreator.getTokenByAssetId(assetId.trim());
    if (token) {
      console.log('\n--- Local Token Info ---');
      console.log('Name:', token.name);
      console.log('Symbol:', token.symbol);
      console.log('Status:', token.status);
      if (token.transactionId) {
        console.log('Local Transaction ID:', token.transactionId);
      }
    }
  } catch (error) {
    console.error('[ERROR] Error checking on-chain:', error.message);
  }
}

async function main() {
  console.log('Zcash Meme Coin CLI Tool');
  console.log('ZIP 227: Zcash Shielded Assets (ZSA)');
  console.log('\n[NOTE] ZSAs are not yet fully implemented on testnet.');
  console.log('[NOTE] Tokens created here are stored and ready for deployment when ZSAs become available.');
  console.log('[NOTE] This tool follows ZIP 227 specification for asset issuance.\n');

  // Initialize keys on startup
  try {
    const issuer = keys.getIssuer();
    console.log(`[INFO] Issuer identifier: ${issuer.substring(0, 16)}...\n`);
  } catch (error) {
    console.log('[INFO] Generating new issuance keys...\n');
    keys.generateOrLoadKeys();
  }

    while (true) {
    displayMenu();
    const choice = await question('Select command (1-12): ');

    switch (choice.trim()) {
      case '1':
        await cmdCreateToken();
        break;
      case '2':
        await cmdIssueMore();
        break;
      case '3':
        await cmdTransfer();
        break;
      case '4':
        await cmdBurn();
        break;
      case '5':
        await cmdBalance();
        break;
      case '6':
        await cmdListAssets();
        break;
      case '7':
        await cmdInfo();
        break;
      case '8':
        await cmdFinalize();
        break;
      case '9':
        await cmdCreateWallet();
        break;
      case '10':
        await cmdListWallets();
        break;
      case '11':
        await cmdCheckOnChain();
        break;
      case '12':
        console.log('\nGoodbye!');
        rl.close();
        process.exit(0);
        break;
      default:
        console.log('\n[ERROR] Invalid option. Please select 1-12.');
    }
  }
}

// Handle Ctrl+C
rl.on('SIGINT', () => {
  console.log('\n\nGoodbye!');
  rl.close();
  process.exit(0);
});

// Start the CLI
main().catch(console.error);