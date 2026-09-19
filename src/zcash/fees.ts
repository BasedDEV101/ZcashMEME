// ZIP 317 conventional fee: https://zips.z.cash/zip-0317
//
// fee = marginal_fee * max(grace_actions, logical_actions)
// logical_actions (transparent only) =
//   max(ceil(tx_in_total_size / 150), ceil(tx_out_total_size / 34))
//
// marginal_fee is being cut from 5000 to 1000 zat (Zebra PR #11290, ZIP PR
// #1352) at mainnet height 3,590,000, so it is height-aware rather than a
// constant -- a hardcoded 5000 would overpay by 5x afterwards, and a
// hardcoded 1000 would get transactions rejected before then.

export const GRACE_ACTIONS = 2;
export const P2PKH_INPUT_SIZE = 150;
export const P2PKH_OUTPUT_SIZE = 34;
export const MARGINAL_FEE_BEFORE = 5000n;
export const MARGINAL_FEE_AFTER = 1000n;
export const MARGINAL_FEE_DROP_HEIGHT = 3_590_000;

/**
 * Conservative on purpose. Underpaying is fatal -- a testnet node rejected a
 * commit built at 1000 zat/action with "Unpaid actions is higher than the
 * limit" (2026-09-19), proving the cut is NOT live on testnet yet -- while
 * overpaying merely wastes a few thousand zatoshi. So the reduced fee is used
 * only where it is known to be active: mainnet at or above the drop height.
 */
export function marginalFee(height: number, network: "main" | "test" = "main"): bigint {
  if (network === "main" && height >= MARGINAL_FEE_DROP_HEIGHT) return MARGINAL_FEE_AFTER;
  return MARGINAL_FEE_BEFORE;
}

export function logicalActions(txInTotalSize: number, txOutTotalSize: number): number {
  return Math.max(
    Math.ceil(txInTotalSize / P2PKH_INPUT_SIZE),
    Math.ceil(txOutTotalSize / P2PKH_OUTPUT_SIZE),
  );
}

export function conventionalFee(txInTotalSize: number, txOutTotalSize: number, feePerAction: bigint): bigint {
  return feePerAction * BigInt(Math.max(GRACE_ACTIONS, logicalActions(txInTotalSize, txOutTotalSize)));
}

const varintSize = (n: number) => (n < 0xfd ? 1 : n <= 0xffff ? 3 : 5);
/** outpoint(36) + varint + scriptSig + sequence(4) */
export const inputSize = (scriptSigLen: number) => 36 + varintSize(scriptSigLen) + scriptSigLen + 4;
/** value(8) + varint + scriptPubKey */
export const outputSize = (scriptLen: number) => 8 + varintSize(scriptLen) + scriptLen;

export const P2PKH_SCRIPTSIG_LEN = 1 + 72 + 1 + 33; // push(sig+hashtype) + push(compressed pubkey)
