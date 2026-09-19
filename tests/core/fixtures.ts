import { createHash } from "node:crypto";
import { base58CheckEncode, base58Encode } from "../../src/core/base58.ts";
import { TRANSPARENT_PREFIXES, type ZcashNetwork, type TransparentKind } from "../../src/core/zcash-address.ts";
import type { BridgeConfig, NormalizedTx } from "../../src/core/types.ts";

/** Deterministic fake 32-byte value from a label: stands in for pubkeys and signatures. */
export function fake32(label: string): string {
  return base58Encode(createHash("sha256").update(label).digest());
}
export function fakeSig(label: string): string {
  const a = createHash("sha512").update(label).digest();
  return base58Encode(a); // 64 bytes, like a Solana signature
}

export function taddr(label: string, network: ZcashNetwork = "test", kind: TransparentKind = "p2pkh"): string {
  const [a, b] = TRANSPARENT_PREFIXES[network][kind];
  const hash = createHash("sha256").update(label).digest().subarray(0, 20);
  return base58CheckEncode(Uint8Array.from([a, b, ...hash]));
}

export const MINT = fake32("mint");
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ALICE = fake32("alice");
export const ALICE_Z = taddr("alice-zcash");
export const BOB_Z = taddr("bob-zcash");

export const CFG: BridgeConfig = {
  solanaMint: MINT,
  tokenProgramId: TOKEN_PROGRAM,
  decimals: 6,
  minBurnRaw: 1_000_000n * 1_000_000n, // 1M tokens at 6 decimals
  zcashNetwork: "test",
  protocol: "zsam",
};

export function burnTx(over: Partial<NormalizedTx> & { amount?: bigint; memo?: string; sig?: string } = {}): NormalizedTx {
  const { amount = 7_350_000n * 1_000_000n, memo = ALICE_Z, sig = fakeSig("burn-1"), ...rest } = over;
  return {
    signature: sig,
    slot: 100,
    blockTime: 1_758_300_000,
    finalized: true,
    succeeded: true,
    signers: [ALICE],
    burns: [{ programId: TOKEN_PROGRAM, mint: MINT, account: fake32("alice-ata"), authority: ALICE, amount, topLevel: true }],
    memos: [memo],
    ...rest,
  };
}
