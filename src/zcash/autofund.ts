// Collections fund themselves out of the launch fee.
//
// Asking a launcher to go and buy ZEC before their holders can burn is a step
// most of them will never take: the coin launches, someone burns, and the
// stamp queues behind a task the launcher did not know they had. So the fee
// they already paid on Solana buys their stamps, and the operator tops the
// collection up automatically.
//
// It is bounded on purpose. funding.ts exists because one viral coin must not
// be able to drain the operator, and paying for everyone's stamps without a
// limit would put that back. So each collection gets an allowance — what its
// launch fee covers — and tops up inside it, in small amounts. Past that the
// launcher funds it themselves, which they can always do by sending ZEC to
// the same address.

/** What one stamp costs to inscribe, in zatoshi. Matches STAMP_COST_ZEC. */
export const STAMP_COST_ZAT = 30_546n;

/** Stamps one paid launch buys. The rest is the launcher's to fund. */
export const ALLOWANCE_STAMPS = 2_000n;
export const ALLOWANCE_ZAT = ALLOWANCE_STAMPS * STAMP_COST_ZAT;

/** Top up when a collection is down to this many stamps of balance. */
export const LOW_WATER_STAMPS = 25n;

/** How much a single top-up sends. Small and repeated, so an abandoned coin
    does not sit on a large balance nobody will ever use. */
export const TOP_UP_STAMPS = 250n;

/** The operator keeps this much back, so auto-funding can never empty the
    wallet the bridge needs to keep operating. */
export const OPERATOR_RESERVE_ZAT = 50n * STAMP_COST_ZAT;

export interface TopUpInputs {
  /** The collection's current funding balance. */
  balanceZat: bigint;
  /** What auto-funding has already sent this collection, in total. */
  sentZat: bigint;
  /** What the operator wallet holds right now. */
  operatorZat: bigint;
}

export interface TopUpPlan {
  amountZat: bigint;       // 0 means send nothing
  reason: string;
}

/**
 * Decide whether to top a collection up, and by how much.
 *
 * Pure, so the money decision can be tested without a chain: every branch here
 * is one the launchpad would otherwise only exercise by spending real ZEC.
 */
export function planTopUp(i: TopUpInputs, feeAllowanceZat = ALLOWANCE_ZAT): TopUpPlan {
  if (i.balanceZat >= LOW_WATER_STAMPS * STAMP_COST_ZAT) {
    return { amountZat: 0n, reason: "still funded" };
  }
  const remaining = feeAllowanceZat - i.sentZat;
  if (remaining <= 0n) {
    return { amountZat: 0n, reason: "launch-fee allowance spent; the launcher funds it from here" };
  }
  const spendable = i.operatorZat - OPERATOR_RESERVE_ZAT;
  if (spendable <= 0n) {
    return { amountZat: 0n, reason: "operator wallet is at its reserve" };
  }
  let amount = TOP_UP_STAMPS * STAMP_COST_ZAT;
  if (amount > remaining) amount = remaining;
  if (amount > spendable) amount = spendable;
  // A top-up too small to buy a stamp is not worth its own transaction fee.
  if (amount < STAMP_COST_ZAT) {
    return { amountZat: 0n, reason: "what is left would not pay for one stamp" };
  }
  return { amountZat: amount, reason: `${amount / STAMP_COST_ZAT} stamps` };
}

export const stamps = (zat: bigint): bigint => zat / STAMP_COST_ZAT;
