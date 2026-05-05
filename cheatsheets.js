// cheatsheets.js — lazy-load + render the pre-built cheatsheet HTML
// (produced by scripts/build-cheatsheets.mjs at build time).

const SHEETS_BASE = '/static/cheatsheets/';
const _cache = {};

export async function loadSheet(slug) {
  if (_cache[slug]) return _cache[slug];
  const url = SHEETS_BASE + encodeURIComponent(slug) + '.html';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to load cheatsheet '${slug}': HTTP ${response.status}`);
  }
  const html = await response.text();
  _cache[slug] = html;
  return html;
}

export async function renderCheatsheet(slug) {
  const body = document.getElementById('cheatsheet-body');
  if (!body) return;
  body.innerHTML = '<p class="cheatsheet-loading">Loading…</p>';
  try {
    const html = await loadSheet(slug);
    body.innerHTML = html;
    // scroll back to top of body so each sheet starts at the top
    body.scrollTop = 0;
    if (typeof window !== 'undefined') window.scrollTo({ top: body.offsetTop - 100, behavior: 'smooth' });
  } catch (e) {
    body.innerHTML =
      `<div class="error-block kind-load"><h3>Cheatsheet failed to load</h3><p>${String(e && e.message || e)}</p></div>`;
  }
}

export function activateSheetTab(slug) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-sheet]').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-sheet') === slug);
  });
}

export function setupCheatsheetNav(onSheetChange) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-sheet]').forEach((b) => {
    b.addEventListener('click', () => {
      const slug = b.getAttribute('data-sheet');
      activateSheetTab(slug);
      onSheetChange(slug);
    });
  });
}
