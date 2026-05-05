// engine.js — Pyodide bootstrap + the runTool dispatcher.
//
// Contract: runTool({ tool, code, state, samples, pre, post }) → Promise<envelope>
//   envelope = { ok: true, value }
//             | { ok: false, error: { kind, message, traceback? } }
//
// Pyodide is loaded ONCE per page; subsequent runTool calls reuse the same
// runtime. lark + while_lang.py are installed/exec'd inside the Pyodide context
// during the bootstrap.

const PYODIDE_INDEX = '/static/pyodide/';
const ENGINE_SOURCE = '/static/while_lang.py';

// micropip requires an absolute http(s) URL; relative paths get parsed as
// file:// and rejected. Build at runtime from window.location.origin.
function absoluteUrl(pathFromRoot) {
  if (typeof location === 'undefined') return pathFromRoot;
  return location.origin + pathFromRoot;
}

let _pyodideReady = null;

function ensurePyodide() {
  if (_pyodideReady) return _pyodideReady;
  _pyodideReady = (async () => {
    if (typeof loadPyodide !== 'function') {
      throw new Error(
        'loadPyodide is not defined. The <script src="/static/pyodide/pyodide.js"> ' +
        'tag must be present in index.html before this module loads.'
      );
    }
    const py = await loadPyodide({ indexURL: PYODIDE_INDEX });
    await py.loadPackage('micropip');
    const larkUrl = absoluteUrl('/static/wheels/lark-1.3.1-py3-none-any.whl');
    await py.runPythonAsync(`
      import micropip
      await micropip.install('${larkUrl}')
    `);
    const src = await fetch(ENGINE_SOURCE).then((r) => {
      if (!r.ok) throw new Error(`failed to fetch ${ENGINE_SOURCE}: ${r.status}`);
      return r.text();
    });
    py.runPython(src);
    return py;
  })();
  return _pyodideReady;
}

// Map a Pyodide error string to an envelope error.kind.
function classifyError(err, tool) {
  const msg = String(err && err.message ? err.message : err);

  if (msg.includes('StepBudgetExceeded')) {
    return { kind: 'budget', message: msg };
  }

  if (
    msg.includes('UnexpectedCharacters') ||
    msg.includes('UnexpectedToken') ||
    msg.includes('UnexpectedInput') ||
    msg.includes('SyntaxError')
  ) {
    return { kind: 'syntax', message: msg };
  }

  if (tool === 'hoare' && msg.includes('NameError')) {
    const match = msg.match(/name '(\w+)' is not defined/);
    if (match) {
      return {
        kind: 'assertion',
        message:
          `Assertion references variable '${match[1]}' but no sample range was provided. ` +
          `Add it to ?samples=, e.g. ?samples={"${match[1]}":[0,10]}.`,
      };
    }
    return { kind: 'assertion', message: msg };
  }

  if (tool === 'hoare' && msg.toLowerCase().includes('eval')) {
    return { kind: 'assertion', message: msg };
  }

  return { kind: 'unknown', message: msg, traceback: msg };
}

// Convert Python objects from py.runPython into plain JS objects.
function pyToJs(value) {
  if (value && typeof value.toJs === 'function') {
    const js = value.toJs({ dict_converter: Object.fromEntries });
    if (typeof value.destroy === 'function') value.destroy();
    return js;
  }
  return value;
}

export async function runTool({ tool, code, state, samples, pre, post }) {
  let py;
  try {
    py = await ensurePyodide();
  } catch (e) {
    return { ok: false, error: { kind: 'load', message: String(e && e.message ? e.message : e) } };
  }

  if (!code || !code.trim()) {
    return { ok: false, error: { kind: 'syntax', message: 'No program to run. Type or paste a While program.' } };
  }

  py.globals.set('_code', code);
  py.globals.set('_state', state || {});

  try {
    if (tool === 'trace') {
      const result = py.runPython(`trace(_code, dict(_state.to_py()), view='formal')`);
      return { ok: true, value: result };
    }

    if (tool === 'table') {
      const result = py.runPython(`trace(_code, dict(_state.to_py()), view='table')`);
      return { ok: true, value: { tableText: result, initialState: state || {}, mode: 'table' } };
    }

    if (tool === 'state-trace' || tool === 'loops') {
      const result = py.runPython(`trace(_code, dict(_state.to_py()), view='table')`);
      return { ok: true, value: { tableText: result, initialState: state || {}, mode: tool } };
    }

    if (tool === 'count') {
      const result = py.runPython(`count_steps(_code, dict(_state.to_py()))`);
      return { ok: true, value: { steps: Number(result) } };
    }

    if (tool === 'hoare') {
      const schema = samples && Object.keys(samples).length ? samples : null;
      if (!schema) {
        return {
          ok: false,
          error: {
            kind: 'assertion',
            message: 'No sample-state schema provided. Add e.g. {"m": [0, 50], "n": [1, 10]}.',
          },
        };
      }
      py.globals.set('_pre', pre || 'True');
      py.globals.set('_post', post || 'True');
      py.globals.set('_schema', schema);

      const result = py.runPython(`
import random, ast
random.seed(0)
schema = dict(_schema.to_py())
def _sample():
    return {k: random.randint(lo, hi) for k, (lo, hi) in schema.items()}
samples = [_sample() for _ in range(10)]
SAFE = {"__builtins__": {}}

def _names_in(expr):
    """Collect every Name referenced in the assertion expression."""
    try:
        tree = ast.parse(expr, mode='eval')
    except SyntaxError:
        return set()
    return {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}

_pre_names  = _names_in(_pre)
_post_names = _names_in(_post)

def _eval_with_zero_defaults(expr, names, state):
    # In While, unset variables are implicitly 0. Mirror that semantic
    # in the assertion eval: any name in the expression that's not in
    # the state dict defaults to 0. Avoids spurious NameErrors when the
    # final state happens to omit a zero-valued variable.
    locs = dict(state)
    for n in names:
        locs.setdefault(n, 0)
    return bool(eval(expr, SAFE, locs))

def _precond(s):  return _eval_with_zero_defaults(_pre,  _pre_names,  s)
def _postcond(s): return _eval_with_zero_defaults(_post, _post_names, s)

verify_triple(precond=_precond, prog=_code, postcond=_postcond, sample_states=samples)
      `);
      return { ok: true, value: pyToJs(result) };
    }

    return { ok: false, error: { kind: 'unknown', message: `unknown tool: ${tool}` } };
  } catch (e) {
    return { ok: false, error: classifyError(e, tool) };
  }
}

// Convenience used by tests / dev: surface engine readiness.
export async function isEngineReady() {
  try {
    await ensurePyodide();
    return true;
  } catch {
    return false;
  }
}
