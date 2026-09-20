// Minimal Solana JSON-RPC client over fetch. Read-only: this module never
// signs or sends anything. Retries with backoff on 429 / 5xx / network errors.

import type { RpcTransaction } from "./normalize.ts";

// Highest transaction version we ask the RPC to return. Mainnet carries v1
// transactions as of 2026-09; asking for less makes the RPC throw on them,
// which would stall the watcher on a real burn. Raise this when a new version
// ships -- normalize.ts only reads fields common to every version.
export const MAX_TX_VERSION = 1;

export class RpcError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  blockTime?: number | null;
  confirmationStatus?: string;
  /** Memo text of the tx, as "[len] text" (several joined by "; "), or null.
      The watcher uses only null vs non-null; see watcher.ts. */
  memo?: string | null;
}

/**
 * api.mainnet-beta.solana.com is not usable for this workload: it 403s
 * browsers outright and rate-limits servers hard enough that paging a traded
 * token's history never finishes. solana-rpc.publicnode.com served 5,000
 * signatures in 2s where the public endpoint gave up after 3 attempts.
 */
export const DEFAULT_RPC = "https://solana-rpc.publicnode.com";

/** Same endpoint, named for its role when a paid one is primary. */
export const PUBLIC_RPC_FALLBACK = DEFAULT_RPC;

export class SolanaRpc {
  url: string;
  maxRetries: number;
  private id = 0;

  constructor(url: string, maxRetries = 6) {
    this.url = url;
    this.maxRetries = maxRetries;
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    let delay = 500;
    for (let attempt = 0; ; attempt++) {
      let res: Response | undefined;
      try {
        res = await fetch(this.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
        });
      } catch (e) {
        if (attempt >= this.maxRetries) throw e;
      }
      if (res && res.ok) {
        const body = (await res.json()) as { result?: T; error?: { message: string; code: number } };
        if (body.error) throw new RpcError(`${method}: ${body.error.message}`, body.error.code);
        return body.result as T;
      }
      if (res && res.status !== 429 && res.status < 500) {
        throw new RpcError(`${method}: HTTP ${res.status}`);
      }
      if (attempt >= this.maxRetries) throw new RpcError(`${method}: gave up after ${attempt + 1} attempts`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 8000);
    }
  }

  getTransaction(signature: string, commitment: "finalized" | "confirmed" = "finalized") {
    return this.call<RpcTransaction | null>("getTransaction", [
      signature,
      { encoding: "json", commitment, maxSupportedTransactionVersion: MAX_TX_VERSION },
    ]);
  }

  /** Newest first. `before`/`until` page through history (both exclusive). */
  getSignaturesForAddress(
    address: string,
    opts: { before?: string; until?: string; limit?: number; commitment?: "finalized" | "confirmed" } = {},
  ) {
    const { commitment = "finalized", limit = 1000, ...rest } = opts;
    return this.call<SignatureInfo[]>("getSignaturesForAddress", [address, { commitment, limit, ...rest }]);
  }

  getAccountInfo(address: string) {
    return this.call<{ value: { owner: string; data: unknown } | null }>("getAccountInfo", [
      address,
      { encoding: "jsonParsed", commitment: "finalized" },
    ]);
  }
}

/** Read a mint's owning program and decimals, so config can't disagree with chain. */
export async function readMint(rpc: SolanaRpc, mint: string): Promise<{ tokenProgramId: string; decimals: number; supply: bigint }> {
  const r = await rpc.getAccountInfo(mint);
  if (!r.value) throw new Error(`mint ${mint} not found`);
  const parsed = (r.value.data as { parsed?: { type?: string; info?: { decimals?: number; supply?: string } } }).parsed;
  if (parsed?.type !== "mint" || typeof parsed.info?.decimals !== "number") {
    throw new Error(`${mint} is not a token mint`);
  }
  return { tokenProgramId: r.value.owner, decimals: parsed.info.decimals, supply: BigInt(parsed.info.supply ?? "0") };
}

/**
 * A primary endpoint with a second one behind it, tried per call.
 *
 * A single provider having a bad minute used to end whatever was running: a
 * 20-minute history scan died at 950,000 signatures on one exhausted retry,
 * and a page read returned nothing at all. Neither job depends on WHICH
 * endpoint answers, so a failed call is simply asked again elsewhere.
 */
export class FailoverRpc extends SolanaRpc {
  private readonly backup: SolanaRpc | null;
  constructor(primary: string, backup: string, maxRetries = 3) {
    super(primary, maxRetries);
    this.backup = primary === backup ? null : new SolanaRpc(backup, maxRetries);
  }
  override async call<T>(method: string, params: unknown[]): Promise<T> {
    try {
      return await super.call<T>(method, params);
    } catch (e) {
      if (!this.backup) throw e;
      return this.backup.call<T>(method, params);
    }
  }
}
