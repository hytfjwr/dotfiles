#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/colors.sh"

section "Installing bun"

if command -v bun &> /dev/null; then
    warn "bun already installed: $(bun --version)"
else
    info "Installing bun..."
    curl -fsSL https://bun.sh/install | bash
fi

# Add bun to PATH in current session
# (permanent setting lives in zsh/.zshrc)
if [[ ":$PATH:" != *":$HOME/.bun/bin:"* ]]; then
    export PATH="$HOME/.bun/bin:$PATH"
fi

success "bun installed: $(bun --version)"
section "bun setup complete"
