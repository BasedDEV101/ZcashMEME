# Launchpad economics on Zcash: how a launchpad can earn fees

Research date: **2026-09-19**. Every fee figure carries the date of its source. Launchpad fees change often
(pump.fun has changed its schedule at least four times since May 2025), so check them again before relying on them.
Anything without a primary source is marked **UNVERIFIABLE** or **secondary**. Anything I worked out myself
rather than read in a source is marked **(analysis)**.

---

## TL;DR

- **Leading launchpads earn about 1% of bonding-curve volume, and then a smaller cut of the AMM after graduation.**
  - pump.fun: 1.25% on the curve (0.95% protocol + 0.30% creator), then a tiered 0.30–1.25% on PumpSwap. Tiers took effect 2025-09-01 and were still documented on 2026-09-14.
  - Raydium LaunchLab: 1% protocol fee, plus a third-party "platform" fee of up to 500 bps (cap raised 2026-08-26), plus a creator fee of up to 50 bps.
  - Four.meme: 1%. Clanker: a 20% protocol cut of a 1–3% LP fee.
  - pump.fun's parent "Pump" earned **~$455M revenue in the trailing 12 months** (DefiLlama, to 2026-09-18).
- **All of those fees are enforced by a smart contract. Zcash has none**, and ZSAs (ZIP 226/227) are still **Draft**. Every Zcash token today is an **indexer protocol on the transparent pool**: ZRC-20, zOrdinals/ZRC-721, Zerdinals/ZRunes, and ZPAD-20 (not yet live).
- **Zcash does have a partially-signed-transaction primitive, on the transparent pool only.** ZIP 244 keeps `SIGHASH_SINGLE|ANYONECANPAY` for transparent inputs, and Zerdinals' market uses it for Ordinals-style listings. Sapling and Orchard spends always sign `SIGHASH_ALL`, so a shielded token can't be listed the Ordinals way. PCZT (ZIP 374, Draft) is a PSBT-like *construction* format. It isn't a swap primitive.
- **Fees on Zcash are only really enforceable where the operator is in the payment path:**
  1. The operator runs the curve or primary sale and delivers the tokens (ZecPad's "semi-custodial reserve"; the Zerdinals launchpad's 15% commission).
  2. The operator's indexer ruleset makes a payment output a condition of validity (zcash.ink's 2% buyer fee "is an output in the purchase transaction").
  3. The operator is the bridge issuer.
- **Every fee enforced by an indexer can be forked away.** ZRC-20 already has **two incompatible readings** ("zord" and "zecscriptions"). One reader's v2 rule requiring a mint to pay three specific outputs is **applied by neither** third-party reading, because its activation height was never recorded. A fee rule survives only while your indexer is the one the market follows.
- **There is no DEX or AMM for Zcash tokens.** ZEC itself trades cross-chain (NEAR Intents, Maya, and Zwap early access), but tokens trade only as whole lots through signed listings on a handful of marketplaces:
  - zcash.ink (2% buyer fee).
  - The Zerdinals/ZRunes market. By its own docs, it had not completed production qualification on 2026-09-17.
  - Zecscriptions, which reports no protocol fee on deploy.

  ZecPad, the only "pump.fun for Zcash" project, is **not public**, and its ZCG grant for ZPAD-20 was **rejected**.
- **Worked example.** 1,000 buyers × 0.5 ZEC = 500 ZEC (~$736k at $1,471/ZEC). A Zcash launchpad can reliably capture about **5–6 ZEC (1% on an operator-run curve)**, plus a deploy fee. Secondary-market fees of **0–20 ZEC** depend entirely on the share of trades that go through your UI. The cleanest trustless fee is still on **Solana**: registering a LaunchLab "platform" gets you up to 5% of curve volume, enforced by the program.
- **Material flags:**
  - The EU AMLR (Reg. 2024/1624, Art. 79) bars EU crypto-asset service providers (CASPs) from anonymity-enhancing coins from **10 July 2027**.
  - A published third-party audit alleges that the former ZRC-20 marketplace zatoshi.market sent users' raw private keys to its server. Trust is the scarce resource in this niche.

---

## Q1. How the leading memecoin launchpads earn money

### pump.fun (Solana)

Primary source: pump.fun's official GitHub docs repo
[pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs). The web docs at
`pump.fun/docs/fees` redirected to `static.pump.fun/blocked` (geo-block) from this research location on 2026-09-19.

