// Program ids, all verified on mainnet (executable) on 2026-09-19.

export const SPL_TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// Three memo programs are live and in use. v4 is the default in
// @solana-program/memo 0.14, so a modern wallet stack may well use it.
// Missing one would mean failing to see the address a burner supplied.
export const MEMO_V1 = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo";
export const MEMO_V3 = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const MEMO_V4 = "Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH";

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const INCINERATOR = "1nc1nerator11111111111111111111111111111111";

export const TOKEN_PROGRAMS = new Set([SPL_TOKEN, TOKEN_2022]);
export const MEMO_PROGRAMS = new Set([MEMO_V1, MEMO_V3, MEMO_V4]);

// Token instruction discriminators (first data byte).
export const IX_BURN = 8;
export const IX_BURN_CHECKED = 15;

/**
 * Token accounts owned by the system program or the incinerator can be burned
 * by ANYONE, with no signature: both token programs skip the owner check for
 * them. Tokens sent to the incinerator are therefore burnable by a stranger,
 * who could otherwise claim the NFT. SPEC §3 rule 8 excludes these owners.
 */
export const UNSIGNED_BURN_OWNERS = new Set([SYSTEM_PROGRAM, INCINERATOR]);
