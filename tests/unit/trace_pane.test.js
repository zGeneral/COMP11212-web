// tests/unit/trace_pane.test.js — pure-function tests for the render helpers.

import { describe, it, expect } from 'vitest';
import { _internal, DISPLAY_CAP } from '../../trace_pane.js';

describe('escapeHtml', () => {
  const { escapeHtml } = _internal;
  it('escapes the basics', () => {
    expect(escapeHtml('<a>')).toBe('&lt;a&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"x"')).toBe('&quot;x&quot;');
    expect(escapeHtml("'y'")).toBe('&#39;y&#39;');
  });
  it('handles non-string input', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(null)).toBe('null');
  });
});

describe('renderTraceText', () => {
  const { renderTraceText } = _internal;
  it('renders a short trace inline', () => {
    const out = renderTraceText('line1\nline2');
    expect(out).toContain('<pre class="trace">line1\nline2</pre>');
    expect(out).not.toContain('<details');
  });

  it('truncates a long trace and shows a "show all" affordance', () => {
    const lines = Array.from({ length: DISPLAY_CAP + 50 }, (_, i) => `step ${i}`);
    const out = renderTraceText(lines.join('\n'));
    expect(out).toContain('<details');
    expect(out).toContain(`Show all ${DISPLAY_CAP + 50} lines`);
    expect(out).toContain('class="trace full"');
  });

  it('escapes HTML in the trace', () => {
    const out = renderTraceText('<script>x</script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>x</script>');
  });
});

describe('renderHoare', () => {
  const { renderHoare } = _internal;
  it('renders sampled / verified / failed counts', () => {
    const out = renderHoare({ sampled: 10, verified: 10, precondition_holds: 10, failed: [] });
    expect(out).toContain('Sampled');
    expect(out).toContain('Verified');
    expect(out).toContain('10');
  });

  it('warns when precondition holds on 0 samples', () => {
    const out = renderHoare({ sampled: 10, verified: 0, precondition_holds: 0, failed: [] });
    expect(out).toContain('was true on 0 of 10');
    expect(out).toContain('?samples=');
  });

  it('warns on thin precondition slice (< sampled/2)', () => {
    const out = renderHoare({ sampled: 10, verified: 1, precondition_holds: 1, failed: [] });
    expect(out).toContain('1/10 samples');
  });

  it('does NOT warn when precondition holds on most samples', () => {
    const out = renderHoare({ sampled: 10, verified: 10, precondition_holds: 10, failed: [] });
    expect(out).not.toContain('Precondition was true on only');
  });
});

describe('renderError', () => {
  const { renderError } = _internal;
  it('renders the load-failure error with a retry hint', () => {
    const out = renderError({ kind: 'load', message: 'fetch failed' });
    expect(out).toContain('Engine failed to load');
    expect(out).toContain('Reload the page');
  });

  it('renders the budget error with a friendly message (not the raw stack)', () => {
    const out = renderError({ kind: 'budget', message: 'StepBudgetExceeded: 10000' });
    expect(out).toContain('Step budget exceeded');
    expect(out).toContain('non-terminating');
  });

  it('renders the syntax error with the engine\'s message', () => {
    const out = renderError({ kind: 'syntax', message: 'UnexpectedCharacters at line 1 col 4' });
    expect(out).toContain('Parse error');
    expect(out).toContain('UnexpectedCharacters');
  });

  it('renders unknown errors with a traceback details block', () => {
    const out = renderError({ kind: 'unknown', message: 'mystery', traceback: 'long stack trace here' });
    expect(out).toContain('Something went wrong');
    expect(out).toContain('long stack trace here');
  });
});

describe('renderCount', () => {
  const { renderCount } = _internal;
  it('renders a number from the {steps} envelope', () => {
    const out = renderCount({ steps: 33 });
    expect(out).toContain('Step count');
    expect(out).toContain('33');
  });

  it('renders a bare number too', () => {
    const out = renderCount(42);
    expect(out).toContain('42');
  });
});
