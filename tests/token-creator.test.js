/**
 * Tests for token creator (ZIP 227)
 */

// Jest tests use global functions in Node.js ESM mode
import { TokenCreator } from '../src/token-creator.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('TokenCreator', () => {
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
          if (process.platform === 'win32') {
            // Try to remove files individually
            try {
              const files = fs.readdirSync(dir);
              files.forEach(file => {
                try {
                  fs.unlinkSync(path.join(dir, file));
                } catch (e) {
                  // Ignore
                }
              });
            } catch (e) {
              // Ignore
            }
          }
        }
      }
    };
    
    cleanup(testTokensDir);
    cleanup(testKeysDir);
    
    // Small delay to ensure cleanup completes
    if (process.platform === 'win32') {
      // Wait a bit for Windows file system
      const start = Date.now();
      while (Date.now() - start < 100) {
        // Wait
      }
    }
    
    tokenCreator = new TokenCreator();
    tokenCreator.tokensDir = testTokensDir;
    tokenCreator.tokensFile = path.join(testTokensDir, 'created-tokens.json');
    tokenCreator.keys.keysDir = testKeysDir;
    tokenCreator.keys.keysFile = path.join(testKeysDir, 'issuance-keys.json');
  });

  afterEach(() => {
    // Clean up after tests with retry
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

  test('should create token with valid data', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      description: 'Test description',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123456789',
      finalize: false
    };
    
    const token = await tokenCreator.createToken(tokenData);
    
    expect(token).toBeDefined();
    expect(token.id).toBeDefined();
    expect(token.name).toBe('TestCoin');
    expect(token.symbol).toBe('TEST');
    expect(token.description).toBe('Test description');
    expect(token.initialSupply).toBe('1000000');
    expect(token.totalSupply).toBe('1000000');
    expect(token.recipientAddress).toBe('zt1test123456789');
    expect(token.finalized).toBe(false);
    expect(token.issuer).toBeDefined();
    expect(token.assetId).toBeDefined();
    expect(token.assetDescHash).toBeDefined();
    expect(token.status).toBe('pending');
  });

  test('should reject token creation with missing required fields', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST'
      // Missing initialSupply and recipientAddress
    };
    
    await expect(tokenCreator.createToken(tokenData)).rejects.toThrow();
  });

  test('should reject token with invalid symbol length', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'T', // Too short
      initialSupply: '1000000',
      recipientAddress: 'zt1test123456789'
    };
    
    await expect(tokenCreator.createToken(tokenData)).rejects.toThrow();
  });

  test('should reject token with supply exceeding maximum', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      initialSupply: '18446744073709551616', // Exceeds 2^64 - 1
      recipientAddress: 'zt1test123456789'
    };
    
    await expect(tokenCreator.createToken(tokenData)).rejects.toThrow();
  });

  test('should create finalized token', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123456789',
      finalize: true
    };
    
    const token = await tokenCreator.createToken(tokenData);
    
    expect(token.finalized).toBe(true);
  });

  test('should get all tokens', async () => {
    const tokenData1 = {
      name: 'TestCoin1',
      symbol: 'TEST1',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123456789'
    };
    const tokenData2 = {
      name: 'TestCoin2',
      symbol: 'TEST2',
      initialSupply: '2000000',
      recipientAddress: 'zt1test123456789'
    };
    
    const token1 = await tokenCreator.createToken(tokenData1);
    const token2 = await tokenCreator.createToken(tokenData2);
    
    const tokens = tokenCreator.getAllTokens();
    
    expect(tokens.length).toBe(2);
    // Check that both tokens exist (order may vary)
    const tokenNames = tokens.map(t => t.name);
    expect(tokenNames).toContain('TestCoin1');
    expect(tokenNames).toContain('TestCoin2');
  });

  test('should get token by asset ID', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123456789'
    };
    
    const createdToken = await tokenCreator.createToken(tokenData);
    const foundToken = tokenCreator.getTokenByAssetId(createdToken.assetId);
    
    expect(foundToken).toBeDefined();
    expect(foundToken.assetId).toBe(createdToken.assetId);
    expect(foundToken.name).toBe('TestCoin');
  });

  test('should return null for non-existent asset ID', () => {
    const token = tokenCreator.getTokenByAssetId('nonexistent');
    
    expect(token).toBeUndefined();
  });

  test('should issue more tokens if not finalized', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123456789',
      finalize: false
    };
    
    const token = await tokenCreator.createToken(tokenData);
    const result = await tokenCreator.issueMore(token.assetId, '500000', 'zt1test456789012');
    
    expect(result).toBeDefined();
    expect(result.token.totalSupply).toBe('1500000');
    expect(result.amountIssued).toBe('500000');
  });

  test('should reject issuing more tokens if finalized', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123456789',
      finalize: true
    };
    
    const token = await tokenCreator.createToken(tokenData);
    
    await expect(
      tokenCreator.issueMore(token.assetId, '500000', 'zt1test456789012')
    ).rejects.toThrow('finalized');
  });

  test('should reject issuing tokens that exceed maximum', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      initialSupply: '18446744073709551614',
      recipientAddress: 'zt1test123456789',
      finalize: false
    };
    
    const token = await tokenCreator.createToken(tokenData);
    
    await expect(
      tokenCreator.issueMore(token.assetId, '2', 'zt1test456789012')
    ).rejects.toThrow('maximum');
  });

  test('should finalize token', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123456789',
      finalize: false
    };
    
    const token = await tokenCreator.createToken(tokenData);
    const result = await tokenCreator.finalizeToken(token.assetId);
    
    expect(result.token.finalized).toBe(true);
    expect(result.token.status).toBe('pending_finalization');
  });

  test('should reject finalizing already finalized token', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123456789',
      finalize: true
    };
    
    const token = await tokenCreator.createToken(tokenData);
    
    await expect(tokenCreator.finalizeToken(token.assetId)).rejects.toThrow('finalized');
  });

  test('should update token status', () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123456789'
    };
    
    return tokenCreator.createToken(tokenData).then(token => {
      const updated = tokenCreator.updateTokenStatus(token.assetId, 'deployed', 'tx123');
      
      expect(updated.status).toBe('deployed');
      expect(updated.transactionId).toBe('tx123');
      expect(updated.deployedAt).toBeDefined();
    });
  });

  test('should deploy token', async () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      initialSupply: '1000000',
      recipientAddress: 'zt1test123456789'
    };
    
    const token = await tokenCreator.createToken(tokenData);
    const result = await tokenCreator.deployToken(token.assetId);
    
    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();
    expect(result.assetId).toBe(token.assetId);
    expect(result.token.status).toBe('deployed');
  });
});
