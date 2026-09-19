# Runbook

## The pieces

| Script | What it does |
|---|---|
| `scripts/watch.ts` | finds burns on Solana and records a verdict for each |
| `scripts/mint.ts` | inscribes an NFT for every valid burn that has none |
| `scripts/ledger.ts` | rebuilds the NFT set from both chains and checks the supply invariant |
| `scripts/zcash-wallet.ts` | shows the minter's Zcash address and balance |
| `scripts/zcash-faucet.ts` | tops the minter up with testnet TAZ (solves the faucet's proof-of-work) |
| `scripts/burn.ts` | performs a test burn (devnet/localnet only; refuses mainnet) |
| `scripts/verify-inscription.ts` | fetches one inscription back off-chain and decodes it |

All take `BRIDGE_CONFIG` (a file in `config/`) and `BRIDGE_DB` (SQLite state, rebuildable).

## Normal operation

```sh
BRIDGE_CONFIG=config/devnet.json node scripts/watch.ts            # loop, every 15s
BRIDGE_CONFIG=config/devnet.json node scripts/mint.ts             # run after burns appear
BRIDGE_CONFIG=config/devnet.json node scripts/ledger.ts           # audit
```

`watch.ts` refuses to start if the configured token program or decimals disagree with the chain, so a
wrong mint in config cannot quietly judge burns by the wrong rules.

## Keys

- Solana payer: `keys/devnet-payer.json`
- Zcash minter: `keys/zcash-testnet.hex`

`keys/` is git-ignored, files are `0600`, and nothing ever prints a private key. The minter key is **hot**:
it pays inscription fees. Losing it costs fee ZEC only — it cannot mint a valid NFT (SPEC §4), which is the
whole point of the design.

## Funding the minter

```sh
node scripts/zcash-wallet.ts        # shows address and balance
node scripts/zcash-faucet.ts        # 0.1 TAZ per address per 24h
```

0.1 TAZ ≈ 330 inscriptions at today's fee. If the faucet is empty, `https://fauzec.com/` gives 1 TAZ but
pays a shielded address, which this wallet cannot spend from.

## When something goes wrong

**"Unpaid actions is higher than the limit"** — the fee was too low for the node's ZIP 317 rules. Check
`marginalFee()` in `src/zcash/fees.ts`; the 5000 → 1000 zat cut is mainnet-only, from height 3,590,000.

**"Transaction ... not found" from getSignaturesForAddress** — the RPC no longer knows the cursor
signature. Handled automatically: the pass re-scans and stops at the last processed slot. If it recurs,
the RPC has little history; point `rpc` at a provider that keeps more.

**Minting stops with "no confirmed utxos"** — the change output has not confirmed yet (testnet blocks are
~75s), or the wallet is empty. Wait, or top up.

**A burn got no NFT** — run `scripts/ledger.ts`. If it is under "unclaimed", the minter simply has not run
or is out of funds. If it is not listed at all, run `scripts/watch.ts` and look at the recorded reason:
the burn failed a rule (most often no memo, a memo that is not a transparent address, or below the
minimum).

**The ledger looks short, or NFTs are "unresolved"** — the Solana RPC cannot see the burns those
inscriptions cite. Point `rpc` at an **archival** provider and re-run. Never treat unresolved as invalid;
that is the difference between "this burn never happened" and "I cannot see it".

**Around a Zcash network upgrade** — the consensus branch id changes. It is read live from the node, but
a transaction built just before activation will be rejected after it. Pause minting across the activation
height, then resume.

## State

`BRIDGE_DB` holds burns, inscriptions and mint jobs. It is a cache: delete it and re-run `watch.ts` and
`ledger.ts` and it rebuilds from the two chains. Nothing authoritative lives only on this machine.

## Before mainnet

Not done, and each needs the operator:

1. Launch the token on pump.fun and put the real mint in `config/mainnet.json`, with `startSlot` set to
   the slot it was created in.
2. Fund a mainnet Zcash wallet with real ZEC (~30,000 zat per expected NFT).
3. Run the contract-auditor pass, then a single live inscription as a smoke test before opening it up.
4. Decide whether `t3`/P2SH recipient addresses are accepted (currently they are).
