// A tiny static server for game/ (Node 22, standard library only), so the
// entry can be played locally without a build step: `node serve.ts` serves
// game/ on http://localhost:8080. It sends the MIME types a browser game
// needs, refuses any path outside game/, and otherwise does nothing clever:
// this is a development convenience, not a web server for the internet.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  const joined = normalize(join(root, urlPath === '/' ? 'index.html' : urlPath));
  if (!joined.startsWith(root + sep) && joined !== root) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  let stat;
  try {
    stat = statSync(joined);
  } catch {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  if (!stat.isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': MIME[extname(joined)] ?? 'application/octet-stream' });
  createReadStream(joined).pipe(response);
}).listen(port, () => {
  console.log(`COCO BRAWL served at http://localhost:${port}`);
});
