/**
 * Tests for issuance transaction building (ZIP 227)
 */

// Jest tests use global functions in Node.js ESM mode
import { IssuanceTransaction } from '../src/issuance.js';
import { IssuanceKeys } from '../src/keys.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('IssuanceTransaction', () => {
  let issuance;
  const testKeysDir = path.join(__dirname, '..', 'test-keys');

  beforeEach(() => {
    const cleanup = (dir) => {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch (error) {
          if (process.platform === 'win32') {
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
          } else {
            throw error;
          }
        }
      }
    };

    cleanup(testKeysDir);

    if (process.platform === 'win32') {
      const start = Date.now();
      while (Date.now() - start < 100) {
        // Wait briefly for file handles to release
      }
    }

    issuance = new IssuanceTransaction();
    issuance.keys.keysDir = testKeysDir;
    issuance.keys.keysFile = path.join(testKeysDir, 'issuance-keys.json');
  });

  afterEach(() => {
    const cleanup = (dir) => {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch (error) {
          // Ignore cleanup errors in tests
        }
      }
    };

    cleanup(testKeysDir);
  });

  test('should create asset description from token data', () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      description: 'Test description'
    };
    
    const assetDesc = issuance.createAssetDesc(tokenData);
    
    expect(assetDesc).toBe('TestCoin|TEST|Test description');
  });

  test('should create asset description with empty description', () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST'
    };
    
    const assetDesc = issuance.createAssetDesc(tokenData);
    
    expect(assetDesc).toBe('TestCoin|TEST|');
  });

  test('should build issue action', () => {
    const assetDesc = 'TestCoin|TEST|Test description';
    const recipients = [
      { address: 'zt1test123', amount: '1000000' }
    ];
    const finalize = false;
    
    const action = issuance.buildIssueAction(assetDesc, recipients, finalize);
    
    expect(action).toBeDefined();
    expect(action.assetDescHash).toBeDefined();
    expect(action.assetDesc).toBe(assetDesc);
    expect(action.notes).toBeDefined();
    expect(action.notes.length).toBe(1);
    expect(action.finalize).toBe(false);
    expect(action.assetId).toBeDefined();
  });

  test('should build issue action with multiple recipients', () => {
    const assetDesc = 'TestCoin|TEST|Test description';
    const recipients = [
      { address: 'zt1test123', amount: '1000000' },
      { address: 'zt1test456', amount: '500000' }
    ];
    
    const action = issuance.buildIssueAction(assetDesc, recipients, false);
    
    expect(action.notes.length).toBe(2);
    expect(action.notes[0].recipientAddress).toBe('zt1test123');
    expect(action.notes[0].value).toBe('1000000');
    expect(action.notes[1].recipientAddress).toBe('zt1test456');
    expect(action.notes[1].value).toBe('500000');
  });

  test('should build issue action with finalize flag', () => {
    const assetDesc = 'TestCoin|TEST|Test description';
    const recipients = [
      { address: 'zt1test123', amount: '1000000' }
    ];
    
    const action = issuance.buildIssueAction(assetDesc, recipients, true);
    
    expect(action.finalize).toBe(true);
  });

  test('should build issuance bundle', () => {
    const assetDesc = 'TestCoin|TEST|Test description';
    const recipients = [
      { address: 'zt1test123', amount: '1000000' }
    ];
    const action = issuance.buildIssueAction(assetDesc, recipients, false);
    
    const bundle = issuance.buildIssuanceBundle(action);
    
    expect(bundle).toBeDefined();
    expect(bundle.issuer).toBeDefined();
    expect(bundle.actions).toBeDefined();
    expect(bundle.actions.length).toBe(1);
    expect(bundle.signature).toBe(null);
  });

  test('should sign issuance bundle', () => {
    const assetDesc = 'TestCoin|TEST|Test description';
    const recipients = [
      { address: 'zt1test123', amount: '1000000' }
    ];
    const action = issuance.buildIssueAction(assetDesc, recipients, false);
    const bundle = issuance.buildIssuanceBundle(action);
    
    const signedBundle = issuance.signIssuanceBundle(bundle);
    
    expect(signedBundle.signature).toBeDefined();
    expect(signedBundle.signature).not.toBe(null);
    expect(typeof signedBundle.signature).toBe('string');
  });

  test('should build complete issuance transaction', () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      description: 'Test description'
    };
    const recipients = [
      { address: 'zt1test123', amount: '1000000' }
    ];
    const finalize = false;
    
    const tx = issuance.buildIssuanceTransaction(tokenData, recipients, finalize);
    
    expect(tx).toBeDefined();
    expect(tx.version).toBe(6); // ZIP 227 requires version 6
    expect(tx.issuanceBundle).toBeDefined();
    expect(tx.issuanceBundle.issuer).toBeDefined();
    expect(tx.issuanceBundle.actions).toBeDefined();
    expect(tx.issuanceBundle.signature).toBeDefined();
    expect(tx.assetId).toBeDefined();
    expect(tx.assetDesc).toBe('TestCoin|TEST|Test description');
    expect(tx.finalize).toBe(false);
  });

  test('should build finalized issuance transaction', () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      description: 'Test description'
    };
    const recipients = [
      { address: 'zt1test123', amount: '1000000' }
    ];
    
    const tx = issuance.buildIssuanceTransaction(tokenData, recipients, true);
    
    expect(tx.finalize).toBe(true);
    expect(tx.issuanceBundle.actions[0].finalize).toBe(true);
  });

  test('should prepare transaction for submission', () => {
    const tokenData = {
      name: 'TestCoin',
      symbol: 'TEST',
      description: 'Test description'
    };
    const recipients = [
      { address: 'zt1test123', amount: '1000000' }
    ];
    const tx = issuance.buildIssuanceTransaction(tokenData, recipients, false);
    
    const prepared = issuance.prepareTransaction(tx);
    
    expect(prepared).toBeDefined();
    expect(prepared.txData).toBeDefined();
    expect(prepared.ready).toBe(true);
    expect(prepared.note).toBeDefined();
  });
});
