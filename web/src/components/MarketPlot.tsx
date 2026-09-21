import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { marketCap, toBigInt } from "../lib/activity.ts";

export interface PlotPoint {
  t: number;
  value: bigint | string;
}

interface Point {
  t: number;
  n: number;
  raw: string;
}

/** Courier Prime is monospaced at a 0.6em advance, so a label's width is
 *  arithmetic rather than a measurement. */
const ADVANCE = 0.6;

/**
 * A reading the plot can place, or nothing.
 *
 * Raw caps arrive as integer strings and a malformed one used to take the
 * whole page down through BigInt(). Anything that does not convert is dropped
 * here, once, rather than guarded at every use below.
 */
function clean(points: PlotPoint[] | null | undefined): Point[] {
  const out: Point[] = [];
  for (const p of points ?? []) {
    const value = toBigInt(p?.value);
    if (value === null || value < 0n) continue;
    const t = Number(p?.t);
    if (!Number.isFinite(t) || t <= 0) continue;
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    out.push({ t, n, raw: value.toString() });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Real pixel coordinates, not a scaled viewBox.
 *
 * A plate is engraved at the size it is printed: a 0.5px hairline drawn in a
 * 720-wide viewBox and squeezed into 330px of phone is no longer a hairline,
 * and the label beside it is no longer readable.
 */
function useWidth(box: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box]);
  return width;
}

const DAY = 86_400_000;
const clock = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * How the two dates under the field are written, decided by the span they
 * cover rather than by a fixed threshold.
 *
 * Bare clock times are only unambiguous inside one calendar day: 16:16 beside
 * 03:36 reads as a span of four hours when it was eleven. Once the readings
 * run past a few days the time stops carrying anything and the date is enough.
 */
function stamper(from: number, to: number): (t: number) => string {
  const sameDay = new Date(from).toDateString() === new Date(to).toDateString();
  const span = to - from;
  return (t) => {
    const d = new Date(t);
    if (!Number.isFinite(d.getTime())) return "—";
    if (sameDay) return clock(d);
    return span < 5 * DAY ? `${date(d)} ${clock(d)}` : date(d);
  };
}

/**
 * Market cap over time, engraved as a plate on the certificate.
 *
 * The field is ruled like a form, the area under the line is hatched the way
 * an engraver shades a solid, and the last reading carries a drop line to the
 * base rule. No axis invents a value: the two figures in the gutter are real
 * readings, printed through the same formatter as every other cap on the site
 * so a ZEC-quoted coin is never labelled in SOL.
 */
