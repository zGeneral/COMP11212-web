// editor.js — thin CodeMirror 6 wrapper.
//
// v1: a plain monospace <textarea> with light client-side highlighting.
// v1.5: a real CodeMirror 6 editor with a Lezer grammar for While syntax.
//
// We start with a textarea because it's zero-dependency, works in iframes
// without any extra setup, and the abstraction here lets us upgrade to
// CodeMirror later without touching call sites.

let _textarea = null;
const _changeHandlers = [];

function getNode() {
  if (_textarea) return _textarea;
  if (typeof document === 'undefined') return null;
  _textarea = document.getElementById('editor');
  if (_textarea) {
    _textarea.addEventListener('input', () => {
      _changeHandlers.forEach((h) => h(_textarea.value));
    });
  }
  return _textarea;
}

export function setEditor(code) {
  const node = getNode();
  if (!node) return;
  node.value = code || '';
}

export function getEditor() {
  const node = getNode();
  return node ? node.value : '';
}

export function onChange(handler) {
  if (typeof handler === 'function') _changeHandlers.push(handler);
}

// State input pane (JSON). Used by the trace/count tools.
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

// Hoare-only inputs.
export function getHoareInputs() {
  if (typeof document === 'undefined') return { pre: '', post: '', samples: {} };
  const pre = document.getElementById('hoare-pre')?.value || '';
  const post = document.getElementById('hoare-post')?.value || '';
  let samples = {};
  try {
    samples = JSON.parse(document.getElementById('hoare-samples')?.value || '{}');
  } catch {
    /* empty */
  }
  return { pre, post, samples };
}
