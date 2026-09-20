// Collection deployment records.
//
// A launchpad needs a registry of which Solana mint maps to which collection.
// Putting that in a database would make us the authority on what exists, which
// is the opposite of how stamps work. So a collection is deployed the same way
// a stamp is minted: by an inscription.
//
//   {"p":"zsam","op":"deploy","v":1,"mint":"<solana mint>","sym":"<ticker>",
//    "dec":6,"min":"<minimum burn, raw>","by":"<zcash t-addr>"}
//
// The indexer discovers collections by reading the chain. Anyone can rebuild
// the registry and get the same answer, and nobody needs our permission to
// appear in it.

import { parseTransparentAddress, type ZcashNetwork } from "./zcash-address.ts";

export const OP_DEPLOY = "deploy";

/**
 * Deploy records are delivered to one fixed address so the registry can be
 * discovered by listing that address's outputs, rather than scanning every
 * block for inscriptions (which lightwalletd cannot serve).
 *
 * The address is the hash of a fixed phrase, so no private key for it exists:
 * a deploy inscription sent there can never be moved or spent away, and the
 * registry cannot be edited after the fact. Anyone may inscribe to it; nobody
 * can remove an entry.
 */
export const REGISTRY_PHRASE = "zsam registry v1 -- deploy records only, no key exists";
export const VERSION = 1;

export interface CollectionContent {
  p: string;
  op: typeof OP_DEPLOY;
  v: typeof VERSION;
  mint: string;     // Solana mint this collection burns
  sym: string;      // ticker, 1-10 chars, as displayed
  dec: number;      // mint decimals, must match chain
  min: bigint;      // minimum burn in raw base units
  by: string;       // deployer's Zcash transparent address
}

export function encodeCollection(c: CollectionContent): string {
  return (
    `{"p":${JSON.stringify(c.p)},"op":"${OP_DEPLOY}","v":${VERSION},` +
    `"mint":${JSON.stringify(c.mint)},"sym":${JSON.stringify(c.sym)},` +
    `"dec":${c.dec},"min":"${c.min.toString()}","by":${JSON.stringify(c.by)}}`
  );
}

export function encodeCollectionBytes(c: CollectionContent): Uint8Array {
  return new TextEncoder().encode(encodeCollection(c));
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const SYMBOL = /^[A-Za-z0-9]{1,10}$/;

/** Parse a deploy record. Returns null unless the bytes are the canonical encoding. */
export function parseCollection(bytes: Uint8Array, protocol: string): CollectionContent | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const want = ["p", "op", "v", "mint", "sym", "dec", "min", "by"];
  const keys = Object.keys(o);
  if (keys.length !== want.length || !want.every((k) => keys.includes(k))) return null;
  if (o.p !== protocol || o.op !== OP_DEPLOY || o.v !== VERSION) return null;
  if (typeof o.mint !== "string" || typeof o.sym !== "string" || typeof o.by !== "string") return null;
  if (typeof o.dec !== "number" || !Number.isInteger(o.dec) || o.dec < 0 || o.dec > 18) return null;
  if (typeof o.min !== "string" || !DECIMAL.test(o.min)) return null;
  if (!SYMBOL.test(o.sym)) return null;
  if (!parseTransparentAddress(o.by)) return null;

  const c: CollectionContent = {
    p: o.p, op: OP_DEPLOY, v: VERSION,
    mint: o.mint, sym: o.sym, dec: o.dec, min: BigInt(o.min), by: o.by,
  };
  if (encodeCollection(c) !== text) return null;
  return c;
}

export interface DeployedCollection extends CollectionContent {
  inscriptionId: string;
  height: number;
}

export interface Registry {
  collections: DeployedCollection[];
  rejected: { inscriptionId: string; reason: string }[];
}

export interface CollectionCandidate {
  inscriptionId: string;
  height: number;
  txIndex: number;
  index: number;
  content: Uint8Array;
  contentType: string;
}

/**
 * Build the registry from deploy inscriptions in chain order.
 *
 * FIRST DEPLOY WINS for a given mint. Without that rule anyone could redeploy
 * a live collection with a different minimum and split its history. A later
 * duplicate is rejected, not merged.
 */
export function buildRegistry(
  candidates: CollectionCandidate[],
  protocol: string,
  network: ZcashNetwork,
): Registry {
  const collections: DeployedCollection[] = [];
  const rejected: Registry["rejected"] = [];
  const claimed = new Set<string>();

  const ordered = [...candidates].sort(
    (a, b) => a.height - b.height || a.txIndex - b.txIndex || a.index - b.index,
  );
  for (const cand of ordered) {
    if (cand.contentType !== "application/json") {
      rejected.push({ inscriptionId: cand.inscriptionId, reason: "wrong content type" });
      continue;
    }
    const c = parseCollection(cand.content, protocol);
    if (!c) {
      rejected.push({ inscriptionId: cand.inscriptionId, reason: "not a canonical deploy record" });
      continue;
    }
    // Content is network-agnostic; the registry knows which chain it is
    // reading, so it is what refuses a deployer from the other network.
    const by = parseTransparentAddress(c.by);
    if (!by || by.network !== network) {
      rejected.push({ inscriptionId: cand.inscriptionId, reason: `deployer address is not a ${network}net address` });
      continue;
    }
    if (claimed.has(c.mint)) {
      rejected.push({ inscriptionId: cand.inscriptionId, reason: `mint already deployed: ${c.mint}` });
      continue;
    }
    claimed.add(c.mint);
    collections.push({ ...c, inscriptionId: cand.inscriptionId, height: cand.height });
  }
  return { collections, rejected };
}