export function MarketPlot({
  points,
  quoteMint,
  height = 212,
  caption,
}: {
  points: PlotPoint[];
  quoteMint: string | null;
  height?: number;
  caption: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const hatch = useId();
  const series = clean(points);

  const fs = width < 520 ? 9 : 10.5;
  const top = 12;
  const foot = 20;
  const plotH = Math.max(40, height - top - foot);
  const base = top + plotH;

  const peak = series.reduce<Point | null>((a, b) => (a === null || b.n > a.n ? b : a), null);
  const trough = series.reduce<Point | null>((a, b) => (a === null || b.n < a.n ? b : a), null);
  const flat = peak !== null && trough !== null && peak.n === trough.n;
  const high = peak ? marketCap(peak.raw, quoteMint) : null;
  const low = trough ? marketCap(trough.raw, quoteMint) : null;

  // The gutter is exactly as wide as the widest figure it has to hold, which
  // a monospaced face lets us compute instead of guess.
  const longest = Math.max(high?.length ?? 0, flat ? 0 : (low?.length ?? 0));
  const gutter = longest > 0 ? Math.ceil(longest * fs * ADVANCE) + 9 : 0;
  const plotW = Math.max(60, width - gutter);

  const t0 = series[0]?.t ?? 0;
  const span = (series[series.length - 1]?.t ?? 0) - t0;
  // One reading sits at the right edge, where "now" is: it is the current
  // level, not the start of a line that does not exist yet.
  const x = (p: Point, i: number): number =>
    series.length < 2 ? plotW : span > 0 ? (p.t - t0) / span * plotW : (i / (series.length - 1)) * plotW;

  let lo = trough?.n ?? 0;
  let hi = peak?.n ?? 0;
  if (hi === lo) {
    // A cap that has not moved is a real answer. Pad the domain so the line
    // sits across the middle of the field rather than on one of its rules.
    const pad = hi === 0 ? 1 : Math.abs(hi) * 0.08;
    lo -= pad;
    hi += pad;
  }
  const y = (n: number): number => top + (1 - (n - lo) / (hi - lo)) * plotH;

  const placed = series.map((p, i) => ({ ...p, x: x(p, i), y: y(p.n) }));
  const line = placed.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const area = placed.length > 1
    ? `${line} L${placed[placed.length - 1].x.toFixed(2)} ${base} L${placed[0].x.toFixed(2)} ${base} Z`
    : "";
  const last = placed[placed.length - 1];
  const written = stamper(t0, last?.t ?? t0);

  return (
    <figure className="m-0">
      <div ref={box} className="w-full text-engrave">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={caption}
            className="block"
          >
            <defs>
              <pattern id={hatch} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d="M0 0V7" stroke="currentColor" strokeWidth="0.7" opacity="0.3" />
              </pattern>
            </defs>

            <g stroke="currentColor" fill="none">
              {/* The ruled field: two heavy rules top and bottom, faint lines
                  between, as on ledger paper. */}
              {[1, 2, 3].map((k) => (
                <path key={k} d={`M0 ${(top + (plotH * k) / 4).toFixed(2)}H${plotW.toFixed(2)}`} strokeWidth="0.6" opacity="0.13" />
              ))}
              {Array.from({ length: 7 }, (_, k) => k + 1).map((k) => (
                <path key={`v${k}`} d={`M${((plotW * k) / 8).toFixed(2)} ${top}V${base}`} strokeWidth="0.6" opacity="0.08" />
              ))}
              <path d={`M0 ${top}H${plotW.toFixed(2)}`} strokeWidth="0.9" opacity="0.38" />
              <path d={`M0 ${base}H${plotW.toFixed(2)}`} strokeWidth="1.1" opacity="0.5" />
            </g>

            {area && <path d={area} fill={`url(#${hatch})`} stroke="none" />}

            {placed.length === 1 && (
              // A single reading is a level, not a trend. The dashed rule says
              // "here is where it stands", and refuses to draw a slope.
              <path
                d={`M0 ${last.y.toFixed(2)}H${plotW.toFixed(2)}`}
                stroke="currentColor"
                strokeWidth="1.1"
                strokeDasharray="3 4"
                opacity="0.55"
                fill="none"
              />
            )}

            {placed.length > 1 && (
              <path d={line} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" fill="none" />
            )}

            {last && (
              <g stroke="currentColor" fill="none">
                <path d={`M${last.x.toFixed(2)} ${last.y.toFixed(2)}V${base}`} strokeWidth="0.8" opacity="0.4" />
                <circle cx={last.x} cy={last.y} r="3" strokeWidth="1.4" fill="var(--color-paper)" />
              </g>
            )}

            <g fill="currentColor" stroke="none" fontSize={fs} opacity="0.66" className="tnum font-data">
              {high && gutter > 0 && (
                <text x={plotW + 9} y={flat ? last.y + fs * 0.36 : top + fs * 0.9}>{high}</text>
              )}
              {low && gutter > 0 && !flat && <text x={plotW + 9} y={base}>{low}</text>}
              {series.length > 1 && <text x={0} y={height - 5}>{written(t0)}</text>}
              {last && (
                <text x={plotW} y={height - 5} textAnchor="end">
                  {series.length > 1 ? written(last.t) : "first reading"}
                </text>
              )}
            </g>
          </svg>
        )}
        {width === 0 && <div style={{ height }} aria-hidden />}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}
