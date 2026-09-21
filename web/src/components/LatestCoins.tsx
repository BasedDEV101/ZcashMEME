import { marketCap, money, tokens, when, type ActivityCollection, type Rates } from "../lib/activity.ts";
import { useTokenDetails, type TokenDetail } from "../lib/tokenDetails.ts";

const PUMP = "https://pump.fun/coin";

/**
 * The most recent coins on the pad, newest first.
 *
 * Separate from the leaderboard on purpose: that one ranks by burns, so a coin
 * launched a minute ago sits at the bottom of it however interesting it is.
 * Someone arriving wants to see the pad is alive, which is a different
 * question from which coin is winning.
 *
 * Each coin is a vignette — the portrait plate on an engraved document — and
 * the whole plate is the link. The previous version printed the minimum burn
 * and two link labels under every single coin, which is the same sentence
 * nine times: the eye reads the repetition instead of the coins. The minimum
 * is the same for all of them and belongs in the line underneath, once.
 */
export function LatestCoins({ collections, loading, error, limit = 8, onMore, rates }: {
  collections: ActivityCollection[];
  loading: boolean;
  error: string | null;
  limit?: number;
  onMore?: () => void;
  rates?: Rates;
}) {
  // The feed arrives ranked by burns; this view wants launch order.
  const newest = [...collections]
    .filter((c) => c.launchedAt !== null)
    .sort((a, b) => (b.launchedAt ?? 0) - (a.launchedAt ?? 0))
    .slice(0, limit);
  const details = useTokenDetails(newest.map((c) => c.mint), "full");

  return (
    <section id="new" className="paper-lift scroll-mt-6 bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-[2.6rem]">Just launched</h2>
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            className="font-body text-[0.66rem] font-semibold tracking-[0.16em] text-engrave uppercase underline underline-offset-[5px] transition-colors hover:text-stamp-deep"
          >
            All coins
          </button>
        )}
      </div>
      {error ? (
        <Note>Could not read Solana just now — {error}. Reload in a moment.</Note>
      ) : loading ? (
        <Note>Reading Solana…</Note>
      ) : newest.length === 0 ? (
        <Note>No coins launched here yet. Yours would be the first.</Note>
      ) : (
        <>
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {newest.map((c) => (
              <li key={c.mint} className="group">
                <a
                  href={`${PUMP}/${c.mint}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block no-underline"
                >
                  <Plate collection={c} />
                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <span className="truncate font-display text-[1.15rem] leading-none text-ink transition-colors group-hover:text-engrave">
                      {c.symbol}
                    </span>
                    <span className="tnum shrink-0 font-data text-[0.66rem] text-ink-soft">
                      {when(c.launchedAt)}
                    </span>
                  </div>
                  {c.name && (
                    <p className="mt-1 truncate text-[0.82rem] text-ink-soft">{c.name}</p>
                  )}
                </a>
                <dl className="mt-3 grid grid-cols-3 gap-x-2 border-t border-engrave/12 pt-3">
                  <Metric label="Market cap" value={marketCap(c.marketCapQuote, c.quoteMint, rates, c.marketCapUsd) ?? "—"} />
                  <Metric label="Volume 24h" value={money(c.volume24hUsd ?? null) ?? "—"} />
                  <Metric label="Holders" value={details[c.mint]?.holders?.toLocaleString("en-US") ?? "…"} />
                </dl>
                <SocialLinks detail={details[c.mint]} />
              </li>
            ))}
          </ul>

          <p className="mt-9 max-w-[64ch] border-t border-engrave/20 pt-5 text-sm text-ink-soft">
            Every one of these was created here, and its collection registered on Zcash in the same
            signature. Holders burn at least{" "}
            {tokens(newest[0].minWholeTokens)} tokens for a certificate.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * The portrait plate. Rectangular and ruled, not a circular avatar: the circle
 * is the social-app convention for a person, and these are objects printed on
 * a document.
 */
function Plate({ collection }: { collection: ActivityCollection }) {
  if (collection.image) {
    return (
      <div className="relative aspect-square w-full overflow-hidden border border-engrave/30 bg-paper-deep">
        <img
          src={collection.image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-[filter,transform] duration-500 ease-out group-hover:scale-[1.03]"
        />
      </div>
    );
  }
  return (
    <div className="flex aspect-square w-full items-center justify-center border border-engrave/30 bg-paper-deep">
      <span className="font-display text-[1.6rem] text-engrave/45">
        {String(collection.symbol ?? "?").slice(0, 3)}
      </span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 max-w-[58ch] text-[0.95rem] text-ink-soft">{children}</p>;
}

function SocialLinks({ detail }: { detail?: TokenDetail }) {
  const links = [
    detail?.twitter ? { href: detail.twitter, label: "X", icon: "x" } : null,
    detail?.website ? { href: detail.website, label: "Website", icon: "web" } : null,
    detail?.telegram ? { href: detail.telegram, label: "Telegram", icon: "telegram" } : null,
  ].filter(Boolean) as { href: string; label: string; icon: string }[];

  return (
    <div className="mt-3 flex min-h-6 items-center gap-2" aria-label="Social links">
      {links.length ? links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          aria-label={link.label}
          className="inline-flex size-7 items-center justify-center rounded-md bg-engrave/10 text-engrave no-underline transition-colors hover:bg-engrave/20"
          title={link.label}
        >
          {link.icon === "x" ? (
            <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="currentColor"><path d="M2.1 2h2.8l3.6 4.8L12.6 2h1.2L9.1 7.6 14 14h-2.8L7.4 9 3.3 14H2l4.8-5.8L2.1 2Zm2.2 1 7.4 10h1.5L5.8 3H4.3Z" /></svg>
          ) : link.icon === "telegram" ? (
            <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m2 7.6 11.5-4-2 9-3.2-2.5-1.8 1.6.2-2.8L11.3 5 5.7 8.2 2 7.6Z" strokeLinejoin="round" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="5.5" /><path d="M2.8 8h10.4M8 2.5c1.5 1.5 2.2 3.3 2.2 5.5S9.5 12 8 13.5C6.5 12 5.8 10.2 5.8 8S6.5 4 8 2.5Z" /></svg>
          )}
        </a>
      )) : <span className="text-[0.65rem] text-ink-soft">No socials listed</span>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.58rem] font-semibold tracking-[0.07em] text-ink-soft uppercase">{label}</dt>
      <dd className="tnum truncate font-data text-[0.7rem] text-ink">{value}</dd>
    </div>
  );
}
