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
| `startSlot` | burns in earlier slots do not count | the slot the mint was created in |
| `zcashNetwork` | `main` or `test` | `main` in production |
| `protocol` | inscription protocol tag | `zsam` |

## 3. Burn validity rule

A Solana transaction `T` is a **valid burn** if and only if every condition below holds. It is evaluated on
the transaction as recorded at `finalized` commitment.

1. `T` is finalized.
2. `T` succeeded (`meta.err` is null), and `T.slot ≥ startSlot`.
3. Among **all** burn instructions in `T`, top-level and inner, exactly **one** burns `solanaMint`.
   Burns of other mints are ignored.
4. That burn is a **top-level** instruction. A burn executed through CPI is not valid.
5. That burn was executed by `tokenProgramId`.
6. The **owner** of the burned token account, as recorded in `preTokenBalances`, equals the burn's
   authority account and is a signer of `T`. The owner must not be the system program or the
   incinerator: token accounts owned by those can be burned by **anyone with no signature**, so a
   stranger could otherwise burn abandoned tokens and claim the NFT.
7. The burned amount `N` (raw units, from the instruction) is `≥ minBurnRaw`, the recorded balance change
   of the source account equals `N`, and for `burnChecked` the decimals byte equals `decimals`.
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

### 4.2.1 Unresolved is not invalid

Condition 4 asks whether a cited burn **is** a valid burn. A verifier that cannot *see* the transaction
has not answered that question. "The burn never happened" and "my RPC does not reach that far back" look
identical locally, so an inscription whose burn cannot be fetched is reported **unresolved**, never
rejected.

This is not theoretical: rebuilding from an empty database against a validator whose history had aged out
produced exactly this case. Treating it as invalid would silently erase real NFTs whenever history is
pruned or a provider is swapped.

**A canonical rebuild therefore needs an archival Solana RPC.** `getTransaction` reaches back further than
`getSignaturesForAddress`, so a cited-but-unlisted burn is resolved by fetching it directly; but a node
that has neither cannot produce the full ledger, and should say so rather than publish a short one.

### 4.3 Supply invariant

For every deployment, at every block:

```
number of NFTs      ≤  number of valid burns
Σ amt over NFTs     =  Σ N over claimed burns   ≤  total burned
```

Conditions 4, 5 and 8 enforce this by construction.

## 5. Zcash inscriptions

An NFT is an inscription in the "ord" scriptSig envelope, the format ~113,000 mainnet inscriptions already
use and every live Zcash indexer reads, in the Universe Zerdinals **v1** profile
(`research/zcash-minting.md`). Two transactions:

```
commit:  funding UTXOs -> [0] P2SH(redeemScript) worth revealFee+postage, [1] change
reveal:  commit[0]     -> [0] recipient P2PKH, 546 zat postage
```

The reveal's `scriptSig` is:

```
PUSH "ord" | <totalPieces> | PUSH contentType | (<index> PUSH piece)... | PUSH sig | PUSH redeemScript
```

- content is split into 240-byte pieces, **indexed descending**, index 0 last;
- `contentType` is `application/json`;
- redeem script: `PUSH pubkey  OP_CHECKSIGVERIFY  PUSH C  OP_DROP  OP_DROP×(3+2·pieces)  OP_1`.

`C = SHA-256("UZRD1" || contentType || 0x00 || content)`. It matters because **scriptSig bytes are outside
the txid and covered by no signature** (§4.2 of ZIP 244): without `C`, relayed content could be altered
before confirmation without changing the transaction id. Our content is ~247 bytes, so one piece.

**Signing.** Transparent v5 transactions, ZIP 225 serialisation, ZIP 244 sighash. For a P2SH input the
script code is the **scriptPubKey of the output being spent**, not the redeem script. Signatures are DER
with S normalised low. Implemented in `src/zcash/zip244.ts`, verified by recomputing the sighash of a real
mainnet reveal and checking its on-chain signature verifies.

**Consensus branch id** is read live from the node (`GetLightdInfo`), never hardcoded: it changes at every
network upgrade, and NU7's value is not yet published. Minting should pause across an activation.

**Fees** are ZIP 317: `marginal_fee × max(2, logical_actions)`. The marginal fee drops 5000 → 1000 zat at
mainnet height 3,590,000, so it is height-aware. It is **not** yet active on testnet: a commit built at
1000/action was rejected with "Unpaid actions is higher than the limit". One NFT costs ~30,000 zat plus 546
postage (~$0.45), falling to ~6,500 zat (~$0.10) after the cut.

**Endpoints.** lightwalletd (`testnet.zec.rocks:443`) for chain tip, branch id, address UTXOs and
broadcast. No public Zcash RPC exposes `getaddressutxos` and no testnet explorer API works, so lightwalletd
is the only route.

## 6. Solana burn detection

Every burn instruction writes to the mint account, so every burn appears in
`getSignaturesForAddress(mint)` — but so does every trade. The watcher therefore fetches only transactions
whose **listing carries a memo**: §3 rule 8 requires one, so the filter can never drop a valid burn, and on
a busy token it avoids thousands of pointless fetches.

One pass:
1. page back from the newest finalized signature to the cursor;
2. process oldest → newest, recording a verdict for every memo-carrying transaction that burns our mint;
3. advance the cursor only after a clean pass.

A crash mid-pass re-fetches; verdicts are written once per signature, so replay is harmless and nothing is
skipped. The signature cursor is an **optimisation, not the source of truth**: an RPC that no longer knows
it (pruned history, a different provider) errors, so the pass falls back to re-scanning and stopping at the
last processed **slot**, which is stored alongside.

**Normalisation** reads raw instruction bytes (`encoding: "json"`), resolves address-lookup-table keys, and
takes the token-account owner from `preTokenBalances`. `jsonParsed` is not used for this: it can report a
normal owner as `multisigAuthority` when extra accounts are appended, and labels Token-2022 as
`spl-token` — either would reject a real burn, and a burn cannot be undone. `getTransaction` is called with
`maxSupportedTransactionVersion: 1`; asking for less makes the RPC throw on v1 transactions, which exist on
mainnet today.

## 7. Migration to native ZSA

_Deferred until ZSA activation is scheduled._ Intent (ADR 0001 §5): each NFT converts to exactly `amt`
units of a native shielded fungible asset. The NFT set at a published cut-off block is the snapshot.
