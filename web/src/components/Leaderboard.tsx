import { GuillocheBand } from "./Guilloche.tsx";
import { SOLSCAN, tokens, when, type ActivityCollection } from "../lib/activity.ts";

/**
 * Every coin on the pad, ranked by how much of it has actually been destroyed.
 *
 * Deliberately not ranked by market cap or supply change: the one thing this
 * pad does is turn burns into certificates, so the ranking is burns that
 * passed the rule. A coin nobody burns sits at the bottom however it trades.
 */
export function Leaderboard({ collections, loading, error }: {
  collections: ActivityCollection[]; loading: boolean; error: string | null;
}) {
  return (
    <section className="paper-lift bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-[1.7rem] leading-none text-engrave">The leaderboard</h2>
        <p className="font-data text-xs text-ink-soft">ranked by tokens destroyed</p>
      </div>
      <div className="mt-5 text-engrave">
        <GuillocheBand className="h-5 w-full" />
      </div>

      {error ? (
        <Note>Could not read the chains just now — {error}. Nothing is lost; reload in a moment.</Note>
      ) : loading ? (
        <Note>Reading both chains…</Note>
      ) : collections.length === 0 ? (
        <Note>No coins on the pad yet. The first one launched is the first one listed.</Note>
      ) : (
        <ol className="mt-8 space-y-px">
          {collections.map((c, i) => (
            <li
              key={c.mint}
              className="grid grid-cols-[2.5rem_2.75rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-engrave/12 py-4 sm:grid-cols-[2.5rem_3.25rem_minmax(0,1fr)_auto]"
            >
              <span className="tnum self-start pt-1 font-display text-[1.35rem] leading-none text-engrave/55">
                {String(i + 1).padStart(2, "0")}
              </span>

              {c.image ? (
                <img
                  src={c.image}
                  alt=""
                  className="h-11 w-11 self-start rounded-full border border-engrave/25 object-cover sm:h-13 sm:w-13"
                />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center self-start rounded-full border border-engrave/25 font-display text-sm text-engrave/70 sm:h-13 sm:w-13">
                  {c.symbol.slice(0, 2)}
                </span>
              )}

              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  <span className="font-display text-lg leading-tight text-ink">{c.symbol}</span>
                  {c.name && <span className="truncate text-[0.88rem] text-ink-soft">{c.name}</span>}
                </div>
                <a
                  href={`${SOLSCAN}/token/${c.mint}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tnum font-data text-[0.68rem] break-all text-ink-soft no-underline hover:text-engrave hover:underline"
                >
                  {c.mint}
                </a>
                <p className="mt-1 font-data text-[0.68rem] text-ink-soft">
                  {c.burners} {c.burners === 1 ? "holder has" : "holders have"} burned
                  {" · "}minimum {tokens(c.minWholeTokens)}
                  {c.launchedAt && <> · launched {when(c.launchedAt)}</>}
                  {c.refusedCount > 0 && <> · {c.refusedCount} refused</>}
                </p>
              </div>

              <div className="col-span-3 text-left sm:col-span-1 sm:pl-6 sm:text-right">
                <p className="tnum font-display text-[1.3rem] leading-none text-engrave">
                  {tokens(c.burnedTokens)}
                </p>
                <p className="mt-1 font-body text-[0.6rem] tracking-[0.16em] text-ink-soft uppercase">
                  destroyed · {c.burnCount} {c.burnCount === 1 ? "certificate" : "certificates"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-6 max-w-[66ch] text-sm text-ink-soft">
        Totals count burns that passed the same rule the bridge uses — a real, finalised burn of that mint,
        above its minimum, with one memo naming a Zcash address. Tokens destroyed any other way are not
        counted here, because they earn nothing.
      </p>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 max-w-[58ch] text-[0.95rem] text-ink-soft">{children}</p>;
}
