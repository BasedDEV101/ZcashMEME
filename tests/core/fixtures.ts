import { createHash } from "node:crypto";
import { base58CheckEncode, base58Encode } from "../../src/core/base58.ts";
import { TRANSPARENT_PREFIXES, type ZcashNetwork, type TransparentKind } from "../../src/core/zcash-address.ts";
import type { BridgeConfig, NormalizedTx, TokenBurn } from "../../src/core/types.ts";
import { TOKEN_2022 } from "../../src/solana/programs.ts";

/** Deterministic fake 32-byte value from a label: stands in for pubkeys. */
export function fake32(label: string): string {
  return base58Encode(createHash("sha256").update(label).digest());
}
export function fakeSig(label: string): string {
  return base58Encode(createHash("sha512").update(label).digest()); // 64 bytes, like a signature
}

export function taddr(label: string, network: ZcashNetwork = "test", kind: TransparentKind = "p2pkh"): string {
  const [a, b] = TRANSPARENT_PREFIXES[network][kind];
  const hash = createHash("sha256").update(label).digest().subarray(0, 20);
  return base58CheckEncode(Uint8Array.from([a, b, ...hash]));
}

export const MINT = fake32("mint");
export const TOKEN_PROGRAM = TOKEN_2022;   // pump.fun create_v2 mints are Token-2022
export const ALICE = fake32("alice");
export const ALICE_ATA = fake32("alice-ata");
export const ALICE_Z = taddr("alice-zcash");
export const BOB_Z = taddr("bob-zcash");

export const CFG: BridgeConfig = {
  solanaMint: MINT,
  tokenProgramId: TOKEN_PROGRAM,
  decimals: 6,
  minBurnRaw: 1_000_000n * 1_000_000n, // 1M tokens at 6 decimals
  startSlot: 0,
  zcashNetwork: "test",
  protocol: "zsam",
};

export function burn(over: Partial<TokenBurn> = {}): TokenBurn {
  const amount = over.amount ?? 7_350_000n * 1_000_000n;
  return {
    programId: TOKEN_PROGRAM,
    mint: MINT,
    account: ALICE_ATA,
    authority: ALICE,
    amount,
    topLevel: true,
    decimalsChecked: 6,
    sourceOwner: ALICE,
    preAmount: amount + 1_000n,
    postAmount: 1_000n,
    ...over,
  };
}

export function burnTx(over: Partial<NormalizedTx> & { amount?: bigint; memo?: string; sig?: string } = {}): NormalizedTx {
  const { amount, memo = ALICE_Z, sig = fakeSig("burn-1"), ...rest } = over;
  return {
    signature: sig,
    slot: 100,
    blockTime: 1_758_300_000,
    finalized: true,
    succeeded: true,
    signers: [ALICE],
    burns: [burn(amount === undefined ? {} : { amount })],
    memos: [memo],
    ...rest,
  };
}
