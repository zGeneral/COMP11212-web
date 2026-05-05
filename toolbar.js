// toolbar.js — wires the tool selector, share button, and examples dropdown.
//
// Examples are loaded from /static/examples.json at page boot (one fetch).
// Selecting an example loads its program + state + suggested tool + (for
// Hoare) precondition/postcondition/sample-state schema, then runs.

let _catalogue = null;

async function loadCatalogue() {
  if (_catalogue) return _catalogue;
  try {
    const response = await fetch('/static/examples.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    _catalogue = await response.json();
  } catch (e) {
    console.warn('toolbar: could not load examples.json:', e);
    _catalogue = { chapters: [] };
  }
  return _catalogue;
}

function populateExamplesSelect(catalogue) {
  const select = document.getElementById('examples-select');
  if (!select) return;
  // Reset (keep the placeholder option)
  while (select.options.length > 1) select.remove(1);

  catalogue.chapters.forEach((chapter) => {
    const group = document.createElement('optgroup');
    group.label = chapter.label;
    chapter.entries.forEach((entry, idx) => {
      const option = document.createElement('option');
      const refLabel = entry.ref && entry.ref !== 'Extra' ? `${entry.ref} — ` : '';
      option.value = `${chapter.label}::${idx}`;
      option.textContent = `${refLabel}${entry.title}`;
      option.title = entry.blurb || '';
      group.appendChild(option);
    });
    select.appendChild(group);
  });
}

async function applyExample(value) {
  const catalogue = await loadCatalogue();
  const [chapterLabel, idxStr] = value.split('::');
  const chapter = catalogue.chapters.find((c) => c.label === chapterLabel);
  if (!chapter) return null;
  const entry = chapter.entries[Number(idxStr)];
  if (!entry) return null;

  const editor = await import('./editor.js');
  editor.setEditor(entry.code);
  editor.setState(entry.state || {});

  // Hoare prefill if applicable.
  if (entry.tool === 'hoare') {
    const preEl = document.getElementById('hoare-pre');
    const postEl = document.getElementById('hoare-post');
    const sampEl = document.getElementById('hoare-samples');
    if (preEl) preEl.value = entry.pre || '';
    if (postEl) postEl.value = entry.post || '';
    if (sampEl) {
      sampEl.value =
        entry.samples && Object.keys(entry.samples).length
          ? JSON.stringify(entry.samples, null, 2)
          : '';
    }
  }

  return entry;
}

function showToast(msg, kind = 'info') {
  if (typeof document === 'undefined') return;
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.className = 'toast ' + kind;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

export async function setupToolbar({ onTool, onShare, initialTool = 'trace' }) {
  if (typeof document === 'undefined') return;

  // Tool buttons
  document.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tool]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tool = btn.getAttribute('data-tool');
      document.body.classList.toggle('tool-hoare', tool === 'hoare');
      document.body.classList.toggle('tool-count', tool === 'count');
      document.body.classList.toggle('tool-trace', tool === 'trace');
      onTool(tool);
    });
  });
  const initialBtn = document.querySelector(`[data-tool="${initialTool}"]`);
  if (initialBtn) initialBtn.click();

  // Run button
  const runBtn = document.getElementById('run-btn');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      const active = document.querySelector('[data-tool].active');
      if (active) onTool(active.getAttribute('data-tool'));
    });
  }

  // Share button
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const result = await onShare();
      if (result.ok) {
        if (result.copied !== false) showToast('Link copied to clipboard');
        else showToast(result.url, 'info');
      } else {
        showToast(result.message, 'warn');
      }
    });
  }

  // Examples dropdown — fetch catalogue and populate.
  const select = document.getElementById('examples-select');
  if (select) {
    const catalogue = await loadCatalogue();
    populateExamplesSelect(catalogue);
    select.addEventListener('change', async (ev) => {
      const value = ev.target.value;
      if (!value) return;
      const entry = await applyExample(value);
      if (entry && entry.tool) {
        const btn = document.querySelector(`[data-tool="${entry.tool}"]`);
        if (btn) btn.click();
      } else {
        const active = document.querySelector('[data-tool].active');
        if (active) onTool(active.getAttribute('data-tool'));
      }
      // Reset dropdown back to the placeholder so re-selection re-runs.
      ev.target.value = '';
    });
  }
}

export const _internal = { loadCatalogue, populateExamplesSelect, applyExample };
