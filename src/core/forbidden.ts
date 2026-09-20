// Wallets this project must never sign as.
//
// A rule in a document is a rule someone forgets. This one is enforced in
// code: any path that would sign as, or launch from, one of these throws
// before a transaction is built.
//
// It no longer covers RECEIVING. The operator directed launch fees to the
// $STAMP launch wallet on 2026-09-21, and taking a payment needs no key: the
// original instruction was that nothing may be launched from this wallet and
// that its key must never be used, and both of those still hold.

/** The $STAMP launch wallet. Holds the launch supply; operator instruction 2026-09-20. */
export const STAMP_LAUNCH_WALLET = "26oK69pYx7R25ULts9hLYF2HpTnZ421jPYMPsds9GtYA";

export const FORBIDDEN_WALLETS = new Set([STAMP_LAUNCH_WALLET]);

export function assertNotForbidden(address: string, what = "this operation"): void {
  if (FORBIDDEN_WALLETS.has(address)) {
    throw new Error(
      `Refusing ${what}: ${address} is the $STAMP launch wallet and must never be used.`,
    );
  }
}
