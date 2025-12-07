#!/bin/bash
set -e

echo "=== Applying macOS settings ==="

echo "-> Show all file extensions in Finder"
defaults write NSGlobalDomain AppleShowAllExtensions -bool true

echo "-> Show hidden files in Finder"
defaults write com.apple.finder AppleShowAllFiles -bool true

echo "-> Show path bar in Finder"
defaults write com.apple.finder ShowPathbar -bool true

echo "-> Show status bar in Finder"
defaults write com.apple.finder ShowStatusBar -bool true

echo "-> Prevent .DS_Store files on network volumes"
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true

echo "-> Disable Dock auto-hide animation delay"
defaults write com.apple.dock autohide-time-modifier -int 0

echo "-> Restarting Finder..."
killall Finder

echo "-> Restarting Dock..."
killall Dock

echo "=== macOS settings applied ==="
