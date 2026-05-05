# while.hassiba.cc

A formal-semantics playground for the **While** language from Manchester COMP11212 (Fundamentals of Computation, Part 2).

> **Unofficial student companion.** Built by Kamal Hassiba, a first-year UoM CS student. Not affiliated with, endorsed by, or maintained by the University of Manchester or the COMP11212 course staff.

## What it does

Paste a While program. See its formal small-step trace render in your browser.
Get a step count. Verify a Hoare triple `{P} S {Q}` against random sample states.
Copy a URL. Send it to a friend. They open it. Same playground state.

```
sum_prog = '''
    result := 0;
    i := 1;
    while i <= n do (
        result := result + i;
        i := i + 1
    )
'''
```

becomes a live, sharable formal trace in the browser.

## How it runs

The whole engine (`while_lang.py`, the [companion notebooks](https://github.com/zGeneral/COMP11212) repo's interpreter) runs in your browser via [Pyodide](https://pyodide.org/). Zero install. Zero hosting cost. Static SPA served from a single `nginx:alpine` Docker container behind Traefik.

## Local development

```bash
# install dev deps (Vitest + Playwright)
npm install

# unit tests (parseUrl, serialiseUrl)
npm test

# E2E tests (Playwright; requires Docker for Pyodide bundle)
npm run test:e2e

# serve locally for manual testing (uses Pyodide CDN as a dev shim)
npm run dev
```

## Production deploy

Self-hosted on Kamal's VPS. Pure Docker + Traefik:

```bash
GIT_SHA=$(git rev-parse --short HEAD) docker compose build
GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d
```

The Dockerfile downloads the pinned Pyodide bundle at build time, so the user's browser fetches everything from `while.hassiba.cc` (no third-party CDN at runtime).

## URL schema

```
https://while.hassiba.cc/[?tool=trace|hoare|count][&state=...][&samples=...][&pre=...&post=...][&embed=1]#code=<lz-string-compressed-While-source>
```

- `code` lives in the **fragment** (not sent to server logs). Falls back to `?code=` if the fragment is stripped by a chat client.
- `tool` = `trace` (default) | `hoare` | `count`.
- `state` = JSON initial machine state, e.g. `{"n":10}`.
- `samples` = JSON sample-state schema for Hoare, e.g. `{"n":[0,30]}`.
- `pre`, `post` = ASCII assertions for `tool=hoare`.
- `embed=1` = hide chrome; just editor + result pane (for iframes).

## Status

v1 in active development. Track v1.5+ work in [TODOS.md](TODOS.md).
Design doc lives at `~/.gstack/projects/COMP11212/kamal-master-design-20260505-111355.md`.

## License

MIT. See [LICENSE](LICENSE).
