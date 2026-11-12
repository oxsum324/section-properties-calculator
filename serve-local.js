#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = __dirname;
const vercelConfigPath = path.join(repoRoot, 'vercel.json');

const HOME_DESTINATION = '結構工具箱/index.html';
const LOCAL_OPTIONAL_JSON_PATHS = new Set([
  'pages-deployment.json',
  'output/audit/gsm-lifecycle-monitor-status.json',
  'output/audit/gsm-lifecycle-monitor-history.json',
  'output/audit/gsm-lifecycle-monitor-task-status.json',
]);

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
    case '.webmanifest': return 'application/manifest+json; charset=utf-8';
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

function buildRouteMaps(config) {
  const rewriteMap = new Map();
  const redirectMap = new Map();
  for (const r of config.rewrites || []) {
    if (r.source && r.destination) rewriteMap.set(r.source, r.destination);
  }
  for (const r of config.redirects || []) {
    if (r.source && r.destination) redirectMap.set(r.source, r.destination);
  }
  return { rewriteMap, redirectMap };
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

function stripExt(destination) {
  return destination.replace(/\.html$/i, '');
}

function encodeLocationPath(pathname) {
  return pathname
    .split('/')
    .map(segment => encodeURIComponent(safeDecode(segment)))
    .join('/');
}

function redirectDestination(destination) {
  let pathname = stripExt(destination);
  const relative = safeDecode(pathname).replace(/^\/+/, '').replace(/\/+$/, '');
  const fullPath = path.resolve(repoRoot, relative);
  if (relative && isInsideRepo(fullPath)) {
    try {
      if (fs.statSync(fullPath).isDirectory() && !pathname.endsWith('/')) {
        pathname += '/';
      }
    } catch (_) { /* keep the configured clean-file destination */ }
  }
  return pathname;
}

function trailingSlashCanonical(pathname, rewriteMap, redirectMap) {
  if (pathname.length <= 1 || !pathname.endsWith('/')) return '';
  const candidate = pathname.replace(/\/+$/, '');
  if (!rewriteMap.has(candidate) && !redirectMap.has(candidate)) return '';

  // A route such as /anchor intentionally redirects to the real /anchor/
  // directory. Keep that destination stable instead of creating a loop.
  const configuredDestination = redirectMap.get(candidate);
  if (configuredDestination && redirectDestination(configuredDestination) === pathname) {
    return '';
  }
  return candidate;
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

function serveMissingOptionalJson(pathname, res) {
  const relative = safeDecode(pathname).replace(/^\/+/, '').replace(/\\/g, '/');
  if (!LOCAL_OPTIONAL_JSON_PATHS.has(relative)) return false;
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Local-Optional-Resource': 'missing',
  });
  res.end('null\n');
  return true;
}

function serve(req, res, rewriteMap, redirectMap) {
  const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = requestUrl.pathname;

  if (redirectMap.has(pathname)) {
    const destination = redirectDestination(redirectMap.get(pathname));
    res.writeHead(308, { Location: `${encodeLocationPath(destination)}${requestUrl.search}` });
    res.end();
    return;
  }

  const canonicalPathname = trailingSlashCanonical(pathname, rewriteMap, redirectMap);
  if (canonicalPathname) {
    res.writeHead(308, { Location: `${encodeLocationPath(canonicalPathname)}${requestUrl.search}` });
    res.end();
    return;
  }

  const target = resolveTarget(pathname, rewriteMap);
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

  if (serveMissingOptionalJson(pathname, res)) return;

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Not found: ${requestUrl.pathname}`);
}

function getPort() {
  const positionalPort = process.argv.slice(2).find(arg => /^\d+$/.test(arg));
  const requested = Number(process.env.PORT || positionalPort);
  if (!process.env.PORT && !positionalPort) return 0;
  if (!Number.isInteger(requested) || requested < 0 || requested > 65535) {
    throw new Error('Port must be an integer from 0 to 65535.');
  }
  return requested;
}

function getLaunchRoute() {
  const routeIndex = process.argv.indexOf('--route');
  const rawRoute = routeIndex >= 0 ? process.argv[routeIndex + 1] : '/';
  if (!rawRoute || !rawRoute.startsWith('/') || rawRoute.startsWith('//')) {
    throw new Error('--route must be a local absolute path such as /anchor or /section');
  }
  const routeUrl = new URL(rawRoute, 'http://127.0.0.1');
  if (routeUrl.origin !== 'http://127.0.0.1') {
    throw new Error('--route must stay on the local server');
  }
  return `${routeUrl.pathname}${routeUrl.search}${routeUrl.hash}`;
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

// 舊水準草稿依附 127.0.0.1:4187 與原有 PWA scope；只替換該 scope 的資產來源。
function levelSurveyHandler() {
  const dir = path.resolve(process.env.LEVEL_SURVEY_DIR || path.join(repoRoot, '_tmp/水準測量工具/level-survey-recorder'));
  if (!fs.existsSync(path.join(dir, 'sw.js'))) throw new Error('找不到水準測量獨立工具，請以 LEVEL_SURVEY_DIR 指定工作目錄。');
  const worker = fs.readFileSync(path.join(dir,'sw.js'),'utf8');
  const literal = /\bconst\s+APP_FILES\s*=\s*\[([^\]]*)\]/.exec(worker);
  if (!literal) throw new Error('無法讀取水準工具的離線資產清單。');
  const names = new Set(['sw.js','test-cases/demo-case.json']);
  for (const [,file] of literal[1].matchAll(/['"]\.\/([^'"]*)['"]/g)) {
    if (file && file.split('/').every(part => /^[\w.-]+$/.test(part) && !part.startsWith('.'))) names.add(file);
  }
  if (!names.has('index.html') || !names.has('app.js')) throw new Error('水準工具離線清單缺少頁面或應用程式。');
  return (req,res) => {
    const prefix='/level-survey/';
    const url=new URL(req.url||'/', 'http://127.0.0.1');
    const file=url.pathname.startsWith(prefix) ? (safeDecode(url.pathname.slice(prefix.length)) || 'index.html') : '';
    if (!names.has(file)) { res.writeHead(404);res.end();return; }
    const fullPath=path.join(dir,file);
    fs.readFile(fullPath,(error,data)=>{
      if(error) { res.writeHead(404);res.end();return; }
      res.writeHead(200,{'Content-Type':contentType(fullPath),'Cache-Control':'no-cache'});res.end(data);
    });
  };
}

async function main() {
  const config = loadVercelConfig();
  const { rewriteMap, redirectMap } = buildRouteMaps(config);
  const port = getPort();
  const launchRoute = getLaunchRoute();
  const levelLaunch = process.argv.includes('--level-survey') || new URL(launchRoute,'http://127.0.0.1').pathname === '/level-survey/index.html';
  const server = http.createServer(levelLaunch ? levelSurveyHandler() : (req, res) => serve(req, res, rewriteMap, redirectMap));

  server.once('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? `[serve-local] 埠 ${port} 已在使用。若已開啟本工具，請回到原視窗；另選埠時，兩個工具須由同一個本機網址開啟。`
      : `[serve-local] ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}${launchRoute}`;
    console.log(`[serve-local] serving ${repoRoot}`);
    console.log(`[serve-local] vercel.json rewrites: ${rewriteMap.size}, redirects: ${redirectMap.size}`);
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
