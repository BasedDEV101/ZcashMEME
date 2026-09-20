// A plain transparent payment: some UTXOs in, one recipient out, change back.
//
// The launchpad needs this to fund a collection's stamp balance out of the
// launch fee, so nobody has to buy ZEC by hand before their holders can burn.
// It is deliberately the simplest transaction this codebase builds — no
// envelope, no P2SH, no commit/reveal — and shares the same ZIP 244 signing
// and ZIP 317 fee code as the inscriptions, so a payment cannot be priced or
// signed by different rules than a stamp.

import { conventionalFee, inputSize, marginalFee, outputSize, P2PKH_SCRIPTSIG_LEN } from "./fees.ts";
import { DUST_ZAT } from "./inscription.ts";
import { concat, pushData } from "./script.ts";
import { p2pkhScript, p2shScript, type TransparentKey } from "./wallet.ts";
import { serializeV5, signatureHash, txid, type TxIn, type TxOut, type TxSkeleton } from "./zip244.ts";
import { parseTransparentAddress } from "../core/zcash-address.ts";
import type { BuiltTx, Utxo } from "./inscribe.ts";

export interface PayParams {
  key: TransparentKey;
  utxos: Utxo[];
  to: string;
  amountZat: bigint;
  network: "main" | "test";
  consensusBranchId: number;
  chainHeight: number;
  expiryDelta?: number;
}

export function buildPayment(p: PayParams): BuiltTx {
  const to = parseTransparentAddress(p.to);
  if (!to) throw new Error(`not a transparent address: ${p.to}`);
  if (to.network !== p.network) throw new Error(`recipient is a ${to.network}net address`);
  if (p.amountZat < DUST_ZAT) throw new Error(`amount below dust (${DUST_ZAT} zat)`);

  const feePerAction = marginalFee(p.chainHeight, p.network);
  const payScript = to.kind === "p2sh" ? p2shScript(to.hash) : p2pkhScript(to.hash);
  const changeScript = p.key.scriptPubKey();
  const payOut: TxOut = { valueZat: p.amountZat, scriptPubKey: payScript };

  // Largest first, so a payment uses as few inputs as it can: every extra
  // input is another logical action and so another marginal fee.
  const selected: Utxo[] = [];
  let funded = 0n;
  let fee = 0n;
  let change = 0n;
  for (const u of [...p.utxos].sort((a, b) => (b.valueZat > a.valueZat ? 1 : -1))) {
    selected.push(u);
    funded += u.valueZat;
    const ins = selected.length * inputSize(P2PKH_SCRIPTSIG_LEN);
    fee = conventionalFee(ins, outputSize(payScript.length) + outputSize(changeScript.length), feePerAction);
    change = funded - p.amountZat - fee;
    if (change >= DUST_ZAT) break;
    const noChange = conventionalFee(ins, outputSize(payScript.length), feePerAction);
    if (funded >= p.amountZat + noChange) { fee = noChange; change = 0n; break; }
  }
  if (funded < p.amountZat + fee) {
    throw new Error(`insufficient funds: have ${funded} zat, need ${p.amountZat + fee} zat`);
  }
  // Change too small to be worth an output is left to the miner rather than
  // creating an unspendable dust UTXO.
  if (change > 0n && change < DUST_ZAT) { fee += change; change = 0n; }

  const inputs: TxIn[] = selected.map((u) => ({ txid: u.txid, vout: u.vout, valueZat: u.valueZat, scriptPubKey: u.scriptPubKey }));
  const outputs: TxOut[] = change > 0n ? [payOut, { valueZat: change, scriptPubKey: changeScript }] : [payOut];
  const skeleton: TxSkeleton = {
    consensusBranchId: p.consensusBranchId,
    lockTime: 0,
    expiryHeight: p.chainHeight + (p.expiryDelta ?? 40),
    inputs,
    outputs,
  };
  const scriptSigs = inputs.map((_, i) =>
    concat(pushData(p.key.signDigest(signatureHash(skeleton, i))), pushData(p.key.publicKey)));

  return { skeleton, scriptSigs, raw: serializeV5(skeleton, scriptSigs), txid: txid(skeleton), feeZat: fee };
}
