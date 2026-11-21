// Tiny static dev server for the VICEFRAME app.
// Serves only the app/ folder next to this file, Node standard library
// only, with caching switched off so edits show up on a plain refresh.

import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('./app/', import.meta.url));
const port = Number(process.env.PORT || 8080);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url || '/').split('?')[0]));
  const rel = path === '/' ? 'index.html' : path.replace(/^[/\\]+/, '');
  const file = join(appDir, rel);
  if (!file.startsWith(appDir)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    const body = readFileSync(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  }
});

server.listen(port, () => {
  console.log(`viceframe dev server: http://localhost:${port} (serving app/)`);
});
