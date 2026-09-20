import { useState } from "react";
import { GuillocheBand } from "./Guilloche.tsx";
import { SOLSCAN, sol, tokens, when, type ActivityCollection } from "../lib/activity.ts";

type Sort = "burns" | "marketCap" | "destroyed" | "newest";

const SORTS: { key: Sort; label: string; blurb: string }[] = [
  { key: "burns", label: "Burns", blurb: "ranked by tokens destroyed for a certificate" },
  { key: "marketCap", label: "Market cap", blurb: "ranked by bonding-curve market cap" },
  { key: "destroyed", label: "Supply gone", blurb: "ranked by every token destroyed, certificate or not" },
  { key: "newest", label: "Newest", blurb: "most recently launched first" },
];

const big = (v: string | null): bigint => (v === null ? -1n : BigInt(v));

function order(a: ActivityCollection, b: ActivityCollection, by: Sort): number {
  switch (by) {
    case "marketCap": {
      // A graduated coin has no curve price, so it sorts below priced coins
      // rather than being given a number we would have had to invent.
      const d = big(b.marketCapLamports) - big(a.marketCapLamports);
      return d === 0n ? 0 : d > 0n ? 1 : -1;
    }
    case "destroyed": {
      const d = big(b.destroyedTokens) - big(a.destroyedTokens);
      return d === 0n ? 0 : d > 0n ? 1 : -1;
    }
    case "newest":
      return (b.launchedAt ?? 0) - (a.launchedAt ?? 0);
    default: {
      const d = BigInt(b.burnedTokens) - BigInt(a.burnedTokens);
      return d === 0n ? (b.launchedAt ?? 0) - (a.launchedAt ?? 0) : d > 0n ? 1 : -1;
    }
  }
}

/**
 * Every coin on the pad, ranked however you ask.
 *
 * Burns is the default because it is the one thing this pad does that a
 * market cap cannot tell you: a coin nobody burns has no certificates behind
 * it however it trades.
 */
export function Leaderboard({ collections, loading, error, stale }: {
  collections: ActivityCollection[]; loading: boolean; error: string | null; stale?: boolean;
}) {
  const [by, setBy] = useState<Sort>("burns");
  const ranked = [...collections].sort((a, b) => order(a, b, by));
  const blurb = SORTS.find((s) => s.key === by)!.blurb;

  return (
    <section className="paper-lift bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-[1.7rem] leading-none text-engrave">The leaderboard</h2>
        <p className="font-data text-xs text-ink-soft">{blurb}</p>
      </div>
      <div className="mt-5 text-engrave">
        <GuillocheBand className="h-5 w-full" />
      </div>

      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setBy(s.key)}
            aria-pressed={by === s.key}
            className={`font-body text-[0.66rem] font-semibold tracking-[0.16em] uppercase transition-colors ${
              by === s.key ? "text-engrave underline underline-offset-[6px]" : "text-ink-soft hover:text-engrave"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error ? (
        <Note>Could not read the chains just now — {error}. Nothing is lost; reload in a moment.</Note>
      ) : loading ? (
        <Note>Reading both chains…</Note>
      ) : ranked.length === 0 ? (
        <Note>No coins on the pad yet. The first one launched is the first one listed.</Note>
      ) : (
        <ol className="mt-7 space-y-px">
          {ranked.map((c, i) => (
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
                  {secondary(c, by)}
                </p>
              </div>

              <div className="col-span-3 text-left sm:col-span-1 sm:pl-6 sm:text-right">
                <p className="tnum font-display text-[1.3rem] leading-none text-engrave">
                  {headline(c, by)}
                </p>
                <p className="mt-1 font-body text-[0.6rem] tracking-[0.16em] text-ink-soft uppercase">
                  {caption(c, by)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {stale && (
        <p className="mt-5 max-w-[66ch] font-data text-xs text-ink-soft">
          Showing the most recent complete reading: Solana did not answer on the last refresh.
        </p>
      )}

      <p className="mt-6 max-w-[66ch] text-sm text-ink-soft">
        Burns count only what passed the same rule the bridge uses — a real, finalised burn of that mint,
        above its minimum, with one memo naming a Zcash address. Supply gone counts every token destroyed,
        including burns that earned nothing. Market cap is read from wherever the coin actually trades — its bonding
        curve, or its pump.fun pool once it is on one — and is blank when there is no honest price to
        read.
      </p>
    </section>
  );
}

function headline(c: ActivityCollection, by: Sort): string {
  if (by === "marketCap") return sol(c.marketCapLamports) ?? "—";
  if (by === "destroyed") return c.destroyedTokens === null ? "—" : tokens(c.destroyedTokens);
  if (by === "newest") return when(c.launchedAt);
  return tokens(c.burnedTokens);
}

function caption(c: ActivityCollection, by: Sort): string {
  if (by === "marketCap") return "market cap";
  if (by === "destroyed") return "supply destroyed";
  if (by === "newest") return "launched";
  return `destroyed · ${c.burnCount} ${c.burnCount === 1 ? "certificate" : "certificates"}`;
}

function secondary(c: ActivityCollection, by: Sort): string {
  const bits: string[] = [];
  if (by !== "burns") {
    bits.push(`${tokens(c.burnedTokens)} burned · ${c.burnCount} ${c.burnCount === 1 ? "certificate" : "certificates"}`);
  } else {
    bits.push(`${c.burners} ${c.burners === 1 ? "holder has" : "holders have"} burned`);
    const cap = sol(c.marketCapLamports);
    if (cap) bits.push(cap);
  }
  bits.push(`minimum ${tokens(c.minWholeTokens)}`);
  if (by !== "newest" && c.launchedAt) bits.push(`launched ${when(c.launchedAt)}`);
  if (c.refusedCount > 0) bits.push(`${c.refusedCount} refused`);
  return bits.join(" · ");
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 max-w-[58ch] text-[0.95rem] text-ink-soft">{children}</p>;
}
