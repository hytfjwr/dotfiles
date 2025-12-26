#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOTFILES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/colors.sh
source "$SCRIPT_DIR/lib/colors.sh"

ZSHRC_FILE="$DOTFILES_DIR/zsh/.zshrc"
# shellcheck disable=SC2016
BUN_PATH_SETTING='export PATH="$BUN_INSTALL/bin:$PATH"'

section "Installing bun"

if command -v bun &> /dev/null; then
    warn "bun already installed: $(bun --version)"
else
    info "Installing bun..."
    curl -fsSL https://bun.sh/install | bash
fi

# Add bun to PATH in current session
if [[ ":$PATH:" != *":$HOME/.bun/bin:"* ]]; then
    export PATH="$HOME/.bun/bin:$PATH"
fi

# Check if bun path is already in zshrc
if ! grep -q "BUN_INSTALL" "$ZSHRC_FILE" 2>/dev/null; then
    info "Adding bun path to .zshrc..."
    {
        echo ""
        echo "# bun"
        echo "export BUN_INSTALL=\"\$HOME/.bun\""
        echo "$BUN_PATH_SETTING"
    } >> "$ZSHRC_FILE"
    success "bun path added to .zshrc"
else
    warn "bun path already configured in .zshrc"
fi

success "bun installed: $(bun --version)"
section "bun setup complete"
