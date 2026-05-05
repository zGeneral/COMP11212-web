// editor.js — CodeMirror 6 wrapper.
//
// Public API (stable, used by main.js + toolbar.js):
//   setEditor(code)      — replace editor content
//   getEditor()          — read current editor content
//   onChange(fn)         — register a change handler
//   setState(stateObj)   — write the JSON state pane
//   getState()           — parse the JSON state pane
//   getHoareInputs()     — read pre/post/samples
//
// The While editor is a CodeMirror 6 instance loaded from
// static/editor-bundle.js (window.CMEditor). The state JSON pane and the
// Hoare inputs stay as plain <textarea>/<input> elements.

let _view = null;
let _currentTheme = 'two-tone';
const _changeHandlers = [];

function getMount() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('editor-mount');
}

function ensureView(initial = '') {
  if (_view) return _view;
  if (typeof window === 'undefined' || !window.CMEditor) return null;
  const mount = getMount();
  if (!mount) return null;
  _view = window.CMEditor.create(
    mount,
    initial,
    (value) => _changeHandlers.forEach((h) => h(value)),
    _currentTheme
  );
  return _view;
}

export function setEditorTheme(themeName) {
  _currentTheme = themeName;
  if (_view && window.CMEditor && window.CMEditor.setTheme) {
    window.CMEditor.setTheme(_view, themeName);
  }
}

export function setEditor(code) {
  const view = ensureView(code);
  if (!view) return;
  if (window.CMEditor && window.CMEditor.getValue(view) !== (code || '')) {
    window.CMEditor.setValue(view, code || '');
  }
}

export function getEditor() {
  if (!_view) return '';
  return window.CMEditor ? window.CMEditor.getValue(_view) : '';
}

export function onChange(handler) {
  if (typeof handler === 'function') _changeHandlers.push(handler);
}

// Compact JSON formatter for the state + samples textareas.
// Produces single-line objects with arrays inline, e.g.
//   {"m": [0, 50], "n": [1, 10]}
// Default JSON.stringify(obj, null, 2) puts every array element on its own
// line which is ugly for these short schemas.
export function formatJsonCompact(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(formatJsonCompact).join(', ') + ']';
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj)
      .map(([k, v]) => `${JSON.stringify(k)}: ${formatJsonCompact(v)}`);
    return '{' + entries.join(', ') + '}';
  }
  return JSON.stringify(obj);
}

// Browsers since 2024 (Chrome 123+, Firefox 124+, Safari 17.4+) support
// `field-sizing: content` natively — the browser auto-grows the textarea
// to fit its content with zero JS. We rely on that as the primary mechanism.
// `wireAutoSize` is now a JS fallback for any browser that doesn't.
const SUPPORTS_FIELD_SIZING =
  typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content');

function autoSizeFallback(el) {
  if (!el) return;
  // Defer to next paint so scrollHeight reflects the just-set value.
  requestAnimationFrame(() => {
    const prev = el.style.height;
    el.style.height = 'auto';
    const h = el.scrollHeight;
    if (h > 0) el.style.height = h + 'px';
    else el.style.height = prev; // hidden / not yet laid out — leave alone
  });
}

export function wireAutoSize() {
  if (typeof document === 'undefined' || SUPPORTS_FIELD_SIZING) return;
  for (const id of ['state-input', 'hoare-samples']) {
    const el = document.getElementById(id);
    if (!el || el.tagName !== 'TEXTAREA') continue;
    el.addEventListener('input', () => autoSizeFallback(el));
    autoSizeFallback(el);
  }
  // Also re-size when a collapsed <details> opens, since scrollHeight is 0
  // while the textarea is display:none.
  document.querySelectorAll('details').forEach((d) => {
    d.addEventListener('toggle', () => {
      if (d.open) d.querySelectorAll('textarea').forEach(autoSizeFallback);
    });
  });
}

// State input pane (plain <textarea id="state-input">).
export function setState(stateObj) {
  if (typeof document === 'undefined') return;
  const node = document.getElementById('state-input');
  if (!node) return;
  node.value = formatJsonCompact(stateObj || {});
  if (!SUPPORTS_FIELD_SIZING) autoSizeFallback(node);
}

export function getState() {
  if (typeof document === 'undefined') return {};
  const node = document.getElementById('state-input');
  if (!node) return {};
  try {
    const parsed = JSON.parse(node.value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getHoareInputs() {
  if (typeof document === 'undefined') return { pre: '', post: '', samples: {}, samplesRaw: '', samplesError: null };
  const pre = document.getElementById('hoare-pre')?.value || '';
  const post = document.getElementById('hoare-post')?.value || '';
  const samplesRaw = document.getElementById('hoare-samples')?.value || '';
  let samples = {};
  let samplesError = null;
  if (samplesRaw.trim()) {
    try {
      samples = JSON.parse(samplesRaw);
      if (!samples || typeof samples !== 'object' || Array.isArray(samples)) {
        samplesError = 'Schema must be a JSON object like {"m": [0, 50]}, not an array or scalar.';
        samples = {};
      }
    } catch (e) {
      samplesError = e.message;
    }
  }
  return { pre, post, samples, samplesRaw, samplesError };
}
