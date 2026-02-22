.SHELLFLAGS := -eu -o pipefail -c

.PHONY: install dev open-local lint test build ci

install:
	npm ci

dev:
	npm run dev

open-local:
	bash ./tools/open_local.sh

lint:
	npm run lint

test:
	npm run test

build:
	npm run build

ci: install lint test build
