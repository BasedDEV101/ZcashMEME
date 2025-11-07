# Zcash Meme Coin CLI Tool - ZIP 227 Implementation

A complete CLI tool for creating and managing Zcash Shielded Assets (meme) tokens on Zcash testnet using ZIP 227: Zcash Shielded Assets (ZSA).

**Repository:** [https://github.com/BasedDEV101/ZcashMEME](https://github.com/BasedDEV101/ZcashMEME)

## Overview

This CLI tool implements ZIP 227 specification for creating custom assets (meme coins) on Zcash. It follows the complete guide for ZSA implementation, including:

- Issuance key generation (ZIP 32 derivation)
- Asset description creation
- Issuance transaction building
- Asset ID calculation
- Token management and operations

## Current Status

**ZSAs (Zcash Shielded Assets) are not yet fully implemented on testnet.** This tool is prepared and ready for when ZSAs become available. Currently, it includes:

- ZIP 227-compliant key generation
- Asset description and ID calculation
- Issuance transaction construction
- Token storage and management
- CLI interface for all operations

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Zcash testnet node (optional, for full functionality when ZSAs are available)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Configuration

```bash
npm run setup
```

This will create a `.env` file from the template. Update it with your Zcash testnet credentials:

```env
ZCASH_TESTNET_RPC_URL=http://localhost:18232
ZCASH_TESTNET_RPC_USER=your_rpc_user
ZCASH_TESTNET_RPC_PASSWORD=your_rpc_password
```

### 3. Run the CLI

```bash
npm start
```

Or:

```bash
npm run cli
```

## CLI Commands

The CLI provides the following commands:

### 1. create-token
Create a new meme coin (ZSA token)

```
- Token Name
- Token Symbol (2-10 characters)
- Description
- Initial Supply
- Recipient Zcash Address (z-addr)
- Finalize (yes/no)
```

### 2. issue-more
Issue additional tokens (if token is not finalized)

```
- Asset ID
- Amount to issue
- Recipient Zcash Address
```

### 3. transfer
Transfer tokens to another address (ZIP 226 - OrchardZSA)

```
- Asset ID
- Recipient Address
- Amount
```

### 4. burn
Burn tokens (reduce total supply)

```
- Asset ID
- Amount to burn
```

### 5. balance
Check token balance

```
- Asset ID (or "all" for all tokens)
```

### 6. list-assets
List all your created assets

Shows a table with:
- Name
- Symbol
- Asset ID
- Supply
- Finalized status

### 7. info
Get detailed asset information

```
- Asset ID
```

Shows complete asset details including:
- Asset ID and description hash
- Issuer identifier
- Supply information
- Status and metadata

### 8. finalize
Finalize token (prevent further issuance)

```
- Asset ID
```

**Warning:** Finalizing a token prevents any further issuance permanently.

## Project Structure

```
zcash-meme-coin/
├── cli.js                  # Main CLI interface
├── scripts/
│   ├── setup.js            # Setup script
│   ├── deploy.js           # Deployment script
│   └── test.js             # Testing utilities
├── src/
│   ├── keys.js             # Issuance key generation (ZIP 227)
│   ├── crypto.js           # Cryptographic utilities (BLAKE2b, Asset ID)
│   ├── issuance.js         # Issuance transaction building
│   ├── token-creator.js    # Token creation service
│   ├── token-manager.js    # Token management logic
│   └── zcash-client.js     # Zcash RPC client
├── tokens/                 # Created tokens storage (gitignored)
├── keys/                   # Issuance keys storage (gitignored)
├── token-config.json       # Default token configuration
├── package.json            # Dependencies
└── README.md               # This file
```

## ZIP 227 Implementation Details

### Key Generation

The tool implements ZIP 227 key generation:

- **Master Key**: Generated from 32-byte seed using ZIP 32
- **Issuance Key (isk)**: Derived from master key using path `m/227'/133'/0'`
- **Validating Key (ik)**: Derived from isk
- **Issuer Identifier**: 32-byte encoding of ik

### Asset Description

Asset descriptions follow ZIP 227 format:

```
"name|symbol|description"
```

Example: `"PepeCoin|PEPE|The memest coin on Zcash"`

### Asset ID Calculation

Asset ID is computed as:

```
asset_desc_hash = BLAKE2b-256("ZSA-AssetDescCRH", asset_desc)
AssetId = [0x00 || issuer (32 bytes) || asset_desc_hash (32 bytes)]
```

### Issuance Transaction

Transactions are built according to ZIP 227:

- **Version**: 6 (required for ZSAs)
- **Issuance Bundle**: Contains issuer, actions, and signature
- **Issue Action**: Contains asset_desc_hash, notes, and finalize flag
- **Signature**: BIP 340 Schnorr signature with isk

## Available Scripts

- `npm start` or `npm run cli` - Start the CLI interface
- `npm run setup` - Set up the project environment
- `npm run deploy` - Deploy token (when ZSAs are available)
- `npm test` - Run tests

## Token Features

Once ZSAs are available, this tool will support:

- Token creation on Zcash testnet (ZIP 227)
- Additional token issuance (if not finalized)
- Token transfers (ZIP 226 - OrchardZSA)
- Token burning
- Balance queries
- Shielded transactions (privacy-preserving)

## Maximum Supply

ZIP 227 defines maximum supply as:

```
MAX_ISSUE = 2^64 - 1 = 18,446,744,073,709,551,615
```

## Important Notes

### Current Status

- ZIP 227 is **DRAFT** status
- Not yet deployed to mainnet or testnet
- Needs network upgrade (likely NU7)
- You'll need ZSA-enabled testnet

### Where to Find ZSA Testnet

Check Zcash community resources:

- Zcash Community Forum: https://forum.zcashcommunity.com
- Zcash R&D Discord
- QEDIT (ZSA development team)

### Security

- Issuance keys are stored locally (unencrypted in current implementation)
- **Important**: In production, encrypt keys and use secure storage
- Never share your issuance keys (isk)

## Resources

- [ZIP 227 Specification](https://zips.z.cash/zip-0227)
- [ZIP 226: Transfer and Burn](https://zips.z.cash/zip-0226)
- [Zcash Official Website](https://z.cash)
- [Zcash Community Forum](https://forum.zcashcommunity.com)
- [Zcash Testnet Faucet](https://faucet.testnet.z.cash/)

## Disclaimer

This is a testnet project for educational purposes. ZSAs are not yet fully implemented, so actual token deployment is not currently possible. Monitor the Zcash community for updates on ZSA availability.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

**Note:** This project implements ZIP 227 specification and is ready for when ZSAs become available on Zcash testnet.