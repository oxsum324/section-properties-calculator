const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const viewports = [
  { key: 'desktop', width: 1365, height: 900, mobile: false },
  { key: 'mobile', width: 390, height: 844, mobile: true },
];

function toolboxFile(relativePath) {
  return path.join(toolboxRoot, ...relativePath.split('/'));
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(toolboxFile(relativePath), 'utf8'));
}

function readRootJson(relativePath) {
  return JSON.parse(fs.readFileSync(repoFile(relativePath), 'utf8'));
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

function createRewriteMap(vercelConfig) {
  const rewriteMap = new Map();
  for (const rewrite of vercelConfig.rewrites || []) {
    if (rewrite.source && rewrite.destination) {
      rewriteMap.set(rewrite.source, rewrite.destination);
    }
  }
  return rewriteMap;
}

function resolveRequestPath(pathname, rewriteMap) {
  const rewrittenPath = rewriteMap.get(pathname) || pathname;
  return decodeURIComponent(rewrittenPath).replace(/^\/+/, '') || '結構工具箱/index.html';
}

function startStaticServer(port, vercelConfig) {
  const rewriteMap = createRewriteMap(vercelConfig);
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
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
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(fullPath) });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      if (message.error) {
        reject(new Error(`${message.error.message || 'CDP error'} ${message.error.data || ''}`.trim()));
      } else {
        resolve(message.result || {});
      }
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

function waitForEvent(client, sessionId, method, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    const unsubscribe = client.on(message => {
      if (message.sessionId === sessionId && message.method === method) {
        clearTimeout(timer);
        unsubscribe();
        resolve(message.params || {});
      }
    });
  });
}

function collectPageErrors(client, sessionId) {
  const errors = [];
  const unsubscribe = client.on(message => {
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails?.text || 'Runtime exception');
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const args = message.params.args || [];
      errors.push(args.map(arg => arg.value || arg.description || arg.type).join(' '));
    }
    if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
      errors.push(message.params.entry.text || 'Log error');
    }
  });
  return { errors, unsubscribe };
}

async function evaluate(client, sessionId, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId);

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluate failed');
  }
  return result.result.value;
}

async function navigateAndInspect(client, sessionId, url, viewport, expression) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  }, sessionId);

  const pageErrors = collectPageErrors(client, sessionId);
  const loaded = waitForEvent(client, sessionId, 'Page.loadEventFired', 15000);
  await client.send('Page.navigate', { url }, sessionId);
  await loaded;
  await delay(250);
  const state = await evaluate(client, sessionId, expression);
  pageErrors.unsubscribe();
  return { state, errors: pageErrors.errors };
}

function homeExpression(tools) {
  return `(() => {
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href'));
    const required = ${JSON.stringify(tools.map(tool => tool.indexHref))};
    return {
      title: document.title,
      requiredLinks: required.map(href => ({ href, exists: links.includes(href) })),
      hasLocalSection: document.body.innerText.includes('施工臨時設施 / 局部檢核'),
      hasNextToolsPanel: !!document.getElementById('nextToolsPanel'),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    };
  })()`;
}

function toolExpression(tool) {
  return `(() => {
    const text = (id) => document.getElementById(id)?.textContent?.replace(/\\s+/g, ' ').trim() || '';
    const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.getAttribute('src'));
    return {
      title: document.title,
      hasLabel: document.body.innerText.includes(${JSON.stringify(tool.label)}),
      hasCalcButton: !!document.getElementById('btnCalc'),
      hasJsonButton: !!document.getElementById('btnJson'),
      hasMetricGrid: !!document.getElementById('metricGrid'),
      hasCheckList: !!document.getElementById('checkList'),
      hasExportScript: scripts.includes('/結構工具箱/tools/local-quick-export.js'),
      hasCoreScript: scripts.includes(${JSON.stringify(`/結構工具箱/${tool.core}`)}),
      coreVersion: text('coreVersion'),
      banner: text('bannerStatus'),
      metricText: text('metricGrid'),
      checkText: text('checkList'),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    };
  })()`;
}

