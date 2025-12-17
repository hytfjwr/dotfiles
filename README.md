# dotfiles

My dotfiles for macOS.

## Setup

### Initial Setup

```bash
git clone https://github.com/hytfjwr/dotfiles.git ~/dev/dotfiles
cd ~/dev/dotfiles
./setup.sh
```

The `setup.sh` script runs the following in order:

1. **brew.sh** - Installs Homebrew and all packages from `Brewfile`
2. **npm.sh** - Installs global npm packages
3. **bun.sh** - Installs bun and adds it to PATH in `.zshrc`
4. **ohmyzsh.sh** - Sets up Oh My Zsh with plugins
5. **link.sh** - Creates symlinks for configuration files
6. **macos.sh** - Applies macOS system preferences

### Individual Setup

You can also run individual setup scripts using the Makefile:

```bash
make brew      # Install Homebrew packages only
make npm       # Install npm packages only
make ohmyzsh   # Set up Oh My Zsh only
make link      # Create symlinks only
make macos     # Apply macOS settings only
```

Or run scripts directly:

```bash
./scripts/bun.sh  # Install bun only
```

## Post-Setup

### Google Cloud SDK

```bash
gcloud init
gcloud auth application-default login
```

## Notes

- These dotfiles are designed for macOS
- Existing configuration files may be overwritten (symlinks are created)
- It's recommended to back up important config files before running setup
