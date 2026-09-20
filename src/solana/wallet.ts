// Local keypair handling for devnet/testnet scripts.
//
// Project rule: keys live only in git-ignored files with 0600 permissions, and
// are never logged, echoed or committed. Only the public key is ever printed.

import { Keypair } from "@solana/web3.js";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname } from "node:path";

export function loadOrCreateKeypair(path: string): { keypair: Keypair; created: boolean } {
  if (existsSync(path)) {
    const mode = statSync(path).mode & 0o777;
    if (mode !== 0o600) chmodSync(path, 0o600);
    const secret = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]);
    return { keypair: Keypair.fromSecretKey(secret), created: false };
  }
  mkdirSync(dirname(path), { recursive: true });
  const keypair = Keypair.generate();
  writeFileSync(path, JSON.stringify([...keypair.secretKey]), { mode: 0o600 });
  chmodSync(path, 0o600);
  return { keypair, created: true };
}
