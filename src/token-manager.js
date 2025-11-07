/**
 * Token Manager
 * Manages meme coin token operations
 */

import { ZcashClient } from './zcash-client.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TokenManager {
  constructor() {
    this.client = new ZcashClient();
    this.config = this.loadConfig();
    this.tokenId = null; // Will be set after deployment
  }

  loadConfig() {
    const configPath = path.join(__dirname, '..', 'token-config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  /**
   * Get token configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Deploy token (when ZSAs are available)
   */
  async deploy() {
    try {
      console.log('Deploying token...');
      const tokenId = await this.client.createZSAToken({
        name: this.config.name,
        symbol: this.config.symbol,
        decimals: this.config.decimals,
        totalSupply: this.config.totalSupply
      });
      
      this.tokenId = tokenId;
      this.saveTokenId(tokenId);
      
      return tokenId;
    } catch (error) {
      console.error('Deployment failed:', error.message);
      throw error;
    }
  }

  /**
   * Mint tokens (when ZSAs are available)
   */
  async mint(amount, toAddress) {
    if (!this.tokenId) {
      this.tokenId = this.loadTokenId();
    }
    
    if (!this.tokenId) {
      throw new Error('Token not deployed. Please deploy first.');
    }

    return await this.client.mintZSATokens(this.tokenId, amount, toAddress);
  }

  /**
   * Transfer tokens (when ZSAs are available)
   */
  async transfer(fromAddress, toAddress, amount) {
    if (!this.tokenId) {
      this.tokenId = this.loadTokenId();
    }
    
    if (!this.tokenId) {
      throw new Error('Token not deployed. Please deploy first.');
    }

    return await this.client.transferZSATokens(
      this.tokenId,
      fromAddress,
      toAddress,
      amount
    );
  }

  /**
   * Get token balance (when ZSAs are available)
   */
  async getBalance(address) {
    if (!this.tokenId) {
      this.tokenId = this.loadTokenId();
    }
    
    if (!this.tokenId) {
      return '0';
    }

    return await this.client.getZSATokenBalance(this.tokenId, address);
  }

  /**
   * Save token ID after deployment
   */
  saveTokenId(tokenId) {
    const tokenIdPath = path.join(__dirname, '..', '.token-id');
    fs.writeFileSync(tokenIdPath, tokenId);
  }

  /**
   * Load token ID
   */
  loadTokenId() {
    const tokenIdPath = path.join(__dirname, '..', '.token-id');
    if (fs.existsSync(tokenIdPath)) {
      return fs.readFileSync(tokenIdPath, 'utf8').trim();
    }
    return null;
  }

  /**
   * Get mock balance for testing (before ZSAs are available)
   */
  getMockBalance(address) {
    // Mock balance for testing purposes
    return '1000000';
  }
}
