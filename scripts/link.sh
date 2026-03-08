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

info "Linking .aerospace.toml"
ln -sfn "$DOTFILES_DIR/aerospace/aerospace.toml" "$HOME/.aerospace.toml"

info "Creating ~/.config directory"
mkdir -p "$HOME/.config"

info "Linking nvim"
ln -sfn "$DOTFILES_DIR/nvim" "$HOME/.config/nvim"

info "Linking karabiner"
ln -sfn "$DOTFILES_DIR/karabiner" "$HOME/.config/karabiner"

info "Linking wezterm"
ln -sfn "$DOTFILES_DIR/wezterm" "$HOME/.config/wezterm"

info "Linking ghostty"
ln -sfn "$DOTFILES_DIR/ghostty" "$HOME/.config/ghostty"

info "Linking sketchybar"
ln -sfn "$DOTFILES_DIR/sketchybar" "$HOME/.config/sketchybar"

info "Linking gh"
ln -sfn "$DOTFILES_DIR/gh" "$HOME/.config/gh"

info "Creating ~/.config/mise directory"
mkdir -p "$HOME/.config/mise"

info "Linking mise config"
ln -sfn "$DOTFILES_DIR/mise/config.toml" "$HOME/.config/mise/config.toml"

info "Creating ~/.local/bin directory"
mkdir -p "$HOME/.local/bin"

info "Linking local_bin scripts"
ln -sfn "$DOTFILES_DIR/local_bin/env" "$HOME/.local/bin/env"
ln -sfn "$DOTFILES_DIR/local_bin/env.fish" "$HOME/.local/bin/env.fish"
ln -sfn "$DOTFILES_DIR/local_bin/aerospace-fix-windows" "$HOME/.local/bin/aerospace-fix-windows"
ln -sfn "$DOTFILES_DIR/local_bin/nvim-clean" "$HOME/.local/bin/nvim-clean"
ln -sfn "$DOTFILES_DIR/local_bin/awake" "$HOME/.local/bin/awake"

info "Creating ~/.claude directory"
mkdir -p "$HOME/.claude"

info "Linking Claude Code settings"
ln -sfn "$DOTFILES_DIR/claude/settings.json" "$HOME/.claude/settings.json"

info "Linking Claude Code skills"
ln -sfn "$DOTFILES_DIR/claude/skills" "$HOME/.claude/skills"

info "Linking Claude Code rules"
ln -sfn "$DOTFILES_DIR/claude/rules" "$HOME/.claude/rules"

info "Creating ~/.config/ccstatusline directory"
mkdir -p "$HOME/.config/ccstatusline"

info "Linking ccstatusline settings"
ln -sfn "$DOTFILES_DIR/ccstatusline/settings.json" "$HOME/.config/ccstatusline/settings.json"

# VSCode (macOS)
VSCODE_DIR="$HOME/Library/Application Support/Code/User"
if [ -d "$VSCODE_DIR" ]; then
    info "Linking VSCode settings.json"
    ln -sfn "$DOTFILES_DIR/vscode/settings.json" "$VSCODE_DIR/settings.json"
    info "Linking VSCode keybindings.json"
    ln -sfn "$DOTFILES_DIR/vscode/keybindings.json" "$VSCODE_DIR/keybindings.json"
else
    warn "VSCode not found, skipping"
fi

# Cursor (macOS)
CURSOR_DIR="$HOME/Library/Application Support/Cursor/User"
if [ -d "$CURSOR_DIR" ]; then
    info "Linking Cursor settings.json"
    ln -sfn "$DOTFILES_DIR/vscode/settings.json" "$CURSOR_DIR/settings.json"
    info "Linking Cursor keybindings.json"
    ln -sfn "$DOTFILES_DIR/vscode/keybindings.json" "$CURSOR_DIR/keybindings.json"
else
    warn "Cursor not found, skipping"
fi

section "Symlinks created"
