## Solana → Zcash Shielded Asset Migration Playbook

This document sketches the operational flow for porting an existing Solana SPL token into an OrchardZSA-based asset once ZIP 226 + ZIP 227 land on public networks. It complements the high-level outline in the README.

### 1. Governance & Freeze
- Collect on-chain snapshots of the Solana token: total supply, circulating supply, major holders.
- Revoke or pause Solana mint authority so no additional tokens appear during migration.
- Publish a governance vote (or community announcement) summarising the migration plan and timelines.

### 2. Bridge Architecture
- **Custody:** choose a custody arrangement (multisig, DAO-controlled MPC, institutional custodian) to hold locked Solana tokens backing the ZSA supply.
- **Watcher/Relayer:** deploy an oracle service that observes Solana burn/lock transactions and emits signed bridge messages to the Zcash side.
- **Security:** define slashing or alerting mechanisms for relayers; consider multiple independent watchers.

### 3. Issuance Key Provisioning
- Use `npm run setup` to initialise the repo and call `cli -> create-token` in dry-run mode to generate issuance keys.
- Back up the resulting `keys/issuance-keys.json` inside an HSM or MPC wallet. The CLI now produces BIP-340 compliant issuers (`issuer = 0x00 || ik`).
- Document the derivation path (`m/227'/133'/0'`) so independent auditors can verify the key origin.

### 4. Asset Metadata
- Draft a canonical asset description string `name|symbol|description`. Include the Solana mint address and governance link in the description to create an immutable association.
- Publish a signed message (PGP/SSH or Zcash signature once available) asserting that the ZSA Asset ID maps 1:1 to the Solana mint.
- Distribute optional pet-name registry files so wallets can label the asset without trusting off-chain strings.

### 5. Peg-In Flow (Mint on Zcash)
1. User submits a Solana transaction that locks or burns SPL tokens in the bridge program.
2. Watcher records the event and packages the details (amount, Solana address, Zcash recipient) into an issuance request.
3. Bridge service constructs a ZIP-227 issuance transaction:
   - Build IssueAction notes for each recipient.
   - Set `finalize = 0` until supply cap is reached.
   - Sign `issueAuthSig` with the custody-held `isk`.
4. Broadcast the V6 transaction to the Zcash network; stash the txid in bridge logs.
5. CLI’s history log and `tokens/*.json` files provide proof of issuance until the network exposes canonical explorers.

### 6. Peg-Out Flow (Redeem back to Solana)
1. User burns ZSAs via a ZIP-226 transaction that emits a burn record referencing the Asset ID.
2. Watcher validates the burn action and prepares a Solana release transaction.
3. Custodian releases the equivalent SPL tokens from the locked pool.
4. Update dashboard metrics to reflect reduced ZSA supply.

### 7. Auditing & Monitoring
- Maintain a public dashboard comparing:
  - Total Solana tokens locked.
  - Total ZSA supply (from `issued_assets` state once available).
  - Pending bridge operations and orphaned requests.
- Automate alerts for:
  - Divergence between locked supply and ZSA supply.
  - Failed issuance/burn transactions.
  - Finalization events (when supply is capped forever).

### 8. Roadmap Hooks
- As soon as OrchardZSA libraries ship, replace the CLI’s mocked issuance bundle with real calls, re-using the same asset metadata.
- Integrate ZIP-226 burn proofs into the bridge to ensure two-way accountability.
- Explore on-chain governance for bridge parameter updates, finalization votes, and emergency key rotation.

This playbook is intentionally high-level; expect updates once the Zcash ecosystem finalises OrchardZSA reference implementations and Solana bridge templates. Contributions welcome!***

