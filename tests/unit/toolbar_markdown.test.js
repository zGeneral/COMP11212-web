// tests/unit/toolbar_markdown.test.js — markdown-lite renderer for the theory pane.
import { describe, it, expect } from 'vitest';
import { renderMarkdownLite } from '../../toolbar.js';

describe('renderMarkdownLite', () => {
  it('renders bold, italic, and code spans', () => {
    const out = renderMarkdownLite('This is **bold**, *italic*, and `code`.');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<code>code</code>');
  });

  it('groups paragraphs separated by blank lines', () => {
    const out = renderMarkdownLite('First.\n\nSecond.');
    expect(out).toMatch(/<p>First\.<\/p>.*<p>Second\.<\/p>/s);
  });

  it('renders bullet lists', () => {
    const out = renderMarkdownLite('- one\n- two\n- three');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>one</li>');
    expect(out).toContain('<li>two</li>');
    expect(out).toContain('<li>three</li>');
  });

  it('escapes HTML in input', () => {
    const out = renderMarkdownLite('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert(1)</script>');
  });

  it('handles inline code containing special chars', () => {
    const out = renderMarkdownLite('Run `<` and `>` carefully.');
    expect(out).toContain('<code>&lt;</code>');
    expect(out).toContain('<code>&gt;</code>');
  });

  it('returns empty string for empty input', () => {
    expect(renderMarkdownLite('')).toBe('');
    expect(renderMarkdownLite(null)).toBe('');
    expect(renderMarkdownLite(undefined)).toBe('');
  });
});
