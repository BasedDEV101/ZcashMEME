# Design

The durable visual system. Product truth lives in PRODUCT.md; the route strategy that produced this world
is in `.impeccable/surfaces/home.md`.

## World

**Certificate of Destruction.** Central-bank note cancellation and industrial destruction records. A burn
is a cancellation, so the interface is the cancellation document rather than a page describing one. The
category default it refuses: near-black ground, neon accent, glass cards, 3D coin, Connect Wallet top
right. The literate opposite it also refuses: the terminal.

Chosen by the operator over the assigned roll (Fire Insurance Mark), raised by the challengers it beat —
poster-scale dominance from Movida Scene Magazine, page-scale colour commitment from Silk Colour Chords.

## Colour

Full-surface commitment, not accents on neutral. Safety paper carries every region.

| Token | Value | Role |
|---|---|---|
| `--color-paper` | `#f2ede1` | the document itself |
| `--color-paper-deep` | `#e7dfcd` | the desk the document lies on |
| `--color-ink` | `#2a2724` | body and figures |
| `--color-ink-soft` | `#5d574c` | labels and secondary text |
| `--color-engrave` | `#1b3a2f` | structure: headings, rules, guilloche |
| `--color-stamp` | `#d8455f` | **reserved**: cancellation and irreversible action only |

Stamp red is never decoration. It appears on the CANCELLED mark, the burn control, and destructive
warnings. If it appears anywhere else, that is a bug.

Light, not dark, decided from the scene: a document read in daylight by someone about to destroy something
of theirs.

## Type

- **Display — Bodoni Moda.** A didone, because engraved numerals on securities are didone. Carries the
  amount, which is the largest element on the page.
- **Body — Libre Franklin.** A workhorse grotesque that stays out of the document's way.
- **Data — Courier Prime.** Serials, addresses, signatures and amounts: measurement, not costume. Always
  with `font-variant-numeric: tabular-nums` so figures align down a column.

Self-hosted via `@fontsource`. No CDN.

## Components

Document parts, never cards:

- **Ruled field** (`.field-rule`) — a form's line, drawn as a background gradient so it belongs to the
  paper rather than being a border around a box.
- **Counterfoil** — the stub beside the certificate, separated by a real **perforation** (`.perforation`,
  a repeating radial gradient that turns horizontal below `lg`).
- **Rubber stamp** (`.stamped`) — off-angle, `mix-blend-mode: multiply`, never crisp.
- **Guilloche** — genuinely drawn: a hypotrochoid traced at high resolution, as a rose engine lathe cuts
  it. Two nested rosettes at different ratios give the moire. A ratio that closes early degenerates into a
  sparse polygon; keep the turn count high.
- **Paper lift** (`.paper-lift`) — offset plus real blur. No coloured halo, no hard offset shadow.

## Motion

One authored moment: the cancellation lands like a struck stamp (`.strike-in`, 460ms, exponential
ease-out, from an already-visible default). Everything else is state, not entrance. Honours
`prefers-reduced-motion`.

## Browser surfaces

Themed from the palette rather than left to the browser: selection, caret, accent colour, scrollbar,
focus ring, link underline offset.

## Verified

Built and inspected at 1440×900 and 390×844: no horizontal overflow at either size, no console errors,
CANCELLED legible against the numerals it previously obscured.
