// scripts/fetch-pyodide-dev.mjs — vendor the Pyodide bundle locally for dev/E2E.
//
// In production the Dockerfile downloads the bundle. For local Playwright
// tests against `npm run dev`, you want the bundle on disk to mirror prod
// exactly. Run once: `npm run fetch-pyodide-dev`. The bundle is gitignored.
//
// Note: the full Pyodide bundle is ~250 MB extracted. Only run this when you
// actually want to do offline / E2E testing locally.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const VERSION = '0.27.0';
const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TARGET = path.join(HERE, 'static', 'pyodide');

if (fs.existsSync(path.join(TARGET, 'pyodide.js'))) {
  console.log(`Pyodide bundle already at ${TARGET}; skipping.`);
  process.exit(0);
}

fs.mkdirSync(TARGET, { recursive: true });

console.log(`Downloading Pyodide ${VERSION} (~50 MB compressed, ~250 MB extracted)…`);

const url = `https://github.com/pyodide/pyodide/releases/download/${VERSION}/pyodide-${VERSION}.tar.bz2`;
const tarball = path.join(HERE, '.pyodide.tar.bz2');

try {
  execSync(`curl -fsSL -o "${tarball}" "${url}"`, { stdio: 'inherit' });
  // The tarball extracts to a `pyodide/` directory; we want its contents in `TARGET`.
  execSync(`tar -xjf "${tarball}" -C "${path.dirname(TARGET)}"`, { stdio: 'inherit' });
  fs.unlinkSync(tarball);
  console.log(`Pyodide bundle extracted to ${TARGET}`);
} catch (e) {
  console.error(`Failed to fetch Pyodide: ${e.message}`);
  if (fs.existsSync(tarball)) fs.unlinkSync(tarball);
  process.exit(1);
}
