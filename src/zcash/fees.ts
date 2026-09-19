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

export function marginalFee(height: number, network: "main" | "test" = "main"): bigint {
  // The drop height is a mainnet height; on testnet assume the new fee applies.
  if (network === "test") return MARGINAL_FEE_AFTER;
  return height >= MARGINAL_FEE_DROP_HEIGHT ? MARGINAL_FEE_AFTER : MARGINAL_FEE_BEFORE;
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
