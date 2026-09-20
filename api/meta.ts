// Serve a coin's metadata from our own domain.
//
// pump.fun stores the metadata URI inside the create instruction, and that
// instruction rides in a transaction already within 18 bytes of Solana's
// 1232-byte limit. A Vercel Blob URL is ~113 characters; this one is ~40, and
// those 73 bytes are what leaves room for a coin with a long name.
//
// The blob stays the source of truth — this only fetches it.

import type { IncomingMessage, ServerResponse } from "node:http";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const slug = (new URL(req.url ?? "/", "https://x").searchParams.get("slug") ?? "")
    .replace(/\.json$/, "");
  if (!/^[a-z0-9]{1,32}$/.test(slug)) {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Not a metadata slug." }));
    return;
  }

  try {
    const { list } = await import("@vercel/blob");
    const found = await list({ prefix: `coins/${slug}.json`, limit: 1 });
    const blob = found.blobs.find((b) => b.pathname === `coins/${slug}.json`);
    if (!blob) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "No such coin." }));
      return;
    }
    const upstream = await fetch(blob.url, { signal: AbortSignal.timeout(5000) });
    const body = await upstream.text();
    res.statusCode = upstream.ok ? 200 : 502;
    res.setHeader("content-type", "application/json");
    // Metadata never changes once written, so it can be cached hard.
    res.setHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("access-control-allow-origin", "*");
    res.end(body);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}
