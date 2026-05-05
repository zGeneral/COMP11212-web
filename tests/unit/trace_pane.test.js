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
    expect(out).toMatch(/<pre class="trace">.*line1.*line2.*<\/pre>/s);
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
    // After tokenisation the literal angle brackets are escaped; the raw
    // <script> tag never reaches the DOM. Tokens within may add their own spans.
    expect(out).toContain('&lt;');
    expect(out).toContain('&gt;');
    expect(out).not.toMatch(/<script[^"]*>x<\/script>/);
  });
});

describe('paintTokens', () => {
  const { paintTokens } = _internal;
  it('classifies keywords with tw-kw', () => {
    const out = paintTokens('while i <= n do');
    expect(out).toContain('<span class="tw-kw">while</span>');
    expect(out).toContain('<span class="tw-kw">do</span>');
  });
  it('classifies := as tw-arrow', () => {
    const out = paintTokens('x := 5');
    expect(out).toContain('<span class="tw-arrow">:=</span>');
  });
  it('classifies numbers with tw-num', () => {
    const out = paintTokens('x := 42');
    expect(out).toContain('<span class="tw-num">42</span>');
  });
  it('classifies variables with tw-var', () => {
    const out = paintTokens('result + i');
    expect(out).toContain('<span class="tw-var">result</span>');
    expect(out).toContain('<span class="tw-var">i</span>');
  });
  it('classifies ⟨ ⟩ as tw-bracket', () => {
    const out = paintTokens('⟨skip, σ⟩');
    expect(out).toContain('<span class="tw-bracket">⟨</span>');
    expect(out).toContain('<span class="tw-bracket">⟩</span>');
  });
  it('escapes raw HTML inside tokens', () => {
    const out = paintTokens('<x>');
    // < is not a While token; falls through to escaped raw.
    expect(out).toContain('&lt;');
    expect(out).not.toContain('<x>');
  });
});

describe('paintLine', () => {
  const { paintLine } = _internal;
  it('paints the rule label distinctly', () => {
    const out = paintLine('  ⇒  ⟨skip, {x ↦ 1}⟩    [:=]');
    expect(out).toContain('<span class="tw-rule-name">:=</span>');
    expect(out).toContain('<span class="tw-arrow">⇒</span>');
  });
});

