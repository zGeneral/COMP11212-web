// trace_pane.js — renders the engine's result envelope into the result <pre>.
//
// Contract (called from main.js):
//   renderResult(tool, envelope)
//     envelope = { ok: true, value }
//              | { ok: false, error: { kind, message, traceback? } }

export const DISPLAY_CAP = 100;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPane() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('result-pane');
}

export function showLoading(tool) {
  const pane = getPane();
  if (!pane) return;
  const labels = { trace: 'Tracing', count: 'Counting steps', hoare: 'Verifying' };
  pane.classList.remove('error');
  pane.innerHTML = `<div class="status">${labels[tool] || 'Running'}…</div>`;
}

export function showEngineLoading() {
  const pane = getPane();
  if (!pane) return;
  pane.classList.remove('error');
  pane.innerHTML =
    '<div class="status">Engine loading… (5–15s on first visit; instant after)</div>';
}

function renderTraceText(text) {
  const lines = String(text).split('\n');
  if (lines.length <= DISPLAY_CAP) {
    return `<pre class="trace">${escapeHtml(text)}</pre>`;
  }
  const head = lines.slice(0, DISPLAY_CAP).join('\n');
  const total = lines.length;
  return (
    `<pre class="trace">${escapeHtml(head)}</pre>` +
    `<details class="show-all"><summary>Show all ${total} lines</summary>` +
    `<pre class="trace full">${escapeHtml(text)}</pre></details>`
  );
}

function renderCount(value) {
  const n = (value && typeof value === 'object' ? value.steps : value) ?? '?';
  return `<div class="count-result"><span class="label">Step count</span><span class="number">${escapeHtml(n)}</span></div>`;
}

function renderHoare(value) {
  if (!value || typeof value !== 'object') {
    return `<pre class="hoare">${escapeHtml(JSON.stringify(value))}</pre>`;
  }
  const sampled = value.sampled ?? '?';
  const precondHolds = value.precondition_holds ?? value.precond_holds ?? '?';
  const verified = value.verified ?? '?';
  const failed = Array.isArray(value.failed) ? value.failed.length : value.failed ?? '?';

  let warning = '';
  if (
    typeof precondHolds === 'number' &&
    typeof sampled === 'number' &&
    sampled > 0 &&
    precondHolds === 0
  ) {
    warning =
      `<div class="warn">Your precondition was true on 0 of ${sampled} samples. ` +
      `Check the assertion or widen <code>?samples=</code>.</div>`;
  } else if (
    typeof precondHolds === 'number' &&
    typeof sampled === 'number' &&
    sampled > 0 &&
    precondHolds < sampled / 2
  ) {
    warning =
      `<div class="warn">Precondition was true on only ${precondHolds}/${sampled} samples. ` +
      `Verification is over a thin slice; widen <code>?samples=</code> for stronger evidence.</div>`;
  }

  return (
    `<table class="hoare">` +
    `<tr><th>Sampled</th><td>${escapeHtml(sampled)}</td></tr>` +
    `<tr><th>Precondition held</th><td>${escapeHtml(precondHolds)}</td></tr>` +
    `<tr><th>Verified</th><td>${escapeHtml(verified)}</td></tr>` +
    `<tr><th>Failed</th><td>${escapeHtml(failed)}</td></tr>` +
    `</table>` +
    warning
  );
}

const ERROR_TITLES = {
  load: 'Engine failed to load',
  syntax: 'Parse error',
  budget: 'Step budget exceeded',
  assertion: 'Assertion error',
  unknown: 'Something went wrong',
};

function renderError(error) {
  const kind = error.kind || 'unknown';
  const title = ERROR_TITLES[kind] || ERROR_TITLES.unknown;
  const retryHint =
    kind === 'load'
      ? `<p>Reload the page to retry. If this keeps failing on a slow connection, the Pyodide bundle (~6 MB) hasn't finished downloading yet.</p>`
      : '';
  const friendlyMsg =
    kind === 'budget'
      ? 'The program ran for more than 10 000 steps. Likely non-terminating, or needs more iterations than the playground allows.'
      : escapeHtml(error.message || '');
  const trace =
    error.traceback && error.traceback !== error.message
      ? `<details><summary>Show full traceback</summary><pre>${escapeHtml(error.traceback)}</pre></details>`
      : '';
  return (
    `<div class="error-block kind-${escapeHtml(kind)}">` +
    `<h3>${escapeHtml(title)}</h3>` +
    `<p>${friendlyMsg}</p>` +
    retryHint +
    trace +
    `</div>`
  );
}

export function renderResult(tool, envelope) {
  const pane = getPane();
  if (!pane) return;

  if (!envelope || !envelope.ok) {
    pane.classList.add('error');
    pane.innerHTML = renderError((envelope && envelope.error) || { kind: 'unknown', message: 'no envelope returned' });
    return;
  }

  pane.classList.remove('error');
  if (tool === 'trace') {
    pane.innerHTML = renderTraceText(envelope.value);
  } else if (tool === 'count') {
    pane.innerHTML = renderCount(envelope.value);
  } else if (tool === 'hoare') {
    pane.innerHTML = renderHoare(envelope.value);
  } else {
    pane.innerHTML = `<pre>${escapeHtml(JSON.stringify(envelope.value, null, 2))}</pre>`;
  }
}

// Exposed for unit testing
export const _internal = { renderTraceText, renderCount, renderHoare, renderError, escapeHtml };
