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
  // Values read from chain, never assumed: Token-2022, 6 decimals, 1B supply,
  // mint authority revoked, no freeze authority. Created at slot 448811893.
  //
  // `launched` stays false until the bridge is running and the minter funded.
  // Enabling it earlier would let people burn irreversibly and receive
  // nothing. An earlier token, $ZIP227 (8RSbsKW2...pump), is live on mainnet
  // but is NOT this project.
  launched: true,
  ticker: "STAMP",   // on-chain symbol is "Stamp"; shown uppercase as a ticker
  solanaMint: "EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc",
  tokenProgramId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  decimals: 6,
  minBurnTokens: 1_000_000n,
  // api.mainnet-beta.solana.com returns 403 to browsers by design, which made
  // every burn fail at "failed to get recent blockhash". Verified from a real
  // browser that this endpoint answers getLatestBlockhash with CORS.
  rpc: "https://solana-rpc.publicnode.com",
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
