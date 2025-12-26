#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOTFILES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/colors.sh"

section "Creating symlinks"

info "Linking .zshrc"
ln -sfn "$DOTFILES_DIR/zsh/.zshrc" "$HOME/.zshrc"

info "Linking .gitconfig"
ln -sfn "$DOTFILES_DIR/git/.gitconfig" "$HOME/.gitconfig"

info "Creating ~/.config directory"
mkdir -p "$HOME/.config"

info "Linking nvim"
ln -sfn "$DOTFILES_DIR/nvim" "$HOME/.config/nvim"

info "Linking karabiner"
ln -sfn "$DOTFILES_DIR/karabiner" "$HOME/.config/karabiner"

info "Linking wezterm"
ln -sfn "$DOTFILES_DIR/wezterm" "$HOME/.config/wezterm"

info "Creating ~/.config/mise directory"
mkdir -p "$HOME/.config/mise"

info "Linking mise config"
ln -sfn "$DOTFILES_DIR/mise/config.toml" "$HOME/.config/mise/config.toml"

info "Creating ~/.local/bin directory"
mkdir -p "$HOME/.local/bin"

info "Linking local_bin scripts"
ln -sfn "$DOTFILES_DIR/local_bin/env" "$HOME/.local/bin/env"
ln -sfn "$DOTFILES_DIR/local_bin/env.fish" "$HOME/.local/bin/env.fish"

# VSCode (macOS)
VSCODE_DIR="$HOME/Library/Application Support/Code/User"
if [ -d "$VSCODE_DIR" ]; then
    info "Linking VSCode settings.json"
    ln -sfn "$DOTFILES_DIR/vscode/settings.json" "$VSCODE_DIR/settings.json"
else
    warn "VSCode not found, skipping"
fi

section "Symlinks created"
