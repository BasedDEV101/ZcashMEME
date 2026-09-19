# How our Node minter inscribes NFTs on Zcash (testnet first, mainnet later)

Research date: **2026-09-19**. Every link was fetched on that date. Verdicts: **CONFIRMED** (I read the
primary source — code, ZIP, or live API response) or **UNVERIFIABLE** (no primary source found, or it is a
closed-source claim).

Scope: the Zcash side of the burn-to-mint bridge. A holder burns a pump.fun token on Solana with a memo
carrying their Zcash address; our Node service inscribes an NFT on Zcash to that address recording the
Solana burn signature and the burned amount.

---

## TL;DR

- **The de-facto inscription format is the Doginals-style "ord" envelope in a P2SH reveal `scriptSig`**
  (commit tx pays a P2SH; reveal tx spends it and pushes `"ord"`, piece count, content-type, then 240-byte
  content pieces). ~113,000 mainnet inscriptions use it and every live indexer reads it. I decoded a real
  mainnet reveal byte-for-byte below. **CONFIRMED.**
- **There is a written spec**: *Universe Zerdinals v1* (2026-08-25), a strict profile of that same envelope
  that adds a `SHA-256("UZRD1" || contentType || 0x00 || content)` commitment inside the redeem script.
  v1 inscriptions are still readable by the legacy decoders. **CONFIRMED** (spec text public; the indexer
  implementing it is closed-source).
- **A competing format exists and is irrelevant for us**: `zcash.ink` / `zordinals.fun` use JSON inside
  `OP_RETURN` (`{"p":"zrc-721","o":"mint",...}`). Their indexer reports **4 inscriptions and 1 collection
  total**. Do not target it. **CONFIRMED** (live API + a decoded mainnet OP_RETURN).
