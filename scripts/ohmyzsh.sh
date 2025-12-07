#!/bin/bash
set -e

echo "=== Installing Oh My Zsh ==="

if [ ! -d "$HOME/.oh-my-zsh" ]; then
    echo "-> Downloading and installing Oh My Zsh..."
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
    echo "-> Oh My Zsh installed"
else
    echo "-> Oh My Zsh already installed"
fi

echo "=== Oh My Zsh setup complete ==="
