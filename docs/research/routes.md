# Routes research: cross-chain and alternative ways to a private meme connected to Zcash

Researched 2026-09-19. Every link below was fetched on that date unless a different date is noted. Read-only
checks (public Solana RPC, THORNode and MAYANode REST, the NEAR Intents token API, the GitHub API) were used to
confirm "is it live" claims. No keys, wallets or transactions were involved.

## TL;DR

- **ZecShield is real, was rejected, and is mostly unbuilt.** It was a ZCG application filed 2026-04-03 and
  declined 2026-04-13. The published minutes quote reviewers on signer trust, vault and liquidity management, and
  FROST's n² message cost. The public repo is one 10 KB Anchor program with 3 commits. That program escrows
  **native SOL, not SPL tokens**. It has **no release or unshield instruction, no FROST code and no Zcash-side
  code**, and its refund can double-pay (see Q1).
- **Every live ZEC cross-chain route moves ZEC only.** This covers NEAR Intents and Zodl/Zashi swaps (Zcash leg is
  transparent-only, custody via a Proof-of-Authority bridge), zenZEC and NEAR-bridged ZEC on Solana, and Maya.
  None carries a non-ZEC asset *into* Zcash. The NEAR Intents token API lists exactly one asset on the `zec`
  chain: ZEC.
- **Two live-status corrections.** Maya has been **globally halted since the 2026-08-18 exploit**
  (`HALTCHAINGLOBAL=1` on its node today). THORChain **still has no ZEC pool or inbound address** as of today,
  even though v3.20 shipped in August.
- **Nothing brings a foreign asset into Zcash's shielded pool with consensus backing.** ZIP 226 (Draft) says "none
  of the currently deployed Zcash transfer protocols support Custom Assets." The only attempt was Zecboat's
  "wSOL", a ZCG application also declined 2026-04-13. It was a 1-SOL live test that went to an ordinary keypair
  wallet, not a program escrow. Its bridge page now returns 404.
- **The protocol changed under everyone's feet.** NU6.3 "Ironwood" activated 2026-07-28 (block 3,428,143). The
  **Orchard pool can no longer receive value and cross-address Orchard transfers are disabled.** Any design,
  ChatGPT's and ZecShield's included, that says "shielded in the Orchard pool" is out of date. Ironwood does not
  add ZSA either.
