/**
 * Tests for opt-in encryption helper
 */

import {
  serializeSecret,
  deserializeSecret,
  isEncryptionEnabled,
  PASSPHRASE_ENV
} from '../src/secret-storage.js';

describe('secret-storage', () => {
  const originalPassphrase = process.env[PASSPHRASE_ENV];

  afterEach(() => {
    if (originalPassphrase === undefined) {
      delete process.env[PASSPHRASE_ENV];
    } else {
      process.env[PASSPHRASE_ENV] = originalPassphrase;
    }
  });

  test('serializes plaintext when no passphrase set', () => {
    delete process.env[PASSPHRASE_ENV];
    const obj = { hello: 'world', n: 42 };
    const serialized = serializeSecret(obj);
    expect(JSON.parse(serialized)).toEqual(obj);
    expect(deserializeSecret(serialized)).toEqual(obj);
  });

  test('encrypts when passphrase is set and round-trips', () => {
    process.env[PASSPHRASE_ENV] = 'correct horse battery staple';
    const obj = { secret: 'isk-deadbeef', issuer: 'abcd' };
    const serialized = serializeSecret(obj);
    const envelope = JSON.parse(serialized);
    expect(envelope.$encrypted).toBe(true);
    expect(envelope.data).toBeDefined();
    expect(envelope.salt).toBeDefined();
    expect(envelope.iv).toBeDefined();
    expect(envelope.tag).toBeDefined();
    expect(JSON.stringify(envelope)).not.toContain('isk-deadbeef');

    expect(deserializeSecret(serialized)).toEqual(obj);
  });

  test('two encryptions of same value produce different ciphertexts', () => {
    process.env[PASSPHRASE_ENV] = 'pass';
    const a = JSON.parse(serializeSecret({ x: 1 }));
    const b = JSON.parse(serializeSecret({ x: 1 }));
    expect(a.data).not.toBe(b.data);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
  });

  test('decrypt fails with wrong passphrase', () => {
    process.env[PASSPHRASE_ENV] = 'correct';
    const serialized = serializeSecret({ s: 'secret' });
    process.env[PASSPHRASE_ENV] = 'wrong';
    expect(() => deserializeSecret(serialized)).toThrow(/decrypt/i);
  });

  test('decrypt fails with no passphrase set on encrypted data', () => {
    process.env[PASSPHRASE_ENV] = 'pass';
    const serialized = serializeSecret({ s: 'secret' });
    delete process.env[PASSPHRASE_ENV];
    expect(() => deserializeSecret(serialized)).toThrow(/encrypted but/i);
  });

  test('plaintext file still readable when passphrase is set', () => {
    delete process.env[PASSPHRASE_ENV];
    const plaintext = serializeSecret({ legacy: true });
    process.env[PASSPHRASE_ENV] = 'pass';
    expect(deserializeSecret(plaintext)).toEqual({ legacy: true });
  });

  test('isEncryptionEnabled reflects env var', () => {
    delete process.env[PASSPHRASE_ENV];
    expect(isEncryptionEnabled()).toBe(false);
    process.env[PASSPHRASE_ENV] = 'x';
    expect(isEncryptionEnabled()).toBe(true);
    process.env[PASSPHRASE_ENV] = '';
    expect(isEncryptionEnabled()).toBe(false);
  });

  test('deserializeSecret throws on invalid JSON', () => {
    expect(() => deserializeSecret('{not json')).toThrow(/not valid JSON/);
  });
});
