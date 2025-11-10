# GitHub Repository Verification Guide

This guide explains how to make your GitHub repository commits show as "Verified".

## What is Verified Commits?

Verified commits show a "Verified" badge on GitHub, indicating that the commit was signed and can be trusted. This helps prove that commits come from you and haven't been tampered with.

## Method 1: SSH Key Signing (Recommended - Easier)

SSH key signing is simpler than GPG and uses your existing SSH key.

### Step 1: Check if you have an SSH key

```bash
# Check for existing SSH keys
ls -al ~/.ssh
```

If you see `id_ed25519.pub` or `id_rsa.pub`, you already have an SSH key.

### Step 2: Generate SSH key (if needed)

```bash
# Generate a new SSH key (use your GitHub email)
ssh-keygen -t ed25519 -C "BasedDEV101@users.noreply.github.com"
```

Press Enter to accept default location, and optionally set a passphrase.

### Step 3: Add SSH key to GitHub

1. Copy your public key:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```
   Or on Windows PowerShell:
   ```powershell
   Get-Content ~\.ssh\id_ed25519.pub
   ```

2. Go to GitHub: https://github.com/settings/keys
3. Click "New SSH key"
4. Title: "SSH Signing Key"
5. Key type: "Signing Key"
6. Paste your public key
7. Click "Add SSH key"

### Step 4: Get your SSH key ID

```bash
# List your SSH keys and get the key ID
ssh-add -L
```

The key ID is the part after the key type (usually starts with something like `AAAAC3...`).

### Step 5: Configure Git to use SSH signing

```bash
# Configure Git to use SSH for signing
git config --global user.signingkey ~/.ssh/id_ed25519.pub

# Or use the key ID directly:
# git config --global user.signingkey "KEY_ID_HERE"

# Enable commit signing
git config --global commit.gpgsign true

# Or for this repository only:
# git config commit.gpgsign true
```

### Step 6: Configure SSH for signing

Create or edit `~/.ssh/config` (or `C:\Users\YourUsername\.ssh\config` on Windows):

```
Host *.github.com
  AddKeysToAgent yes
  IdentitiesOnly yes
```

### Step 7: Test it

```bash
# Make a test commit
git commit --allow-empty -m "Test signed commit"
git push
```

Check on GitHub - the commit should show as "Verified".

## Method 2: GPG Key Signing

GPG is more traditional but requires installing GPG software.

### Step 1: Install GPG

**Windows:**
- Download from: https://www.gpg4win.org/
- Or use Git Bash (includes GPG)

**macOS:**
```bash
brew install gnupg
```

**Linux:**
```bash
sudo apt-get install gnupg
```

### Step 2: Generate GPG Key

```bash
gpg --full-generate-key
```

Choose:
1. RSA and RSA (default)
2. 4096 bits
3. Key validity: 0 (doesn't expire)
4. Enter your name: BasedDEV101
5. Enter your email: BasedDEV101@users.noreply.github.com
6. Enter a passphrase (optional but recommended)

### Step 3: Get your GPG Key ID

```bash
gpg --list-secret-keys --keyid-format=long
```

Look for a line like:
```
sec   rsa4096/3AA5C34371567BD2 2024-01-01 [SC]
```

The key ID is `3AA5C34371567BD2` (the part after the slash).

### Step 4: Export your public key

```bash
gpg --armor --export YOUR_KEY_ID
```

Copy the entire output including `-----BEGIN PGP PUBLIC KEY BLOCK-----` and `-----END PGP PUBLIC KEY BLOCK-----`.

### Step 5: Add GPG key to GitHub

1. Go to: https://github.com/settings/gpg/new
2. Paste your public key
3. Click "Add GPG key"

### Step 6: Configure Git to use GPG

```bash
# Tell Git which key to use
git config --global user.signingkey YOUR_KEY_ID

# Enable commit signing
git config --global commit.gpgsign true
```

### Step 7: Test it

```bash
# Make a test commit
git commit --allow-empty -m "Test signed commit"
git push
```

## Verifying Your Setup

After setting up either method:

1. Make a commit and push it
2. Go to your repository on GitHub
3. Look at the commit - it should show a "Verified" badge

## Troubleshooting

### SSH Signing Issues

If SSH signing doesn't work:

1. Make sure your SSH key is added to GitHub as a "Signing Key" (not just "Authentication Key")
2. Check your Git config:
   ```bash
   git config --list | grep signing
   ```
3. Make sure your SSH key is loaded:
   ```bash
   ssh-add -l
   ```

### GPG Signing Issues

If GPG signing doesn't work:

1. Make sure GPG is installed and in your PATH
2. Check your Git config:
   ```bash
   git config --list | grep signing
   ```
3. Make sure your GPG key is added to GitHub
4. On Windows, you might need to configure GPG path:
   ```bash
   git config --global gpg.program "C:\Program Files (x86)\GnuPG\bin\gpg.exe"
   ```

## Enable Vigilant Mode (Optional)

GitHub has a "Vigilant mode" that shows "Unverified" for unsigned commits:

1. Go to: https://github.com/settings/keys
2. Under "Vigilant mode", check "Flag unsigned commits as unverified"
3. This helps you remember to sign all commits

## Quick Setup Script

For SSH signing (Windows PowerShell):

```powershell
# Generate SSH key (if needed)
ssh-keygen -t ed25519 -C "BasedDEV101@users.noreply.github.com"

# Configure Git
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true

# Display public key to add to GitHub
Write-Host "Add this key to GitHub as a Signing Key:"
Get-Content ~\.ssh\id_ed25519.pub
```

## Notes

- SSH signing is recommended as it's simpler and uses existing SSH infrastructure
- Once configured, all future commits will be signed automatically
- You can sign existing commits by amending them (use carefully)
- Verified commits help establish trust and authenticity in your repository

## Resources

- GitHub Docs: https://docs.github.com/en/authentication/managing-commit-signature-verification
- SSH Signing: https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification# ssh-commit-signature-verification
- GPG Signing: https://docs.github.com/en/authentication/managing-commit-signature-verification/generating-a-new-gpg-key



