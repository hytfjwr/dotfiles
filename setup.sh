#!/bin/bash
set -e

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== dotfiles setup ==="

"$DOTFILES_DIR/scripts/brew.sh"
"$DOTFILES_DIR/scripts/link.sh"
"$DOTFILES_DIR/scripts/mise.sh"
"$DOTFILES_DIR/scripts/npm.sh"
"$DOTFILES_DIR/scripts/bun.sh"
"$DOTFILES_DIR/scripts/ohmyzsh.sh"
"$DOTFILES_DIR/scripts/macos.sh"

echo "=== All done! ==="
echo ""
echo "=== Next steps (manual) ==="
echo "1. gcloud init"
echo "2. gcloud auth application-default login"
