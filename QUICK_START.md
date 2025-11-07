# Quick Start Guide - Create Your First Meme Coin

This guide will help you create a meme coin called "test" with ticker "test1" and 100,000,000 supply.

## Step 1: Start the CLI

```bash
npm start
```

## Step 2: Create a Wallet

1. Select option `9` - Create wallet
2. Enter wallet name: `my-wallet`
3. Press Enter for default address type (sapling)
4. Your wallet address will be displayed - save this!

## Step 3: Create Your Token

1. Select option `1` - Create token
2. Token Name: `test`
3. Token Symbol: `test1`
4. Description: (optional, press Enter to skip)
5. Initial Supply: `100000000`
6. When asked for recipient address, select your wallet (enter `1` if it's the first one)
7. Finalize token: `no` (so you can issue more later if needed)

## Step 4: View Your Token

1. Select option `6` - List assets
2. You should see your "test" token with symbol "test1"

## Step 5: Get Token Details

1. Select option `7` - Info
2. Enter the Asset ID (copy it from the list-assets output)
3. View all token details including Asset ID, Issuer, and Supply

## Step 6: Check On-Chain Status

1. Select option `11` - Check on-chain
2. Enter the Asset ID
3. This will show if the token exists on the blockchain

Note: Since ZSAs are not yet available on testnet, the token will show as "not_deployed" but it's stored locally and ready for when ZSAs become available.

## Example Session

```
=== Zcash Meme Coin CLI Tool (ZIP 227) ===

Select command (1-12): 9
--- Create New Wallet ---
Wallet Name: my-wallet
Address Type (sapling/orchard, default: sapling): 
[INFO] Generating wallet...
[SUCCESS] Wallet created!
Address: zt1abc123...

Select command (1-12): 1
--- Create New Token (ZIP 227) ---
Token Name: test
Token Symbol: test1
Description (optional): 
Initial Supply: 100000000
Your Wallets:
1. my-wallet - zt1abc123...
Use existing wallet? (enter number or "n" for new address): 1
[INFO] Using wallet: my-wallet
Finalize token? (yes/no, default: no): no
[INFO] Creating token according to ZIP 227...
[SUCCESS] Token created successfully!
Asset ID: 00abcdef...
```

## Next Steps

- Use `list-assets` to see all your tokens
- Use `info` to get detailed token information
- Use `check-onchain` to verify deployment status
- When ZSAs become available, use `deploy` to deploy your tokens
