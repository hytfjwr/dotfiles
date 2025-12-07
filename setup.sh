#!/bin/bash
set -e

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== dotfiles setup ==="

# Homebrew インストール
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Brewfile からパッケージインストール
echo "Installing packages from Brewfile..."
brew bundle --file="$DOTFILES_DIR/Brewfile"

# Oh My Zsh インストール
if [ ! -d "$HOME/.oh-my-zsh" ]; then
    echo "Installing Oh My Zsh..."
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
fi

# Claude Code インストール
echo "Installing Claude Code..."
npm install -g @anthropic-ai/claude-code ccusage

# シンボリックリンク作成
echo "Creating symlinks..."

ln -sfn "$DOTFILES_DIR/zsh/.zshrc" "$HOME/.zshrc"
ln -sfn "$DOTFILES_DIR/git/.gitconfig" "$HOME/.gitconfig"

mkdir -p "$HOME/.config"
ln -sfn "$DOTFILES_DIR/nvim" "$HOME/.config/nvim"
ln -sfn "$DOTFILES_DIR/karabiner" "$HOME/.config/karabiner"

# VSCode (macOS)
VSCODE_DIR="$HOME/Library/Application Support/Code/User"
if [ -d "$VSCODE_DIR" ]; then
    ln -sfn "$DOTFILES_DIR/vscode/settings.json" "$VSCODE_DIR/settings.json"
    echo "  VSCode settings linked"
fi

echo "=== Done! ==="

echo ""
echo "=== Next steps (manual) ==="
echo "1. gcloud init"
echo "2. gcloud auth application-default login"
