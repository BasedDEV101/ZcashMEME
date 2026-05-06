/**
 * Tests for WalletManager
 */

import { WalletManager } from '../src/wallet.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('WalletManager', () => {
  let manager;
  const testWalletsDir = path.join(__dirname, '..', 'test-wallets-wallet');

  beforeEach(() => {
    if (fs.existsSync(testWalletsDir)) {
      try {
        fs.rmSync(testWalletsDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch (_) {
        // ignore
      }
    }
    manager = new WalletManager();
    manager.walletsDir = testWalletsDir;
    manager.walletsFile = path.join(testWalletsDir, 'wallets.json');
    manager.ensureWalletsDir();
  });

  afterEach(() => {
    if (fs.existsSync(testWalletsDir)) {
      try {
        fs.rmSync(testWalletsDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch (_) {
        // ignore
      }
    }
  });

  test('generateAddress uses zt prefix for sapling', () => {
    const addr = manager.generateAddress('sapling');
    expect(addr.startsWith('zt1')).toBe(true);
  });

  test('generateAddress uses zo prefix for orchard', () => {
    const addr = manager.generateAddress('orchard');
    expect(addr.startsWith('zo1')).toBe(true);
  });

  test('generateAddress rejects unknown type', () => {
    expect(() => manager.generateAddress('transparent')).toThrow('Unsupported address type');
  });

  test('createWallet persists wallet and returns it', () => {
    const wallet = manager.createWallet('alice', 'sapling');
    expect(wallet.name).toBe('alice');
    expect(wallet.type).toBe('sapling');
    expect(wallet.address.startsWith('zt1')).toBe(true);
    expect(wallet.privateKey).toBeDefined();
    expect(wallet.id).toBeDefined();

    const wallets = manager.getAllWallets();
    expect(wallets.length).toBe(1);
    expect(wallets[0].name).toBe('alice');

    const individualFile = path.join(testWalletsDir, `${wallet.id}.json`);
    expect(fs.existsSync(individualFile)).toBe(true);
  });

  test('getAllWallets returns empty array when file missing', () => {
    fs.unlinkSync(manager.walletsFile);
    expect(manager.getAllWallets()).toEqual([]);
  });

  test('getAllWallets throws on corrupted file', () => {
    fs.writeFileSync(manager.walletsFile, '{not valid json');
    expect(() => manager.getAllWallets()).toThrow('corrupted');
  });

  test('getWallet finds by name, address, or id', () => {
    const wallet = manager.createWallet('bob', 'orchard');
    expect(manager.getWallet('bob').id).toBe(wallet.id);
    expect(manager.getWallet(wallet.address).id).toBe(wallet.id);
    expect(manager.getWallet(wallet.id).id).toBe(wallet.id);
    expect(manager.getWallet('nonexistent')).toBeUndefined();
  });

  test('deleteWallet removes from list and removes individual file', () => {
    const wallet = manager.createWallet('charlie', 'sapling');
    const individualFile = path.join(testWalletsDir, `${wallet.id}.json`);
    expect(fs.existsSync(individualFile)).toBe(true);

    manager.deleteWallet('charlie');
    expect(manager.getAllWallets().length).toBe(0);
    expect(fs.existsSync(individualFile)).toBe(false);
  });

  test('deleteWallet throws when wallet not found', () => {
    expect(() => manager.deleteWallet('nope')).toThrow('Wallet not found');
  });

  test('getBalance returns wallet balance or 0', async () => {
    const wallet = manager.createWallet('dave', 'sapling');
    expect(await manager.getBalance(wallet.address)).toBe('0');
    expect(await manager.getBalance('unknown-address')).toBe('0');
  });
});
