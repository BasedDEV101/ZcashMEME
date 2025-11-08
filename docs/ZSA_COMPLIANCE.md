## ZIP-227 / ZIP-226 Compliance Tracker

This project is a staging ground for real Zcash Shielded Asset tooling. The table below tracks what we currently implement and what still needs hook-ins to the upstream ZIPs.

| Component | Status | Notes |
| --- | --- | --- |
| Hardened issuance path `m/227'/133'/0'` | ✅ Implemented | Uses `ZcashSA_Issue_V1` domain, validates keys with `secp256k1` and normalises to even Y parity |
| BIP-340 issuer encoding | ✅ Implemented | `issuer = 0x00 || ik`; legacy keys auto-upgrade on load |
| Asset description hashing | ⚠️ Placeholder | Uses SHA-256 stand-in for `BLAKE2b-256`; swap in `@noble/hashes/blake2b` |
| Asset digest / base | ⚠️ Placeholder | `BLAKE2b-512` + GroupHash mocked with SHA-256 |
| Issue actions / bundles | ⚠️ Mock | Shape matches spec but data never serialized to V6 tx |
| `issueAuthSig` signature | ❌ Not implemented | Waiting on OrchardZSA SIGHASH + Schnorr wiring |
| Orchard action groups | ❌ Not implemented | No note commitments, `ρ` derivation, or consensus checks |
| MAX_ISSUE enforcement | ⚠️ Partial | Checked in tests, but no global state or burn accounting |
| Finalization consensus rule | ⚠️ Partial | Flag stored locally; not enforced across sessions |
| Transfer/Burn (ZIP 226) | ❌ Not implemented | CLI commands are stubs with educational messaging |
| GroupHash (`z.cash:OrchardZSA`) | ❌ Not implemented | Needs Pallas/Vesta group hash implementation |

### Near-term tasks
- [ ] Swap SHA-256 placeholders with real BLAKE2b implementations.
- [ ] Expose a typed `IssueAction` builder so we can serialize directly into future SDK calls.
- [ ] Integrate a local state store that mimics the `issued_assets` map (balance/finalization).
- [ ] Prototype a fake Orchard bundle and note commitment tree to rehearse consensus edge cases.

### Long-term tasks (require external primitives)
- [ ] Hook into an OrchardZSA-capable node or reference SDK for full transaction construction.
- [ ] Implement BIP-340 Schnorr signing against the real `SigHash` (ZIP 246).
- [ ] Add burn/transfer handling once ZIP 226 libraries are public.

If you contribute new spec coverage, please update this file so we always know where the gaps are.***

