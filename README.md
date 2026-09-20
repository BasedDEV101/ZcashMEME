# Zcash Shielded Assets & Memes

Burn a Solana memecoin, receive a Zcash NFT stamped with exactly how much you burned.

```
  Solana                                              Zcash
  ──────                                              ─────
  burn 7,350,000 $MEME  ──┐                    ┌──▶  NFT inscription
  + memo "tm…"            │                    │     {"burn":"5Wr…","amt":"7350000000000","to":"tm…"}
                          └──▶ watcher ──▶ minter ──▶ delivered to tm…
```

**One-way. Nobody holds your funds.** The tokens are destroyed on Solana; nothing sits in an escrow that
could be hacked or run off. The NFT's value comes from scarcity and the amount it records, not from a
redemption promise. It is "1:1 converted", never "1:1 backed".

**Minting is permissionless and the minter is not trusted.** An inscription only counts as an NFT if it
cites a real, unclaimed burn and is delivered to the address that burner chose. A stolen minter key can
waste fee ZEC and nothing else — [proved on the real testnet](docs/PROGRESS.md), not just in tests.

> **Earlier work:** the original ZIP 227 CLI sandbox — issuance-key derivation, asset IDs and a mocked
> lifecycle against the draft spec — is preserved on the [`master`](../../tree/master) branch. It targets a
> retired token and is kept for reference, not maintained.

## Status

Working end to end on **local Solana + Zcash testnet**. Nothing has touched mainnet.
See [`docs/PROGRESS.md`](docs/PROGRESS.md) for what is verified, and
[`docs/SPEC.md`](docs/SPEC.md) for the protocol.

## How it works

1. A holder sends **one** Solana transaction: `burnChecked` of the mint, plus a memo holding their Zcash
   transparent address.
2. The watcher finds it (`getSignaturesForAddress` on the mint, fetching only memo-carrying transactions)
   and judges it against the burn validity rule (SPEC §3).
3. The minter inscribes the NFT on Zcash: a commit/reveal pair in the "ord" envelope every Zcash indexer
   reads, delivered to the burner's address.
4. The indexer rebuilds the whole NFT set from both chains, so anyone can check our arithmetic.

Later, when native Zcash Shielded Assets activate, each NFT converts to that many shielded tokens
(ADR 0001 §5). That is the point at which holdings become genuinely private; today the Zcash side is
public, and the research explains why nothing else on Zcash is any different.

## Quick start

```sh
npm install
npm test                                   # 69 tests, no network needed

# watch a mint for burns
BRIDGE_CONFIG=config/devnet.json node scripts/watch.ts --once

# inscribe any burn that has no NFT yet
BRIDGE_CONFIG=config/devnet.json node scripts/mint.ts

# rebuild the NFT ledger from chain data and check the supply invariant
BRIDGE_CONFIG=config/devnet.json node scripts/ledger.ts
```

Runbook: [`docs/RUNBOOK.md`](docs/RUNBOOK.md). Research behind the decisions:
[`docs/research/REPORT.md`](docs/research/REPORT.md).

## Layout

```
src/core/      the rules: burn validity, canonical NFT content, the ledger. No SDK, no network.
src/solana/    raw-bytes transaction parsing, RPC client, gap-free burn watcher
src/zcash/     ZIP 244 signing, ZIP 225 serialisation, inscription envelope, minter, indexer
src/store/     SQLite state (node:sqlite); everything in it is rebuildable from chain
scripts/       operator entry points
docs/          SPEC, ADRs, PROGRESS, RUNBOOK, research
```
