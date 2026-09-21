import { GuillocheBand } from "./Guilloche.tsx";
import { marketCap, tokens, when, type ActivityCollection, type Rates } from "../lib/activity.ts";

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

  return (
    <section id="new" className="paper-lift scroll-mt-6 bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-[1.7rem] leading-none text-engrave">Just launched</h2>
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
      <div className="mt-5 text-engrave">
        <GuillocheBand className="h-5 w-full" />
      </div>

      {error ? (
        <Note>Could not read Solana just now — {error}. Reload in a moment.</Note>
      ) : loading ? (
        <Note>Reading Solana…</Note>
      ) : newest.length === 0 ? (
        <Note>No coins launched here yet. Yours would be the first.</Note>
      ) : (
        <>
          <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {newest.map((c) => (
              <li key={c.mint}>
                <a
                  href={`${PUMP}/${c.mint}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group block no-underline"
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
                  <p className="tnum mt-0.5 font-data text-[0.7rem] text-engrave-soft">
                    {marketCap(c.marketCapQuote, c.quoteMint, rates) ?? "—"}
                  </p>
                </a>
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
