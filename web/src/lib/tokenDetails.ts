import { useEffect, useMemo, useState } from "react";

export interface TokenDetail {
  mint: string;
  holders: number | null;
  description: string | null;
  image: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  createdAt: number | null;
}

const EMPTY: Record<string, TokenDetail> = {};

export function useTokenDetails(mints: string[], mode: "holders" | "full" = "holders") {
  const key = useMemo(() => [...new Set(mints)].sort().join(","), [mints.join(",")]);
  const [details, setDetails] = useState<Record<string, TokenDetail>>(EMPTY);

  useEffect(() => {
    if (!key) { setDetails(EMPTY); return; }
    const controller = new AbortController();
    const all = key.split(",");
    const batches = Array.from({ length: Math.ceil(all.length / 25) }, (_, i) => all.slice(i * 25, (i + 1) * 25));

    void (async () => {
      const next: Record<string, TokenDetail> = {};
      for (const batch of batches) {
        try {
          const res = await fetch(`/api/token-details?mints=${encodeURIComponent(batch.join(","))}&mode=${mode}`, {
            signal: controller.signal,
          });
          if (!res.ok) continue;
          const body = await res.json() as { details?: TokenDetail[] };
          for (const detail of body.details ?? []) next[detail.mint] = detail;
          if (!controller.signal.aborted) setDetails({ ...next });
        } catch {
          if (controller.signal.aborted) return;
        }
      }
    })();

    return () => controller.abort();
  }, [key, mode]);

  return details;
}
