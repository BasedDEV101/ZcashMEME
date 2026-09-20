// Host a coin's image and metadata JSON.
//
// pump.fun's own IPFS endpoint refuses third-party callers: CORS from a
// browser, and a Cloudflare 403 server-side even with browser headers. Their
// `uri` field is just a URL though, so we host the metadata and hand them
// ours.
//
// Needs BLOB_READ_WRITE_TOKEN (Vercel dashboard -> Storage -> Blob). Without
// it the route says so plainly rather than failing at the moment someone is
// creating a coin.

import { put } from "@vercel/blob";

export const config = { runtime: "nodejs" };

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "POST an image and coin details." }, 405);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json({ error: "Storage is not configured on this deployment yet." }, 503);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Expected multipart form data." }, 400);
  }

  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const symbol = String(form.get("symbol") ?? "").trim().toUpperCase();
  const description = String(form.get("description") ?? "").trim();
  const website = String(form.get("website") ?? "").trim();
  const twitter = String(form.get("twitter") ?? "").trim();

  if (!(file instanceof File)) return json({ error: "An image is required." }, 400);
  if (!ALLOWED.has(file.type)) return json({ error: "Image must be PNG, JPEG, GIF or WebP." }, 400);
  if (file.size > MAX_IMAGE_BYTES) return json({ error: "Image must be under 2 MB." }, 400);
  if (!name || name.length > 32) return json({ error: "Name must be 1-32 characters." }, 400);
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return json({ error: "Ticker must be 1-10 letters or digits." }, 400);
  for (const [label, url] of [["Website", website], ["X link", twitter]] as const) {
    if (url && !/^https:\/\/[^\s]+$/.test(url)) return json({ error: `${label} must be an https URL.` }, 400);
  }

  const slug = `${symbol.toLowerCase()}-${Date.now().toString(36)}`;
  const ext = file.type.split("/")[1].replace("jpeg", "jpg");

  const image = await put(`coins/${slug}.${ext}`, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: true,
  });

  // The shape pump.fun and Solana wallets read.
  const metadata = {
    name,
    symbol,
    description,
    image: image.url,
    showName: true,
    ...(website ? { website } : {}),
    ...(twitter ? { twitter } : {}),
    createdOn: "https://www.zcashstamp.com",
  };

  const meta = await put(`coins/${slug}.json`, JSON.stringify(metadata, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: true,
  });

  return json({ uri: meta.url, image: image.url, metadata });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
