// The minter: turns unclaimed valid burns into Zcash inscriptions.
//
// It holds a hot key that pays inscription fees, but it is NOT trusted: the
// ledger rule (SPEC §4) only counts an inscription that cites a real unclaimed
// burn and delivers to the address that burner chose. A stolen minter key can
// waste fee ZEC and nothing else.
//
// Commit and reveal are broadcast as a pair. The reveal spends the commit's
// output, so it is sent once the commit is accepted; if the node will not take
// an unconfirmed parent, the job waits and retries on the next pass.

import type { BridgeConfig, ValidBurn } from "../core/types.ts";
import { contentForBurn, encodeNftBytes, CONTENT_TYPE } from "../core/nft.ts";
import type { Store } from "../store/db.ts";
import { buildInscription, type Inscription, type Utxo } from "./inscribe.ts";
import type { Lightwalletd } from "./lightwalletd.ts";
import type { TransparentKey } from "./wallet.ts";

export interface MintDeps {
  key: TransparentKey;
  lwd: Lightwalletd;
  cfg: BridgeConfig;
  log?: (msg: string) => void;
}

export interface MintResult {
  burn: ValidBurn;
  inscription: Inscription;
  commitTxid: string;
  revealTxid: string;
}

/** Build and broadcast the inscription for one burn. */
export async function mintOne(deps: MintDeps, burn: ValidBurn, utxos: Utxo[], chain: { height: number; branchId: number }): Promise<MintResult> {
  const log = deps.log ?? (() => {});
  const content = encodeNftBytes(contentForBurn(burn, deps.cfg));
  const inscription = buildInscription({
    key: deps.key,
    utxos,
    content,
    contentType: CONTENT_TYPE,
    recipient: burn.zcashAddress,
    network: deps.cfg.zcashNetwork,
    consensusBranchId: chain.branchId,
    chainHeight: chain.height,
  });

  log(`commit ${inscription.commit.txid.slice(0, 12)}… (${inscription.commit.raw.length} bytes, fee ${inscription.commit.feeZat} zat)`);
  await deps.lwd.send(inscription.commit.raw, chain.height);

  log(`reveal ${inscription.reveal.txid.slice(0, 12)}… (${inscription.reveal.raw.length} bytes, fee ${inscription.reveal.feeZat} zat)`);
  await deps.lwd.send(inscription.reveal.raw, chain.height);

  return { burn, inscription, commitTxid: inscription.commit.txid, revealTxid: inscription.reveal.txid };
}

/**
 * Burns with a valid verdict that no mint job has completed yet.
 *
 * This is LOCAL knowledge only. A fresh store knows nothing about stamps
 * already on chain, so callers that can reach the chain should pass the
 * ledger's `unclaimed` list to mintPass instead: minting a burn that already
 * has a stamp spends real fees on an inscription the ledger will reject.
 */
export function pendingBurns(store: Store): ValidBurn[] {
  const done = new Set(
    (store.db.prepare("SELECT signature FROM mint_jobs WHERE status IN ('revealed','confirmed')").all() as { signature: string }[])
      .map((r) => r.signature),
  );
  return store.validBurns().filter((b) => !done.has(b.signature));
}

export function recordJob(store: Store, signature: string, status: string, fields: { commit?: string; reveal?: string; error?: string } = {}) {
  store.db.prepare(
    `INSERT INTO mint_jobs (signature, status, commit_txid, reveal_txid, attempts, last_error, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, datetime('now'))
     ON CONFLICT(signature) DO UPDATE SET
       status = excluded.status,
       commit_txid = COALESCE(excluded.commit_txid, mint_jobs.commit_txid),
       reveal_txid = COALESCE(excluded.reveal_txid, mint_jobs.reveal_txid),
       attempts = mint_jobs.attempts + 1,
       last_error = excluded.last_error,
       updated_at = datetime('now')`,
  ).run(signature, status, fields.commit ?? null, fields.reveal ?? null, fields.error ?? null);
}

/**
 * One pass: mint every pending burn, one at a time so UTXOs cannot collide.
 *
 * `owed` overrides the local job table. Pass the ledger's unclaimed list so a
 * store that has not seen an existing stamp cannot pay to mint a duplicate.
 */
export async function mintPass(deps: MintDeps, store: Store, owed?: ValidBurn[]): Promise<MintResult[]> {
  const log = deps.log ?? (() => {});
  const info = await deps.lwd.info();
  const address = deps.key.address(deps.cfg.zcashNetwork);
  const out: MintResult[] = [];

  for (const burn of owed ?? pendingBurns(store)) {
    const utxos = await deps.lwd.utxos(address);
    if (utxos.length === 0) {
      log(`no confirmed utxos for ${address}: waiting (fund it or let change confirm)`);
      break;
    }
    try {
      recordJob(store, burn.signature, "pending");
      const r = await mintOne(deps, burn, utxos, { height: info.blockHeight, branchId: info.consensusBranchId });
      recordJob(store, burn.signature, "revealed", { commit: r.commitTxid, reveal: r.revealTxid });
      log(`minted ${r.inscription.inscriptionId} -> ${burn.zcashAddress}`);
      out.push(r);
    } catch (e) {
      const msg = (e as Error).message;
      recordJob(store, burn.signature, "failed", { error: msg });
      log(`mint failed for ${burn.signature.slice(0, 12)}…: ${msg}`);
      break; // stop the pass: the next burn would reuse the same utxos
    }
  }
  return out;
}
