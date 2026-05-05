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

// ─────────────────────────────────────────────────────────────────────────────
// Trace tokenizer — paints a formal trace line into syntax-highlighted spans.
//
// Trace shape (from while_lang.py's _render_formal):
//
//   Where:
//     L1 := while i ≤ n do (...)
//
//   ⟨S, σ⟩
//     ⇒  ⟨S', σ'⟩    [rule]
//     ⇒  ⟨S'', σ''⟩    [rule]
//
// Strategy: per-line classifier (legend / config / transition / blank), then
// inside any While-source or σ-state region, run a small token regex.

const KEYWORDS = new Set([
  'while', 'do', 'if', 'then', 'else', 'skip',
]);
const ATOMS = new Set(['tt', 'ff']);

// Token regex: alternation of patterns. Order matters.
//   1. unicode operators (≤ ¬ ∧ ↦ ×) and ASCII ops (:= = + − -)
//   2. keywords / atoms
//   3. numbers
//   4. variable names
//   5. punctuation
//   6. anything else (fallback)
const TOKEN_RE = new RegExp(
  '(' +
    [
      ':=',
      '↦',
      '≤',
      '¬',
      '∧',
      '⇒',
      '×',
      '−',
      '[+\\-*/=]',
      '\\b(?:while|do|if|then|else|skip|tt|ff)\\b',
      '\\d+',
      '[A-Za-z_][A-Za-z0-9_]*',
      '[\\[\\]()\\{\\},;]',
      '\\s+',
      '.',
    ].join('|') +
  ')',
  'g'
);

function classifyToken(tok) {
  if (!tok) return null;
  if (/^\s+$/.test(tok)) return null;                            // whitespace
  if (KEYWORDS.has(tok)) return 'tw-kw';
  if (ATOMS.has(tok)) return 'tw-atom';
  if (/^\d+$/.test(tok)) return 'tw-num';
  if (tok === ':=' || tok === '↦' || tok === '⇒') return 'tw-arrow';
  if (tok === '≤' || tok === '¬' || tok === '∧' || tok === '×' ||
      tok === '−' || /^[+\-*/=]$/.test(tok)) return 'tw-op';
  if (tok === '⟨' || tok === '⟩') return 'tw-bracket';
  if (tok === '{' || tok === '}') return 'tw-state-brace';
  if (tok === '(' || tok === ')' || tok === '[' || tok === ']') return 'tw-paren';
  if (tok === ',' || tok === ';') return 'tw-punct';
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) return 'tw-var';
  return null;
}

// Highlight a generic snippet of While source / σ-state text.
function paintTokens(text) {
  if (!text) return '';
  let out = '';
  // Custom ⟨ ⟩ handling because they're outside the regex.
  // We'll iterate char-by-char for ⟨ and ⟩ but otherwise let the regex run.
  // Simpler: pre-replace ⟨ and ⟩ so they fall through to the fallback case.
  // Actually we add them to the regex as a single-char alternative below.
  text.replace(/⟨|⟩|./gsu, (chunk) => {
    if (chunk === '⟨' || chunk === '⟩') {
      out += `<span class="tw-bracket">${chunk}</span>`;
      return '';
    }
    return '';
  });
  // The above doesn't actually do what we need. Let's run the proper regex:
  out = '';
  TOKEN_RE.lastIndex = 0;
  let last = 0;
  // Custom split: walk char by char to extract ⟨/⟩, then run regex on rest.
  const parts = [];
  let buf = '';
  for (const ch of text) {
    if (ch === '⟨' || ch === '⟩') {
      if (buf) { parts.push({ kind: 'span', text: buf }); buf = ''; }
      parts.push({ kind: 'bracket', text: ch });
    } else {
      buf += ch;
    }
  }
  if (buf) parts.push({ kind: 'span', text: buf });

  for (const p of parts) {
    if (p.kind === 'bracket') {
      out += `<span class="tw-bracket">${p.text}</span>`;
      continue;
    }
    TOKEN_RE.lastIndex = 0;
    let m;
    let cursor = 0;
    while ((m = TOKEN_RE.exec(p.text)) !== null) {
      // emit gap (none expected since regex covers everything, but defensive)
      if (m.index > cursor) {
        out += escapeHtml(p.text.slice(cursor, m.index));
      }
      const tok = m[0];
      const cls = classifyToken(tok);
      if (cls) {
        out += `<span class="${cls}">${escapeHtml(tok)}</span>`;
      } else {
        out += escapeHtml(tok);
      }
      cursor = m.index + tok.length;
    }
    if (cursor < p.text.length) {
      out += escapeHtml(p.text.slice(cursor));
    }
  }
  return out;
}

// Highlight a single trace line, distinguishing the rule-label suffix.
function paintLine(line) {
  // Match optional "  ⇒  " prefix and trailing "    [rule]"
  // and paint rule labels distinctly.
  const ruleMatch = line.match(/^(.*?)(\s+\[([^\]]+)\])\s*$/);
  if (ruleMatch) {
    const body = paintTokens(ruleMatch[1]);
    const ruleName = escapeHtml(ruleMatch[3]);
    return `${body}<span class="tw-rule">  [<span class="tw-rule-name">${ruleName}</span>]</span>`;
  }
  return paintTokens(line);
}

