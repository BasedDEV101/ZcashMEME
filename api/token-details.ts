import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "./_rpc.ts";

const TTL_MS = 2 * 60 * 1000;
const MAX_MINTS = 25;
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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

const cache = new Map<string, { at: number; detail: TokenDetail }>();

const httpsUrl = (value: unknown): string | null =>
  typeof value === "string" && /^https:\/\//.test(value) ? value : null;

async function readOne(mint: string, full: boolean): Promise<TokenDetail> {
  const prior = cache.get(`${full ? "full" : "holders"}:${mint}`);
  if (prior && Date.now() - prior.at < TTL_MS) return prior.detail;

  let holders: number | null = null;
  let description: string | null = null;
  let image: string | null = null;
  let website: string | null = null;
  let twitter: string | null = null;
  let telegram: string | null = null;
  let createdAt: number | null = null;

  const holderRequest = fetch(`https://advanced-api-v2.pump.fun/coins/top-holders-and-sol-balance/${mint}`, {
    headers: { accept: "application/json", origin: "https://pump.fun", referer: "https://pump.fun/" },
    signal: AbortSignal.timeout(6000),
  }).then(async (res) => {
    if (!res.ok) return;
    const body = (await res.json()) as { totalHolders?: number };
    if (typeof body.totalHolders === "number" && Number.isFinite(body.totalHolders)) holders = body.totalHolders;
  }).catch(() => undefined);

  const metadataRequest = full
    ? fetch(`https://frontend-api-v3.pump.fun/coins-v2/${mint}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      }).then(async (res) => {
        if (!res.ok) return;
        const coin = (await res.json()) as {
          image_uri?: string | null;
          metadata_uri?: string | null;
          website?: string | null;
          twitter?: string | null;
          telegram?: string | null;
          created_timestamp?: number | null;
        };
        image = httpsUrl(coin.image_uri);
        website = httpsUrl(coin.website);
        twitter = httpsUrl(coin.twitter);
        telegram = httpsUrl(coin.telegram);
        createdAt = typeof coin.created_timestamp === "number"
          ? Math.floor(coin.created_timestamp / 1000) : null;

        const metadataUri = httpsUrl(coin.metadata_uri);
        if (!metadataUri) return;
        try {
          const metaRes = await fetch(metadataUri, { signal: AbortSignal.timeout(5000) });
          if (!metaRes.ok) return;
          const meta = (await metaRes.json()) as {
            description?: string | null;
            image?: string | null;
            website?: string | null;
            twitter?: string | null;
            telegram?: string | null;
          };
          description = typeof meta.description === "string" && meta.description.trim()
            ? meta.description.trim() : null;
          image ??= httpsUrl(meta.image);
          website ??= httpsUrl(meta.website);
          twitter ??= httpsUrl(meta.twitter);
          telegram ??= httpsUrl(meta.telegram);
        } catch { /* base coin metadata is still usable */ }
      }).catch(() => undefined)
    : Promise.resolve();

  await Promise.all([holderRequest, metadataRequest]);
  const detail = { mint, holders, description, image, website, twitter, telegram, createdAt };
  cache.set(`${full ? "full" : "holders"}:${mint}`, { at: Date.now(), detail });
  return detail;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/api/token-details", "http://localhost");
  const mints = [...new Set((url.searchParams.get("mints") ?? "").split(","))]
    .filter((mint) => MINT.test(mint))
    .slice(0, MAX_MINTS);
  const full = url.searchParams.get("mode") === "full";
  if (mints.length === 0) return json(res, 400, { error: "No valid token addresses supplied." }, 0);

  const details = await Promise.all(mints.map((mint) => readOne(mint, full)));
  json(res, 200, { details }, 120);
}
