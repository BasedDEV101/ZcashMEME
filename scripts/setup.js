#!/usr/bin/env node

/**
 * Setup script for Zcash Meme Coin
 * This script helps set up the development environment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Setting up Zcash Meme Coin project...\n');

// Check if .env exists
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env file from .env.example...');
  const envExample = path.join(__dirname, '..', '.env.example');
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envPath);
    console.log('✅ .env file created! Please update it with your credentials.\n');
  }
} else {
  console.log('✅ .env file already exists.\n');
}

// Create directories
const dirs = ['scripts', 'src', 'public', 'logs'];
dirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

console.log('\n✨ Setup complete!');
console.log('\n📋 Next steps:');
console.log('1. Install dependencies: npm install');
console.log('2. Update .env with your Zcash testnet credentials');
console.log('3. Run: npm run dev');
console.log('\n⚠️  Note: ZSAs (Zcash Shielded Assets) are not yet fully implemented.');
console.log('   This project is ready for when ZSAs become available on testnet.\n');
