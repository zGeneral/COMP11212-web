// main.js — URL parsing, dispatch to runTool, render result.
// The page is a stateless renderer of the URL. Edits update the URL via
// the share button (not on every keystroke).

import { runTool } from './engine.js';
import {
  setEditor,
  getEditor,
  setState,
  getState,
  getHoareInputs,
  setEditorTheme,
} from './editor.js';
import { renderResult, showLoading, showEngineLoading } from './trace_pane.js';
import { setupToolbar } from './toolbar.js';

const THEME_KEY = 'while-playground:theme';
const THEME_VALUES = new Set(['plain', 'two-tone', 'ide']);

function readTheme() {
  if (typeof localStorage === 'undefined') return 'ide';
  const v = localStorage.getItem(THEME_KEY);
  return THEME_VALUES.has(v) ? v : 'ide';
}

function applyTheme(name) {
  const safe = THEME_VALUES.has(name) ? name : 'ide';
  if (typeof document !== 'undefined') {
    document.body.classList.remove('theme-plain', 'theme-two', 'theme-ide');
    document.body.classList.add(safe === 'two-tone' ? 'theme-two' : `theme-${safe}`);
  }
  setEditorTheme(safe);
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(THEME_KEY, safe); } catch { /* private mode */ }
  }
}

// Default starter program — a tiny 2-iteration counter loop. Renders ~13
// lines of trace; demonstrates :=, skip-;, while-tt firing twice, while-ff
// terminating, and the L1 loop abbreviation. Substantive programs live one
// click away (Try-this buttons).
const STARTER_CODE = `i := 0;
while i <= 1 do (
  i := i + 1
)`;

const STARTER_STATE = {};

export function parseUrl(loc) {
  const params = new URLSearchParams(loc.search || '');
  const hash = new URLSearchParams((loc.hash || '').slice(1));
  const raw = hash.get('code') ?? params.get('code') ?? '';

  let code = '';
  if (raw) {
    code = LZString.decompressFromEncodedURIComponent(raw) ?? '';
    if (!code) {
      console.warn('parseUrl: could not decode shared code; starting empty');
    }
  }

  let state = {};
  let samples = {};
  try {
    state = JSON.parse(params.get('state') ?? '{}');
  } catch {
    /* malformed ?state= → empty */
  }
  try {
    samples = JSON.parse(params.get('samples') ?? '{}');
  } catch {
    /* malformed ?samples= → empty */
  }

  return {
    code,
    tool: params.get('tool') || 'trace',
    state,
    samples,
    pre: params.get('pre') || '',
    post: params.get('post') || '',
    embed: params.get('embed') === '1',
  };
}

export function serialiseUrl(s, origin) {
  const base = origin || (typeof location !== 'undefined' ? location.origin + location.pathname : '/');
  const params = new URLSearchParams();
  if (s.tool && s.tool !== 'trace') params.set('tool', s.tool);
  if (s.state && Object.keys(s.state).length) params.set('state', JSON.stringify(s.state));
  if (s.samples && Object.keys(s.samples).length) params.set('samples', JSON.stringify(s.samples));
  if (s.pre) params.set('pre', s.pre);
  if (s.post) params.set('post', s.post);
  if (s.embed) params.set('embed', '1');

  const compressed = s.code ? LZString.compressToEncodedURIComponent(s.code) : '';
  const query = params.toString();
  const out = base + (query ? '?' + query : '') + (compressed ? '#code=' + compressed : '');
  return out;
}

// Live state used by the toolbar callbacks. Single source of truth for
// the in-memory playground state.
const live = {
  tool: 'trace',
  state: {},
  samples: {},
  pre: '',
  post: '',
  embed: false,
};

async function run() {
  const code = getEditor();
  // Always read the latest values from the inputs at run time.
  live.state = getState();
  if (live.tool === 'hoare') {
    const h = getHoareInputs();
    live.pre = h.pre;
    live.post = h.post;
    live.samples = h.samples;
  }
  showLoading(live.tool);
  const envelope = await runTool({
    tool: live.tool,
    code,
    state: live.state,
    samples: live.samples,
    pre: live.pre,
    post: live.post,
  });
  renderResult(live.tool, envelope);
}

function shareCurrent() {
  const code = getEditor();
  const url = serialiseUrl({ ...live, code });
  if (url.length > 30000) {
    return {
      ok: false,
      message: 'Program too long to share via URL (>30 KB compressed). Copy/paste as text instead.',
    };
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard
      .writeText(url)
      .then(() => ({ ok: true, url }))
      .catch((e) => ({ ok: false, message: 'Could not copy to clipboard: ' + e.message, url }));
  }
  return Promise.resolve({ ok: true, url, copied: false });
}

export function bootstrap() {
  if (typeof document === 'undefined') return; // skip in unit-test envs

  // Apply saved theme BEFORE the editor mounts so the first paint is correct.
  const savedTheme = readTheme();
  applyTheme(savedTheme);
  const themeSel = document.getElementById('theme-select');
  if (themeSel) {
    themeSel.value = savedTheme;
    themeSel.addEventListener('change', (ev) => applyTheme(ev.target.value));
  }

  const initial = parseUrl(typeof location !== 'undefined' ? location : { search: '', hash: '' });

  // Apply embed mode immediately so first paint is correct.
  if (initial.embed) {
    document.body.classList.add('embed');
    live.embed = true;
  }

  // Seed the live state from the URL.
  live.tool = initial.tool;
  live.state = initial.state;
  live.samples = initial.samples;
  live.pre = initial.pre;
  live.post = initial.post;

  // Editor content: URL → starter.
  const code = initial.code || STARTER_CODE;
  const seedState = initial.code ? initial.state : STARTER_STATE;
  if (!initial.code && !Object.keys(initial.state).length) live.state = seedState;
  setEditor(code);
  setState(live.state);

  // Hoare inputs: prefill the input fields from the URL.
  if (typeof document !== 'undefined') {
    const preEl = document.getElementById('hoare-pre');
    const postEl = document.getElementById('hoare-post');
    const sampEl = document.getElementById('hoare-samples');
    if (preEl) preEl.value = live.pre;
    if (postEl) postEl.value = live.post;
    if (sampEl && Object.keys(live.samples).length) {
      sampEl.value = JSON.stringify(live.samples, null, 2);
    }
  }

  // Wire toolbar.
  setupToolbar({
    onTool: (tool) => {
      live.tool = tool;
      run();
    },
    onShare: shareCurrent,
    initialTool: live.tool,
  });

  // Run on initial load AFTER pyodide ready (showEngineLoading shows a hint).
  showEngineLoading();
  run();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
