#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/colors.sh"

section "Applying macOS settings"

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

info "Restarting Finder..."
killall Finder

info "Restarting Dock..."
killall Dock

section "macOS settings applied"
