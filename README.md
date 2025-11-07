# Zcash Meme Coin 🚀

A meme coin project built for Zcash using ZSAs (Zcash Shielded Assets) as defined in ZIP227.

**Repository:** [https://github.com/BasedDEV101/ZcashMEME](https://github.com/BasedDEV101/ZcashMEME)

## ⚠️ Current Status

**ZSAs (Zcash Shielded Assets) are not yet fully implemented on testnet.** This project is prepared and ready for when ZSAs become available. Currently, it includes:

- ✅ Project structure and configuration
- ✅ Token specification
- ✅ Web interface (preview mode)
- ✅ Deployment scripts (ready for ZSAs)
- ✅ Zcash client utilities

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Zcash testnet node (optional, for full functionality when ZSAs are available)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Configuration

```bash
npm run setup
```

This will create a `.env` file from the template. Update it with your Zcash testnet credentials:

```env
ZCASH_TESTNET_RPC_URL=http://localhost:18232
ZCASH_TESTNET_RPC_USER=your_rpc_user
ZCASH_TESTNET_RPC_PASSWORD=your_rpc_password
```

### 3. Configure Token

Edit `token-config.json` to customize your meme coin:

```json
{
  "name": "ZcashMemeCoin",
  "symbol": "ZMC",
  "description": "The first meme coin on Zcash! 🚀",
  "totalSupply": "1000000000",
  "decimals": 8,
  "testnet": true,
  "network": "zcash-testnet"
}
```

### 4. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000 to see the web interface.

## 📁 Project Structure

```
zcash-meme-coin/
├── scripts/
│   ├── setup.js          # Setup script
│   ├── deploy.js         # Deployment script (for when ZSAs are available)
│   ├── test.js           # Testing utilities
│   ├── git-setup.js      # Git repository setup
│   └── git-push.js       # Push to GitHub script
├── src/
│   ├── zcash-client.js   # Zcash RPC client
│   └── token-manager.js  # Token management logic
├── public/
│   └── index.html        # Web interface
├── token-config.json     # Token configuration
├── .env.example          # Environment variables template
├── package.json          # Dependencies
└── README.md            # This file
```

## 🔧 Available Scripts

- `npm run setup` - Set up the project environment
- `npm run dev` - Start the development server
- `npm run deploy` - Deploy token (when ZSAs are available)
- `npm test` - Run tests
- `npm run git:setup` - Configure git repository and remote
- `npm run git:push` - Push code to GitHub (usage: `npm run git:push -- "commit message"`)

## 🎯 Token Features

Once ZSAs are available, this project will support:

- Token deployment on Zcash testnet
- Token minting
- Token transfers
- Balance queries
- Shielded transactions (privacy-preserving)

## 📚 ZSAs (Zcash Shielded Assets)

Zcash Shielded Assets (ZSAs) are defined in ZIP227 and will enable the creation of custom tokens on the Zcash blockchain with privacy-preserving features. This project is designed to work with ZSAs once they become available on testnet.

## 🔗 Resources

- [Zcash Official Website](https://z.cash)
- [Zcash Community Forum](https://forum.zcashcommunity.com)
- [ZIP227 Specification](https://zips.z.cash/zip-0227)

## ⚠️ Disclaimer

This is a testnet project for educational purposes. ZSAs are not yet fully implemented, so actual token deployment is not currently possible. Monitor the Zcash community for updates on ZSA availability.

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

**Note:** This project is in development and ready for when ZSAs become available on Zcash testnet.
