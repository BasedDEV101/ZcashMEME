import { GuillocheBand } from "./Guilloche.tsx";
import { SOLSCAN, short, tokens, when, type ActivityBurn } from "../lib/activity.ts";

/**
 * Every burn against a collection on the pad, refusals included.
 *
 * The refusals are shown rather than hidden on purpose: a burn that failed the
 * rule is the clearest possible statement of what the rule is, and hiding them
 * would make the feed look like a promise instead of a record.
 */
export function Burns({ burns, loading, error, limit, onMore }: {
  burns: ActivityBurn[]; loading: boolean; error: string | null;
  limit?: number; onMore?: () => void;
}) {
  const shown = limit ? burns.slice(0, limit) : burns;
  const valid = burns.filter((b) => b.ok);
  const destroyed = valid.reduce((n, b) => n + BigInt(b.amount ?? "0"), 0n);

  return (
    <section id="burns" className="paper-lift scroll-mt-6 bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-[1.7rem] leading-none text-engrave">Every burn</h2>
        {!loading && !error && burns.length > 0 && (
          <p className="tnum font-data text-xs text-ink-soft">
            {tokens(destroyed.toString())} tokens destroyed across {valid.length}{" "}
            {valid.length === 1 ? "certificate" : "certificates"}
          </p>
        )}
      </div>
      <div className="mt-5 text-engrave">
        <GuillocheBand className="h-5 w-full" />
      </div>

      {error ? (
        <Note>Could not read Solana just now — {error}. Nothing is lost; reload in a moment.</Note>
      ) : loading ? (
        <Note>Reading Solana…</Note>
      ) : shown.length === 0 ? (
        <Note>No burns yet. The first one is recorded here the moment it finalises.</Note>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-engrave/30">
                {["When", "Coin", "Destroyed", "Burner", "Certificate to", ""].map((h, i) => (
                  <th
                    key={i}
                    className="pb-2 font-body text-[0.62rem] font-semibold tracking-[0.16em] text-ink-soft uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.signature} className="border-b border-engrave/12 align-top">
                  <td className="tnum py-3.5 pr-6 font-data text-[0.75rem] whitespace-nowrap text-ink-soft">
                    {when(b.blockTime)}
                  </td>
                  <td className="py-3.5 pr-6 font-display text-base whitespace-nowrap text-ink">{b.symbol}</td>
                  <td className="tnum py-3.5 pr-6 font-data text-sm whitespace-nowrap text-ink">
                    {b.amount ? tokens(b.amount) : "—"}
                  </td>
                  <td className="tnum py-3.5 pr-6 font-data text-[0.75rem] whitespace-nowrap text-ink-soft">
                    {b.burner ? short(b.burner) : "—"}
                  </td>
                  <td className="py-3.5 pr-6">
                    {b.ok ? (
                      <span className="tnum font-data text-[0.75rem] break-all text-ink">{b.zcashAddress}</span>
                    ) : (
                      <span className="text-[0.8rem] text-ink-soft">{b.reason}</span>
                    )}
                  </td>
                  <td className="py-3.5 whitespace-nowrap">
                    {!b.ok && (
                      <span className="stamped inline-block px-2 py-0.5 font-display text-[0.6rem] leading-none">
                        REFUSED
                      </span>
                    )}
                    <a
                      href={`${SOLSCAN}/tx/${b.signature}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 font-body text-[0.62rem] tracking-[0.14em] text-ink-soft uppercase no-underline hover:text-engrave hover:underline"
                    >
                      tx
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {onMore && burns.length > shown.length && (
        <button
          type="button"
          onClick={onMore}
          className="mt-6 font-body text-[0.68rem] font-semibold tracking-[0.18em] text-engrave uppercase underline underline-offset-[6px]"
        >
          All {burns.length} burns
        </button>
      )}

      <p className="mt-6 max-w-[66ch] text-sm text-ink-soft">
        Read from Solana, judged by the same rule the bridge uses. A refused burn still destroyed its
        tokens — the rule only decides whether a certificate is owed, and it cannot give them back.
      </p>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 max-w-[58ch] text-[0.95rem] text-ink-soft">{children}</p>;
}
