import { useState } from "react";
import { SearchField } from "./Field.tsx";
import {
  SOLSCAN, marketCap, marketCapUsd, money, short, toBigInt, when,
  type ActivityCollection, type Rates,
} from "../lib/activity.ts";
import { CONFIG } from "../lib/config.ts";
import { useTokenDetails, type TokenDetail } from "../lib/tokenDetails.ts";

type Sort = "marketCap" | "volume" | "holders" | "newest" | "oldest";

const SORTS: { key: Sort; label: string; blurb: string }[] = [
  { key: "marketCap", label: "Market cap", blurb: "ranked by market cap" },
  { key: "volume", label: "24h volume", blurb: "ranked by trading volume over the last 24 hours" },
  { key: "holders", label: "Holders", blurb: "ranked by current holder count" },
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
  typeof c.slot === "number" && c.slot > 0 ? c.slot : null;

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

/** Missing or unparseable sorts last, rather than throwing mid-render. */
const big = (v: unknown): bigint => toBigInt(v) ?? -1n;

function order(
  a: ActivityCollection,
  b: ActivityCollection,
  by: Sort,
  rates: Rates | undefined,
  details: Record<string, TokenDetail>,
): number {
  switch (by) {
    case "marketCap": {
      // Ranked in dollars. Comparing the raw integers put a bigger ZEC coin
      // below a smaller SOL one: different currencies, different decimals,
      // not the same kind of number. A coin whose rate is unknown sorts last
      // rather than being given an invented value.
      const x = marketCapUsd(a.marketCapQuote, a.quoteMint, rates, a.marketCapUsd) ?? -1;
      const y = marketCapUsd(b.marketCapQuote, b.quoteMint, rates, b.marketCapUsd) ?? -1;
      return y - x;
    }
    case "volume":
      return (b.volume24hUsd ?? -1) - (a.volume24hUsd ?? -1);
    case "holders":
      return (details[b.mint]?.holders ?? -1) - (details[a.mint]?.holders ?? -1);
    case "newest":
      return bySlot(a, b, -1);
    case "oldest":
      return bySlot(a, b, 1);
    default:
      return 0;
  }
}

/** Ticker, name and mint all match, so a pasted contract address finds its coin. */
function matches(c: ActivityCollection, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const has = (v: unknown) => typeof v === "string" && v.toLowerCase().includes(q);
  return has(c.symbol) || has(c.name) || has(c.mint);
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
export function Leaderboard({ collections, loading, error, stale, rates }: {
  collections: ActivityCollection[]; loading: boolean; error: string | null;
  stale?: boolean; rates?: Rates;
}) {
  const [by, setBy] = useState<Sort>("marketCap");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  // The register's first entry, worked out from the register rather than
  // named: whichever listed coin was registered at the lowest slot is the one
  // that opened it, and stays so as coins are added.
  const firstEntry = collections
    .filter((c) => typeof c.slot === "number" && c.slot > 0)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))[0]?.mint;

  const details = useTokenDetails(collections.map((c) => c.mint));
  const found = collections.filter((c) => matches(c, query));
  const ranked = [...found].sort((a, b) => order(a, b, by, rates, details));
  // A search shows everything it found: hiding matches behind "show more"
  // makes the field feel broken.
  const searching = query.trim().length > 0;
  const shown = searching || expanded ? ranked : ranked.slice(0, PAGE);
  const blurb = SORTS.find((s) => s.key === by)!.blurb;

  return (
    <section className="paper-lift bg-paper px-6 py-9 sm:px-10 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <h2 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-[2.6rem]">Leaderboard</h2>
          <p className="mt-2 text-sm text-ink-soft">{blurb}</p>
        </div>
        <p className="font-data text-xs text-ink-soft">{collections.length.toLocaleString("en-US")} collections</p>
      </div>

      <div className="mt-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between xl:gap-8">
        <div className="flex flex-wrap gap-2">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setBy(s.key)}
              aria-pressed={by === s.key}
              className={`sort-chip ${
                by === s.key ? "sort-chip-active" : ""
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="w-full xl:max-w-[24rem]">
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
        <div className="mt-7 overflow-x-auto rounded-xl bg-paper-deep/45">
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-engrave/15">
                <th className="w-14 px-4 py-3 table-heading">Rank</th>
                <th className="px-4 py-3 table-heading">Collection</th>
                <SortableHeading label="Market cap" sort="marketCap" active={by} onSort={setBy} />
                <SortableHeading label="Volume 24h" sort="volume" active={by} onSort={setBy} />
                <SortableHeading label="Holders" sort="holders" active={by} onSort={setBy} />
                <SortableHeading label="Launched" sort="newest" active={by} onSort={setBy} />
              </tr>
            </thead>
            <tbody>
              {shown.map((c, i) => (
                <LeaderboardRow
                  key={c.mint}
                  collection={c}
                  rank={searching ? null : i + 1}
                  rates={rates}
                  first={c.mint === firstEntry}
                  detail={details[c.mint]}
                />
              ))}
            </tbody>
          </table>
        </div>
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
        Market cap and rolling 24-hour volume come from each coin’s most liquid indexed pair. Holder counts
        are read from the live token register and may take a moment to appear after the table loads.
      </p>
    </section>
  );
}

function SortableHeading({ label, sort, active, onSort }: {
  label: string;
  sort: Sort;
  active: Sort;
  onSort: (sort: Sort) => void;
}) {
  return (
    <th className="px-4 py-3 table-heading">
      <button type="button" onClick={() => onSort(sort)} className={active === sort ? "text-engrave" : "hover:text-ink"}>
        <span>{label}</span>
        {active === sort && (
          <svg viewBox="0 0 12 12" aria-hidden className="ml-1 inline size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 2v7M3.5 6.5 6 9l2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </th>
  );
}

function LeaderboardRow({ collection: c, rank, rates, first, detail }: {
  collection: ActivityCollection;
  rank: number | null;
  rates?: Rates;
  first?: boolean;
  detail?: TokenDetail;
}) {
  const image = c.mint === CONFIG.solanaMint ? "/stamp-mark-transparent.png" : c.image;
  return (
    <tr className="border-b border-engrave/10 transition-colors last:border-b-0 hover:bg-engrave/[0.045]">
      <td className="tnum px-4 py-4 font-data text-xs text-ink-soft">{rank === null ? "—" : String(rank).padStart(2, "0")}</td>
      <td className="px-4 py-4">
        <div className="flex min-w-[15rem] items-center gap-3">
      {image ? (
            <img src={image} alt="" loading="lazy" className="size-10 shrink-0 rounded-lg object-cover" />
      ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-engrave/10 font-display text-[0.8rem] font-semibold text-engrave">
          {String(c.symbol ?? "?").slice(0, 2)}
        </span>
      )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
          <a
            href={`${SOLSCAN}/token/${c.mint}`}
            target="_blank"
            rel="noreferrer"
                className="font-display text-base font-semibold text-ink no-underline hover:text-engrave"
          >
            {c.symbol}
          </a>
          {first && (
                  <span className="rounded-full bg-engrave/10 px-2 py-0.5 text-[0.58rem] font-semibold tracking-[0.08em] text-engrave uppercase">
              First entry
            </span>
          )}
            </div>
            <p className="mt-0.5 max-w-48 truncate text-xs text-ink-soft">{c.name ?? short(c.mint, 5)}</p>
          </div>
        </div>
      </td>
      <MetricCell value={marketCap(c.marketCapQuote, c.quoteMint, rates, c.marketCapUsd) ?? "—"} />
      <MetricCell value={money(c.volume24hUsd ?? null) ?? "—"} />
      <MetricCell value={detail?.holders?.toLocaleString("en-US") ?? "…"} />
      <td className="tnum px-4 py-4 font-data text-xs whitespace-nowrap text-ink-soft">{when(c.launchedAt)}</td>
    </tr>
  );
}

function MetricCell({ value }: { value: string }) {
  return (
    <td className="tnum px-4 py-4 font-data text-sm whitespace-nowrap text-ink">
      {value}
    </td>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 max-w-[58ch] text-[0.95rem] text-ink-soft">{children}</p>;
}
