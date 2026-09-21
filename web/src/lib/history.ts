import { toBigInt } from "./activity.ts";

/** One market cap as it stood when this browser read it. Raw quote units. */
export interface Reading {
  t: number;
  value: string;
}

/**
 * Market cap history, kept in this browser.
 *
 * There is no price history endpoint: /api/activity answers with the cap as it
 * is now and nothing before it. So the series is accumulated here, one reading
 * per visit, and it genuinely begins the first time you open the page. Every
 * surface that shows it has to say so — a plot that implies we held the last
 * month would be a lie the data cannot back.
 */
const KEY = "zip227.market-history.v1";

/** Roughly a fortnight of reloads. Past this the oldest readings fall off. */
const MAX_READINGS = 240;

/** Coins tracked at once. The register runs to hundreds; the quota does not. */
const MAX_MINTS = 48;

/**
 * Two readings closer together than this are the same reading. A reload storm,
 * or React running an effect twice in development, would otherwise stack a
 * dozen identical points on the same minute and call it a trend.
 */
const MIN_GAP_MS = 5 * 60_000;

type Store = Record<string, Reading[]>;

/**
 * Storage is not guaranteed to exist. Safari in private browsing throws on
 * setItem, an extension can replace localStorage wholesale, and the stored
 * value may be whatever an older build wrote. Every path through here treats a
 * failure as "no history", never as an error worth showing.
 */
function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [mint, series] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(series)) out[mint] = series.filter(isReading);
    }
    return out;
  } catch {
    return {};
  }
}

function isReading(v: unknown): v is Reading {
  if (!v || typeof v !== "object") return false;
  const r = v as { t?: unknown; value?: unknown };
  return typeof r.t === "number" && Number.isFinite(r.t) && r.t > 0 && toBigInt(r.value) !== null;
}

function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota, private browsing, or no storage at all. The plot degrades to the
    // readings already in memory rather than the page breaking over it.
  }
}

/** Latest first reading time, used to decide which coin to forget. */
const lastSeen = (series: Reading[]): number => series[series.length - 1]?.t ?? 0;

/**
 * Append the current cap for each coin, and return the whole store.
 *
 * Every priced coin is recorded, not only the one on screen, so switching the
 * picker shows a series that started when you first opened the page rather
 * than when you first looked at that coin.
 */
export function record(caps: { mint: string; raw: string | null | undefined }[], now = Date.now()): Store {
  const store = load();

  for (const { mint, raw } of caps) {
    const value = toBigInt(raw);
    if (value === null || !mint) continue;
    const series = store[mint] ?? [];
    const last = series[series.length - 1];
    if (last && last.value === value.toString() && now - last.t < MIN_GAP_MS) continue;
    if (last && now - last.t < 0) continue; // a clock that went backwards
    series.push({ t: now, value: value.toString() });
    store[mint] = series.length > MAX_READINGS ? series.slice(-MAX_READINGS) : series;
  }

  const mints = Object.keys(store);
  if (mints.length > MAX_MINTS) {
    const keep = mints
      .sort((a, b) => lastSeen(store[b]) - lastSeen(store[a]))
      .slice(0, MAX_MINTS);
    const trimmed: Store = {};
    for (const mint of keep) trimmed[mint] = store[mint];
    save(trimmed);
    return trimmed;
  }

  save(store);
  return store;
}

/** Everything this browser has seen for one coin, oldest first. */
export function readings(store: Store, mint: string | null | undefined): Reading[] {
  if (!mint) return [];
  return [...(store[mint] ?? [])].sort((a, b) => a.t - b.t);
}
