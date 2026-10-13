#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOTFILES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/colors.sh"

AGENTS_DIR="$HOME/Library/LaunchAgents"
DOMAIN="gui/$(id -u)"

section "Installing LaunchAgents"

mkdir -p "$AGENTS_DIR"

# Copy instead of symlinking: launchd may refuse symlinked plists
for plist in "$DOTFILES_DIR"/launchd/*.plist; do
    label="$(basename "$plist" .plist)"
    dst="$AGENTS_DIR/$label.plist"

    launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
    cp "$plist" "$dst"
    launchctl bootstrap "$DOMAIN" "$dst"
    info "Loaded $label"
done
