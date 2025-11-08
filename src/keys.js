/**
 * Key Generation and Management for ZIP 227
 * Implements issuance key generation according to ZIP 227 specification
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import secp256k1 from 'secp256k1';

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
    const domain = Buffer.from('ZcashSA_Issue_V1', 'utf8');
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
    const hardened = (index) => (index | 0x80000000) >>> 0;
    const path = [
      hardened(227), // purpose
      hardened(133), // zcash testnet coin type per ZIP-32 draft
      hardened(account)
    ];

    let key = Buffer.from(masterKey);
    let cc = Buffer.from(chainCode);

    path.forEach((index) => {
      const data = Buffer.alloc(1 + key.length + 4);
      data[0] = 0x00;
      key.copy(data, 1);
      data.writeUInt32BE(index, data.length - 4);

      let derived = crypto.createHmac('sha512', cc).update(data).digest();
      let childKey = derived.slice(0, 32);
      let childChain = derived.slice(32, 64);

      // Ensure the derived private key is valid; if not, bump index deterministically
      let tweakIndex = 1;
      while (!secp256k1.privateKeyVerify(childKey)) {
        const retryData = Buffer.alloc(data.length);
        data.copy(retryData);
        const bump = Buffer.alloc(4);
        bump.writeUInt32BE(tweakIndex, 0);
        retryData.set(bump, retryData.length - 4);
        derived = crypto.createHmac('sha512', cc).update(retryData).digest();
        childKey = derived.slice(0, 32);
        childChain = derived.slice(32, 64);
        tweakIndex += 1;
      }

      key = childKey;
      cc = childChain;
    });

    return {
      isk: key,
      chainCode: cc
    };
  }

  /**
   * Derive validating key (ik) from issuance key (isk)
   */
  deriveValidatingKey(isk) {
    let privateKey = Buffer.from(isk);
    if (!secp256k1.privateKeyVerify(privateKey)) {
      throw new Error('Invalid issuance key');
    }

    let publicKey = secp256k1.publicKeyCreate(privateKey, true);

    if (publicKey[0] === 0x03) {
      privateKey = secp256k1.privateKeyNegate(privateKey);
      publicKey = secp256k1.publicKeyCreate(privateKey, true);
    }

    return {
      ik: Buffer.from(publicKey.slice(1)), // 32-byte x-coordinate
      normalizedISK: privateKey
    };
  }

  /**
   * Encode issuer identifier (ik_encoding)
   */
  encodeIssuer(ik) {
    const ikBuffer = Buffer.from(ik);
    const encoding = Buffer.concat([Buffer.from([0x00]), ikBuffer]);
    return encoding.toString('hex');
  }

  /**
   * Generate or load issuance keys
   */
  generateOrLoadKeys() {
    // Ensure directory exists
    this.ensureKeysDir();
    let loadedKeys = null;

    if (fs.existsSync(this.keysFile)) {
      try {
        const keysData = JSON.parse(fs.readFileSync(this.keysFile, 'utf8'));
        if (keysData.issuer && keysData.issuer.length === 66) {
          return keysData;
        }
        loadedKeys = keysData;
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EPERM') {
          throw error;
        }
        // Treat as missing file and continue to regeneration branch
      }

      if (loadedKeys) {
        const upgraded = this.upgradeLegacyKeys(loadedKeys);
        fs.writeFileSync(this.keysFile, JSON.stringify(upgraded, null, 2));
        return upgraded;
      }
    }

    // Generate new keys
    const seed = this.generateSeed(32);
    const { masterKey, chainCode } = this.generateMasterKey(seed);
    let { isk, chainCode: derivedChainCode } = this.deriveIssuanceKey(masterKey, chainCode, 0);
    const { ik, normalizedISK } = this.deriveValidatingKey(isk);
    isk = normalizedISK;
    const issuer = this.encodeIssuer(ik);

    const keysData = {
      seed: seed.toString('hex'),
      masterKey: masterKey.toString('hex'),
      chainCode: chainCode.toString('hex'),
      isk: isk.toString('hex'),
      ik: ik.toString('hex'),
      issuerEncoding: issuer,
      issuer: issuer,
      createdAt: new Date().toISOString()
    };

    // Save keys (in production, encrypt this!)
    fs.mkdirSync(path.dirname(this.keysFile), { recursive: true });
    try {
      fs.writeFileSync(this.keysFile, JSON.stringify(keysData, null, 2));
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.ensureKeysDir();
        fs.writeFileSync(this.keysFile, JSON.stringify(keysData, null, 2));
      } else {
        throw error;
      }
    }

    return keysData;
  }

  upgradeLegacyKeys(keysData) {
    if (!keysData || !keysData.isk) {
      throw new Error('Unable to upgrade legacy issuance keys');
    }

    const legacyISK = Buffer.from(keysData.isk, 'hex');
    const { ik, normalizedISK } = this.deriveValidatingKey(legacyISK);
    const issuer = this.encodeIssuer(ik);

    return {
      ...keysData,
      ik: ik.toString('hex'),
      isk: normalizedISK.toString('hex'),
      issuer,
      issuerEncoding: issuer,
      upgradedAt: new Date().toISOString()
    };
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
