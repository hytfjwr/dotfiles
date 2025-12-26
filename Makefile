.PHONY: all brew npm ohmyzsh link macos format lint

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

format:
	stylua .

lint:
	stylua --check .
