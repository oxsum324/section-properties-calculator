const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function readRootJson(relativePath) {
  return JSON.parse(fs.readFileSync(repoFile(relativePath), 'utf8'));
}

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    if (eq === -1) {
      args[raw.slice(2)] = true;
    } else {
      args[raw.slice(2, eq)] = raw.slice(eq + 1);
    }
  }
  return args;
}

function contentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    default: return 'application/octet-stream';
  }
}

function createRouteMaps(vercelConfig) {
  const rewriteMap = new Map();
  const redirectMap = new Map();
  for (const rewrite of vercelConfig.rewrites || []) {
    if (rewrite.source && rewrite.destination) rewriteMap.set(rewrite.source, rewrite.destination);
  }
  for (const redirect of vercelConfig.redirects || []) {
    if (redirect.source && redirect.destination) redirectMap.set(redirect.source, redirect.destination);
  }
  return { rewriteMap, redirectMap };
}

function redirectLocation(destination) {
  const cleanDestination = destination.replace(/\.html$/i, '');
  return cleanDestination.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function resolveRequestPath(pathname, rewriteMap) {
  const routedPath = rewriteMap.get(pathname) || pathname;
  const relativePath = decodeURIComponent(routedPath).replace(/^\/+/, '') || '結構工具箱/index.html';
  if (relativePath.endsWith('/')) return `${relativePath}index.html`;
  if (path.extname(relativePath)) return relativePath;

  const candidates = [
    `${relativePath}.html`,
    path.join(relativePath, 'index.html'),
    relativePath,
  ];
  return candidates.find(candidate => fs.existsSync(path.resolve(repoRoot, candidate))) || relativePath;
}

function startStaticServer(port, vercelConfig) {
  const { rewriteMap, redirectMap } = createRouteMaps(vercelConfig);
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (redirectMap.has(requestUrl.pathname)) {
      res.writeHead(308, { Location: redirectLocation(redirectMap.get(requestUrl.pathname)) });
      res.end();
      return;
    }

    const requestedPath = resolveRequestPath(requestUrl.pathname, rewriteMap);
    const fullPath = path.resolve(repoRoot, requestedPath);
    const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;

    if (fullPath !== repoRoot && !fullPath.startsWith(rootWithSep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Not found: ${requestUrl.pathname}`);
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(fullPath), 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function removeDirectoryBestEffort(directoryPath) {
  const resolved = path.resolve(directoryPath);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir())), `refusing to remove non-temp directory: ${resolved}`);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      return;
    } catch (err) {
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(err.code)) throw err;
      await delay(250 * (attempt + 1));
    }
  }
}

async function waitForJson(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await delay(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function createCdpClient(webSocketUrl) {
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  const ws = new WebSocket(webSocketUrl);

  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message || 'CDP error'} ${message.error.data || ''}`.trim()));
      else resolve(message.result || {});
      return;
    }
    for (const listener of listeners) listener(message);
  });

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  return {
    async open() {
      await opened;
    },
    send(method, params = {}, sessionId) {
      const id = nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      ws.close();
    },
  };
}

function waitForEvent(client, sessionId, method, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const unsubscribe = client.on(message => {
      if (message.sessionId === sessionId && message.method === method) {
        clearTimeout(timer);
        unsubscribe();
        resolve(message.params || {});
      }
    });
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
  });
}

async function evaluate(client, sessionId, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  }
  return result.result?.value;
}

async function navigate(client, sessionId, url) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1365,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);
  const loaded = waitForEvent(client, sessionId, 'Page.loadEventFired', 15000);
  await client.send('Page.navigate', { url }, sessionId);
  await loaded;
}