- **The one thing that is shielded, on Zcash mainnet, and working today** is a *memo-tagged ZEC note* ("overlay
  asset"), as Zecboat does with issuer-signed collections plus per-output disclosures. Zecboat's own docs say
  plainly that it **cannot enforce supply**: anyone can copy a memo and holders can split notes. That makes it
  fine for NFT-style collectibles and wrong for a fungible memecoin.
- **Adjacent privacy chains are real but not Zcash-connected.** Namada (MASP, drained ~$600K on 2026-06-19),
  Aztec, Aleo and Secret all run live private tokens, and none has a ZEC route. Penumbra Labs is winding down.
  Ztarknet (the "Zcash L2") has had no commits since 2025-12 and needs TZEs, which are not activated.
- **A Solana→Zcash bridge without ZSA is a custodian plus an indexer, not a bridge.** "Zcash minted ≤ Solana
  locked" is enforced only by the honesty of whoever holds the issuer and escrow keys. Without published viewing
  keys, nobody can even *observe* the shielded supply (worked example in Q6).

---

## Q1. ZecShield

**Verdict: CONFIRMED on existence, rejection and reviewer concerns. PARTLY TRUE on "already implemented".**

### Evidence

- **Forum thread:** [Grant Application – ZecShield: Universal Privacy Bridge between Solana and Zcash](https://forum.zcashcommunity.com/t/grant-application-zecshield-universal-privacy-bridge-between-solana-and-zcash/55232).
  - Author Andrii Dumitro (`andreudumitro-eng`), posted 2026-04-03. Asked for $48,000 over 8 months (May–Dec 2026).
  - Pitch: "any SPL token to be shielded in Zcash's Orchard pool using FROST threshold signatures (3-of-5) with
    economic bonds", with a 1,000 ZEC bond per signer.
  - In the same post the author retreats to an MVP with **one centralized off-chain relayer** plus a
    time-delayed refund, stating: "This initial version does not include a validator set or threshold
    cryptography (e.g., FROST)."
- **Rejection:** the ZCG account posted on 2026-04-13 that the committee "decided not to move forward". The
  applicant replied the same day that they already had "a fully written and compiled Solana contract", "a
  detailed specification", "a working deposit and refund mechanism" and "a ready 3-of-5 FROST architecture".
- **Reviewer reasoning:** [ZCG Meeting Minutes 4/13/2026](https://forum.zcashcommunity.com/t/zcash-community-grants-meeting-minutes-4-13-2026/55349), posted 2026-04-14. ZecShield is marked **Declined**.
  - **Hanh** (the FROST scalability and vault concerns), verbatim excerpts: "there's a concern about the
    scalability of the FROST protocol which is n square of signers … if we are to the scale of 20-50 signers it
    becomes very hard to run the FROST completely … in order to observe the fairness of the system we need a way
    to decode the transactions … the team doesn't go into enough details regarding how they're going to deal with
    the vault and how they're going to manage liquidity and make sure that nobody can run away with everything."
  - **Gguy** (signer trust and governance): "very hard for ZCG to approve grants like this that have questions
    about the governance structure and safety of funds."
  - **Artkor:** "very similar to Zecboat Bridge. I have the same reasons for rejecting this one." Those reasons,
    given in the same minutes, were: "ZEC already has access to existing exchange infrastructure, cross-chain swap
    routers … FROST … does not meaningfully reduce the core custody and trust assumptions, since signer control
    remains concentrated with a team."
- **Code:** [github.com/andreudumitro-eng/shield-bridge](https://github.com/andreudumitro-eng/shield-bridge).
  - Repo created 2026-04-02, last push 2026-04-13, **3 commits** (2026-04-11 to 2026-04-13), 0 stars.
  - Files: `programs/deposit-contract/src/lib.rs` (10,474 bytes), `SPEC.md.txt` (48 KB) and README. There are
    **no tests, no orchestrator, no FROST code and no Zcash code.**

### How much is actually built

My own read of `lib.rs` at HEAD `e242c5f`:

- **SOL only, not SPL.** `deposit()` calls `system_program::transfer` on lamports into one `[b"escrow"]` PDA.
  There is no SPL token account, no mint and no `token::transfer`, so the headline "any SPL token" is not
  implemented.
- **No way out except refund.**
  - Instructions: `initialize_authority`, `update_relayer`, `pause`, `deposit`, `start_processing`,
    `confirm_shielding`, `refund`.
  - Nothing releases escrowed SOL on an unshield. Once a deposit is `Completed`, its SOL cannot leave the program,
    so the Zcash→Solana redemption path does not exist.
- **Refund can double-pay.**
  - `refund()` is allowed while the status is `Processing`, after a hard-coded `refund_delay = 3600` s.
  - If the relayer has already paid out on Zcash but has not yet called `confirm_shielding`, the user can reclaim
    the SOL as well.
  - The "grace period" described on the forum is not in the code.
- **The relayer is also the admin.** `update_relayer` and `pause` both require `admin == relayer_key`, so a single
  hot key controls everything.
- **The spec and Zcash don't match.**
  - `SPEC.md.txt` §3.1 lists "Curve ed25519 / Library frost-ed25519".
  - The ZF FROST book says the key to split for Zcash is the **Spend Authorizing Key** of Sapling or Orchard
    ([ZF FROST Book – Technical Details](https://frost.zfnd.org/zcash/technical-details.html)). Those are
    RedJubjub and RedPallas signatures ([ZcashFoundation/reddsa](https://github.com/ZcashFoundation/reddsa)), not
    Ed25519.
  - Ed25519 FROST could control the *Solana* side, but it could not sign a Zcash shielded spend.
  - The spec's "burn transaction in Orchard" and per-asset `total_shielded` accounting have no protocol-level
    meaning without ZSA (see Q3).
- **The design overlaps with Zecboat.** The spec's custom RPCs `z_listassets` / `z_viewasset` and its `"wsol"`
  examples are the same names Zecboat had published earlier
  ([Zecboat thread](https://forum.zcashcommunity.com/t/zecboat-bridge-frost-secured-wrapped-asset-wsol/55199),
  2026-04-01; [Cyber-Nomad thread](https://forum.zcashcommunity.com/t/cyber-nomad-drop-claim-your-shielded-zsa/54979),
  2026-03-26). The ZecShield author was questioning Zecboat on that thread on 2026-04-01/02. This is an
  observation only; I draw no conclusion from it.

### The sibling project ChatGPT missed: Zecboat wSOL

- **Application:** [Zecboat Bridge: FROST-Secured Wrapped Asset (wSOL)](https://forum.zcashcommunity.com/t/zecboat-bridge-frost-secured-wrapped-asset-wsol/55199).
  $99,000; also **Declined** in the same minutes (Zerodartz: "this proposal is more in the area of what ZSAs
  would do, which we know are not going live in near future").
- **Mechanism:** "ZMAP", a memo overlay on ordinary ZEC notes, run as "a curated service". All 5 FROST signers
  are operated by Zecboat.
- **Claimed live test:** a single 1-SOL lock on 2026-04-10 to Solana address
  `BPg9arZyyBCSH4KKdnL1XuR937hjotfVhmN9t8cVYKAT`. My read-only check today:
  - The account is owned by the System Program.
  - The address is **on the Ed25519 curve**, which means it is a normal private-key wallet and **not a program
    PDA or escrow**.
  - It shows 213 transactions, all between 2026-03-31 and 2026-04-01, and a current balance of 0.551 SOL.
- **Now:** `zecboat.com/bridge/wsol` returns **404**. The site has pivoted to a wallet and collectibles
  ([zecboat.com](https://zecboat.com/); v0.6.3-beta, 2026-09-07).

### What this means for the project

- There is nothing to fork. ZecShield is a spec plus a SOL-deposit toy with a double-refund bug. Zecboat's bridge
  was a 1-SOL test into a hot wallet.
- ZCG has now declined **two** Solana→Zcash wrapped-asset bridges in one meeting, for custody and trust reasons.
  Expect no grant funding for route #3 in the table below. Expect community scepticism about any "trustless"
  wording.

---

## Q2. Existing ZEC cross-chain infrastructure (as of 2026-09-19)

**Verdict: CONFIRMED that these exist. None moves non-ZEC assets into Zcash.**

| Route | What it does | Live today? | Custody / trust | Non-ZEC assets *into* Zcash? |
|---|---|---|---|---|
| **NEAR Intents** (incl. "Zolana" ZEC-on-Solana) | Swap 100+ assets ↔ ZEC; ZEC withdrawable on NEAR, Solana, Starknet, Aptos. | **Yes.** The [1Click token API](https://1click.chaindefuser.com/v0/tokens) lists `nep141:zec.omft.near` (chain `zec`) and ZEC SPL mint `A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS`. | Zcash goes through the **POA (Proof-of-Authority) Bridge** ([docs](https://docs.near-intents.org/integration/bridging/overview.md): POA supported chains "… Zcash …"). Omni/MPC covers only ETH, Base, Arb, BNB, Solana and BTC ([Omni overview](https://docs.near-intents.org/learn/omni-bridge/overview)). [Chain support](https://docs.near-intents.org/resources/chain-support) marks Zcash as "**Partially supported – Transparent addresses only**". Result: federated custody, transparent Zcash leg. | **No.** The only asset on chain `zec` is ZEC. |
| **Zodl (formerly Zashi) swaps / CrossPay** | Wallet UI over NEAR Intents: swap into ZEC, or pay from shielded ZEC with the recipient getting another coin. | Yes (launched 2025; [ECC CrossPay post](https://electriccoin.co/blog/private-cross-chain-payments-with-zashi-crosspay/), 2025-09-16). The wallet was renamed Zodl after the ECC team left ([zodl.com](https://zodl.com/zashi-is-becoming-zodl/), 2026-02-16). | Same as NEAR Intents: a transparent hop plus POA custody. A traceability issue in the integration was reported in 2025 (secondary lead: [Cryptopolitan](https://www.cryptopolitan.com/zachxbt-flags-privacy-flaw-in-zashi-wallets-near-intents-integration/)). | **No.** |
| **Maya Protocol** | Native ZEC pool; shielded inbound and outbound via trial-decryption of memos ([retro grant thread](https://forum.zcashcommunity.com/t/maya-protocol-advanced-shielded-zec-support-retroactive-grant/54593), 2026-02-06). | **HALTED.** [MAYANode mimir](https://mayanode.mayachain.info/mayachain/mimir) shows `HALTCHAINGLOBAL: 1`; every chain including ZEC reports `halted: true` on [inbound_addresses](https://mayanode.mayachain.info/mayachain/inbound_addresses). The ZEC pool still holds ~2,646 ZEC ([pools](https://mayanode.mayachain.info/mayachain/pools)). Cause: the 2026-08-18 exploit, about $1.7M (secondary: [Crowdfund Insider](https://www.crowdfundinsider.com/2026/08/299219-maya-protocol-halts-operations-after-multi-bug-exploit-drains-cacao-tokens-and-cross-chain-assets/)). Its shielded support predates NU6.3; Ironwood compatibility is UNVERIFIABLE. | TSS vault run by bonded nodes (trust-minimised, economically secured). | **No.** Swaps only. |
| **THORChain** | ZEC integration announced in April 2026; delayed by the Orchard bug; v3.20 on 2026-08-24 "lays groundwork" (secondary: [Crypto Daily](https://cryptodaily.co.uk/2026/08/thorchain-320-unlocks-native-monero-and-zcash-swaps-with-bitcoin-ethereum-and-stablecoins)). | **No ZEC yet.** A public THORNode ([thorwallet LB](https://thorchain-thornode-lb-1.thorwallet.org/thorchain/pools)) shows no `ZEC.` pool and no ZEC in `inbound_addresses` today. News saying "THORChain now supports ZEC" is **stale or overstated**. | Bonded-node TSS once live. | **No** (swaps only, when live). |
| **zenZEC (Zenrock)** | 1:1 wrapped ZEC as an SPL token on Solana. | Yes ([Zenrock blog](https://zenrocklabs.io/blog/zcash-arrives-on-solana-with-zenzec/), 2025-11-04). | "dMPC" custody. The launch post does not name the operators or the threshold, so the trust model is UNVERIFIABLE in detail. | **No.** ZEC out to Solana only. |
| **Encifher eZEC** | Re-wraps Solana ZEC into an encrypted-balance token. | Launched 2025-10 (secondary: [CoinDesk](https://www.coindesk.com/markets/2025/10/27/restoring-privacy-to-zec-on-solana-via-encifher)); current status not checked against a primary source. | Threshold decryption by Encifher's network, on top of the wrapper's custody. | **No.** |
| **Juno Intents** (Zcash-family, not Zcash) | Moves Junocash (an Orchard-only Zcash-like chain) to Base. | Whitepaper dated April 2026 ([PDF](https://junointents.com/whitepaper.pdf)); liveness UNVERIFIABLE (the site is a JS app). | Threshold DKG custody, a **published UFVK** for the bridge wallet, SP1 proofs against operator-signed checkpoints. It states outright: "threshold-operated rather than trustless." | **No.** Native coin *out*. Useful as a design reference for Q6. |
| **Chainflip** | UNVERIFIABLE. No primary source found for ZEC support. | — | — | — |

### What this means for the project

- The operator can use these routes to **get ZEC liquidity next to a meme on Solana**: zenZEC or NEAR ZEC pairs.
- None of them helps put a meme **inside** Zcash.
- The two decentralised routers are either halted (Maya) or not yet listing ZEC (THORChain). Anything that
  depends on redemption-arbitrage liveness should be designed for multi-week halts.

---

## Q3. Direction check: can anything bring a foreign asset into Zcash's shielded pool today?

**Verdict: CONFIRMED that nothing can with protocol backing. PARTLY TRUE that app-layer overlays exist (Zecboat)
but they cannot enforce supply.**

### Why nothing can

- **Consensus only knows ZEC.** [ZIP 226](https://zips.z.cash/zip-0226) (Status: **Draft**) adds an `AssetBase`
  field to notes. It says "none of the currently deployed Zcash transfer protocols support Custom Assets" and that
  ZSA is "scheduled to be deployed in Network Upgrade 7 (NU7)".
- **NU7 is not scheduled.** On the [ZIP index](https://zips.z.cash/) today, NU7 deployment exists only as the
  unnumbered `draft-arya-deploy-nu7`, and ZIP 254 (the earlier NU7 deployment) is **Withdrawn**.
- **ZSA's own spec anticipates wrapped assets.** [ZIP 227](https://zips.z.cash/zip-0227) (Draft, created
  2022-05-01, deployment "TBD") says issuance and burn "can be used … for the bridging of Assets defined on other
  chains". ChatGPT is right about the intent, but it is not live.
- **NU6.3 "Ironwood" is not ZSA.** [ZIP 258](https://zips.z.cash/zip-0258) (mainnet activation 3,428,143, which
  was 2026-07-28 per [CoinDesk](https://www.coindesk.com/tech/2026/07/28/zcash-seals-usd1-7-billion-shielded-pool-as-ironwood-upgrade-activates))
  adds a new ZEC-only pool. It also makes Orchard "only be spent from (not added to)" with "cross-address
  transfers within the Orchard pool … disabled". Migration out of Orchard goes through a turnstile using
  canonical denominations ([ZIP 318](https://zips.z.cash/zip-0318), Draft).
  - Consequence: any Orchard-based overlay asset minted before July 2026 can no longer move between people in
    Orchard.
  - Consequence: the standard migration does not describe preserving memos or odd note values, so overlay assets
    would need re-issuing in Ironwood.
  - This follows the [Orchard counterfeiting bug](https://forum.zcashcommunity.com/t/the-orchard-counterfeiting-vulnerability-and-next-steps/56015)
    disclosed on 2026-06-04.
- **The only live Zcash-native token system is transparent.** ZRC-20 "inscriptions live in Zcash's transparent
  (t-addr) pool because the inscription envelope has to be readable by every indexer"
  ([zecscriptions.com](https://www.zecscriptions.com/)).

### Why an overlay is not a real representation

With no asset field, a "foreign asset inside Zcash" can only be a ZEC note (or a transparent output) plus metadata
that an off-chain indexer agrees to interpret. Zecboat, the team that actually shipped this, writes on
[zecboat.com/shielded-assets](https://zecboat.com/shielded-assets):

> "Zcash's consensus rules do not know your asset exists — they balance ZEC, and nothing else. So the network
> cannot stop someone copying a memo, and it cannot stop a holder splitting one note into two that both look
> genuine. Making a fungible asset work would take published viewing keys, a redemption gate, an attestation
> service and a group of independent operators."

### What this means for the project

- "First shielded memecoin on Zcash" cannot mean a *consensus-backed* asset until ZSA ships.
- Before then, "on Zcash" means one of two things: a **transparent** ZRC-20 token, or a **shielded overlay whose
  supply someone must be trusted about**. The operator should say which one out loud.

---

## Q4. Shielded-asset chains adjacent to Zcash

**Verdict: PARTLY TRUE as a "better way".** Each chain gives real shielded ownership of a custom token today.
None is ZEC-paired or Zcash-connected in practice.

| Chain | Custom private tokens live? | ZEC there / Zcash bridge? | Notes |
|---|---|---|---|
| **Namada** | Yes. MASP extends Zcash Sapling to multiple assets ([docs](https://docs.namada.net/users/shielded-accounts); repo active, last push 2026-09-18 per the [GitHub API](https://github.com/namada-net/namada)). | **No.** The Zcash↔Namada "trust-minimized bridge" exists only as a 2023 plan ([RFC](https://namada.net/blog/rfc-proposal-for-a-strategic-alliance-between-namada-and-zcash); [FROST bridge proposal thread](https://forum.zcashcommunity.com/t/proposed-architecture-for-a-zcash-namada-ibc-ecosystem-ethereum-ecosystem-non-custodial-bridge-using-frost-multisignatures/42749)). No evidence it was built (UNVERIFIABLE). | ~$600K of MASP assets drained on 2026-06-19 via an IBC transfer-logic flaw (secondary: [CryptoTimes](https://www.cryptotimes.io/2026/06/20/namadas-600k-masp-drain-goes-unnoticed-as-stale-indexer-masks-the-loss/)). Closest cousin *technically* (Sapling-derived MASP). |
| **Penumbra** | Protocol was live. | No ZEC. | [Penumbra Labs](https://penumbralabs.xyz/): "winding down operations". The repo's last push was 2026-01-24. **Do not build here.** |
| **Aztec** | Mainnet rollup live; token transfers opened 2026-02-12 (secondary: [KuCoin](https://www.kucoin.com/news/flash/aztec-token-to-enable-transfers-on-february-12-2026)). | No ZEC route found. | Ethereum L2 with private state; early. |
| **Aleo** | ARC-21 token registry with private records ([ARCs](https://github.com/ProvableHQ/ARCs/discussions/124)). | No ZEC route found (NEAR Intents supports Aleo but lists no ZEC there). | Private by default. |
| **Secret** | SNIP-20 private tokens ([docs](https://docs.scrt.network/secret-network-documentation/development/development-concepts/create-your-own-snip-20-token-on-secret-network)). | No ZEC route found. | TEE-based privacy, a different trust model (hardware). |
| **Ztarknet ("Zcash L2")** | Devnet only. | Designed to settle to Zcash. | [GitHub org](https://github.com/Ztarknet) has had **no pushes since 2025-12-16**, and `ztarknet.cash` does not resolve. It depends on TZEs ([ZIP 222](https://zips.z.cash/) is Draft). **Dormant.** |
| **Junocash** | Orchard-only Zcash-style chain (per the Juno Intents whitepaper). | Is not Zcash. | Branding risk: "Zcash-like" is not "on Zcash". |

### What this means for the project

A meme on Namada or Aztec gets *real* shielded ownership today. It is not "on Zcash", it is not ZEC-paired, and
calling it "the first Zcash memecoin" would be misleading. It is a credible **privacy** product, not a credible
**Zcash** product.

---

## Q5. Hybrid routes ChatGPT did not consider

1. **A meme whose units are ZEC notes (memo overlay), the Zecboat model.**
   - **Private:** yes. Ownership and transfers are ordinary shielded ZEC transfers.
   - **Trust-minimised:** no. There are two problems.
     - Supply is enforced only by the issuer's signature and published per-output disclosures (Zecboat publishes
       an [issuance manifest, signature and disclosures](https://zecboat.com/proof-of-issuance); ZIP 311 payment
       disclosures are still Draft).
     - After issuance, a holder can copy the memo onto a second note, and a recipient cannot tell which note is
       genuine without a provenance chain that shielded transfers hide.
   - **Also:** every unit ties up real ZEC ("Backing: 10,000 Zats" per Cyber-Nomad). Standard wallets can sweep
     the note as change and destroy it. The notes must now live in Ironwood.
   - **On Zcash:** yes, as an app-layer overlay.
   - **Difficulty:** medium. It needs a custom wallet or indexer; Zecboat built one.
   - **Verdict:** a good fit for the operator's original *NFT* idea (limited, issuer-signed collectible memes).
     A bad fit for a fungible, tradable memecoin.
2. **A ZRC-20 meme with no bridge.**
   - **Private:** no. It lives in transparent t-addresses
     ([Zecscriptions](https://www.zecscriptions.com/)).
   - **Trust-minimised:** fairly. Balances follow deterministic indexer rules over public data.
   - **On Zcash:** yes, but transparent.
   - **Difficulty:** low.
   - **Verdict:** it is the "first meme on Zcash" in a technical sense, but it is not *shielded*, which undercuts
     the pitch.
3. **A Solana Token-2022 meme with confidential transfers, paired with ZEC on Solana (zenZEC or NEAR ZEC).**
   - **Live?** Confidential transfers are live on Solana mainnet again. The ZK ElGamal program was re-enabled in
     June 2026; a maintainer wrote "this is live on mainnet" on 2026-06-29; the issue was closed 2026-09-03
     ([token-2022#657](https://github.com/solana-program/token-2022/issues/657)).
   - **Private:** only amounts and balances. "Token account addresses remain public"
     ([Solana docs](https://solana.com/docs/tokens/extensions/confidential-transfer)).
   - **Trading caveat:** AMMs need plaintext balances, so trading realistically means withdrawing to the public
     balance. The docs say nothing about DEX compatibility.
   - **Trust:** Solana consensus plus the ZEC wrapper's custodian.
   - **On Zcash:** no. It is ZEC-paired, not Zcash-hosted.
   - **Difficulty:** low to medium.
   - **Verdict:** the most shippable fungible option. Honest branding would be "ZEC-paired private-balance meme",
     not "Zcash memecoin".
4. **A meme on Solana with eligibility or ownership proven via Zcash viewing keys or disclosures.** Examples:
   airdrop to proven shielded-ZEC holders, or a "claim" that requires a payment disclosure to the project's UA.
   - **Private:** the Zcash side is selectively disclosed; the meme itself is public.
   - **Trust:** you trust whoever verifies the proof off-chain. The tooling is Draft: ZIP 311, and
     `draft-str4d-orchard-balance-proof` "Air drops, Proof-of-Balance" on the [ZIP index](https://zips.z.cash/).
   - **On Zcash:** no. Zcash is the gate, not the ledger.
   - **Difficulty:** medium.
   - **Verdict:** a good *marketing and community* bridge to Zcash users. Not an asset on Zcash.
5. **A ZEC-paired meme on a private chain (Namada, Aztec).**
   - **Blocker:** no ZEC exists there (Q4), so this first needs a ZEC bridge, which is another custody layer.
   - **Verdict:** not viable now.
6. **1:1 SPL→Zcash bridge into a memo overlay (the ChatGPT plan, via ZecShield or Zecboat).**
   - **Private:** partially. The Solana deposit reveals the depositor's Zcash address on-chain; ZecShield's
     contract stores and emits `zcash_address` in plaintext.
   - **Trust-minimised:** no (see Q6).
   - **On Zcash:** as an overlay.
   - **Difficulty:** very high, with no working reference implementation. ZCG declined both attempts.

---

## Q6. Trust model of a Solana→Zcash bridge without ZSA

**Verdict: the ChatGPT invariant "Never Zcash minted > Solana locked" is desirable but not enforceable by either
chain.** Solana cannot verify Zcash, and Zcash has neither contracts nor an asset field. The invariant holds only
while a key-holding group is honest and live.

### Who enforces what

- **Solana → Zcash (mint).** A Solana program *can* trustlessly lock tokens and emit `Deposit(amount, zcash_ua)`.
  Someone must then create the Zcash-side units: memo-tagged ZEC notes, or transparent ZRC-20 mints. Zcash
  accepts any well-formed ZEC transaction. Only the **indexer's rule** ("count only mints signed by issuer key K")
  makes a mint "official". So key K (single key or threshold) is trusted not to over-mint.
- **Zcash → Solana (redeem).** The Solana program must release tokens when a "burn" happens on Zcash. Solana
  cannot read Zcash, and a shielded burn is invisible even to Zcash observers. So a t-of-n signer group attests
  "burn of X to Solana address Y happened", and the program releases on t signatures. The signers are trusted not
  to fake burns.
- **Supply observability.**
  - Solana `locked` is public.
  - Shielded Zcash `minted` is **unobservable** unless the issuer publishes a viewing key or per-output
    disclosures, as Zecboat and Juno Intents do.
  - Even then, holder-to-holder splits of overlay notes stay invisible (Q3 quote).
  - The only way to make the shielded side conserve value is for the **operator to be the ledger**: every
    transfer is routed through the operator, which then sees everything. That is custodial.

### Worked example (small numbers)

The Solana escrow holds **1,000,000 MEME**. The bridge's 3-of-5 signers have issued 1,000,000 zMEME on Zcash as
shielded memo notes, each note labelled "1,000 zMEME" and backed by 10,000 zats. The invariant holds:
**1,000,000 locked = 1,000,000 minted.**

1. **Signer collusion (theft).** Three of five signers sign a fake attestation: "Zcash burn of 1,000,000 zMEME
   to Solana address EVIL." The Solana program checks 3 valid signatures and releases 1,000,000 MEME.
   - Now **0 locked** against **1,000,000 zMEME** still circulating, all unbacked.
   - Holders find out only when their redemptions fail.
   - Bonds help only if bond value exceeds escrow value. In ZecShield's model the attack pays whenever
     escrow > 3 × bond. The spec's own "1,000 ZEC (~$30,000)" price assumption cannot be reconciled with ZEC at
     ~$1,472 today (NEAR Intents price feed), so treat its bond maths as unreliable.
   - In Zecboat's phase 1 all 5 signers are the team, so "3-of-5" is really "1 company".
2. **Note splitting (counterfeit without any signer).** Alice holds one "1,000 zMEME" note. She makes two new
   shielded notes with the identical memo, each backed by 10,000 zats of her own ZEC, and sells one to Bob and
   one to Carol.
   - Claims in circulation: **1,001,000** against 1,000,000 locked.
   - Neither Bob nor Carol can detect this. Shielded transfers hide the provenance chain, and Zcash consensus
     only checks the ZEC balances.
   - Whoever redeems second is refused. The indexer can stop this only if every holder shares viewing keys with
     it, which ends privacy against the operator.
3. **Refund double-pay (bug-level, ZecShield MVP code).** A user deposits 1,000 MEME. The relayer calls
   `start_processing` and sends 1,000 zMEME on Zcash, then crashes before `confirm_shielding`. After 3,600 s the
   user calls `refund()`, which is allowed in the `Processing` state, and gets 1,000 MEME back.
   - Now **999,000 locked** against **1,000,000 minted**.
4. **Liveness.** Three of five signers go offline (or the router halts, as Maya has since 2026-08-18).
   - Redemptions stop. The two markets de-peg, because arbitrage needs redemption.
   - The 1,000,000 MEME sit safely but frozen.
5. **Protocol drift.** NU6.3 froze cross-address Orchard transfers on 2026-07-28. Overlay notes minted in Orchard
   had to be re-issued in Ironwood by the operator. That is a trusted re-mint of the whole supply, and a moment
   when an over-mint could hide.
6. **Wallet destruction.** A holder imports their seed into a standard wallet, which sweeps the 10,000-zat note
   as change.
   - The memo tag is gone. That 1,000 zMEME is permanently unredeemable.
   - The Solana escrow is now permanently over-collateralised by 1,000 (safe, but user-hostile).

### What the trust assumption actually becomes

Plain-language summary: **"MEME on Zcash" is an IOU from the signer group, tracked by the operator's indexer.**
It is the same trust class as a custodial exchange's internal ledger, plus on-chain transparency on the Solana
half.

Best-practice mitigations shrink the trust but do not remove it:

- A published issuer UFVK or per-output disclosures (Zecboat, Juno Intents).
- Independent signers from separate organisations.
- An hourly `locked` vs `attested-minted` commitment on Solana.
- Rate limits and caps.
- Refund only from `Pending`.

Juno Intents' own wording is the honest template: "threshold-operated rather than trustless."

### What this means for the project

A launchpad built on this model makes the operator **custodian of other people's tokens across two chains**. That
brings regulatory and security exposure, and it contradicts "trust-minimised" marketing. The same design becomes
sound only with native ZSA, where consensus enforces issuance and burn for a finalised asset (ZIP 226/227) and only
the Solana-lock ↔ Zcash-issue *link* still needs trusted signers.

---

## Route comparison

| Route | Private? | Counts as "on Zcash"? | Trust model | Effort | Live today? |
|---|---|---|---|---|---|
| Native ZSA meme (wait for NU7) | Yes (shielded, asset-typed notes) | **Yes**, consensus-level | Consensus for supply; issuer for backing | Low for the app, but blocked | **No.** ZIP 226/227 Draft; NU7 not scheduled |
| 1:1 SPL bridge → ZRC-20 (ChatGPT "Stage 1") | **No** (t-addresses) | Yes, app-layer, transparent | Bridge signers + indexer | High | No such bridge exists |
| 1:1 SPL bridge → shielded memo overlay (ZecShield / Zecboat) | Partial (links visible at entry and exit) | App-layer overlay | Custodial signer group + operator ledger; supply unenforceable | Very high | No. ZecShield unbuilt; Zecboat wSOL was a 1-SOL test, now 404 |
| ZEC-note overlay collectible meme (Zecboat model) | Yes | App-layer overlay | Issuer signature + disclosures; supply by reputation | Medium | **Yes** ([Zecboat collections](https://zecboat.com/collection/)) |
| ZRC-20 meme, no bridge | No | Yes, transparent | Deterministic indexer | Low | **Yes** |
| Solana Token-2022 confidential-transfer meme + ZEC pair | Amounts only; addresses public | No (ZEC-paired) | Solana + ZEC-wrapper custodian | Low–medium | **Yes** (CT since June 2026) |
| Solana meme gated by Zcash proofs (airdrop / claim) | Meme public; ZEC selective | No (Zcash as gate) | Off-chain verifier | Medium | Tooling Draft |
| Meme on Namada / Aztec / Aleo / Secret | Yes | No | That chain's consensus (or TEE for Secret) | Medium | Yes, but no ZEC route |
| Ztarknet L2 meme | Designed yes | Would be (L2) | L2 operator + STARK proofs + TZE | High | **No.** Dormant since 2025-12 |
| Swap routers (NEAR Intents, Maya, THORChain) | ZEC leg only | N/A (ZEC only) | POA / TSS | — | NEAR yes; Maya halted; THORChain no ZEC |

---

## Claims checked (ChatGPT conversation in `docs/BRIEF.md`)

| ChatGPT claim | Verdict | Source |
|---|---|---|
| A 2026 Zcash proposal called ZecShield targets Solana ↔ Zcash and arbitrary SPL tokens | **CONFIRMED** (as a proposal) | [forum thread](https://forum.zcashcommunity.com/t/grant-application-zecshield-universal-privacy-bridge-between-solana-and-zcash/55232) |
| Its architecture used a Solana escrow plus threshold FROST signers | **PARTLY TRUE.** In the spec, yes. The same post downgrades the MVP to one relayer with no FROST, and the repo contains no FROST code. | same thread; [repo](https://github.com/andreudumitro-eng/shield-bridge) |
| It was rejected for Zcash Community Grants | **CONFIRMED** (2026-04-13) | thread post #4; [minutes](https://forum.zcashcommunity.com/t/zcash-community-grants-meeting-minutes-4-13-2026/55349) |
| The author says the Solana contract, spec and deposit/refund machinery were already implemented | **CONFIRMED that he says it; PARTLY TRUE in substance.** The contract handles SOL only, has no release path and has a refund double-pay. | thread post #5; `programs/deposit-contract/src/lib.rs` |
| Review raised signer trust, vault/liquidity management and threshold-signing scalability | **CONFIRMED** (Hanh, Gguy, Artkor) | [minutes](https://forum.zcashcommunity.com/t/zcash-community-grants-meeting-minutes-4-13-2026/55349) |
| ZIP 227 was designed with wrapped external assets in mind; issuance + burn usable for bridging | **CONFIRMED** (but Draft, deployment TBD) | [ZIP 227](https://zips.z.cash/zip-0227) |
| ZSAs are still draft and not activated on mainnet | **CONFIRMED.** NU6.3 (July 2026) did not include ZSA | [ZIP 226](https://zips.z.cash/zip-0226), [ZIP 258](https://zips.z.cash/zip-0258), [ZIP index](https://zips.z.cash/) |
| Stage 1: SPL → escrow → ZRC-20/ZPAD-20 → "private users" | **WRONG on privacy.** ZRC-20 lives in transparent t-addresses. ZPAD-20 not checked here (see other research files). | [zecscriptions.com](https://www.zecscriptions.com/) |
| "We don't actually have to wait for native ZSAs to start building the bridge" | **PARTLY TRUE.** You can build it, but Zcash-side supply is enforced by operators and an indexer, not by Zcash. | Q3, Q6; [zecboat.com/shielded-assets](https://zecboat.com/shielded-assets) |
| Invariant "Never Zcash minted > Solana locked" as the heart of the protocol | **PARTLY TRUE.** It is the right invariant, but neither chain can enforce it without ZSA; it rests on signer honesty and liveness. | Q6 |
| Redesign as "multiple independent observers → quorum → Zcash issuance authorization" | **PARTLY TRUE.** It is still a trusted quorum; Solana cannot verify Zcash burns. ZCG rejected two such designs on exactly this point. | [minutes](https://forum.zcashcommunity.com/t/zcash-community-grants-meeting-minutes-4-13-2026/55349) |
| Price stays related via redemption arbitrage | **PARTLY TRUE.** Only while redemption is live; routers can halt for weeks (Maya, 2026-08-18 → today). | [MAYANode mimir](https://mayanode.mayachain.info/mayachain/mimir) |
| Units can carry private serials giving "fungible economics + NFT-like identity + Zcash privacy" | **PARTLY TRUE.** It works as a memo overlay, but memos can be copied and notes split, so serials prove issuer provenance only at issuance. | [zecboat.com/shielded-assets](https://zecboat.com/shielded-assets) |
| "The missing piece is a proper Solana↔Zcash asset-standard/bridge" | **PARTLY TRUE.** Two attempts exist (ZecShield, Zecboat wSOL); both were declined and neither is live. | [Zecboat thread](https://forum.zcashcommunity.com/t/zecboat-bridge-frost-secured-wrapped-asset-wsol/55199) |
| (Implicit) Designs target "Zcash's Orchard pool" | **OUTDATED.** Since 2026-07-28 Orchard cannot receive value; new shielded value goes to Ironwood. | [ZIP 258](https://zips.z.cash/zip-0258) |

### Stale or contradictory sources flagged

- **THORChain.** April and June 2026 news says "Zcash integrated … trading in coming weeks" (e.g.
  [Bitget, 2026-04-24](https://www.bitget.com/news/detail/12560605382706)). The live THORNode today shows no ZEC
  chain or pool.
- **ZCG minutes, search-snippet error.** A search-engine summary claimed the 4/13 minutes show ZecShield
  "approved for $48,000". The minutes themselves say **Declined**.
- **Zolana / NEAR Intents.** The marketing says users "swap for shielded ZEC". NEAR Intents docs say Zcash is
  "Transparent addresses only". Shielding is done by the wallet (Zodl) after a transparent hop.
- **Zecboat's "locked in our smart contract".** The published lock address is a keypair wallet, not a program
  account.
