// Build the commit/reveal transaction pair that inscribes one NFT.
//
//   commit:  funding UTXOs            -> [0] P2SH(redeemScript), [1] change
//   reveal:  commit output 0          -> [0] recipient P2PKH (postage)
//
// The reveal's scriptSig carries the envelope, so the content only becomes
// public when the reveal is broadcast, and the P2SH commitment in the redeem
// script binds it (docs/research/zcash-minting.md).

import { assemble, buildEnvelopePrefix, buildRedeemScript, chunk, commitment, DUST_ZAT, MAX_PIECES_PER_TX, validateContentType } from "./inscription.ts";
import { conventionalFee, inputSize, marginalFee, outputSize, P2PKH_SCRIPTSIG_LEN } from "./fees.ts";
import { concat, pushData } from "./script.ts";
import { hash160, p2shScript, type TransparentKey } from "./wallet.ts";
import { serializeV5, signatureHash, txid, type TxIn, type TxOut, type TxSkeleton } from "./zip244.ts";
import { parseTransparentAddress } from "../core/zcash-address.ts";
import { p2pkhScript } from "./wallet.ts";

export interface Utxo { txid: string; vout: number; valueZat: bigint; scriptPubKey: Uint8Array }

export interface BuiltTx { skeleton: TxSkeleton; scriptSigs: Uint8Array[]; raw: Uint8Array; txid: string; feeZat: bigint }
export interface Inscription {
  commit: BuiltTx;
  reveal: BuiltTx;
  inscriptionId: string;     // "<revealTxid>i0"
  totalCostZat: bigint;      // fees + postage, i.e. what leaves the wallet
  changeZat: bigint;
}

export interface InscribeParams {
  key: TransparentKey;
  utxos: Utxo[];
  content: Uint8Array;
  contentType: string;
  recipient: string;         // transparent address the NFT is delivered to
  network: "main" | "test";
  consensusBranchId: number;
  chainHeight: number;
  expiryDelta?: number;      // blocks until the transactions expire
  postageZat?: bigint;
}

export function buildInscription(p: InscribeParams): Inscription {
  validateContentType(p.contentType);
  const pieces = chunk(p.content);
  if (pieces.length > MAX_PIECES_PER_TX) {
    throw new Error(`content needs ${pieces.length} pieces; multi-transaction chaining is not implemented yet`);
  }
  const recipient = parseTransparentAddress(p.recipient);
  if (!recipient) throw new Error(`not a transparent address: ${p.recipient}`);
  if (recipient.network !== p.network) throw new Error(`recipient is a ${recipient.network}net address`);

  const postage = p.postageZat ?? DUST_ZAT;
  if (postage < DUST_ZAT) throw new Error(`postage below dust (${DUST_ZAT})`);
  const feePerAction = marginalFee(p.chainHeight, p.network);
  const expiryHeight = p.chainHeight + (p.expiryDelta ?? 40);
  const base = { consensusBranchId: p.consensusBranchId, lockTime: 0, expiryHeight };

  // --- reveal, sized first: the commit must fund it -------------------------
  const redeemScript = buildRedeemScript(p.key.publicKey, pieces.length, commitment(p.contentType, p.content));
  const envelope = buildEnvelopePrefix(p.contentType, pieces.length, pieces);
  const revealScriptSigLen = envelope.length + 1 + 72 + pushData(redeemScript).length;
  const recipientScript = recipient.kind === "p2sh" ? p2shScript(recipient.hash) : p2pkhScript(recipient.hash);
  const revealOut: TxOut = { valueZat: postage, scriptPubKey: recipientScript };
  const revealFee = conventionalFee(inputSize(revealScriptSigLen), outputSize(recipientScript.length), feePerAction);
  const commitOutValue = revealFee + postage;

  // --- commit ---------------------------------------------------------------
  const p2shOut: TxOut = { valueZat: commitOutValue, scriptPubKey: p2shScript(hash160(redeemScript)) };
  const changeScript = p.key.scriptPubKey();
  const selected: Utxo[] = [];
  let funded = 0n;
  let commitFee = 0n;
  let change = 0n;
  for (const u of [...p.utxos].sort((a, b) => (b.valueZat > a.valueZat ? 1 : -1))) {
    selected.push(u);
    funded += u.valueZat;
    const inSize = selected.length * inputSize(P2PKH_SCRIPTSIG_LEN);
    const withChange = outputSize(p2shOut.scriptPubKey.length) + outputSize(changeScript.length);
    commitFee = conventionalFee(inSize, withChange, feePerAction);
    change = funded - commitOutValue - commitFee;
    if (change >= DUST_ZAT) break;
    // Not enough for a change output: try without one.
    const noChange = conventionalFee(inSize, outputSize(p2shOut.scriptPubKey.length), feePerAction);
    if (funded >= commitOutValue + noChange) { commitFee = noChange; change = 0n; break; }
  }
  if (funded < commitOutValue + commitFee) {
    throw new Error(`insufficient funds: have ${funded} zat, need ${commitOutValue + commitFee} zat`);
  }
  if (change > 0n && change < DUST_ZAT) { commitFee += change; change = 0n; }

  const commitIns: TxIn[] = selected.map((u) => ({ txid: u.txid, vout: u.vout, valueZat: u.valueZat, scriptPubKey: u.scriptPubKey }));
  const commitOuts: TxOut[] = change > 0n
    ? [p2shOut, { valueZat: change, scriptPubKey: changeScript }]
    : [p2shOut];
  const commitSkeleton: TxSkeleton = { ...base, inputs: commitIns, outputs: commitOuts };

  const commitScriptSigs = commitIns.map((_, i) =>
    concat(pushData(p.key.signDigest(signatureHash(commitSkeleton, i))), pushData(p.key.publicKey)));
  const commitTxid = txid(commitSkeleton);
  const commit: BuiltTx = {
    skeleton: commitSkeleton, scriptSigs: commitScriptSigs,
    raw: serializeV5(commitSkeleton, commitScriptSigs), txid: commitTxid,
    feeZat: commitFee,
  };

  // --- reveal, now that the commit txid is known ----------------------------
  const revealSkeleton: TxSkeleton = {
    ...base,
    inputs: [{ txid: commitTxid, vout: 0, valueZat: commitOutValue, scriptPubKey: p2shOut.scriptPubKey }],
    outputs: [revealOut],
  };
  const sig = p.key.signDigest(signatureHash(revealSkeleton, 0));
  const revealScriptSig = concat(envelope, pushData(sig), pushData(redeemScript));
  const reveal: BuiltTx = {
    skeleton: revealSkeleton, scriptSigs: [revealScriptSig],
    raw: serializeV5(revealSkeleton, [revealScriptSig]), txid: txid(revealSkeleton),
    feeZat: commitOutValue - postage,
  };

  void assemble;
  return { commit, reveal, inscriptionId: `${reveal.txid}i0`, totalCostZat: commitFee + reveal.feeZat + postage, changeZat: change };
}
