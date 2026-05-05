# DEPLOY.md — running while.hassiba.cc with Docker

This guide covers three things, in increasing order of effort:

1. **Local quick-test** — try the production build on your laptop with a single command. No DNS, no TLS, no Traefik.
2. **Production deploy on a VPS** — the way `while.hassiba.cc` is actually run: Docker + Traefik + Let's Encrypt.
3. **Day-2 operations** — updates, rollbacks, troubleshooting.

If you don't have Docker installed: [get Docker](https://docs.docker.com/get-docker/) first.
On a VPS, `curl -fsSL https://get.docker.com | sh` is the one-line install.

---

## 1. Local quick-test (5 minutes)

Builds the production image (downloads Pyodide ~50 MB, runs `npm ci` + the editor bundler) and exposes it at `http://localhost:8080`. Use this to confirm the full build works on your machine before you deploy anywhere.

```bash
git clone https://github.com/zGeneral/COMP11212-web.git
cd COMP11212-web

# Build + start.
make local-up
# (or: docker compose -f docker-compose.local.yml up -d --build)

# Open it.
open http://localhost:8080      # macOS
xdg-open http://localhost:8080  # Linux
start http://localhost:8080     # Windows

# Smoke-check that all assets serve.
make local-verify

# Tail logs.
make local-logs

# Stop.
make local-down
```

The first build takes ~3-5 minutes (Pyodide download + `npm ci` cold). Subsequent builds are seconds (Docker layer cache).

The image:
- `nginx:alpine` (~10 MB) + the SPA files (~1 MB)
- Self-hosted Pyodide bundle (~250 MB extracted, ~50 MB compressed in image layers)
- The CodeMirror editor bundle (~291 KB)
- The vendored `lark` wheel (~113 KB)
- `while_lang.py` (~43 KB)

Total image size: roughly **300 MB**.

---

## 2. Production deploy on a VPS

This is how `while.hassiba.cc` is actually served. Prereqs:

- A VPS you control with Docker + Docker Compose
- Traefik already running on the VPS with:
  - An external Docker network named `traefik`
  - A Let's Encrypt cert resolver named `letsencrypt`
- A domain name with DNS pointed at the VPS

