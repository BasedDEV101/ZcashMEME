/**
 * Test helper utilities
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Clean up test directories
 */
export function cleanupTestDirs() {
  const testDirs = [
    path.join(__dirname, '..', 'test-tokens'),
    path.join(__dirname, '..', 'test-keys')
  ];

  testDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

/**
 * Create test directories
 */
export function createTestDirs() {
  const testDirs = [
    path.join(__dirname, '..', 'test-tokens'),
    path.join(__dirname, '..', 'test-keys')
  ];

  testDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Generate test token data
 */
export function generateTestTokenData(overrides = {}) {
  return {
    name: 'TestCoin',
    symbol: 'TEST',
    description: 'Test description',
    initialSupply: '1000000',
    recipientAddress: 'zt1test123456789',
    finalize: false,
    ...overrides
  };
}
