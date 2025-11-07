/**
 * Key Generation and Management for ZIP 227
 * Implements issuance key generation according to ZIP 227 specification
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class IssuanceKeys {
  constructor() {
    this.keysDir = path.join(__dirname, '..', 'keys');
    this.keysFile = path.join(this.keysDir, 'issuance-keys.json');
    this.ensureKeysDir();
  }

  ensureKeysDir() {
    if (!fs.existsSync(this.keysDir)) {
      fs.mkdirSync(this.keysDir, { recursive: true });
    }
  }

  /**
   * Generate random seed (32-252 bytes, minimum 32)
   */
  generateSeed(length = 32) {
    if (length < 32 || length > 252) {
      throw new Error('Seed length must be between 32 and 252 bytes');
    }
    return crypto.randomBytes(length);
  }

  /**
   * Generate master issuance key from seed
   * ZIP 227: MKGh_Issuance(seed) using ZIP 32 with:
   * - Issuance.MKGDomain := "ZcashSA_Issue_V1"
   * - Issuance.CKDDomain := 0x81
   */
  generateMasterKey(seed) {
    // Simplified implementation - in production, use proper ZIP 32 derivation
    // This uses HMAC-SHA512 with the domain separator
    const domain = 'ZcashSA_Issue_V1';
    const hmac = crypto.createHmac('sha512', domain);
    hmac.update(seed);
    const result = hmac.digest();
    
    return {
      masterKey: result.slice(0, 32),
      chainCode: result.slice(32, 64)
    };
  }

  /**
   * Derive issuance key from master key
   * Path: m_Issuance/purpose'/coin_type'/account'
   * purpose = 227 (0xe3)
   * coin_type = 133 for testnet (from ZIP 32)
   * account = 0
   * Example: m/227'/133'/0'
   */
  deriveIssuanceKey(masterKey, chainCode, account = 0) {
    // Simplified key derivation
    // In production, implement proper BIP32/CKD derivation
    const purpose = 227;
    const coinType = 133; // Testnet
    
    const pathData = Buffer.concat([
      Buffer.from([purpose | 0x80000000]),
      Buffer.from([coinType | 0x80000000]),
      Buffer.from([account | 0x80000000])
    ]);

    const hmac = crypto.createHmac('sha512', chainCode);
    hmac.update(masterKey);
    hmac.update(pathData);
    const result = hmac.digest();

    return {
      isk: result.slice(0, 32), // Issuance Authorizing Key
      chainCode: result.slice(32, 64)
    };
  }

  /**
   * Derive validating key (ik) from issuance key (isk)
   */
  deriveValidatingKey(isk) {
    // Simplified - in production use proper elliptic curve point derivation
    // ik = G * isk where G is the generator point
    const hash = crypto.createHash('sha256');
    hash.update(isk);
    hash.update('ZcashSA_Issue_V1_ik');
    return hash.digest();
  }

  /**
   * Encode issuer identifier (ik_encoding)
   */
  encodeIssuer(ik) {
    // ZIP 227: ik_encoding is 32 bytes
    return Buffer.from(ik).toString('hex');
  }

  /**
   * Generate or load issuance keys
   */
  generateOrLoadKeys() {
    if (fs.existsSync(this.keysFile)) {
      const keysData = JSON.parse(fs.readFileSync(this.keysFile, 'utf8'));
      return keysData;
    }

    // Generate new keys
    const seed = this.generateSeed(32);
    const { masterKey, chainCode } = this.generateMasterKey(seed);
    const { isk, chainCode: derivedChainCode } = this.deriveIssuanceKey(masterKey, chainCode, 0);
    const ik = this.deriveValidatingKey(isk);
    const issuer = this.encodeIssuer(ik);

    const keysData = {
      seed: seed.toString('hex'),
      masterKey: masterKey.toString('hex'),
      chainCode: chainCode.toString('hex'),
      isk: isk.toString('hex'),
      ik: ik.toString('hex'),
      issuer: issuer,
      createdAt: new Date().toISOString()
    };

    // Save keys (in production, encrypt this!)
    fs.writeFileSync(this.keysFile, JSON.stringify(keysData, null, 2));

    return keysData;
  }

  /**
   * Get issuer identifier
   */
  getIssuer() {
    const keys = this.generateOrLoadKeys();
    return keys.issuer;
  }

  /**
   * Get issuance authorizing key (isk)
   */
  getISK() {
    const keys = this.generateOrLoadKeys();
    return Buffer.from(keys.isk, 'hex');
  }
}
