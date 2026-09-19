// lightwalletd gRPC client: chain tip, consensus branch id, UTXOs, broadcast.
//
// Public Zcash testnet RPC nodes do not expose getaddressutxos, and there is
// no working testnet explorer API, so lightwalletd is how the minter sees its
// own coins and sends transactions. Protos are vendored from
// zcash/lightwallet-protocol (src/zcash/proto).

import { credentials, loadPackageDefinition, type Client } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Utxo } from "./inscribe.ts";

const PROTO_DIR = join(dirname(fileURLToPath(import.meta.url)), "proto");

export interface LightdInfo {
  chainName: string;
  blockHeight: number;
  consensusBranchId: number;   // parsed from hex
  vendor: string;
  version: string;
}

interface Streamer extends Client {
  GetLightdInfo: (arg: unknown, cb: (e: Error | null, r: Record<string, unknown>) => void) => void;
  GetAddressUtxos: (arg: unknown, cb: (e: Error | null, r: { addressUtxos?: RawUtxo[] }) => void) => void;
  GetTransaction: (arg: unknown, cb: (e: Error | null, r: { data: Buffer; height: string | number }) => void) => void;
  SendTransaction: (arg: unknown, cb: (e: Error | null, r: { errorCode: number; errorMessage: string }) => void) => void;
}
interface RawUtxo { txid: Buffer; index: number; script: Buffer; valueZat: string | number; height: string | number }

export class Lightwalletd {
  private client: Streamer;
  readonly endpoint: string;

  constructor(endpoint = "testnet.zec.rocks:443", secure = true) {
    this.endpoint = endpoint;
    const def = loadSync([join(PROTO_DIR, "service.proto")], {
      includeDirs: [PROTO_DIR], keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
    });
    const pkg = loadPackageDefinition(def) as unknown as {
      cash: { z: { wallet: { sdk: { rpc: { CompactTxStreamer: new (e: string, c: ReturnType<typeof credentials.createSsl>) => Streamer } } } } };
    };
    const Ctor = pkg.cash.z.wallet.sdk.rpc.CompactTxStreamer;
    this.client = new Ctor(endpoint, secure ? credentials.createSsl() : credentials.createInsecure());
  }

  close() { this.client.close(); }

  private call<T>(method: "GetLightdInfo" | "GetAddressUtxos" | "SendTransaction" | "GetTransaction", arg: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      (this.client[method] as (a: unknown, cb: (e: Error | null, r: unknown) => void) => void)(arg, (err, res) => {
        err ? reject(err) : resolve(res as T);
      });
    });
  }

  async info(): Promise<LightdInfo> {
    const r = await this.call<Record<string, string>>("GetLightdInfo", {});
    return {
      chainName: r.chainName,
      blockHeight: Number(r.blockHeight),
      consensusBranchId: Number.parseInt(r.consensusBranchId, 16),
      vendor: r.vendor,
      version: r.version,
    };
  }

  /** Transparent UTXOs of an address. txid comes back little-endian on the wire. */
  async utxos(address: string, startHeight = 0): Promise<Utxo[]> {
    const r = await this.call<{ addressUtxos?: RawUtxo[] }>("GetAddressUtxos", { addresses: [address], startHeight, maxEntries: 0 });
    return (r.addressUtxos ?? []).map((u) => ({
      txid: Buffer.from(u.txid).reverse().toString("hex"),
      vout: u.index,
      valueZat: BigInt(u.valueZat),
      scriptPubKey: Uint8Array.from(u.script),
    }));
  }

  /** Fetch a raw transaction by txid (big-endian hex, as displayed). */
  async transaction(txidHex: string): Promise<{ raw: Uint8Array; height: number }> {
    const r = await this.call<{ data: Buffer; height: string | number }>("GetTransaction", {
      hash: Buffer.from(txidHex, "hex").reverse(),
    });
    return { raw: Uint8Array.from(r.data), height: Number(r.height) };
  }

  /** Broadcast a raw transaction. Throws on a non-zero error code. */
  async send(raw: Uint8Array, height = 0): Promise<string> {
    const r = await this.call<{ errorCode: number; errorMessage: string }>("SendTransaction", { data: Buffer.from(raw), height });
    if (Number(r.errorCode) !== 0) throw new Error(`broadcast rejected (${r.errorCode}): ${r.errorMessage}`);
    return r.errorMessage; // lightwalletd returns the txid here on success
  }
}
