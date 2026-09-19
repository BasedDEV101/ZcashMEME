// Rebuild the NFT ledger from chain data.
//
// Inscriptions are found by looking at the addresses burners named: SPEC §4
// rule 7 requires an NFT to be delivered to the address from its burn memo, so
// an inscription that is anywhere else is not an NFT and does not need finding.
//
// Limitation: this sees an inscription while it still sits at its first
// owner's address. Once it is transferred, only the stored row remembers it,
// which is why observed inscriptions are persisted. Full ordinal-style
// transfer tracking needs block-level scanning and is not implemented.

import type { BridgeConfig } from "../core/types.ts";
import { buildLedger, type InscriptionRecord, type Ledger } from "../core/ledger.ts";
import { assemble, commitment, decodeEnvelope, DUST_ZAT } from "./inscription.ts";
import type { Lightwalletd } from "./lightwalletd.ts";
import { hex } from "./script.ts";
import { inscriptionRows, saveInscription, type Store } from "../store/db.ts";
import { parseNftContent as parseContent } from "../core/nft.ts";

/** Read the first input's scriptSig out of a serialised transparent v5 tx. */
export function firstScriptSig(raw: Uint8Array): Uint8Array | null {
  let o = 20; // header + versionGroupId + consensusBranchId + lockTime + expiryHeight
  if (raw.length < o + 1) return null;
  const nIn = raw[o];
  o += 1;
  if (nIn < 1 || nIn > 0xfc) return null;   // varint > 1 byte: not a shape we produce
  o += 36;                                   // outpoint
  if (raw.length < o + 1) return null;
  let len = raw[o];
  if (len < 0xfd) o += 1;
  else if (len === 0xfd) { len = raw[o + 1] | (raw[o + 2] << 8); o += 3; }
  else return null;
  if (raw.length < o + len) return null;
  return raw.subarray(o, o + len);
}

/**
 * Every protocol inscription currently sitting at an address, whatever it
 * claims. Inscriptions citing unknown or mismatched burns are returned too, so
 * the ledger can reject them by rule with a stated reason rather than the
 * indexer quietly dropping them.
 */
export async function findInscriptionsAt(lwd: Lightwalletd, address: string, cfg: BridgeConfig): Promise<InscriptionRecord[]> {
  const utxos = await lwd.utxos(address);
  const found: InscriptionRecord[] = [];
  const candidates = utxos.filter((u) => u.valueZat >= DUST_ZAT && u.valueZat < 100_000n);
  for (const u of candidates) {
    let raw: Uint8Array;
    let height: number;
    try {
      ({ raw, height } = await lwd.transaction(u.txid));
    } catch {
      continue;
    }
    const scriptSig = firstScriptSig(raw);
    if (!scriptSig) continue;
    const env = decodeEnvelope(scriptSig);
    if (!env) continue;
    const content = assemble(env.pieces);
    // The v1 commitment must match, or the content was altered in flight.
    if (env.commitment && hex(env.commitment) !== hex(commitment(env.contentType, content))) continue;
    if (!parseContent(content, cfg.protocol)) continue;   // not ours at all
    found.push({
      id: `${u.txid}i0`,
      txid: u.txid,
      height: height || Number.MAX_SAFE_INTEGER, // unconfirmed sorts last
      txIndex: 0,
      index: 0,
      contentType: env.contentType,
      content,
      firstOwner: address,
    });
  }
  return found;
}

/**
 * Resolve a burn an inscription cites but we have no verdict for, by fetching
 * that single transaction directly. `getTransaction` reaches back further than
 * `getSignaturesForAddress`, so this rescues NFTs whose burn has scrolled out
 * of the listing window.
 */
export type BurnResolver = (signature: string) => Promise<void>;

/** One indexing pass: find missing inscriptions, then rebuild the ledger. */
export async function indexPass(lwd: Lightwalletd, store: Store, cfg: BridgeConfig, log: (m: string) => void = () => {}, resolve?: BurnResolver): Promise<Ledger> {
  const known = new Set(inscriptionRows(store).map((i) => i.txid));
  const addresses = new Set(store.validBurns().map((b) => b.zcashAddress));
  for (const address of addresses) {
    for (const found of await findInscriptionsAt(lwd, address, cfg)) {
      if (known.has(found.txid)) continue;
      saveInscription(store, found);
      known.add(found.txid);
      log(`found inscription ${found.id} at ${address}`);
    }
  }
  let ledger = buildLedger(inscriptionRows(store), store.verdicts(), cfg);
  if (resolve && ledger.unresolved.length > 0) {
    for (const u of ledger.unresolved) {
      try {
        await resolve(u.burn);
        log(`resolved cited burn ${u.burn.slice(0, 8)}… directly`);
      } catch (e) {
        log(`could not resolve burn ${u.burn.slice(0, 8)}…: ${(e as Error).message}`);
      }
    }
    ledger = buildLedger(inscriptionRows(store), store.verdicts(), cfg);
  }
  return ledger;
}
