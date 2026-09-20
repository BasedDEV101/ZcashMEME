import { GuillocheBand } from "./Guilloche.tsx";
import { SOLSCAN, tokens, when, type ActivityCollection } from "../lib/activity.ts";

const PUMP = "https://pump.fun/coin";

/**
 * The most recent coins on the pad, newest first.
 *
 * Separate from the leaderboard on purpose: that one ranks by burns, so a coin
 * launched a minute ago sits at the bottom of it however interesting it is.
 * Someone arriving wants to see that the pad is alive, which is a different
 * question from which coin is winning.
 */
export function LatestCoins({ collections, loading, error, limit = 6, onMore }: {
  collections: ActivityCollection[];
  loading: boolean;
  error: string | null;
  limit?: number;
  onMore?: () => void;
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
        <p className="font-data text-xs text-ink-soft">newest first</p>
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
        <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {newest.map((c) => (
            <li key={c.mint} className="flex gap-4 border-t border-engrave/20 pt-5">
              {c.image ? (
                <img
                  src={c.image}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-full border border-engrave/25 object-cover"
                />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-engrave/25 font-display text-base text-engrave/70">
                  {c.symbol.slice(0, 2)}
                </span>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-lg leading-tight text-ink">{c.symbol}</span>
                  <span className="font-data text-[0.68rem] text-ink-soft">{when(c.launchedAt)}</span>
                </div>
                {c.name && <p className="truncate text-[0.88rem] text-ink-soft">{c.name}</p>}
                <p className="mt-1 font-data text-[0.68rem] text-ink-soft">
                  burn {tokens(c.minWholeTokens)} for a certificate
                </p>
                <p className="mt-2 flex flex-wrap gap-x-4">
                  <a
                    href={`${PUMP}/${c.mint}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-body text-[0.62rem] font-semibold tracking-[0.14em] text-engrave uppercase no-underline hover:underline hover:underline-offset-[4px]"
                  >
                    pump.fun
                  </a>
                  <a
                    href={`${SOLSCAN}/token/${c.mint}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-body text-[0.62rem] tracking-[0.14em] text-ink-soft uppercase no-underline hover:text-engrave hover:underline hover:underline-offset-[4px]"
                  >
                    contract
                  </a>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {onMore && (
        <button
          type="button"
          onClick={onMore}
          className="mt-7 font-body text-[0.68rem] font-semibold tracking-[0.18em] text-engrave uppercase underline underline-offset-[6px]"
        >
          The whole leaderboard
        </button>
      )}
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 max-w-[58ch] text-[0.95rem] text-ink-soft">{children}</p>;
}
