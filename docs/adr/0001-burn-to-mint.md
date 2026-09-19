# ADR 0001 — Burn-to-mint: Solana memecoin → Zcash NFT

Status: **Accepted** (2026-09-19). The ratio is provisional; see §5.

## Context
The research (`docs/research/REPORT.md`) found three things:
- "First memecoin on Zcash" is taken (ZRC-20, 2025-11-13).
- Nothing can be shielded on Zcash mainnet until native ZSAs arrive, which will be after 2026.
- A pre-ZSA 1:1 *locked* bridge makes the operator a custodian, and Zcash can't enforce the supply. Both
  grant proposals that tried it were declined over exactly that.

## Decisions

1. **Burn, not lock.** Holders destroy their Solana tokens to get a Zcash NFT. It's one-way.
   Nobody holds user funds, so there's no escrow to hack and no custody. The trade-off is that the NFT has
   no guaranteed redemption floor; its value is set by the market. The wording is "1:1 converted", never
   "1:1 backed".

2. **The token is the operator's own memecoin, launched on pump.fun by the operator.** The build covers
   burn detection and Zcash minting only. The pump.fun launch is not part of the build.

3. **No custom Solana program.** A burn is one transaction with the token program's standard
   `burn`/`burnChecked` for our mint plus an SPL Memo holding the holder's Zcash address. There's nothing
   to deploy, audit or upgrade, and no program authority that could be stolen.

4. **Verifiable now, private later.**
   - NFTs are **public inscriptions** on Zcash. Each one embeds the Solana burn signature and amount.
   - **Validity rule:** an NFT is valid only if it cites a real, finalized burn of our mint, and each burn
     can be cited once. Fakes, including ones minted with a stolen minter key, are invalid by rule. They
     aren't just detectable afterwards.
   - When native ZSAs activate, NFTs migrate to real shielded assets.

5. **Ratio (provisional, pending the operator's confirmation):**
   - Burn any amount ≥ a configurable minimum (default 1,000,000 tokens) → one NFT stamped with the
     exact amount burned.
   - At ZSA migration, each NFT converts to exactly that amount of shielded fungible MEME.
   - We rejected 1 token = 1 NFT. At a $1M market cap a token is worth about $0.001, while an inscription
     costs about $0.30 in ZEC. Burning $100 of tokens would force about $30k of minting fees.

## Consequences
- The minter holds a hot Zcash key that pays inscription fees. Losing it costs fee ZEC, but it can't create
  valid NFTs, because of the validity rule.
- The verifier is the heart of the system. It must be deterministic and reproducible by third parties.
- Open until the spec: the inscription format, the Zcash transaction library (NU7 disables v4 transactions
  on 2026-10-06 testnet / 2026-11-05 mainnet), and the RPC endpoints.
