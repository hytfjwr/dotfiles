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
2. **link.sh** - Creates symlinks for configuration files
3. **mise.sh** - Sets up mise and installs tool versions
4. **npm.sh** - Installs global npm packages
5. **bun.sh** - Installs bun and adds it to PATH in `.zshrc`
6. **ohmyzsh.sh** - Sets up Oh My Zsh with plugins
7. **macos.sh** - Applies macOS system preferences

### Individual Setup

You can also run individual setup scripts using the Makefile:

```bash
make brew      # Install Homebrew packages only
make link      # Create symlinks only
make mise      # Set up mise and install tools
make npm       # Install npm packages only
make ohmyzsh   # Set up Oh My Zsh only
make macos     # Apply macOS settings only
make format    # Format Lua files with StyLua
make lint      # Check Lua formatting
```

Or run scripts directly:

```bash
./scripts/bun.sh  # Install bun only
```

## Version Management with mise

This dotfiles uses [mise](https://mise.jdx.dev/) for managing tool versions.

### Managed Tools

| Tool   | Version |
|--------|---------|
| Node.js | LTS    |
| Python  | 3.12   |
| PHP     | 8.4    |
| Go      | latest |
| Rust    | latest |
| Ruby    | 3.3    |

### Configuration

Global configuration is at `~/.config/mise/config.toml` (symlinked from `mise/config.toml`).

mise respects legacy version files (`.nvmrc`, `.python-version`, etc.) for per-project configuration.

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
