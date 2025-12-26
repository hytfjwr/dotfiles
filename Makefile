.PHONY: all brew npm ohmyzsh link macos format lint mise

all:
	./setup.sh

brew:
	./scripts/brew.sh

npm:
	./scripts/npm.sh

ohmyzsh:
	./scripts/ohmyzsh.sh

link:
	./scripts/link.sh

macos:
	./scripts/macos.sh

mise:
	./scripts/mise.sh

format:
	stylua .

lint:
	stylua --check .
	cd scripts && shellcheck -x *.sh lib/*.sh ../setup.sh