function jsonExportExpression() {
  return `(async () => {
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    const objectUrls = [];
    const downloads = [];
    const revoked = [];

    URL.createObjectURL = function (blob) {
      const url = 'blob:local-quick-smoke-' + objectUrls.length;
      objectUrls.push({ url, blob });
      return url;
    };
    URL.revokeObjectURL = function (url) {
      revoked.push(url);
    };
    HTMLAnchorElement.prototype.click = function () {
      downloads.push({
        download: this.download || '',
        href: this.getAttribute('href') || this.href || '',
        attached: document.body.contains(this)
      });
    };

    try {
      document.getElementById('btnJson').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const texts = await Promise.all(objectUrls.map(item => item.blob.text()));
      return {
        downloadCount: downloads.length,
        downloads,
        revoked,
        blobCount: objectUrls.length,
        blobTextLength: texts[0] ? texts[0].length : 0,
        payload: texts[0] ? JSON.parse(texts[0]) : null
      };
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
    }
  })()`;
}

function reportExpression() {
  return `(() => {
    const originalOpen = window.open;
    const opened = [];
    const writes = [];
    let documentOpened = false;
    let closed = false;
    let focused = false;

    window.open = function (url, target) {
      opened.push({ url: url || '', target: target || '' });
      return {
        document: {
          open() {
            documentOpened = true;
          },
          write(html) {
            writes.push(String(html || ''));
          },
          close() {
            closed = true;
          }
        },
        focus() {
          focused = true;
        }
      };
    };

    try {
      document.getElementById('btnPrint').click();
      const html = writes.join('');
      return {
        openCount: opened.length,
        opened,
        documentOpened,
        closed,
        focused,
        htmlLength: html.length,
        html
      };
    } finally {
      window.open = originalOpen;
    }
  })()`;
}

function assertHomeState(state, tools, label) {
  assert.equal(state.title, '結構工具箱', `${label} home title`);
  assert.ok(state.hasLocalSection, `${label} home local section`);
  assert.ok(state.hasNextToolsPanel, `${label} home next tools panel`);
  assert.equal(state.horizontalOverflow, false, `${label} home horizontal overflow`);
  for (const link of state.requiredLinks) {
    assert.equal(link.exists, true, `${label} home link exists: ${link.href}`);
  }
}

function assertToolState(state, tool, label) {
  assert.equal(state.title, tool.title.replace('<title>', '').replace('</title>', ''), `${label} ${tool.key} title`);
  assert.ok(state.hasLabel, `${label} ${tool.key} label`);
  assert.ok(state.hasCalcButton, `${label} ${tool.key} calc button`);
  assert.ok(state.hasJsonButton, `${label} ${tool.key} JSON button`);
  assert.ok(state.hasMetricGrid, `${label} ${tool.key} metric grid`);
  assert.ok(state.hasCheckList, `${label} ${tool.key} check list`);
  assert.ok(state.hasExportScript, `${label} ${tool.key} export script`);
  assert.ok(state.hasCoreScript, `${label} ${tool.key} core script`);
  assert.match(state.coreVersion, /^Core v0\.1\.0$/, `${label} ${tool.key} core version`);
  assert.ok(state.banner && state.banner !== '尚未計算', `${label} ${tool.key} initial calculation banner`);
  assert.ok(state.metricText.length > 20, `${label} ${tool.key} initial metrics`);
  assert.ok(state.checkText.length > 20, `${label} ${tool.key} initial checks`);
  assert.equal(state.horizontalOverflow, false, `${label} ${tool.key} horizontal overflow`);
}

function assertJsonExportState(state, tool, label) {
  assert.equal(state.downloadCount, 1, `${label} ${tool.key} JSON click count`);
  assert.equal(state.blobCount, 1, `${label} ${tool.key} JSON blob count`);
  assert.deepEqual(state.revoked, ['blob:local-quick-smoke-0'], `${label} ${tool.key} JSON revoke`);
  assert.match(state.downloads[0].download, new RegExp(`^${tool.key}-\\d{4}-\\d{2}-\\d{2}\\.json$`), `${label} ${tool.key} JSON filename`);
  assert.equal(state.downloads[0].href, 'blob:local-quick-smoke-0', `${label} ${tool.key} JSON href`);
  assert.equal(state.downloads[0].attached, true, `${label} ${tool.key} JSON anchor attached`);
  assert.ok(state.blobTextLength > 500, `${label} ${tool.key} JSON payload length`);
  assert.ok(state.payload, `${label} ${tool.key} JSON payload`);
  assert.equal(state.payload.tool.id, tool.key, `${label} ${tool.key} payload tool id`);
  assert.equal(state.payload.tool.name, tool.label, `${label} ${tool.key} payload tool name`);
  assert.equal(state.payload.tool.pageVersion, tool.pageVersion, `${label} ${tool.key} payload page version`);
  assert.equal(typeof state.payload.generatedAt, 'string', `${label} ${tool.key} payload generatedAt`);
  assert.match(state.payload.result.resultSchemaVersion, /\.result\.v0\.1$/, `${label} ${tool.key} payload result schema`);
  assert.equal(state.payload.result.provenance.core, tool.coreGlobal, `${label} ${tool.key} payload provenance core`);
  assert.ok(Array.isArray(state.payload.result.checks), `${label} ${tool.key} payload checks`);
  assert.ok(state.payload.result.checks.length >= 3, `${label} ${tool.key} payload checks count`);
  assert.ok(Array.isArray(state.payload.result.summary.primaryMetrics), `${label} ${tool.key} payload metrics`);
  assert.ok(state.payload.result.summary.primaryMetrics.length >= 3, `${label} ${tool.key} payload metrics count`);
}

