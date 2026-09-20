// Host a coin's image and metadata JSON.
//
// pump.fun's own IPFS endpoint refuses third-party callers: CORS from a
// browser, and a Cloudflare 403 server-side even with browser headers. Their
// `uri` is just a URL, so we host the metadata and hand them ours.
//
// Classic (req, res) signature: a handler returning a Response hangs the
// request on this project's configuration. The image arrives base64 in JSON
// rather than multipart, so there is no form parsing to get wrong.
//
// Needs BLOB_READ_WRITE_TOKEN (Vercel dashboard -> Storage -> Blob).

import type { IncomingMessage, ServerResponse } from "node:http";
import { put } from "@vercel/blob";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
};

interface Body {
  name?: string; symbol?: string; description?: string;
  website?: string; twitter?: string;
  imageBase64?: string; imageType?: string;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const send = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };

  if (req.method !== "POST") return send(405, { error: "POST the coin details." });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return send(503, { error: "Image storage is not configured on this deployment yet." });
  }

  let body: Body;
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Body;
  } catch {
    return send(400, { error: "Expected JSON." });
  }

  const name = (body.name ?? "").trim();
  const symbol = (body.symbol ?? "").trim().toUpperCase();
  const description = (body.description ?? "").trim();
  const website = (body.website ?? "").trim();
  const twitter = (body.twitter ?? "").trim();
  const imageType = body.imageType ?? "";

  if (!name || name.length > 32) return send(400, { error: "Name must be 1-32 characters." });
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return send(400, { error: "Ticker must be 1-10 letters or digits." });
  if (!EXT[imageType]) return send(400, { error: "Image must be PNG, JPEG, GIF or WebP." });
  for (const [label, url] of [["Website", website], ["X link", twitter]] as const) {
    if (url && !/^https:\/\/\S+$/.test(url)) return send(400, { error: `${label} must be an https URL.` });
  }

  let image: Buffer;
  try {
    image = Buffer.from(body.imageBase64 ?? "", "base64");
  } catch {
    return send(400, { error: "The image could not be read." });
  }
  if (image.length === 0) return send(400, { error: "An image is required." });
  if (image.length > MAX_IMAGE_BYTES) return send(400, { error: "Image must be under 2 MB." });

  try {
    const slug = `${symbol.toLowerCase()}-${Date.now().toString(36)}`;
    const stored = await put(`coins/${slug}.${EXT[imageType]}`, image, {
      access: "public", contentType: imageType, addRandomSuffix: true,
    });
    const metadata = {
      name, symbol, description, image: stored.url, showName: true,
      ...(website ? { website } : {}),
      ...(twitter ? { twitter } : {}),
      createdOn: "https://www.zcashstamp.com",
    };
    const meta = await put(`coins/${slug}.json`, JSON.stringify(metadata, null, 2), {
      access: "public", contentType: "application/json", addRandomSuffix: true,
    });
    return send(200, { uri: meta.url, image: stored.url, metadata });
  } catch (e) {
    return send(502, { error: `Storing the image failed: ${(e as Error).message}` });
  }
}
