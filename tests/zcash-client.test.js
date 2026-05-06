/**
 * Tests for ZcashClient RPC handling
 */

import { ZcashClient } from '../src/zcash-client.js';

describe('ZcashClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('rpcCall throws when credentials are not configured', async () => {
    const client = new ZcashClient({ rpcUrl: 'http://localhost:18232' });
    await expect(client.rpcCall('getblockchaininfo')).rejects.toThrow(/credentials not configured/);
  });

  test('rpcCall throws on RPC-level errors with code and message', async () => {
    const client = new ZcashClient({
      rpcUrl: 'http://localhost:18232',
      rpcUser: 'u',
      rpcPassword: 'p'
    });
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ error: { code: -32601, message: 'method not found' }, result: null })
    });
    await expect(client.rpcCall('bogus')).rejects.toThrow(/-32601.*method not found/);
  });

  test('rpcCall throws on HTTP errors', async () => {
    const client = new ZcashClient({
      rpcUrl: 'http://localhost:18232',
      rpcUser: 'u',
      rpcPassword: 'p'
    });
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({})
    });
    await expect(client.rpcCall('getblockchaininfo')).rejects.toThrow(/HTTP 401/);
  });

  test('rpcCall throws on network failure with helpful message', async () => {
    const client = new ZcashClient({
      rpcUrl: 'http://localhost:18232',
      rpcUser: 'u',
      rpcPassword: 'p'
    });
    globalThis.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    await expect(client.rpcCall('getblockchaininfo')).rejects.toThrow(/network error.*ECONNREFUSED/);
  });

  test('rpcCall throws on non-JSON response', async () => {
    const client = new ZcashClient({
      rpcUrl: 'http://localhost:18232',
      rpcUser: 'u',
      rpcPassword: 'p'
    });
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => {
        throw new Error('Unexpected token');
      }
    });
    await expect(client.rpcCall('getblockchaininfo')).rejects.toThrow(/non-JSON response/);
  });

  test('rpcCall returns result on success', async () => {
    const client = new ZcashClient({
      rpcUrl: 'http://localhost:18232',
      rpcUser: 'u',
      rpcPassword: 'p'
    });
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ result: { chain: 'test' }, error: null })
    });
    const result = await client.rpcCall('getblockchaininfo');
    expect(result).toEqual({ chain: 'test' });
  });

  test('rpcCall sends Basic auth header derived from user/password', async () => {
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = options;
      return { ok: true, json: async () => ({ result: 'ok' }) };
    };
    const client = new ZcashClient({
      rpcUrl: 'http://localhost:18232',
      rpcUser: 'alice',
      rpcPassword: 'pw'
    });
    await client.rpcCall('foo');
    expect(captured.headers.Authorization).toBe(
      `Basic ${Buffer.from('alice:pw').toString('base64')}`
    );
  });

  test('createZSAToken throws not-yet-available', async () => {
    const client = new ZcashClient({ rpcUser: 'u', rpcPassword: 'p' });
    await expect(client.createZSAToken({})).rejects.toThrow(/not yet available/);
  });
});
