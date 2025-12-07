#!/bin/bash
set -e

DOTFILES_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Creating symlinks ==="

echo "-> Linking .zshrc"
ln -sfn "$DOTFILES_DIR/zsh/.zshrc" "$HOME/.zshrc"

echo "-> Linking .gitconfig"
ln -sfn "$DOTFILES_DIR/git/.gitconfig" "$HOME/.gitconfig"

echo "-> Creating ~/.config directory"
mkdir -p "$HOME/.config"

echo "-> Linking nvim"
ln -sfn "$DOTFILES_DIR/nvim" "$HOME/.config/nvim"

echo "-> Linking karabiner"
ln -sfn "$DOTFILES_DIR/karabiner" "$HOME/.config/karabiner"

# VSCode (macOS)
VSCODE_DIR="$HOME/Library/Application Support/Code/User"
if [ -d "$VSCODE_DIR" ]; then
    echo "-> Linking VSCode settings.json"
    ln -sfn "$DOTFILES_DIR/vscode/settings.json" "$VSCODE_DIR/settings.json"
else
    echo "-> VSCode not found, skipping"
fi

echo "=== Symlinks created ==="
