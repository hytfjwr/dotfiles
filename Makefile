.PHONY: all brew npm claude claude-settings ohmyzsh link launchd macos format lint lint-lua lint-shell mise statusline tmux-shim

all:
	./setup.sh

brew:
	./scripts/brew.sh

npm:
	./scripts/npm.sh

claude:
	./scripts/claude.sh

claude-settings:
	./scripts/claude-settings.sh

ohmyzsh:
	./scripts/ohmyzsh.sh

launchd:
	./scripts/launchd.sh

link:
	./scripts/link.sh

macos:
	./scripts/macos.sh

mise:
	./scripts/mise.sh

statusline:
	cd claude/statusline && cargo build --release

tmux-shim:
	cd tools/wezterm-tmux-shim && cargo build --release

format:
	stylua .

lint: lint-lua lint-shell

lint-lua:
	stylua --check .

# Every bash/sh script under these paths, found by shebang (tracked or not yet added).
SHELL_SCRIPT_PATHS = scripts local_bin setup.sh install.sh

lint-shell:
	git ls-files -z --cached --others --exclude-standard -- $(SHELL_SCRIPT_PATHS) \
		| xargs -0 awk 'FNR == 1 { if ($$0 ~ /^#!.*[\/ ](ba)?sh([ \t]|$$)/) print FILENAME; nextfile }' \
		| xargs shellcheck -x
