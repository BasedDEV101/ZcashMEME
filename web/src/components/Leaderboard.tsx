import { useState } from "react";
import { GuillocheBand } from "./Guilloche.tsx";
import { SearchField } from "./Field.tsx";
import { SOLSCAN, short, sol, tokens, when, type ActivityCollection } from "../lib/activity.ts";

type Sort = "burns" | "marketCap" | "destroyed" | "newest" | "oldest";

const SORTS: { key: Sort; label: string; blurb: string }[] = [
  { key: "burns", label: "Burns", blurb: "ranked by tokens destroyed for a certificate" },
  { key: "marketCap", label: "Market cap", blurb: "ranked by market cap" },
  { key: "destroyed", label: "Supply gone", blurb: "ranked by every token destroyed, certificate or not" },
  { key: "newest", label: "Newest", blurb: "most recently launched first" },
  { key: "oldest", label: "Oldest", blurb: "the register from its first entry" },
];

/**
 * A coin's place in the register: the slot it was registered at.
 *
 * Ordered by this rather than by block time, because it is the register's own
 * sequence and cannot tie. A coin with no registration slot -- the flagship,
 * which predates the pad -- has no place in that sequence and sorts last
 * either way round rather than claiming one end of it.
 */
const place = (c: ActivityCollection): number | null =>
  c.slot && c.slot > 0 ? c.slot : null;

function bySlot(a: ActivityCollection, b: ActivityCollection, direction: 1 | -1): number {
  const x = place(a);
  const y = place(b);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return (x - y) * direction;
}

/** Rows shown before asking. The register runs to hundreds; the screen does not. */
const PAGE = 20;

const big = (v: string | null): bigint => (v === null ? -1n : BigInt(v));

function order(a: ActivityCollection, b: ActivityCollection, by: Sort): number {
  switch (by) {
    case "marketCap": {
      const d = big(b.marketCapLamports) - big(a.marketCapLamports);
      return d === 0n ? 0 : d > 0n ? 1 : -1;
    }
    case "destroyed": {
      const d = big(b.destroyedTokens) - big(a.destroyedTokens);
      return d === 0n ? 0 : d > 0n ? 1 : -1;
    }
    case "newest":
      return bySlot(a, b, -1);
    case "oldest":
      return bySlot(a, b, 1);
    default: {
      const d = BigInt(b.burnedTokens) - BigInt(a.burnedTokens);
      return d === 0n ? (b.launchedAt ?? 0) - (a.launchedAt ?? 0) : d > 0n ? 1 : -1;
    }
  }
}

/** Ticker, name and mint all match, so a pasted contract address finds its coin. */
function matches(c: ActivityCollection, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    c.symbol.toLowerCase().includes(q) ||
    (c.name ?? "").toLowerCase().includes(q) ||
    c.mint.toLowerCase().includes(q)
  );
}

/**
 * Every coin on the pad, ranked however you ask.
 *
 * Burns is the default because it is the one thing this pad does that a market
 * cap cannot tell you: a coin nobody burns has no certificates behind it
 * however it trades.
 *
 * Only the first twenty are printed. The register runs to hundreds of coins,
 * and a page that prints all of them is one nobody reads to the end of — the
 * search field is how you reach a specific coin, not scrolling.
 */
