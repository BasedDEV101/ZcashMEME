# Progress

Overnight build, 2026-09-19 → 20. Everything below was **run**, not asserted. Nothing has touched mainnet.

## Working end to end

A real burn on a real Solana validator becomes a real NFT on Zcash testnet:

```
Solana (local validator, Token-2022 mint shaped like pump.fun create_v2)
  burn 5Wr3167T…  7,350,000 tokens + memo "tmUHYhM9…"
  burn 39aG9NF4…  2,500,000 tokens + memo "tmJTasqC…"
        │ watcher: fetched only memo-carrying txs, judged against SPEC §3
        ▼
Zcash testnet
  #1  21609e6209df…i0   ->  tmUHYhM9ovko4o3KDTny193C2hF4J87HpyD
  #2  51713d600e75…i0   ->  tmJTasqCa8vViE578Ay1jbk2DKrehG47dfZ

ledger rebuilt from both chains:
  represented by NFTs : 9,850,000 tokens
  validly burned      : 9,850,000 tokens     invariant OK
```

Each inscription was fetched back off-chain and decoded independently: correct content type, the exact
burn signature, amount and recipient, and the v1 commitment verifies.

## The security property, proved on the real chain

Using the minter's **own key**, a well-formed NFT was inscribed citing a burn that never happened, with
**10× the amount**, delivered to a real burner's address. Zcash accepted it
(`d54660626ac2…`) — consensus has no opinion on our rules. The ledger rejects it: **"unknown burn"**, and
the supply invariant still holds exactly.

That is the stolen-minter-key scenario executed for real. The minter is not trusted.

## Verified against real data, not just fixtures

| Claim | How it was proved |
|---|---|
| ZIP 244 sighash matches consensus | recomputed the sighash of mainnet reveal `4f7763af…`; its **on-chain signature verifies**. Tampering with expiry, branch id or any value breaks it |
| ZIP 225 serialisation is correct | re-serialising that transaction reproduces its bytes **exactly** |
| txid algorithm is correct | computed id equals the explorer's `4f7763af…` |
| inscription envelope is the real format | our decoder reads that mainnet inscription; our builder emits a **byte-identical** 41-byte legacy redeem script |
| hash160 / addresses | generator-point vector; addresses round-trip and start `t1`/`t3`/`tm`/`t2` |

## Bugs found by running it

1. **Mainnet carries v1 transactions.** Asking for `maxSupportedTransactionVersion: 0` made the RPC throw,
   which would have stalled the watcher on a real burn.
2. **pump.fun mints are Token-2022**, not classic SPL. Defaults and the test mint were wrong.
3. **`jsonParsed` can mislabel an owner as `multisigAuthority`** and labels Token-2022 as `spl-token` —
   either would have **rejected a genuine burn**, unrecoverably. Replaced with raw-byte parsing.
4. **A third memo program exists** (`Memo4c2p…`, the default in `@solana-program/memo` 0.14). Missing it
   would mean not seeing a burner's address.
5. **Token accounts owned by the system program or incinerator can be burned by anyone with no
   signature** — a stranger could have burned abandoned tokens and claimed the NFT. Now excluded by rule.
6. **The reduced ZIP 317 fee is not live on testnet.** A commit at 1000 zat/action was rejected with
   "Unpaid actions is higher than the limit".
7. **A cursor signature the RPC no longer knows wedges the watcher forever.** Hit for real; now falls back
   to a slot cursor.
8. **UTC/local timestamp split** in the queue schema (found twice, independently).
9. **"Unknown burn" conflated two different things.** Rebuilding from an empty database against a
   validator whose history had aged out marked a real NFT's burn as *invalid* when the truth was
   *unseeable*. A pruned RPC would silently erase real NFTs. The ledger now reports **unresolved**
   separately, the indexer fetches cited burns directly, and a canonical rebuild is documented as needing
   an archival RPC.

## Numbers

- One NFT: 247-byte content, 425-byte scriptSig, **30,546 zat (~$0.45)**; ~6,500 zat (~$0.10) once the fee
  cut lands on mainnet.
- Minter funded with 0.1 TAZ (~330 inscriptions) via the faucet's proof-of-work, solved in ~1s.
- 69 tests, typecheck clean, no network needed to run them.

## Not done

- **The burn UI.** It needs the impeccable interview (users, purpose, stack), which needs the operator.
- **Mainnet anything.** Requires the pump.fun launch, a funded mainnet wallet, and approval.
- **Transfer tracking.** An inscription is discoverable while it sits at its first owner's address;
  ordinal-style transfer tracking needs block-level scanning.
- **A full rebuild needs an archival Solana RPC.** Rebuilding against the local validator recovered only
  the burns still in its history. That is correct behaviour, but it means the canonical ledger should be
  rebuilt against a provider with full history.
- **Multi-piece inscriptions.** Content over 240 bytes × 4 would need reveal chaining. Ours is one piece.
