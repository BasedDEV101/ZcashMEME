import { useEffect, useState } from "react";

/** One coin on the pad. Totals count burns that passed the protocol rule. */
export interface ActivityCollection {
  mint: string;
  symbol: string;
  name: string | null;
  image: string | null;
  minWholeTokens: string;
  signature: string | null;
  launchedAt: number | null;
  launchedBy: string | null;
  decimals: number;
  burnedTokens: string;
  burnCount: number;
  refusedCount: number;
  burners: number;
  destroyedTokens: string | null;
  marketCapQuote: string | null;
  quoteMint: string | null;
  createdHere?: boolean;
  slot?: number;
  pricedAt?: number | null;
}

export interface ActivityBurn {
  signature: string;
  mint: string;
  symbol: string;
  slot: number;
  blockTime: number | null;
  burner: string | null;
  amount: string | null;
  zcashAddress: string | null;
  ok: boolean;
  reason?: string;
}

export interface Activity {
  collections: ActivityCollection[];
  burns: ActivityBurn[];
  feeSol: number;
  historyUpdated: string | null;
  /** When this was last rebuilt from chain. */
  computedAt?: string;
  /** True when an RPC failed and this is the last good answer instead. */
  stale?: boolean;
}

type State =
  | { status: "loading" }
  | { status: "ready"; data: Activity }
  | { status: "error"; message: string };

/**
 * Both chains, read through our endpoint rather than from the browser: the
 * scan needs a paid RPC and hundreds of calls, neither of which belongs in a
 * page load.
 */
export function useActivity(): State {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let live = true;
    fetch("/api/activity")
      .then(async (r) => {
        const body = (await r.json()) as Activity & { error?: string };
        if (!live) return;
        if (!r.ok || body.error) throw new Error(body.error ?? `HTTP ${r.status}`);
        setState({ status: "ready", data: body });
      })
      .catch((e: unknown) => live && setState({ status: "error", message: (e as Error).message }));
    return () => { live = false; };
  }, []);
  return state;
}

/**
 * A whole number from whatever the endpoint sent, or null.
 *
 * BigInt("") and BigInt(undefined) both throw, and a throw during render
 * unmounts the whole app -- the leaderboard went blank on any sort or search
 * because one collection was missing a field. The snapshot can hold rows
 * written by an older build, so a missing field is a normal thing to meet
 * rather than an impossible one.
 */
export function toBigInt(v: unknown): bigint | null {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return Number.isFinite(v) ? BigInt(Math.trunc(v)) : null;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return BigInt(v.trim());
  return null;
}

export const short = (s: string, n = 4): string =>
  typeof s === "string" && s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : String(s ?? "");

export const tokens = (whole: unknown): string => (toBigInt(whole) ?? 0n).toLocaleString("en-US");

export function when(unix: number | null | undefined): string {
  if (typeof unix !== "number" || !Number.isFinite(unix) || unix <= 0) return "—";
  const mins = Math.floor((Date.now() / 1000 - unix) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(unix * 1000).toISOString().slice(0, 10);
}

export const SOLSCAN = "https://solscan.io";

/**
 * The quotes a coin here can be priced in, and how to read their raw units.
 *
 * Coins launched now are quoted in ZEC; the ones from before are quoted in
 * SOL. A market cap therefore carries its own unit, and printing every number
 * as SOL would have quietly mislabelled the ZEC ones by a factor of ten.
 */
const QUOTES: Record<string, { symbol: string; decimals: number }> = {
  So11111111111111111111111111111111111111112: { symbol: "SOL", decimals: 9 },
  A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS: { symbol: "ZEC", decimals: 8 },
};

/**
 * A market cap in whole units of its own quote, or null.
 *
 * Comparable only against another cap in the same quote: 1 ZEC is not 1 SOL
 * and nothing here knows the rate. It exists so an ordering and the figures it
 * prints agree with each other, not to convert between the two.
 */
export function marketCapValue(raw: string | null | undefined, quoteMint: string | null | undefined): number | null {
  const value = toBigInt(raw);
  if (value === null) return null;
  // An unknown quote falls back to SOL's scale rather than to nothing: every
  // coin priced before ZEC pairing is SOL-quoted and carries no quote field.
  const quote = QUOTES[quoteMint ?? ""] ?? QUOTES.So11111111111111111111111111111111111111112;
  const n = Number(value) / 10 ** quote.decimals;
  return Number.isFinite(n) ? n : null;
}

/** A market cap in its own currency, at a readable number of digits. */
export function marketCap(raw: string | null | undefined, quoteMint: string | null | undefined): string | null {
  const n = marketCapValue(raw, quoteMint);
  if (n === null) return null;
  const quote = QUOTES[quoteMint ?? ""] ?? QUOTES.So11111111111111111111111111111111111111112;
  const digits = n >= 1000 ? 0 : n >= 10 ? 1 : n >= 0.01 ? 2 : 4;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${quote.symbol}`;
}
