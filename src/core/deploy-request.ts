// Deploy requests.
//
// A launcher has SOL and a mint. They have no ZEC and cannot inscribe from a
// browser, so they cannot write their own deploy record. Asking them to email
// us would put a human in the loop and make us the gatekeeper.
//
// Instead a deploy request is a Solana transaction: pay the launch fee to the
// operator address with a memo naming the collection. The operator's watcher
// sees paid requests and inscribes the deploy record. The fee is collected on
// Solana, where fees are actually enforceable, and the request is public and
// checkable like everything else here.
//
//   memo: zsam:deploy:1:<mint>:<SYMBOL>:<minimum whole tokens>

export const REQUEST_PREFIX = "zsam:deploy:1:";

export interface DeployRequest {
  mint: string;
  symbol: string;
  minWholeTokens: bigint;
}

export function encodeDeployRequest(r: DeployRequest): string {
  return `${REQUEST_PREFIX}${r.mint}:${r.symbol.toUpperCase()}:${r.minWholeTokens.toString()}`;
}

const SYMBOL = /^[A-Z0-9]{1,10}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DECIMAL = /^[1-9][0-9]*$/;

/** Parse a memo into a request. Returns null if it is not one, or is malformed. */
export function parseDeployRequest(memo: string): DeployRequest | null {
  const text = memo.trim();
  if (!text.startsWith(REQUEST_PREFIX)) return null;
  const parts = text.slice(REQUEST_PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  const [mint, symbol, min] = parts;
  if (!BASE58.test(mint) || !SYMBOL.test(symbol) || !DECIMAL.test(min)) return null;
  return { mint, symbol, minWholeTokens: BigInt(min) };
}

export interface RequestVerdict {
  ok: boolean;
  reason?: string;
  request?: DeployRequest;
}

/**
 * Decide whether a Solana transaction is a paid deploy request.
 *
 * Deliberately mirrors the burn rule: finalized, succeeded, exactly one memo,
 * and the fee actually paid to the operator. A request that did not pay is not
 * a request, so nobody can queue work for free.
 */
export function evaluateDeployRequest(
  tx: { finalized: boolean; succeeded: boolean; memos: string[]; transfersToOperator: bigint },
  feeLamports: bigint,
): RequestVerdict {
  if (!tx.finalized) return { ok: false, reason: "not finalized" };
  if (!tx.succeeded) return { ok: false, reason: "transaction failed" };
  if (tx.memos.length !== 1) return { ok: false, reason: "expected exactly one memo" };
  const request = parseDeployRequest(tx.memos[0]);
  if (!request) return { ok: false, reason: "memo is not a deploy request" };
  if (tx.transfersToOperator < feeLamports) {
    return { ok: false, reason: `paid ${tx.transfersToOperator} lamports, launch fee is ${feeLamports}` };
  }
  return { ok: true, request };
}
