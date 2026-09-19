# Solana side of the burn-to-mint bridge: tokens, burn detection, validity rule, devnet

Date: 2026-09-19. Status: **research only.** No packages installed, no keys, no transactions sent.
Scope: a pump.fun memecoin holder sends **one** Solana transaction with (a) a standard token-program
`burn`/`burnChecked` of our mint and (b) a Memo instruction holding a Zcash address. A Node verifier finds those
transactions, and a minter inscribes a Zcash NFT recording the burn signature and amount. No custom Solana program.

Verdict key: **CONFIRMED** = checked against a primary source (program source, official docs/IDL, or a live RPC read I
made today). **UNVERIFIABLE** = only secondary sources, or the primary source could not be read. **STALE** = the
source is old or uses outdated naming.

Live RPC reads for this report were made on 2026-09-19 against `api.mainnet-beta.solana.com` and
`api.devnet.solana.com` (read-only: `getSignaturesForAddress`, `getTransaction`, `getAccountInfo`,
`getMultipleAccounts`).

---

## TL;DR

- **pump.fun coins are Token-2022 mints now.** They're created by `create_v2`: 6 decimals, 1,000,000,000 supply
  (raw `1_000_000_000_000_000`), **mint authority revoked** in the create transaction, **no freeze authority**, and
  metadata update authority set to null. The only extensions are `MetadataPointer` and `TokenMetadata`. There's no
  transfer hook, transfer fee, permanent delegate, pausable or permissioned-burn, so **holders can burn freely
  before and after graduation.** Exception: **Mayhem-mode coins have 2B supply**, and pump's agent burns tokens. Don't
  enable Mayhem.
- **Use `burnChecked`** (Token-2022 program `TokenzQdBN…`, discriminator 15, accounts `[source, mint, owner]`), plus
  a Memo instruction. **Memo has three live program IDs** (v1 `Memo1Uh…`, v3 `MemoSq4…`, v4 `Memo4c2p…`, the new
  default in `@solana-program/memo`). The verifier must accept all three, and the UI should pass the owner as a
  memo signer.
- **Detection: poll `getSignaturesForAddress(mint)` at `finalized` as the source of truth.** Every burn must list
  the mint account, and the RPC indexes lookup-table-loaded keys too. The result's `memo` field lets you skip about
  99% of rows (trades) without calling `getTransaction`. Treat websockets and webhooks as optional latency hints,
  never as the record.
- **Parse the raw instruction bytes, not the `jsonParsed` convenience fields**, and cross-check with pre/post token
  balances. Several honest-verifier disagreements come from parser quirks (multisig labelling, trailing bytes,
  inner vs top-level, RPC version). Also call `getTransaction` with **`maxSupportedTransactionVersion: 1`**: v1
  transactions now exist, and `0` makes the RPC return an error for them.
- **Security trap:** token accounts owned by the **system program or incinerator can be burned by anyone**, with no
  owner signature. The rule must require *authority == source owner == a transaction signer*, and that owner must
  not be the system program or incinerator.
- **pump.fun's program runs on devnet** at the same address (`6EF8rr…`), and `CreateV2` transactions were landing
  there today. So a test mint can be byte-for-byte the real thing, via `@pump-fun/pump-sdk`. A hand-rolled
  Token-2022 recipe with `@solana-program/token-2022` works as a fallback.
- **SDK:** `@solana/kit` 8.x plus `@solana-program/{token-2022,memo,system}` and `@solana/react` for the UI.
  `@solana/web3.js` 1.x is officially a "maintenance branch". Use it only where `@pump-fun/pump-sdk` forces it
  (devnet test script).
- **Zcash memo:** accept only a strict Base58Check **transparent P2PKH** address for the configured network
  (`t1…` mainnet / `tm…` testnet, always 35 chars, prefix bytes `1CB8` / `1D25`). **Reject unified (u1/zu/tu) and
  TEX addresses.** Treat `t3`/`t2` (P2SH) as an operator decision; the default is reject.

---

## 1. pump.fun tokens today