export function Leaderboard({ collections, loading, error, stale }: {
  collections: ActivityCollection[]; loading: boolean; error: string | null; stale?: boolean;
}) {
  const [by, setBy] = useState<Sort>("burns");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  // The register's first entry, worked out from the register rather than
  // named: whichever listed coin was registered at the lowest slot is the one
  // that opened it, and stays so as coins are added.
  const firstEntry = collections
    .filter((c) => (c.slot ?? 0) > 0)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))[0]?.mint;

  const found = collections.filter((c) => matches(c, query));
  const ranked = [...found].sort((a, b) => order(a, b, by));
  // A search shows everything it found: hiding matches behind "show more"
  // makes the field feel broken.
  const searching = query.trim().length > 0;
  const shown = searching || expanded ? ranked : ranked.slice(0, PAGE);
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

      <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
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
        <div className="w-full sm:max-w-[22rem]">
          <SearchField
            value={query}
            onChange={setQuery}
            label="Search coins by name, ticker or contract address"
            placeholder="Name, ticker or contract"
            count={searching ? `${found.length}` : undefined}
          />
        </div>
      </div>

      {error ? (
        <Note>Could not read the chains just now — {error}. Nothing is lost; reload in a moment.</Note>
      ) : loading ? (
        <Note>Reading both chains…</Note>
      ) : collections.length === 0 ? (
        <Note>No coins on the pad yet. The first one launched is the first one listed.</Note>
      ) : shown.length === 0 ? (
        <Note>Nothing matches “{query.trim()}”. Try a ticker, a name, or a full contract address.</Note>
      ) : (
        <ol className="mt-7">
          {shown.map((c, i) => (
            <Row
              key={c.mint}
              collection={c}
              rank={searching ? null : i + 1}
              by={by}
              first={c.mint === firstEntry}
            />
          ))}
        </ol>
      )}

      {!searching && !expanded && ranked.length > PAGE && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-6 font-body text-[0.68rem] font-semibold tracking-[0.18em] text-engrave uppercase underline underline-offset-[6px] transition-colors hover:text-stamp-deep"
        >
          All {ranked.length} coins
        </button>
      )}

      {stale && (
        <p className="mt-5 max-w-[66ch] font-data text-xs text-ink-soft">
          Showing the most recent complete reading: Solana did not answer on the last refresh.
        </p>
      )}

      <p className="mt-6 max-w-[66ch] text-sm text-ink-soft">
        Burns count only what passed the same rule the bridge uses — a real, finalised burn of that mint,
        above its minimum, with one memo naming a Zcash address. Supply gone counts every token destroyed,
        including burns that earned nothing. Market cap is read from wherever the coin actually trades.
      </p>
    </section>
  );
}

function Row({ collection: c, rank, by, first }: {
  collection: ActivityCollection; rank: number | null; by: Sort; first?: boolean;
}) {
  return (
    <li className="grid grid-cols-[2rem_2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-engrave/12 py-3.5 first:border-t first:border-engrave/25">
      <span className="tnum font-display text-[1.05rem] leading-none text-engrave/50">
        {rank === null ? "" : String(rank).padStart(2, "0")}
      </span>

      {c.image ? (
        <img src={c.image} alt="" loading="lazy" className="h-10 w-10 border border-engrave/25 object-cover" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center border border-engrave/25 font-display text-[0.8rem] text-engrave/55">
          {c.symbol.slice(0, 2)}
        </span>
      )}

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <a
            href={`${SOLSCAN}/token/${c.mint}`}
            target="_blank"
            rel="noreferrer"
            className="font-display text-[1.05rem] leading-tight text-ink no-underline transition-colors hover:text-engrave hover:underline hover:underline-offset-4"
          >
            {c.symbol}
          </a>
          {c.name && <span className="truncate text-[0.85rem] text-ink-soft">{c.name}</span>}
          {first && (
            <span className="shrink-0 border border-engrave/35 px-1.5 py-[1px] font-body text-[0.52rem] font-semibold tracking-[0.14em] text-engrave uppercase">
              First entry
            </span>
          )}
        </div>
        <p className="tnum mt-0.5 font-data text-[0.66rem] text-ink-soft">
          {short(c.mint, 5)}
          {c.launchedAt && by !== "newest" && by !== "oldest" && <> · {when(c.launchedAt)}</>}
          {c.burners > 0 && <> · {c.burners} burning</>}
          {c.refusedCount > 0 && <> · {c.refusedCount} refused</>}
        </p>
      </div>

      <div className="text-right">
        <p className="tnum font-display text-[1.15rem] leading-none text-engrave">{headline(c, by)}</p>
        <p className="mt-1 font-body text-[0.58rem] tracking-[0.14em] text-ink-soft uppercase">
          {caption(c, by)}
        </p>
      </div>
    </li>
  );
}

function headline(c: ActivityCollection, by: Sort): string {
  if (by === "marketCap") return sol(c.marketCapLamports) ?? "—";
  if (by === "destroyed") return c.destroyedTokens === null ? "—" : tokens(c.destroyedTokens);
  if (by === "newest" || by === "oldest") return when(c.launchedAt);
  return tokens(c.burnedTokens);
}

function caption(c: ActivityCollection, by: Sort): string {
  if (by === "marketCap") return "market cap";
  if (by === "destroyed") return "supply destroyed";
  if (by === "newest" || by === "oldest") return "launched";
  return c.burnCount === 1 ? "burned · 1 certificate" : `burned · ${c.burnCount} certificates`;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 max-w-[58ch] text-[0.95rem] text-ink-soft">{children}</p>;
}
