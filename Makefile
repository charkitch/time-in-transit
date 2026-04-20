.DEFAULT_GOAL := help

IMAGE_NAME ?= time-in-transit
CONTAINER_NAME ?= time-in-transit-app
PORT ?= 5173

.PHONY: help setup install hooks-install hooks-run lint lint-ts lint-rust format-rust \
	wasm-build wasm-build-dev dev build preview test-e2e test-e2e-headed test-e2e-ui \
	playwright-install audit audit-prod clean-node docker-build docker-run docker-stop \
	docker-rm docker-logs docker-compose-up docker-compose-down docker-compose-logs

help: ## Show all available targets
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*## "}; /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST) | sort

setup: install hooks-install ## Install npm deps and git hooks

install: ## Install npm dependencies
	npm install

hooks-install: ## Install Lefthook git hooks
	npm run prepare

hooks-run: ## Run pre-commit hooks manually
	npx lefthook run pre-commit

lint: ## Run TS + Rust lint
	npm run lint

lint-ts: ## Run TypeScript lint
	npm run lint:ts

lint-rust: ## Run Rust fmt check + clippy
	npm run lint:rust

format-rust: ## Format Rust code
	cargo fmt --manifest-path engine/Cargo.toml --all

wasm-build: ## Build Rust WASM (release)
	npm run wasm:build

wasm-build-dev: ## Build Rust WASM (dev feature set)
	npm run wasm:build:dev

dev: ## Start Vite dev server
	npm run dev

build: ## Build app for production
	npm run build

preview: ## Preview production build
	npm run preview

playwright-install: ## Install Playwright Chromium
	npx playwright install chromium

test-e2e: ## Run headless E2E tests
	npm run test:e2e

test-e2e-headed: ## Run headed E2E tests
	npm run test:e2e:headed

test-e2e-ui: ## Open Playwright UI
	npm run test:e2e:ui

audit: ## Audit all dependencies
	npm audit

audit-prod: ## Audit production dependencies only
	npm audit --omit=dev

clean-node: ## Remove node_modules and reinstall lockfile state
	rm -rf node_modules
	npm ci

docker-build: ## Build Docker image (requires Dockerfile)
	@if [ ! -f Dockerfile ]; then \
		echo "No Dockerfile found at repo root."; \
		exit 1; \
	fi
	docker build -t $(IMAGE_NAME) .

docker-run: ## Run Docker container (requires Docker image)
	docker run --rm -d --name $(CONTAINER_NAME) -p $(PORT):$(PORT) $(IMAGE_NAME)

docker-stop: ## Stop running Docker container
	@if docker ps --format '{{.Names}}' | grep -q '^$(CONTAINER_NAME)$$'; then \
		docker stop $(CONTAINER_NAME); \
	else \
		echo "Container $(CONTAINER_NAME) is not running."; \
	fi

docker-rm: ## Remove Docker container
	@if docker ps -a --format '{{.Names}}' | grep -q '^$(CONTAINER_NAME)$$'; then \
		docker rm -f $(CONTAINER_NAME); \
	else \
		echo "Container $(CONTAINER_NAME) does not exist."; \
	fi

docker-logs: ## Tail Docker container logs
	docker logs -f $(CONTAINER_NAME)

docker-compose-up: ## Start compose stack (requires docker-compose.yml)
	@if [ ! -f docker-compose.yml ] && [ ! -f docker-compose.yaml ]; then \
		echo "No docker-compose.yml or docker-compose.yaml found."; \
		exit 1; \
	fi
	docker compose up -d

docker-compose-down: ## Stop compose stack
	@if [ ! -f docker-compose.yml ] && [ ! -f docker-compose.yaml ]; then \
		echo "No docker-compose.yml or docker-compose.yaml found."; \
		exit 1; \
	fi
	docker compose down

docker-compose-logs: ## Tail compose logs
	@if [ ! -f docker-compose.yml ] && [ ! -f docker-compose.yaml ]; then \
		echo "No docker-compose.yml or docker-compose.yaml found."; \
		exit 1; \
	fi
	docker compose logs -f
