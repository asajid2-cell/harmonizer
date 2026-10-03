// ITEM B web side: render a case through the real frontend/jremix.js player in headless
// Chrome's Web Audio implementation, and write the interleaved float32 result.
//
// The page (render_page.html) is served from a loopback HTTP server, along with the
// unmodified product player at /jremix.js and the case JSON at /case.  When the page has
// finished rendering it POSTs the raw float32 back to /result; this driver writes that to
// --out and shuts Chrome down.  No third-party browser-automation package is used.
//
//   node web_render.mjs --case case.json --out web.f32 [--chrome <path>] [--timeout 120000]

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLAYER = resolve(HERE, '../../../frontend/jremix.js');
const PAGE = join(HERE, 'render_page.html');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function parseArgs(argv) {
  const args = { timeout: 120000 };
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv);
if (!args.out) {
  console.error('usage: node web_render.mjs --out <web.f32> [--case <case.json>] [--page <page.html>] [--chrome <path>] [--timeout ms]');
  process.exit(2);
}
if (!existsSync(PLAYER)) {
  console.error(`web_render: product player not found at ${PLAYER}`);
  process.exit(2);
}

const chrome = args.chrome || CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('web_render: no Chrome found; pass --chrome <path>');
  process.exit(2);
}

const caseBody = args.case ? readFileSync(args.case) : null;
const pageBody = readFileSync(args.page || PAGE);
const playerBody = readFileSync(PLAYER);

let settle;
const done = new Promise((res) => { settle = res; });

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pageBody);
  } else if (req.method === 'GET' && req.url === '/jremix.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    res.end(playerBody);
  } else if (req.method === 'GET' && req.url === '/case' && caseBody) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(caseBody);
  } else if (req.method === 'POST' && req.url === '/result') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const b64 = Buffer.concat(chunks).toString('ascii');
      writeFileSync(args.out, Buffer.from(b64, 'base64'));
      res.writeHead(200); res.end('ok');
      settle({ ok: true });
    });
  } else {
    res.writeHead(404); res.end();
  }
});

const profileDir = mkdtempSync(join(tmpdir(), 'web-render-'));
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const port = server.address().port;

const child = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profileDir}`,
  `http://127.0.0.1:${port}/`,
], { stdio: ['ignore', 'ignore', 'pipe'] });

let stderr = '';
child.stderr.on('data', (d) => { stderr += d.toString(); });

const timer = setTimeout(() => settle({ ok: false, error: 'timeout' }), Number(args.timeout));
const result = await done;
clearTimeout(timer);
try { child.kill('SIGKILL'); } catch {}
server.close();
try { rmSync(profileDir, { recursive: true, force: true }); } catch {}

if (!result.ok) {
  console.error(`web_render: ${result.error}`);
  if (stderr.trim()) console.error(stderr.trim().split('\n').slice(-15).join('\n'));
  process.exit(1);
}
console.log(`web_render: ${args.out} (${readFileSync(args.out).length} bytes)`);
