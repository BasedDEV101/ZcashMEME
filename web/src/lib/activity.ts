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
  marketCapLamports: string | null;
  graduated: boolean;
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

export const short = (s: string, n = 4): string => `${s.slice(0, n)}…${s.slice(-n)}`;

export const tokens = (whole: string): string => BigInt(whole || "0").toLocaleString("en-US");

export function when(unix: number | null): string {
  if (!unix) return "—";
  const mins = Math.floor((Date.now() / 1000 - unix) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(unix * 1000).toISOString().slice(0, 10);
}

export const SOLSCAN = "https://solscan.io";

/** Lamports as SOL, at a readable number of digits for a market cap. */
export function sol(lamports: string | null): string | null {
  if (lamports === null) return null;
  const n = Number(BigInt(lamports)) / 1e9;
  if (n >= 1000) return `${Math.round(n).toLocaleString("en-US")} SOL`;
  if (n >= 10) return `${n.toFixed(1)} SOL`;
  if (n >= 0.01) return `${n.toFixed(2)} SOL`;
  return `${n.toFixed(4)} SOL`;
}
