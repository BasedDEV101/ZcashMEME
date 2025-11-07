#!/usr/bin/env node

/**
 * Git setup script for Zcash Meme Coin
 * Configures git and sets up remote repository
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Setting up Git repository...\n');

// Git configuration
const GIT_USERNAME = 'BasedDEV101';
const GIT_EMAIL = 'BasedDEV101@users.noreply.github.com';
const GIT_REPO_URL = 'https://github.com/BasedDEV101/ZcashMEME.git';

try {
  // Check if git is installed
  execSync('git --version', { stdio: 'ignore' });
  console.log('✅ Git is installed\n');

  // Initialize git repo if not already initialized
  const gitDir = path.join(__dirname, '..', '.git');
  if (!fs.existsSync(gitDir)) {
    console.log('📦 Initializing git repository...');
    execSync('git init', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    console.log('✅ Git repository initialized\n');
  } else {
    console.log('✅ Git repository already initialized\n');
  }

  // Configure git user
  console.log('👤 Configuring git user...');
  execSync(`git config user.name "${GIT_USERNAME}"`, { 
    cwd: path.join(__dirname, '..'), 
    stdio: 'inherit' 
  });
  execSync(`git config user.email "${GIT_EMAIL}"`, { 
    cwd: path.join(__dirname, '..'), 
    stdio: 'inherit' 
  });
  console.log(`✅ Git user configured: ${GIT_USERNAME} <${GIT_EMAIL}>\n`);

  // Set up remote
  console.log('🌐 Setting up remote repository...');
  try {
    execSync('git remote get-url origin', { 
      cwd: path.join(__dirname, '..'), 
      stdio: 'ignore' 
    });
    console.log('   Remote already exists, updating...');
    execSync(`git remote set-url origin ${GIT_REPO_URL}`, { 
      cwd: path.join(__dirname, '..'), 
      stdio: 'inherit' 
    });
  } catch (error) {
    console.log('   Adding remote...');
    execSync(`git remote add origin ${GIT_REPO_URL}`, { 
      cwd: path.join(__dirname, '..'), 
      stdio: 'inherit' 
    });
  }
  console.log(`✅ Remote configured: ${GIT_REPO_URL}\n`);

  console.log('✨ Git setup complete!\n');
  console.log('📋 Next steps:');
  console.log('1. git add .');
  console.log('2. git commit -m "Initial commit: Zcash Meme Coin project"');
  console.log('3. git push -u origin main (or master)\n');

} catch (error) {
  console.error('❌ Error setting up git:', error.message);
  process.exit(1);
}
