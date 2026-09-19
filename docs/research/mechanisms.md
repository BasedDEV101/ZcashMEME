# Research: how a token or meme can be launched on Zcash today, and whether "first" is still available

- **Researched:** 2026-09-19. Every link below was accessed on that date unless a note says otherwise.
- **Scope:** the seven questions in the task brief, checked against the ChatGPT text in `docs/BRIEF.md`.
- **Method:** I read primary sources: ZIPs on zips.z.cash and GitHub `zcash/zips`, GitHub repos and the GitHub API
  for commit dates, forum.zcashcommunity.com threads, and ZCG issues. I used news sites only as leads.
  - I made two kinds of read-only queries. First, I asked the public ZSA test node
    (`dev.zebra.zsa-test.net`) about specific transactions through its JSON-RPC interface. Second, I read the Zerdinals
    public indexer API (`zrunes.io/idx/zcash-metaprotocols`), which is GET-only.
  - I did not create any wallet or key, and I did not broadcast any transaction.

---

## TL;DR

1. **Native ZSAs are not on mainnet and have no activation date.** ZIPs 226/227 are still **Draft**.
   - The ZIP 226 text still says "scheduled for NU7", but that is stale. NU7 is now set for testnet on 2026-10-06 and
     mainnet on 2026-11-05, and it **explicitly excludes transaction-format changes**, which ZSAs need.
   - The v6 format that was drafted for ZSAs (ZIP 230) has been **Withdrawn**. The v6 format number went to the Ironwood
     pool instead (NU6.3, activated 2026-07-28).
   - The core orgs say format changes are in scope for "the following network upgrade". That upgrade has no name and
     no date. **Realistic reading: ZSAs will not be on mainnet in 2026.**
2. **ZSAs do work on test networks.** You can issue, transfer, burn and finalize there, and outsiders can take part.
   - There are two public ZSA test chains: QEDIT's (`dev.zebra.zsa-test.net`, answering RPC today) and hanh's
     (`zsa.methyl.cc`, announced 2026-08-02). Test ZEC comes from mining a regtest-style coinbase.
   - QEDIT's repos were committed to on 8–18 Sep 2026. ChatGPT's "actively updated in Sept 2026" claim is **CONFIRMED**.
3. **ZRC-20 / Zecscriptions / Zerdinals are real and live on mainnet, but fully public (transparent).**
   - Deploy, mint and transfer all happen in **transparent** transactions: data sits in P2SH reveal input scripts and
     OP_RETURN outputs, and the holder must be a `t1`/`t3` address.
   - Every balance and holder is public. If a token is sent into the shielded pool, it is **not made private. It is
     either burned, or counted in a "shielded" bucket where it can no longer be tracked.**
   - ChatGPT's Stage-1 diagram ("ZRC-20 → private users") is **WRONG**.
4. **"First memecoin on Zcash" is already taken.**
   - ZRC-20 tokens have been deployed since **2025-11-13**: `ZERO` (fully minted, about 2,300–2,550 holders), `PEPE`,
     `ZATS`, `ZECS`, `ZODL`, `ZDOG`, and others. There are **164 tickers** in total.
   - Memecoin launchpads that take fees also exist. Zecscriptions v2 takes a 172,800-zat platform cut per mint.
     zordinals.fun charges a 1% taker fee on a bonding curve.
5. **ZecPad / ZPAD-20 is not live on mainnet.** It is testnet-only, privately gated, and not audited, and its
   grant application was **rejected** (2026-06-24).
   - Its own design says "transparent supply" and a semi-custodial reserve. Shielding covers only the ZEC payments
     and the order memos, not the token ledger.
6. **ZecBit exists, but it is testnet-only and a red flag.** Its ZCG grant was **rejected on 2026-09-04**, a moderator
   publicly flagged "a ton of red flags", and a user reported an unrefunded payment.
   - ZecBit did **claim** it issued ten finalized ZSAs in one transaction. **That transaction is not on the QEDIT ZSA
     chain today:** the node returns "No such … transaction", and block 251 holds different transactions. The claim is
     UNVERIFIABLE.
7. **Can a meme asset be genuinely shielded on mainnet today? No, not in any way the chain or an indexer can check.**
   - The one shielded option live today is **ZINC** (FungeLLC). It puts token records in encrypted memos, and its own
     spec calls ownership "advisory (trust-the-poster)", because nothing stops the same token being double-spent.
   - Private **and** checkable ownership would require building a new application-layer ZK pool. Nobody has shipped
     one on Zcash.
8. **What "first" can still honestly mean:**
   - the first **consensus-native ZSA meme on mainnet**, which depends on an upgrade with no date;
   - the first **1:1 backed / bridged meme** on Zcash;
   - the first **fungible meme with shielded holdings that can be verified**, which is research-grade work.
   - Not "first memecoin on Zcash", and not "first Zcash memecoin launchpad".

---

## 1. ZSA status: ZIP 226 / ZIP 227, network upgrade, and QEDIT tooling

