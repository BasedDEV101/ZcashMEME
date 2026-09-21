---
name: Zcash Shielded Assets
description: A dark-first on-chain stamp terminal for permanent, verifiable burns.
colors:
  pixel-night: "#080706"
  night-panel: "#12100e"
  panel-edge: "#2a2118"
  warm-ink: "#f7efe2"
  muted-ink: "#b7a791"
  molten-gold: "#ff9a1f"
  aged-gold: "#d67722"
  burn-orange: "#f25516"
  hot-orange: "#ff6a21"
  action-orange: "#ff781f"
  action-orange-hover: "#ff942f"
  action-ink: "#160b04"
  light-paper: "#fffaf1"
  light-ground: "#f1e7d7"
  light-edge: "#d9c9b2"
  light-ink: "#21170f"
  light-muted: "#6f5b49"
  light-gold: "#9f450f"
  light-gold-soft: "#bb651f"
  light-orange: "#b83a0e"
  light-orange-hot: "#a8320e"
typography:
  display:
    fontFamily: "Space Grotesk, Libre Franklin, system-ui, sans-serif"
    fontSize: "clamp(3rem, 7.5vw, 6rem)"
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Space Grotesk, Libre Franklin, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Space Grotesk, Libre Franklin, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Space Grotesk, Libre Franklin, system-ui, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.12em"
  data:
    fontFamily: "Courier Prime, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "tnum"
rounded:
  control: "10px"
  action: "12px"
  panel: "16px"
spacing:
  compact: "8px"
  control: "12px"
  content: "24px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.action-orange}"
    textColor: "{colors.action-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "11px 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.action-orange-hover}"
  button-secondary:
    backgroundColor: "{colors.warm-ink}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.action}"
    padding: "11px 18px"
    height: "44px"
  field:
    backgroundColor: "{colors.pixel-night}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.action}"
    padding: "12px 14px"
  panel:
    backgroundColor: "{colors.night-panel}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.panel}"
    padding: "24px"
---

# Design System: Zcash Shielded Assets

## Overview

**Creative North Star: "On-Chain Stamp Terminal"**

A burn becomes a permanent on-chain stamp. The product lives in a near-black pixel night lit by molten
orange and gold, with perforated stamp geometry, compact controls, and dense ledger tables. It is an
operational market surface with authored evidence, not a centered white certificate and not a generic
neon trading page.

The interface is dark by default, with a complete light option. Brand character comes from the clipped
stamp mark, perforations, ledger typography, warm data light, and the authored stamp-sunset hero image;
interaction patterns remain compact, legible, and familiar.

**Key Characteristics:**

- Dark-first pixel night with warm orange and gold hierarchy.
- Space Grotesk for interface voice; Courier Prime for public-chain evidence.
- Perforated stamp geometry paired with compact, Shadcn-style controls.
- Wide asymmetric storytelling above dense, sortable market records.
- Light theme parity, 44px touch targets, and status announcements for asynchronous work.

## Colors

The dark palette is normative; the light-paper set remaps the same semantic roles without changing
hierarchy. Molten gold structures the interface, while burn orange is reserved for primary action,
irreversibility, and the stamp identity.

**The Warm Signal Rule.** Orange and gold must communicate action, status, or verified emphasis; they are
not ambient neon decoration.

**The Theme Parity Rule.** Dark is the default, but every text, control, border, and focus treatment must
remain legible in the light option.

## Typography

**Display and Body Font:** Space Grotesk (with Libre Franklin, system-ui, sans-serif fallbacks)

**Data Font:** Courier Prime (with ui-monospace, monospace fallbacks)

**Character:** Space Grotesk makes the terminal direct and contemporary without impersonating a command
line. Courier Prime turns addresses, amounts, timestamps, and contract data into measured evidence.

### Hierarchy

- **Display:** Hero statements only; tightly tracked and allowed to dominate the first viewport.
- **Headline:** Route and major section titles; compact, semibold, and left aligned.
- **Body:** Explanations and risk copy; keep long passages near 64ch.
- **Label:** Compact uppercase metadata and table headings; never use it for paragraphs.
- **Data:** Tabular numerals for amounts and rankings; allow addresses and hashes to wrap or truncate only
  when the full value remains available elsewhere in context.

**The Evidence Type Rule.** Anything copied from or verified against a chain uses Courier Prime and
tabular numerals; interface instructions stay in Space Grotesk.

## Layout

The application uses a centered fluid shell capped at 94rem, with 16px mobile gutters that grow to 32px
on large screens. Panels follow a 24px vertical rhythm, and their internal padding expands from 24px to
40–56px where the viewport permits.

