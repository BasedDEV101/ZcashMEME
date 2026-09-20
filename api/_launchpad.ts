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
export const OPERATOR_ADDRESS = "mAQdwbg2EUGLgTfCV6Ts6S3PNFSiUW7pCwo1341p5FS";

/** $STAMP launched on pump.fun before the pad existed, so it has no deploy
    transaction to be discovered from. It is a collection all the same. */
export const FLAGSHIP = {
  mint: "EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc",
  symbol: "STAMP",
  name: "Zcash Shielded Assets",
  image: null as string | null,
  minWholeTokens: "1000000",
  launchedAt: 1789689600,
};
