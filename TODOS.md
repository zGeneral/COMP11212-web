# TODOs — v1.5 and beyond

Items deferred from v1 with explicit reasoning. Sourced from the design doc's "NOT in scope" table. Each is a complete-enough capture that future-you can pick it up cold.

---

## v1.5 — fold-in features (cheap, post-v1-ship)

### Big-step + Gödel encode tools

**Why deferred:** Toolbar density and decision load. Each is structurally a "another button + one runPython call + a result panel" — implementation is ~5 lines per tool. Scope was about not overwhelming the v1 UI, not about effort.

**How to start:** Add `bigstep` and `encode` to the `tool` URL param enum. In `engine.js`, add two cases: `tool === 'bigstep'` calls `big_step(_code, dict(_state.to_py()))`; `tool === 'encode'` calls `encode_stmt(parse(_code))` and converts the result to string for display. Add toolbar buttons for both. Render large integers in a `<pre>` block since they're often hundreds of digits.

### Examples gallery sidebar

**Why deferred:** v1 hardcodes 3 buttons in `index.html`. A sidebar with 8-12 curated examples is a static `<ul>` with click handlers. Pure scope discipline.

**How to start:** Author `examples.json` with `{title, description, code, suggested_tool}` entries. Render as a sidebar, hidden in `?embed=1` mode. Each click calls `setEditor(example.code)` and updates the URL. Examples to include: sum, gcd, division, factorial, fibonacci, Collatz, Diophantine search, primality test (sketches from the COMP11212 notebooks).

### Lezer grammar for While syntax

**Why deferred:** v1 uses generic monospace. Lezer is a 1-evening lift but not load-bearing.

**How to start:** Look at `@codemirror/lang-python` or `@lezer/python` as a template. Map While tokens (`:=`, `<=`, `&`, `!`, `tt`, `ff`, `while`, `do`, `if`, `then`, `else`, `skip`) to syntax classes. Add a `language` extension to the CodeMirror setup in `editor.js`.

### AST-validate Hoare assertions

**Why deferred:** v1's restricted-eval mitigates accidental misuse but not adversarial assertions (Python sandbox escape is a known footgun). Threat model in the design accepts this for v1 because the origin holds nothing worth stealing.

**How to start:** Before passing `_pre` and `_post` to `eval`, parse them with Python's `ast` module and walk the tree. Allow only: Name (identifier load), Constant (numeric/bool literal), BinOp (with op in `{+, -, *, /, //, %}`), Compare (with op in `{==, !=, <, <=, >, >=}`), BoolOp (with op in `{and, or}`), UnaryOp (with op in `{not, -}`). Reject Call, Attribute, Subscript, Lambda, anything else. Render rejected assertions as a syntax error rather than letting the eval try.

### Pyodide in Web Worker

**Why deferred:** v1 mitigates main-thread blocking by reducing Hoare samples from 40 to 10 (~1s freeze max). Worker isolation is the right architectural answer; v1's mitigation buys us time.

**How to start:** Move `engine.js` into `engine.worker.js`. Use Comlink (or hand-rolled postMessage) for the JS↔worker contract. Update `runTool` to be `runTool(args) → Promise<envelope>` that sends a message and awaits the reply. Worker must include `<script src="/static/pyodide/pyodide.js">` in its own scope; loadPyodide works in workers as of v0.27. Bring Hoare samples back to 40 once worker is in place.

### Service worker offline mode

**Why deferred:** Browser HTTP cache is sufficient for v1; SW caching adds a maintenance burden and can serve stale code if the cache strategy is wrong.

**How to start:** Use Workbox or hand-roll. Cache `/static/pyodide/*` with `cacheFirst` strategy (immutable). Cache `/index.html`, `/main.js`, `/engine.js` with `staleWhileRevalidate`. Skip the share button output (the URL is the cache key — no caching needed at the SW layer).

### Mobile responsive layout

**Why deferred:** Phones will open shared URLs (because chats are read on phones). v1 won't be optimised but won't be broken. Real work to do this properly: stack the editor and result pane vertically on narrow screens, switch the toolbar to a hamburger or bottom-bar.

