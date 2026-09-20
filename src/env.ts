// Endpoint configuration for backend scripts.
//
// The Solana RPC url carries an API key, so it lives in keys/ (git-ignored),
// never in source or a committed config file. Fall back to a public endpoint
// so the scripts still run for anyone without a key -- just slower, and
// history scans of a busy mint will be rate-limited.

import { existsSync, readFileSync } from "node:fs";

/** Public, keyless, CORS-friendly. Works, but throttles heavy scans. */
export const PUBLIC_SOLANA_RPC = "https://solana-rpc.publicnode.com";

export function solanaRpcUrl(): string {
  if (process.env.SOLANA_RPC) return process.env.SOLANA_RPC;
  const path = process.env.RPC_CONFIG ?? "keys/rpc.json";
  if (existsSync(path)) {
    try {
      const cfg = JSON.parse(readFileSync(path, "utf8")) as { solanaRpc?: string };
      if (cfg.solanaRpc) return cfg.solanaRpc;
    } catch {
      // fall through to the public endpoint rather than failing to start
    }
  }
  return PUBLIC_SOLANA_RPC;
}

/** Safe to print: never reveals the key. */
export const describeRpc = (url: string): string => url.replace(/([?&]api-key=)[^&]+/, "$1***");
