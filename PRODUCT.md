# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite + Tailwind (operator's choice, 2026-09-20). The page does real work in the browser —
Solana wallet connection, BIP39 seed generation, live burn and mint status — so it is an application,
not a document. Wallet adapters for Phantom/Solflare are first-class in this stack.

## Users

**Primary: Solana memecoin traders who already hold the coin.** They live in Phantom, understand bonding
curves, tickers and burns, and know nothing about Zcash. Most do not have a Zcash wallet and have never
seen a `t1…` address. They are on mobile as often as desktop, they move fast, and they bounce at
unexplained friction.

**Secondary: the Zcash and privacy community.** They have wallets already, and they have seen wrappers
that overpromise privacy. They will check whether the claims are true before repeating them. The site must
survive their scrutiny without being built for them.

Traders first, but never at the cost of a claim the second audience could disprove.

## Product Purpose

A holder burns the Solana memecoin ($ZSA) and receives a Zcash NFT stamped with exactly how much they
burned. The tokens are destroyed; the NFT is the record. When Zcash activates native Shielded Assets, each
NFT converts to that many shielded tokens.

Success is a trader completing a burn — including getting a Zcash address they control — without help.

## Positioning

**One-way, and nobody holds your funds.** Competing designs lock tokens in an escrow the operator
controls; both teams that proposed one to Zcash Community Grants were rejected over exactly that. Here
there is no escrow to hack and no operator to trust: the tokens are destroyed on Solana, and an
inscription only counts as an NFT if it cites a real, unclaimed burn and is delivered to the address that
burner chose. A stolen minter key can waste fees and nothing else — demonstrated on mainnet by forging one
and watching the ledger refuse it.

## Operating Context

The burn is a single Solana transaction the user signs in their own wallet. The NFT appears on Zcash
roughly two minutes later. Everything is verifiable from public chain data: the ledger is rebuilt from
both chains and anyone can check the arithmetic.

Users arrive from Solana, likely from a pump.fun link or a post on X, frequently on a phone.

## Capabilities and Constraints

- **Burns are irreversible.** A wrong amount, a wrong address or a wrong token cannot be undone or
  refunded. Anything the interface gets wrong costs the user real money.
- **Zcash transparent addresses only** (`t1…`). Unified (`u1…`) and shielded addresses cannot receive an
  inscription. The site generates a standard BIP39 wallet (path `m/44'/133'/0'/0/0`) client-side so a
  trader needs no prior Zcash wallet, and the same 12 words import into Ywallet later.
- **An exchange deposit address is a valid `t1…` and will swallow the NFT forever.** No code can detect
  this. The interface must warn, repeatedly and unmissably.
- **Losing the 12 words loses the NFT.** There is no reset and no support path.
- **Holdings on Zcash are public today, not private.** Native Shielded Assets are not on mainnet and will
  not be in 2026. Privacy is a future migration, never a present claim.
- **There is no DEX, AMM or working marketplace for these NFTs yet.** Selling today means OTC. The site
  must not imply a liquid market exists.
- Minimum burn: 1,000,000 tokens. Each NFT costs the operator ~$0.45 in Zcash fees to inscribe.

## Brand Commitments

- Ticker: **$ZSA**. Not yet launched. An earlier token $ZIP227
  (`8RSbsKW26WhHsFsM6jc34zSijvq6r7t6GmkYrfj8pump`) is live on Solana mainnet but is **not** this
  project and must never be wired into the config.
- Project name: **Zcash Shielded Assets**.
- NFT collection name: **undecided** — candidates are Notes, Ashes, Receipts. Do not invent one.
- No Zcash Foundation or Electric Coin Co. logo, endorsement or implied affiliation. The name echoes a
  protocol feature; it does not claim to be that feature, nor any relationship with its authors.

## Evidence on Hand

Real, and usable as proof:

- A live mainnet NFT: reveal `b2cbded5c37c2cca8918a077a73e2ca349005efba046cee0866b34dd879c5acb`,
  1,500,000 tokens burned, delivered to `t1P2GcxGhzeM5tPk3r3JsGh1tEVArD4C2fB`.
- The forged inscription Zcash accepted and the ledger rejected:
  `d54660626ac2464cdaac7009e5b0b93f8b705e6236b24455edde8a34faffc0b7`.
- The protocol specification (`docs/SPEC.md`) and the research behind it (`docs/research/`).

**Absences future work must not fabricate:** no users, no volume, no holders, no testimonials, no press,
no partnerships, no floor price, no roadmap dates for Zcash Shielded Assets.

## Product Principles

1. **The rule is the product.** Trust comes from what cannot happen, not from promises. Show the
   verification, don't assert the safety.
2. **Irreversible actions deserve friction.** Every other screen should be fast; the burn confirmation
   should be slow and explicit.
3. **Never claim privacy we do not have.** Holdings are public today. Saying otherwise loses the audience
   that would otherwise vouch for us.
4. **A trader with no Zcash wallet must finish unaided.** The wallet step is where this product lives or
   dies.
5. **Say what it costs and what can go wrong**, in the interface, before the signature — not in a
   docs page nobody opens.

## Accessibility & Inclusion

Mobile-first: a large share of traffic is a phone in one hand. Seed phrases and addresses must be
selectable and copyable, never image-only. Warnings must not rely on color alone.
