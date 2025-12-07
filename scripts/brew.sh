#!/bin/bash
set -e

DOTFILES_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Installing Homebrew and packages ==="

if ! command -v brew &> /dev/null; then
    echo "-> Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo "-> Homebrew installed"
else
    echo "-> Homebrew already installed"
fi

echo "-> Running brew bundle..."
brew bundle --file="$DOTFILES_DIR/Brewfile" --verbose

echo "=== Homebrew setup complete ==="
