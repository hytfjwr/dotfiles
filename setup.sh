#!/bin/bash
set -e

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

# Each script runs in its own process, so PATH changes made inside one
# (brew shellenv, mise activate) don't reach the next. Load them here instead.
load_brew() {
    local brew
    for brew in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        if [ -x "$brew" ]; then
            eval "$("$brew" shellenv)"
            return
        fi
    done
}

echo "=== dotfiles setup ==="

"$DOTFILES_DIR/scripts/brew.sh"
load_brew
"$DOTFILES_DIR/scripts/link.sh"
"$DOTFILES_DIR/scripts/launchd.sh"
"$DOTFILES_DIR/scripts/mise.sh"
eval "$(mise activate bash --shims)"
"$DOTFILES_DIR/scripts/npm.sh"
"$DOTFILES_DIR/scripts/claude.sh"
"$DOTFILES_DIR/scripts/bun.sh"
"$DOTFILES_DIR/scripts/ohmyzsh.sh"
"$DOTFILES_DIR/scripts/macos.sh"

echo "=== All done! ==="
echo ""
echo "=== Next steps (manual) ==="
echo "1. gcloud init"
echo "2. gcloud auth application-default login"