| Claim | Verdict | Source |
|---|---|---|
| New coins are created with `create_v2`, which "will use the **Token2022 program** for token creations and to host the metadata, instead of Metaplex". Legacy `create` "will also be active and will be **deprecated** at a later time" (announced 2025-11-07, live 2025-11-11) | CONFIRMED | [release notes commit bec9a97](https://github.com/pump-fun/pump-public-docs/commit/bec9a97a5ce4586c7c889647122be0e9ca12f620) |
| `create_v2` mint = "New Token-2022 mint account … `decimals = 6` … metadata pointer set to `mint`". The token program account is `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | CONFIRMED | [COIN_CREATION.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md) (last changed 2026-09-12/14) |
| Legacy `create` is still in the IDL. `create_v2` IDL doc: "Creates a new spl-22 coin". There's also an admin `toggle_create_v2` | CONFIRMED | [idl/pump.json](https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json) |
| Global `token_total_supply = 1000000000000000` (1B tokens × 10^6) | CONFIRMED | [PUMP_PROGRAM_README.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md) |
| Program `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` is deployed on mainnet **and devnet** | CONFIRMED (doc + live `getAccountInfo` on devnet) | same README |

**Live mainnet check (2026-09-19).** I sampled 21 recent pump-program transactions and took the mints they touched.
All 6 were Token-2022, with `decimals 6`, `mintAuthority: null`, `freezeAuthority: null`, and extensions
`[metadataPointer, tokenMetadata]` with metadata `updateAuthority: null`. Examples:
[BbTEBH…pump](https://solscan.io/token/BbTEBH5bDGDUgT5VfL5VvVF9XEPyMboDhYDirgH2pump) (supply 1e15) and
[3jKBeQ…pump](https://solscan.io/token/3jKBeQcCXpPYGYbGet4N489fv2MJ1uFEdDirMGkVpump) (supply 2e15). **CONFIRMED.**

**Anatomy of a live `create_v2`**
([tx 2CpvUS…](https://solscan.io/tx/2CpvUSpo3Cw66vM753CYLnADuhSKEdZfR4HvoJ4wR33ZDEhgEUyJHJLzjmi3A9w7tzWrrrWJDi8bjyzwb6HApygg),
inner instructions read via `getTransaction jsonParsed`). **CONFIRMED:**
1. `createAccount` owned by Token-2022, then `initializeMetadataPointer`.
2. `initializeMint2 { decimals: 6, mintAuthority: <pump PDA TSLvdd…> }`, with **no freeze authority**.
3. `initializeTokenMetadata`, then `updateTokenMetadataAuthority → null`.
4. `mintTo 1_000_000_000_000_000` to the bonding-curve ATA. This coin was Mayhem mode, so a **second**
   `mintTo 1e15` went to the Mayhem vault owned by `BwWK17…`.
5. `setAuthority { authorityType: mintTokens, newAuthority: null }`, which **revokes the mint authority in the same tx**.

**Mayhem mode.** Mayhem is an opt-in create flag (`is_mayhem_mode`). It doubles supply to 2B, and per secondary
reporting pump's AI agent trades for 24h and then burns its unsold tokens. The supply doubling is CONFIRMED on-chain
(two `mintTo`s above). The agent-burn behaviour is UNVERIFIABLE:
[pump.fun/docs/mayhem-mode](https://pump.fun/docs/mayhem-mode) returned HTTP 403, and the secondary source is
[Cryptonomist 2025-11-12](https://en.cryptonomist.ch/2025/11/12/pump-fun-mayhem-ai-trading/).
**Recommendation: launch with Mayhem off.** A 1B supply keeps the maths simple, and third-party burns of the mint
would otherwise show up in our scan. Those burns can't claim NFTs without a memo and the owner's signature, but
they are noise.

**Can holders burn?** Yes, during the bonding curve and after graduation. **CONFIRMED by source:**
- A holder's tokens sit in their own Token-2022 account. `process_burn` in Token-2022 blocks a standard burn only
  in these cases: the account is frozen, the mint has `PermissionedBurn` with an authority set, `Pausable` is
  paused, or `ConfidentialMintBurn` is set
  ([processor.rs `process_burn`](https://github.com/solana-program/token-2022/blob/main/program/src/processor.rs)).
- pump mints have no freeze authority and none of those extensions, so nobody can freeze accounts or block burns.
- Graduation migrates liquidity to PumpSwap and burns the **LP** tokens. The coin's mint is unchanged
  ([PUMP_PROGRAM_README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md)).

**Gotchas**
- **You must use the Token-2022 program ID** in the burn instruction and when deriving the user's ATA. The pump
  release notes say: "The user token account should also be derived with Token2022". Sending a burn to
  `Tokenkeg…` for a Token-2022 mint fails. CONFIRMED ([release notes](https://github.com/pump-fun/pump-public-docs/commit/bec9a97a5ce4586c7c889647122be0e9ca12f620)).
- **Don't hard-code the program.** Legacy `create` still exists, and pump can toggle `create_v2`. After launch, read
  the mint account once and pin `mint.owner` (the token program), `decimals` and the extension list in config. The
  verifier should refuse to start if they differ.
- **Burning doesn't touch the bonding curve.** `BondingCurve.token_total_supply` and reserves are pump's own
  accounting. Mint `supply` goes down, but pump.fun's displayed market cap may not follow. Tokens held *by the curve*
  can't be burned by users.
- `mint.supply` is a live number. A mint showing exactly `1e15` has had no burns yet.
- **SIMD-0266 p-token.** It replaced the *legacy* Token program's bytecode on mainnet (epoch 971, 2026-05-13), with
  the same instruction set. Not relevant for Token-2022 pump coins, but relevant if the mint were ever legacy.
  CONFIRMED that it happened ([solana.com/upgrades/p-token](https://solana.com/upgrades/p-token),
  [Anza on X](https://x.com/anza_xyz/status/2054549276546470100)). The exact date comes from a secondary source.

---

## 2. Burn plus memo in one transaction

### Instructions (CONFIRMED from [token-2022 `instruction.rs`](https://github.com/solana-program/token-2022/blob/main/interface/src/instruction.rs) + [IDL](https://github.com/solana-program/token-2022/blob/main/idl.json); same layout in [SPL Token](https://github.com/solana-program/token))

| | Program | Data | Accounts |
|---|---|---|---|
| `Burn` | Token `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` or Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | `[8] ++ u64 LE amount` | 0 `[w]` source token account · 1 `[w]` mint · 2 `[s]` owner/delegate (then multisig signers) |
| `BurnChecked` | same | `[15] ++ u64 LE amount ++ u8 decimals` | same |

- **Use `BurnChecked`.** The program rejects it if `decimals != mint.decimals` (`MintDecimalsMismatch`), so a
  UI bug can't burn 10^6× too much. It's also what hardware wallets expect. CONFIRMED (processor).
- The program **ignores trailing bytes** after the amount/decimals (`unpack` returns `rest`). A verifier that
  requires exactly 9 or 10 bytes would reject burns the chain accepted. CONFIRMED (`instruction.rs` unpack).
- Token-2022 also has `PermissionedBurn*` and `ConfidentialBurn` instructions. They're irrelevant for pump mints,
  and our rule accepts only discriminators 8 and 15.

### Memo program IDs: there are three

From [solana-program/memo `interface/src/lib.rs`](https://github.com/solana-program/memo/blob/main/interface/src/lib.rs)
and [`clients/js/src/constants.ts`](https://github.com/solana-program/memo/blob/main/clients/js/src/constants.ts):

| Name in repo | Address | Status |
|---|---|---|
| v1 (legacy) | `Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo` | kept "for reading memos emitted by older transactions" |
| v3 (legacy; **called "v2" in older docs**) | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` | still deployed and widely used |
| v4 (p-memo, current) | `Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH` | `MEMO_PROGRAM_ADDRESS` in `@solana-program/memo` 0.14.1 (address added 2026-05-21) |

- v4 is **deployed on mainnet and devnet** (my `getAccountInfo` returned an executable upgradeable-loader program),
  and in real use (recent mainnet txs). Agave's `jsonParsed` and the `memo` field of `getSignaturesForAddress`
  recognise **all three**
  ([parse_instruction.rs](https://github.com/anza-xyz/agave/blob/master/transaction-status/src/parse_instruction.rs),
  [extract_memos.rs](https://github.com/anza-xyz/agave/blob/master/transaction-status/src/extract_memos.rs)). CONFIRMED.
- **STALE:** [spl.solana.com/memo](https://www.solana-program.com/docs/memo) still uses "v2" naming and the v3
  log format (`Memo (len N): "text"`). v4 logs `Memo (len N)` and then the raw text on a separate line. **So don't
  parse memos from logs.** Read the instruction data.
- The JS client ships `getMemosFromInstructions()` (added 2026-09-16), which matches all three addresses
  ([memos.ts](https://github.com/solana-program/memo/blob/main/clients/js/src/memos.ts)). CONFIRMED.

**Should the memo get the signer?** It's optional. If you pass accounts to the memo instruction, **every one must be a
transaction signer** or the tx fails with `MissingRequiredSignature`. The program logs `Signed by:` plus the keys
([v4 entrypoint.rs](https://github.com/solana-program/memo/blob/main/program/src/entrypoint.rs)). CONFIRMED.
**Recommendation: pass the burning owner as the memo signer** (`getAddMemoInstruction({ memo, signers: [owner] })`).
It costs nothing and makes the memo self-evidently authored by the burner in explorers. The validity rule doesn't
*require* it, though: the transaction signature already binds the owner to the whole transaction.

### Parsing a confirmed transaction (Node)

Fetch with
`getTransaction(sig, { commitment: 'finalized', maxSupportedTransactionVersion: 1, encoding: 'json' })`.
Use **`1`**, not `0`: "Set it to `1` to also fetch v1 transactions … If you request a transaction with a higher
version than this value, an error will be returned"
([getTransaction docs](https://solana.com/docs/rpc/http/gettransaction)). CONFIRMED. v1 transactions (SIMD-0296/0385,
4 KB) activated around 2026-09-09 per a secondary source
([Yahoo/BeInCrypto](https://finance.yahoo.com/markets/crypto/articles/solana-activates-transaction-v1-september-190034689.html)).
That date is UNVERIFIABLE, but the RPC parameter is documented.

Build the full account-key list as `staticKeys ++ meta.loadedAddresses.writable ++ meta.loadedAddresses.readonly`
([JSON structures](https://solana.com/docs/rpc/json-structures)). Then:

| Field | Where to get it | Notes |
|---|---|---|
| **success** | `meta.err === null` | Failed txs are returned by `getSignaturesForAddress` (with `err` set) **and still carry a `memo` string**, because the memo is extracted from the *message*, not execution ([extract_memos.rs](https://github.com/anza-xyz/agave/blob/master/transaction-status/src/extract_memos.rs)). CONFIRMED |
| **mint** | `keys[ix.accounts[1]]` of the top-level burn ix | must equal our mint |
| **source account** | `keys[ix.accounts[0]]` | |
| **authority** | `keys[ix.accounts[2]]` | may be the **owner or a delegate**. `jsonParsed` calls it `authority`, or **`multisigAuthority` + `signers` whenever the ix has >3 accounts**, *even for a normal owner that just had extra accounts appended* ([parse_token.rs `parse_signers`](https://github.com/anza-xyz/agave/blob/master/transaction-status/src/parse_token.rs); the program ignores extras for non-multisig owners, see `validate_owner` in [processor.rs](https://github.com/solana-program/token-2022/blob/main/program/src/processor.rs)). CONFIRMED |
| **owner of source** | `meta.preTokenBalances[i].owner` where `keys[accountIndex] == source` | `owner`/`programId` are "Omitted if the validator did not record it" ([JSON structures](https://solana.com/docs/rpc/json-structures)). Fall back to rejecting as *indeterminate* |
| **is signer** | index `< message.header.numRequiredSignatures` | |
| **amount (canonical)** | instruction data bytes 1..9 as u64 LE | `jsonParsed`: `info.amount` (burn) or `info.tokenAmount.amount` (burnChecked) |
| **amount (cross-check)** | `pre.amount − post.amount` for the source account; a **missing post entry = 0** (account closed in same tx) | Differs from the ix amount if the same tx also moves tokens in or out of that account |
| **memo text** | top-level ix whose program ∈ {v1, v3, v4}; data decoded as strict UTF-8 | `jsonParsed` gives `parsed: "<text>"` with `program: "spl-memo"` |

**Which amount is more reliable?** The instruction amount is exactly what the token program subtracted from supply.
It's deterministic from the transaction bytes alone. Balance deltas are *net* effects, which are right for "how much
did this account lose" but wrong whenever the transaction also transfers in or out. **Rule: the instruction amount is
canonical, and the balance delta must equal it**, otherwise reject. That catches composite or odd transactions
instead of guessing. The mint's supply delta isn't available per transaction.

**Note:** `jsonParsed` labels Token-2022 instructions `program: "spl-token"` as well (seen in the live create tx
above). Always compare **`programId`**, never the label.

### Pitfalls checklist

- **CPI / inner burns.** A burn done by some program via CPI appears only in `meta.innerInstructions`. The Token-2022
  CPI-guard extension can also block owner burns via CPI. **Count top-level instructions only.** Reject if any inner
  instruction burns our mint too (ambiguous intent). A CPI burn also can't be tied to "this memo" cleanly.
- **Multiple burns in one tx.** Reject unless there is exactly one top-level burn of our mint. Summing invites
  disagreement over whose owner and which memo.
- **Memo in a different tx.** It doesn't count; there's no way to pair them deterministically. Burns without a
  memo are unrecoverable under the rule, and the UI must make that impossible (see §6).
- **Failed tx still listed.** Filter on `err === null` in *both* the signature row and `meta.err`.
- **Delegate burning someone else's tokens.** `authority` can be an `Approve`d delegate (or a permanent delegate;
  pump mints don't have one). Require `authority == owner`.
- **Anyone-can-burn accounts (important).** If the source token account's owner is the **System Program** or the
  **incinerator `1nc1nerator11111111111111111111111111111111`**, *the program skips the authority check entirely*.
  Any account can be passed as "authority", even a non-signer. CONFIRMED in
  [Token-2022 `process_burn`](https://github.com/solana-program/token-2022/blob/main/program/src/processor.rs) and
  [p-token `shared/burn.rs`](https://github.com/solana-program/token/blob/main/pinocchio/program/src/processor/shared/burn.rs).
  Worked example: people "burn" 5M tokens by sending them to the incinerator's ATA. An attacker then calls
  `burnChecked(incineratorATA, 5M)` with their own memo and would claim 5M worth of NFTs for tokens they never
  owned. The rule must reject owner ∈ {System, incinerator} and require the authority to be a tx signer.
- **Multisig owners.** The owner is a multisig account, not a signer. Reject. It's deterministic, and nobody
  should be doing this for a memecoin.

---

## 3. Detecting burns

### Does `getSignaturesForAddress(mint)` see every burn? Yes.
- `Burn`/`BurnChecked` **require** the mint as account 1 (writable), because the program decrements `mint.supply`.
  So every burn transaction contains the mint key. CONFIRMED (instruction docs above).
- The RPC indexes a signature under **every account key of the message, including lookup-table-loaded ones**.
  `transaction_status_service` writes `message.account_keys()` (static + loaded) with writability
  ([rpc/src/transaction_status_service.rs](https://github.com/anza-xyz/agave/blob/master/rpc/src/transaction_status_service.rs)).
  CPIs can only touch accounts in that list, so inner burns are indexed too. CONFIRMED.
- Token-2022 isn't special here; the index is by address. I verified live: `getSignaturesForAddress` on a Token-2022
  pump mint returned its full history back to its `create_v2`. CONFIRMED.
- API facts: `limit` 1–1000, newest→oldest, `before`/`until` cursors, `commitment` confirmed|finalized (no
  processed), rows carry `err`, `memo`, `slot`, `blockTime`
  ([docs](https://solana.com/docs/rpc/http/getsignaturesforaddress)). CONFIRMED.

**Volume:** the mint key is also in **every trade** (a young pump coin I sampled had 468 signatures in about 10
minutes). That's fine: one call returns 1000 rows, and the `memo` column is the pre-filter. Only rows with
`err == null && memo != null` need a `getTransaction`. The memo format is `"[len] text"`, with multiple memos joined
by `"; "` (extract_memos.rs). Use it only to *select* candidates. Always re-derive from the full transaction.

### Gap-free, idempotent loop (recommended)

```
state: lastFinalizedSig, lastFinalizedSlot          (persisted, e.g. SQLite)
table burns(signature PRIMARY KEY, slot, status, ...) (UNIQUE ⇒ idempotent)

every N seconds:
  page = getSignaturesForAddress(MINT, {commitment:'finalized', until:lastFinalizedSig, limit:1000})
  while page.length == 1000: page += getSignaturesForAddress(..., before: page.at(-1).signature)
  for row in page oldest→newest:
      if row.err == null && row.memo != null:
          tx = getTransaction(row.signature, {commitment:'finalized', maxSupportedTransactionVersion:1})
          verdict = applyRule(tx)            // pure function of tx bytes + config
      INSERT OR IGNORE burns(row.signature, row.slot, verdict)
  lastFinalizedSig = newest row; commit in the same DB transaction
```

- Paging with `until` stops at the previous cursor, so nothing is re-read and nothing is skipped. On a crash
  between insert and cursor update, the `INSERT OR IGNORE` on the signature makes the replay harmless.
- Defensive option: every hour, re-scan the last ~N slots without `until` and diff against the table. That catches
  any RPC node that was briefly behind.
- The minter consumes `burns WHERE status='valid' AND minted IS NULL` and records the Zcash txid. That's
  "one NFT per signature" at the database layer. The public, checkable version is that the inscription itself
  carries the Solana signature, so anyone can spot duplicates.
- **Use `finalized` for anything that mints.** `confirmed` means ">2/3 stake voted", but it can in principle still
  be rolled back. `finalized` means "maximum lockout"
  ([RPC commitment docs](https://solana.com/docs/rpc)). CONFIRMED. Today that's about 13 s behind confirmed.
  **Alpenglow** targets about 150 ms finality and is tentatively scheduled for **2026-09-28 / October**
  ([Cryptoticker](https://cryptoticker.io/en/solana-alpenglow-activation-date-validator-check/),
  [solana.com/upgrades/alpenglow](https://solana.com/upgrades/alpenglow)). The date is UNVERIFIABLE (secondary). It
  doesn't change our design; finalized just gets faster.

### Push options (latency only, never the source of truth)
- **`logsSubscribe({ mentions: [MINT] }, 'finalized')`**. `mentions` "supports exactly one address"
  ([docs](https://solana.com/docs/rpc/websocket/logssubscribe)). CONFIRMED. Use it to trigger an immediate poll.
  Websockets drop silently, so the poll loop stays authoritative.
- **Helius webhooks** (enhanced or raw): 1 credit per event, and "might receive duplicate events"
  ([webhooks](https://www.helius.dev/docs/webhooks), [credits](https://www.helius.dev/docs/billing/credits)).
  CONFIRMED for those two facts. Commitment level and per-plan webhook counts aren't documented on the pages I could
  read: UNVERIFIABLE.
- **Helius `getTransactionsForAddress`** can filter `status: succeeded`, sort `asc`, and paginate with a
  `slot:position` token ([docs](https://www.helius.dev/docs/rpc/gettransactionsforaddress)). That would be neat, but
  it's a Helius-only method and Free-plan availability is unclear (UNVERIFIABLE). Don't make the canonical rule
  depend on it.
- **Geyser / LaserStream gRPC** isn't on Helius Free ([plans](https://www.helius.dev/docs/billing/plans)). It's
  overkill at our volume.

### Rate limits
| Endpoint | Limits | Verdict |
|---|---|---|
| Public `api.mainnet-beta.solana.com` / devnet | 100 req/10 s per IP; 40 req/10 s per IP *per RPC method*; 40 concurrent conns; 100 MB/30 s. "not intended for production applications" ([clusters](https://solana.com/docs/references/clusters)) | CONFIRMED (doc) |
| … observed today | response headers `x-ratelimit-method-limit: 10`, `x-ratelimit-conn-limit: 40`, `x-ratelimit-pubsub-limit: 10`. Bursting `getTransaction` at about 6/s got **HTTP 429 within seconds**, and about 1 req/1.2 s was sustainable | CONFIRMED (observed 2026-09-19, may change) |
| Helius Free | 1M credits/month, **10 RPC req/s**, 2 req/s for DAS/Enhanced; standard calls = 1 credit; LaserStream WSS (standard methods) included ([plans](https://www.helius.dev/docs/billing/plans), [credits](https://www.helius.dev/docs/billing/credits)) | CONFIRMED |

Worked example of the budget: a busy coin with 50,000 transactions/day needs 50 signature pages. If 200 of those
transactions are burns, that's 200 `getTransaction` calls, so about 250 credits/day, or roughly 7,500/month. That's
under 1% of Helius Free. The public endpoint would work too, but is explicitly not for production.

---

## 4. Canonical validity rule: discussion

The goal is that any two honest parties with any correct archival RPC get the same yes/no and the same amount. That
means the rule must be a **pure function of the finalized transaction** (raw message + `meta.err` +
`meta.pre/postTokenBalances` + `meta.loadedAddresses`) plus **published constants**:
`MINT`, `TOKEN_PROGRAM`, `DECIMALS`, `MIN_AMOUNT_RAW`, `ZCASH_NETWORK`, `START_SLOT`, `RULE_VERSION`.

Edge cases where honest verifiers would disagree unless the rule pins them down:
1. **Top-level vs inner burns.** One verifier scans `innerInstructions`, another doesn't. → Pinned: top-level only,
   and any inner burn of the mint makes the tx invalid.
2. **Multisig labelling in `jsonParsed`.** A normal owner with an extra account appended parses as
   `multisigAuthority`. → Pinned: decode raw account indices, authority = index 2.
3. **Trailing instruction bytes.** → Pinned: read only the leading 9/10 bytes, as the program does.
4. **Memo program version.** Someone who only knows `MemoSq4…` misses v4 memos. → Pinned: all three IDs.
5. **Memo text normalisation.** Trailing newline, spaces, a `zcash:` URI prefix, zero-width characters, or
   Cyrillic look-alikes. → Pinned: **exact byte match** to a regex, no trimming. The UI writes the memo, so users
   never type raw memos.
6. **Commitment.** Confirmed vs finalized. → Pinned: finalized, and "not found at finalized" means *pending*, not
   invalid.
7. **Owner missing from token balances** on some RPC or old node. → Treat as *indeterminate/pending*, retry
   elsewhere, never "invalid".
8. **Transaction version.** A `maxSupportedTransactionVersion: 0` verifier gets an error on v1 transactions. →
   Pinned: must support v1.
9. **Time boundary.** Burns before the bridge announcement. → Pinned: `slot >= START_SLOT`. Use slot, not
   `blockTime`, which can be null or imprecise.
10. **Minimum amount units.** UI amount vs raw. → Pinned: raw u64 compared as BigInt.
11. **Rule changes.** → Version the rule. Each version applies to a slot range, and old burns keep the rule that
    applied when they happened.
12. **Duplicate mints.** Two minters racing on the same signature. → The NFT content includes the Solana signature,
    and the indexer counts only the **first** Zcash inscription per signature (by Zcash block height, then tx
    index).

---

## 5. Devnet testing without pump.fun's website

**The pump program runs on devnet.** `6EF8rr…` is executable on devnet, its `Global` PDA `4wTV1Y…` exists, and in a
40-transaction sample today I counted **4 `CreateV2`**, plus `Buy`/`BuyV2`/`Sell`/`SellV2` and creator-fee
instructions. CONFIRMED (live devnet reads + [README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md)).
Whether the **pump.fun website** offers devnet is UNVERIFIABLE (the site returned 403). Assume not, and drive the
program from a script.

**Option A: real pump coin on devnet (highest fidelity).** Use `@pump-fun/pump-sdk` 2.0.0 (published 2026-09-13):
`PUMP_SDK.createV2Instruction({ mint, name, symbol, uri, creator, user, mayhemMode: false })`, then a small `buyV2`
so the test wallet holds tokens ([COIN_CREATION.md](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md)).
Caveat: the SDK depends on `@solana/web3.js ^1.98`, `@coral-xyz/anchor` and `@solana/spl-token` (checked on npm).
Keep it in a standalone `scripts/devnet-pump-launch.ts` so web3.js v1 doesn't leak into the verifier.

**Option B: hand-rolled clone (no pump dependency).** Pure `@solana/kit` +
`@solana-program/token-2022` 0.18.0, mirroring the live create_v2 recipe step by step:
1. `getCreateMintInstructionPlan(client, { payer, newMint, decimals: 6, mintAuthority, freezeAuthority: null,
   extensions: [ {__kind:'MetadataPointer', authority: null, metadataAddress: newMint.address},
   {__kind:'TokenMetadata', updateAuthority, mint, name, symbol, uri, additionalMetadata: new Map()} ] })`
   ([createMint.ts](https://github.com/solana-program/token-2022/blob/main/clients/js/src/createMint.ts)).
2. `getMintToATAInstructionPlan(...)` for `1_000_000_000_000_000n` (1B × 10^6) to a holder ATA.
3. `getSetAuthorityInstruction({ owned: mint, owner: mintAuthority, authorityType: AuthorityType.MintTokens, newAuthority: null })`.
4. `getUpdateTokenMetadataUpdateAuthorityInstruction(... newUpdateAuthority: null)`.
5. Read the mint back and assert owner `TokenzQd…`, decimals 6, supply 1e15, `mintAuthority`/`freezeAuthority`
   null, and extensions exactly `[metadataPointer, tokenMetadata]`. The test suite should run the **same assertion
   against the real mainnet mint** after launch.

The operator runs these scripts. Per the brief, I haven't generated keys or sent anything.

**Offline tests:** `litesvm` 1.4.1 and `@solana/kit-plugin-litesvm` 0.19.0 (both on npm, Aug 2026) run the real
Token-2022 and Memo programs in-process in Node. No Rust toolchain or `solana-test-validator` is needed. They're good
for unit-testing the rule against hand-crafted edge-case transactions (incinerator burn, delegate burn, two burns,
CPI burn).

**SDK choice (Sept 2026).** CONFIRMED from npm/GitHub on 2026-09-19:
- `@solana/kit` **8.3.0** (2026-09-09) is the successor SDK, and the program clients (`@solana-program/token-2022`
  0.18.0, `/memo` 0.14.1, `/token` 0.16.1) all peer on `@solana/kit ^8` and declare Node `>=24`.
- `@solana/web3.js` **1.99.0** (2026-09-08) still gets releases, but its README says: "This is the maintenance
  branch for the 1.x line … the successor to this library [is] `@solana/kit`"
  ([npm](https://www.npmjs.com/package/@solana/web3.js), [repo](https://github.com/solana-foundation/solana-web3.js)).
- **Pick kit.** Only the devnet pump-launch script uses web3.js v1.

**Devnet SOL.** [faucet.solana.com](https://faucet.solana.com/) allows "Maximum of 2 requests every 8 hours". GitHub
sign-in raises the limit, but "some accounts may not pass verification", and the page says "AI agents should **not**
use this faucet". CONFIRMED. The RPC `requestAirdrop` exists (kit `airdropFactory` / `@solana/react` `useAirdrop`),
but is rate-limited by unstated amounts. The official
[faucet guide](https://solana.com/developers/guides/getstarted/solana-token-airdrop-and-faucets) (published
2023-07-29, **STALE**) lists alternatives: Helius, QuickNode, Triton, and the `devnet-pow` faucet (needs Rust).
Budget: a create costs ~0.02 SOL of rent. Burns and memos cost only fees, so 1–2 SOL covers weeks of testing.

---

## 6. Burn UI (React)

**Wallet connection.** Two maintained paths:
- **Kit-native:** `@solana/react` 8.3.0 + Wallet Standard (`@wallet-standard/react` 1.0.3). Use
  `useWalletAccountTransactionSendingSigner(account, 'solana:mainnet')` or `useSignAndSendTransaction`. Kit
  documents wallet signers as *modifying* signers ("your application can not control whether or not the wallet will
  modify the message") ([kit/packages/react](https://github.com/anza-xyz/kit/tree/main/packages/react)). CONFIRMED.
- `@solana/wallet-adapter-react` 0.15.40 (2026-09-10) still ships, but it peers on `@solana/web3.js ^1.99`, which
  would put v1 in the frontend. Prefer the kit path.

**Transaction to build** (one tx, both instructions):
```ts
const ata = await findAssociatedTokenPda({ owner, mint: MINT, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
const ixs = [
  getBurnCheckedInstruction({ account: ata, mint: MINT, authority: ownerSigner, amount, decimals: 6 }),
  getAddMemoInstruction({ memo: zcashTAddr, signers: [ownerSigner] }),   // Memo v4 by default
];
// then: pipe(createTransactionMessage({version: 0}), setFeePayer…, setLifetime…, appendInstructions(ixs))
// simulate → show the user "You will permanently destroy N TOKEN; NFT goes to t1…" → sign & send
```
(Function names checked in
[burnChecked.ts](https://github.com/solana-program/token-2022/blob/main/clients/js/src/generated/instructions/burnChecked.ts)
and [addMemo.ts](https://github.com/solana-program/memo/blob/main/clients/js/src/generated/instructions/addMemo.ts).)
Validate the Zcash address **in the UI with the exact same function the verifier uses** before enabling the button.
After sending, poll the verifier API for "pending → valid → minted".

**Wallet warnings.**
- Phantom documents a burn warning only for **prediction-market tokens**. Its generic warnings are
  new/unreviewed domain, unverified app identity, and "This dApp could be malicious" when simulation fails
  ([Phantom docs](https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings)). CONFIRMED. Whether
  Phantom, Solflare or Backpack show a *specific* "burn" banner for ordinary SPL burns (beyond the simulated
  "−N TOKEN" balance change) is UNVERIFIABLE. Test each on devnet, and **show our own explicit confirmation step**.
  Submit the domain to Phantom's review form early to avoid the new-domain warning.
- **Phantom may append Lighthouse assertion instructions** to the transaction before sending
  ([Phantom Lighthouse docs](https://docs.phantom.com/developer-powertools/lighthouse)). CONFIRMED. Wallets also add
  ComputeBudget instructions. **So the rule must allow extra, unrelated instructions.** It must not require
  "exactly 2 instructions".
- **Memo blocking:** I found no evidence that any major wallet blocks Memo instructions (UNVERIFIABLE either way).
  v4 is new (address from May 2026). If a wallet flags `Memo4c2p…` as unknown during devnet testing, switch the UI
  to `MemoSq4…` (v3). The verifier accepts both.

---

## 7. Zcash address validation in JS

**Transparent formats.** CONFIRMED from librustzcash constants
([mainnet.rs](https://github.com/zcash/librustzcash/blob/main/components/zcash_protocol/src/constants/mainnet.rs),
[testnet.rs](https://github.com/zcash/librustzcash/blob/main/components/zcash_protocol/src/constants/testnet.rs)),
and I computed the rendered prefixes and lengths myself:

| Network | Type | 2-byte prefix | Renders as | Length |
|---|---|---|---|---|
| mainnet | P2PKH | `1C B8` | `t1…` | 35 |
| mainnet | P2SH | `1C BD` | `t3…` | 35 |
| testnet | P2PKH | `1D 25` | `tm…` | 35 |
| testnet | P2SH | `1C BA` | `t2…` | 35 |

Validation is Base58Check (double-SHA256, 4-byte checksum) → exactly 22 bytes → prefix check. In Node, use
`@scure/base` 2.4.0 `createBase58check(sha256)` with `@noble/hashes` 2.4.0 (both audited, maintained, Aug 2026),
or `bs58check` 4.0.0. ~15 lines, no Zcash-specific library needed; npm has no maintained official Zcash address
package (`@zcash/address` and `zcash-address` return 404).

```ts
const B58 = /^t[1-9A-HJ-NP-Za-km-z]{34}$/;            // cheap pre-filter, exact bytes, no trim
function parseTAddr(s: string, net: 'main'|'test'): {kind:'p2pkh'|'p2sh', hash: Uint8Array} | null {
  if (!B58.test(s)) return null;
  let raw; try { raw = base58check(sha256).decode(s); } catch { return null; }
  if (raw.length !== 22) return null;
  const p = (raw[0] << 8) | raw[1];
  const map = net === 'main' ? {0x1cb8:'p2pkh', 0x1cbd:'p2sh'} : {0x1d25:'p2pkh', 0x1cba:'p2sh'};
  const kind = map[p]; return kind ? { kind, hash: raw.slice(2) } : null;
}
```

**Unified addresses: reject.** ZIP 316
([spec](https://zips.z.cash/zip-0316)) (CONFIRMED):
- Rev 0 `u1…` "MUST contain at least one shielded Item".
- "The Sender of a payment to a Unified Address MUST use the Receiver of the most preferred Receiver Type that it
  supports". A minter that also speaks shielded would be obliged *not* to use the transparent receiver.
- Rev 2 (`zu`/`tu`, Draft) adds MUST-understand metadata and expiry typecodes.

Decoding needs F4Jumble + Bech32m. That's extra code and a source of verifier disagreement, for no benefit, since
inscriptions must land on a transparent output.

**TEX addresses: reject.** ZIP 320 ([spec](https://zips.z.cash/zip-0320), Active) (CONFIRMED):
- `tex1…` / `textest1…` is a Bech32m re-encoding of a P2PKH hash. Senders "MUST ensure that only transparent … UTXOs
  are spent". Our inscription transactions *would* comply.
- But TEX exists because **Binance** wanted identifiable deposit sources. A TEX address is almost always an
  **exchange deposit address**, and sending an inscription NFT there is almost certainly lost.
- Accepting it would also create two spellings of the same recipient (`tex1…` vs `t1…`), which is a
  canonicalisation trap for verifiers.

The UI should say "that's an exchange deposit address; use your own wallet's t-address."

**P2SH (`t3`/`t2`):** mechanisms.md says ZRC-20 holders can be `t1`/`t3`, so it's technically possible. But a P2SH
holder needs a multisig or script wallet that understands inscriptions, and most exchange hot wallets are single-key
t1s. **Default: accept P2PKH only.** It's an operator decision; if flipped, it goes in `RULE_VERSION` 2.

---

## Proposed validity rule (RULE_VERSION 1)

Published constants: `MINT`, `TOKEN_PROGRAM = TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (pin after launch),
`DECIMALS = 6`, `MIN_AMOUNT_RAW` (for example 100 tokens = `100_000_000`), `ZCASH_NET = main`, `START_SLOT`,
`MEMO_PROGRAMS = {Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo, MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr, Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH}`.

A Solana transaction `T` (identified by its first signature `sig`) is a **valid burn** iff all of these hold:

1. **Finalized.** `getTransaction(sig, {commitment:'finalized', maxSupportedTransactionVersion: 1})` returns it.
   If it isn't found, the result is *pending*, never invalid.
2. **Window.** `T.slot >= START_SLOT`.
3. **Succeeded.** `meta.err === null`.
4. **Keys.** `K = staticAccountKeys ++ loadedAddresses.writable ++ loadedAddresses.readonly`. All indices below
   resolve through `K`.
5. **Exactly one burn.** Among the **top-level** instructions, exactly one `B` has `K[B.programIdIndex] ==
   TOKEN_PROGRAM`, first data byte ∈ {8 (`Burn`), 15 (`BurnChecked`)}, and `K[B.accounts[1]] == MINT`.
6. **No hidden burns.** No instruction in `meta.innerInstructions` is a token-program `Burn`/`BurnChecked` of `MINT`.
7. **Amount.** `amount = u64_le(B.data[1..9])`. If the tag is 15, `B.data[9] == DECIMALS`. Trailing bytes are
   ignored. Require `amount >= MIN_AMOUNT_RAW`.
8. **Owner and authority.** Let `src = K[B.accounts[0]]` and `auth = K[B.accounts[2]]`. The `preTokenBalances`
   entry with `K[accountIndex] == src` must exist, with `mint == MINT` and a recorded `owner`. If `owner` is
   missing, the result is *indeterminate*. Require:
   - `owner == auth`,
   - `auth` is a transaction signer (index < `header.numRequiredSignatures`),
   - `owner ∉ {11111111111111111111111111111111, 1nc1nerator11111111111111111111111111111111}`.
9. **Balance cross-check.** `pre(src).amount − post(src).amount == amount`, where a missing post entry counts
   as 0.
10. **Exactly one memo.** Exactly one **top-level** instruction `M` has `K[M.programIdIndex] ∈ MEMO_PROGRAMS`.
    Its data must be valid UTF-8, and the **entire byte string** must equal a Zcash address that passes
    `parseTAddr(memo, ZCASH_NET)` with kind `p2pkh`. No whitespace, prefix, or other text.
11. **Other instructions.** Anything else (ComputeBudget, Lighthouse assertions, ATA create, `closeAccount`, …) is
    allowed and ignored.
12. **Output.** A valid burn yields exactly one NFT claim: `{sig, slot, owner, amount, zcashAddr}`. A `sig` can
    be minted **once**. On Zcash, the canonical NFT for `sig` is the first inscription carrying `sig`, ordered by
    (block height, tx index). Later duplicates are void.
13. **Versioning.** Changes to 1–12 ship as a new `RULE_VERSION` with a new `START_SLOT`. Earlier burns are always
    judged by the version in force at their slot.

Invalid burns are **not refundable by rule**. The tokens are gone. The UI's job is to make an invalid burn
impossible to build by accident.

---

## Recommended stack

**SDK**
- Verifier and minter feed: Node 26 + TypeScript.
  - `@solana/kit` 8.x for RPC, types, base58 and codecs.
  - `@solana-program/token-2022` for instruction decoding and helpers.
  - `@solana-program/memo` for `getMemosFromInstructions` and the addresses.
  - `@scure/base` + `@noble/hashes` for Zcash Base58Check.
  - Write the rule itself as a **pure function over the raw `json`-encoded transaction** (not `jsonParsed`), and
    publish it as a small package or script so third parties can run it.
- Frontend: React + `@solana/react` 8.x + Wallet Standard, the same kit program clients, and the *same* address
  validator module as the verifier.
- Tests: `litesvm` / `@solana/kit-plugin-litesvm` for edge-case transactions, then devnet end-to-end.
- web3.js v1 only inside `scripts/devnet-pump-launch.ts` (because of `@pump-fun/pump-sdk`).

**RPC approach**
- Source of truth: poll `getSignaturesForAddress(MINT, {commitment:'finalized', until: cursor})` every 10–20 s.
  Pre-filter on `err == null && memo != null`, then `getTransaction(..., maxSupportedTransactionVersion: 1)`.
  Idempotent `INSERT OR IGNORE` keyed by signature, and the cursor is committed in the same DB transaction.
- Provider: Helius Free (10 rps, 1M credits/month is about 100× our need) as primary. Public mainnet-beta as a
  second opinion for cross-checking verdicts. Optional `logsSubscribe(mentions: MINT)` as a wake-up trigger only.
- Upgrade to a paid or archival plan only if the backfill history or volume demands it.

**Test mint recipe (devnet)**
1. Preferred: the real pump program on devnet via `@pump-fun/pump-sdk` `createV2Instruction` (`mayhemMode: false`),
   then `buyV2` a few tokens.
2. Fallback: kit + token-2022, mirroring the live mainnet create:
   - Token-2022 mint with decimals 6 and **no freeze authority**,
   - extensions `MetadataPointer(self, authority null)` + `TokenMetadata`,
   - `mintTo` 1,000,000,000 × 10^6,
   - `setAuthority(MintTokens → null)`,
   - metadata update authority → null.
3. Assert the mint shape with the same check the verifier runs against the real mainnet mint at startup.
4. Fund with the devnet faucet (2 requests/8 h) or a provider faucet. The operator holds the keys and runs the
   scripts.

## Flags and stale sources
- **STALE:** [spl.solana.com/memo](https://www.solana-program.com/docs/memo) (v2 naming, old log format).
  [Solana faucet guide](https://solana.com/developers/guides/getstarted/solana-token-airdrop-and-faucets)
  (2023-07-29). Many blog posts still say pump.fun uses Metaplex/legacy SPL; that has been wrong since 2025-11-11.
- **UNVERIFIABLE:** Mayhem agent burn behaviour (pump.fun docs 403). Wallet-specific burn banners. Helius webhook
  commitment and plan counts. `getTransactionsForAddress` plan availability. Transaction v1 and Alpenglow
  activation dates (secondary only).
- **Watch:** pump can toggle `create_v2` and deprecate `create` at any time. Re-check the mint's owner program
  **after** launch, not before.
