/**
 * Zcash Client Utility
 * Handles connections to Zcash testnet and token operations
 */

export class ZcashClient {
  constructor(config = {}) {
    this.rpcUrl = config.rpcUrl || process.env.ZCASH_TESTNET_RPC_URL || 'http://localhost:18232';
    this.rpcUser = config.rpcUser || process.env.ZCASH_TESTNET_RPC_USER;
    this.rpcPassword = config.rpcPassword || process.env.ZCASH_TESTNET_RPC_PASSWORD;
    this.testnet = config.testnet !== false;
  }

  /**
   * Make RPC call to Zcash node
   */
  async rpcCall(method, params = []) {
    if (!this.rpcUser || !this.rpcPassword) {
      throw new Error(
        'Zcash RPC credentials not configured. Set ZCASH_TESTNET_RPC_USER and ZCASH_TESTNET_RPC_PASSWORD env vars or pass rpcUser/rpcPassword in the config.'
      );
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${this.rpcUser}:${this.rpcPassword}`).toString('base64')}`
    };

    let response;
    try {
      response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      });
    } catch (error) {
      throw new Error(`Zcash RPC network error calling ${method} at ${this.rpcUrl}: ${error.message}`);
    }

    if (!response.ok) {
      throw new Error(`Zcash RPC HTTP ${response.status} from ${this.rpcUrl} for method ${method}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error(`Zcash RPC returned non-JSON response for ${method}: ${error.message}`);
    }

    if (data.error) {
      const code = data.error.code ?? 'unknown';
      const message = data.error.message ?? JSON.stringify(data.error);
      throw new Error(`Zcash RPC ${method} returned error (code ${code}): ${message}`);
    }

    return data.result;
  }

  /**
   * Get blockchain info
   */
  async getBlockchainInfo() {
    return await this.rpcCall('getblockchaininfo');
  }

  /**
   * Get balance for an address
   */
  async getBalance(address) {
    return await this.rpcCall('z_getbalance', [address]);
  }

  /**
   * Get new address
   */
  async getNewAddress() {
    return await this.rpcCall('getnewaddress');
  }

  /**
   * Create ZSA token (when available)
   */
  async createZSAToken(tokenConfig) {
    // This will be implemented when ZSAs are available
    console.log('Creating ZSA token:', tokenConfig);
    throw new Error('ZSA token creation not yet available');
  }

  /**
   * Mint ZSA tokens (when available)
   */
  async mintZSATokens(tokenId, amount, address) {
    // This will be implemented when ZSAs are available
    console.log(`Minting ${amount} tokens (${tokenId}) to ${address}`);
    throw new Error('ZSA token minting not yet available');
  }

  /**
   * Transfer ZSA tokens (when available)
   */
  async transferZSATokens(tokenId, from, to, amount) {
    // This will be implemented when ZSAs are available
    console.log(`Transferring ${amount} tokens (${tokenId}) from ${from} to ${to}`);
    throw new Error('ZSA token transfer not yet available');
  }

  /**
   * Get ZSA token balance (when available)
   */
  async getZSATokenBalance(tokenId, address) {
    // This will be implemented when ZSAs are available
    console.log(`Getting balance for token ${tokenId} at address ${address}`);
    throw new Error('ZSA token balance query not yet available');
  }
}
