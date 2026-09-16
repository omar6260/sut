// Serveur statique minimal pour dist/ (aucune dépendance).
// Usage : node scripts/serve.mjs [--root dist] [--port 5173] [--coop]
//   --coop : ajoute Cross-Origin-Opener-Policy: same-origin + Cross-Origin-Embedder-Policy: require-corp (test C6)
import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', opt('--root', 'dist'));
const port = Number(opt('--port', process.env.PORT ?? 5173));
const coop = args.includes('--coop');

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.wasm': 'application/wasm',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    const headers = { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (coop) Object.assign(headers, { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}).listen(port, () => console.log(`serve : http://localhost:${port}  (${path.relative(process.cwd(), root) || '.'})`));
