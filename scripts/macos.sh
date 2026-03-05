#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/colors.sh"

section "Applying macOS settings"

info "Enable Touch ID for sudo"
SUDO_LOCAL="/etc/pam.d/sudo_local"
TOUCHID_LINE="auth       sufficient     pam_tid.so"
if [ ! -f "$SUDO_LOCAL" ] || ! grep -q "pam_tid.so" "$SUDO_LOCAL"; then
  echo "$TOUCHID_LINE" | sudo tee "$SUDO_LOCAL" > /dev/null
  info "Touch ID for sudo enabled"
else
  info "Touch ID for sudo already configured"
fi

info "Show all file extensions in Finder"
defaults write NSGlobalDomain AppleShowAllExtensions -bool true

info "Show hidden files in Finder"
defaults write com.apple.finder AppleShowAllFiles -bool true

info "Show path bar in Finder"
defaults write com.apple.finder ShowPathbar -bool true

info "Show status bar in Finder"
defaults write com.apple.finder ShowStatusBar -bool true

info "Prevent .DS_Store files on network volumes"
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true

info "Disable Dock auto-hide animation delay"
defaults write com.apple.dock autohide-time-modifier -int 0

info "Auto-hide MenuBar"
defaults write NSGlobalDomain _HIHideMenuBar -bool true

info "Restarting Finder..."
killall Finder

info "Restarting Dock..."
killall Dock

info "Restarting SystemUIServer to apply MenuBar settings..."
killall SystemUIServer || true

info "Starting sketchybar service"
brew services start sketchybar

section "macOS settings applied"
