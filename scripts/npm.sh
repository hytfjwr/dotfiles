#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/colors.sh
source "$SCRIPT_DIR/lib/colors.sh"

section "Installing npm packages"

info "Installing @anthropic-ai/claude-code..."
npm install -g @anthropic-ai/claude-code

info "Installing ccusage..."
npm install -g ccusage

section "npm setup complete"
