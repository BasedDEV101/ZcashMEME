// In-memory stand-in for SolanaRpc with real paging semantics:
// newest-first, `before` and `until` exclusive, `limit` honoured.
import type { RpcTransaction } from "../../src/solana/normalize.ts";
import { RpcError, type SignatureInfo } from "../../src/solana/rpc.ts";

export class FakeRpc {
  history: { info: SignatureInfo; tx: RpcTransaction }[] = []; // oldest first
  calls = { list: 0, get: 0 };
  failGetOnce = new Set<string>();
  /** Signatures the node claims not to know, as a pruned/changed RPC would. */
  unknownSignatures = new Set<string>();

  push(tx: RpcTransaction, memo: string | null) {
    const sig = tx.transaction.signatures[0];
    this.history.push({ info: { signature: sig, slot: tx.slot, err: tx.meta?.err ?? null, memo } as SignatureInfo, tx });
  }

  async getSignaturesForAddress(_addr: string, o: { before?: string; until?: string; limit?: number } = {}) {
    this.calls.list++;
    if (o.until && this.unknownSignatures.has(o.until)) {
      throw new RpcError(`getSignaturesForAddress: Transaction ${o.until} not found`);
    }
    const newestFirst = [...this.history].reverse().map((h) => h.info);
    let start = 0;
    if (o.before) start = newestFirst.findIndex((s) => s.signature === o.before) + 1;
    const out: SignatureInfo[] = [];
    for (let i = start; i < newestFirst.length && out.length < (o.limit ?? 1000); i++) {
      if (newestFirst[i].signature === o.until) break;
      out.push(newestFirst[i]);
    }
    return out;
  }

  async getTransaction(sig: string) {
    this.calls.get++;
    if (this.failGetOnce.delete(sig)) throw new Error("simulated RPC outage");
    return this.history.find((h) => h.info.signature === sig)?.tx ?? null;
  }
}