function harvestExpression(tool, inputs, selectors, metricPaths) {
  return `(async () => {
    const settle = (frames = 3) => new Promise(resolve => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const inputs = ${JSON.stringify(inputs)};
    const selectors = ${JSON.stringify(selectors)};
    const metricPaths = ${JSON.stringify(metricPaths)};
    const normalizedText = node => (node?.textContent || '').replace(/\\s+/g, ' ').trim();
    const clip = (text, max = 6000) => text.length > max ? text.slice(0, max) + ' ...[truncated]' : text;
    const missingInputs = [];
    const applied = [];
    const prepareDynamicInput = (id, value) => {
      if (id === 'apType' && typeof syncTypeGroupFromValue === 'function') {
        syncTypeGroupFromValue(value);
      }
    };
    const setInput = (id, value) => {
      prepareDynamicInput(id, value);
      const el = document.getElementById(id);
      if (!el) {
        missingInputs.push(id);
        return;
      }
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else el.value = value == null ? '' : String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      applied.push(id);
    };
    for (const [id, value] of Object.entries(inputs)) setInput(id, value);
    const calc = document.getElementById(${JSON.stringify(tool.calcButton)});
    if (calc) {
      calc.click();
      await settle(4);
    }
    const selectorValues = {};
    const missingSelectors = [];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) {
        missingSelectors.push(selector);
        selectorValues[selector] = '';
      } else {
        selectorValues[selector] = normalizedText(node);
      }
    }
    const resultItems = {};
    document.querySelectorAll('.result-item[id]').forEach(item => {
      const label = normalizedText(item.querySelector('.label')) || item.id;
      const value = normalizedText(item.querySelector('.value')) || normalizedText(item);
      resultItems['#' + item.id + ' .value'] = { label, value };
    });
    const tables = Array.from(document.querySelectorAll('table[id]')).map(table => ({
      selector: '#' + table.id + ' tbody',
      text: normalizedText(table.querySelector('tbody') || table),
    }));
    const metricValues = {};
    const missingMetrics = [];
    const readMetric = path => {
      const parts = String(path || '').split('.').filter(Boolean);
      if (!parts.length) return undefined;
      const rootName = parts.shift();
      let value;
      try {
        value = eval(rootName);
      } catch (_) {
        missingMetrics.push(path);
        return undefined;
      }
      for (const part of parts) {
        if (value == null || !(part in Object(value))) {
          missingMetrics.push(path);
          return undefined;
        }
        value = value[part];
      }
      return value;
    };
    for (const metricPath of metricPaths) metricValues[metricPath] = readMetric(metricPath);
    const resultPanel = document.getElementById('resultPanel');
    return {
      missingCalc: !calc,
      applied,
      missingInputs,
      selectorValues,
      missingSelectors,
      resultItems,
      tables,
      metricValues,
      missingMetrics,
      resultText: clip(normalizedText(resultPanel || document.body), 6000),
      bodyTextPreview: clip(normalizedText(document.body), 4000),
    };
  })()`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = args.tool || args.key;
  assert.ok(key, 'Usage: node tools/formal-golden-harvest.js --tool=<key> [--case=<id>] [--inputs=<json>|--inputs64=<base64-json>] [--selectors=<csv>] [--metrics=<csv>]');

  const manifest = readRootJson('結構工具箱/tools/formal-tools.manifest.json');
  const tool = manifest.tools.find(item => item.key === key);
  assert.ok(tool, `unknown formal tool: ${key}`);
  const goldenCase = args.case ? (tool.goldenCases || []).find(item => item.id === args.case) : null;
  if (args.case) assert.ok(goldenCase, `unknown golden case for ${key}: ${args.case}`);

  const inputs = args.inputs64
    ? JSON.parse(Buffer.from(args.inputs64, 'base64').toString('utf8'))
    : args.inputs
      ? JSON.parse(args.inputs)
      : (goldenCase?.inputs || {});
  const selectors = args.selectors
    ? args.selectors.split(',').map(item => item.trim()).filter(Boolean)
    : Object.keys(goldenCase?.expectedSelectors || {});
  const metricPaths = args.metrics
    ? args.metrics.split(',').map(item => item.trim()).filter(Boolean)
    : Object.keys(goldenCase?.expectedMetrics || {});

  const edgePath = EDGE_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert.ok(edgePath, `Microsoft Edge not found in: ${EDGE_CANDIDATES.join(', ')}`);
  assert.equal(typeof WebSocket, 'function', 'Node WebSocket support is required for CDP harvest');

  const serverPort = await getFreePort();
  const debugPort = await getFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'formal-harvest-edge-'));
  let server;
  let edge;
  let client;

  try {
    server = await startStaticServer(serverPort, readRootJson('vercel.json'));
    edge = spawn(edgePath, [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-gpu',
      'about:blank',
    ], {
      stdio: 'ignore',
      windowsHide: true,
    });

    const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`, 15000);
    client = createCdpClient(version.webSocketDebuggerUrl);
    await client.open();
    const target = await client.send('Target.createTarget', { url: 'about:blank' });
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;
    const dialogs = [];
    const unsubscribeDialogs = client.on(message => {
      if (message.sessionId !== sessionId || message.method !== 'Page.javascriptDialogOpening') return;
      dialogs.push({
        type: message.params.type || 'dialog',
        message: message.params.message || ''
      });
      client.send('Page.handleJavaScriptDialog', { accept: true }, sessionId).catch(() => {});
    });
    await client.send('Page.enable', {}, sessionId);
    await client.send('Runtime.enable', {}, sessionId);

    const url = `http://127.0.0.1:${serverPort}${tool.route}`;
    await navigate(client, sessionId, url);
    const state = await evaluate(client, sessionId, harvestExpression(tool, inputs, selectors, metricPaths));
    unsubscribeDialogs();
    console.log(JSON.stringify({
      tool: tool.key,
      case: goldenCase?.id || null,
      route: tool.route,
      url,
      inputs,
      selectors,
      metrics: metricPaths,
      dialogs,
      state,
    }, null, 2));
    await client.send('Browser.close').catch(() => {});
  } finally {
    if (client) client.close();
    if (edge && edge.exitCode === null) {
      edge.kill();
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 1500);
        edge.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (server) await new Promise(resolve => server.close(resolve));
    await removeDirectoryBestEffort(userDataDir);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