**Verdict:** ZIPs are Draft (**CONFIRMED**). NU7 targeting is **WRONG / stale**: they are not in NU7. The test
network, and the ability to issue, transfer and burn on it, is **CONFIRMED**. "Actively updated Sept 2026" is **CONFIRMED**.

### Evidence

**ZIP status**
- ZIP 226 ("Transfer and Burn of ZSAs"): `Status: Draft`, created 2022-05-01. The Deployment section still reads
  "scheduled to be deployed in Network Upgrade 7 (NU7)". Last commit to the file was 2026-07-09 ("Protocol spec and ZIP
  updates for NU6.3").
  - https://zips.z.cash/zip-0226
  - https://github.com/zcash/zips/blob/main/zips/zip-0226.rst
- ZIP 227 ("Issuance of ZSAs"): `Status: Draft`. It has `MAX_ISSUE := 2^64 - 1`, NFTs as value-1 issuance with
  finalization, and says issuance "enables … institutions to create bridges from other chains and issue Assets that wrap
  tokens from those chains." https://zips.z.cash/zip-0227
- **ZIP 230 (the ZSA v6 transaction format) is now `Status: Withdrawn`.** It carries the note "This ZIP has been
  obsoleted by ZIP 229, and will not be deployed. Transaction version number 6 is now defined by ZIP 229."
  - The file was last committed 2026-07-09.
  - https://github.com/zcash/zips/blob/main/zips/zip-0230.rst

**NU7 excludes ZSAs**
- NU7 Coinholder Vote post (ebfull, 2026-08-05) says:
  - "NU7 will not include transaction format changes, and proposals that would involve them have been removed from this poll."
  - "The orgs all agree that transaction format changes are in scope for the following network upgrade."
  - The following upgrade is not named and has no date. https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912
- NU7 Timeline post (ebfull, 2026-09-17): NU7 contains 25-second blocks (ZIP 218), v4 transactions disabled, and the NSM
  (ZIPs 234/235).
  - Testnet 2026-10-06, mainnet 2026-11-05. "New transaction formats do not appear in this network upgrade!"
  - ZSAs are not mentioned. https://forum.zcashcommunity.com/t/nu7-timeline/57655
- Background: in 2025-08 Shielded Labs proposed a smaller NU7 without ZSAs, because "there is no zcashd implementation
  for ZSAs". https://forum.zcashcommunity.com/t/accelerate-nu7-let-s-deliver-a-smaller-network-upgrade-sooner/51916
  (old, 2025-08-13)

**The Ironwood context (what ChatGPT missed entirely)**
- Shielded Labs found an Orchard circuit counterfeiting bug in 2026-05. NU6.2 was an emergency fix on 2026-06-03. Then
  **NU6.3 "Ironwood"** activated on mainnet at height 3,428,143 on **2026-07-28**.
  - Ironwood is a new shielded pool. Orchard is now withdraw-only. https://zips.z.cash/zip-0258
  - I got the block time from Blockchair's raw block API.
  - The bug-discovery and NU6.2 dates come from news leads: https://www.coindesk.com/tech/2026/07/28/zcash-seals-usd1-7-billion-shielded-pool-as-ironwood-upgrade-activates
- The consequence: OrchardZSA must be re-based onto Ironwood and a new transaction format.
  - In the ZSA testnet thread (2026-08-05), QEDIT's Jon says "the version at QEDIT repo now points to the latest ironwood,
    in prep for merging (under feature-flag)". https://forum.zcashcommunity.com/t/zsa-testnet/56884
  - Pine Analytics Q3 2026 (2026-09-10, secondary): "Zcash Shielded Assets remain in integration with Ironwood".
    https://pineanalytics.substack.com/p/zcash-quarterly-report-q3-2026

**QEDIT tooling and test networks**
- QEDIT `zcash_tx_tool` README (branch `main`, v0.6.0 dated 2026-09-10):
  - The "Orchard-ZSA Two Party Scenario" does "Issue an Asset → Transfer the Asset → Burn the Asset (Twice)". There is
    also a three-party scenario and `test-issue-one`.
  - Status: "**Alpha** … not a wallet". https://github.com/QED-it/zcash_tx_tool
- Public endpoints are listed on the QEDIT wiki (edited 2026-05-04): `dev.zebra.zsa-test.net` and
  `dev.zebra-swaps.zsa-test.net`. https://github.com/QED-it/zcash_tx_tool/wiki/Running-tx%E2%80%90tool
- I queried `dev.zebra.zsa-test.net` read-only on 2026-09-19:
  - It is live at height 2,834. It reports NU7 active from height 1 (it is a separate chain, not Zcash testnet).
  - It carries v6 transactions with an `issuanceexists` field.
- A second public **"ZSA testnet"** was announced by hanh (Ywallet/Zkool author) on **2026-08-02**:
  - It runs "a ZSA-enabled version of Zebra and lightwalletd, with NU 6.2 activated (but not Ironwood)", at the
    endpoint `zsa.methyl.cc` with a `uregtest1` address prefix.
  - Funds come from a `shield` command that mines a coinbase reward. So **outsiders can participate**.
  - The thread also shows `issue` / `transfer` / `burn` / `finalize` commands in QEDIT's experimental wallet tool
    branch. https://forum.zcashcommunity.com/t/zsa-testnet/56884
- A third-party app on the ZSA testnet: Cachet (issuance console, browser minting, batch of up to 16 assets per
  issuance bundle). It says: "ZSA (ZIPs 226/227) is not on Zcash mainnet: the v6 transaction format was deferred out of
  NU7". https://github.com/cachet-zec/cachet (repo created 2026-09-01)

**QEDIT commit activity (GitHub API, 2026-09-19)**

| Repo | Default branch | Last commits on default branch |
|---|---|---|
| QED-it/orchard | `zsa1` | 2026-09-16 "Re-export OrchardCircuitVersion…" (#291), 2026-09-11 "Add Orchard V3 and **Ironwood V3** fixed digest tests", 2026-09-10 "Add rcm_zsa" |
| QED-it/zebra | `zsa1` | 2026-09-10 "Sync zsa1 with upstream Zebra v5.2.0", 2026-09-08 "Add EC2 configuration and the ops workflow for ZSATestnet" |
| QED-it/zcash_tx_tool | `main` | 2026-09-11 v0.6.0 changelog / release |
| QED-it/librustzcash | `zsa1` | 2026-07-19 on `zsa1`; **push 2026-09-18 to branch `sync-zcash-pr-2592-nu63`** |
| QED-it/zips | `zsa1` | repo pushed 2026-09-15 |

- API URLs: `https://api.github.com/repos/QED-it/<repo>/commits` and `/events`.
- QEDIT's grant history:
  - "OrchardZSA finalization" grant ($276,600) marked Complete; final milestone paid 2026-04-03.
    https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/154
  - Swaps update 2026-05-05: "demonstrated the end-to-end functionality of ZSAs including Swaps".
    https://forum.zcashcommunity.com/t/zcash-shielded-asset-swaps-and-transaction-acceptance/48432?page=3

### Sources that contradict each other
- **ZIP 226 text ("scheduled … NU7") and QEDIT ZSA Hub ("Target: Zcash NU7 (date TBD)", "testnet upcoming")**
  contradict the NU7 vote and timeline posts, which rule out format changes. The forum posts are newer and come from the
  people shipping NU7, so I trust them. https://qed-it.com/zsa-hub/
- Several news/AI aggregator snippets (e.g., CoinMarketCap AI) still say NU7 "introduces ZSAs". That is **stale**.
- hanh (2026-08-03) says of the QEDIT testnet: "I don't think it is maintained anymore". But QEDIT committed a
  "ZSATestnet" ops workflow on 2026-09-08 and the node answers today. It is probably redeployed or reset (see Q4).

### What this means for the project
- A "native ZSA meme" **cannot launch on mainnet in 2026**. It can be built and demoed on the ZSA test chains now.
- Plan for a migration: the asset-ID derivation (issuer key plus `asset_desc` hash) can be fixed now, so that the same
  identity is issued natively later.
- Do not promise a date. The next upgrade after NU7 has no name or schedule. ZSA must also be re-integrated on
  Ironwood, and ZSA wallets need building.

---

## 2. Zecscriptions / ZRC-20

**Verdict:** It is real and live on mainnet (**CONFIRMED**). The operations are **transparent**, and balances are
**public** (**CONFIRMED**). Any suggestion that ZRC-20 gives "private users" is **WRONG**.

### How it works, from the specs and code
- ZRC-20 is BRC-20-style JSON (`deploy` / `mint` / `transfer`). An indexer sums mints and transfers "by current
  inscription ownership". https://zatoshi.gitbook.io/zrc
- **Carrier:** Zerdinals docs (repo created 2026-08-25, updated 2026-09-19) give the rules below.
  https://github.com/bitcoinuniverseio/docs-zerdinals-and-zrunes (file `src/content/docs/understand/transparent-and-shielded.md`)
  - Content goes in the *input scripts* of a commit/reveal pair of transparent transactions (P2SH, 240-byte pieces).
  - ZRunes use an OP_RETURN output.
  - "Nothing is derived from a shielded bundle".
  - "Minting a ZRC-20 token — transparent address required — a mint with no transparent recipient is rejected
    outright"; transferring works the same way.
  - "Holding any asset here — Yes — ownership is control of one transparent output."
- Zecscriptions' own site says it "operates exclusively on Zcash's transparent address layer (t-addr) because the
  inscription envelope has to be readable by every indexer". It calls shielded support "an open research problem".
  https://www.zecscriptions.com/
- The Zecscriptions minter bot reads "UTXOs at your `t1` address". Ownership follows output 0 of the reveal
  transaction, keyed by address. https://github.com/YoneCode/zecscriptions-minter (2026-05-15)
- **What happens if you shield a token?** "Shielding does not make an asset private. It ends its trackability."
  - ZRC-20 amounts sent into a shielded transaction go into a separate "shielded" bucket
    (`minted = circulating + burned + shielded`).
  - ZRunes that go shielded are "burned by protocol rule". (Same Zerdinals doc.)
- **Two competing rule sets:** ZRC-20 "was defined by its implementations rather than by a specification".
  - The `zord` and `zecscriptions` readings disagree on ticker length and on partial mints, so holder counts differ.
  - Example: ZERO has 2,339 holders under one reading and 2,551 under the other.
    https://github.com/bitcoinuniverseio/docs-zerdinals-and-zrunes (`understand/zrc-20.md`)
- **Built-in fee model (prior art for our launchpad).** Zecscriptions "ZRC-20 v2" requires every mint to pay a
  192,000-zat protocol fee: 19,200 to the deployer and **172,800 to the platform address**.
  https://github.com/YoneCode/zecscriptions-minter/blob/HEAD/protocol-constants.js

### Activity (Zerdinals indexer API, read at height 3,489,211 on 2026-09-19)
- **164 ZRC-20 tickers deployed**: 30 fully minted and 134 still "minting".
- The first deploy was `ZERO` at height 3,133,112, which is **2025-11-13 05:44 UTC** (Blockchair block time).
  - ZERO: 21M max, fully minted, 21,000+ mints, about 2,300–2,550 holders.
  - Next by holders: `ZECS` (988), `PEPE` (about 550), `ZATS` (about 410), `ZODL` (about 170), `CASH` (78), `ZINC` (77).
- The oldest indexed inscription is at height 3,132,356 (2025-11-12). The newest was at 3,489,210, so it is still in use.
- The docs report 112,814 indexed inscriptions at height 3,465,610 (2026-08-30 measurement). About 1 in 7 were already
  in the "shielded, untrackable" end state.
- **Momentum has faded:** only 7 of the 164 tickers were deployed after Ironwood (2026-07-28), and most have 0–2 holders.
- The indexer's own status page says "Marketplace production qualification remains incomplete as checked on
  17 September 2026", and the API reports `writesEnabled:false`.
- Endpoint: `https://zrunes.io/idx/zcash-metaprotocols/tokens?limit=100`
- Lead only: CoinDesk (2025-11-20) said Zerdinals "temporarily pushed daily transactions above 70,000".
  https://www.coindesk.com/markets/2025/11/21/asia-morning-briefing-zec-s-rally-outpaces-what-transparent-onchain-data-can-explain

### A security warning from this ecosystem
- Former marketplace zatoshi.market sent users' raw WIF private keys to its server for ZRC-20 mint and transfer.
  Community reports say wallets were drained on 2026-06-22. https://github.com/hieusats/zatoshi-market-key-exposure
  (published 2026-09-19)

### What this means for the project
- ZRC-20 is the fastest way to put *a* token on Zcash mainnet today. But it is **a Bitcoin-style public token that
  happens to live on Zcash**, and it has none of Zcash's privacy.
- ZRC-20 is also crowded: 164 tickers, two competing rule sets, fading activity, and at least one launchpad that leaked
  users' keys.
- Launching "a shielded meme" on ZRC-20 would be false advertising.

---

## 3. ZecPad / ZPAD-20

**Verdict:** It exists (**CONFIRMED**). It is **not live on mainnet**: it is testnet-only and gated
(ChatGPT's "genuine mainnet alternative today" is **WRONG**). It claims only *partial* shielding (**PARTLY TRUE**).

### Evidence
- Forum thread by `mrnobody`, 2026-06-05 → 2026-09-18, "ZecPad — a privacy-first bonding-curve launchpad for Zcash".
  https://forum.zcashcommunity.com/t/zecpad-a-privacy-first-bonding-curve-launchpad-for-zcash/56029
  - The ZPAD-20 meta-protocol: "deploy / buy / sell / transfer ops written into transactions, with an indexer computing
    state — same idea as BRC-20/Ordinals". Its indexer reads *transparent* ZPAD-20 operations.
  - MVP settlement is "semi-custodial, reserve transparent = proof-of-reserves", with "PCZT atomic swaps" as the
    trustless end goal.
  - Privacy covers participants only: "encrypted memos to carry buy/sell intent privately", "private participation,
    transparent supply", "the token ledger stays publicly verifiable".
  - Status: "Testnet first, audit before any mainnet."
  - On 2026-09-04 it pivoted to a "Private Market Layer for Zcash" and said it is "approaching launch".
- ZPAD-20 grant application (2026-06-09): "deterministic indexer + conformance suite… reconstructs application-asset state
  directly from the Zcash chain", "same chain → same state". It was **rejected by ZCG on 2026-06-24**.
  https://forum.zcashcommunity.com/t/grant-application-zpad-20-open-asset-indexing-discovery-infrastructure-for-zcash/56114
- dev.to post, 2026-09-07: "not publicly available… 'TOO SOON' page", "No audit has been completed".
  https://dev.to/zecpad/building-a-privacy-first-market-layer-on-zcash-what-zecpad-is-testing-before-launch-6a6

### What this means for the project
- ZecPad is a **direct competitor** for the launchpad idea: a pump.fun-style launchpad on Zcash with ZEC settlement.
  It has not shipped.
- Its architecture admits that app-layer tokens have **public supply and public ledgers**. Its privacy covers only the
  ZEC that pays for trades.
- It is not a component we can build on. There is no mainnet, no audit, and no funded open spec.

---

## 4. ZecBit

**Verdict:** It exists (**CONFIRMED**). The "ten finalized ZSAs in one tx" is a **self-report I could not confirm on
chain** (**UNVERIFIABLE**). The project is testnet-only and flagged by forum moderators.

### Evidence
- ZecBit's grant proposal (2026-08-31, $48,000):
  https://forum.zcashcommunity.com/t/grant-proposal-zecbit-nft-infrastructure-for-zcash-shielded-assets/57280
  - The post says: "On August 29, we issued ten unique finalized ZSAs in a single transaction on the public ZSA test
    network: ten `IssueActions`, each with its own `assetDescHash`, reference note, value-1 note, and `finalize = 1`, all
    under a single `issueAuthSig`."
  - It gives TXID `611ddfd4459e813b86b935fc05217f929e29c37cdc96ba8f23fc647e30c26317`, height 251, node
    `https://dev.zebra.zsa-test.net`.
- **My on-chain check (read-only JSON-RPC, 2026-09-19):**
  - `getrawtransaction` for that TXID on `dev.zebra.zsa-test.net` → `"No such mempool or main chain transaction"`.
  - The `zebra-swaps` node → "Transaction not found".
  - Block 251 on today's chain holds three *different* txids.
  - The most likely explanation is a chain reset or redeploy after 2026-08-29. QEDIT committed "Add EC2 configuration
    and the ops workflow for ZSATestnet" on 2026-09-08, and a post-NU6.2 sync on 2026-09-10.
  - But I cannot prove the claim either way. The claim is technically plausible: ZIP 227 allows several issue actions in
    one bundle, and Cachet does batches of 16.
- **Grant outcome and flags:**
  - ZCG: "the committee has decided not to move forward with this proposal" (**2026-09-04**).
  - Moderator Shawn (2026-09-01): "ZSAs are not available on Zcash mainnet and there is no ETA on when or if they will
    ever be deployed". He flagged promotion aimed at NFT/airdrop farmers.
  - A user called it "a plain scam". Another user reported a failed 0.1 ZEC purchase with no refund (2026-09-06), and
    the moderator replied: "This project has a ton of red flags".
  - Thread pages: https://forum.zcashcommunity.com/t/grant-proposal-zecbit-nft-infrastructure-for-zcash-shielded-assets/57280?page=3
- Secondary sources:
  - Minting reportedly cost about $8 for testnet-only assets, and assets would be moved to users "only after ZSA is
    activated on mainnet". https://paragraph.com/@onchaindiary/zcash-whitelist-what-you-hand-over (2026-09-19)
  - X posts market it as "the first NFT collection on Zcash Shielded Assets".

### What this means for the project
- Do not partner with ZecBit or cite it as proof.
- Its story is the cautionary one: **selling testnet ZSA assets for real ZEC** drew immediate community backlash.
- If we demo on the ZSA testnet, we must say "testnet" loudly and charge nothing.

---

## 5. Other token / NFT / inscription standards ChatGPT missed

| Name | What it is | Carrier | Private? | Status (2026-09-19) | Source |
|---|---|---|---|---|---|
| **Zerdinals** (Universe) / legacy "zordinals" | Ordinals-style inscriptions | Transparent commit/reveal P2SH input scripts | **No** | Mainnet since 2025-11-12; about 111k inscriptions | https://github.com/bitcoinuniverseio/docs-zerdinals-and-zrunes |
| **ZRC-721** | NFT inscriptions (IPFS metadata) | Transparent (OP_RETURN envelopes per zcash.ink) | No | Mainnet | https://github.com/cloutprotocol/zord, https://zcash.ink/ |
| **ZRunes** | Runes-style fungible tokens | Transparent OP_RETURN "ZRunestone" | No; shielding **burns** the balance | Activated at mainnet height 3,470,000 (2026-09-03). The first etch seen is a test ("GLASSTESTONE", 2026-09-19) | Zerdinals docs + API `/zrunes` |
| **ZORD** (cloutprotocol / zatoshilabs) | Rust indexer, "Zats", ZRC-20, ZNS names | Transparent | No | Repo commits 2026-09-18 | https://github.com/cloutprotocol/zord |
| **ZINC** (FungeLLC) | ZINC-1 memo envelope, **ZINC-2 NFTs**, ZINC-3 DNS zones | **Shielded encrypted memos** (ZIP 302 text memo, ≤512 B) sent to a "registry" address whose viewing key (UFVK) is published | **Yes for mint and transfer**, but ownership is "**advisory**" | Draft spec (2026-06-28). Live on mainnet via secresea.com (source private). Example mint txid `b91d1e89…` | https://github.com/FungeLLC/zinc |
| **Cachet** | ZSA issuance console / registry | Native ZSA (v6 issuance) | Transfers shielded, issuance public | **ZSA testnet only** | https://github.com/cachet-zec/cachet |
| **zaddr.net** | 2,800 pixel "faces", "Every face is public. Every owner isn't." | Not stated. Claims "Orchard shielded pool", but Orchard has been withdraw-only since Ironwood | Claimed | Whitelist; mint listed as "Sept 21", which a third party says is unscheduled | https://zaddr.net/, https://paragraph.com/@onchaindiary/zcash-whitelist-what-you-hand-over |
| **zordinals.fun** | "Launch a Zcash memecoin in seconds", bonding curve, 1% taker fee, 2% NFT fee, 0.001 ZEC to launch | Inscription records (transparent) | No | Site up; activity unverified | https://docs.zordinals.fun/zordinals-fun, https://www.zordinals.fun/ |
| **zcash.ag** | Meme launchpad "paired with $ZEC" | **Robinhood Chain**, not Zcash | n/a | Live | https://www.zcash.ag/ |
| **ZCAT / StonkFun** | Solana meme that pays holders in ZEC; trades against ZEC on a Solana launchpad | **Solana** | n/a | Live (CoinDesk 2026-09-07) | https://www.coindesk.com/markets/2026/09/07/this-cat-memecoin-has-paid-holders-usd2-8-million-in-zcash-as-zec-tops-usd1-200 |

- I found **no** colored-coin scheme and no pre-2025 Zcash token standard in current primary sources. I did not search
  deeply for either.
- The Zerdinals ordinality decision record (2026-08-25) reviewed "every known Zcash inscription implementation":
  zordinals-node-tools, zord, zecscriptions-minter, and zinc. It found none that tracks individual zatoshis. Its
  conclusion was that shielded pools make ordinal theory "undefined or dishonest" on Zcash.
  (`src/content/docs/protocols/ordinality.md` in the Zerdinals docs repo)

### What this means for the project
- The ecosystem already contains ZRC-20, ZRC-721, ZRunes, Zerdinals, ZINC, two or more meme launchpads, and a
  Solana-side ZEC meme.
- The only unoccupied ground is **fungible, shielded, and verifiable**, plus **backed/bridged**.

---

## 6. "First memecoin on Zcash": is it taken?

**Verdict: Yes, it is taken (CONFIRMED).**

### Evidence
- `ZERO` was deployed as ZRC-20 on 2025-11-13. `PEPE` (ZRC-20) was deployed the same day at height 3,133,617.
  `ZATS`, `POOP`, `ZDOG`, `ZECS`, `ZODL` and dozens of others followed within days. Source: Zerdinals indexer
  `/tokens`, with Blockchair block times.
- Memecoin **launchpads** on Zcash already exist:
  - Zecscriptions: "Native Inscription Launchpad", with a platform mint-fee cut.
  - zordinals.fun: bonding curve, 1% fee.
  - ZecPad: announced, not shipped.
- A "Zcash meme" on another chain also exists: ZCAT on Solana.

### What "first" can still honestly mean

| Candidate claim | Still open? | Why / risk |
|---|---|---|
| "First memecoin on Zcash" | **No** | ZRC-20 `ZERO` / `PEPE`, 2025-11-13 |
| "First memecoin launchpad on Zcash" | **No** | Zecscriptions, zordinals.fun |
| "First shielded NFT on Zcash mainnet" | **No** (weak form) | ZINC-2 (secresea.com) has shielded memo NFTs on mainnet, with advisory ownership |
| "First native ZSA memecoin on Zcash **mainnet**" | **Yes**, but you cannot do it until ZSA activates (no date) | Anyone can deploy on activation day, so the race is on that block. Cachet is already positioned for it |
| "First ZSA meme on the **ZSA testnet**" | Probably already done by someone, and not worth much | Cachet and ZecBit have issued assets there. Testnet claims carry no value, and ZecBit shows the backlash risk |
| "First **1:1 Solana-backed (bridged) meme** on Zcash" | **Appears open.** I found no live one. (The separate ZecShield bridge proposal is out of scope here) | Needs a bridge/custody design. The Zcash side would be ZRC-20 (public) or ZINC-style (advisory) until ZSA |
| "First **fungible meme whose holdings are shielded and can be verified by anyone**" | **Open**, and nobody has built it | Needs new application-layer cryptography (see Q7). High effort, high audit burden |
| "First meme with shielded **holdings** (advisory ledger, like ZINC, but fungible)" | Probably open for *fungible* tokens | ZINC-2 is NFT-only. A fungible version would be easy to build but has **advisory ownership**: double-spend is possible without a trusted registry |

**Recommended honest phrasing** (if the operator wants a "first" claim): "the first Solana-backed memecoin with private
holdings on Zcash".
- It is only true if the design really delivers checkable private holdings.
- Otherwise, say "private-by-default ownership, with a published proof of reserves", and state who you have to trust.

---

## 7. Can a meme asset be genuinely shielded on Zcash mainnet today?

**Plain answer: No.**
- No mechanism is available today in which ownership of a meme token is **both** hidden from the public **and**
  enforced by the chain or by an independent indexer without a trusted party.
- The one thing that fully does this, native ZSA, is not on mainnet and has no date.

### Why, step by step

1. **Shielded notes carry exactly one asset: ZEC.** Before ZSA, an Orchard/Ironwood note has no asset-type field, so
   nothing in consensus can say "this note is 100 MEME". That field is exactly what ZIP 226 adds.
2. **Memos are labels, not tokens.** You can write "transfer 100 MEME to X" in an encrypted memo (512 bytes per output),
   and ZINC does exactly that on mainnet today. But:
   - Zcash nullifiers stop the *ZEC* in that note being spent twice, **not the label**. Alice can send "transfer token
     #7" to Bob in one transaction and to Carol in another. Each sees a valid-looking memo.
   - ZINC's own spec says so: "A memo is a *label*, not a note-bound token: Zcash nullifiers protect the ZEC, not the
     NFT. The launch model is therefore **advisory** (trust-the-poster; txid existence checked; no sender-ownership
     proof)." https://github.com/FungeLLC/zinc/blob/HEAD/spec/zinc-shielded-inscriptions.md
3. **An indexer can only check what it can decrypt.** ZINC's "registry" is an address with a published viewing key
   (UFVK), so memos *sent to the registry* are readable by anyone. That makes them effectively public.
   - Transfers sent *directly* to recipients stay private, but the indexer cannot see them, so it cannot check them.
   - So you have to choose one of three:
     - (a) public and verifiable, like ZRC-20;
     - (b) private and unverifiable, like ZINC advisory transfers;
     - (c) private from the public, but visible to and trusted in a central registry or sequencer, which learns the
       whole transfer graph. ZINC rejects this option for that reason.
4. **Transparent inscriptions cannot be shielded.** ZRC-20, Zerdinals and ZRunes derive everything from transparent
   scripts. Shielding a token-carrying output ends its tracking, or burns it (Zerdinals docs, quoted in Q2).
5. **The only honest route to private and verifiable ownership on today's mainnet is to rebuild a shielded pool at the
   application layer:**
   - token commitments, a Merkle tree, nullifiers, and a zero-knowledge proof for each transfer;
   - all posted as data on Zcash, for example in memos to a registry whose viewing key is published, or in OP_RETURN
     outputs paid for from shielded ZEC;
   - checked the same way by every indexer.
   - ZINC's roadmap names a weaker form of this, the "reveal-once witness", as *future work*.
   - Nobody has built this on Zcash. It means designing new cryptography, heavy auditing, and a data-size problem
     (512-byte memos compared with multi-KB proofs, unless you use Groth16-sized proofs).
   - Zcash consensus would still not enforce it. The indexer rules would, as with Ordinals.
   - This is a research project, not a launch path.
6. **What *is* possible today, with honest labels:**
   - A transparent ZRC-20 meme: public, verifiable, not private.
   - A ZINC-style memo meme: private, but advisory ownership.
   - A custodial or federated ledger where users deposit and withdraw with shielded ZEC. It is private from the
     public, but the operator sees everything and must be trusted. The Zcash chain is only the payment rail.
   - A native ZSA meme **on the ZSA testnet**: real shielded transfers, no economic value.

### What this means for the project
- **The NFT workaround does not escape this problem.** "NFTs on Zcash" today means either public (ZRC-721/Zerdinals)
  or advisory memo labels (ZINC-2). Neither is a private token that can be checked.
- If "shielded" is the product's core promise, the choices are:
  - (i) wait for native ZSA, and prepare the same asset ID and issuer key now;
  - (ii) launch with an openly trusted custodian or registry, and publish its viewing key as proof of reserves;
  - (iii) fund real application-layer ZK work.
- Marketing it as "shielded" before one of these is in place would be misleading.

---

## Claims table (ChatGPT text in `docs/BRIEF.md`)

| # | ChatGPT claim | Verdict | Source(s) |
|---|---|---|---|
| 1 | ZSA allows one asset with supply up to 2^64 − 1 | **CONFIRMED** | https://zips.z.cash/zip-0227 (`MAX_ISSUE := 2^64 - 1`) |
| 2 | ZSA design explicitly includes wrapped assets from other chains | **CONFIRMED** | ZIP 227 ("create bridges from other chains and issue Assets that wrap tokens"); ZIP 226 ("bridging") |
| 3 | ZIP 227 describes NFTs as value-1 issuance with finalization | **CONFIRMED** | https://zips.z.cash/zip-0227 |
| 4 | ZIP 227 says issuance and burn can be used for bridging | **CONFIRMED** | ZIP 227 + ZIP 226 ("Burning Assets is useful for … bridging") |
| 5 | "Zecscriptions / ZRC-20 is live on Zcash mainnet" | **CONFIRMED** | https://www.zecscriptions.com/, Zerdinals indexer `/tokens` (164 tickers) |
| 6 | It records deploy, mint and transfer in Zcash transactions and rebuilds the ledger from the chain | **CONFIRMED**. The transactions are **transparent** | https://zatoshi.gitbook.io/zrc, Zerdinals docs `transparent-and-shielded.md` |
| 7 | Zecscriptions "explicitly describes itself as an application-level inscription protocol rather than a Zcash consensus asset" | **PARTLY TRUE**. The substance is right; I did not find that exact wording | https://www.zecscriptions.com/ |
| 8 | Stage 1: ZRC-20/ZPAD-20 → "private users" | **WRONG**. ZRC-20 needs transparent holders and has public balances; ZPAD-20 has "transparent supply" | Zerdinals docs; ZecPad forum thread |
| 9 | ZecPad is building ZPAD-20 because Zcash has no smart-contract VM | **CONFIRMED** (as a stated rationale) | https://forum.zcashcommunity.com/t/zecpad-a-privacy-first-bonding-curve-launchpad-for-zcash/56029 |
| 10 | ZPAD-20 design is deterministic on-chain operations plus an indexer; independent indexers derive the same state | **CONFIRMED** (as a design); the grant was rejected 2026-06-24 | https://forum.zcashcommunity.com/t/grant-application-zpad-20-open-asset-indexing-discovery-infrastructure-for-zcash/56114 |
| 11 | ZPAD-20 is a "genuine mainnet application-layer alternative today" | **WRONG**. Testnet-only, gated, not audited | ZecPad thread; https://dev.to/zecpad/building-a-privacy-first-market-layer-on-zcash-what-zecpad-is-testing-before-launch-6a6 |
| 12 | ZecPad describes application-layer assets now, with a future path to native ZSA | **CONFIRMED** | ZecPad thread, 2026-09-04 post |
| 13 | ZecBit is building NFT infrastructure around ZSA | **CONFIRMED** that it exists; ZCG **rejected** it 2026-09-04; moderators flagged red flags | https://forum.zcashcommunity.com/t/grant-proposal-zecbit-nft-infrastructure-for-zcash-shielded-assets/57280 |
| 14 | ZecBit "reported issuing ten unique finalized ZSAs on the public ZSA test network in one transaction" | **CONFIRMED that it reported this**; the fact itself is **UNVERIFIABLE** (TXID `611ddfd4…` not found on `dev.zebra.zsa-test.net` on 2026-09-19) | Same thread; my read-only RPC query |
| 15 | QEDIT's tooling can issue, transfer and burn ZSAs on the ZSA test infrastructure | **CONFIRMED** (Alpha; not a wallet) | https://github.com/QED-it/zcash_tx_tool |
| 16 | QEDIT's ZSA branches were still being actively updated in September 2026, including Orchard/librustzcash | **CONFIRMED**. orchard `zsa1` commits 2026-09-08→16; librustzcash push 2026-09-18 (NU6.3 sync branch); zebra 2026-09-10 | GitHub API for `QED-it/orchard`, `QED-it/librustzcash`, `QED-it/zebra` |
| 17 | "ZSAs are still draft and not generally activated on mainnet" | **CONFIRMED** | ZIP 226/227 headers; https://forum.zcashcommunity.com/t/nu7-timeline/57655 |
| 18 | "ZSA testnet/implementation work is now quite concrete" | **CONFIRMED**. Two public ZSA test chains; swaps demo 2026-05 | https://forum.zcashcommunity.com/t/zsa-testnet/56884 |
| 19 | Implied: native ZSA arrives with the next upgrade, so a smooth Stage 2 migration is coming | **WRONG / unsupported**. NU7 (2026-11-05) excludes format changes; the ZSA v6 format ZIP 230 was withdrawn; the later upgrade has no date | https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912, https://github.com/zcash/zips/blob/main/zips/zip-0230.rst |
| 20 | "The ecosystem is practically giving us the components" (Zecscriptions + ZecPad + ZecBit + ZSA) | **WRONG**. Zecscriptions is transparent-only; ZecPad is unshipped and rejected for a grant; ZecBit is flagged and testnet-only; ZSA has no date | All of the above |
| 21 | "The outsiders don't need to see those balances" (shielded notes holding MEME quantities) | **TRUE only under native ZSA**, which is not on mainnet. **WRONG for any mechanism usable today** | ZIP 226; Q7 analysis |
| 22 | Private per-unit serials give "fungible economics + NFT-like identity + Zcash privacy" | **UNVERIFIABLE / not possible today** without native ZSA or new application-layer ZK. Memo-based serials are advisory | https://github.com/FungeLLC/zinc/blob/HEAD/spec/zinc-shielded-inscriptions.md |
| 23 | ChatGPT never mentions the Ironwood (NU6.3) pool migration | **Omission**. Ironwood activated 2026-07-28 and changes the ZSA integration path | https://zips.z.cash/zip-0258 |

### Items outside my topic, noted but not checked
- The ZecShield (Solana↔Zcash FROST bridge) grant claims.
- The Solana-side escrow design.
