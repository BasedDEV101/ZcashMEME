// Filesystem key loading. Node only, deliberately separate from wallet.ts:
// the browser imports TransparentKey to derive an address and must never pull
// node:fs in with it.

import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { TransparentKey } from "./wallet.ts";

/** Load a key from a 0600 file, creating one if absent. The file holds hex only. */
export function loadOrCreateKey(path: string): { key: TransparentKey; created: boolean } {
  if (existsSync(path)) {
    if ((statSync(path).mode & 0o777) !== 0o600) chmodSync(path, 0o600);
    return { key: new TransparentKey(Uint8Array.from(Buffer.from(readFileSync(path, "utf8").trim(), "hex"))), created: false };
  }
  mkdirSync(dirname(path), { recursive: true });
  const key = TransparentKey.generate();
  writeFileSync(path, Buffer.from(key.privateKey).toString("hex"), { mode: 0o600 });
  chmodSync(path, 0o600);
  return { key, created: true };
}
