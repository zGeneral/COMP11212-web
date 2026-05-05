// scripts/sync-engine.mjs — re-vendor while_lang.py from the notebooks repo.
//
// Run from the repo root:  npm run sync-engine

import fs from 'node:fs';
import path from 'node:path';

const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(HERE, '..', 'COMP11212', 'notebooks', 'while_lang.py');
const DST = path.join(HERE, 'static', 'while_lang.py');

if (!fs.existsSync(SRC)) {
  console.error(`source not found: ${SRC}`);
  console.error('expected the notebooks repo to be a sibling of COMP11212-web.');
  process.exit(1);
}

const srcText = fs.readFileSync(SRC, 'utf8');
if (!srcText.includes('Licensed under the MIT License')) {
  console.error('source has no MIT header — abort.');
  console.error('add an MIT header to notebooks/while_lang.py before vendoring.');
  process.exit(1);
}

fs.copyFileSync(SRC, DST);
console.log(`vendored ${SRC} → ${DST}`);
console.log(`size: ${fs.statSync(DST).size} bytes`);