describe('paintTrace', () => {
  const { paintTrace } = _internal;
  it('marks the legend header', () => {
    const trace = `Where:\n  L1 := while i ≤ n do (skip)\n\n⟨L1, {}⟩`;
    const out = paintTrace(trace);
    expect(out).toContain('<span class="tw-legend-header">Where:</span>');
    expect(out).toContain('class="tw-legend"');
  });
  it('paints normal trace lines', () => {
    const trace = `⟨x := 1, {}⟩\n  ⇒  ⟨skip, {x ↦ 1}⟩    [:=]`;
    const out = paintTrace(trace);
    expect(out).toContain('<span class="tw-bracket">⟨</span>');
    expect(out).toContain('<span class="tw-rule-name">:=</span>');
    expect(out).toContain('<span class="tw-num">1</span>');
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

describe('parseTableText / renderTableHtml — table mode', () => {
  const { parseTableText, renderTableHtml } = _internal;
  const sample = [
    'step | rule   | x | y',
    '-----+--------+---+---',
    '0    | start  | 0 | 0',
    '1    | :=     | 5 | 0',
    '2    | skip-; | 5 | 0',
    '3    | :=     | 5 | 7',
  ].join('\n');

  it('parses header + rows', () => {
    const p = parseTableText(sample);
    expect(p.header).toEqual(['step', 'rule', 'x', 'y']);
    expect(p.rows).toHaveLength(4);
    expect(p.rows[0].cells).toEqual(['0', 'start', '0', '0']);
    expect(p.rows[3].cells).toEqual(['3', ':=', '5', '7']);
  });

  it('renders an HTML table with the No. + rule + vars + steps headers', () => {
    const html = renderTableHtml(sample, 'table', {});
    expect(html).toContain('<table class="trace-table">');
    expect(html).toContain('<th>No.</th>');
    expect(html).toContain('<th>rule</th>');
    expect(html).toContain('<th>x</th>');
    expect(html).toContain('<th class="tt-steps-th">steps</th>');
    expect(html).not.toContain('<th>step</th>');
  });

  it('cumulates the steps column on counted rules and shows — for admin rules', () => {
    const html = renderTableHtml(sample, 'table', {});
    // sample has start, :=, skip-;, := → counted: 0, 1, 1, 2 → cells: —, 1, —, 2
    expect(html).toMatch(/<td class="tt-steps">—<\/td>[\s\S]*<td class="tt-steps">1<\/td>[\s\S]*<td class="tt-steps">—<\/td>[\s\S]*<td class="tt-steps">2<\/td>/);
  });

  it('marks an increase as tt-up', () => {
    const html = renderTableHtml(sample, 'table', {});
    expect(html).toMatch(/<td class="tt-val tt-up">5<\/td>/);   // x: 0 → 5
    expect(html).toMatch(/<td class="tt-val tt-up">7<\/td>/);   // y: 0 → 7
  });

  it('handles truncation rows', () => {
    const truncated = sample + '\n... step budget exceeded ...';
    const html = renderTableHtml(truncated, 'table', {});
    expect(html).toContain('class="truncated"');
  });
});

describe('renderTableHtml — direction-aware highlighting', () => {
  const { renderTableHtml } = _internal;
  const upDown = [
    'step | rule   | x',
    '-----+--------+---',
    '0    | start  | 5',
    '1    | :=     | 8',  // up
    '2    | :=     | 3',  // down
    '3    | :=     | 3',  // same
  ].join('\n');

  it('marks increases tt-up, decreases tt-down, equal cells unmarked', () => {
    const html = renderTableHtml(upDown, 'table', {});
    expect(html).toMatch(/<td class="tt-val tt-up">8<\/td>/);
    expect(html).toMatch(/<td class="tt-val tt-down">3<\/td>/);
    expect(html).toMatch(/<td class="tt-val">3<\/td>/);
  });
});

describe('renderTableHtml — state-trace mode', () => {
  const { renderTableHtml } = _internal;
  const sample = [
    'step | rule   | x',
    '-----+--------+---',
    '0    | start  | 0',
    '1    | :=     | 5',
    '2    | skip-; | 5',
    '3    | while-tt| 5',
    '4    | :=     | 8',
  ].join('\n');

  it('drops the rule column and renames step to No.', () => {
    const html = renderTableHtml(sample, 'state-trace', {});
    expect(html).toContain('<th>No.</th>');
    expect(html).not.toContain('<th>rule</th>');
  });

  it('filters consecutive equal-state rows', () => {
    const html = renderTableHtml(sample, 'state-trace', {});
    // 5 engine rows → 3 displayed: start (x=0), := (x=5), := (x=8).
    // The skip-; and while-tt rows have x=5 (same as previous emitted), filtered.
    const tdMatches = html.match(/<td class="tt-val[^"]*">[^<]+<\/td>/g) || [];
    expect(tdMatches).toHaveLength(3);
  });

  it('includes constant initial-state vars as columns', () => {
    const html = renderTableHtml(sample, 'state-trace', { m: 14, n: 4 });
    expect(html).toContain('<th>m</th>');
    expect(html).toContain('<th>n</th>');
    // Initial-state values should appear in every emitted row.
    expect(html).toMatch(/>14</);
    expect(html).toMatch(/>4</);
  });
});

describe('renderTableHtml — loops mode', () => {
  const { renderTableHtml } = _internal;
  const sample = [
    'step | rule    | i',
    '-----+---------+---',
    '0    | start   | 0',
    '1    | :=      | 0',
    '2    | skip-;  | 0',
    '3    | while-tt| 0',
    '4    | :=      | 1',
    '5    | skip-;  | 1',
    '6    | while-tt| 1',
    '7    | :=      | 2',
    '8    | while-ff| 2',
  ].join('\n');

  it('keeps initial + every while-tt + every while-ff', () => {
    const html = renderTableHtml(sample, 'loops', {});
    // start (i=0), while-tt (i=0), while-tt (i=1), while-ff (i=2). 4 rows.
    const tdMatches = html.match(/<td class="tt-val[^"]*">[^<]+<\/td>/g) || [];
    expect(tdMatches).toHaveLength(4);
  });

  it('drops the rule column', () => {
    const html = renderTableHtml(sample, 'loops', {});
    expect(html).not.toContain('<th>rule</th>');
    expect(html).toContain('<th>No.</th>');
  });
});
