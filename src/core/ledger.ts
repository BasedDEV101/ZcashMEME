// The NFT ledger: which Zcash inscriptions are real NFTs.
//
// An inscription is a valid NFT only if ALL of these hold (docs/SPEC.md §4):
//   1. content type is exactly application/json
//   2. content is the canonical encoding (nft.ts) with our protocol tag
//   3. it names our Solana mint
//   4. it cites a Solana burn that passes the burn validity rule
//   5. its amount equals the amount burned
//   6. its `to` equals the Zcash address in the burn memo
//   7. the inscription was first received by that same address
//   8. no earlier valid inscription already cites that burn
//
// Minting is therefore permissionless and the minter key is not trusted:
// whoever inscribes first can only ever deliver the NFT the burner already
// asked for, to the address they chose. A stolen minter key can burn fee ZEC
// but cannot create a valid NFT.

import type { BridgeConfig, BurnVerdict, ValidBurn } from "./types.ts";
import { CONTENT_TYPE, parseNftContent } from "./nft.ts";

export interface InscriptionRecord {
  id: string;           // e.g. "<revealTxid>i0"
  txid: string;
  height: number;
  txIndex: number;      // position of the reveal tx in its block
  index: number;        // inscription index within the tx
  contentType: string;
  content: Uint8Array;
  firstOwner: string;   // transparent address that received it in the reveal tx
}

export interface Nft {
  number: number;       // 1-based, in chain order of valid inscriptions
  inscriptionId: string;
  txid: string;
  height: number;
  burn: ValidBurn;
}

export interface Rejected {
  inscriptionId: string;
  reason: string;
}

export interface Ledger {
  nfts: Nft[];
  rejected: Rejected[];
  /** Valid burns that have no NFT yet: the minter's work queue. */
  unclaimed: ValidBurn[];
}

export function chainOrder(a: InscriptionRecord, b: InscriptionRecord): number {
  return a.height - b.height || a.txIndex - b.txIndex || a.index - b.index;
}

/**
 * @param inscriptions candidate inscriptions (any order; sorted here)
 * @param burns verdicts keyed by Solana signature, for every burn known to the caller
 *        AND every signature cited by an inscription. A cited signature missing
 *        from this map is rejected as "unknown burn", never assumed valid.
 */
export function buildLedger(
  inscriptions: InscriptionRecord[],
  burns: Map<string, BurnVerdict>,
  cfg: BridgeConfig,
): Ledger {
  const nfts: Nft[] = [];
  const rejected: Rejected[] = [];
  const claimed = new Set<string>();
  const reject = (i: InscriptionRecord, reason: string) =>
    rejected.push({ inscriptionId: i.id, reason });

  for (const ins of [...inscriptions].sort(chainOrder)) {
    if (ins.contentType !== CONTENT_TYPE) { reject(ins, "wrong content type"); continue; }
    const c = parseNftContent(ins.content, cfg.protocol);
    if (!c) { reject(ins, "not canonical protocol content"); continue; }
    if (c.mint !== cfg.solanaMint) { reject(ins, "different mint"); continue; }

    const verdict = burns.get(c.burn);
    if (!verdict) { reject(ins, "unknown burn"); continue; }
    if (!verdict.ok) { reject(ins, `invalid burn: ${verdict.reason}`); continue; }
    const burn = verdict.burn;

    if (c.amt !== burn.amount) { reject(ins, "amount does not match burn"); continue; }
    if (c.to !== burn.zcashAddress) { reject(ins, "recipient does not match burn memo"); continue; }
    if (ins.firstOwner !== burn.zcashAddress) { reject(ins, "delivered to a different address"); continue; }
    if (claimed.has(burn.signature)) { reject(ins, "burn already claimed"); continue; }

    claimed.add(burn.signature);
    nfts.push({ number: nfts.length + 1, inscriptionId: ins.id, txid: ins.txid, height: ins.height, burn });
  }

  const unclaimed: ValidBurn[] = [];
  for (const v of burns.values()) {
    if (v.ok && !claimed.has(v.burn.signature)) unclaimed.push(v.burn);
  }
  unclaimed.sort((a, b) => a.slot - b.slot || (a.signature < b.signature ? -1 : 1));

  return { nfts, rejected, unclaimed };
}
