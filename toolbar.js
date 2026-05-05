// toolbar.js — wires the tool selector, share button, and "Try this" examples.

const EXAMPLES = {
  sum: `result := 0;
i := 1;
while i <= n do (
  result := result + i;
  i := i + 1
)`,
  gcd: `while !(b = 0) do (
  if a <= b then
    skip
  else (
    t := a;
    a := b;
    b := t
  );
  b := b - a
)`,
  factorial: `result := 1;
i := 1;
while i <= n do (
  result := result * i;
  i := i + 1
)`,
};

const EXAMPLE_STATES = {
  sum: { n: 10 },
  gcd: { a: 84, b: 30 },
  factorial: { n: 6 },
};

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

export function setupToolbar({ onTool, onShare, initialTool = 'trace' }) {
  if (typeof document === 'undefined') return;

  // Tool buttons
  document.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tool]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tool = btn.getAttribute('data-tool');
      // Toggle Hoare-input visibility.
      document.body.classList.toggle('tool-hoare', tool === 'hoare');
      document.body.classList.toggle('tool-count', tool === 'count');
      document.body.classList.toggle('tool-trace', tool === 'trace');
      onTool(tool);
    });
  });
  const initialBtn = document.querySelector(`[data-tool="${initialTool}"]`);
  if (initialBtn) initialBtn.click();

  // Run button — same as re-clicking the active tool.
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

  // Try-this example buttons
  document.querySelectorAll('[data-example]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-example');
      const code = EXAMPLES[name];
      const state = EXAMPLE_STATES[name];
      if (!code) return;
      // Editor + state input; run.
      import('./editor.js').then(({ setEditor, setState }) => {
        setEditor(code);
        setState(state);
        const active = document.querySelector('[data-tool].active');
        if (active) onTool(active.getAttribute('data-tool'));
      });
    });
  });
}

export const _internal = { EXAMPLES, EXAMPLE_STATES };
