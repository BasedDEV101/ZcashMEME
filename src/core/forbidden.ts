// Wallets this project must never touch.
//
// A rule in a document is a rule someone forgets. This one is enforced in
// code: any path that would sign, pay from, or send to one of these throws
// before a transaction is built.

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
