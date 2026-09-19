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

import type { BridgeConfig, ValidBurn } from "../core/types.ts";
import { buildLedger, type InscriptionRecord, type Ledger } from "../core/ledger.ts";
import { parseNftContent } from "../core/nft.ts";
import { assemble, commitment, decodeEnvelope, DUST_ZAT } from "./inscription.ts";
import type { Lightwalletd } from "./lightwalletd.ts";
import { hex } from "./script.ts";
import { inscriptionRows, saveInscription, type Store } from "../store/db.ts";

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

/** Look for the inscription that satisfies a given burn. */
export async function findInscriptionFor(lwd: Lightwalletd, burn: ValidBurn, cfg: BridgeConfig): Promise<InscriptionRecord | null> {
  const utxos = await lwd.utxos(burn.zcashAddress);
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
    const nft = parseNftContent(content, cfg.protocol);
    if (!nft || nft.burn !== burn.signature) continue;
    return {
      id: `${u.txid}i0`,
      txid: u.txid,
      height: height || Number.MAX_SAFE_INTEGER, // unconfirmed sorts last
      txIndex: 0,
      index: 0,
      contentType: env.contentType,
      content,
      firstOwner: burn.zcashAddress,
    };
  }
  return null;
}

/** One indexing pass: find missing inscriptions, then rebuild the ledger. */
export async function indexPass(lwd: Lightwalletd, store: Store, cfg: BridgeConfig, log: (m: string) => void = () => {}): Promise<Ledger> {
  const known = new Set(inscriptionRows(store).map((i) => i.txid));
  for (const burn of store.validBurns()) {
    const found = await findInscriptionFor(lwd, burn, cfg);
    if (found && !known.has(found.txid)) {
      saveInscription(store, found);
      log(`found inscription ${found.id} for burn ${burn.signature.slice(0, 8)}…`);
    }
  }
  return buildLedger(inscriptionRows(store), store.verdicts(), cfg);
}
