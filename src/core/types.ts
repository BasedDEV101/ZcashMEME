// SDK-agnostic shapes. The Solana watcher normalises whatever its RPC SDK
// returns into NormalizedTx, and the validity rule only ever sees this shape.
// That keeps the rule identical no matter which SDK fetched the data, and
// lets any third party re-implement it.

export interface TokenBurn {
  programId: string;   // token program that executed the burn
  mint: string;
  account: string;     // token account the tokens were burned from
  authority: string;   // owner or delegate that authorised the burn
  amount: bigint;      // raw base units (no decimals applied)
  topLevel: boolean;   // false = executed via CPI (inner instruction)
  decimalsChecked: number | null;  // burnChecked's decimals byte; null for plain burn
  // From pre/postTokenBalances. `sourceOwner` is the real owner of the token
  // account and is what §3 checks -- the instruction's authority account alone
  // cannot be trusted to identify a person.
  sourceOwner: string | null;
  preAmount: bigint | null;
  postAmount: bigint;
}

export interface NormalizedTx {
  signature: string;
  slot: number;
  blockTime: number | null;
  finalized: boolean;
  succeeded: boolean;
  signers: string[];
  burns: TokenBurn[];  // every burn / burnChecked in the tx, top-level and inner
  memos: string[];     // UTF-8 data of every memo instruction, in order
}

export interface BridgeConfig {
  solanaMint: string;
  tokenProgramId: string;   // the program that owns solanaMint
  decimals: number;
  minBurnRaw: bigint;       // minimum burn in raw base units
  startSlot: number;        // burns before this slot do not count (SPEC 2)
  zcashNetwork: "main" | "test";
  protocol: string;         // inscription protocol tag, e.g. "zsam"
}

export interface ValidBurn {
  signature: string;
  slot: number;
  blockTime: number | null;
  authority: string;
  amount: bigint;
  zcashAddress: string;
}

export type BurnVerdict =
  | { ok: true; burn: ValidBurn }
  | { ok: false; reason: string };
