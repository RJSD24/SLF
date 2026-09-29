// Local preview server for SLF with auto-refresh.
// Run: node dev.mjs   then open http://localhost:8765
// Any change to a file in app/ reloads open pages automatically.
// It also listens on your Wi-Fi address so a phone on the same network can
// open the app (the address is printed at start).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app');
const PORT = 8765;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const RELOAD_SCRIPT = '<script>new EventSource("/__reload").onmessage = () => location.reload();</script>';

const clients = new Set();

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(ext === '.html' ? data.toString().replace('</body>', RELOAD_SCRIPT + '</body>') : data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('SLF preview: http://localhost:' + PORT);
  Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .forEach(i => console.log('On your phone (same Wi-Fi): http://' + i.address + ':' + PORT));
});

let timer = null;
fs.watch(ROOT, { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => clients.forEach(c => c.write('data: reload\n\n')), 150);
});
