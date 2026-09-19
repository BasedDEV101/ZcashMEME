// Local state for the watcher, minter and indexer: node:sqlite, no deps.
//
// Nothing here is authoritative. Every row can be rebuilt from the two chains
// (SPEC §1). The store only saves re-fetching and remembers work in flight.

import { DatabaseSync } from "node:sqlite";
import type { BurnVerdict, ValidBurn } from "../core/types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS burns (
  signature     TEXT PRIMARY KEY,
  slot          INTEGER NOT NULL,
  block_time    INTEGER,
  ok            INTEGER NOT NULL,          -- 1 valid burn, 0 rejected
  reason        TEXT,                      -- why it was rejected
  authority     TEXT,
  amount        TEXT,                      -- raw base units, decimal string
  zcash_address TEXT,
  seen_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS burns_ok_slot ON burns (ok, slot);

CREATE TABLE IF NOT EXISTS cursor (
  name  TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- One row per burn the minter has acted on. Status moves
-- pending -> committed -> revealed -> confirmed, or -> failed.
CREATE TABLE IF NOT EXISTS mint_jobs (
  signature     TEXT PRIMARY KEY REFERENCES burns(signature),
  status        TEXT NOT NULL,
  commit_txid   TEXT,
  reveal_txid   TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export class Store {
  db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000;");
    this.db.exec(SCHEMA);
  }

  close() { this.db.close(); }

  getCursor(name: string): string | null {
    const r = this.db.prepare("SELECT value FROM cursor WHERE name = ?").get(name) as { value: string } | undefined;
    return r?.value ?? null;
  }

  setCursor(name: string, value: string) {
    this.db.prepare("INSERT INTO cursor (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value").run(name, value);
  }

  hasBurn(signature: string): boolean {
    return this.db.prepare("SELECT 1 FROM burns WHERE signature = ?").get(signature) !== undefined;
  }

  /** Idempotent: a signature's verdict is recorded once and never changes. */
  recordVerdict(signature: string, slot: number, blockTime: number | null, v: BurnVerdict) {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO burns (signature, slot, block_time, ok, reason, authority, amount, zcash_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    if (v.ok) {
      stmt.run(signature, slot, blockTime, 1, null, v.burn.authority, v.burn.amount.toString(), v.burn.zcashAddress);
    } else {
      stmt.run(signature, slot, blockTime, 0, v.reason, null, null, null);
    }
  }

  verdicts(): Map<string, BurnVerdict> {
    const rows = this.db.prepare("SELECT * FROM burns ORDER BY slot, signature").all() as Record<string, unknown>[];
    const out = new Map<string, BurnVerdict>();
    for (const r of rows) {
      const sig = r.signature as string;
      out.set(sig, r.ok
        ? { ok: true, burn: toBurn(r) }
        : { ok: false, reason: r.reason as string });
    }
    return out;
  }

  validBurns(): ValidBurn[] {
    return (this.db.prepare("SELECT * FROM burns WHERE ok = 1 ORDER BY slot, signature").all() as Record<string, unknown>[]).map(toBurn);
  }

  /** Plain object: node:sqlite returns null-prototype rows, and SUM() is null on an empty table. */
  counts(): { valid: number; rejected: number; total: number } {
    const r = this.db.prepare(
      "SELECT SUM(ok = 1) AS valid, SUM(ok = 0) AS rejected, COUNT(*) AS total FROM burns").get() as Record<string, unknown>;
    return { valid: Number(r.valid ?? 0), rejected: Number(r.rejected ?? 0), total: Number(r.total ?? 0) };
  }
}

function toBurn(r: Record<string, unknown>): ValidBurn {
  return {
    signature: r.signature as string,
    slot: Number(r.slot),
    blockTime: r.block_time === null ? null : Number(r.block_time),
    authority: r.authority as string,
    amount: BigInt(r.amount as string),
    zcashAddress: r.zcash_address as string,
  };
}
