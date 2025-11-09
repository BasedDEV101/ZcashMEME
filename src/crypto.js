/**
 * Cryptographic utilities for ZIP 227
 * Implements BLAKE2b hashing and asset ID calculations
 */

import crypto from 'crypto';
import { blake2b } from '@noble/hashes/blake2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

function ensurePersonalization(personalization) {
  if (!personalization) {
    return undefined;
  }

  if (typeof personalization === 'string') {
    const bytes = utf8ToBytes(personalization);
    if (bytes.length !== 16) {
      throw new Error(`BLAKE2b personalization must be 16 bytes, got ${bytes.length}`);
    }
    return bytes;
  }

  if (personalization.length !== 16) {
    throw new Error(`BLAKE2b personalization must be 16 bytes, got ${personalization.length}`);
  }

  return personalization;
}

/**
 * BLAKE2b-256 hash
 * ZIP 227 uses BLAKE2b-256 for asset description hashing
 */
export function blake2b256(data, personalization) {
  return Buffer.from(
    blake2b(data, {
      dkLen: 32,
      personalization: ensurePersonalization(personalization)
    })
  );
}

/**
 * BLAKE2b-512 hash
 * Used for asset digest calculation
 */
export function blake2b512(data, personalization) {
  return Buffer.from(
    blake2b(data, {
      dkLen: 64,
      personalization: ensurePersonalization(personalization)
    })
  );
}

/**
 * Compute asset description hash
 * ZIP 227: asset_desc_hash = BLAKE2b-256("ZSA-AssetDescCRH", asset_desc)
 */
export function computeAssetDescHash(assetDesc) {
  return blake2b256(Buffer.from(assetDesc, 'utf8'), 'ZSA-AssetDescCRH');
}

/**
 * Compute Asset ID
 * ZIP 227: AssetId = (issuer, asset_desc_hash)
 * Encoded as: [0x00 || issuer (32 bytes) || asset_desc_hash (32 bytes)]
 */
export function computeAssetId(issuer, assetDesc) {
  const assetDescHash = computeAssetDescHash(assetDesc);
  const issuerBuffer = Buffer.from(issuer, 'hex');
  
  // Asset ID format: [0x00 || issuer || asset_desc_hash]
  const assetId = Buffer.concat([
    Buffer.from([0x00]),
    issuerBuffer,
    assetDescHash
  ]);

  return {
    assetId: assetId.toString('hex'),
    issuer: issuer,
    assetDescHash: assetDescHash.toString('hex')
  };
}

/**
 * Compute asset digest
 * ZIP 227: asset_digest = BLAKE2b-512("ZSA-Asset-Digest", encode_asset_id(asset_id))
 */
export function computeAssetDigest(assetId) {
  const assetIdBuffer = Buffer.from(assetId, 'hex');
  return blake2b512(assetIdBuffer, 'ZSA-Asset-Digest');
}

/**
 * Compute asset base
 * ZIP 227: asset_base = GroupHash("z.cash:OrchardZSA", asset_digest)
 * Used in OrchardZSA notes
 */
export function computeAssetBase(assetDigest) {
  // Simplified - in production use proper GroupHash
  const domain = 'z.cash:OrchardZSA';
  const hash = crypto.createHash('sha256');
  hash.update(domain);
  hash.update(assetDigest);
  return hash.digest().toString('hex');
}

/**
 * Create asset description string
 * Format: "name|symbol|description"
 */
export function createAssetDescription(name, symbol, description = '') {
  return `${name}|${symbol}|${description}`;
}

/**
 * Parse asset description string
 */
export function parseAssetDescription(assetDesc) {
  const parts = assetDesc.split('|');
  return {
    name: parts[0] || '',
    symbol: parts[1] || '',
    description: parts.slice(2).join('|') || ''
  };
}
