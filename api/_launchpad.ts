// Fee terms and the flagship collection, shared by the data endpoints.
// Keep in step with web/src/lib/launchpad.ts and web/src/lib/config.ts.
export const LAUNCH_FEE_LAMPORTS = 500_000_000n;

/**
 * The least a launch may have paid and still be listed.
 *
 * Not the same number as the current fee, deliberately. The fee was briefly
 * 0.1 SOL and real coins launched at that price; raising the listing
 * threshold with the fee would have deleted them from the leaderboard for
 * having paid what was asked at the time. A launch is judged against what it
 * was charged, so this only ever moves down.
 */
export const MIN_ACCEPTED_FEE_LAMPORTS = 100_000_000n;
export const OPERATOR_ADDRESS = "26oK69pYx7R25ULts9hLYF2HpTnZ421jPYMPsds9GtYA";

/**
 * Addresses that have ever collected launch fees, newest first.
 *
 * Discovery reads all of them, not just the current one. Every coin on the
 * pad so far paid mAQdwb…, and pointing discovery at the new address alone
 * would have emptied the leaderboard of all 69 of them for having paid the
 * address that was correct at the time.
 */
export const FEE_ADDRESSES = [
  "26oK69pYx7R25ULts9hLYF2HpTnZ421jPYMPsds9GtYA",
  "mAQdwbg2EUGLgTfCV6Ts6S3PNFSiUW7pCwo1341p5FS",
];

/**
 * The slot the register opens at. Nothing earlier is listed.
 *
 * The pad ran briefly before its rules settled -- coins created elsewhere
 * could be attached to it by paying the fee with a deploy memo, which is not
 * what the register is for. It now begins here, and everything in it was
 * created on the pad.
 *
 * Only the listing is affected. The register itself lives on Zcash at an
 * address whose key nobody holds, so an earlier entry is still inscribed,
 * still verifiable, and still served by the bridge -- it cannot be removed by
 * anyone, this site included.
 */
export const REGISTER_OPENS_AT_SLOT = 448_851_204;

/** $STAMP launched on pump.fun before the pad existed, so it has no deploy
    transaction to be discovered from. It is a collection all the same. */
export const FLAGSHIP = {
  mint: "EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc",
  symbol: "STAMP",
  name: "Zcash Shielded Assets",
  image: null as string | null,
  minWholeTokens: "1000000",
  launchedAt: 1789928715,
};
