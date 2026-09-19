# Brief

## Current product (decided 2026-09-19, see docs/adr/0001-burn-to-mint.md)

> Launch a new memecoin on Solana (pump.fun, done by the operator). Holders burn it to receive a Zcash NFT
> stamped with the amount burned. It's one-way with nobody holding funds, publicly verifiable now, and
> migrates to a native shielded ZSA once Zcash activates them.

## Original one-sentence goal (operator's own words, confirmed 2026-09-19)

> Launch the first memecoin (shielded asset) on Zcash using the best method available today, then turn
> that into a launchpad where anyone can launch their own and we earn fees on the transactions.

Operator, verbatim: "i essentially want to be the first memecoin or sheilded asset in a way on zcash but
as for now zcash sheilded assets arent a thing i found a way arounf which was using nfts so i came up with
this, but i want u to spend time researching and finding better ways around or a diff way, but after we
launch the first memecoin on zcash weather it be a actual way tpo launc h or just use nfts in a way i then
want to make it so we can be a launmchpad wehre people can launch using our pad and we make fees off the
transactions"

All three framings are in scope: a 1:1 Solana-backed bridge, NFT-like units with private serials, and a
dual-chain launchpad.

## Status of the material below

The conversation below is **input, not the design.** It is a ChatGPT reworking of an idea from a
friend's screenshot (the screenshot is not in the repo). Its factual claims about the Zcash ecosystem
as of September 2026 are **unverified** until `docs/research/` says otherwise.

---

## ChatGPT conversation (verbatim, as pasted by the operator)

Yes. I understand what you and your friend are getting at in the screenshot, and after checking what is actually live on Zcash right now, I think there is a much better version of the idea.

The key is: don't try to make 1 trillion literal NFTs. Use the NFT idea as the representation layer for a 1:1 backed Solana asset.

What your friend's idea is really trying to accomplish

The screenshot is basically suggesting:

```
SOLANA MEMECOIN
100,000,000,000 units
        ↓
ZCASH
1,000,000,000,000 "NFTs"
        ↓
each unit represents 1 unit of the Solana token
        ↓
therefore each unit has the same economic value
```

There is a clever idea buried in that.

But making 1 trillion separate NFTs is the wrong implementation.

Zcash's proposed native ZSA system itself already gives us a much cleaner primitive: one asset can have a supply up to 2^64 - 1, and the ZSA design explicitly includes wrapped assets from other chains as a use case.

So instead of:

```
1,000,000,000,000 separate NFTs
```

we can have:

```
1 ZSA
Supply = 1,000,000,000,000
```

where:

```
1 ZSA-MEME = 1 locked Solana MEME
```

That's far more scalable.

But here's where your idea gets interesting

There is already infrastructure on Zcash mainnet that changes the situation substantially.

Zecscriptions / ZRC-20 is live on Zcash mainnet. It records token deployment, mint and transfer operations in Zcash transactions and reconstructs the token ledger from the blockchain. It explicitly describes itself as an application-level inscription protocol rather than a Zcash consensus asset.

And ZecPad is building another application-layer token system, ZPAD-20, specifically because Zcash doesn't currently have a smart-contract VM. Its stated design is deterministic on-chain operations + an indexer that reconstructs token state.

So we don't actually have to wait for native ZSAs to start building the bridge.

The architecture I'd use

I'd make the Solana token the canonical asset.

Suppose somebody launches:

```
$DOGEAI

Solana mint:
ABC123...

Supply:
1,000,000,000
```

Our system derives:

```
Asset identity =
SOLANA:SPL:MAINNET:ABC123...
```

Then we create its Zcash representation:

```
ZEC-DOGEAI
```

The important rule is:

```
Every 1 ZEC-DOGEAI
must correspond to
1 DOGEAI locked in the Solana bridge
```

So:

```
Solana escrow
1,000,000 DOGEAI

Zcash representation
1,000,000 ZEC-DOGEAI
```

That is a wrapped asset, not a price oracle.

Why I would NOT peg the price

This is really important.

Don't define:

```
1 ZEC-DOGEAI = $0.00042
```

Instead define:

```
1 ZEC-DOGEAI
        ↕
1 DOGEAI
```

through redemption.

Then price arbitrage keeps the two markets related.

Example:

```
Solana DOGEAI = $0.00100

Zcash DOGEAI = $0.00120
```

Someone buys DOGEAI on Solana → deposits it → receives Zcash DOGEAI → sells it.

The opposite happens when the Zcash representation becomes cheaper.

So you are creating a convertibility peg, not relying on an oracle to invent the price.

Now your NFT idea can still be used

This is the part I actually like.

Instead of making each token unit a literal NFT, we can make each Zcash unit privately distinguishable at the application layer.

Think:

```
ZEC-DOGEAI #728391
ZEC-DOGEAI #728392
ZEC-DOGEAI #728393
...
```

All of them represent:

```
1 DOGEAI
```

but each can have a private serial/commitment.

Then you're effectively getting:

fungible economics + NFT-like identity + Zcash privacy.

That's much closer to what your screenshot is trying to accomplish.

Native ZSA itself has a model capable of NFT issuance: ZIP 227 describes NFTs as assets where individual issuance actions represent a fundamental unit of 1, with finalization.

But I wouldn't issue a trillion separate native NFT asset IDs. That's absurdly inefficient.

I'd use:

```
ONE asset ID
+
many privately controlled notes
+
optional private serials
```

The biggest opportunity I found

There is already a real ZSA NFT implementation being tested.

