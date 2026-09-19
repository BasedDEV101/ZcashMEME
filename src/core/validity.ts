// The canonical burn validity rule. docs/SPEC.md §3 is the prose version of
// this function; the two must never drift. Every check is deterministic so
// two honest verifiers looking at the same finalized transaction always agree.

import type { BridgeConfig, BurnVerdict, NormalizedTx } from "./types.ts";
import { parseTransparentAddress } from "./zcash-address.ts";
import { UNSIGNED_BURN_OWNERS } from "../solana/programs.ts";

export function evaluateBurn(tx: NormalizedTx, cfg: BridgeConfig): BurnVerdict {
  if (!tx.finalized) return { ok: false, reason: "not finalized" };
  if (!tx.succeeded) return { ok: false, reason: "transaction failed" };
  if (tx.slot < cfg.startSlot) return { ok: false, reason: `slot ${tx.slot} is before start slot ${cfg.startSlot}` };

  const ours = tx.burns.filter((b) => b.mint === cfg.solanaMint);
  if (ours.length === 0) return { ok: false, reason: "no burn of our mint" };
  if (ours.length > 1) return { ok: false, reason: "more than one burn of our mint" };

  const burn = ours[0];
  if (!burn.topLevel) return { ok: false, reason: "burn executed via CPI, not top-level" };
  if (burn.programId !== cfg.tokenProgramId) {
    return { ok: false, reason: `burn by unexpected token program ${burn.programId}` };
  }
  if (burn.decimalsChecked !== null && burn.decimalsChecked !== cfg.decimals) {
    return { ok: false, reason: `burnChecked decimals ${burn.decimalsChecked} != ${cfg.decimals}` };
  }
  if (burn.amount < cfg.minBurnRaw) {
    return { ok: false, reason: `amount ${burn.amount} below minimum ${cfg.minBurnRaw}` };
  }

  // Who actually owned the tokens. The authority account alone is not enough:
  // token accounts owned by the system program or the incinerator can be
  // burned by anyone with no signature, so a stranger could otherwise burn
  // abandoned tokens and claim the NFT.
  if (burn.sourceOwner === null) {
    return { ok: false, reason: "token balances do not record the source owner" };
  }
  if (UNSIGNED_BURN_OWNERS.has(burn.sourceOwner)) {
    return { ok: false, reason: "source account is owned by the system program or incinerator" };
  }
  if (burn.sourceOwner !== burn.authority) {
    return { ok: false, reason: "burn authority is not the token account owner" };
  }
  if (!tx.signers.includes(burn.authority)) {
    return { ok: false, reason: "burn authority did not sign" };
  }

  if (burn.preAmount === null) {
    return { ok: false, reason: "token balances do not record the source balance" };
  }
  if (burn.preAmount - burn.postAmount !== burn.amount) {
    return { ok: false, reason: "balance change does not match the burned amount" };
  }

  if (tx.memos.length === 0) return { ok: false, reason: "no memo" };
  if (tx.memos.length > 1) return { ok: false, reason: "more than one memo" };

  const addr = parseTransparentAddress(tx.memos[0]);
  if (!addr) return { ok: false, reason: "memo is not a Zcash transparent address" };
  if (addr.network !== cfg.zcashNetwork) {
    return { ok: false, reason: `memo address is for ${addr.network}net, expected ${cfg.zcashNetwork}net` };
  }

  return {
    ok: true,
    burn: {
      signature: tx.signature,
      slot: tx.slot,
      blockTime: tx.blockTime,
      authority: burn.authority,
      amount: burn.amount,
      zcashAddress: addr.address,
    },
  };
}
