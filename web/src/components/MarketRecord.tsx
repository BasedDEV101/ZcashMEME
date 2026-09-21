import { useEffect, useId, useMemo, useState } from "react";
import { GuillocheBand } from "./Guilloche.tsx";
import { MarketPlot, type PlotPoint } from "./MarketPlot.tsx";
import { marketCap, marketCapUsd, marketCapValue, toBigInt, type ActivityCollection, type Rates } from "../lib/activity.ts";
import { readings, record, type Reading } from "../lib/history.ts";

/** A date as a document prints one. */
const day = (t: number): string =>
  new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Movement between the first reading this browser took and the latest one.
 *
 * Signed, never red: stamp red belongs to cancellation, and a falling cap is
 * not a cancellation. A market cap of zero cannot be a denominator, which is
 * the ordinary state of a coin nobody has traded.
 */
function movement(series: Reading[]): string | null {
  if (series.length < 2) return null;
  const first = Number(toBigInt(series[0].value) ?? 0n);
  const last = Number(toBigInt(series[series.length - 1].value) ?? 0n);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return null;
  const pct = ((last - first) / first) * 100;
  if (Math.abs(pct) < 0.05) return "Unchanged";
  const digits = Math.abs(pct) >= 10 ? 0 : 1;
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(digits)}%`;
}

/**
 * The market record for one coin on the pad.
 *
 * The pad reads a cap from wherever the coin trades; it keeps no price
 * history, and no endpoint here can be asked for yesterday. So the series is
 * this browser's own log, written on each visit, and the section says that in
 * the plate's own words rather than letting the line imply a past it does not
 * have.
 */
export function MarketRecord({ collections, loading, error, rates }: {
  collections: ActivityCollection[];
  loading: boolean;
  error: string | null;
  rates?: Rates;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<string | null>(null);

  // Priced coins only: a coin with no cap has nothing to plot, and offering it
  // in the picker is offering an empty field.
  //
  // Ordered on the cap in its own quote units rather than on the raw integer,
  // so the figures in the list descend as the list does. A ZEC cap and a SOL
  // cap are still not the same measurement -- nothing here knows the rate --
  // but a list that reads 4,892 ZEC under 4,120 SOL looks broken, and a raw
  // sort produces exactly that from the quotes' different scales.
  const priced = useMemo(
    () =>
      collections
        .filter((c) => toBigInt(c.marketCapQuote) !== null)
        // Ordered in dollars, like the leaderboard: a raw-integer sort puts
        // a bigger ZEC coin below a smaller SOL one.
        .sort((a, b) =>
          (marketCapUsd(b.marketCapQuote, b.quoteMint, rates)
            ?? marketCapValue(b.marketCapQuote, b.quoteMint) ?? 0)
          - (marketCapUsd(a.marketCapQuote, a.quoteMint, rates)
            ?? marketCapValue(a.marketCapQuote, a.quoteMint) ?? 0)),
    [collections],
  );

  // The feed's array identity changes on every render while it is still null,
  // so the effect keys off the values instead. Recording is idempotent inside
  // its own window, but a dependency that changes every render would still
  // rewrite storage on every frame.
  const signature = priced.map((c) => `${c.mint}:${c.marketCapQuote}`).join("|");
  const [store, setStore] = useState<Record<string, Reading[]>>({});
  useEffect(() => {
    if (priced.length === 0) return;
    setStore(record(priced.map((c) => ({ mint: c.mint, raw: c.marketCapQuote }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value, see above
  }, [signature]);

  const coin = priced.find((c) => c.mint === chosen) ?? priced[0] ?? null;
  const series = readings(store, coin?.mint);
  const points: PlotPoint[] = series.map((r) => ({ t: r.t, value: r.value }));

  const latest = coin ? marketCap(coin.marketCapQuote, coin.quoteMint, rates) : null;
  const caps = series.map((r) => toBigInt(r.value) ?? 0n);
  const highRaw = caps.length ? caps.reduce((a, b) => (b > a ? b : a)).toString() : null;
  const lowRaw = caps.length ? caps.reduce((a, b) => (b < a ? b : a)).toString() : null;
  const moved = movement(series);

  const caption = coin
    ? `${coin.symbol} market cap, ${series.length} reading${series.length === 1 ? "" : "s"} taken in this browser` +
      (series.length ? `, from ${marketCap(lowRaw, coin.quoteMint, rates) ?? "—"} to ${marketCap(highRaw, coin.quoteMint, rates) ?? "—"}. Latest ${latest ?? "—"}.` : ".")
    : "No coin selected.";

  return (
    <section id="market" className="paper-lift scroll-mt-6 bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-[1.7rem] leading-none text-engrave">The market record</h2>
        <p className="font-data text-xs text-ink-soft">kept by this browser, from your first visit</p>
      </div>
      <div className="mt-5 text-engrave">
        <GuillocheBand className="h-5 w-full" />
      </div>

      {error ? (
        <Note>Could not read the chains just now — {error}. Nothing already recorded is lost.</Note>
      ) : loading ? (
        <Note>Reading both chains…</Note>
      ) : !coin ? (
        <Note>No coin on the pad carries a market cap yet. The plate opens with the first one that trades.</Note>
      ) : (
        <>
          <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-[1fr_15rem]">
            <div className="min-w-0">
              <div className="relative max-w-[26rem]">
                <label htmlFor={id} className="font-body text-[0.62rem] font-semibold tracking-[0.18em] text-ink-soft uppercase">
                  Coin
                </label>
                <select
                  id={id}
                  value={coin.mint}
                  onChange={(e) => setChosen(e.target.value)}
                  className="field-rule mt-1 w-full appearance-none bg-transparent pr-7 pb-1.5 font-display text-[1.3rem] text-ink outline-none"
                >
                  {priced.map((c) => (
                    <option key={c.mint} value={c.mint}>
                      {c.symbol}
                      {c.name ? ` — ${c.name}` : ""}
                    </option>
                  ))}
                </select>
                <span aria-hidden className="pointer-events-none absolute right-1 bottom-2.5 text-engrave/70">
                  <svg width="11" height="7" viewBox="0 0 11 7" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M1 1 5.5 5.7 10 1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>

              <div className="mt-7">
                <MarketPlot
          rates={rates} points={points} quoteMint={coin.quoteMint} caption={caption} />
              </div>

              {series.length < 2 && (
                <p className="mt-4 max-w-[58ch] text-[0.9rem] leading-relaxed text-ink-soft">
                  One reading so far, taken just now. The line draws itself as you come back — there is no
                  earlier price to plot, because the pad records burns on chain and not prices.
                </p>
              )}
            </div>

            <dl className="space-y-4 border-t border-engrave/20 pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
              <Entry label="Latest reading" value={latest ?? "—"} strong />
              {/* A high and a low that are both the only reading are three
                  copies of one figure. They appear once there is a range. */}
              {series.length > 1 && (
                <>
                  <Entry label="Highest seen" value={marketCap(highRaw, coin.quoteMint, rates) ?? "—"} />
                  <Entry label="Lowest seen" value={marketCap(lowRaw, coin.quoteMint, rates) ?? "—"} />
                </>
              )}
              <Entry label="Readings" value={tally(series)} />
              {moved && <Entry label="Since your first reading" value={moved} />}
            </dl>
          </div>

          <p className="mt-9 max-w-[64ch] border-t border-engrave/20 pt-5 text-sm text-ink-soft">
            This plate is written in your browser. Each visit appends the cap as it stands, so the record
            begins the first time you opened this page and exists nowhere else — clear your site data and
            it starts again. Caps are read in the currency the coin actually trades against.
          </p>
        </>
      )}
    </section>
  );
}

/** Readings have to read sensibly before the first one is written, during the
 *  render that happens ahead of the effect that writes it. */
function tally(series: Reading[]): string {
  if (series.length === 0) return "taking the first";
  if (series.length === 1) return "1, just now";
  return `${series.length} since ${day(series[0].t)}`;
}

function Entry({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="font-body text-[0.62rem] tracking-[0.16em] text-ink-soft uppercase">{label}</dt>
      <dd
        className={`field-rule tnum pb-1 ${
          strong ? "font-display text-[1.35rem] leading-tight text-engrave" : "font-data text-[0.82rem] text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 max-w-[58ch] text-[0.95rem] text-ink-soft">{children}</p>;
}
