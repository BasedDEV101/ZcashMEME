# Zcash Meme Coin CLI Tool - ZIP 227 Implementation  
**CA:** `8RSbsKW26WhHsFsM6jc34zSijvq6r7t6GmkYrfj8pump`

A CLI playground for modelling Zcash Shielded Asset (ZSA) issuance flows described in ZIP 227. The utilities here mimic the spec so builders can experiment today, while we wait for OrchardZSA support to land in public nodes.

**X:** [x.com/Zip227](https://x.com/Zip227)

## Overview

The project tracks the ZIP 227 design, with real derivations for issuance keys and canonical Asset IDs. Transfer, burn, and consensus updates are still mocked (no public ZSA network exists yet), but the interfaces are shaped so we can swap to real Orchard transactions once they ship.

## Current Status

**ZSAs (Zcash Shielded Assets) are not yet live on testnet.** Today the repo offers a spec-aligned façade with mocked back ends; as OrchardZSA components become available we can drop in the missing primitives.

### What is implemented now
- ZIP-32 hardened derivation path `m/227'/133'/0'` for issuance keys, with BIP-340 compliant public key encoding (`issuer = 0x00 || x-coordinate`).
- Canonical asset description hashing and Asset ID construction per draft ZIP 227 (with temporary SHA-256 stand-ins for BLAKE2b).
- Deterministic issuance bundle scaffolding and local state/history tracking for created assets.
- CLI flows for token lifecycle management (create, issue-more, finalize, inspect) operating on persisted JSON.

### Still mocked / TODO
- Orchard action groups, note commitments, consensus validation, and MAX_ISSUE enforcement happen only in memory.
- `issueAuthSig` is simulated; we do not yet build or sign Version 6 transactions.
- Transfer/burn operations remain placeholders until ZIP 226 is deployable.
- GroupHash and BLAKE2b implementations use simplified hashes — swap to real primitives before mainnet.

See `docs/ZSA_COMPLIANCE.md` for a running checklist.

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
Burn tokens (mocked by sending supply to the incinerator wallet for tracking)

```
- Asset ID
- Amount to burn
```

[INFO] The CLI records burns by routing the amount to a fixed incinerator wallet and reducing the tracked total supply. Real ZIP‑226 burns will replace this once OrchardZSA is live.

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

The tool implements the ZIP 227 key ladder:

- **Master Key**: Derived from a 32-byte seed using the `ZcashSA_Issue_V1` domain (ZIP 32 hardened-only tree).
- **Issuance Key (`isk`)**: Produced via the hardened path `m/227'/133'/0'`.
- **Validating Key (`ik`)**: BIP-340 compliant x-coordinate derived from `isk`, normalized to even Y parity.
- **Issuer Identifier**: `issuer = 0x00 || ik`, matching the draft spec encoding.

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

The local transaction objects follow the ZIP 227 layout (still off-chain):

- **Version**: 6 (placeholder flag).
- **Issuance Bundle**: Stores issuer encoding, actions, and simulated signatures.
- **Issue Action**: Carries `asset_desc_hash`, mock notes, and `finalize`.
- **Signature**: Placeholder string; swap for a real BIP-340 Schnorr signature once OrchardZSA SIGHASH is available.

## Available Scripts

- `npm start` or `npm run cli` - Start the CLI interface
- `npm run setup` - Set up the project environment
- `npm run setup:verification` - Set up GitHub commit verification (SSH signing)
- `npm run deploy` - Deploy token (when ZSAs are available)
- `npm test` - Run basic setup tests
- `npm run test:unit` - Run comprehensive unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

## GitHub Verification

To make your commits show as "Verified" on GitHub:

1. **Quick Setup (Windows):**
   ```bash
   npm run setup:verification
   ```

2. **Manual Setup:**
   See `docs/GITHUB_VERIFICATION.md` for detailed instructions on setting up SSH or GPG signing.

3. **After Setup:**
   - Add your SSH public key to GitHub as a "Signing Key"
   - All future commits will be automatically signed
   - Commits will show as "Verified" on GitHub

## Token Features

Once ZSAs are available, this tooling is ready to plug in:

- Token creation on Zcash testnet (ZIP 227) using live consensus calls instead of mocks.
- Additional token issuance (if not finalized) with real issuance actions.
- Token transfers (ZIP 226 - OrchardZSA).
- Token burning and on-chain supply reconciliation.
- Balance queries and shielded transfers via Orchard components.
## Solana → Zcash ZSA Migration Plan (Preview)

We expect many meme projects to launch liquidity on Solana first. When ZSAs land, the migration path will look like:

1. **Inventory & Freeze**  
   - Snapshot Solana token supply and circulating balances.  
   - Pause new minting (or burn remaining authority) to guarantee 1:1 backing.

2. **Custody & Bridge Setup**  
   - Select a ZSA-aware custodian/multisig that holds the Solana reserves.  
   - Stand up a relayer service that can observe Solana burn events and trigger ZSA issuance.

3. **Issuance Key Provisioning**  
   - Use this CLI to derive the production `isk/ik` pair following `m/227'/133'/0'`.  
   - Store the `issuer` encoding on the coordination service; guard the private key inside HSM or MPC.

4. **Asset Definition**  
   - Publish the canonical asset description (`name|symbol|description`) alongside a signed statement linking it to the Solana mint address.  
   - Distribute pet-name metadata so wallets can map the Asset ID to brand assets.

5. **Peg-In / Mint Flow**  
   - Users burn or lock their Solana tokens in the bridge contract.  
   - The relayer assembles a ZIP-227 issuance transaction (using the real OrchardZSA libraries) and broadcasts it to Zcash testnet / mainnet.  
   - The CLI’s issuance history log becomes the audit trail for each 1:1 mint.

6. **Peg-Out / Redemption Flow**  
   - Users submit ZSA burn proofs (ZIP 226) back to the bridge.  
   - Upon confirmation, the custodian releases the equivalent Solana tokens.

7. **Monitoring & Comms**  
   - Provide a dashboard that scrapes `tokens/*.json` (or on-chain data once live) to show total supply, burns, and outstanding Solana reserves.  
   - Document emergency procedures (key rotation, finalization) for transparency.

We’ll publish a deeper playbook under `docs/solana-migration.md` and wire the CLI into real bridge scripts as OrchardZSA reference code becomes available.

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