ZecBit reported issuing ten unique finalized ZSAs on the public ZSA test network in one transaction, with each having its own assetDescHash, reference note and value-1 note.

And QEDIT's current tooling can issue, transfer and burn ZSAs on the ZSA test infrastructure.

QEDIT's ZSA branches were still being actively updated in September 2026, including Orchard/librustzcash work on the ZSA implementation.

So the NFT approach isn't some crazy theoretical thing.

The Zcash ecosystem is actually testing the exact primitive you are talking about.

Here's the really clever part

We can combine ZRC-20/ZPAD-20 now with native ZSA later.

Stage 1 — today

```
                SOLANA
                   │
             Native SPL token
                   │
                deposit
                   ▼
             Bridge escrow
                   │
                   ▼
       Zcash application-layer token
            ZRC-20 / ZPAD-20
                   │
                   ▼
             private users
```

The Zcash ledger is reconstructed deterministically from chain data.

ZecPad's published architecture explicitly aims for independent indexers to derive the same token state from Zcash blocks.

Stage 2 — native ZSA

When ZSA is consensus-enabled:

```
                SOLANA
                   │
                lock
                   ▼
               Bridge
                   │
                   ▼
             NATIVE ZSA
                   │
             shielded transfer
                   │
                   ▼
                 user
```

Then the application token can migrate to a native ZSA.

And this is better than simply copying liquidity

Your original idea was:

create the asset on both chains and make the liquidity similar

I wouldn't force the liquidity to be identical.

Instead:

```
Solana:

DOGEAI / SOL
$10m liquidity


Zcash:

ZSA-DOGEAI / ZEC
$500k liquidity
```

That's completely fine.

The important thing is:

```
1 ZSA-DOGEAI
      =
1 underlying DOGEAI
```

The liquidity pools are separate markets connected by redemption/arbitrage.

The bridge itself

This is where things become difficult.

I found a 2026 Zcash proposal called ZecShield specifically targeting Solana ↔ Zcash and arbitrary SPL tokens. Its proposed architecture used a Solana escrow plus threshold FROST signers. The proposal was rejected for Zcash Community Grants, but the author says the Solana contract, specification and deposit/refund machinery were already implemented.

The grant review specifically raised concerns around signer trust, vault/liquidity management, and scalability of the threshold signing setup.

So I wouldn't copy it blindly.

I'd redesign it around:

```
Solana PDA escrow
       │
       │
multiple independent observers
       │
       │
quorum
       │
       ▼
Zcash issuance authorization
```

And, where native ZSA is available, use its explicit issuance/burn machinery.

ZIP 227 was designed with wrapped external assets in mind and specifically says issuance + burn can be used for bridging assets from other chains.

The supply equation would be the heart of the protocol

For every Solana mint:

```
LOCKED_SOLANA
=
ZCASH_MINTED
+
PENDING_REDEMPTIONS
```

Example:

```
Solana escrow:

1,000,000,000 MEME


Zcash:

720,000,000 ZSA-MEME


Withdrawal queue:

280,000,000 MEME

Total:

720M + 280M = 1B
```

Never:

```
Zcash minted > Solana locked
```

That is the invariant we'd build the entire system around.

And here's an even better version of your "1 trillion NFTs" idea

Suppose a Solana meme has:

```
1,000,000,000,000 MEME
```

Instead of minting a trillion NFTs, create:

```
ZSA-MEME
Supply = 1,000,000,000,000
```

Then each shielded note can contain some quantity:

```
Alice:
37,500,000 MEME

Bob:
14,820,000 MEME

Charlie:
1 MEME
```

The outsiders don't need to see those balances.

And for applications that want NFT-like units:

```
serial = private
asset = ZSA-MEME
quantity = 1
```

So you can have a one-unit note that behaves like an NFT to the application without creating a separate blockchain asset for every unit.

That is the version I'd pursue.

One more thing that makes this much more interesting

There are two different projects emerging around Zcash at the same time:

ZecBit is building NFT infrastructure specifically around ZSA.

ZecPad is building a private market/launchpad system and explicitly describes application-layer assets now with a future path to native ZSA.

And Zecscriptions already has a mainnet application-layer token system.

That means the ecosystem is practically giving us the components:

```
Zecscriptions
      +
ZecPad
      +
ZecBit
      +
Native ZSA
      +
Solana bridge
```

The missing piece is a proper Solana↔Zcash asset-standard/bridge that makes the same asset exist on both sides with a hard 1:1 redemption relationship.

What I would call the actual protocol

Not:

"1 trillion NFTs"

I'd describe it as:

Cross-chain shielded representations

```
SOLANA MINT
     ↓
canonical asset ID
     ↓
1:1 collateralized Zcash representation
     ↓
shielded ownership
     ↓
private transfer
     ↓
burn
     ↓
native Solana withdrawal
```

And later:

```
Application token
       ↓
Native ZSA
```

That gives you something much more powerful than an NFT trick.

It gives you a Solana memecoin → private Zcash asset bridge where the Solana token remains the canonical underlying asset and the Zcash side becomes the private market.

One important correction to my previous message: after checking the current September 2026 sources, ZSAs are indeed still draft and not generally activated on Zcash mainnet, but the ZSA testnet/implementation work is now quite concrete, while ZRC-20/Zecscriptions and ZPAD-20 provide genuine mainnet application-layer alternatives today.

The next thing I'd work out is the actual protocol at byte/transaction level: exactly how a Solana mint gets assigned an asset ID, how the escrow proves deposits, how the Zcash side mints, how a user privately redeems, and how we can make it work before native ZSAs and then seamlessly migrate to native ZSAs later.
