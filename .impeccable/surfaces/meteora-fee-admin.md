---
version: 1
slug: "meteora-fee-admin"
primary_target: "web/src/components/MeteoraFeeAdmin.tsx"
related_targets: ["web/src/App.tsx", "web/src/lib/meteoraFees.ts"]
---

# Surface: Meteora fee admin

Mode: Operate. This is a private operator desk for reading and claiming partner fees, not a public
marketing or navigation destination.

## Direction contract

**THESIS.** Collect every launchpad partner fee from one accountable desk without confusing route
obscurity with authorization.

**OWN-WORLD.** The public on-chain stamp terminal becomes quieter and denser: the same dark-first palette,
Space Grotesk interface voice, Courier Prime amounts, 16px working panels, compact controls, and honest
ledger structure. No separate “admin dashboard” visual brand is introduced.

**STORY.** The operator reaches an unlinked hash-matched route, connects a wallet, sees whether it matches
the configured fee authority, reviews claimable balances across Meteora pools, and claims one pool or all
eligible pools. Progress remains inspectable through signing, submission, confirmation, and partial
failure.

**FIRST VIEWPORT.** A compact fee-control header leads into a split authority panel: purpose and scope on
the left, wallet state on the right. Before authorization, balances and claim controls remain sealed. An
authorized wallet reveals the pool count, claimable STAMP total, ready-to-claim count, and the ledger.

**FORM.** Wallet-gated partner-fee ledger. The route is deliberately absent from navigation and docs; it
must be referred to only as an unlinked hash-matched route.

## Access boundary

- Route matching selects the surface but grants no authority.
- Only the fee authority from the live Meteora configuration unlocks balances and claim controls.
- A disconnected wallet is offered installed wallet choices; a connected non-matching wallet receives
  an explicit access-denied state and cannot read or submit claims.
- The route segment must never appear in documentation, visible UI copy, analytics labels, screenshots,
  or support instructions.

## Claim interaction

- Refresh reads the launch record and current on-chain fee vaults without submitting a transaction.
- Each eligible pool has an independent Claim action.
- Claim all builds one verified transaction per eligible pool. Wallets that support multi-signing receive
  bounded batches of up to eight transactions; other wallets request approvals sequentially.
- Controls remain disabled while transactions are building, awaiting signatures, sending, or confirming.
- A successful claim reports confirmed pools and refreshes balances. Partial failure states the confirmed
  count separately from the submitted-but-unconfirmed count and keeps explorer links grouped by status.

## Responsive ledger

- At medium widths and above, use a horizontally safe table with pool identity, pool state, STAMP fees,
  base fees, and per-pool action.
- Below the medium breakpoint, replace the table with stacked cards that retain the same amounts, state,
  pool link, and Claim action. Do not rely on horizontal scrolling for the phone layout.
- Empty, loading, read-failed, migrated, on-curve, claimed, and unavailable states remain explicit in both
  representations.

## Status language and accessibility

- “Submitted” means Solana accepted a serialized transaction for processing; it does not mean the claim
  is confirmed.
- “Confirmed” is reserved for transactions whose confirmation returned without an on-chain error.
- Building, wallet approval, sending, and confirmation messages announce through a polite `status` live
  region. Errors and partial failures use an assertive `alert`.
- Completion or failure receives programmatic focus, and transaction links say whether each item is
  confirmed or merely submitted.

## Raster provenance

This surface introduces no new raster. It reuses `web/public/stamp-mark-transparent.png` and
`web/public/meteora-mark.png`; their provenance is recorded in the home surface brief.

## Finish review

**Disposition: SHIP.** The surface keeps the route undisclosed, makes wallet authority explicit, supports
bounded batch claims without hiding per-pool outcomes, adapts the ledger for phones, and never equates
submission with confirmation.
