# Makefile — ergonomic shortcuts for build / up / down / logs / rollback.
#
# Production targets (build & deploy with git-SHA tags, used on the VPS):
#   make build         build the production image, tagged with the current git SHA
#   make up            start (or replace) the production container with the current SHA
#   make down          stop and remove the production container
#   make logs          tail production logs
#   make ps            show production container status
#   make verify        smoke-check the running production container
#   make rollback      roll back to the previous git-SHA tag (tab-complete the SHA)
#
# Local targets (a docker-compose.local.yml that exposes :8080 with no Traefik):
#   make local-build   build the local image (tagged :local)
#   make local-up      start the local container
#   make local-down    stop the local container
#   make local-logs    tail local logs
#   make local-verify  smoke-check the local container at :8080
#
# Maintenance:
#   make sync-engine   re-vendor static/while_lang.py from the notebooks repo
#   make build-editor  rebuild static/editor-bundle.js (CodeMirror)
#   make test          run Vitest unit tests
#   make help          show this help

GIT_SHA := $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
COMPOSE := docker compose
COMPOSE_LOCAL := docker compose -f docker-compose.local.yml

.DEFAULT_GOAL := help

# ─── Production (Traefik + Let's Encrypt) ─────────────────────────────────

.PHONY: build
build:
	@echo "Building while-playground:$(GIT_SHA)"
	GIT_SHA=$(GIT_SHA) $(COMPOSE) build

.PHONY: up
up: build
	@echo "Starting while-playground:$(GIT_SHA)"
	GIT_SHA=$(GIT_SHA) $(COMPOSE) up -d

.PHONY: down
down:
	GIT_SHA=$(GIT_SHA) $(COMPOSE) down

.PHONY: logs
logs:
	GIT_SHA=$(GIT_SHA) $(COMPOSE) logs -f

.PHONY: ps
ps:
	GIT_SHA=$(GIT_SHA) $(COMPOSE) ps

.PHONY: verify
verify:
	@echo "Hitting / and /healthz on the production container…"
	@docker exec while-playground wget -q -O- http://localhost/healthz && echo "  /healthz: OK"
	@docker exec while-playground wget -q -O- http://localhost/ > /dev/null && echo "  /:        OK"
	@docker exec while-playground wget -q -O- http://localhost/static/while_lang.py > /dev/null && echo "  /static/while_lang.py: OK"
	@docker exec while-playground wget -q -O- http://localhost/static/editor-bundle.js > /dev/null && echo "  /static/editor-bundle.js: OK"
	@docker exec while-playground wget -q -O- http://localhost/static/pyodide/pyodide.js > /dev/null && echo "  /static/pyodide/pyodide.js: OK"

.PHONY: rollback
rollback:
	@echo "Available SHA-tagged images on this host:"
	@docker images --filter=reference='while-playground' --format '  {{.Repository}}:{{.Tag}}  ({{.CreatedSince}}, {{.Size}})'
	@echo ""
	@echo "Roll back with:  GIT_SHA=<sha> $(COMPOSE) up -d"

# ─── Local quick-test (no Traefik, exposes :8080) ─────────────────────────

.PHONY: local-build
local-build:
	$(COMPOSE_LOCAL) build

.PHONY: local-up
local-up: local-build
	$(COMPOSE_LOCAL) up -d
	@echo ""
	@echo "Open http://localhost:8080 to test."

.PHONY: local-down
local-down:
	$(COMPOSE_LOCAL) down

.PHONY: local-logs
local-logs:
	$(COMPOSE_LOCAL) logs -f

.PHONY: local-verify
local-verify:
	@echo "Smoke-checking http://localhost:8080…"
	@curl -fsS http://localhost:8080/healthz && echo "  /healthz: OK"
	@curl -fsS -o /dev/null -w "  /: HTTP %{http_code} (%{size_download} bytes)\n" http://localhost:8080/
	@curl -fsS -o /dev/null -w "  /static/editor-bundle.js: HTTP %{http_code} (%{size_download} bytes)\n" http://localhost:8080/static/editor-bundle.js
	@curl -fsS -o /dev/null -w "  /static/while_lang.py: HTTP %{http_code} (%{size_download} bytes)\n" http://localhost:8080/static/while_lang.py
	@curl -fsS -o /dev/null -w "  /static/pyodide/pyodide.js: HTTP %{http_code} (%{size_download} bytes)\n" http://localhost:8080/static/pyodide/pyodide.js

# ─── Maintenance ──────────────────────────────────────────────────────────

.PHONY: sync-engine
sync-engine:
	npm run sync-engine

.PHONY: build-editor
build-editor:
	npm run build:editor

.PHONY: test
test:
	npm test

.PHONY: install
install:
	npm install

# ─── Help ────────────────────────────────────────────────────────────────

.PHONY: help
help:
	@echo ""
	@echo "while-playground — Make targets"
	@echo ""
	@echo "Production (Traefik + Let's Encrypt; deploy on a server with the 'traefik' network):"
	@echo "  make build         build with current git SHA ($(GIT_SHA))"
	@echo "  make up            start / replace running container"
	@echo "  make down          stop container"
	@echo "  make logs          tail logs"
	@echo "  make ps            show container status"
	@echo "  make verify        smoke-check the running container"
	@echo "  make rollback      list SHA-tagged images so you can pick one"
	@echo ""
	@echo "Local quick-test (exposes :8080, no Traefik needed):"
	@echo "  make local-up      build + start at http://localhost:8080"
	@echo "  make local-down    stop"
	@echo "  make local-logs    tail logs"
	@echo "  make local-verify  smoke-check :8080"
	@echo ""
	@echo "Maintenance:"
	@echo "  make sync-engine   re-vendor static/while_lang.py"
	@echo "  make build-editor  rebuild static/editor-bundle.js"
	@echo "  make test          run Vitest"
	@echo "  make install       npm install"
	@echo ""
	@echo "Current git SHA:    $(GIT_SHA)"
