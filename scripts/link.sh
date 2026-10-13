#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOTFILES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/colors.sh"

# link <path relative to dotfiles> <absolute target path>
link() {
    local src="$DOTFILES_DIR/$1"
    local dst="$2"

    if [ ! -e "$src" ]; then
        warn "Skipping $1 (not found in dotfiles)"
        return
    fi

    mkdir -p "$(dirname "$dst")"

    # ln -sfn creates the link *inside* dst when dst is a real directory
    # (~/.config/nvim would become ~/.config/nvim/nvim) and silently
    # overwrites dst when it is a real file, so move it aside first.
    # Symlinks are left to ln, which keeps re-runs idempotent.
    if [ ! -L "$dst" ] && [ -e "$dst" ]; then
        local backup
        backup="$dst.backup.$(date +%Y%m%d%H%M%S)"
        warn "$dst already exists, moving to $backup"
        mv "$dst" "$backup"
    fi

    ln -sfn "$src" "$dst"
    info "Linked $dst"
}

# "<source relative to dotfiles>|<absolute target path>"
LINKS=(
    # $HOME
    "zsh/.zshrc|$HOME/.zshrc"
    "git/.gitconfig|$HOME/.gitconfig"
    "aerospace/aerospace.toml|$HOME/.aerospace.toml"

    # ~/.config
    "nvim|$HOME/.config/nvim"
    "karabiner|$HOME/.config/karabiner"
    "wezterm|$HOME/.config/wezterm"
    "ghostty|$HOME/.config/ghostty"
    "gh|$HOME/.config/gh"
    "statusbar/config.yml|$HOME/.config/statusbar/config.yml"
    "statusbar/plugins-lock.yml|$HOME/.config/statusbar/plugins-lock.yml"
    "mise/config.toml|$HOME/.config/mise/config.toml"
    "herdr/config.toml|$HOME/.config/herdr/config.toml"
    "starship/starship.toml|$HOME/.config/starship.toml"

    # ~/.local/bin
    "local_bin/env|$HOME/.local/bin/env"
    "local_bin/env.fish|$HOME/.local/bin/env.fish"
    "local_bin/aerospace-fix-windows|$HOME/.local/bin/aerospace-fix-windows"
    "local_bin/nvim-clean|$HOME/.local/bin/nvim-clean"
    "local_bin/awake|$HOME/.local/bin/awake"
    "local_bin/wezterm-clean|$HOME/.local/bin/wezterm-clean"
    "local_bin/secure-input|$HOME/.local/bin/secure-input"
    "local_bin/claude-warmup|$HOME/.local/bin/claude-warmup"
    "local_bin/claude-session-bridge|$HOME/.local/bin/claude-session-bridge"
    "local_bin/tuicr-prompt|$HOME/.local/bin/tuicr-prompt"
    "local_bin/tuicr-review|$HOME/.local/bin/tuicr-review"

    # Codex
    "codex/config.toml|$HOME/.codex/config.toml"

    # Claude Code
    "claude/settings.json|$HOME/.claude/settings.json"
    "claude/skills|$HOME/.claude/skills"
    "claude/rules|$HOME/.claude/rules"
)

# "<source relative to dotfiles>|<absolute target path>|<how to build it>"
BUILT_LINKS=(
    "tools/wezterm-tmux-shim/target/release/wezterm-tmux-shim|$HOME/.local/bin/tmux|make tmux-shim"
    "claude/statusline/target/release/claude-statusline|$HOME/.local/bin/claude-statusline|make statusline"
)

# Linked into every editor directory that exists
EDITOR_LINKS=(
    "vscode/settings.json|settings.json"
    "vscode/keybindings.json|keybindings.json"
)

link_editor() {
    local name="$1"
    local dir="$2"
    local entry

    if [ ! -d "$dir" ]; then
        warn "$name not found, skipping"
        return
    fi

    for entry in "${EDITOR_LINKS[@]}"; do
        link "${entry%%|*}" "$dir/${entry#*|}"
    done
}

section "Creating symlinks"

for entry in "${LINKS[@]}"; do
    link "${entry%%|*}" "${entry#*|}"
done

for entry in "${BUILT_LINKS[@]}"; do
    IFS='|' read -r src dst hint <<< "$entry"
    if [ -f "$DOTFILES_DIR/$src" ]; then
        link "$src" "$dst"
    else
        warn "$(basename "$src") not built, skipping (run: $hint)"
    fi
done

# macOS editor config directories
link_editor "VSCode" "$HOME/Library/Application Support/Code/User"
link_editor "Cursor" "$HOME/Library/Application Support/Cursor/User"

section "Symlinks created"
