# Optional convenience targets — same as running docker / npm directly.
.PHONY: help install test docker-build docker-up docker-down docker-logs

help:
	@echo "make install     - npm ci"
	@echo "make test        - npm run build"
	@echo "make docker-build - docker compose build"
	@echo "make docker-up   - docker compose up -d --build"
	@echo "make docker-down - docker compose down"
	@echo "make docker-logs - docker compose logs -f actual-helper"
	@echo "See DEPLOY.md for registry image and production notes."

install:
	npm ci

test:
	npm run build

docker-build:
	docker compose build

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f actual-helper
