#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/colors.sh"

section "Installing npm packages"

info "Installing ccusage..."
npm install -g ccusage

info "Installing pnpm..."
npm install -g pnpm

info "Installing codex..."
npm install -g @openai/codex

section "npm setup complete"
