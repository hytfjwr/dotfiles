#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/colors.sh"

section "Installing Claude Code"

info "Installing Claude Code..."
curl -fsSL https://claude.ai/install.sh | bash

section "Claude Code setup complete"
