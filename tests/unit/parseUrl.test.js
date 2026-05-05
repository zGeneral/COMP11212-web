// tests/unit/parseUrl.test.js — unit tests for URL parsing in main.js.
//
// We import lz-string from the vendored copy via a small CommonJS shim, then
// import main.js as an ESM module. main.js doesn't bootstrap unless `document`
// is defined, so importing in a Node test env is safe.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

let parseUrl, serialiseUrl;

beforeAll(async () => {
  // Load lz-string into the global scope so main.js can use it.
  const lz = fs.readFileSync(
    path.resolve('static', 'lz-string.min.js'),
    'utf8'
  );
  vm.runInThisContext(lz);
  globalThis.LZString = LZString; // eslint-disable-line no-undef

  ({ parseUrl, serialiseUrl } = await import('../../main.js'));
});

describe('parseUrl', () => {
  it('returns defaults for a bare URL', () => {
    const s = parseUrl({ search: '', hash: '' });
    expect(s.code).toBe('');
    expect(s.tool).toBe('trace');
    expect(s.state).toEqual({});
    expect(s.samples).toEqual({});
    expect(s.pre).toBe('');
    expect(s.post).toBe('');
    expect(s.embed).toBe(false);
  });

  it('decodes a fragment-encoded code value', () => {
    const code = 'x := 1; y := x + 2';
    const compressed = LZString.compressToEncodedURIComponent(code);
    const s = parseUrl({ search: '', hash: '#code=' + compressed });
    expect(s.code).toBe(code);
  });

  it('reads tool, state, samples, pre, post, embed from query params', () => {
    const s = parseUrl({
      search:
        '?tool=hoare' +
        '&state=' + encodeURIComponent('{"n":10}') +
        '&samples=' + encodeURIComponent('{"n":[0,30]}') +
        '&pre=' + encodeURIComponent('n>=0') +
        '&post=' + encodeURIComponent('result==n*(n+1)/2') +
        '&embed=1',
      hash: '',
    });
    expect(s.tool).toBe('hoare');
    expect(s.state).toEqual({ n: 10 });
    expect(s.samples).toEqual({ n: [0, 30] });
    expect(s.pre).toBe('n>=0');
    expect(s.post).toBe('result==n*(n+1)/2');
    expect(s.embed).toBe(true);
  });

  it('returns empty code + warns on a malformed lz-string', () => {
    const s = parseUrl({ search: '', hash: '#code=GARBAGE!!!' });
    expect(s.code).toBe('');
  });

  it('falls back to ?code= when fragment is missing (chat truncation)', () => {
    const code = 'skip';
    const compressed = LZString.compressToEncodedURIComponent(code);
    const s = parseUrl({ search: '?code=' + compressed, hash: '' });
    expect(s.code).toBe(code);
  });

  it('handles malformed JSON in state without throwing', () => {
    const s = parseUrl({
      search: '?state=' + encodeURIComponent('not json'),
      hash: '',
    });
    expect(s.state).toEqual({});
  });

  it('handles malformed JSON in samples without throwing', () => {
    const s = parseUrl({
      search: '?samples=' + encodeURIComponent('{nope'),
      hash: '',
    });
    expect(s.samples).toEqual({});
  });
});

describe('serialiseUrl', () => {
  it('round-trips through parseUrl: defaults', () => {
    const original = {
      code: 'x := 1',
      tool: 'trace',
      state: {},
      samples: {},
      pre: '',
      post: '',
      embed: false,
    };
    const url = serialiseUrl(original, 'http://example/');
    const parsed = parseUrl(parseLocation(url, 'http://example/'));
    expect(parsed.code).toBe(original.code);
    expect(parsed.tool).toBe('trace');
  });

  it('round-trips a non-trivial state', () => {
    const original = {
      code: 'x := n + 1',
      tool: 'count',
      state: { n: 10, x: 0 },
      samples: {},
      pre: '',
      post: '',
      embed: false,
    };
    const url = serialiseUrl(original, 'http://example/');
    const parsed = parseUrl(parseLocation(url, 'http://example/'));
    expect(parsed.code).toBe(original.code);
    expect(parsed.tool).toBe(original.tool);
    expect(parsed.state).toEqual(original.state);
  });

  it('round-trips a Hoare config', () => {
    const original = {
      code: 'result := 0; while i <= n do (result := result + i; i := i + 1)',
      tool: 'hoare',
      state: {},
      samples: { n: [0, 30] },
      pre: 'n>=0',
      post: 'result==n*(n+1)/2',
      embed: true,
    };
    const url = serialiseUrl(original, 'http://example/');
    const parsed = parseUrl(parseLocation(url, 'http://example/'));
    expect(parsed.tool).toBe('hoare');
    expect(parsed.samples).toEqual(original.samples);
    expect(parsed.pre).toBe(original.pre);
    expect(parsed.post).toBe(original.post);
    expect(parsed.embed).toBe(true);
  });

  it('produces a URL shorter than 30 KB for a 1 KB program', () => {
    const code = ('x := 1; '.repeat(125)).trim(); // ~1 KB
    const url = serialiseUrl(
      { code, tool: 'trace', state: {}, samples: {}, pre: '', post: '', embed: false },
      'http://example/'
    );
    expect(url.length).toBeLessThan(30000);
  });
});

// Helper: convert a URL string into a {search, hash} object for parseUrl.
function parseLocation(urlString, base) {
  const u = new URL(urlString, base);
  return { search: u.search, hash: u.hash };
}
