/**
 * Integration tests for complete token creation flow
 */

// Jest tests use global functions in Node.js ESM mode
import { TokenCreator } from '../src/token-creator.js';
import { IssuanceKeys } from '../src/keys.js';
import { computeAssetId, createAssetDescription } from '../src/crypto.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Integration Tests', () => {
  let tokenCreator;
  const testTokensDir = path.join(__dirname, '..', 'test-tokens');
  const testKeysDir = path.join(__dirname, '..', 'test-keys');

  beforeEach(() => {
    // Clean up test directories with retry logic for Windows
    const cleanup = (dir) => {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch (error) {
          // Ignore cleanup errors on Windows
        }
      }
    };
    
    cleanup(testTokensDir);
    cleanup(testKeysDir);
    
    // Small delay for Windows
    if (process.platform === 'win32') {
      const start = Date.now();
      while (Date.now() - start < 100) {}
    }
    
    tokenCreator = new TokenCreator();
    tokenCreator.tokensDir = testTokensDir;
    tokenCreator.tokensFile = path.join(testTokensDir, 'created-tokens.json');
    tokenCreator.keys.keysDir = testKeysDir;
    tokenCreator.keys.keysFile = path.join(testKeysDir, 'issuance-keys.json');
  });

  afterEach(() => {
    // Clean up after tests
    const cleanup = (dir) => {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    };
    
    cleanup(testTokensDir);
    cleanup(testKeysDir);
  });

  test('should create complete token with all ZIP 227 components', async () => {
    // Step 1: Generate keys
    const keys = new IssuanceKeys();
    keys.keysDir = testKeysDir;
    keys.keysFile = path.join(testKeysDir, 'issuance-keys.json');
    const issuer = keys.getIssuer();
    
    // Step 2: Create asset description
    const assetDesc = createAssetDescription('PepeCoin', 'PEPE', 'The memest coin');
    
    // Step 3: Compute asset ID
    const { assetId } = computeAssetId(issuer, assetDesc);
    
    // Step 4: Create token
    const tokenData = {
      name: 'PepeCoin',
      symbol: 'PEPE',
      description: 'The memest coin',
      initialSupply: '1000000000',
      recipientAddress: 'zt1pepe123456789',
      finalize: false
    };
    
    const token = await tokenCreator.createToken(tokenData);
    
    // Verify all components
    expect(token.issuer).toBe(issuer);
    expect(token.assetId).toBe(assetId);
    expect(token.assetDesc).toBe(assetDesc);
    expect(token.name).toBe('PepeCoin');
    expect(token.symbol).toBe('PEPE');
    expect(token.transaction).toBeDefined();
    expect(token.transaction.version).toBe(6);
  });

  test('should create multiple tokens with same issuer', async () => {
    const token1 = await tokenCreator.createToken({
      name: 'Token1',
      symbol: 'TKN1',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123'
    });
    
    const token2 = await tokenCreator.createToken({
      name: 'Token2',
      symbol: 'TKN2',
      initialSupply: '2000000',
      recipientAddress: 'zt1test456'
    });
    
    // Both tokens should have same issuer
    expect(token1.issuer).toBe(token2.issuer);
    
    // But different asset IDs
    expect(token1.assetId).not.toBe(token2.assetId);
  });

  test('should create, issue more, and finalize token', async () => {
    // Create token
    const token = await tokenCreator.createToken({
      name: 'TestCoin',
      symbol: 'TEST',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123',
      finalize: false
    });
    
    expect(token.totalSupply).toBe('1000000');
    expect(token.finalized).toBe(false);
    
    // Issue more
    const issueResult = await tokenCreator.issueMore(token.assetId, '500000', 'zt1test456');
    expect(issueResult.token.totalSupply).toBe('1500000');
    
    // Finalize
    const finalizeResult = await tokenCreator.finalizeToken(token.assetId);
    expect(finalizeResult.token.finalized).toBe(true);
    
    // Try to issue more (should fail)
    await expect(
      tokenCreator.issueMore(token.assetId, '100000', 'zt1test789')
    ).rejects.toThrow('finalized');
  });

  test('should maintain token data consistency across operations', async () => {
    const token = await tokenCreator.createToken({
      name: 'ConsistentCoin',
      symbol: 'CONS',
      description: 'Test consistency',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123'
    });
    
    const assetId = token.assetId;
    const issuer = token.issuer;
    
    // Issue more
    await tokenCreator.issueMore(assetId, '500000', 'zt1test456');
    const updatedToken = tokenCreator.getTokenByAssetId(assetId);
    
    // Verify consistency
    expect(updatedToken.assetId).toBe(assetId);
    expect(updatedToken.issuer).toBe(issuer);
    expect(updatedToken.name).toBe('ConsistentCoin');
    expect(updatedToken.symbol).toBe('CONS');
    expect(updatedToken.totalSupply).toBe('1500000');
  });

  test('should handle large supply values', async () => {
    const maxSafeSupply = '18446744073709551615'; // 2^64 - 1
    
    const token = await tokenCreator.createToken({
      name: 'LargeCoin',
      symbol: 'LARGE',
      initialSupply: maxSafeSupply,
      recipientAddress: 'zt1test123',
      finalize: true
    });
    
    expect(token.totalSupply).toBe(maxSafeSupply);
    expect(token.finalized).toBe(true);
  });

  test('should create tokens with various descriptions', async () => {
    const descriptions = [
      '',
      'Simple description',
      'Description with | pipes | and special chars',
      'Very long description ' + 'x'.repeat(100)
    ];
    
    for (const desc of descriptions) {
      const token = await tokenCreator.createToken({
        name: 'TestCoin',
        symbol: 'TEST',
        description: desc,
        initialSupply: '1000000',
        recipientAddress: 'zt1test123'
      });
      
      expect(token.description).toBe(desc);
      expect(token.assetDesc).toContain(desc);
    }
  });
});
