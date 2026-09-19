# Burn-to-mint protocol — specification

Version 1 (draft, 2026-09-19). Decision record: [`adr/0001-burn-to-mint.md`](adr/0001-burn-to-mint.md).

This document is the protocol. Anyone should be able to rebuild the NFT set from public chain data using
only this document, with no help from us, and get the same answer we do. The reference implementation is
`src/core/`. Where the two disagree, that is a bug; `validity.ts` and `ledger.ts` mirror §3 and §4
line by line.

---

## 1. Overview

```
 Solana                                   Zcash
 ──────                                   ─────
 holder sends ONE tx:                     anyone (normally our minter) inscribes:
   burn / burnChecked  (our mint, N)        content = {"p":"zsam","op":"mint",...,"burn":<sig>,"amt":N,"to":<t-addr>}
   memo               ("<t-addr>")          delivered to <t-addr>
          │                                          │
          └──── §3 burn validity rule ───────┐       │
                                             ▼       ▼
                                    §4 ledger rule: which inscriptions are NFTs
```

- Burning is **one-way**. No party holds user funds at any point.
- Minting is **permissionless**. Validity comes from the rules, not from who signed. A stolen minter key
  cannot create a valid NFT (§4, and the test `ledger.test.ts › stolen minter key cannot inflate supply`).

## 2. Parameters

A deployment is fixed by these values. They are published with the collection and never change once the
first burn is made.

| Parameter | Meaning | Default |
|---|---|---|
| `solanaMint` | the memecoin's mint address | set at launch |
| `tokenProgramId` | the program that owns the mint (SPL Token or Token-2022) | from the mint account |
| `decimals` | mint decimals | from the mint (pump.fun: 6) |
| `minBurnRaw` | minimum burn, in raw base units | 1,000,000 tokens = `1_000_000 × 10^decimals` |
| `zcashNetwork` | `main` or `test` | `main` in production |
| `protocol` | inscription protocol tag | `zsam` |

## 3. Burn validity rule

A Solana transaction `T` is a **valid burn** if and only if every condition below holds. It is evaluated on
the transaction as recorded at `finalized` commitment.

1. `T` is finalized.
2. `T` succeeded (`meta.err` is null).
3. Among **all** burn instructions in `T`, top-level and inner, exactly **one** burns `solanaMint`.
   Burns of other mints are ignored.
4. That burn is a **top-level** instruction. A burn executed through CPI is not valid.
5. That burn was executed by `tokenProgramId`.
6. The burn's authority (owner or delegate) is a signer of `T`.
7. The burned amount `N` (raw units, taken from the instruction) is `≥ minBurnRaw`.
8. `T` contains exactly **one** memo instruction.
9. The memo text, after trimming surrounding ASCII whitespace, is a Zcash **transparent** address
   (§3.1) on `zcashNetwork`.

A valid burn yields `(signature, N, zcashAddress)`.

**Why so strict:** burns are irreversible, so ambiguity would be costly. Each condition removes a case
where two honest verifiers could disagree, or where a burn could be attributed to the wrong person.
Condition 9's trim is the one deliberate leniency: a trailing newline added by a wallet must not cost a
burner their NFT.

### 3.1 Zcash transparent addresses

`base58check(prefix ‖ hash160)`, 22-byte payload:

| Network | P2PKH | P2SH |
|---|---|---|
| main | `1C B8` (`t1…`) | `1C BD` (`t3…`) |
| test | `1D 25` (`tm…`) | `1C BA` (`t2…`) |

Unified (`u1…`), TEX (`tex1…`) and shielded addresses are **not** accepted. An inscription is a
transparent output, so it cannot be delivered to them.

## 4. NFT ledger rule

### 4.1 Content

An NFT's inscription body is this exact byte string (UTF-8, no whitespace, keys in this order):

```
{"p":"zsam","op":"mint","v":1,"mint":"<solanaMint>","burn":"<signature>","amt":"<N>","to":"<zcashAddress>"}
```

- `amt` is a decimal string with no leading zeros.
- Content type is exactly `application/json`.
- Only the canonical encoding is valid. Any re-encoding of the same fields (different key order,
  whitespace, escapes, a numeric `amt`) is not an NFT.

### 4.2 Validity

Walk the candidate inscriptions in **chain order** (block height, then position in block, then inscription
index within the transaction). An inscription `I` is an NFT if and only if:

1. its content type is `application/json`;
2. its body is canonical content (§4.1) with our `protocol`;
3. `mint` equals `solanaMint`;
4. `burn` names a Solana transaction that is a valid burn (§3);
5. `amt` equals that burn's `N`;
6. `to` equals that burn's `zcashAddress`;
7. the inscription was first received by `zcashAddress`;
8. no earlier inscription in chain order has already been accepted as an NFT for the same `burn`.

NFTs are numbered `#1, #2, …` in the order they are accepted, with no gaps.

A valid burn with no NFT yet is **unclaimed**. The set of unclaimed burns is the minter's work queue.

### 4.3 Supply invariant

For every deployment, at every block:

```
number of NFTs      ≤  number of valid burns
Σ amt over NFTs     =  Σ N over claimed burns   ≤  total burned
```

Conditions 4, 5 and 8 enforce this by construction.

## 5. Zcash inscriptions

_Pending research: `research/zcash-minting.md`._ The inscription envelope, the transaction library, and
the endpoints.

## 6. Solana burn detection

_Pending research: `research/solana-burn.md`._ How burns are discovered gap-free, and how RPC responses are
normalised into the shape §3 evaluates.

## 7. Migration to native ZSA

_Deferred until ZSA activation is scheduled._ Intent (ADR 0001 §5): each NFT converts to exactly `amt`
units of a native shielded fungible asset. The NFT set at a published cut-off block is the snapshot.
