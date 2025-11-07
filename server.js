/**
 * Express server for Zcash Meme Coin web interface
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { TokenManager } from './src/token-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const tokenManager = new TokenManager();

// API Routes
app.get('/api/token/config', (req, res) => {
  try {
    const config = tokenManager.getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/token/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    // Use mock balance until ZSAs are available
    const balance = tokenManager.getMockBalance(address);
    res.json({ address, balance, symbol: tokenManager.getConfig().symbol });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/token/mint', async (req, res) => {
  try {
    const { amount, toAddress } = req.body;
    // This will work when ZSAs are available
    const result = await tokenManager.mint(amount, toAddress);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/token/transfer', async (req, res) => {
  try {
    const { fromAddress, toAddress, amount } = req.body;
    // This will work when ZSAs are available
    const result = await tokenManager.transfer(fromAddress, toAddress, amount);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    zsaAvailable: false,
    message: 'ZSAs (Zcash Shielded Assets) are not yet fully implemented. This is a preview interface.',
    network: 'testnet'
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Zcash Meme Coin server running on http://localhost:${PORT}`);
  console.log(`📋 Token: ${tokenManager.getConfig().name} (${tokenManager.getConfig().symbol})`);
  console.log(`⚠️  Note: ZSAs are not yet available. This is a preview interface.\n`);
});
