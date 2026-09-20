/** Deployment facts. Everything here is public and checkable on chain. */
export interface SiteConfig {
  launched: boolean;
  ticker: string;
  solanaMint: string | null;
  tokenProgramId: string;
  decimals: number;
  minBurnTokens: bigint;
  rpc: string;
  zcashNetwork: "main" | "test";
  protocol: string;
}

export const CONFIG: SiteConfig = {
  // Flipped the day the coin launches on pump.fun; until then the burn panel
  // says so plainly rather than pretending to be live.
  launched: false,
  ticker: "ZIP227",
  solanaMint: null,
  tokenProgramId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  decimals: 6,
  minBurnTokens: 1_000_000n,
  rpc: "https://api.mainnet-beta.solana.com",
  zcashNetwork: "main",
  protocol: "zsam",
};

/** Real, on-chain, and checkable. Nothing here is illustrative. */
export const PROOF = {
  mainnetReveal: "b2cbded5c37c2cca8918a077a73e2ca349005efba046cee0866b34dd879c5acb",
  mainnetBurn: "RcxGYhJtLLmZAwhA1EeMqRCVEeC2edFSYb32Qjca1or4SzKNppf1nZS3czWL27Jf741rbZfPHUMp2PHLusG7x8M",
  mainnetAmount: "1500000",
  mainnetRecipient: "t1P2GcxGhzeM5tPk3r3JsGh1tEVArD4C2fB",
  forgedReveal: "d54660626ac2464cdaac7009e5b0b93f8b705e6236b24455edde8a34faffc0b7",
};

export const formatTokens = (n: bigint): string => n.toLocaleString("en-US");
