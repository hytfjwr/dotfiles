.PHONY: all brew npm claude ohmyzsh link macos format lint mise statusline

all:
	./setup.sh

brew:
	./scripts/brew.sh

npm:
	./scripts/npm.sh

claude:
	./scripts/claude.sh

ohmyzsh:
	./scripts/ohmyzsh.sh

link:
	./scripts/link.sh

macos:
	./scripts/macos.sh

mise:
	./scripts/mise.sh

statusline:
	cd claude/statusline && cargo build --release

format:
	stylua .

lint:
	stylua --check .
	cd scripts && shellcheck -x *.sh lib/*.sh ../setup.sh
	shellcheck local_bin/aerospace-fix-windows
	shellcheck local_bin/awake
