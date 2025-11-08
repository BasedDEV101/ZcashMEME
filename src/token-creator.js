/**
 * Token Creator Service for ZIP 227
 * Handles creation of Zcash Shielded Assets (meme) tokens
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { IssuanceKeys } from './keys.js';
import { IssuanceTransaction } from './issuance.js';
import { computeAssetId, createAssetDescription } from './crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TokenCreator {
  constructor() {
    this.tokensDir = path.join(__dirname, '..', 'tokens');
    this.tokensFile = path.join(this.tokensDir, 'created-tokens.json');
    this.keys = new IssuanceKeys();
    this.issuance = new IssuanceTransaction();
    this.ensureTokensDir();
  }

  ensureTokensDir() {
    fs.mkdirSync(this.tokensDir, { recursive: true });
    if (!fs.existsSync(this.tokensFile)) {
      fs.writeFileSync(this.tokensFile, JSON.stringify([], null, 2));
    }
  }

  /**
   * Create a new ZSA meme token (ZIP 227)
   */
  async createToken(tokenData) {
    const {
      name,
      symbol,
      description,
      initialSupply,
      recipientAddress,
      finalize = false
    } = tokenData;

    // Validate required fields
    if (!name || !symbol || !initialSupply || !recipientAddress) {
      throw new Error('Missing required fields: name, symbol, initialSupply, recipientAddress');
    }

    // Validate symbol
    if (symbol.length < 2 || symbol.length > 10) {
      throw new Error('Symbol must be between 2 and 10 characters');
    }

    // Validate supply (ZIP 227: MAX_ISSUE = 2^64 - 1)
    const maxIssue = BigInt('18446744073709551615');
    const supply = BigInt(initialSupply.toString());
    if (supply > maxIssue) {
      throw new Error(`Supply exceeds maximum: ${maxIssue}`);
    }

    // Get issuer identifier
    const issuer = this.keys.getIssuer();

    // Create asset description (ZIP 227 format)
    const assetDesc = createAssetDescription(name, symbol, description || '');

    // Compute Asset ID (ZIP 227)
    const { assetId, assetDescHash } = computeAssetId(issuer, assetDesc);

    // Build issuance transaction
    const recipients = [{
      address: recipientAddress,
      amount: supply.toString()
    }];

    const tx = this.issuance.buildIssuanceTransaction(
      { name, symbol, description: description || '' },
      recipients,
      finalize
    );

    // Create token object
    const token = {
      id: uuidv4(),
      name: name.trim(),
      symbol: symbol.toUpperCase().trim(),
      description: description || '',
      initialSupply: initialSupply.toString(),
      totalSupply: initialSupply.toString(), // Will be updated if more is issued
      issuer: issuer,
      assetId: assetId,
      assetDescHash: assetDescHash,
      assetDesc: assetDesc,
      recipientAddress: recipientAddress,
      finalized: finalize,
      network: 'zcash-testnet',
      status: 'pending', // pending, deployed, finalized
      createdAt: new Date().toISOString(),
      deployedAt: null,
      transactionId: null,
      transaction: tx,
      history: []
    };

    this.addHistoryEntry(token, {
      type: 'creation',
      amount: token.initialSupply,
      recipient: recipientAddress,
      finalized: finalize
    });

    // Ensure directory exists
    this.ensureTokensDir();

    // Save token to storage
    const tokens = this.getAllTokens();
    tokens.push(token);
    this.persistTokens(tokens);

    return token;
  }

  /**
   * Issue more tokens (if not finalized)
   */
  async issueMore(assetId, amount, recipientAddress) {
    const tokens = this.getAllTokens();
    const tokenIndex = tokens.findIndex(t => t.assetId === assetId);

    if (tokenIndex === -1) {
      throw new Error('Token not found');
    }

    const token = tokens[tokenIndex];

    if (token.finalized) {
      throw new Error('Token is finalized. No more tokens can be issued.');
    }

    // Validate amount
    const maxIssue = BigInt('18446744073709551615');
    const currentSupply = BigInt(token.totalSupply);
    const additionalSupply = BigInt(amount.toString());
    const newSupply = currentSupply + additionalSupply;

    if (newSupply > maxIssue) {
      throw new Error('Total supply would exceed maximum');
    }

    // Build issuance transaction for additional tokens
    const recipients = [{
      address: recipientAddress,
      amount: amount.toString()
    }];

    const tx = this.issuance.buildIssuanceTransaction(
      { name: token.name, symbol: token.symbol, description: token.description },
      recipients,
      false // Don't finalize on additional issuance
    );

    // Update token
    this.ensureTokensDir();
    token.totalSupply = newSupply.toString();
    token.status = 'pending';
    this.addHistoryEntry(token, {
      type: 'issuance',
      amount: amount.toString(),
      recipient: recipientAddress
    });
    tokens[tokenIndex] = token;

    this.persistTokens(tokens);

    return {
      token,
      transaction: tx,
      amountIssued: amount.toString()
    };
  }

  /**
   * Finalize token (prevent further issuance)
   */
  async finalizeToken(assetId) {
    const tokens = this.getAllTokens();
    const tokenIndex = tokens.findIndex(t => t.assetId === assetId);

    if (tokenIndex === -1) {
      throw new Error('Token not found');
    }

    const token = tokens[tokenIndex];

    if (token.finalized) {
      throw new Error('Token is already finalized');
    }

    // Build finalization transaction
    const recipients = [{
      address: token.recipientAddress,
      amount: '0' // Finalization doesn't issue new tokens
    }];

    const tx = this.issuance.buildIssuanceTransaction(
      { name: token.name, symbol: token.symbol, description: token.description },
      recipients,
      true // finalize = true
    );

    this.ensureTokensDir();
    token.finalized = true;
    token.status = 'pending_finalization';
    this.addHistoryEntry(token, {
      type: 'finalization'
    });
    tokens[tokenIndex] = token;

    this.persistTokens(tokens);

    return {
      token,
      transaction: tx
    };
  }

  /**
   * Get all created tokens
   */
  getAllTokens() {
    try {
      const data = fs.readFileSync(this.tokensFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get token by asset ID
   */
  getTokenByAssetId(assetId) {
    const tokens = this.getAllTokens();
    return tokens.find(t => t.assetId === assetId);
  }

  /**
   * Get token by internal ID
   */
  getTokenById(tokenId) {
    const tokens = this.getAllTokens();
    return tokens.find(t => t.id === tokenId);
  }

  /**
   * Get tokens by issuer
   */
  getTokensByIssuer(issuer) {
    const tokens = this.getAllTokens();
    return tokens.filter(t => t.issuer === issuer);
  }

  /**
   * Update token status
   */
  updateTokenStatus(assetId, status, transactionId = null) {
    this.ensureTokensDir();
    const tokens = this.getAllTokens();
    const tokenIndex = tokens.findIndex(t => t.assetId === assetId);
    
    if (tokenIndex === -1) {
      throw new Error('Token not found');
    }

    const token = tokens[tokenIndex];
    token.status = status;
    if (transactionId) {
      token.transactionId = transactionId;
      token.deployedAt = new Date().toISOString();
    }

    if (status === 'deployed') {
      this.addHistoryEntry(token, {
        type: 'deployment',
        transactionId: transactionId
      });
    } else if (status === 'failed') {
      this.addHistoryEntry(token, {
        type: 'deployment_failed'
      });
    }

    tokens[tokenIndex] = token;

    this.persistTokens(tokens);

    return tokens[tokenIndex];
  }

  /**
   * Deploy token to Zcash testnet (when ZSAs are available)
   */
  async deployToken(assetId) {
    const token = this.getTokenByAssetId(assetId);
    if (!token) {
      throw new Error('Token not found');
    }

    if (token.status === 'deployed') {
      throw new Error('Token already deployed');
    }

    try {
      // Update status to deploying
      this.updateTokenStatus(assetId, 'deploying');

      // TODO: Implement actual ZSA deployment when available
      // For now, the transaction is already built in token.transaction
      const preparedTx = this.issuance.prepareTransaction(token.transaction);
      
      // Simulate deployment delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mock transaction ID
      const mockTxId = `zsa_${assetId.substring(0, 16)}_${Date.now()}`;

      // Update status to deployed
      this.updateTokenStatus(assetId, 'deployed', mockTxId);

      return {
        success: true,
        transactionId: mockTxId,
        assetId: assetId,
        token: this.getTokenByAssetId(assetId),
        transaction: preparedTx
      };
    } catch (error) {
      this.updateTokenStatus(assetId, 'failed');
      throw error;
    }
  }

  /**
   * Persist the current token list and individual token files
   */
  persistTokens(tokens) {
    fs.mkdirSync(this.tokensDir, { recursive: true });
    fs.writeFileSync(this.tokensFile, JSON.stringify(tokens, null, 2));
    tokens.forEach(token => {
      const tokenConfigPath = path.join(this.tokensDir, `${token.id}.json`);
      fs.writeFileSync(tokenConfigPath, JSON.stringify(token, null, 2));
    });
  }

  /**
   * Add a history entry to a token record
   */
  addHistoryEntry(token, entry) {
    if (!Array.isArray(token.history)) {
      token.history = [];
    }

    token.history.push({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString()
    });
  }
}