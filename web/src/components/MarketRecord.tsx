import { useId, useMemo, useState } from "react";
import { GuillocheBand } from "./Guilloche.tsx";
import { marketCap, marketCapUsd, marketCapValue, money, toBigInt, when, type ActivityCollection, type Rates } from "../lib/activity.ts";
import { CONFIG } from "../lib/config.ts";
import { useTokenDetails, type TokenDetail } from "../lib/tokenDetails.ts";

const DEX = "https://dexscreener.com/solana";

/**
 * A live market view for any priced collection on the pad.
 *
 * The former browser-local plot could not draw a useful line until a visitor
 * returned several times. DexScreener already has the real pair history, so
 * the selected token now owns a full interactive chart from the first visit.
 */
export function MarketRecord({ collections, loading, error, rates, theme }: {
  collections: ActivityCollection[];
  loading: boolean;
  error: string | null;
  rates?: Rates;
  theme: "dark" | "light";
}) {
  const id = useId();
  const [chosen, setChosen] = useState<string | null>(null);

  const priced = useMemo(
    () =>
      collections
        .filter((c) => toBigInt(c.marketCapQuote) !== null || (c.marketCapUsd !== null && c.marketCapUsd !== undefined))
        .sort((a, b) =>
          (marketCapUsd(b.marketCapQuote, b.quoteMint, rates, b.marketCapUsd)
            ?? marketCapValue(b.marketCapQuote, b.quoteMint) ?? 0)
          - (marketCapUsd(a.marketCapQuote, a.quoteMint, rates, a.marketCapUsd)
            ?? marketCapValue(a.marketCapQuote, a.quoteMint) ?? 0)),
    [collections, rates],
  );

  const coin = priced.find((c) => c.mint === chosen) ?? priced[0] ?? null;
  const details = useTokenDetails(coin ? [coin.mint] : [], "full");
  const detail = coin ? details[coin.mint] : undefined;
  const latest = coin ? marketCap(coin.marketCapQuote, coin.quoteMint, rates, coin.marketCapUsd) : null;
  const dexUrl = coin ? `${DEX}/${coin.mint}` : DEX;
  const embedUrl = coin
    ? `${DEX}/${coin.dexPairAddress ?? coin.mint}?embed=1&theme=${theme}&trades=0&info=0`
    : null;

  return (
    <section id="market" className="paper-lift scroll-mt-6 bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <h2 className="font-display text-[1.7rem] leading-none text-engrave">Live market</h2>
        {coin && (
          <a
            href={dexUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft no-underline hover:text-engrave"
          >
            Open on DexScreener
            <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M6 3h7v7M13 3 5.5 10.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11 9.5V13H3V5h3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
      </div>
      <div className="mt-5 text-engrave">
        <GuillocheBand className="h-5 w-full" />
      </div>

      {error ? (
        <Note>Could not read the chains just now — {error}. Reload in a moment.</Note>
      ) : loading ? (
        <Note>Reading both chains…</Note>
      ) : !coin || !embedUrl ? (
        <Note>No collection on the pad carries a live market yet.</Note>
      ) : (
        <>
          <div className="mt-8">
            <div className="relative w-full max-w-[32rem]">
              <label htmlFor={id} className="font-body text-[0.62rem] font-semibold tracking-[0.18em] text-ink-soft uppercase">
                Coin
              </label>
              <select
                id={id}
                value={coin.mint}
                onChange={(e) => setChosen(e.target.value)}
                className="field-rule mt-1 w-full appearance-none bg-transparent pr-9 font-display text-[1.15rem] text-ink outline-none sm:text-[1.3rem]"
              >
                {priced.map((c) => (
                  <option key={c.mint} value={c.mint}>
                    {c.symbol}{c.name ? ` — ${c.name}` : ""}
                  </option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute right-3 bottom-4 text-engrave/70">
                <svg width="11" height="7" viewBox="0 0 11 7" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M1 1 5.5 5.7 10 1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>

          </div>

          <div className="mt-6 grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="dex-chart-shell overflow-hidden rounded-xl bg-[#080808]">
              <iframe
                key={`${coin.mint}-${theme}`}
                src={embedUrl}
                title={`${coin.symbol} live chart on DexScreener`}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="dex-chart-frame block w-full border-0"
              />
            </div>

            <TokenDossier coin={coin} detail={detail} latest={latest} />
          </div>

          <p className="mt-5 max-w-[64ch] text-sm text-ink-soft">
            Live price, volume, liquidity, and trading history from DexScreener. Change the collection
            above to load its market without leaving the leaderboard.
          </p>
        </>
      )}
    </section>
  );
}

function TokenDossier({ coin, detail, latest }: {
  coin: ActivityCollection;
  detail?: TokenDetail;
  latest: string | null;
}) {
  const image = coin.mint === CONFIG.solanaMint ? "/stamp-mark-transparent.png" : detail?.image ?? coin.image;
  const links = [
    detail?.twitter ? { href: detail.twitter, label: "X", icon: "x" } : null,
    detail?.website ? { href: detail.website, label: "Website", icon: "web" } : null,
    detail?.telegram ? { href: detail.telegram, label: "Telegram", icon: "telegram" } : null,
  ].filter(Boolean) as { href: string; label: string; icon: string }[];

  return (
    <aside className="market-dossier rounded-xl bg-paper-deep/70 p-5 sm:p-6">
      <div className="flex items-center gap-4">
        {image ? (
          <img src={image} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-engrave/10 font-display text-lg font-semibold text-engrave">
            {String(coin.symbol ?? "?").slice(0, 3)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-semibold text-ink">{coin.symbol}</p>
          <p className="mt-0.5 text-sm leading-snug text-ink-soft">{coin.name}</p>
        </div>
      </div>

      <p className="mt-5 line-clamp-4 text-sm leading-relaxed text-ink-soft">
        {detail?.description ?? "No description has been published for this token."}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-engrave/15 pt-5">
        <DossierMetric label="Market cap" value={latest ?? "—"} />
        <DossierMetric label="Volume 24h" value={money(coin.volume24hUsd ?? null) ?? "—"} />
        <DossierMetric label="Holders" value={detail?.holders?.toLocaleString("en-US") ?? "Loading…"} />
        <DossierMetric label="Launched" value={when(detail?.createdAt ?? coin.launchedAt)} />
      </dl>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-engrave/15 pt-5">
        {links.length ? links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-engrave/10 px-3 text-xs font-semibold text-engrave no-underline hover:bg-engrave/15"
          >
            <SocialIcon kind={link.icon} />{link.label}
          </a>
        )) : <p className="text-xs text-ink-soft">No social links published.</p>}
      </div>
    </aside>
  );
}

function DossierMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6rem] font-semibold tracking-[0.1em] text-ink-soft uppercase">{label}</dt>
      <dd className="tnum mt-1 truncate font-data text-sm text-ink">{value}</dd>
    </div>
  );
}

function SocialIcon({ kind }: { kind: string }) {
  if (kind === "x") return <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="currentColor"><path d="M2.1 2h2.8l3.6 4.8L12.6 2h1.2L9.1 7.6 14 14h-2.8L7.4 9 3.3 14H2l4.8-5.8L2.1 2Zm2.2 1 7.4 10h1.5L5.8 3H4.3Z" /></svg>;
  if (kind === "telegram") return <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m2 7.6 11.5-4-2 9-3.2-2.5-1.8 1.6.2-2.8L11.3 5 5.7 8.2 2 7.6Z" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="5.5" /><path d="M2.8 8h10.4M8 2.5c1.5 1.5 2.2 3.3 2.2 5.5S9.5 12 8 13.5C6.5 12 5.8 10.2 5.8 8S6.5 4 8 2.5Z" /></svg>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 max-w-[58ch] text-[0.95rem] text-ink-soft">{children}</p>;
}
