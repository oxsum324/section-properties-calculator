#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = __dirname;
const vercelConfigPath = path.join(repoRoot, 'vercel.json');

const HOME_DESTINATION = '結構工具箱/index.html';

function loadVercelConfig() {
  if (!fs.existsSync(vercelConfigPath)) {
    return { rewrites: [] };
  }
  return JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
}

function contentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.ico': return 'image/x-icon';
    case '.webp': return 'image/webp';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    case '.ttf': return 'font/ttf';
    case '.txt': return 'text/plain; charset=utf-8';
    case '.pdf': return 'application/pdf';
    case '.wasm': return 'application/wasm';
    case '.map': return 'application/json; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function buildRewriteMap(config) {
  const map = new Map();
  for (const rewrite of config.rewrites || []) {
    if (rewrite.source && rewrite.destination) {
      map.set(rewrite.source, rewrite.destination);
    }
  }
  return map;
}

function safeDecode(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch (_) {
    return pathname;
  }
}

function resolveTarget(pathname, rewriteMap) {
  if (rewriteMap.has(pathname)) {
    return rewriteMap.get(pathname).replace(/^\/+/, '');
  }
  if (pathname === '/' || pathname === '') return HOME_DESTINATION;
  return safeDecode(pathname).replace(/^\/+/, '');
}

function tryCleanUrlVariants(rel) {
  const variants = [rel];
  if (rel && !path.extname(rel)) {
    variants.push(rel + '.html');
    variants.push(path.posix.join(rel, 'index.html'));
  }
  return variants;
}

function isInsideRepo(fullPath) {
  const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;
  return fullPath === repoRoot || fullPath.startsWith(rootWithSep);
}

function serve(req, res, rewriteMap) {
  const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
  const target = resolveTarget(requestUrl.pathname, rewriteMap);
  const candidates = tryCleanUrlVariants(target);

  for (const candidate of candidates) {
    const fullPath = path.resolve(repoRoot, candidate);
    if (!isInsideRepo(fullPath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        res.writeHead(200, {
          'Content-Type': contentType(fullPath),
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(fullPath).pipe(res);
        return;
      }
    } catch (_) { /* try next */ }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Not found: ${requestUrl.pathname}`);
}

function getPort() {
  const requested = Number(process.env.PORT || process.argv[2]);
  if (Number.isFinite(requested) && requested > 0) return Promise.resolve(requested);
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function openBrowser(url) {
  if (process.argv.includes('--no-open')) return;
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function main() {
  const config = loadVercelConfig();
  const rewriteMap = buildRewriteMap(config);
  const port = await getPort();
  const server = http.createServer((req, res) => serve(req, res, rewriteMap));

  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`[serve-local] serving ${repoRoot}`);
    console.log(`[serve-local] vercel.json rewrites: ${rewriteMap.size}`);
    console.log(`[serve-local] listening on ${url}`);
    console.log(`[serve-local] press Ctrl+C to stop`);
    openBrowser(url);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      console.log(`\n[serve-local] received ${signal}, shutting down`);
      server.close(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  console.error('[serve-local] failed:', err);
  process.exit(1);
});
