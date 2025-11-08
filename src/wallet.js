/**
 * Wallet Utilities for Zcash
 * Generates and manages Zcash addresses
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WalletManager {
  constructor() {
    this.walletsDir = path.join(__dirname, '..', 'wallets');
    this.walletsFile = path.join(this.walletsDir, 'wallets.json');
    this.ensureWalletsDir();
  }

  ensureWalletsDir() {
    if (!fs.existsSync(this.walletsDir)) {
      fs.mkdirSync(this.walletsDir, { recursive: true });
    }
    if (!fs.existsSync(this.walletsFile)) {
      fs.writeFileSync(this.walletsFile, JSON.stringify([], null, 2));
    }
  }

  /**
   * Generate a new Zcash testnet address
   * Note: This generates a mock address format. In production, use proper Zcash address generation.
   */
  generateAddress(type = 'sapling') {
    // Generate random address (mock implementation)
    // In production, use proper Zcash address generation library
    const randomBytes = crypto.randomBytes(20);
    const prefix = type === 'sapling' ? 'zt' : 'zt';
    const address = prefix + '1' + randomBytes.toString('hex').substring(0, 30);
    
    return address;
  }

  /**
   * Create a new wallet
   */
  createWallet(name, type = 'sapling') {
    const address = this.generateAddress(type);
    const privateKey = crypto.randomBytes(32).toString('hex'); // Mock private key
    
    const wallet = {
      id: crypto.randomBytes(16).toString('hex'),
      name: name,
      address: address,
      type: type,
      network: 'testnet',
      privateKey: privateKey, // In production, encrypt this!
      createdAt: new Date().toISOString(),
      balance: '0',
      transactions: []
    };

    // Save wallet
    const wallets = this.getAllWallets();
    wallets.push(wallet);
    fs.writeFileSync(this.walletsFile, JSON.stringify(wallets, null, 2));

    // Save individual wallet file
    const walletFile = path.join(this.walletsDir, `${wallet.id}.json`);
    fs.writeFileSync(walletFile, JSON.stringify(wallet, null, 2));

    return wallet;
  }

  /**
   * Get all wallets
   */
  getAllWallets() {
    try {
      const data = fs.readFileSync(this.walletsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get wallet by name or address
   */
  getWallet(identifier) {
    const wallets = this.getAllWallets();
    return wallets.find(w => 
      w.name === identifier || 
      w.address === identifier || 
      w.id === identifier
    );
  }

  /**
   * Delete wallet
   */
  deleteWallet(identifier) {
    const wallets = this.getAllWallets();
    const walletIndex = wallets.findIndex(w => 
      w.name === identifier || 
      w.address === identifier || 
      w.id === identifier
    );

    if (walletIndex === -1) {
      throw new Error('Wallet not found');
    }

    const wallet = wallets[walletIndex];
    wallets.splice(walletIndex, 1);
    fs.writeFileSync(this.walletsFile, JSON.stringify(wallets, null, 2));

    // Delete individual wallet file
    const walletFile = path.join(this.walletsDir, `${wallet.id}.json`);
    if (fs.existsSync(walletFile)) {
      fs.unlinkSync(walletFile);
    }

    return wallet;
  }

  /**
   * Get wallet balance (mock - will connect to Zcash node when available)
   */
  async getBalance(address) {
    // TODO: Connect to Zcash node to get real balance
    // For now, return mock balance
    const wallet = this.getWallet(address);
    if (wallet) {
      return wallet.balance || '0';
    }
    return '0';
  }
}

