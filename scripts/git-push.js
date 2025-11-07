#!/usr/bin/env node

/**
 * Git push script for Zcash Meme Coin
 * Pushes code to GitHub using the configured token
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
let githubToken = null;
let githubUsername = 'BasedDEV101';
let githubRepo = 'ZcashMEME';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.startsWith('GITHUB_TOKEN=')) {
      githubToken = line.split('=')[1].trim();
    }
    if (line.startsWith('GITHUB_USERNAME=')) {
      githubUsername = line.split('=')[1].trim();
    }
    if (line.startsWith('GITHUB_REPO=')) {
      githubRepo = line.split('=')[1].trim();
    }
  }
}

if (!githubToken) {
  console.error('❌ GITHUB_TOKEN not found in .env file');
  console.log('   Please add GITHUB_TOKEN=your_token to .env file');
  process.exit(1);
}

const repoUrl = `https://${githubToken}@github.com/${githubUsername}/${githubRepo}.git`;

console.log('🚀 Pushing to GitHub...\n');
console.log(`📦 Repository: ${githubUsername}/${githubRepo}\n`);

try {
  // Check git status
  console.log('📊 Checking git status...');
  const status = execSync('git status --short', { 
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });

  if (!status.trim()) {
    console.log('✅ No changes to commit\n');
  } else {
    console.log('📝 Changes detected:\n', status);
    
    // Add all files
    console.log('➕ Staging files...');
    execSync('git add .', { 
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });

    // Get commit message from args or use default
    const commitMessage = process.argv[2] || 'Update Zcash Meme Coin project';
    
    // Commit
    console.log(`\n💾 Committing: "${commitMessage}"...`);
    execSync(`git commit -m "${commitMessage}"`, { 
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
  }

  // Set remote URL with token
  console.log('\n🌐 Configuring remote...');
  execSync(`git remote set-url origin ${repoUrl}`, { 
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });

  // Get current branch
  const branch = execSync('git branch --show-current', { 
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  }).trim() || 'main';

  // Push
  console.log(`\n⬆️  Pushing to ${branch}...`);
  execSync(`git push -u origin ${branch}`, { 
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });

  console.log('\n✅ Successfully pushed to GitHub!\n');
  console.log(`🔗 View your repo: https://github.com/${githubUsername}/${githubRepo}\n`);

} catch (error) {
  console.error('\n❌ Error pushing to GitHub:', error.message);
  process.exit(1);
}
