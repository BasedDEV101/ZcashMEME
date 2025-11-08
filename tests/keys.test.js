/**
 * Tests for key generation (ZIP 227)
 */

// Jest tests use global functions in Node.js ESM mode
import { IssuanceKeys } from '../src/keys.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('IssuanceKeys', () => {
  let keys;
  const testKeysDir = path.join(__dirname, '..', 'test-keys');

  beforeEach(() => {
    // Clean up test keys directory
    if (fs.existsSync(testKeysDir)) {
      fs.rmSync(testKeysDir, { recursive: true, force: true });
    }
    
    // Create temporary keys instance
    keys = new IssuanceKeys();
    keys.keysDir = testKeysDir;
    keys.keysFile = path.join(testKeysDir, 'issuance-keys.json');
  });

  test('should generate seed of correct length', () => {
    const seed32 = keys.generateSeed(32);
    expect(seed32.length).toBe(32);
    
    const seed64 = keys.generateSeed(64);
    expect(seed64.length).toBe(64);
  });

  test('should reject invalid seed lengths', () => {
    expect(() => keys.generateSeed(31)).toThrow();
    expect(() => keys.generateSeed(253)).toThrow();
  });

  test('should generate master key from seed', () => {
    const seed = keys.generateSeed(32);
    const { masterKey, chainCode } = keys.generateMasterKey(seed);
    
    expect(masterKey).toBeDefined();
    expect(chainCode).toBeDefined();
    expect(masterKey.length).toBe(32);
    expect(chainCode.length).toBe(32);
  });

  test('should generate same master key from same seed', () => {
    const seed = keys.generateSeed(32);
    const key1 = keys.generateMasterKey(seed);
    const key2 = keys.generateMasterKey(seed);
    
    expect(key1.masterKey).toEqual(key2.masterKey);
    expect(key1.chainCode).toEqual(key2.chainCode);
  });

  test('should derive issuance key from master key', () => {
    const seed = keys.generateSeed(32);
    const { masterKey, chainCode } = keys.generateMasterKey(seed);
    const { isk, chainCode: derivedChainCode } = keys.deriveIssuanceKey(masterKey, chainCode, 0);
    
    expect(isk).toBeDefined();
    expect(derivedChainCode).toBeDefined();
    expect(isk.length).toBe(32);
    expect(derivedChainCode.length).toBe(32);
  });

  test('should derive validating key from issuance key', () => {
    const seed = keys.generateSeed(32);
    const { masterKey, chainCode } = keys.generateMasterKey(seed);
    const { isk } = keys.deriveIssuanceKey(masterKey, chainCode, 0);
    const { ik } = keys.deriveValidatingKey(isk);
    
    expect(ik).toBeDefined();
    expect(ik.length).toBe(32);
  });

  test('should encode issuer identifier', () => {
    const issuer = keys.encodeIssuer(Buffer.alloc(32, 0xAB));
    
    expect(issuer).toBeDefined();
    expect(typeof issuer).toBe('string');
    expect(issuer.length).toBe(66); // 0x00 prefix + 32 bytes = 66 hex chars
    expect(issuer.startsWith('00')).toBe(true);
  });

  test('should generate or load keys', () => {
    const keysData = keys.generateOrLoadKeys();
    
    expect(keysData).toBeDefined();
    expect(keysData.seed).toBeDefined();
    expect(keysData.masterKey).toBeDefined();
    expect(keysData.isk).toBeDefined();
    expect(keysData.ik).toBeDefined();
    expect(keysData.issuer).toBeDefined();
    expect(keysData.issuer.length).toBe(66);
    expect(keysData.createdAt).toBeDefined();
  });

  test('should load existing keys', () => {
    const keysData1 = keys.generateOrLoadKeys();
    const keysData2 = keys.generateOrLoadKeys();
    
    // Should return same keys
    expect(keysData1.issuer).toBe(keysData2.issuer);
    expect(keysData1.isk).toBe(keysData2.isk);
  });

  test('should get issuer identifier', () => {
    keys.generateOrLoadKeys();
    const issuer = keys.getIssuer();
    
    expect(issuer).toBeDefined();
    expect(typeof issuer).toBe('string');
    expect(issuer.length).toBe(66);
    expect(issuer.startsWith('00')).toBe(true);
  });

  test('should get issuance authorizing key', () => {
    keys.generateOrLoadKeys();
    const isk = keys.getISK();
    
    expect(isk).toBeDefined();
    expect(Buffer.isBuffer(isk)).toBe(true);
    expect(isk.length).toBe(32);
  });
});
