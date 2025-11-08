# PowerShell script to set up GitHub commit verification using SSH
# Run this script to configure commit signing

Write-Host "GitHub Commit Verification Setup"
Write-Host "================================="
Write-Host ""

# Check if SSH key exists
$sshKeyPath = "$env:USERPROFILE\.ssh\id_ed25519"
$sshPubKeyPath = "$env:USERPROFILE\.ssh\id_ed25519.pub"

if (-not (Test-Path $sshKeyPath)) {
    Write-Host "SSH key not found. Generating new SSH key..."
    Write-Host ""
    
    $email = "BasedDEV101@users.noreply.github.com"
    ssh-keygen -t ed25519 -C $email -f $sshKeyPath -N '""'
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] SSH key generated successfully"
    } else {
        Write-Host "[ERROR] Failed to generate SSH key"
        exit 1
    }
} else {
    Write-Host "[OK] SSH key already exists"
}

# Display public key
Write-Host ""
Write-Host "Your SSH Public Key:"
Write-Host "-------------------"
if (Test-Path $sshPubKeyPath) {
    $publicKey = Get-Content $sshPubKeyPath
    Write-Host $publicKey
    Write-Host ""
    Write-Host "IMPORTANT: Add this key to GitHub as a SIGNING KEY"
    Write-Host "1. Go to: https://github.com/settings/keys"
    Write-Host "2. Click 'New SSH key'"
    Write-Host "3. Title: 'SSH Signing Key'"
    Write-Host "4. Key type: 'Signing Key'"
    Write-Host "5. Paste the key above"
    Write-Host "6. Click 'Add SSH key'"
    Write-Host ""
} else {
    Write-Host "[ERROR] Public key file not found"
    exit 1
}

# Configure Git
Write-Host "Configuring Git for commit signing..."
Write-Host ""

# Get the public key content for signing
$publicKeyContent = Get-Content $sshPubKeyPath -Raw

# Configure Git to use SSH for signing
git config --global user.signingkey $sshPubKeyPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Git signing key configured"
} else {
    Write-Host "[ERROR] Failed to configure Git signing key"
    exit 1
}

# Enable commit signing
git config --global commit.gpgsign true

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Commit signing enabled"
} else {
    Write-Host "[ERROR] Failed to enable commit signing"
    exit 1
}

# Configure SSH config
Write-Host ""
Write-Host "Configuring SSH..."
$sshConfigPath = "$env:USERPROFILE\.ssh\config"
$sshConfigContent = @"

Host *.github.com
  AddKeysToAgent yes
  IdentitiesOnly yes

"@

if (-not (Test-Path $sshConfigPath)) {
    New-Item -Path $sshConfigPath -ItemType File -Force | Out-Null
}

# Check if config already exists
$currentConfig = Get-Content $sshConfigPath -Raw -ErrorAction SilentlyContinue
if ($currentConfig -notmatch "github.com") {
    Add-Content -Path $sshConfigPath -Value $sshConfigContent
    Write-Host "[OK] SSH config updated"
} else {
    Write-Host "[OK] SSH config already configured"
}

Write-Host ""
Write-Host "Setup complete!"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Add your SSH public key to GitHub as a Signing Key (see instructions above)"
Write-Host "2. Test with: git commit --allow-empty -m 'Test signed commit'"
Write-Host "3. Push and check on GitHub - commit should show as 'Verified'"
Write-Host ""