The home first viewport is deliberately asymmetric: live HTML copy, actions, totals, and contract data
occupy the left while authored stamp-sunset art occupies the right. Live network statistics sit directly
below. Operational content then moves into split panels and dense ledgers without hiding navigation or
context.

At phone widths, navigation becomes two rows: brand and theme remain in the first row, while the primary
routes fill a second row. Statistics collapse to two columns, wide tables scroll horizontally, and every
coarse-pointer target is at least 44px high.

## Elevation & Depth

Depth is structural and restrained. Dark tonal layers separate ground, panels, fields, and hover states;
16px panels use a broad low shadow, while the sticky navigation uses a translucent night surface and
18px backdrop blur. The hero may use a directional black shade to preserve live-text contrast over its
image. There are no colored glows or glass-card stacks.

**The Grounded Panel Rule.** A shadow may lift a whole working surface; it must not turn every row or
metric into a floating card.

## Shapes

Panels use soft 16px corners. Controls use compact 10–12px corners, with the same radius family applied to
inputs, sort chips, market links, and theme controls. The clipped stamp dot and repeating perforations are
the signature silhouettes; pills are limited to small state badges.

**The Stamp Edge Rule.** Perforation and clipped-edge motifs identify stamps and boundaries; do not apply
them indiscriminately to ordinary controls.

## Components

### Buttons

- **Primary:** Molten action orange, dark text, 12px corners, and a 44px minimum height. Hover brightens
  and lifts by 1px; focus uses the shared high-contrast outline.
- **Secondary:** Warm light fill with dark text for parallel non-destructive actions.
- **Ghost:** Fine translucent border and fill for lower-priority actions over the hero.
- **Irreversible:** Burn and launch submission controls use the stamp color, explicit copy, and visible
  disabled states; color never carries the warning alone.

### Chips

Sort chips are 10px controls with a quiet outline. The active sort gains a gold-tinted surface and gold
text, while `aria-pressed` exposes the same state non-visually. The contract chip uses Courier Prime for
the address and Space Grotesk for its `CA` and copy affordances.

### Cards / Containers

Use 16px working panels, not repeated marketing cards. Major panels hold headings, forms, tables, or proof;
row separation comes from rules and tonal shifts. Dense ledger tables live in a lightly inset container
and remain horizontally scrollable on narrow screens.

### Inputs / Fields

Fields use a dark tonal inset, a low-contrast gold border, and 12px corners. Hover increases border
contrast; focus shifts the border to molten gold and uses the global outline. Addresses and numerical
inputs use the data face. Errors and progress appear in atomic live regions with `alert` or `status`
semantics as appropriate.

### Navigation

The sticky navigation pairs the clipped stamp brand with compact route controls. DEX, Fomo, and X use
icon-plus-label controls on desktop; the supplied Fomo eyes remain a small mark, never hero imagery. On
mobile, the route controls form a second full-width row instead of a clipped horizontal strip.

### Ledger

Leaderboards and activity feeds are dense but truthful. The leaderboard exposes sortable market cap,
24-hour volume, holder count, and launch time; missing or incomparable values sort last rather than being
fabricated. Column labels remain visible, numeric values align, and supporting copy explains what each
metric counts.

The compact network strip is limited to the flagship's current market cap, protocol burn volume, and
tokens launched through the pad. Wallet and certificate counts belong in deeper records rather than
competing with those three headline decisions.

### Stamp Hero

The hero is a wide authored scene, not a text baked into a raster. Copy, calls to action, live totals, and
the contract address remain semantic HTML on the left; `stamp-hero-v2.png` supplies the sunset stamp world
on the right under a contrast-preserving shade.

## Do's and Don'ts

### Do:

- **Do** keep primary work inside the 94rem shell and the established 24px panel rhythm.
- **Do** preserve live proof, market activity, launch or burn actions, and verification without a context
  break.
- **Do** keep tables sortable, figures tabular, missing data honest, and asynchronous status announced.
- **Do** maintain dark and light theme parity and 44px touch targets on coarse pointers.
- **Do** preserve raster provenance in the owning surface brief.

### Don't:

- **Don't** revert to a centered white certificate or a generic neon trading-page composition.
- **Don't** bake actionable copy, amounts, addresses, or proof into imagery.
- **Don't** scatter orange as decoration, add colored glow, or wrap every metric in a floating card.
- **Don't** imply market, privacy, or verification facts that the live data cannot support.
