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

// State input pane (plain <textarea id="state-input">).
export function setState(stateObj) {
  if (typeof document === 'undefined') return;
  const node = document.getElementById('state-input');
  if (!node) return;
  node.value = JSON.stringify(stateObj || {}, null, 2);
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