function assertReportState(state, tool, label) {
  assert.equal(state.openCount, 1, `${label} ${tool.key} report open count`);
  assert.equal(state.opened[0].target, '_blank', `${label} ${tool.key} report target`);
  assert.equal(state.documentOpened, true, `${label} ${tool.key} report document open`);
  assert.equal(state.closed, true, `${label} ${tool.key} report document close`);
  assert.ok(state.htmlLength > 1500, `${label} ${tool.key} report HTML length`);
  [
    tool.label,
    '計算書',
    '計算核心',
    '輸入格式',
    '計算指紋',
    '適用範圍',
    '不適用範圍',
    '初估',
  ].forEach(needle => {
    assert.ok(state.html.includes(needle), `${label} ${tool.key} report includes ${needle}`);
  });
}

async function main() {
  const manifest = readJson('tools/local-quick-tools.manifest.json');
  const vercelConfig = readRootJson('vercel.json');
  const edgePath = EDGE_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert.ok(edgePath, `Microsoft Edge not found in: ${EDGE_CANDIDATES.join(', ')}`);
  assert.equal(typeof WebSocket, 'function', 'Node WebSocket support is required for CDP smoke');

  const serverPort = await getFreePort();
  const debugPort = await getFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-quick-edge-'));
  let server;
  let edge;
  let client;

  try {
    server = await startStaticServer(serverPort, vercelConfig);
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
    const attached = await client.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;
    await client.send('Page.enable', {}, sessionId);
    await client.send('Runtime.enable', {}, sessionId);
    await client.send('Log.enable', {}, sessionId);

    const homeCases = [
      { key: 'file-home', url: `http://127.0.0.1:${serverPort}/${encodeURI('結構工具箱/index.html')}` },
      { key: 'route-root', url: `http://127.0.0.1:${serverPort}/` },
      { key: 'route-platform', url: `http://127.0.0.1:${serverPort}/platform` },
    ];
    for (const viewport of viewports) {
      for (const homeCase of homeCases) {
        const label = `${viewport.key} ${homeCase.key}`;
        const home = await navigateAndInspect(client, sessionId, homeCase.url, viewport, homeExpression(manifest.tools));
        assert.deepEqual(home.errors, [], `${label} console errors: ${home.errors.join(' | ')}`);
        assertHomeState(home.state, manifest.tools, label);
      }

      for (const tool of manifest.tools) {
        const toolCases = [
          { key: 'file-tool', url: `http://127.0.0.1:${serverPort}/${encodeURI(`結構工具箱/${tool.html}`)}` },
          { key: 'route-tool', url: `http://127.0.0.1:${serverPort}${tool.route}` },
        ];
        for (const toolCase of toolCases) {
          const label = `${viewport.key} ${toolCase.key}`;
          const result = await navigateAndInspect(client, sessionId, toolCase.url, viewport, toolExpression(tool));
          assert.deepEqual(result.errors, [], `${label} ${tool.key} console errors: ${result.errors.join(' | ')}`);
          assertToolState(result.state, tool, label);
          if (toolCase.key === 'route-tool') {
            const exportState = await evaluate(client, sessionId, jsonExportExpression());
            assertJsonExportState(exportState, tool, label);
            const reportState = await evaluate(client, sessionId, reportExpression());
            assertReportState(reportState, tool, label);
          }
        }
      }
    }

    await client.send('Browser.close').catch(() => {});
    console.log(`local quick browser smoke OK (${manifest.tools.length} tools, ${viewports.length} viewports, clean routes)`);
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
    fs.rmSync(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
