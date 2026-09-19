# Research report: launching a meme on Zcash

Date: 2026-09-19. Status: **research only, no code.** The operator picks a route after reading this.

Detail files, which each have full sources and a claims table:
[`mechanisms.md`](mechanisms.md) (what can launch on Zcash today),
[`routes.md`](routes.md) (bridges, cross-chain routes, alternatives),
[`launchpad.md`](launchpad.md) (how launchpads earn fees).

**The goal being tested** (operator's words): *launch the first memecoin (shielded asset) on Zcash using the best
method available today, then turn that into a launchpad where anyone can launch their own and we earn fees
on the transactions.*

---

## The four answers

### 1. Can a meme be shielded (private) on Zcash today? **No.**
The only thing a shielded note can hold today is ZEC. Every token system on Zcash mainnet is either:
- **public and verifiable.** ZRC-20 inscriptions sit entirely in transparent transactions, so anyone
  running the indexer can see who holds what.
- **private but not verifiable.** Encrypted-memo systems like ZINC call their own ownership "advisory",
  because the same token can be sent twice and nothing stops it.

Real shielded tokens need native Zcash Shielded Assets (ZSAs, ZIP 226/227), which are still Draft.
**They will not arrive in 2026.** The next upgrade, NU7 (mainnet 2026-11-05), explicitly adds no new
transaction format, and ZSAs need one. They're planned for "the following network upgrade", which has
no name or date.

The ChatGPT diagram's "ZRC-20 → private users" step is wrong.

### 2. Is "first memecoin on Zcash" still available? **Not as stated.**
The first ZRC-20 token, `ZERO`, was deployed on **2025-11-13 05:44 UTC** (block 3,133,112), and `PEPE` the same
day. There are 164 tickers now. Meme launchpads that take fees also already exist (Zecscriptions, zordinals.fun).

| "First …" | Available? |
|---|---|
| memecoin on Zcash | ❌ taken, 2025-11-13 |
| memecoin launchpad on Zcash | ❌ taken (Zecscriptions and others) |
| shielded NFT on Zcash mainnet | ❌ weakly taken: ZINC-2 via secresea.com, with advisory ownership |
| **1:1 Solana-backed meme on Zcash** | ✅ appears open, but see answer 3 for why it's hard to do honestly |
| **fungible meme with shielded holdings** | ✅ open, but only "advisory" (anyone can double-spend) until ZSA |
| **native ZSA meme on Zcash mainnet** | ✅ open, and the most meaningful one left. It's a race on activation day, date unknown. **Cachet** is already building an issuance console for it. |

### 3. Does the Solana-backed bridge work before ZSA? **Only as a custodian you have to trust.**
Zcash has no smart contracts and no native assets. So nothing on the Zcash side can enforce
"Zcash minted ≤ Solana locked". You, the operator, would enforce it, with a signing group plus your own indexer.

Worked example: 1,000,000 MEME is locked on Solana, and 1,000,000 ZEC-MEME is issued on Zcash.
- **ZRC-20 version:** the ledger is public, so anyone can check supply, but there's no privacy. Also, if your
  signers are compromised they can mint 50,000 extra ZEC-MEME, and the Solana escrow still only holds
  1,000,000. The last 50,000 people to redeem get nothing.
- **Encrypted-memo version:** it's private, but a holder can copy a memo onto a second note. Now **1,001,000
  claims exist against 1,000,000 locked**, and nobody can prove which one is fake.

Both teams that tried this were **declined at the same grants meeting** ([minutes, 2026-04-13](https://forum.zcashcommunity.com/t/zcash-community-grants-meeting-minutes-4-13-2026/55349)):
- **ZecShield:** reviewers raised safety of funds, signer trust, and FROST coordination costs that grow with
  the square of the signer count. Its [repo](https://github.com/andreudumitro-eng/shield-bridge) is a
  3-commit skeleton that handles SOL only, has no Zcash side, and has a refund path that can pay out twice.
- **Zecboat wSOL:** its "smart contract" was an ordinary private-key wallet, and its bridge page now
  returns 404.

Once ZSA exists, the Zcash side improves: issue and burn become consensus-enforced, so supply can't be
faked there. The Solana escrow is still custody, though.

### 4. How does the launchpad earn fees? **Mostly on Solana. On Zcash only from the first sale, or with trust.**
pump.fun-style launchpads take about 1% of trading volume, and a smart contract enforces it. Zcash can't do that. What does work:

| Mechanism | Enforceable? | Works on Zcash today? |
|---|---|---|
| You run the first sale / bonding curve and take ~1% | Yes, but you hold users' ZEC | Yes (that's custody) |
| A fee written into your token standard ("a mint only counts if it pays X") | Only while everyone uses your indexer. ZRC-20 forks have already dropped exactly this kind of rule | Yes, but fragile |
| A fee on trades through your UI (~2%, like zcash.ink) | No. A 0% competitor can fill the same listings | Yes, but anyone can go around it |
| A platform fee on Solana (Raydium LaunchLab up to 5%, Meteora DBC) | **Yes, enforced by the program** | N/A, it's on Solana |
| Deploy fee paid in ZEC | Yes | Yes |

Worked example: 1,000 buyers × 0.5 ZEC = 500 ZEC (about $736k).
- **Zcash:** about **5–6 ZEC** is reliably earnable, from 1% on a curve you run plus deploy fees.
  Later trading fees could be anywhere from 0 to about 20 ZEC and can't be enforced.
- **Solana:** the same volume run as a LaunchLab platform at 1% earns about **$7.4k**, collected by the program.

There's also **no DEX or AMM for Zcash tokens.** They trade only as whole lots through signed listings,
and that only works in the transparent pool. Shielded spends can't be listed that way.

---

## Routes compared

| Route | Private? | A "first" still open? | Supply enforced by | You hold users' funds? | Fees enforceable | Live today? |
|---|---|---|---|---|---|---|
| **A. ZRC-20 meme now** | ❌ public | ❌ | Public indexer | No (unless you run the sale) | Weak | ✅ |
| **B. Solana-backed bridge before ZSA** | ❌ ZRC-20 / ⚠️ memo | ✅ "first backed" | **You** (signers + indexer) | **Yes, the escrow** | Solana side yes | Buildable. Twice declined for grants |
| **C. Native ZSA, ready on activation day** | ✅ real shielding | ✅ **"first native ZSA meme"** | Zcash consensus | No | Launch fees yes, trading unclear | Testnet only, mainnet date unknown |
| **D. Shielded-memo collectibles (your NFT idea)** | ✅ private | ⚠️ ZINC did NFTs first | The issuer's word (advisory) | No | Primary sale | ✅ |
| **E. Solana meme with confidential transfers, ZEC-paired** | ⚠️ amounts hidden, addresses visible | N/A, it's not "on Zcash" | Solana program | No | ✅ strong | ✅ |

---

## Recommendation: two tracks

**Track 1: make money now, on Solana (route E plus a launchpad).**
Launch the meme on Solana, Zcash-branded and paired with ZEC on Solana (zenZEC or NEAR-bridged ZEC).
Optionally use Token-2022 confidential transfers, which have been live again since June 2026. They hide
amounts but not addresses. Be a platform on Raydium LaunchLab or Meteora DBC, so launch and trading fees
are enforced by code from day one. Be honest in the branding: "ZEC-paired", not "on Zcash".

**Track 2: the "first" that's actually worth claiming (route C).**
Build on the public ZSA test networks now (QEDIT's `dev.zebra.zsa-test.net`, hanh's `zsa.methyl.cc`):
issue, transfer, burn and finalize a meme as a native shielded asset. Get the launchpad's issuance tooling
ready, then issue on mainnet on activation day. This is the only route where the meme is **really
shielded and nobody has to trust you**. Once it's live, the Solana meme from Track 1 can bridge 1:1 into
it using ZSA issue/burn. That's the point where ChatGPT's bridge idea starts to make sense.

The catch: the date is unknown, probably 2027 or later. Track 2 earns nothing until then, and Cachet is
already aiming for the same finish line.

**Alternatives if you'd rather be on Zcash mainnet now:**
- **Route D** is closest to your original NFT idea and is genuinely private today. But it's collectibles,
  not a fungible memecoin, and ownership only holds as long as people trust you.
- **Route A** is cheap and quick, but it's not first, not private, and it would be one of 164 tickers in a market that's slowing down.

**What I'd avoid:** route B before ZSA. It means holding people's money with nothing on the Zcash side to
back it, both teams that tried it were rejected over exactly that, and there's no privacy benefit to show for it.

---

## Flags
- **Ironwood (2026-07-28).** After a counterfeiting bug in Orchard, Zcash sealed Orchard (it can only
  withdraw now) and opened a new shielded pool, Ironwood. Any design that assumes Orchard is out of date,
  and ZSA work is being moved onto Ironwood. ChatGPT didn't know about this.
  ([The Block](https://www.theblock.co/post/409934/zcash-ironwood-upgrade-launching-new-shielded-pool-after-orchard-vulnerability),
  [forum](https://forum.zcashcommunity.com/t/the-orchard-counterfeiting-vulnerability-and-next-steps/56015))
- **Ecosystem trust is low.**
  - The former ZRC-20 marketplace zatoshi.market sent users' private keys to its server
    ([audit](https://github.com/hieusats/zatoshi-market-key-exposure)). Wallets were drained on 2026-06-22;
    the audit doesn't prove the two are linked.
  - ZecBit, the NFT example ChatGPT gave, is testnet-only, its grant was rejected, and a forum moderator
    flagged "red flags".
  - Maya has been halted since an exploit on 2026-08-18. THORChain still has no ZEC pool, despite news saying it did.
- **Holding users' funds** (a bridge escrow, or running the bonding curve yourself) means custody risk and
  possibly licensing obligations. The licensing side wasn't researched.
- **EU AMLR Art. 79:** from 10 July 2027, crypto service providers in the EU can't handle
  anonymity-enhancing coins. That may reduce ZEC liquidity and on-ramps.

## Checked by the lead (independent of the agents)
| Claim | Result | Source |
|---|---|---|
| Ironwood replaced Orchard after a counterfeiting bug | ✅ | The Block, CoinDesk, forum disclosure |
| NU7 adds no new transaction format, so no ZSA | ✅ | [z.cash/upgrade/nu7](https://z.cash/upgrade/nu7/) |
| ZRC-20 is live, with a launchpad | ✅ | [zecscriptions.com](https://www.zecscriptions.com/), [ZRC-20 spec](https://zatoshi.gitbook.io/zrc) |
| First ZRC-20 deploy at block 3,133,112 = 2025-11-13 05:44 UTC | ✅ block time matches to the second | Blockchair API |
| zatoshi.market sent private keys to its server | ✅ exposure proven, misuse not proven | [audit repo](https://github.com/hieusats/zatoshi-market-key-exposure) |
| ZecPad grant rejected 2026-06-24, testnet only | ✅ | [forum thread](https://forum.zcashcommunity.com/t/grant-application-zpad-20-open-asset-indexing-discovery-infrastructure-for-zcash/56114) |
| ZecShield and Zecboat bridge both declined 2026-04-13 | ✅ | [minutes](https://forum.zcashcommunity.com/t/zcash-community-grants-meeting-minutes-4-13-2026/55349) |
| ZecShield repo is a 3-commit skeleton with no Zcash side | ✅ | [repo](https://github.com/andreudumitro-eng/shield-bridge) |

Not independently checked by the lead (sourced in the detail files): exact pump.fun and LaunchLab fee
tiers, holder counts for each ZRC-20 token, the Maya halt and THORChain status, and Token-2022
confidential transfers being live again.

## Decisions for the operator
1. **Which "first" do you want to claim?** The two options are "first native shielded meme" (Track 2,
   delayed, the real one) and "first Solana-backed meme on Zcash" (route B, custodial and not private).
2. **Is a Solana launch with Zcash branding acceptable (Track 1)?** It's where the fees can actually be
   enforced today.
3. **Are you willing to hold users' funds?** That decides whether running your own bonding curve or a
   bridge is even on the table.
