#!/bin/bash

# Bash script to set up GitHub commit verification using SSH
# Run this script to configure commit signing

echo "GitHub Commit Verification Setup"
echo "================================="
echo ""

# Check if SSH key exists
SSH_KEY_PATH="$HOME/.ssh/id_ed25519"
SSH_PUB_KEY_PATH="$HOME/.ssh/id_ed25519.pub"

if [ ! -f "$SSH_KEY_PATH" ]; then
    echo "SSH key not found. Generating new SSH key..."
    echo ""
    
    EMAIL="BasedDEV101@users.noreply.github.com"
    ssh-keygen -t ed25519 -C "$EMAIL" -f "$SSH_KEY_PATH" -N ""
    
    if [ $? -eq 0 ]; then
        echo "[OK] SSH key generated successfully"
    else
        echo "[ERROR] Failed to generate SSH key"
        exit 1
    fi
else
    echo "[OK] SSH key already exists"
fi

# Display public key
echo ""
echo "Your SSH Public Key:"
echo "-------------------"
if [ -f "$SSH_PUB_KEY_PATH" ]; then
    cat "$SSH_PUB_KEY_PATH"
    echo ""
    echo "IMPORTANT: Add this key to GitHub as a SIGNING KEY"
    echo "1. Go to: https://github.com/settings/keys"
    echo "2. Click 'New SSH key'"
    echo "3. Title: 'SSH Signing Key'"
    echo "4. Key type: 'Signing Key'"
    echo "5. Paste the key above"
    echo "6. Click 'Add SSH key'"
    echo ""
else
    echo "[ERROR] Public key file not found"
    exit 1
fi

# Configure Git
echo "Configuring Git for commit signing..."
echo ""

# Configure Git to use SSH for signing
git config --global user.signingkey "$SSH_PUB_KEY_PATH"

if [ $? -eq 0 ]; then
    echo "[OK] Git signing key configured"
else
    echo "[ERROR] Failed to configure Git signing key"
    exit 1
fi

# Enable commit signing
git config --global commit.gpgsign true

if [ $? -eq 0 ]; then
    echo "[OK] Commit signing enabled"
else
    echo "[ERROR] Failed to enable commit signing"
    exit 1
fi

# Configure SSH config
echo ""
echo "Configuring SSH..."
SSH_CONFIG_PATH="$HOME/.ssh/config"

if [ ! -f "$SSH_CONFIG_PATH" ]; then
    touch "$SSH_CONFIG_PATH"
    chmod 600 "$SSH_CONFIG_PATH"
fi

# Check if config already exists
if ! grep -q "github.com" "$SSH_CONFIG_PATH" 2>/dev/null; then
    cat >> "$SSH_CONFIG_PATH" << EOF

Host *.github.com
  AddKeysToAgent yes
  IdentitiesOnly yes

EOF
    echo "[OK] SSH config updated"
else
    echo "[OK] SSH config already configured"
fi

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Add your SSH public key to GitHub as a Signing Key (see instructions above)"
echo "2. Test with: git commit --allow-empty -m 'Test signed commit'"
echo "3. Push and check on GitHub - commit should show as 'Verified'"
echo ""
