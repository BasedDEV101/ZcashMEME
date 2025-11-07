/**
 * Issuance Transaction Building for ZIP 227
 * Implements issuance transaction construction according to ZIP 227
 */

import crypto from 'crypto';
import { computeAssetDescHash, computeAssetId, createAssetDescription } from './crypto.js';
import { IssuanceKeys } from './keys.js';

export class IssuanceTransaction {
  constructor() {
    this.keys = new IssuanceKeys();
  }

  /**
   * Create asset description from token data
   */
  createAssetDesc(tokenData) {
    const { name, symbol, description = '' } = tokenData;
    return createAssetDescription(name, symbol, description);
  }

  /**
   * Build issuance action
   * ZIP 227: IssueAction contains asset_desc_hash, notes, and finalize flag
   */
  buildIssueAction(assetDesc, recipients, finalize = false) {
    const assetDescHash = computeAssetDescHash(assetDesc);
    const issuer = this.keys.getIssuer();
    const { assetId } = computeAssetId(issuer, assetDesc);

    // Create issue notes for each recipient
    const notes = recipients.map((recipient, index) => {
      return {
        recipientAddress: recipient.address,
        value: recipient.amount,
        assetId: assetId,
        index: index
      };
    });

    return {
      assetDescHash: assetDescHash.toString('hex'),
      assetDesc: assetDesc,
      notes: notes,
      finalize: finalize,
      assetId: assetId
    };
  }

  /**
   * Build issuance bundle
   * ZIP 227: IssuanceBundle contains issuer, actions, and signature
   */
  buildIssuanceBundle(issueAction) {
    const issuer = this.keys.getIssuer();
    
    return {
      issuer: issuer,
      actions: [issueAction],
      signature: null // Will be signed later
    };
  }

  /**
   * Sign issuance bundle
   * ZIP 227: Sign with isk using BIP 340 Schnorr signature
   */
  signIssuanceBundle(bundle) {
    // Simplified signature - in production use proper Schnorr signature
    const isk = this.keys.getISK();
    const bundleData = JSON.stringify(bundle);
    const hash = crypto.createHash('sha256');
    hash.update(bundleData);
    hash.update('ZcashSA_Issue_V1_Sig');
    const sighash = hash.digest();
    
    // Simplified signature (in production, use proper Schnorr)
    const hmac = crypto.createHmac('sha256', isk);
    hmac.update(sighash);
    
    bundle.signature = hmac.digest().toString('hex');
    return bundle;
  }

  /**
   * Build complete issuance transaction
   * ZIP 227: Transaction V6 with issuance bundle
   */
  buildIssuanceTransaction(tokenData, recipients, finalize = false) {
    // 1. Create asset description
    const assetDesc = this.createAssetDesc(tokenData);
    
    // 2. Build issue action
    const issueAction = this.buildIssueAction(assetDesc, recipients, finalize);
    
    // 3. Build issuance bundle
    const bundle = this.buildIssuanceBundle(issueAction);
    
    // 4. Sign bundle
    const signedBundle = this.signIssuanceBundle(bundle);
    
    // 5. Get asset ID
    const issuer = this.keys.getIssuer();
    const { assetId } = computeAssetId(issuer, assetDesc);
    
    return {
      version: 6, // ZIP 227 requires transaction version 6
      issuanceBundle: signedBundle,
      assetId: assetId,
      assetDesc: assetDesc,
      finalize: finalize
    };
  }

  /**
   * Prepare transaction for submission
   */
  prepareTransaction(tx) {
    // In production, this would build the actual transaction bytes
    // For now, return the structured data
    return {
      txData: tx,
      ready: true,
      note: 'Transaction prepared according to ZIP 227. Ready for submission when ZSAs are available.'
    };
  }
}