**How to start:** Add `@media (max-width: 600px)` blocks to `main.css`. Switch the layout from a 2-column flexbox to a stacked column. Make the toolbar a sticky bottom bar on mobile. Add `<meta name="viewport" content="width=device-width, initial-scale=1">` to `index.html` (do this in v1 actually — it's already there, just one tag).

### Dark mode

**Why deferred:** Cosmetic. CSS variables now would cost hours; `prefers-color-scheme` is a v1.5 wash.

**How to start:** Define color tokens in `:root` of `main.css` (e.g., `--bg: #fff; --fg: #111; --accent: #0a4`). Override under `@media (prefers-color-scheme: dark)`. Optional manual toggle in v2.

### Plausible analytics

**Why deferred:** Requires CSP relaxation (`script-src` and `connect-src` need the Plausible host). v1 keeps CSP locked; this is the only interesting v1.5 dependency that touches security headers.

**How to start:** Spin up a Plausible instance on the same VPS (under `analytics.hassiba.cc` perhaps). Add `<script defer data-domain="while.hassiba.cc" src="https://analytics.hassiba.cc/js/script.js">` to `index.html`. Update `nginx.conf` CSP to allow the Plausible origin. Verify in the Plausible dashboard.

### Short-ID permalinks

**Why deferred:** Requires a backend store. v1 is fully static.

**How to start:** Smallest possible backend: a tiny FastAPI service on the VPS, behind Traefik on `api.while.hassiba.cc`. POST `/p` with the lz-string code returns `/p/abc123`. GET `/p/abc123` redirects to the long-fragment URL. Store mappings in SQLite. Add a "Short URL" affordance next to the share button.

### GitHub Actions auto-deploy

**Why deferred:** v1 manual deploy is intentional for the first ~2 weeks. Trigger to automate is calendar-based (2 weeks between deploys).

**How to start:** GitHub Actions workflow that builds the Docker image, pushes to GHCR (`ghcr.io/zgeneral/while-playground:<sha>`), then SSHs to the VPS and runs `docker compose pull && docker compose up -d`. Use deploy keys, not user credentials. Manual deploy stays as a fallback for breakage.

---

## v3+ — bigger ideas worth keeping alive

### Diff-trace mode

**Why deferred:** The subagent's standalone idea. Paste two programs side-by-side, see how their traces diverge step by step. The thing tutors do on whiteboards. v1's trace renderer is designed-for: rendering one trace is a function; rendering two is the same function twice plus a divergence-row finder.

**How to start:** Add a second editor pane (`?diff=1` or a layout toggle). Both editors share the same initial-state input. Run both programs; render the two traces side-by-side; highlight the row index where they first diverge. Genuinely novel for undergraduate operational-semantics tooling.

### Live lecture mode (presenter mode)

**Why deferred:** Premise 2 discipline. v1 cuts this strictly. Subagent argued it's "one CSS file + one keystroke handler"; user kept it cut.

**How to start:** When ready: `?presenter=1` enables a CSS file that bumps font sizes 2x, hides the URL bar visualisation, makes the trace pane scroll instead of paginate, and adds a Space/Right-Arrow keyboard handler that advances `trace()` one step at a time (using `step_iter` instead of `trace`). Multiplayer-sync (multiple students seeing the same trace from a lecturer's URL) is v3+, requires backend.

### Semantics golf / leaderboard

**Why deferred:** Growth lever once engine is live; not v1. Subagent's wilder idea: daily puzzle ("write the shortest While program whose trace has exactly 17 steps and ends with σ(x)=42"), with a leaderboard.

**How to start:** Author a few hand-curated puzzles. Add a `?puzzle=N` URL mode that locks the editor's expected output and challenges the user to match it. Score by source code length. Leaderboard requires backend (SQLite is fine).

---

## v1 critical-gap bookmark

### Pyodide version-drift sentinel

**Why bookmarked:** From the eng-review, this is a critical gap deferred to v1.5. A future Pyodide upgrade could silently break the engine.

**How to start:** Add `npm run validate-engine` that runs the spike inside a headless browser via Playwright. CI runs it on a schedule (weekly). If it fails, alerts (email or GitHub issue) so the version bump is a deliberate change, not a silent breakage.
