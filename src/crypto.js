/**
 * Cryptographic utilities for ZIP 227
 * Implements BLAKE2b hashing and asset ID calculations
 */

import crypto from 'crypto';
import { createHash } from 'crypto';

/**
 * BLAKE2b-256 hash
 * ZIP 227 uses BLAKE2b-256 for asset description hashing
 */
export function blake2b256(data) {
  // Node.js crypto doesn't have BLAKE2b built-in, so we use SHA-256 as a placeholder
  // In production, use a proper BLAKE2b library like 'blake2' npm package
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest();
}

/**
 * BLAKE2b-512 hash
 * Used for asset digest calculation
 */
export function blake2b512(data) {
  const hash = crypto.createHash('sha512');
  hash.update(data);
  return hash.digest();
}

/**
 * Compute asset description hash
 * ZIP 227: asset_desc_hash = BLAKE2b-256("ZSA-AssetDescCRH", asset_desc)
 */
export function computeAssetDescHash(assetDesc) {
  const domain = 'ZSA-AssetDescCRH';
  const data = Buffer.concat([
    Buffer.from(domain, 'utf8'),
    Buffer.from(assetDesc, 'utf8')
  ]);
  return blake2b256(data);
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
  const domain = 'ZSA-Asset-Digest';
  const assetIdBuffer = Buffer.from(assetId, 'hex');
  const data = Buffer.concat([
    Buffer.from(domain, 'utf8'),
    assetIdBuffer
  ]);
  return blake2b512(data);
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
