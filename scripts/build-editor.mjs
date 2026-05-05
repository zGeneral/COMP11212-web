// scripts/build-editor.mjs — bundle the CodeMirror editor into a single
// IIFE script that the page loads via <script src="/static/editor-bundle.js">.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ENTRY = path.join(HERE, 'editor-entry.js');
const OUT = path.join(ROOT, 'static', 'editor-bundle.js');

await build({
  entryPoints: [ENTRY],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser',
  outfile: OUT,
  logLevel: 'info',
  legalComments: 'inline',
});

const stat = fs.statSync(OUT);
console.log(`Bundle: ${OUT} (${(stat.size / 1024).toFixed(1)} KB)`);
