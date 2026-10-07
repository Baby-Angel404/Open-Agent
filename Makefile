.PHONY: all install build test typecheck lint format format-check clean

all: install build test

install:
	npm install

build:
	npm run build

test:
	npm run test

typecheck:
	npm run typecheck

lint:
	npm run lint

format:
	npm run format

format-check:
	npm run format:check

clean:
	rm -rf packages/core/dist apps/cli/dist .audit-logs/
