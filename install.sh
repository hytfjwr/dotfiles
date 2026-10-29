#!/bin/bash
# Bootstrap installer for a fresh macOS.
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/hytfjwr/dotfiles/main/install.sh)"
#
# Environment variables:
#   DOTFILES_DIR     clone destination (default: ~/dev/dotfiles)
#   DOTFILES_REPO    repository URL    (default: https://github.com/hytfjwr/dotfiles.git)
#   DOTFILES_BRANCH  branch to check out (default: main)
#
# Everything lives inside main() so a truncated download never runs halfway.

set -euo pipefail

DOTFILES_DIR="${DOTFILES_DIR:-$HOME/dev/dotfiles}"
DOTFILES_REPO="${DOTFILES_REPO:-https://github.com/hytfjwr/dotfiles.git}"
DOTFILES_BRANCH="${DOTFILES_BRANCH:-main}"

info() {
    echo -e "\033[0;34m-> $1\033[0m"
}

error() {
    echo -e "\033[0;31m-> $1\033[0m" >&2
}

# git is shipped with the Xcode Command Line Tools, which a fresh macOS lacks.
install_clt() {
    if xcode-select -p &> /dev/null; then
        return
    fi

    info "Installing Xcode Command Line Tools..."
    xcode-select --install || true
    info "Finish the installer dialog. Waiting for it to complete..."
    until xcode-select -p &> /dev/null; do
        sleep 5
    done
}

fetch_dotfiles() {
    if [ -d "$DOTFILES_DIR/.git" ]; then
        info "Updating $DOTFILES_DIR..."
        git -C "$DOTFILES_DIR" pull --ff-only
    elif [ -e "$DOTFILES_DIR" ]; then
        error "$DOTFILES_DIR exists but is not a git repository"
        exit 1
    else
        info "Cloning $DOTFILES_REPO into $DOTFILES_DIR..."
        mkdir -p "$(dirname "$DOTFILES_DIR")"
        git clone --branch "$DOTFILES_BRANCH" "$DOTFILES_REPO" "$DOTFILES_DIR"
    fi
}

main() {
    if [ "$(uname)" != "Darwin" ]; then
        error "This installer supports macOS only"
        exit 1
    fi

    install_clt
    fetch_dotfiles

    # When piped (curl ... | bash), stdin is the script itself; give setup.sh the terminal.
    if [ -t 0 ]; then
        "$DOTFILES_DIR/setup.sh"
    else
        "$DOTFILES_DIR/setup.sh" < /dev/tty
    fi
}

main "$@"