- **For "a collection", two mechanisms are real**: legacy **ZRC-721** `deploy`/`mint` JSON payloads (what
  ZGODS uses, 8,505 ops indexed, readable by both `zord` and the Universe indexer) and **parent-by-spend**
  (a child's reveal spends the parent inscription's output — Universe's only "Verified" level).
  zerdinals.com's own collections are an **off-chain launchpad database** and are currently **empty**.
- **No JS library is both current and suitable off the shelf.** `@bitgo/utxo-lib` stops at NU6.2 and
  defaults testnet to v4/NU6.1; `@xchainjs/zcash-js` is P2PKH-only; `bitcore-lib-zcash` is pre-NU5 and dead.
  **`@exodus/bitcoinjs-lib-zcash@0.0.22`** (published 2026-08-04) is the only published lib I found that
  knows **NU6.3 Ironwood (`0x37a5165b`)**, implements the **ZIP 244 v5/v6 sighash correctly** (it commits to
  the *spent* `scriptPubKey`, as ZIP 244 requires for P2SH), lets you **override the branch id explicitly**,
  and lets you set a raw `scriptSig`. Pair it with `@noble/secp256k1` for signing. **CONFIRMED by code read.**
- **NU7 (testnet 2026-10-06, mainnet ~2026-11-05) does not break us**: it disables **v4** transactions, not
  v5, and adds no new transaction format — but it **does change the consensus branch id** (intended
  `0x77190AD8`, still a TODO in Zebra and a placeholder in librustzcash). The minter must read the branch id
  from the node at build time, never hardcode it. **CONFIRMED** (Zebra source + forum post by ebfull).
- **Testnet works end to end today**: `https://testnet.zec.rocks:443` (lightwalletd, Zebra 6.3.0, height
  4,368,528, `taddrSupport=true`) answered a real `GetAddressUtxos` call; the **jinolabs faucet** pays
  **0.1 TAZ per address / 24h** and its source shows it explicitly pays transparent `tm…` addresses.
  **CONFIRMED** (live gRPC call + faucet source + `/api/status`).
- **Cost is trivial**: a ~300-byte JSON inscription is a 2-action commit + a 4-action reveal = **30,000
  zatoshi ≈ $0.44** at $1,471/ZEC, plus 546 zat of postage. A merged ZIP 317 change in Zebra 6.3.0 cuts
  `marginal_fee` 5,000 → 1,000, which drops this to **6,000 zat ≈ $0.09** once wallets adopt it (mainnet
  height 3,590,000, ~mid-Dec 2026). **CONFIRMED** (ZIP 317 text, Zebra PR #11290, zips PR #1352).
- **There is no public Zerdinals-style indexer on testnet.** Verification plan: run the parser rules in Node
  against our own testnet reveals, replay the published mainnet fixtures through it, then do **one real
  mainnet inscription (~$0.45)** and confirm it appears in `indexer.zerdinals.com` and `zrunes.io`.

---

## 1. Inscription format

### 1.1 The live format, decoded from a real mainnet transaction

I pulled the newest inscription the Universe indexer reported
(`4f7763afbd1d3f5092ec5519bf390b41d50282a2421901d8ed9b3b7c94fab2c3i0`, height 3,489,223, 2026-09-19) and
fetched its raw bytes from Blockchair
(`https://api.blockchair.com/zcash/raw/transaction/4f7763afbd1d3f5092ec5519bf390b41d50282a2421901d8ed9b3b7c94fab2c3`).
**CONFIRMED, this is what is actually on chain today:**

Transaction header: `05000080` (v5, overwintered) · versionGroupId `0a27a726` (LE for `0x26A7270A`) ·
consensusBranchId `5b16a537` (LE for **`0x37A5165B` = NU6.3 Ironwood**) · lockTime 0 · expiryHeight 3,489,262
(tip + ~39).

Reveal input 0 `scriptSig` (198 bytes), field by field:

```
03 6f 72 64                         PUSH3 "ord"                 magic
51                                  OP_1                        totalPieces = 1
10 "application/json"               PUSH16 content type         16 bytes, must contain "/"
00                                  OP_0                        piece index 0 (indexes descend to 0)
3b <59 bytes of JSON>               PUSH59 piece                {"p":"zrc-20","op":"transfer",...}
48 <72-byte DER sig || 0x01>        PUSH72 signature            SIGHASH_ALL
29 <41-byte redeem script>          PUSH41 redeemScript
     21 <33-byte compressed pubkey>   push pubkey
     ad                               OP_CHECKSIGVERIFY
     75 75 75 75 75                   OP_DROP x5   (= 3 + 2*pieces)
     51                               OP_1
```

The commit transaction (`88a8da6b…0023`) is an ordinary v5 tx paying **24,000 zat** to a P2SH `t3…` address
(`a914…87`) plus change; the reveal spends it and pays **4,000 zat** to a `t1…` P2PKH output, which is the
output that now *owns* the inscription. The difference, 20,000 zat, is the reveal fee (they overpaid; see §6).

Chunking: content is split into **240-byte pieces**, each preceded by its index, **descending** (index
`totalPieces-1` first, index 0 last). The reassembled content is the concatenation in push order.

### 1.2 The written spec: Universe Zerdinals v1

Source: `https://github.com/bitcoinuniverseio/docs-zerdinals-and-zrunes` → `src/content/docs/protocols/zerdinals-v1.md`
(branch `develop`, repo pushed 2026-09-19). It is the published copy of a normative spec in a **private**
product repo, so the spec text is **CONFIRMED** but the implementation is not auditable.

Key normative points (quoting/condensing the spec):

- "A Zerdinal is a digital artifact inscribed on Zcash through a pair of transparent transactions: a commit
  transaction and one or more reveal transactions. The content bytes live in the reveal transaction scriptSig."
- v1 is "a strict, integrity-hardened profile of the inscription envelope already live on Zcash mainnet since
  late 2025 (the ord scriptSig envelope used by the community Zerdinals ecosystem, Zordinals tooling, and
  Zecscriptions). Every v1 inscription is readable by existing ecosystem decoders."
- **v1 redeem script** (this is the only structural difference from the legacy envelope):

```
0x21 <33-byte compressed pubkey>
OP_CHECKSIGVERIFY
0x20 <32-byte commitment C>
OP_DROP
OP_DROP  x N,  N = 3 + 2 * piecesInThisTransaction
OP_1

C = SHA-256( "UZRD1" || contentType || 0x00 || content )
```

  Rationale, quoted: "scriptSig data is excluded from the ZIP 244 transaction id and is not covered by any
  signature, so relayed content could in principle be altered before confirmation without changing the txid.
  In v1, altered content no longer matches C."
- **Limits**: totalPieces 1–255; max content **61,200 bytes**; **1–4 pieces per reveal tx**; content type
  3–96 printable ASCII bytes containing `/`; empty content invalid; parser bounds: max `scriptSig` 1,650
  bytes, max chain length 64 txs.
- **Multi-tx chaining**: genesis reveal spends the commit output and carries pieces `n-1 … n-4`; each
  continuation spends output 0 of the previous reveal; the completion tx carries piece 0 and its **output 0
  is the destination** (postage ≥ **546 zat**, default 546).
- **Carriers**: "V5 and V6 are both valid carriers… The consensus branch ID, version group ID, and expiry
  height are always derived from live chain state, never hardcoded."
- **Sighash**: "ZIP 244. For a P2SH input, the script code is the previous output script." (This matches
  ZIP 244 §S.2g: `txin_sig_digest` commits to `scriptPubKey`, not the redeem script —
  `https://github.com/zcash/zips/blob/main/zips/zip-0244.rst`, and the change note "always commit to the
  `scriptPubKey` field of the transparent coin being spent, instead of the script code". **CONFIRMED.**)
- **Ownership**: at completion the inscription is owned by output 0; when that output is spent it moves to
  the first transparent, non-`OP_RETURN` output of the spending tx; if the spending tx has a shielded bundle
  the state is `SHIELDED_UNTRACKABLE` (permanent), otherwise `BURNED`. **Both are terminal.** Relevant to us:
  **if the recipient shields the NFT, it is gone from every indexer.**
- Inscription id = `<genesis txid in display order>i0`.

### 1.3 The parser/indexer code that decides what counts

**`cloutprotocol/zord`** (Rust, `master`, last commit **2026-09-18**, "Classify JSON inscriptions as json
instead of binary"). This is the only **open-source** indexer for this envelope that I found.
`https://github.com/cloutprotocol/zord/blob/master/src/indexer.rs` — `parse_inscription()` is a **heuristic**
over `vin.scriptSig.asm` (**CONFIRMED by code read**):

1. walk the ASM pushes; the first push that decodes as UTF-8, contains `/`, and is 4–99 chars long is taken
   as the **content type** (so the `"ord"` magic and the piece-count opcodes are simply skipped — tokens of
   ≤ 2 hex chars are ignored as opcodes);
2. concatenate every subsequent push until it hits something that looks like a DER signature (70–74 bytes
   starting `0x30`) or a pubkey/redeem-script (33 bytes starting `0x02/0x03`, 65 starting `0x04`, or a blob
   starting `0x21` with length ≥ 34) **near the end** (last 3 pushes);
3. inscription id = `<txid>i0`; owner = first output paying the sender, else first address-bearing output.

Consequences for us, all **CONFIRMED** from that code: the v1 redeem script also starts with `0x21`, so zord
stops at it correctly; JSON starting with `{` is never mistaken for a signature; and
`docs/indexing.md` says the protocol engines accept `application/json`, `application/*+json`, and any
`text/*` whose body starts with `{`/`[`.

Other readers:

| Reader | Open source? | Status on 2026-09-19 | Evidence |
|---|---|---|---|
| `zord` (cloutprotocol / zatoshi) | **Yes**, Rust | commits 2026-09-18 | GitHub API |
| `indexer.zerdinals.com` (community Zerdinals explorer/market) | No | **live**, 111,367 inscriptions, returned the same inscription id I queried | live API call |
| Universe `zrunes.io/idx/zcash-metaprotocols` | No | **live**, 113,428 inscriptions, 120,547 raw envelopes, 81,523 ZRC-20 ops, **8,505 ZRC-721 ops**, mainnet tip | live `/status` |
| Zecscriptions | No (the **minter** is open: `YoneCode/zecscriptions-minter`) | mint bot last commit 2026-05-15 | GitHub |
| `zcash.ink` / `zordinals.fun` (`OP_RETURN` "zord" format) | No | live but **4 inscriptions, 1 collection, 1 token** total | `https://zcash.ink/api/stats` |

### 1.4 The competing OP_RETURN format (do not target it)

`https://zcash.ink/docs` documents "terse JSON inside an `OP_RETURN`, chunked to fit Zcash's relay limits…
at most 83 bytes per data-carrier script", with wire fields `p/o/t/d/h/c/ptr/pr/py`. I decoded one of its
mainnet txs (`751810bc…9ffe`, height 3,489,199): output 0 is
`6a 3d {"p":"zrc-721","o":"mint","ptr":0,"co":"ZCashier","id":"129"}`, output 1 is a 1,000-zat P2PKH carrier.
**CONFIRMED**, and note the field names differ from the ZRC-721 spec (`o` not `op`, `co` not `collection`).
`docs.zordinals.fun` is the same "zOrdinals Protocol" family; its docs describe fields (`content_type`,
`parent`, `metadata`, `pointer`) but **never state the envelope bytes** — **UNVERIFIABLE**.

### 1.5 ZRC-721, the NFT convention on the standard envelope

Spec: `https://zatoshi.gitbook.io/zrc/721`; mirrored in `zord`'s README §6.2 and in the Universe docs
(`understand/collections.md`, `create/tokens-and-collections.md`). **CONFIRMED** from all three.

```json
{"p":"zrc-721","op":"deploy","collection":"ZGODS","supply":"10000",
 "meta":"bafybeic…","royalty":"100"}

{"p":"zrc-721","op":"mint","collection":"ZGODS","id":"0"}
```

- Content type: "UTF-8 JSON with recommended content type `text/plain;charset=utf-8` (or `application/json`)".
- The **mint inscription *is* the NFT** (supply 1 per id). There is no transfer op — the item moves when the
  inscription's carrying output moves.
- First valid `deploy` per collection key wins; later deploys of the same key are rejected. Collection name
  1–64 UTF-8 bytes, lower-cased into the key. Supply 1–10,000,000. `id` is an integer `0 ≤ id < supply`,
  each id mintable once, and the reveal must have a transparent output.
- `zord`'s `src/zrc721.rs` parses with Serde **without** `deny_unknown_fields`, and credits `op.to` if
  present: `let owner = op.to.as_deref().unwrap_or(sender);` → **extra JSON fields are ignored, not
  rejected, by zord** (**CONFIRMED by code**). Whether the Universe reader tolerates extra fields is
  **UNVERIFIABLE** (closed source; its published rule list says nothing about unknown fields).
- Reality check on how strict this is: Universe publishes that ZGODS, the only ZRC-721 collection on mainnet,
  has **7,171 counted mints, 1,319 rejected for a taken id, 13 rejected for minting before the deploy**.
  **Anyone can mint into anyone's collection** — there is no deployer check in `zord`'s code and none in the
  published rules. For a bridge that assigns ids sequentially this is a live front-running risk (§9 risks).

### 1.6 Which format to use

**Use the ord `scriptSig` envelope, content type `application/json`, carrying a ZRC-721 `mint` payload, and
build it to the Universe Zerdinals v1 redeem-script shape.** Rationale:

- It is the only format with real indexer coverage (three independent live indexers, ~113k inscriptions).
- v1 is a strict subset of the legacy envelope, so legacy decoders (`zord`, `indexer.zerdinals.com`) still
  read it, while the Universe indexer can additionally mark it v1 and allow parent-by-spend collections.
- A ZRC-721 `mint` payload is what makes it show up as an **NFT in a collection** rather than as a loose
  inscription.

---

## 2. Collections

Four distinct mechanisms exist. **CONFIRMED** from the sources named.

**(a) ZRC-721 deploy/mint ("Verified, legacy" on Universe).** Membership is by reference: the mint payload
names the collection key. Both `zord` and the Universe indexer group these. This is the cheapest path and the
one with an existing precedent (ZGODS). What we need: one `deploy` inscription (name, supply, `meta` pointer)
plus one `mint` per bridged NFT with a unique `id < supply`.
Sources: `https://zatoshi.gitbook.io/zrc/721`, `zord/src/zrc721.rs`,
`docs-zerdinals-and-zrunes/src/content/docs/understand/collections.md`.

**(b) Parent-by-spend ("Verified", on-chain, Universe Zerdinals v1 only).** From
`protocols/collections-v1.md`: the collection identity is itself a Zerdinal (the parent); "A child joins the
collection when the genesis reveal transaction of the child spends the parent's carrying output as one of its
inputs (any input after input 0, which is always the commit input)"; in that tx "the parent transfers to
output 1, which must be a transparent non-data output"; if output 1 is missing or is a data output, "the
parent claim is void". Only the parent's owner can do this, so membership proves creator control. The indexer
records parent id, child id, membership block and the proving transaction. This is the **only** mechanism
where membership cannot be squatted, and it is what we should use if we want a collection nobody can dilute.

**(c) Signed curated manifest ("Curated").** For legacy inscriptions with no on-chain parent: a
`collection-manifest-v1` JSON (slug, name, `creatorAddress`, items with `inscriptionId` + `contentHash`),
signed secp256k1 over SHA-256 of the RFC 8785 canonical form, verifying against the P2PKH creator address,
and requiring that the creator address is "the genesis destination of at least 80 percent of the listed
inscriptions". Append-only. Where it is submitted is not documented publicly — **UNVERIFIABLE**.

**(d) Off-chain launchpad database (zerdinals.com).** Their bundle
(`https://zerdinals.com/static/js/main.9914d5b5.js`) calls `market-api.zerdinals.com/api/market/launchpad/get-projects`,
`collection/{id}`, and `POST launchpad/register-mint` with `{collection_id, inscription_id, image_id, address,
signature}` — i.e. curation in their database, gated by a whitelist endpoint. Today
`launchpad/get-projects` returns **`{"results":[],"total":0}`** and `collection/zgods` returns "Collection not
found", so **their collection surface is currently empty**. Getting listed there is a business ask, not an
engineering one. **CONFIRMED by live calls.**

**What we need so our NFTs appear as one collection:** do (a) *and* (b) together.

1. Inscribe a **parent** Zerdinal for the collection (v1 envelope), keep its carrying output in a dedicated
   UTXO the minter never spends for fees.
2. Inscribe a **ZRC-721 `deploy`** naming the collection and a supply that covers the bridge's ceiling
   (max 10,000,000) — do this early, because the first deploy of a key wins.
3. For every bridged NFT: one commit + one reveal, where the reveal carries a ZRC-721 `mint` payload **and**
   spends the parent's carrying output as input 1, sending the parent back to **output 1** and the NFT to the
   recipient at **output 0**. That single transaction gives us: the legacy ZRC-721 grouping, the Universe
   "Verified" on-chain membership, and the recipient's ownership.
4. Serialise minting (one parent spend at a time) — the parent output is a global lock. Chain the parent
   through successive reveals; do not try to mint two NFTs concurrently.

---

## 3. Building and signing transactions in JS/TS

What we need: **v5 (ZIP 225) serialisation, ZIP 244 sighash with an arbitrary consensus branch id, a P2SH
output, and the ability to set a completely custom `scriptSig` on the reveal input.**

Non-negotiable facts, all **CONFIRMED** from primary sources:

- NU6.3 "Ironwood" branch id is **`0x37A5165B`**, testnet activation **4,134,000**, mainnet **3,428,143**
  (`https://github.com/zcash/zips/blob/main/zips/zip-0258.md`; identical values in
  `librustzcash/components/zcash_protocol/src/consensus.rs` and
  `zebra/zebra-chain/src/parameters/network_upgrade.rs`).
- **v5 transactions are still valid after NU6.3 and after NU7.** Zebra's
  `zebra-consensus/src/transaction.rs` lists `Nu5 | Nu6 | Nu6_1 | Nu6_2 | Nu6_3 | Nu7 => Ok(())` for v5 and
  puts `Nu7` in the **"Does not support V4 transactions"** arm. The forum post confirms scope: "25-second
  block spacing (ZIP-218), disabling v4 transactions, and NSM integration (ZIP-234 (alt), ZIP-235)… New
  transaction formats do not appear in this network upgrade!"
  (`https://forum.zcashcommunity.com/t/nu7-timeline/57655`, ebfull, 2026-09-17: testnet **2026-10-06**,
  mainnet **2026-11-05**). Note `https://z.cash/upgrade/nu7/` still says "The activation height for NU7 has
  not yet been set" — the heights are decided on 2026-10-20 per the forum thread.
- **The NU7 branch id is not final.** The draft deployment ZIP says `0x77190AD8`
  (`zips/draft-arya-deploy-nu7.md`, last touched 2025-11-11, activation heights "TBD"); Zebra carries
  `// TODO: set below to (Nu7, ConsensusBranchId(0x77190ad8)), once the same value is set in librustzcash`
  and uses a test-only placeholder; librustzcash has `BranchId::Nu7 => 0xffff_ffff`. **So hardcoding any NU7
  branch id today is a bug.**

### 3.1 Candidates

| Library | Latest | Last release | v5 / ZIP 244 | NU6.3 (`0x37a5165b`) | Branch id override | Custom `scriptSig` / P2SH | Testnet | Verdict |
|---|---|---|---|---|---|---|---|---|
| **`@exodus/bitcoinjs-lib-zcash`** | 0.0.22 | **2026-08-04** | **Yes** — `hashForZcashV5V6(inIndex, prevOuts, hashType)`, full ZIP 244 digest tree, commits to spent `scriptPubKey` | **Yes** (`src/consensus.js` table ends at `nu6.3 / 0x37a5165b / 3428143`), plus v6 group id | **Yes** — `tx.consensusBranchId` (explicit) wins over the height table; `setConsensusParams({upgrades})` can stack future forks | **Yes** — `tx.setInputScript(i, script)`, no `sign()` at all (keys live outside the lib) | Caller supplies the network object (lib ships only btc/testnet/ltc) | **PICK.** Repo is private; no public tests |
| `@bitgo/utxo-lib` | 11.24.4 | 2026-09-01 | Yes (v5 + ZIP 244) | **No** — stops at NU6.2 (`0x5437f330`); `getDefaultTransactionVersion()` still returns **v4/NU6.1 for zcashTest** with a stale comment | Yes, `consensusBranchId` settable | Awkward (PSBT/txb oriented, script templates) | Yes but wrong default | Usable only with manual overrides; stale |
| `@bitgo/wasm-utxo` | 5.3.0 | 2026-09-08 | Yes (Rust/wasm, v6 aware) | README says upgrades "through Nu6_1" | Yes (`createEmptyWithConsensusBranchId`) | **No** — BitGo fixed-script (multisig wallet) model only | Yes | Not suitable |
| `@trezor/utxo-lib` | 2.5.0 | 2025-12-16 | Serialisation + ZIP 244 **txid** only; no signing sighash | No table (caller supplies `consensusBranchId`) | n/a | n/a | Yes | Not suitable (signing is on-device) |
| `@xchainjs/zcash-js` | 1.1.6 | 2026-08-06 | Yes, hand-rolled v5 + ZIP 244 | **No** — default NU6.2 | Yes (`signAndFinalize(..., consensusBranchId)`) | **No** — only `pkh` and `op_return` outputs, P2PKH inputs | Yes (`tm` prefix `0x1d25`) | Not suitable without forking |
| `@mayaprotocol/zcash-js` | 1.0.7 | 2025-06-17 | Yes | **No** — NU6 only | partial | No | Yes | Stale (pre-NU6.1) |
| `bitcore-lib-zcash` (`wo01`) | 0.13.20 | **2019-04-19** | **No** (pre-NU5) | No | No | n/a | n/a | **Dead** |
| `zcash-bitcore-lib` (bitmex) | 0.13.20-rc3 | **2016-10-27** | No | No | No | n/a | n/a | **Dead** |
| WebZjs (`ChainSafe/WebZjs`) | — | last commit **2026-04-16** | Shielded wallet wasm (librustzcash) | n/a | n/a | **No** — cannot spend an arbitrary P2SH script | Yes | Not suitable |
| `YoneCode/zecscriptions-minter` (`zcash-tx.mjs`) | MIT, 1,717 lines | 2026-05-15 | **Yes**, from scratch: ZIP 225 + ZIP 244 with vendored `@noble` | **No** — default NU6.1, but `parseBranchId()` takes it from the node | **Yes** | **Yes** — it builds the exact `ord` envelope + P2SH redeem script | Mainnet prefixes only (`0x1CB8`/`0x1CBD`) | **Best reference implementation to fork** |

All version/date facts above are from `registry.npmjs.org` metadata and the GitHub API, read 2026-09-19.
**CONFIRMED.**

Two live examples of how *not* to do it, both **CONFIRMED** by reading deployed code: `zerdinals.com`'s
bundle builds `ZcashTransactionBuilder` with `setVersion(4)` and
`setConsensusBranchId(parseInt("0x4dec4df0",16))` — **NU6.1, two upgrades stale**, and the
`zecscriptions-minter` defaults to the same. A transaction signed under a superseded branch id is rejected
outright.

### 3.2 The pick

**`@exodus/bitcoinjs-lib-zcash` for the transaction, `@noble/secp256k1` for the signature, `@scure/base` (or
`bs58check`) for addresses.**

Why: it is the only published library that already knows Ironwood, its ZIP 244 implementation is structurally
correct for P2SH (it hashes the *spent output's* script, which is exactly ZIP 244 §S.2g and the Zerdinals v1
rule), it exposes `setInputScript` so we can write the envelope by hand, and it deliberately has **no key
handling**, which suits a service that will keep its key in a KMS later.

Shape of the minter's build path:

1. `tx = new Transaction(); tx.version = 5; tx.overwintered = true; tx.nVersionGroupId = 0x26A7270A;`
   `tx.consensusBranchId = <branch id read from the node>; tx.expiryHeight = tip + 40;`
2. `tx.addInput(reversedTxid, vout)` / `tx.addOutput(scriptPubKey, value)`.
3. `const sighash = tx.hashForZcashV5V6(i, prevOuts /* [{script, value}] for ALL inputs, in order */, 0x01)`.
4. Sign with `@noble/secp256k1` (low-S DER) and append the `0x01` hash-type byte.
5. `tx.setInputScript(i, envelopeScriptSig)` then `tx.toHex()`.

Caveats to handle in our code, **CONFIRMED by code read**:

- `src/networks.js` has no Zcash entry — we pass our own `{ pubKeyHash: 0x1d25, scriptHash: 0x1cba,
  wif: 0xef }` for testnet and `{ 0x1cb8, 0x1cbd, 0x80 }` for mainnet (values from
  `librustzcash/components/zcash_protocol/src/constants/{testnet,mainnet}.rs`).
- Its built-in height→branch table holds **mainnet** activation heights only, and injected upgrades must be
  *above* the last built-in height. On testnet, **always set `tx.consensusBranchId` explicitly** from the node.
- The repo (`ExodusMovement/bitcoinjs-lib-forks`) is **private** — no public tests, no commit history.
  Mitigation: pin the exact version, vendor a copy, and gate it behind our own test suite (§7).

### 3.3 Does it survive NU7 on 2026-10-06 (testnet)?

**Yes, if and only if the branch id is read from the chain at build time.** v5 stays valid under NU7 (Zebra
source, above); no new format appears (forum); the only thing that changes for a transparent minter is the
branch id and — separately — 25-second blocks, which shrink the wall-clock meaning of `expiryHeight`.
Operational rules:

- Read `getblockchaininfo.consensus.**nextblock**` (not `chaintip`) and use that as the branch id; around an
  activation those differ, and a transaction signed with the old id that gets mined after activation is
  invalid. The Universe status endpoint exposes both (`"consensus":{"chaintip":"37a5165b","nextblock":"37a5165b"}`),
  and so does any Zebra RPC.
- **Pause minting for a few blocks either side of the testnet activation on 2026-10-06 and the mainnet one
  (~2026-11-05)**, and keep `expiryHeight` short (tip + 40 blocks) so nothing straddles the boundary.
- After NU7, revisit `expiryHeight`: at 25-second blocks, 40 blocks is ~17 minutes instead of ~50.
- **UNVERIFIABLE until it happens**: no NU7 testnet exists yet to test against, and the final NU7 branch id
  is not published.

---

## 4. Reading and broadcasting without our own node

### 4.1 Testnet (what I actually called)

**lightwalletd — `https://testnet.zec.rocks:443` — works. CONFIRMED by live gRPC call.**
`GetLightdInfo` returned: `version v0.5.4`, `vendor "ECC LightWalletD"`, `taddrSupport=true`,
`chainName "test"`, `consensusBranchId "37a5165b"`, `blockHeight 4368528`, backend `/Zebra:6.3.0/`.
`GetAddressUtxos` for `tmUiVxo1bbZLP5z6KYfM4dh3PcX5wkd7on8` returned a UTXO with `grpc-status: 0`.

- Proto: `https://github.com/zcash/lightwalletd/blob/master/walletrpc/service.proto` (service
  `cash.z.wallet.sdk.rpc.CompactTxStreamer`).
- **Fetch UTXOs**: `GetAddressUtxos(GetAddressUtxosArg{ addresses:[t-addr], startHeight, maxEntries })` →
  `GetAddressUtxosReply{ address, txid, index, script, valueZat, height }`. `script` is the `scriptPubKey`
  we need for the ZIP 244 `prevOuts` array — this is the single most useful call for us.
- **Broadcast**: `SendTransaction(RawTransaction{ data: <raw tx bytes>, height })` → `SendResponse{
  errorCode, errorMessage }` (`errorCode == 0` means the node accepted it). **Not tested** — I did not
  broadcast anything. **UNVERIFIABLE by policy, documented by the proto.**
- **Tip / expiry height**: `GetLatestBlock(ChainSpec{})`.
- From Node: `@grpc/grpc-js` + `@grpc/proto-loader` against that `.proto`. (For the record, I made the calls
  above with plain `curl --http2` and hand-framed gRPC messages, so nothing exotic is required.)
- Note `testnet.zec.rocks` answers through Fly.io with `x-cache` headers — treat tip reads as possibly a
  few seconds stale; re-read before signing.

**Zebra JSON-RPC — `https://zcash-testnet.gateway.tatum.io` — works, heavily rate-limited. CONFIRMED.**
`getblockchaininfo` returned `{"chain":"test","blocks":4368529,…}`; `getrawtransaction(txid, 1)` returned a
full decoded tx. **`getaddressutxos` is "Method not found"** (the gateway allowlists methods), and anonymous
use is capped at **5 requests/minute** (`{"statusCode":429,…"limit of 5 requests per minute"}`,
`x-ttm-plan: anonymous`). Good as a branch-id/tip oracle and for `getrawtransaction`; not as a UTXO source.
Whether `sendrawtransaction` is allowlisted there is **UNVERIFIABLE** (not tested, since testing means
broadcasting).

**Explorers**: `https://blockexplorer.one/zcash/testnet` responds 200;
`https://testnet.zcashexplorer.app` returned 403 to a plain client. **Blockchair does NOT support Zcash
testnet** — its docs list only `bitcoin/testnet` and `ethereum/testnet` among testnets, and
`api.blockchair.com/zcash/testnet/stats` returns a 404 page
(`https://github.com/Blockchair/Blockchair.Support/blob/master/API_DOCUMENTATION_EN.md`). **CONFIRMED.**

**Recommended testnet setup**: lightwalletd (`testnet.zec.rocks:443`) for UTXOs, tip and broadcast, with
Tatum's Zebra RPC as a second opinion on the branch id and for `getrawtransaction` when debugging.

### 4.2 Mainnet (for later)

- **lightwalletd**: `https://zec.rocks:443`, `https://na.zec.rocks:443`, `https://eu.zec.rocks:443` — all
  live; `GetLightdInfo` returned `chainName "main"`, `consensusBranchId "37a5165b"`, height 3,489,245,
  backends `/Zebra:6.3.0/` and `/Zakura:1.3.1/`. **CONFIRMED by live calls.** Same two calls
  (`GetAddressUtxos`, `SendTransaction`) as testnet.
- **Blockchair** (mainnet only): `GET /zcash/dashboards/address/{t-addr}` returns `address.script_hex`,
  `balance` and a `utxo[]` array of `{block_id, transaction_hash, index, value}`; `GET /zcash/raw/transaction/{txid}`
  returns raw hex **plus a fully decoded tx** (how I decoded the inscription above);
  `POST /zcash/push/transaction` with a `data=<hex>` parameter broadcasts. Free tier: **1,440 requests/day
  without a key, hard cap 30/minute**, errors `402`/`429`. **CONFIRMED** (docs + live calls).
- **Tatum**: `https://zcash-mainnet.gateway.tatum.io` — same Zebra RPC surface and the same 5 req/min
  anonymous cap. **CONFIRMED.**
- **Asset-aware UTXOs (mainnet only, and the reason to use it)**: the Universe indexer exposes
  `GET https://zrunes.io/idx/zcash-metaprotocols/addresses/{address}/utxos` (returns `txid, vout,
  valueZatoshis, scriptPubKey`) and `…/addresses/{address}/inscriptions` (returns each inscription **with its
  outpoint**). I called both successfully. Use the second to build a **do-not-spend set** so the minter never
  burns an inscription-bearing output as a fee input. It is GET/HEAD only, unauthenticated, cursor-paginated,
  integers as strings, with `checkpoint`/`coverage` on every response, and a documented `429`.
  Docs: `docs-zerdinals-and-zrunes/src/content/docs/developers/api.md`. **CONFIRMED by live calls.**
  There is **no write endpoint** ("Write endpoints… are not part of the public surface").
- Community alternative (mainnet): `https://indexer.zerdinals.com/{inscriptions,inscription/{id},address/{addr},unspent/{addr},location/{id}}`
  — live, returned data for my queries. Their broadcast endpoint `https://utxos.zerdinals.com/api/send-transaction`
  exists in their bundle but `utxos.zerdinals.com/api/utxos/{addr}` returned **404** today. Treat as unreliable.

---

## 5. Testnet funds

**`https://zcashfaucet.jinolabs.xyz/` — live and funded. CONFIRMED.**
`GET /api/status` returned
`{"network":"testnet","dripTaz":0.1,"cooldownSeconds":86400,"sender":"zallet","challenge":"pow","balanceTaz":4502.96,"empty":false}`
on 2026-09-19.

- **0.1 TAZ per address per 24 hours**, browser proof-of-work instead of a captcha, default **5 drips per IP**
  inside the cooldown window (`FAUCET_IP_DAILY_MAX`).
- It runs its own Zebra + Zallet + miner (`https://github.com/jinolabs-xyz/zcash-faucet`, last push
  **2026-09-19**, i.e. actively maintained post-Ironwood).
- **It does pay transparent addresses**, which matters because we need `tm…` funds, not shielded notes:
  `src/lib/zcash/address.ts` validates `tm` (P2PKH `0x1d25`) and `t2` (P2SH `0x1cba`), and
  `src/lib/zcash/zalletsend.ts` picks `privacyPolicy = "AllowRevealedRecipients"` when
  `addressInfo.kind === "transparent"`, with the comment "we already pay transparent addresses, which reveals
  strictly more than this does". **CONFIRMED by source read**; I did not claim a drip, so the end-to-end
  payout is **UNVERIFIABLE** until we try it.
- 0.1 TAZ = 10,000,000 zat ≈ **300+ inscriptions** at current fees (§6), or ~1,600 after the fee cut.
- Second faucet: **`https://fauzec.com/`** — 1 TAZ per address / 24h, has a JSON API
  (`POST /api/v1/claim` + `GET /api/v1/status/testnet/{request_id}`), but its own page says "We send to
  Unified Addresses and Sapling addresses today; **transparent support is on the roadmap**". Usable only if
  we can unshield, so treat jinolabs as the primary. **CONFIRMED** (live page).

Plan: claim to a `tm…` address, then fan out internally with our own splitter so each mint has its own
funding UTXO (parallel mints otherwise collide on the same input — a defect the Universe team hit and
documented: "two orders prepared close together could spend the same funding").

---

## 6. Fees (ZIP 317) for a ~300-byte JSON inscription

Rule (`https://github.com/zcash/zips/blob/main/zips/zip-0317.rst`, Revision 1 enacted at NU6.3, file last
changed 2026-07-01): `conventional_fee = marginal_fee × max(grace_actions, logical_actions)` with
**`marginal_fee = 5,000` zat**, `grace_actions = 2`, and for a transparent-only transaction

```
logical_actions = max( ceil(tx_in_total_size / 150), ceil(tx_out_total_size / 34) )
```

**Reveal transaction** (300 bytes of JSON → 2 pieces of 240 + 60; content type `application/json`):

```
scriptSig  = 4  ("ord")
           + 1  (OP_2, totalPieces)
           + 17 (push "application/json")
           + 1  (OP_1, piece index 1) + 242 (PUSHDATA1 + 240 bytes)
           + 1  (OP_0, piece index 0) +  61 (push 60 bytes)
           + 73 (push 72-byte DER sig incl. hash type)
           + 44 (push 43-byte legacy redeem script)      → 444 bytes
             ( v1 redeem script is 77 bytes → push 79 → scriptSig 479 bytes )

tx_in      = 32 (prevout hash) + 4 (index) + 3 (varint 444) + 444 + 4 (sequence) = 487 bytes
             ( v1: 522 bytes )
tx_out     = one P2PKH output = 8 + 1 + 25 = 34 bytes

logical_actions = max( ceil(487/150), ceil(34/34) ) = max(4, 1) = 4          (v1: ceil(522/150) = 4 too)
fee             = 5,000 × max(2, 4) = 20,000 zatoshi
```

**Commit transaction** (1 P2PKH input ≈ 148 bytes; outputs = P2SH 32 bytes + change P2PKH 34 bytes):

```
logical_actions = max( ceil(148/150), ceil(66/34) ) = max(1, 2) = 2
fee             = 5,000 × max(2, 2) = 10,000 zatoshi
```

**Total per NFT: 30,000 zatoshi = 0.0003 ZEC ≈ $0.4413** at $1,471/ZEC.
Plus **546 zat** of postage (≈ $0.008) that rides on the NFT output and goes to the recipient, so the minter
spends **30,546 zat ≈ $0.449** per NFT. (Blockchair reported a live market price of **$1,476.51** on
2026-09-19; at that price, $0.4430 + $0.008.)

**With the collection parent-by-spend variant** (reveal gains a P2PKH input for the parent and an output to
return it): `tx_in` 487 + 148 = 635 → 5 actions; `tx_out` 68 → 2; reveal fee **25,000 zat**, total
**35,000 zat ≈ $0.515** per NFT.

**The fee is about to drop 5×.** `zcash/zips` PR #1352 (open, opened 2026-08-17, updated 2026-09-09) proposes
`marginal_fee` 5,000 → **1,000** and `weight_ratio_cap` 4 → 10, as a *wallet convention + relay policy*
change with **no network upgrade**. Zebra already merged it (PR #11290, merged **2026-09-18**, "MARGINAL_FEE
5000 to 1000… `getstandardfee` reports 1000"). The ZIP says "Wallets SHOULD adopt `marginal_fee = 1000` at
Mainnet block height **3590000**, expected in mid December 2026". At 1,000/action our numbers become:

| | now (5,000/action) | after the cut (1,000/action) |
|---|---|---|
| commit | 10,000 zat ($0.147) | 2,000 zat ($0.029) |
| reveal | 20,000 zat ($0.294) | 4,000 zat ($0.059) |
| **total per NFT** | **30,000 zat ≈ $0.441** | **6,000 zat ≈ $0.088** |

Implementation rule: **compute the fee from the actual serialized transaction shape every time** (as the
Zerdinals spec requires: "The consensus branch ID, version group ID, and expiry height are always derived
from live chain state, never hardcoded"), and read `getstandardfee` from the node for `marginal_fee` rather
than hardcoding 5,000. Never pay below the conventional fee: "Zebra relays nothing below the conventional
fee, so the conventional fee is the floor, not a suggestion." (Both the deployed Zerdinals tooling and
`zecscriptions-minter`'s 1,000-zat reveal fee constant get this wrong in opposite directions.)

Also relevant, from Zebra's mempool policy (`zebrad/src/components/mempool/storage/policy.rs` and
`zebra-consensus/src/transaction/check.rs`, read 2026-09-19, **CONFIRMED**):

- `MAX_STANDARD_SCRIPTSIG_SIZE = 1650` bytes and **`scriptSig` must be push-only** → our envelope complies
  (4 pieces max per reveal keeps us well under 1,650).
- Non-standard P2SH redeem scripts are accepted if they have **≤ `MAX_P2SH_SIGOPS = 15`** sigops; ours has 1.
- Dust threshold: `3 × (100 × (output_size + 148) / 1000)` = **54 zat** for a 34-byte P2PKH output, so 546 is
  comfortably above it.

---

## 7. Is there a Zerdinals-style indexer on testnet?

**No public one. CONFIRMED by probing.** `zrunes.io/idx/zcash-metaprotocols/status` reports
`"network":"mainnet"`; `…-testnet/status` and `zcash-testnet-metaprotocols/status` return `{"error":"not
found"}`; `?network=testnet` is ignored and still answers mainnet; `testnet.zrunes.io` is empty.
`indexer.zerdinals.com` and `zcash.ink` are mainnet-only. The Universe team clearly *runs* a private testnet
indexer — their docs record "Zcash testnet verification, 2026-09-14/15" with inscription, transfer, ZRC-20
and ZRC-721 journeys — but that instance is not exposed. Their own ZRunes spec even admits "no Zcash testnet
node existed in the estate" at an earlier point. **Their testnet claims are UNVERIFIABLE by us.**

So verification is on us. Plan, in order of cost:

1. **Port the parser to Node and run it locally.** `zord`'s `parse_inscription()` is ~80 lines of heuristic
   (§1.3) and the Zerdinals v1 validity rules are §7 of its spec (bad piece index, duplicate index,
   non-descending order, piece > 240 bytes, non-final piece < 240 bytes, > 4 pieces/tx, incomplete chain,
   content type outside 3–96 ASCII bytes with a `/`). Implement both readings — the "legacy" one and the
   "v1 + commitment" one — as a single `parseEnvelope(scriptSigHex)` module in our repo, and assert on every
   transaction the minter produces **before** broadcasting.
2. **Golden fixtures from mainnet.** Pull real reveal transactions by txid from Blockchair
   (`/zcash/raw/transaction/{txid}`) or Tatum `getrawtransaction`, feed their `scriptSig`s to our parser, and
   assert our output matches what `indexer.zerdinals.com/inscription/{id}` and
   `zrunes.io/idx/zcash-metaprotocols/inscriptions/{id}` report (content type, content length, content hash,
   owner). Start with `4f7763af…b2c3i0` (decoded in §1.1). This is free and catches parser drift.
3. **ZIP 244 correctness.** Validate our sighash/txid implementation against
   `https://github.com/zcash/zcash-test-vectors/blob/master/test-vectors/json/zip_0244.json` (repo last
   pushed 2026-07-01) before ever signing a funded transaction, and additionally re-derive the txid of a
   known mainnet v5 transaction from its raw hex.
4. **Testnet end to end**: inscribe on testnet, then verify by pulling the raw tx back from Tatum
   `getrawtransaction` and running it through our own parser + a transfer of the carrying output.
5. **One real mainnet inscription (~$0.45)** before the bridge goes live, and check it shows up in
   `indexer.zerdinals.com` and `zrunes.io` with the expected content, content type and owner. That is the
   only true proof that third-party indexers accept our bytes, because the indexers are mainnet-only.

---

## 8. Key generation (description only — no keys generated)

For a transparent testnet keypair with the recommended stack (nothing here was executed):

1. **Private key**: 32 random bytes from `node:crypto`'s `randomBytes`, rejected and redrawn unless it is a
   valid secp256k1 scalar (`@noble/secp256k1` exposes a `randomPrivateKey()`/`utils` helper that does this).
2. **Public key**: compressed (33 bytes, `0x02`/`0x03` prefix) — the envelope's redeem script requires the
   compressed form.
3. **Address**: `hash160 = RIPEMD160(SHA256(pubkey))`, then Base58Check over the **two-byte** Zcash version
   prefix concatenated with the hash. Testnet P2PKH = `0x1D25` → `tm…`; testnet P2SH = `0x1CBA` → `t2…`;
   mainnet P2PKH = `0x1CB8` → `t1…`; mainnet P2SH = `0x1CBD` → `t3…`
   (`librustzcash/components/zcash_protocol/src/constants/{testnet,mainnet}.rs`, **CONFIRMED**). This is the
   one place a Bitcoin library will silently do the wrong thing — bitcoinjs's default `toBase58Check` writes a
   *one-byte* version; the Exodus fork's `address.js` writes `payload.writeUInt16BE(version, 0)`, i.e. two
   bytes, which is correct for Zcash.
4. **WIF** (if we want one): Base58Check over `0xEF || privkey || 0x01` on testnet, `0x80 || privkey || 0x01`
   on mainnet.
5. **P2SH commit address**: `hash160(redeemScript)` under the P2SH version prefix; `scriptPubKey` is
   `a914 <20-byte hash> 87`.
6. **Derivation path** if we use a seed: `m/44'/1'/0'/0/i` on testnet (coin type 1 —
   `zcash_protocol/src/constants/testnet.rs` has `COIN_TYPE: u32 = 1`), `m/44'/133'/0'/0/i` on mainnet.
7. **Operationally**: the minter's hot key holds only working float. Never generate it on a dev laptop for
   mainnet; never log it; keep it out of the repo and out of any `.env` that is committed. Per this
   workspace's rules, mainnet key material is a stop-and-ask item, not something this service generates on
   its own.

---

## 9. Recommended stack

**Format.** Ord `scriptSig` envelope, commit + reveal, content type `application/json`, 240-byte pieces,
built to the **Universe Zerdinals v1** redeem-script shape (`<pubkey> OP_CHECKSIGVERIFY <32-byte C> OP_DROP
OP_DROP×(3+2·pieces) OP_1`, `C = SHA-256("UZRD1" || contentType || 0x00 || content)`). Payload = ZRC-721
`mint`, with the Solana burn recorded inline, e.g.

```json
{"p":"zrc-721","op":"mint","collection":"<NAME>","id":"<n>","to":"t1…",
 "meta":{"src":"solana","sig":"<burn tx signature>","mint":"<SPL mint>","amt":"<burned amount>","dec":6}}
```

(~300 bytes → 2 pieces → one reveal). `zord` ignores unknown fields; whether the Universe reader does is
**UNVERIFIABLE**, so keep a fallback plan of putting the burn record in a second, plain inscription linked by
parent-by-spend if the mint is ever rejected.

**Collection.** ZRC-721 `deploy` (grab the name early) **plus** a parent Zerdinal, with every mint reveal
spending the parent's carrying output as input 1 and returning it to output 1 (NFT to output 0). Serialise
mints on the parent output.

**Library.** `@exodus/bitcoinjs-lib-zcash@0.0.22` (pinned/vendored) for v5 serialisation and the ZIP 244
sighash + `@noble/secp256k1` for signing + `@scure/base` for Base58Check with two-byte prefixes.
Keep `YoneCode/zecscriptions-minter`'s `zcash-tx.mjs` (MIT) as the reference/fallback implementation if we
ever need to drop the dependency entirely.

**Endpoints.**
- Testnet: `https://testnet.zec.rocks:443` (lightwalletd gRPC) for `GetAddressUtxos`, `GetLatestBlock`,
  `SendTransaction`; `https://zcash-testnet.gateway.tatum.io` (Zebra JSON-RPC, 5 req/min anonymous) for
  `getblockchaininfo` (branch id via `consensus.nextblock`), `getstandardfee` and `getrawtransaction`.
- Mainnet later: `https://zec.rocks:443` (+ `na.`/`eu.` as failovers) for the same three calls;
  `https://zrunes.io/idx/zcash-metaprotocols/addresses/{addr}/{utxos,inscriptions}` to build the
  do-not-spend set; Blockchair (`/zcash/dashboards/address/…`, `/zcash/raw/transaction/…`,
  `POST /zcash/push/transaction`, 1,440/day and 30/min free) as the broadcast/read backup.
- Testnet funds: `https://zcashfaucet.jinolabs.xyz/` (0.1 TAZ / address / 24h, pays `tm…`).

**Known risks.**

1. **NU7 branch id is unpublished** and NU7 lands on testnet **2026-10-06** (mainnet target 2026-11-05,
   confirmed 2026-10-20). Read the branch id from the node every build; pause minting around activation;
   never hardcode. Zebra's own table still says `// TODO: set below to (Nu7, ConsensusBranchId(0x77190ad8))`.
2. **The chosen library's source is private** (`ExodusMovement/bitcoinjs-lib-forks` 404s). Pin the version,
   vendor it, and gate it behind our ZIP 244 vector tests — a silent breaking change upstream would be
   invisible otherwise.
3. **The v1 spec's reference implementation is closed-source** and its "launch gates" say mainnet creation is
   still disabled in their product. We are building against a spec nobody can diff against an implementation.
4. **ZRC-721 ids are squattable.** Anyone can mint any id in any collection; ZGODS shows 1,319 mints lost to
   taken ids. Our sequential ids are guessable, and the reveal content is visible in the mempool. Mitigations:
   allocate ids server-side with a retry-on-rejection loop, verify acceptance against both readings after
   confirmation, and lean on parent-by-spend as the authoritative membership.
5. **Two incompatible ZRC-20/ZRC-721 readings exist** (`zord` vs `zecscriptions`), and Universe reports both
   separately rather than resolving them. Our acceptance check must name which reading it used.
6. **Shielding kills the NFT.** If a recipient moves the carrying output into a shielded transaction,
   tracking ends permanently (`SHIELDED_UNTRACKABLE`). The bridge UI must say so, and we must reject
   shielded-only recipient addresses at intake (extract the transparent receiver from a UA, or refuse).
7. **Fee regime is mid-change**: `marginal_fee` 5,000 → 1,000 is merged in Zebra 6.3.0 but the ZIP is still
   an open PR, with wallet adoption pegged to mainnet height 3,590,000. Read `getstandardfee`; do not
   hardcode either value. Also note Zebra v6.3.0's end-of-service halt at height 3,564,960 — our public
   endpoints will be upgraded under us.
8. **No public testnet indexer** means our first true third-party validation costs a real mainnet
   inscription (~$0.45). Budget for it before launch.
9. **Third-party endpoint fragility**: `mint.zerdinals.com` no longer resolves, `utxos.zerdinals.com/api/utxos`
   404s, `zordiscan.com` does not resolve, and zerdinals.com's deployed bundle still signs with the NU6.1
   branch id. Do not put any of these on the critical path; prefer lightwalletd, and plan for running our own
   Zebra + Zaino if volume justifies it.
10. **Parallel minting collides on funding UTXOs and on the parent output.** Pre-split funding UTXOs, and
    keep a single-writer queue for the parent chain.
