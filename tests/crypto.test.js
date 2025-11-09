/**
 * Tests for cryptographic utilities (ZIP 227)
 */

// Jest tests use global functions in Node.js ESM mode
import {
  blake2b256,
  blake2b512,
  computeAssetDescHash,
  computeAssetId,
  computeAssetDigest,
  computeAssetBase,
  createAssetDescription,
  parseAssetDescription
} from '../src/crypto.js';

describe('Cryptographic Utilities', () => {
  test('should compute BLAKE2b-256 hash', () => {
    const data = Buffer.from('test data');
    const hash = blake2b256(data);

    expect(hash).toBeDefined();
    expect(hash.length).toBe(32); // 256 bits = 32 bytes
    expect(hash.toString('hex')).toBe('eab94977a17791d0c089fe9e393261b3ab667cf0e8456632a842d905c468cf65');
  });

  test('should compute BLAKE2b-512 hash', () => {
    const data = Buffer.from('test data');
    const hash = blake2b512(data);

    expect(hash).toBeDefined();
    expect(hash.length).toBe(64); // 512 bits = 64 bytes
    expect(hash.toString('hex')).toBe('21bae505e9cd790bd374e387886738653270888d2b6e0753a1d6ff29b56a30491a7531ae2ec30a75b7446f5e16acb504f8cad64b51e6b6c6f8894368748a3f6b');
  });

  test('should compute asset description hash', () => {
    const assetDesc = 'TestCoin|TEST|Test description';
    const hash = computeAssetDescHash(assetDesc);
    
    expect(hash).toBeDefined();
    expect(Buffer.isBuffer(hash)).toBe(true);
    expect(hash.length).toBe(32);
    expect(hash.toString('hex')).toBe('54484bf7c320afe6dc3a13003495976a16a1f36bbb331eed2cb839137355160a');
  });

  test('should compute same hash for same asset description', () => {
    const assetDesc = 'TestCoin|TEST|Test description';
    const hash1 = computeAssetDescHash(assetDesc);
    const hash2 = computeAssetDescHash(assetDesc);
    
    expect(hash1).toEqual(hash2);
  });

  test('should compute different hash for different asset descriptions', () => {
    const desc1 = 'TestCoin|TEST|Description 1';
    const desc2 = 'TestCoin|TEST|Description 2';
    const hash1 = computeAssetDescHash(desc1);
    const hash2 = computeAssetDescHash(desc2);
    
    expect(hash1).not.toEqual(hash2);
  });

  test('should compute asset ID', () => {
    const issuer = 'a'.repeat(64); // 32 bytes in hex
    const assetDesc = 'TestCoin|TEST|Test description';
    const { assetId, issuer: returnedIssuer, assetDescHash } = computeAssetId(issuer, assetDesc);
    
    expect(assetId).toBeDefined();
    expect(returnedIssuer).toBe(issuer);
    expect(assetDescHash).toBeDefined();
    
    // Asset ID format: [0x00 || issuer (32 bytes) || asset_desc_hash (32 bytes)]
    // Total: 1 + 32 + 32 = 65 bytes = 130 hex chars
    expect(assetId.length).toBe(130);
    expect(assetId.startsWith('00')).toBe(true);
  });

  test('should compute same asset ID for same issuer and description', () => {
    const issuer = 'a'.repeat(64);
    const assetDesc = 'TestCoin|TEST|Test description';
    const { assetId: id1 } = computeAssetId(issuer, assetDesc);
    const { assetId: id2 } = computeAssetId(issuer, assetDesc);
    
    expect(id1).toBe(id2);
  });

  test('should compute different asset ID for different issuers', () => {
    const issuer1 = 'a'.repeat(64);
    const issuer2 = 'b'.repeat(64);
    const assetDesc = 'TestCoin|TEST|Test description';
    const { assetId: id1 } = computeAssetId(issuer1, assetDesc);
    const { assetId: id2 } = computeAssetId(issuer2, assetDesc);
    
    expect(id1).not.toBe(id2);
  });

  test('should compute asset digest', () => {
    const assetId = '00' + 'a'.repeat(128); // 65 bytes in hex
    const digest = computeAssetDigest(assetId);
    
    expect(digest).toBeDefined();
    expect(Buffer.isBuffer(digest)).toBe(true);
    expect(digest.length).toBe(64); // 512 bits = 64 bytes
    expect(digest.toString('hex')).toBe('809f2fd5eaf3f0f607983f0496505d9a3d135a65259897a8788323689b730a89a8a6368e90d87d1b7e7f777ac5ca046abbf3b07f2a5692ff04ab7d0656a52223');
  });

  test('should compute asset base', () => {
    const assetDigest = Buffer.alloc(64, 0xAB);
    const assetBase = computeAssetBase(assetDigest);
    
    expect(assetBase).toBeDefined();
    expect(typeof assetBase).toBe('string');
  });

  test('should create asset description', () => {
    const desc = createAssetDescription('TestCoin', 'TEST', 'Test description');
    
    expect(desc).toBe('TestCoin|TEST|Test description');
  });

  test('should create asset description with empty description', () => {
    const desc = createAssetDescription('TestCoin', 'TEST', '');
    
    expect(desc).toBe('TestCoin|TEST|');
  });

  test('should parse asset description', () => {
    const desc = 'TestCoin|TEST|Test description';
    const parsed = parseAssetDescription(desc);
    
    expect(parsed.name).toBe('TestCoin');
    expect(parsed.symbol).toBe('TEST');
    expect(parsed.description).toBe('Test description');
  });

  test('should parse asset description with empty description', () => {
    const desc = 'TestCoin|TEST|';
    const parsed = parseAssetDescription(desc);
    
    expect(parsed.name).toBe('TestCoin');
    expect(parsed.symbol).toBe('TEST');
    expect(parsed.description).toBe('');
  });

  test('should parse asset description with multiple pipes in description', () => {
    const desc = 'TestCoin|TEST|Part1|Part2|Part3';
    const parsed = parseAssetDescription(desc);
    
    expect(parsed.name).toBe('TestCoin');
    expect(parsed.symbol).toBe('TEST');
    expect(parsed.description).toBe('Part1|Part2|Part3');
  });
});
