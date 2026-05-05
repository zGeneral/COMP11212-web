// scripts/dev-server.mjs — minimal local dev server for hand-testing.
//
// Serves the repo root over HTTP on http://localhost:8000.
// Sets Cross-Origin-Embedder-Policy / Cross-Origin-Opener-Policy headers so
// Pyodide can use SharedArrayBuffer (required for non-blocking WASM).
//
// In dev, Pyodide is served from the Pyodide CDN if /static/pyodide/ doesn't
// exist locally. Run `npm run fetch-pyodide-dev` once to vendor the bundle for
// offline / production-parity testing.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg':  'image/svg+xml; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.py':   'text/x-python; charset=utf-8',
  '.whl':  'application/zip',
  '.zip':  'application/zip',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
};

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  // Always set CORS-isolation headers for SharedArrayBuffer.
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // Pyodide bundle: try local, fall back to CDN proxy in dev.
  if (pathname.startsWith('/static/pyodide/')) {
    const local = path.join(ROOT, pathname);
    if (fs.existsSync(local)) {
      return serveFile(res, local);
    }
    const remote = PYODIDE_CDN + pathname.replace('/static/pyodide/', '');
    try {
      const response = await fetch(remote);
      if (!response.ok) {
        res.writeHead(response.status);
        res.end(`upstream ${response.status}: ${remote}`);
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
      const buf = Buffer.from(await response.arrayBuffer());
      res.end(buf);
      return;
    } catch (e) {
      res.writeHead(502);
      res.end(`bad gateway fetching ${remote}: ${e.message}`);
      return;
    }
  }

  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    return serveFile(res, file);
  }
  res.writeHead(404);
  res.end(`not found: ${pathname}`);
});

function serveFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  res.statusCode = 200;
  res.setHeader('Content-Type', mime);
  fs.createReadStream(file).pipe(res);
}

server.listen(PORT, () => {
  console.log(`while-playground dev server: http://localhost:${PORT}`);
  console.log(`(Pyodide proxied from ${PYODIDE_CDN} in dev unless /static/pyodide/ is populated)`);
});
