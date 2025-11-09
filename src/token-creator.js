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
import { computeAssetId, createAssetDescription, computeAssetDescHash } from './crypto.js';
import { runIssue, IssueCommandError } from '../scripts/run-issue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INCINERATOR_ADDRESS =
  'zt1incinerator0000000000000000000000000000000000000000000000000000000000';

export class TokenCreator {
  constructor() {
    this.tokensDir = path.join(__dirname, '..', 'tokens');
    this.tokensFile = path.join(this.tokensDir, 'created-tokens.json');
    this.keys = new IssuanceKeys();
    this.issuance = new IssuanceTransaction(this.keys);
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
      burnedSupply: '0',
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
  async deployToken(assetId, options = {}) {
    const token = this.getTokenByAssetId(assetId);
    if (!token) {
      throw new Error('Token not found');
    }

    if (token.status === 'deployed') {
      throw new Error('Token already deployed');
    }

    const { mine = process.env.ZSA_MINE === 'true' } = options;

    try {
      this.updateTokenStatus(assetId, 'deploying');

      const assetDescHashHex = token.assetDescHash || computeAssetDescHash(token.assetDesc).toString('hex');
      const assetDescHash = Buffer.from(assetDescHashHex, 'hex');
      const parsedAmount = Number(token.totalSupply);
      if (Number.isNaN(parsedAmount)) {
        throw new Error('Invalid token supply value; expected numeric string');
      }
      const firstIssuance = !token.history?.some(entry => entry.type === 'deployment');
      const shouldMine = Boolean(mine);
      const payload = {
        asset_desc_hash: assetDescHash.toString('hex'),
        asset_name: token.name,
        recipient: token.recipientAddress,
        amount: parsedAmount,
        first_issuance: firstIssuance,
        finalize: false,
        mine: shouldMine
      };

      const result = await runIssue(payload);
      if (!result || !result.tx_id) {
        throw new Error('Issue command did not return a transaction id; aborting deployment.');
      }

      this.updateTokenStatus(assetId, 'deployed', result.tx_id);

      const updatedToken = this.getTokenByAssetId(assetId);
      if (updatedToken) {
        updatedToken.transactionId = result.tx_id;
        updatedToken.transaction = result;
        this.persistTokens(this.getAllTokens());
      }

      return {
        success: true,
        transactionId: result.tx_id,
        assetId: assetId,
        token: updatedToken,
        transaction: result
      };
    } catch (error) {
      this.updateTokenStatus(assetId, 'failed');

      if (error instanceof IssueCommandError) {
        if (error.code === 'ISSUE_COMMAND_VALIDATION') {
          throw new Error(`Issuance validation failed: ${error.message}`);
        }

        if (
          error.code === 'ISSUE_COMMAND_BROADCAST' &&
          error.message.includes('transaction did not pass consensus validation')
        ) {
          throw new Error(
            'The node rejected the issuance transaction (consensus validation failed). ' +
              'If you are using a local Zebra node, try rerunning with mining enabled (deploy-token.js --mine) ' +
              'or verify the node allows shielded asset issuance.'
          );
        }

        if (error.code === 'ISSUE_COMMAND_SPAWN') {
          throw new Error(
            'Failed to execute `cargo`. Ensure Rust is installed and `cargo` is available on the PATH.'
          );
        }

        throw new Error(`Issue command failed: ${error.message}`);
      }

      if (error && error.message && error.message.includes('spawn cargo')) {
        throw new Error(
          'Failed to execute `cargo`. Ensure Rust is installed and `cargo` is available on the PATH. Original error: ' +
            error.message
        );
      }

      throw error;
    }
  }

  /**
   * Persist the current token list and individual token files
   */
  persistTokens(tokens) {
    const tokensDir = this.tokensDir;
    fs.mkdirSync(tokensDir, { recursive: true });
    fs.mkdirSync(path.dirname(this.tokensFile), { recursive: true });
    const serializedTokens = JSON.stringify(tokens, null, 2);
    try {
      fs.writeFileSync(this.tokensFile, serializedTokens);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EPERM') {
        fs.mkdirSync(path.dirname(this.tokensFile), { recursive: true });
        try {
          fs.unlinkSync(this.tokensFile);
        } catch (_) {
          // Ignore unlink errors
        }
        fs.writeFileSync(this.tokensFile, serializedTokens);
      } else {
        throw error;
      }
    }
    tokens.forEach(token => {
      const tokenConfigPath = path.join(tokensDir, `${token.id}.json`);
      fs.mkdirSync(path.dirname(tokenConfigPath), { recursive: true });
      const serialized = JSON.stringify(token, null, 2);
      try {
        fs.writeFileSync(tokenConfigPath, serialized);
      } catch (error) {
        if (error.code === 'EPERM') {
          try {
            fs.unlinkSync(tokenConfigPath);
          } catch (_) {
            // Ignore unlink errors; we'll retry the write
          }
          fs.writeFileSync(tokenConfigPath, serialized);
        } else if (error.code === 'ENOENT') {
          fs.mkdirSync(path.dirname(tokenConfigPath), { recursive: true });
          fs.writeFileSync(tokenConfigPath, serialized);
        } else {
          throw error;
        }
      }
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

  /**
   * Burn tokens by sending to the incinerator wallet (mock)
   */
  burnTokens(assetId, amount, burnAddress = INCINERATOR_ADDRESS) {
    const burnAmount = BigInt(amount.toString());
    if (burnAmount <= 0n) {
      throw new Error('Burn amount must be greater than zero');
    }

    const tokens = this.getAllTokens();
    const tokenIndex = tokens.findIndex(t => t.assetId === assetId);

    if (tokenIndex === -1) {
      throw new Error('Token not found');
    }

    const token = tokens[tokenIndex];
    const currentSupply = BigInt(token.totalSupply);

    if (burnAmount > currentSupply) {
      throw new Error('Burn amount exceeds total supply');
    }

    const updatedSupply = (currentSupply - burnAmount).toString();
    const burnedSoFar = BigInt(token.burnedSupply || '0');
    const updatedBurned = (burnedSoFar + burnAmount).toString();

    this.addHistoryEntry(token, {
      type: 'burn',
      amount: burnAmount.toString(),
      recipient: burnAddress
    });

    token.totalSupply = updatedSupply;
    token.burnedSupply = updatedBurned;
    token.status = 'pending_burn';

    tokens[tokenIndex] = token;
    this.persistTokens(tokens);

    return {
      token,
      burnAddress,
      amountBurned: burnAmount.toString()
    };
  }

  getIncineratorAddress() {
    return INCINERATOR_ADDRESS;
  }
}