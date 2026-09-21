# Surface: home

Primary target: `web/src/App.tsx`

Mode: Persuade in the first viewport; Operate through launch, burn, ranking, and verification.

## Direction contract

**THESIS.** A burn becomes a permanent on-chain stamp. The home surface refuses both the centered white
certificate and the generic neon trading page: proof is alive, market-aware, and immediately actionable.

**OWN-WORLD.** Near-black pixel night, molten orange and gold, perforated stamp geometry, compact
Shadcn-style controls, and dense ledger tables. Dark is the default; the light option preserves the same
semantic hierarchy. Space Grotesk carries interface language and Courier Prime carries chain data.

**STORY.** A trader sees live proof, checks market activity, launches or burns, and verifies the result
without losing context. The page keeps irreversible-action warnings close to the relevant control and
never substitutes aspiration for chain evidence.

**FIRST VIEWPORT.** A wide asymmetric hero places live HTML copy, actions, burn totals, stamp count, and
the copyable contract at left, with authored stamp-sunset art at right. Live network statistics sit
directly below. The visual remains image-led without putting copy, contract data, or actions inside the
raster.

**FORM.** On-chain stamp terminal. Seed `ceb334bc`. A 94rem shell, 16px working panels, 10–12px controls,
44px coarse-pointer targets, and restrained structural depth organize the surface. Perforations and the
clipped stamp mark supply identity; orange signals action and proof rather than decorative neon.

## Shipped behavior

- Sticky navigation uses compact route controls plus icon-and-label DEX, Fomo, and X links. On mobile it
  becomes two rows, keeping the primary routes fully visible.
- The three-stat strip reports the flagship's current market cap, protocol burn volume, and tokens
  launched through the pad. It never substitutes the leaderboard's highest cap for the flagship's own
  live figure.
- Home keeps the certificate proof and burn workflow side by side at wide sizes, then stacks them safely
  on smaller screens.
- The launchpad groups the working form with explicit fee, custody, and funding constraints.
- The leaderboard is sortable by market cap, 24-hour volume, holder count, and launch time. Missing or
  incomparable values sort last, while the live-market panel pairs a compact DexScreener chart with a
  selected-token dossier.
- Data tables scroll horizontally when needed; addresses, hashes, and amounts use tabular data type.
- Burn and launch progress use accessible `status` live regions, errors use assertive `alert` behavior,
  and completed launch content receives focus.
- Reduced-motion preferences remove nonessential transitions and collapse the stamp strike to 1ms.

## Raster provenance

Every raster shipped by this surface is accounted for here:

| Asset | Provenance | Use |
|---|---|---|
| `web/public/stamp-hero-v2.png` | Generated specifically for this redesign from the on-chain stamp terminal direction, seed `ceb334bc`; no external stock source. | Decorative right-side hero scene; all product copy and data remain live HTML. |
| `web/public/fomo-eyes.png` | Supplied project asset; not generated as part of this redesign. | Small Fomo brand mark in the navigation and trade action. |
| `web/public/dex-mark.png` | Supplied project asset; not generated as part of this redesign. | Small DEX brand mark in the navigation. |
| `web/public/stamp-mark.png` | Supplied project stamp artwork; not generated or altered as part of this redesign. | Fully contained certificate watermark and counterfoil brand mark. |
| `web/public/stamp-mark-transparent.png` | User-supplied transparent version of the project stamp artwork. | Navbar brand mark, flagship leaderboard avatar, live-market dossier, and counterfoil brand mark. |
| `web/public/favicon-16.png` | Deterministic tightly cropped 16 px derivative of the user-supplied transparent stamp artwork. | Small browser-tab icon. |
| `web/public/favicon-32.png` | Deterministic tightly cropped 32 px derivative of the user-supplied transparent stamp artwork. | Standard browser-tab icon and ICO fallback source. |
| `web/public/apple-touch-icon.png` | Deterministic tightly cropped 180 px derivative of the user-supplied transparent stamp artwork. | Apple home-screen and bookmark icon. |
| `web/public/meteora-mark.png` | Official Meteora mark sourced from `https://github.com/MeteoraAg/docs/blob/main/assets/logo/meteora.png`. | STAMP launch selector and DBC launch form. |
| `web/public/pump-pill.png` | User-supplied Pump pill artwork, tightly cropped without altering the mark. | Pump / ZEC pair selector. |

## Finish review

**Disposition: SHIP.** The shipped surface matches the direction contract, carries light-theme parity,
retains truthful live data and accessible status behavior, adapts navigation and tables for mobile, and
records provenance for every shipping raster.