// Given the full multi-line trace string, classify each line and emit HTML.
function paintTrace(text) {
  const lines = String(text).split('\n');
  const out = [];
  let inLegend = false;
  for (const line of lines) {
    if (line === 'Where:') {
      inLegend = true;
      out.push(`<span class="tw-legend-header">${escapeHtml(line)}</span>`);
      continue;
    }
    if (line.trim() === '' && inLegend) {
      inLegend = false;
      out.push('');
      continue;
    }
    if (inLegend) {
      // legend lines look like:  L1 := while i ≤ n do (...)
      out.push(`<span class="tw-legend">${paintTokens(line)}</span>`);
      continue;
    }
    if (line.trim() === '') { out.push(''); continue; }
    out.push(paintLine(line));
  }
  return out.join('\n');
}

function getPane() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('result-pane');
}

export function showLoading(tool) {
  const pane = getPane();
  if (!pane) return;
  const labels = { trace: 'Tracing', table: 'Building table', count: 'Counting steps', hoare: 'Verifying' };
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

// ─────────────────────────────────────────────────────────────────────────────
// Table view — parse the engine's text output into a real HTML <table> and
// highlight cells where the value changed from the previous row.
//
// Engine output shape (one trailing newline ignored):
//   step | rule    | x  | y
//   -----+---------+----+----
//   0    | start   | 0  | 0
//   1    | :=      | 5  | 0
//   ...
// ─────────────────────────────────────────────────────────────────────────────

function parseTableText(text) {
  const lines = String(text).split('\n').filter((l) => l.length > 0);
  if (lines.length < 3) return null;
  // First line is header; second line is separator; rest are data rows.
  const splitRow = (line) => line.split('|').map((c) => c.trim());
  const header = splitRow(lines[0]);
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('...')) {
      rows.push({ truncated: line });
      continue;
    }
    if (line.includes('---')) continue;   // skip extra separators if any
    const cells = splitRow(line);
    if (cells.length === header.length) rows.push({ cells });
  }
  return { header, rows };
}

function renderTableHtml(text) {
  const parsed = parseTableText(text);
  if (!parsed) {
    return `<pre class="trace">${escapeHtml(text)}</pre>`;
  }
  const { header, rows } = parsed;
  let html = '<table class="trace-table"><thead><tr>';
  for (const h of header) {
    html += `<th>${escapeHtml(h)}</th>`;
  }
  html += '</tr></thead><tbody>';
  let prev = null;
  for (const row of rows) {
    if (row.truncated) {
      html += `<tr class="truncated"><td colspan="${header.length}">${escapeHtml(row.truncated)}</td></tr>`;
      continue;
    }
    const cells = row.cells;
    html += '<tr>';
    for (let i = 0; i < cells.length; i++) {
      const value = cells[i];
      const colName = header[i];
      // step + rule columns are metadata; never highlight as a value-change.
      const isMeta = colName === 'step' || colName === 'rule';
      const changed = !isMeta && prev && prev[i] !== undefined && prev[i] !== value;
      const cls = isMeta
        ? `tt-${escapeHtml(colName)}`
        : 'tt-val' + (changed ? ' tt-changed' : '');
      html += `<td class="${cls}">${escapeHtml(value)}</td>`;
    }
    html += '</tr>';
    prev = cells;
  }
  html += '</tbody></table>';
  return html;
}

function renderTrace(text) {
  // Used by the table tool — wraps the table HTML in a scroll container.
  return `<div class="trace-table-wrap">${renderTableHtml(text)}</div>`;
}

function renderTraceText(text) {
  const lines = String(text).split('\n');
  if (lines.length <= DISPLAY_CAP) {
    return `<pre class="trace">${paintTrace(text)}</pre>`;
  }
  const head = lines.slice(0, DISPLAY_CAP).join('\n');
  const total = lines.length;
  return (
    `<pre class="trace">${paintTrace(head)}</pre>` +
    `<details class="show-all"><summary>Show all ${total} lines</summary>` +
    `<pre class="trace full">${paintTrace(text)}</pre></details>`
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
  } else if (tool === 'table') {
    pane.innerHTML = renderTrace(envelope.value);
  } else if (tool === 'count') {
    pane.innerHTML = renderCount(envelope.value);
  } else if (tool === 'hoare') {
    pane.innerHTML = renderHoare(envelope.value);
  } else {
    pane.innerHTML = `<pre>${escapeHtml(JSON.stringify(envelope.value, null, 2))}</pre>`;
  }
}

// Exposed for unit testing
export const _internal = { renderTraceText, renderCount, renderHoare, renderError, escapeHtml, paintTrace, paintTokens, paintLine, parseTableText, renderTableHtml };
