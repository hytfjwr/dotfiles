# dotfiles

My dotfiles for macOS.

## Setup

```bash
git clone https://github.com/hytfjwr/dotfiles.git ~/dev/dotfiles
cd ~/dev/dotfiles
./setup.sh
```

## What's included

- **Homebrew packages** - See `Brewfile`
- **Zsh** - `.zshrc`
- **Neovim** - LazyVim config
- **VSCode** - `settings.json`
- **Karabiner-Elements** - Key mappings
- **Claude Code** - via npm

## Post-setup

```bash
gcloud init
gcloud auth application-default login
```