| Item | Figure | Date / source |
|---|---|---|
| Launch fee | **None beyond Solana rent/tx.** The program has a "free coin creation" flow in which the first buyer creates the coin on-chain. | [PUMP_PROGRAM_README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md) (repo updated 2026-09-14) |
| Bonding curve | Uniswap-V2-style constant product on **virtual reserves**: 30 virtual SOL, 1.073B virtual tokens, 793.1M real tokens for sale, 1B total supply. | Same README, `Global` account dump |
| Graduation threshold | The curve completes when `real_token_reserves == 0`. **(analysis)** From the documented parameters: k = 30 × 1.073B; at completion virtual tokens = 279.9M, so virtual SOL ≈ 115.0 and **real SOL raised ≈ 85 SOL** (~$9.4k at $111/SOL on 2026-09-19). Implied market cap at graduation ≈ 411 SOL. | Same README |
| Graduation / migration fee | `pool_migration_fee` = 15,000,001 lamports (~0.015 SOL, "minimum lamports necessary to pay for all accounts created during `migrate`"). Migration goes to **PumpSwap**, pump.fun's own AMM, and is permissionless; the LP tokens are burnt. | Same README |
| Bonding-curve trade fee | **1.25% total = 0.95% protocol + 0.30% creator** | [fees.png tier table](https://github.com/pump-fun/pump-public-docs/blob/main/docs/fees.png), published 2025-08-29, effective **2025-09-01 20:00 UTC** per [FEE_PROGRAM_README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/FEE_PROGRAM_README.md) |
| PumpSwap (post-graduation) fee | **Tiered by market cap**: 1.25% (<$85k mcap: 0.30% creator / 0.93% protocol / 0.02% LP), falling to **0.30%** above $20M mcap (0.05% creator / 0.05% protocol / 0.20% LP). The protocol takes 0.05% on every tier above $85k. | Same tier table, effective 2025-09-01 |
| PumpSwap base config (non-canonical pools) | 20 bps LP + 5 bps protocol | [PUMP_SWAP_README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_SWAP_README.md) |
| Creator-fee history | Creator fees added to the curve and to canonical PumpSwap pools on **2025-05-12 11:00 UTC**. Dynamic tiers ("Project Ascend") from **2025-09-01**. Holder-rewards coins (the creator fee goes to holders) documented **2026-09-12**; "cashback" coins deprecated at the same time. | [PUMP_CREATOR_FEE_README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_CREATOR_FEE_README.md), [HOLDER_REWARDS_README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/HOLDER_REWARDS_README.md), repo commit log |
| Creator fee sharing (split across up to 10 wallets) | 2026-01-09 | **Secondary**: [Brave New Coin](https://bravenewcoin.com/insights/pump-fun-introduces-creator-fee-sharing-system-to-rebalance-platform-incentives) |
| Revenue scale | DefiLlama "Pump" (parent: pump.fun + PumpSwap etc.): **$455.3M revenue over the trailing 1y**, **$1.31B all-time**, $55.1M in the last 30d. "pump.fun" (launchpad only): $310.2M trailing 1y. Monthly launchpad revenue ranged from $18.1M (Jun 2026) to $36.7M (Aug 2026). | [DefiLlama API `summary/fees/pump`](https://defillama.com/protocol/pump), pulled 2026-09-19, last datapoint 2026-09-18 |

### Raydium LaunchLab (Solana), and LetsBonk/Bonk.fun, which runs on it

Primary source: [docs.raydium.io](https://docs.raydium.io/llms.txt). The changelog shows fee-relevant changes on 2026-01-27,
2026-08-17, 2026-08-26 and 2026-09-09.

- **Four additive fees on every curve trade**
  ([fee reference](https://docs.raydium.io/products/launchlab/tips-and-gotchas/launchlab-cpmm-fee-reference.md)):
  - **Protocol** `trade_fee_rate`, paid to Raydium. The docs describe the global rule as "trade fee is 1%" ([PlatformConfig](https://docs.raydium.io/products/launchlab/platform-config.md)).
  - **Platform** `fee_rate`, paid to the third-party launchpad. **Capped at 500 bps since 2026-08-26.** It was 100 bps originally, and the update cap was 250 bps from 2026-01-27 ([changelog](https://docs.raydium.io/reference/changelog/2026-08-26-launchlab-platform-fee-rate-cap.md)).
  - **Creator** `creator_fee_rate`, **capped at 50 bps**.
  - **Referral** `share_fee_rate`, capped at 100 bps and paid directly to the referrer. The UI referral is 0.1% ([referral page](https://docs.raydium.io/user-flows/earn-referral-fees-launchlab.md)).
- **Graduation:**
  - JustSendit mode graduates at a fixed **85 SOL**. Custom mode needs ≥ **24 SOL**, with 51–80% of supply on the curve ([creating a token](https://docs.raydium.io/user-flows/creating-a-launchlab-token.md)).
  - The flat `migrate_fee` in the global config is set by the admin. I found no published current value, so it is **UNVERIFIABLE** ([GlobalConfig](https://docs.raydium.io/products/launchlab/global-config.md)).
  - Since 2026-08-17, every launch migrates to **CPMM**. The platform-plus-creator LP share is locked as one **platform-owned Fee Key NFT**, and the rest of the LP is burned. The creator keeps only the CPMM creator fee ([creator fees](https://docs.raydium.io/user-flows/how-creator-fees-work.md)).
- **Why this matters for us:** any third party can register a **Platform PDA** and earn a program-enforced platform fee plus a post-graduation LP-fee share ([platforms](https://docs.raydium.io/user-flows/launchlab-platforms.md)). This is how LetsBonk works.
- **Revenue:** DefiLlama "BONK.fun" **$15.6M trailing 1y**, $2.16M last 30d (pulled 2026-09-19). DefiLlama had no separate `raydium-launchlab` entry.

### Meteora Dynamic Bonding Curve (DBC; used by Believe and others)

[DBC fees](https://docs.meteora.ag/core-products/dbc/fees/overview.md) (retrieved 2026-09-19, undated page):
- The base fee is at least **0.25%** and the total fee is capped at 99%.
- The **protocol takes 20%** of the total trading fee, and a referral takes 20% *of the protocol share*.
- The remaining 80% goes to the **partner (launchpad)**, with a configurable creator split.
- Partners can also set a **pool creation fee** and a **migration fee**.
- A fixed **0.2% protocol liquidity migration fee** is taken at graduation to DAMM v2.

### Four.meme (BNB Chain)

[Four.meme gitbook, "How it works"](https://four-meme.gitbook.io/four.meme/guide/how-it-works) (undated; retrieved 2026-09-19):
- Launch costs only gas, about 0.005 BNB.
- Trading fee is **1%**, minimum 0.001 BNB.
- Graduation is at **~18 BNB**, when 20% of supply plus the raised BNB are paired on PancakeSwap.
- Revenue: DefiLlama "four.meme" **$83.3M trailing 1y**, but only $0.24M in the last 30d (pulled 2026-09-19), so activity has collapsed from its peak.

### Clanker (Base)

[Clanker docs, "Creator rewards & fees"](https://clanker.gitbook.io/clanker-documentation/general/creator-rewards-and-fees) (undated):
- Pools are Uniswap pools with a creator fee of **1%, 2% or 3%**.
- Clanker takes **20% of LP fees on top**, so total swaps cost 1.2% / 2.4% / 3.6%.
- v4 adds static and dynamic fee hooks and an MEV "descending fee" of up to 80% that decays over at most 2 minutes ([v4 contracts](https://clanker.gitbook.io/documentation/references/core-contracts/v4)).
- Revenue: DefiLlama **$8.7M trailing 1y**, $55k in the last 30d.

### Design patterns (summary)

1. **Free or near-free launch.** Every one of the four charges roughly zero to create a coin. Revenue comes from **volume**, not launches.
2. **The bonding curve is the market maker.** A virtual-reserve x·y=k curve gives instant liquidity with nobody seeding it. The platform takes ~1% of every buy *and* sell.
3. **Graduation to an AMM at a fixed raise** (85 SOL on pump.fun and Raydium JustSendit; ~18 BNB on Four.meme). The LP is burned or locked, and the platform increasingly keeps the locked-LP fee rights (Raydium since 2026-08-17; pump.fun migrates to its own AMM).
4. **Three-way fee split: platform / creator / LP.** Creator fees are now standard (pump.fun since 2025-05). The trend is to **taper fees as market cap grows** (pump.fun) and to **let third-party launchpads plug into shared rails** (LaunchLab platforms, Meteora DBC partners).
5. **Anti-sniper fee schedules**: high early fees that decay (Clanker MEV module, Meteora fee scheduler and rate limiter).

---

## Q2. How a launchpad can enforce fees on a chain with no smart contracts

### What Zcash actually offers at the transaction layer

- **Transparent partial signing exists.** ZIP 244 keeps the legacy sighash types for transparent inputs: `SIGHASH_ALL/NONE/SINGLE`, each "with or without the SIGHASH_ANYONECANPAY flag". For Sapling spends and Orchard actions, `hash_type` is **always `SIGHASH_ALL`** ([ZIP 244](https://zips.z.cash/zip-0244)).
  - In practice, a seller can sign "my transparent token UTXO may be spent only if output #i pays me X" and let the buyer add the funding inputs and outputs. That is the Ordinals/UniSat PSBT listing model.
  - **(analysis)** A shielded note cannot be listed this way. The buyer *could* fund from shielded inputs, because their `SIGHASH_ALL` signature over the whole transaction is added last. The token itself must still sit on a transparent output.
- **PCZT** (Partially Created Zcash Transaction, [ZIP 374](https://zips.z.cash/zip-0374), **Draft**, created 2024-12-09; Rust crate [`pczt`](https://docs.rs/pczt/latest/pczt/)) splits transaction construction into BIP-174/370-style roles and covers the transparent, Sapling and Orchard pools. It is a **coordination format**. It does not add covenants or new sighash types, so it doesn't give you a trustless one-sided curve by itself. ZecPad calls PCZT atomic swaps its "trustless endgame", not something that exists today ([ZecPad forum post, 2026-06-05](https://forum.zcashcommunity.com/t/zecpad-a-privacy-first-bonding-curve-launchpad-for-zcash/56029)).
- **Native assets are not live.** [ZIP 226](https://zips.z.cash/zip-0226) (ZSA transfer and burn) has status **Draft**.
- **Network fee floor:** [ZIP 317](https://zips.z.cash/zip-0317) sets 5,000 zatoshis per logical action, with a minimum of 2 actions (10,000 zats = 0.0001 ZEC for a simple send).

### How inscription ecosystems handled fees

**Bitcoin: BRC-20, Runes, Ordinals**
- **Marketplace fees on PSBT listings.**
  - UniSat's marketplace is "Powered by PSBT" ([UniSat docs](https://docs.unisat.io/llms-full.txt)).
  - UniSat's fees ([fee rates page](https://docs.unisat.io/products/more-products/unisat-marketplace/unisat-marketplace-fee-rates.md), undated, retrieved 2026-09-19):
    - BRC-20 / Runes / Names: **0.5%**, or 0% with ≥500 UniSat Points. No fee under 500k sats.
    - Alkanes: **1.2% buy-side**.
  - Magic Eden Ordinals: **2%**. This is **secondary** ([Spark comparison](https://www.spark.money/tools/bitcoin-ordinals-marketplace-comparison), [CoinLedger](https://coinledger.io/learn/magic-eden-guide)); I did not confirm it on an official Magic Eden fee page.
  - **(analysis)** The seller's `SINGLE|ANYONECANPAY` signature commits only to the seller's input and payout output. The marketplace's fee output is added on the buy side, so the fee holds only while the **signed listing stays private to the marketplace**. Anyone holding the signed listing can fill it without paying the fee.
- **Indexer or sequencer-enforced modules.** UniSat's **brc20-swap** is an AMM with LP "service fees" that runs as a BRC-20 "module". A new module starts as a **"black module"** that other indexers treat as a black box, and users can't freely withdraw from it. It becomes a "white module" only when the main indexers (named as Alex, Domo, Hiro, OKX, UniSat) choose to implement it. UniSat runs a **sequencer** that rolls module operations up into inscriptions ([Technical Q&A](https://docs.unisat.io/fractal-bitcoin/inswap-on-fractal/brc20-swap-introduction/technical-q-and-a.md), [Modules & decentralization](https://docs.unisat.io/fractal-bitcoin/inswap-on-fractal/brc20-swap-introduction/modules-unwrapping-and-decentralization-of-brc-20.md)). UniSat's own FAQ is explicit that an indexer which doesn't follow the majority "is risking being orphaned".
  - **(analysis)** Fees inside a module are enforceable because one operator's sequencer *is* the module. That makes it effectively custodial until other indexers adopt the module.
  - I did not find the exact brc20-swap fee rate in the docs, so it is **UNVERIFIABLE**.
- **Protocol-level fees: Runes and core BRC-20 have none.** In this research I found **no widely adopted Bitcoin inscription protocol where the indexer makes a platform payment a condition of mint validity**. Treat that as "not found", not "doesn't exist".

**Dogecoin DRC-20 and Litecoin LTC-20.** These follow the same model: PSBT-style marketplaces, with Doggy Market the main DRC-20 venue. Doggy Market says it charges only "a small commission" on buys and sells; the percentage is **UNVERIFIABLE** ([doginals.academy guide](https://docs.doginals.academy/eng/beginner-guide/how-to-buy-drc-20-tokens/doggy.market-guide)). I did not research Litecoin in depth.

**Zcash's own inscription ecosystem (as of 2026-09-19)**

- **zcash.ink** is a marketplace for zOrdinals, ZRC-20 and ZRC-721, with inscriptions in OP_RETURN envelopes on the transparent pool ([homepage and FAQ](https://zcash.ink/), [docs](https://zcash.ink/docs)).
  - Fees: **2% buyer fee**, and a **0.025 ZEC** "system fee" to publish a ZRC-721 collection.
  - A listing is an on-chain `ls` envelope with a price and payout address. The **indexer** marks a buy valid only if the tx pays the seller the asking price, and "the fee is an output in the purchase transaction, so the sale only settles when both the seller and the fee are actually paid."
  - **This is exactly the "indexer-enforced payment" mechanism, live on Zcash.**
  - Its public counters rendered as "—"/0 when fetched, so volume is **UNVERIFIABLE**.
- **Zerdinals / ZRunes market (zrunes.io, "Bitcoin Universe")** ([docs repo](https://github.com/bitcoinuniverseio/docs-zerdinals-and-zrunes), updated 2026-09-19):
  - **Listings:** a listing is a seller signature using ZIP-244 `SINGLE|ANYONECANPAY`. It is "a public offer. Anyone can settle it at the signed terms." Lot asks are **whole-lot only, with no partial fills, bids or auctions** ([buying and selling](https://github.com/bitcoinuniverseio/docs-zerdinals-and-zrunes/blob/main/src/content/docs/market/buying-and-selling.md), [orders v2/v3](https://github.com/bitcoinuniverseio/docs-zerdinals-and-zrunes/blob/main/src/content/docs/protocols/zmarket-orders-v2.md)).
  - **Fees** ([fees page](https://github.com/bitcoinuniverseio/docs-zerdinals-and-zrunes/blob/main/src/content/docs/create/fees.md)):
    - A **0.003 ZEC** service fee per inscription, etch or mint invoice.
    - A **15% commission on Creator Launchpad primary sales**. It was settled once on **testnet** on 2026-09-18, and "none of this is deployed on Zcash mainnet."
  - **Status:** the docs say a production inspection on 2026-09-17 found an older release and that "production marketplace qualification remains incomplete".
- **Zecscriptions** ([zecscriptions.com](https://www.zecscriptions.com/)) calls itself a ZRC-20 "launchpad and marketplace". "There are no protocol fees on deployment" (about 0.0001 ZEC network fee). It works on transparent t1 addresses only. The site says it has a marketplace but doesn't explain how trades settle, and its counters showed 0 when fetched, so activity is **UNVERIFIABLE**.
- **ZRC-20 already has competing indexers.** Two readers disagree on ticker length and on partial mints, so holder counts differ (e.g. 435 vs 408). Most importantly: "One reader's version 2 protocol requires a mint to pay three specific outputs. No activation height for that version is on record … **Neither reading applies it.**" ([ZRC-20, and its two readings](https://github.com/bitcoinuniverseio/docs-zerdinals-and-zrunes/blob/main/src/content/docs/understand/zrc-20.md)). **This is real evidence that a mint-fee rule written into an indexer gets dropped by third-party indexers.**
- **ZEC Market** is not a token market. It is a P2P goods marketplace, but it is the most relevant **shielded fee precedent** ([forum, 2026-09-03 update](https://forum.zcashcommunity.com/t/zec-market-a-private-non-custodial-marketplace-built-on-zcash/57200)):
  - Optional **2-of-3 escrow with keys generated in-browser** (buyer, seller, mediator; the platform holds no key).
  - Release settles "in one shielded transaction". The seller is paid, the mediator fee and the **$5 flat platform fee** are taken together, and it has been run end-to-end on mainnet.
  - Direct trades are 0%.
  - **(analysis)** The platform fee is enforced only because the buyer and seller agree to sign a transaction that includes it. They could co-sign a transaction without it, so the fee is enforced by the UI and by convention.

### Mechanism-by-mechanism assessment

1. **Indexer-enforced protocol rules** (e.g. "a mint or buy is valid only if the tx pays X to address Y").
   - **Is it done anywhere?** Yes, on Zcash: zcash.ink's buy-validity rule, and one ZRC-20 reader's v2 mint rule.
   - **Does it survive a fork?** Only socially. Anyone can run an indexer that drops the rule. For an **existing** ticker, a fork changes balances, so holders must pick a ledger; the original usually wins by incumbency. For a **new** ticker, a competitor can simply launch a fee-free clone standard. ZRC-20's v2 mint-fee rule was ignored in practice.
   - **Zcash-specific catch (analysis):** the payment must be to a **transparent** address for independent indexers to verify it. A shielded fee payment can be verified only by holders of the viewing key, which breaks "same chain → same state". ZPAD-20 settles "against the reserve's viewing key", which trades independent verifiability for privacy ([ZecPad update 2026-06-15](https://forum.zcashcommunity.com/t/zecpad-a-privacy-first-bonding-curve-launchpad-for-zcash/56029)).
2. **PSBT-style atomic listings** (transparent `SINGLE|ANYONECANPAY`).
   - **Works on Zcash transparent today** (ZIP 244; Zerdinals v2/v3 lot asks).
   - The marketplace fee is **not** covered by the seller's signature, so it is enforced only while listings are private or while your UI is where buyers come.
   - Zerdinals publishes listings as public offers, so any competitor can fill them fee-free.
   - Shielded tokens can't be listed this way.
3. **Marketplace or frontend fees** (a fee only on trades through our UI).
   - **Always possible.** Enforcement is purely commercial: liquidity, UX and wallet support.
   - **Bypass:** trivial. Direct inscription transfers, OTC, or a competitor UI reading the same chain.
   - Note that ZRC-20 transfers are two-step (inscribe the transfer, then spend the UTXO). Zecscriptions warns that ordinary wallets can burn tokens by spending the wrong UTXO ([FAQ](https://www.zecscriptions.com/)). That friction pushes users toward specialist UIs, which helps UI-fee capture.
4. **Deploy or launch fees in ZEC.**
   - Enforceable if **our UI or our indexer** requires it: for example "deploy valid only if it pays 0.1 ZEC to Y", or a service fee on an invoice, as Zerdinals charges 0.003 ZEC.
   - **Bypass:** a deployer can inscribe the same JSON with a free tool, as Zecscriptions advertises "no protocol fees on deployment".
   - The market norm on Solana, Base and BNB is ~free launches, so a meaningful deploy fee is a competitive disadvantage.
5. **Operator as counterparty** (run the curve or primary sale, deliver the tokens).
   - The strongest enforcement on Zcash today. The operator receives ZEC, computes the curve price off-chain, and delivers the tokens, keeping the fee.
   - ZecPad's MVP does this ("curve-reserve holds ZEC … semi-custodial, reserve transparent = proof-of-reserves"). So does the Zerdinals launchpad (15% of primary proceeds, deducted before paying the creator).
   - **Bypass:** only by trading *around* the curve on the secondary market.
   - **Cost:** custody risk, trust, and likely regulatory exposure.
6. **Fees on the Solana side** (the meme is bridged or dual-chain).
   - **Program-enforced and not bypassable** for trades on that curve or pool.
   - As a Raydium LaunchLab Platform: up to 500 bps platform fee plus a locked-LP Fee Key (from 2026-08-17). As a Meteora DBC partner: 80% of the non-protocol fee minus the creator split.
   - Traders can still use other venues after graduation, and an SPL token can be pooled on any AMM.
7. **Bridge mint/redeem fees** (if we issue the Zcash representation of a Solana token).
   - Enforceable, because the bridge operator or quorum authorises every issuance and redemption, so the fee is deducted at the crossing.
   - **Bypass:** holders who never cross pay nothing. Fees scale with bridge flow, not trading volume.

### Fee-mechanism table

| Mechanism | How it's enforced | Can it be bypassed? | Works on Zcash today? |
|---|---|---|---|
| Smart-contract curve fee (pump.fun, LaunchLab, DBC) | Program code; every trade pays | No, for trades on that curve or pool | **No.** No VM; ZSAs are Draft |
| Operator-run curve / primary sale (custodial reserve) | Operator receives ZEC and delivers the tokens, net of fee | Only by trading on the secondary market instead | **Yes.** Zerdinals 15% launch commission (testnet); ZecPad design (not public) |
| Indexer-enforced payment rule (mint/buy valid only if the tx pays fee address) | Our indexer's ruleset defines what is valid | Yes, by forking the indexer or cloning the standard. ZRC-20's v2 mint-fee rule is ignored by both third-party readings | **Yes, transparent pool only.** zcash.ink 2% buy fee is live in its ruleset |
| PSBT-style listing (`SINGLE\|ANYONECANPAY`) + marketplace fee output | Buy-side tx builder adds the fee; indexer may require it | Yes, if listings are public (Zerdinals: "anyone can settle it") | **Yes, transparent only** (ZIP 244); not for shielded notes |
| Frontend / UI fee | Commercial: users choose our UI | Yes: direct transfer, OTC, competitor UI | Yes |
| Deploy/launch fee in ZEC | Our UI or indexer rule | Yes: free inscription tools; market norm is free launches | Yes |
| Shielded escrow with fee in the settlement tx (FROST 2-of-3) | Parties co-sign a tx that includes the fee | Yes, parties can co-sign without it | Yes (ZEC Market, $5 flat, mainnet) |
| Solana-side platform fee (LaunchLab Platform / DBC partner) | Solana program | No, for trades on that curve; yes after graduation on other AMMs | N/A (Solana). **Live** |
| Bridge mint/redeem fee | Bridge operator or quorum authorises issuance | Only by not crossing | Possible via an app-layer token; no production Solana↔Zcash token bridge found |

---

## Q3. Competitors on Zcash

| Project | What it is | Status (2026-09-19) | Fees | Source |
|---|---|---|---|---|
| **ZecPad / ZPAD-20** | pump.fun-style bonding-curve launchpad. Off-chain pricing engine, on-chain settlement, semi-custodial ZEC reserve, shielded-memo trade intents (ZIP-321). Creator allocation capped at 5%. Pivoting toward a "private market layer" with NVDA/AAPL/gold-linked markets | **Not publicly available**: the site shows "TOO SOON" (secondary). Testnet only. No completed audit. ZCG **rejected** the $24k ZPAD-20 grant on 2026-06-24. Graduation mechanics are unpublished ("We'll share the exact graduation/liquidity mechanics as we get closer to the ZSA implementation", 2026-09-18) | Unpublished. "Application-level fees belong to the application layer" | [Forum thread](https://forum.zcashcommunity.com/t/zecpad-a-privacy-first-bonding-curve-launchpad-for-zcash/56029), [grant thread](https://forum.zcashcommunity.com/t/grant-application-zpad-20-open-asset-indexing-discovery-infrastructure-for-zcash/56114), [spec repo](https://github.com/tufanaydinn/zpad-20), secondary: [DEV.to](https://dev.to/zecpad/building-a-privacy-first-market-layer-on-zcash-what-zecpad-is-testing-before-launch-6a6) |
| **Zecscriptions** | ZRC-20 "launchpad and marketplace", in-browser t1 wallet | Claims "live on Zcash mainnet". Counters showed 0 when fetched; volume UNVERIFIABLE | No protocol fee on deploy (~0.0001 ZEC network fee); marketplace fee not published | [zecscriptions.com](https://www.zecscriptions.com/) |
| **zcash.ink** | zOrdinals / ZRC-20 / ZRC-721 marketplace and launchpad. Indexer-validated buys | Live site; indexed counters not rendered; volume UNVERIFIABLE | **2% buyer fee**; 0.025 ZEC per collection | [zcash.ink](https://zcash.ink/), [docs](https://zcash.ink/docs) |
| **Zerdinals / ZRunes (zrunes.io)** | Zerdinals inscriptions, ZRunes, ZRC-20 (both rulesets), ZRC-721. `SINGLE\|ANYONECANPAY` listing market; creator launchpad | Market "production qualification remains incomplete" (2026-09-17). Launch commission is testnet only | 0.003 ZEC service fee per invoice; **15% primary-sale commission** (not on mainnet) | [docs repo](https://github.com/bitcoinuniverseio/docs-zerdinals-and-zrunes) |
| **Zinc** | "Zcash Inscription Protocol" | zinc.is returned 404 on 2026-09-19. It is mentioned alongside Zecscriptions and Zerdinals by ZecPad. UNVERIFIABLE | — | [ZecPad post](https://forum.zcashcommunity.com/t/zecpad-a-privacy-first-bonding-curve-launchpad-for-zcash/56029) |
| **zatoshi.market** (former) | ZRC-20 marketplace, Nov 2025 to ~Mar 2026 | Defunct. **Third-party audit** alleges its transfer/mint flows sent users' raw WIF keys to its server; community reports of drains on 2026-06-22 are "consistent with, but not proven by" the finding | — | [hieusats/zatoshi-market-key-exposure](https://github.com/hieusats/zatoshi-market-key-exposure) (third-party) |
| Other search leads (zebra.family, zecinscriptions.xyz) | NFT/inscription sites | Not investigated. UNVERIFIABLE | — | Search results only |

**Is there a Zcash DEX?** Not for tokens. What exists is **cross-chain ZEC swapping**:
- **NEAR Intents** and **Maya Protocol**, exposed through SwapKit. At launch the SwapKit integration supported transparent addresses only ([SwapKit blog](https://swapkit.dev/blog/swapkit-zcash-integration/)). Zashi integrated NEAR Intents for swaps in Oct 2025 (**secondary**: [CoinDesk](https://www.coindesk.com/markets/2025/10/09/near-intents-activity-spikes-as-zcash-s-zashi-wallet-taps-it-for-private-swaps)).
- **Zwap**, early access since 2026-05-27: trustless Orchard-native ZEC↔ETH/USDC atomic swaps on Ethereum and Base ([forum](https://forum.zcashcommunity.com/t/zwap-trustless-shielded-atomic-swaps-for-zcash-early-access/55874)).

None of these trade ZRC-20 or other app-layer tokens, and none has an AMM for them.

**So how is a Zcash meme traded today?**
1. Whole-lot signed listings, transparent and PSBT-style, on zcash.ink or the Zerdinals market.
2. Direct inscription transfers after an OTC deal, trusting each other or a mediator.
3. An operator-run curve with a custodial reserve (ZecPad's design, not public).

There is **no continuous two-sided market and no partial fills** (Zerdinals: "This change does not open partial fills, bids, or auctions").

---

## Q4. The "trading" problem, with a worked example

On Solana, a launchpad's revenue is its fee % × curve and AMM volume, and the program guarantees both. On Zcash there is no
AMM, so "volume" happens in only three places:
- **(a)** the primary sale or curve that *we* run;
- **(b)** secondary whole-lot listings on whichever marketplace the buyer uses;
- **(c)** off-market: OTC deals and direct transfers.

Only (a) is structurally ours.

### Worked example: 1,000 buyers, average buy 0.5 ZEC

Inputs and assumptions:
- ZEC = **$1,471.19** ([CoinGecko API](https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd), 2026-09-19).
- Primary volume = 1,000 × 0.5 = **500 ZEC ≈ $735,600**.
- **(assumption)** Secondary volume after launch = 2× primary = **1,000 ZEC**, and 300 of the buyers later sell 0.4 ZEC each back into the curve (120 ZEC).
- Our fee parameters are **our choices**, benchmarked to the market: 1% curve fee (pump.fun protocol 0.95%, LaunchLab 1%), 2% marketplace fee (zcash.ink), 0.1 ZEC deploy fee.

| # | Mechanism | Fee base | Rate | Fee earned | Can we actually collect it? |
|---|---|---|---|---|---|
| 1 | Deploy fee | 1 launch | 0.1 ZEC | **0.1 ZEC** | Yes, if deploy happens in our UI. A clone can deploy free elsewhere |
| 2 | Operator-run curve, buys | 500 ZEC | 1% | **5.0 ZEC** | **Yes, fully.** We are the counterparty. Custodial |
| 2b | Operator-run curve, sells back | 120 ZEC | 1% | **1.2 ZEC** | Yes, fully (same caveat) |
| 3 | *Alternative to 2:* indexer-enforced fair-mint fee (mint valid only if the tx pays 1% to our t-addr) | 500 ZEC | 1% | **5.0 ZEC** | Yes, while our ruleset is the accepted reading. Transparent only. A fork can drop it (the ZRC-20 v2 precedent) |
| 4 | Secondary marketplace fee, 100% of trades via our UI | 1,000 ZEC | 2% | 20 ZEC | Best case; unrealistic |
| 4' | Secondary, 50% via our UI | 500 ZEC | 2% | **10 ZEC** | Plausible if we are *the* venue |
| 4'' | Secondary, public listings filled by a 0% competitor, or OTC | — | — | **0 ZEC** | What happens if a fee-free UI appears |
| 5 | Solana side: the same 1,000 buyers on Solana through our LaunchLab Platform | $735,600 | 1% platform fee (cap 5%) | **~$7,356 (≈5 ZEC)** | **Yes, program-enforced.** Plus a locked-LP Fee Key after graduation |
| 6 | Bridge fee: 20% of Solana volume bridges to Zcash | $147,100 | 0.5% | ~$736 (≈0.5 ZEC) | Yes at the crossing; zero for holders who never cross |
| — | Zcash network fees (ZIP 317, ~0.0001–0.0004 ZEC × ~1,000 txs) | — | — | ~0.1–0.4 ZEC | Paid by users to miners. **Not ours** |
| — | Reference: pump.fun on the same 500 ZEC-equivalent curve volume | 500 ZEC eq | 0.95% protocol + 0.30% creator | 4.75 + 1.5 ZEC eq | Program-enforced |
| — | Reference: Zerdinals-style 15% primary commission on 500 ZEC | 500 ZEC | 15% | 75 ZEC | Enforced by delivery, but a 15% take is NFT-drop pricing, not memecoin pricing |

**Reading the table (analysis):**
- **Reliable Zcash-side revenue for this launch is about 5–6 ZEC (~$7–9k)**, from rows 1 + 2 + 2b, or from row 3 in place of row 2. That is roughly what pump.fun earns on equivalent curve volume. It needs either custody (row 2) or indexer social consensus (row 3).
- Secondary revenue (row 4) could exceed primary revenue, but it is **not enforceable**. It depends on owning the dominant UI and on keeping signed listings private. Because the ZIP-244 listing model doesn't bind the marketplace fee, a 0% competitor can fill our public listings.
- The Solana side (row 5) is the only trustless, ongoing fee stream available now, and running as a LaunchLab Platform needs no custom smart contract.
- There are also throughput limits. Zcash blocks are ~75s (Zecscriptions states "Confirmation ~75s"), and each on-chain curve trade is a separate transaction. A 1,000-buyer launch settling on-chain is feasible, but it will not feel like pump.fun's sub-second fills unless the curve runs off-chain with on-chain settlement, which is ZecPad's model.

---

## Q5. Regulatory and practical flags

- **EU AMLR (Regulation (EU) 2024/1624).** Article 79 prohibits credit institutions, financial institutions and **crypto-asset service providers** from keeping accounts that allow "the anonymisation or increased obfuscation of transactions, including through anonymity-enhancing coins". It applies from **10 July 2027**, and self-hosted wallet software providers are carved out in recital 160 ([EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1624)).
  - **(analysis)** Expect EU exchange liquidity for ZEC to shrink before that date, or to move to transparent-only deposits (secondary commentary: [CryptoTicker](https://cryptoticker.io/en/privacy-coins-eu-amlr-delisting/)).
  - An operator that holds users' ZEC in a curve reserve (mechanism 2) is performing custody, so get legal advice before running it for EU users. I did not research licensing, so this is **UNVERIFIABLE**.
- **ZEC liquidity is currently large.** 24h volume was ~$1.34B at $1,471/ZEC on 2026-09-19 ([CoinGecko API](https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_24hr_vol=true)), so ZEC itself is not the liquidity bottleneck. Token-market plumbing is.
- **Token privacy is weaker than the "shielded asset" framing suggests.** Every live Zcash token protocol is **transparent-pool only**. Moving an inscription into the shielded pool breaks or burns it ([zcash.ink FAQ](https://zcash.ink/); Zerdinals: "An inscription spent into a shielded pool is untrackable forever").
- **Trust is the scarce resource.** A published third-party audit alleges the former ZRC-20 marketplace zatoshi.market sent raw private keys to its server ([audit repo](https://github.com/hieusats/zatoshi-market-key-exposure)). Any launchpad here that asks users to import keys, or that holds a reserve, will be judged against that incident.
- **Geo-blocking.** pump.fun's docs site redirected to a `/blocked` page from this research location, a reminder that leading launchpads geofence.

---

## Sources (primary unless marked)

- pump.fun official docs repo: https://github.com/pump-fun/pump-public-docs (fee tiers `docs/fees.png`, `FEE_PROGRAM_README.md`, `PUMP_PROGRAM_README.md`, `PUMP_CREATOR_FEE_README.md`, `PUMP_SWAP_README.md`, `HOLDER_REWARDS_README.md`)
- DefiLlama fees/revenue API: https://api.llama.fi/summary/fees/pump, `/pump.fun`, `/pumpswap`, `/bonk.fun`, `/four.meme`, `/clanker` (pulled 2026-09-19)
- Raydium docs index: https://docs.raydium.io/llms.txt, and the LaunchLab pages linked above
- Meteora DBC fees: https://docs.meteora.ag/core-products/dbc/fees/overview.md
- Four.meme: https://four-meme.gitbook.io/four.meme/guide/how-it-works
- Clanker: https://clanker.gitbook.io/clanker-documentation/general/creator-rewards-and-fees
- UniSat: https://docs.unisat.io/products/more-products/unisat-marketplace/unisat-marketplace-fee-rates.md and the brc20-swap pages
- ZIPs: https://zips.z.cash/zip-0244, https://zips.z.cash/zip-0374, https://zips.z.cash/zip-0226, https://zips.z.cash/zip-0317
- Zcash forum: ZecPad (t/56029), ZPAD-20 grant (t/56114), ZEC Market (t/57200), Zwap (t/55874)
- zcash.ink: https://zcash.ink/ and /docs
- Zerdinals/ZRunes docs: https://github.com/bitcoinuniverseio/docs-zerdinals-and-zrunes
- Zecscriptions: https://www.zecscriptions.com/
- ZRC-20 spec: https://zatoshi.gitbook.io/zrc/20.md
- EU AMLR: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1624
- Secondary (leads and figures only): Brave New Coin (pump.fun fee sharing), CoinDesk (Zashi × NEAR Intents), Spark and CoinLedger (Magic Eden 2%), CryptoTicker (AMLR commentary), DEV.to (ZecPad status)
