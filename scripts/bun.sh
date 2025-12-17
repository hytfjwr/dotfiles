#!/bin/bash
set -e

DOTFILES_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ZSHRC_FILE="$DOTFILES_DIR/zsh/.zshrc"
BUN_PATH_SETTING='export PATH="$BUN_INSTALL/bin:$PATH"'

echo "=== Installing bun ==="

if command -v bun &> /dev/null; then
    echo "-> bun already installed: $(bun --version)"
else
    echo "-> Installing bun..."
    curl -fsSL https://bun.sh/install | bash
fi

# Add bun to PATH in current session
if [[ ":$PATH:" != *":$HOME/.bun/bin:"* ]]; then
    export PATH="$HOME/.bun/bin:$PATH"
fi

# Check if bun path is already in zshrc
if ! grep -q "BUN_INSTALL" "$ZSHRC_FILE" 2>/dev/null; then
    echo "-> Adding bun path to .zshrc..."
    echo "" >> "$ZSHRC_FILE"
    echo "# bun" >> "$ZSHRC_FILE"
    echo "export BUN_INSTALL=\"\$HOME/.bun\"" >> "$ZSHRC_FILE"
    echo "$BUN_PATH_SETTING" >> "$ZSHRC_FILE"
    echo "-> bun path added to .zshrc"
else
    echo "-> bun path already configured in .zshrc"
fi

echo "-> bun installed: $(bun --version)"
echo "=== bun setup complete ==="
