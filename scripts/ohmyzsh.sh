#!/bin/bash
set -e

ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"

echo "=== Installing Oh My Zsh ==="

if [ ! -d "$HOME/.oh-my-zsh" ]; then
    echo "-> Downloading and installing Oh My Zsh..."
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
    echo "-> Oh My Zsh installed"
else
    echo "-> Oh My Zsh already installed"
fi

echo "=== Installing Powerlevel10k theme ==="

if [ ! -d "$ZSH_CUSTOM/themes/powerlevel10k" ]; then
    echo "-> Cloning powerlevel10k..."
    git clone --depth=1 https://github.com/romkatv/powerlevel10k.git "$ZSH_CUSTOM/themes/powerlevel10k"
    echo "-> Powerlevel10k installed"
else
    echo "-> Powerlevel10k already installed"
fi

echo "=== Installing zsh plugins ==="

if [ ! -d "$ZSH_CUSTOM/plugins/zsh-autosuggestions" ]; then
    echo "-> Cloning zsh-autosuggestions..."
    git clone https://github.com/zsh-users/zsh-autosuggestions "$ZSH_CUSTOM/plugins/zsh-autosuggestions"
    echo "-> zsh-autosuggestions installed"
else
    echo "-> zsh-autosuggestions already installed"
fi

if [ ! -d "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting" ]; then
    echo "-> Cloning zsh-syntax-highlighting..."
    git clone https://github.com/zsh-users/zsh-syntax-highlighting "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting"
    echo "-> zsh-syntax-highlighting installed"
else
    echo "-> zsh-syntax-highlighting already installed"
fi

echo "=== Oh My Zsh setup complete ==="
