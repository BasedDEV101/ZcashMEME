/**
 * Optional at-rest encryption for sensitive JSON files (issuance keys, wallets).
 * Activated when the ZCASH_KEY_PASSPHRASE env var is set; otherwise files are
 * written as plaintext JSON and a one-time warning is logged.
 *
 * Format (when encrypted):
 *   { "$encrypted": true, "v": 1, "kdf": "pbkdf2-sha512", "iter": 200000,
 *     "salt": "<base64>", "iv": "<base64>", "tag": "<base64>", "data": "<base64>" }
 */

import crypto from 'crypto';

export const PASSPHRASE_ENV = 'ZCASH_KEY_PASSPHRASE';
const KDF_ITERATIONS = 200_000;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

function getPassphrase() {
  const p = process.env[PASSPHRASE_ENV];
  return p && p.length > 0 ? p : null;
}

let plaintextWarned = false;
function warnPlaintextOnce() {
  if (plaintextWarned || process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    return;
  }
  plaintextWarned = true;
  console.warn(
    `[WARN] Sensitive files are stored in plaintext. Set ${PASSPHRASE_ENV} to encrypt them at rest.`
  );
}

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, KDF_ITERATIONS, KEY_LENGTH, 'sha512');
}

export function isEncryptionEnabled() {
  return getPassphrase() !== null;
}

export function serializeSecret(obj) {
  const passphrase = getPassphrase();
  if (!passphrase) {
    warnPlaintextOnce();
    return JSON.stringify(obj, null, 2);
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify(
    {
      $encrypted: true,
      v: 1,
      kdf: 'pbkdf2-sha512',
      iter: KDF_ITERATIONS,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: ciphertext.toString('base64')
    },
    null,
    2
  );
}

export function deserializeSecret(text) {
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch (error) {
    throw new Error(`Stored secret is not valid JSON: ${error.message}`);
  }

  if (!envelope || envelope.$encrypted !== true) {
    return envelope;
  }

  const passphrase = getPassphrase();
  if (!passphrase) {
    throw new Error(
      `File is encrypted but ${PASSPHRASE_ENV} is not set. Set the env var to the original passphrase to decrypt.`
    );
  }

  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const data = Buffer.from(envelope.data, 'base64');
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  } catch (error) {
    throw new Error(
      `Failed to decrypt sensitive file (wrong passphrase or corrupted data): ${error.message}`
    );
  }

  return JSON.parse(plaintext.toString('utf8'));
}