If you don't already run Traefik, see [Traefik's getting-started guide](https://doc.traefik.io/traefik/getting-started/install-traefik/). The production `docker-compose.yml` in this repo expects Traefik on the host; without it, use the local compose instead (it exposes port 80 directly).

### 2.1 — DNS

Point your hostname (e.g. `while.hassiba.cc`) at your VPS's public IP via an `A` record. Verify:

```bash
dig +short while.hassiba.cc
# expect: <your VPS IP>
```

If you also want `www` to redirect to the apex, add an `A` record for `www.while.hassiba.cc` too — the production compose already includes a Traefik redirect middleware for it.

### 2.2 — Hostname

The repo's production `docker-compose.yml` is hardcoded for `while.hassiba.cc`. If you're deploying to your own domain, change two lines in `docker-compose.yml`:

```yaml
- "traefik.http.routers.while.rule=Host(`while.your-domain.tld`)"
# ...
- "traefik.http.routers.while-www.rule=Host(`www.while.your-domain.tld`)"
```

### 2.3 — Build and run

```bash
ssh user@your-vps
git clone https://github.com/zGeneral/COMP11212-web.git
cd COMP11212-web

# Build the image with the current git SHA as the image tag.
make build

# Start (or replace) the running container.
make up

# Verify.
make verify
make logs

# Open https://while.hassiba.cc — Traefik provisions the LE cert on first hit.
```

The first request after `make up` may take 5-10 seconds while Let's Encrypt issues the certificate. Subsequent requests are instant.

### 2.4 — Updates

```bash
ssh user@your-vps
cd COMP11212-web
git pull
make up    # rebuilds with the new SHA, replaces the container
make verify
```

The previous image stays in `docker images` for instant rollback.

---

## 3. Day-2 operations

### 3.1 — Rollback

```bash
make rollback           # lists previous SHA-tagged images
GIT_SHA=<prev-sha> docker compose up -d
```

The `image:` line in `docker-compose.yml` reads `${GIT_SHA:-dev}`, so changing the env var swaps the running image without retagging. Reverts in <30 seconds.

### 3.2 — Health check

The container exposes `/healthz` returning `200 ok`. Docker's healthcheck hits this every 30 seconds. To probe manually:

```bash
docker exec while-playground wget -q -O- http://localhost/healthz
# ok
```

`make verify` runs the full smoke-check battery (`/`, `/healthz`, `/static/while_lang.py`, `/static/editor-bundle.js`, `/static/pyodide/pyodide.js`).

### 3.3 — Logs

```bash
make logs                          # tail
docker compose logs --since 1h     # last hour
docker compose logs --tail 200     # last 200 lines
```

The container is just nginx, so logs are nginx access + error logs.

### 3.4 — Disk usage

```bash
docker images --filter=reference='while-playground'
# while-playground:abc1234   3 days ago    ~300 MB
# while-playground:def5678   1 week ago    ~300 MB
```

Old images take disk. To prune anything older than the current + previous SHA:

```bash
docker image prune -a --filter "until=168h"   # >7 days old
```

### 3.5 — Troubleshooting

#### Container starts but the page is blank / engine fails to load

The most common cause is missing `Cross-Origin-Embedder-Policy: require-corp` headers, which Pyodide needs for `SharedArrayBuffer`. Verify:

```bash
curl -I https://while.hassiba.cc | grep -iE 'cross-origin'
# Cross-Origin-Embedder-Policy: require-corp
# Cross-Origin-Opener-Policy: same-origin
```

If the headers are missing, Traefik may be stripping them. Some Traefik configurations strip `Cross-Origin-*` by default; ensure no middleware is sanitising them.

#### `make verify` fails on `/static/pyodide/pyodide.js`

The Pyodide download in the build stage may have failed (network glitch, GitHub rate limit). Rebuild:

```bash
docker compose build --no-cache while-playground
```

#### Let's Encrypt cert won't issue

- DNS hasn't propagated yet (`dig +short` returns nothing or the wrong IP)
- LE rate limit (5 failed attempts per host per hour). Wait an hour or use the staging server temporarily
- Port 80 isn't reachable from the public internet (firewall, security group)

#### `npm ci` fails in the editor-build stage

Stale `package-lock.json`. Regenerate locally with `rm package-lock.json && npm install`, commit, redeploy.

### 3.6 — Watching the live container

```bash
docker stats while-playground   # CPU + memory in real time
docker exec -it while-playground sh    # shell into the container
```

---

## 4. Building without Docker (rare)

If you're forced to build without Docker (e.g., shared hosting that only serves static files), you can do it by hand:

```bash
# 1. Download Pyodide.
curl -fsSL https://github.com/pyodide/pyodide/releases/download/0.27.0/pyodide-0.27.0.tar.bz2 \
  | tar -xj -C static/
mv static/pyodide static/pyodide.tmp
mv static/pyodide.tmp static/pyodide   # remove if your tar already names it pyodide/

# 2. Build the editor bundle.
npm install
npm run build:editor

# 3. Vendor the engine (only if you don't already have static/while_lang.py).
npm run sync-engine

# 4. Serve the static directory with any static-file server that sets the
#    correct CSP / COOP / COEP / CORP headers. nginx config in nginx.conf is
#    a working reference.
```

---

## 5. Image-size budget

Targets from the design doc:

| Component                     | Budget       | Notes                                           |
|-------------------------------|--------------|-------------------------------------------------|
| Final image (compressed)      | <500 MB      | Currently ~300 MB                               |
| User first-load (gzipped)     | <10 MB       | Pyodide + lark + while_lang.py + editor bundle  |
| Cold-load engine ready        | 5-15 s       | Pyodide bootstrap + lark install + engine exec  |
| Warm-load engine ready        | <2 s         | Browser cache hits                              |
| Per-tool runtime after warm   | <100 ms      | Single trace / count / verify call              |

If the image grows past 500 MB, check what's been added to `/static/pyodide/` (a Pyodide release tarball can ship optional packages we don't need). The `Stage 1` Dockerfile step downloads the full distribution; if you want to slim it, post-process `/pyodide-bundle/` to remove unused `*.whl` files from `pyodide-lock.json`'s package list.

---

## 6. What's NOT covered yet (TODO)

Tracked in `TODOS.md`:

- **GitHub Actions auto-deploy** — currently manual SSH + `make up`. Will add when the deploy ritual feels boring.
- **Plausible analytics** — needs CSP relaxation; v1.5 work.
- **Service worker for offline** — browser HTTP cache is sufficient for v1.
- **Pyodide version-drift sentinel** — a scheduled CI job that re-runs the engine spike inside a headless browser to catch silent breakage on Pyodide upgrades.

---

## License & attribution

See [`LICENSE`](LICENSE) (MIT) and [`NOTICE`](NOTICE) (UoM attribution + non-affiliation).
