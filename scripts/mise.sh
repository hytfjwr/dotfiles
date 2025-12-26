#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/colors.sh"

section "Setting up mise"

if ! command -v mise &> /dev/null; then
    error "mise not found. Please run 'make brew' first."
    exit 1
fi

eval "$(mise activate bash)"

info "Installing PHP plugin..."
mise plugin install php https://github.com/asdf-community/asdf-php 2>/dev/null || true

info "Installing default tool versions..."
mise install

info "Trusting mise config..."
mise trust "$HOME/.config/mise/config.toml" 2>/dev/null || true

success "mise setup complete"
info "Installed versions:"
mise list
