// Server pengembangan sederhana tanpa dependensi: node tools/serve.js [port]
// Buka http://localhost:8080 di browser. Service worker dan IndexedDB berfungsi di localhost.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const port = Number(process.argv[2]) || 8080;
const TIPE = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = join(WEB, p);
    if (!f.startsWith(WEB)) throw new Error('di luar folder web');
    await stat(f);
    res.writeHead(200, { 'Content-Type': TIPE[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end('Tidak ditemukan'); }
}).listen(port, () => console.log(`Cikaracak: http://localhost:${port}`));
