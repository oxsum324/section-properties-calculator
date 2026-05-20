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

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(toolboxFile(relativePath), 'utf8'));
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

function startStaticServer(port) {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const requestedPath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || '結構工具箱/index.html';
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
      hasExportScript: scripts.includes('../local-quick-export.js'),
      hasCoreScript: scripts.includes(${JSON.stringify(path.basename(tool.core))}),
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

async function main() {
  const manifest = readJson('tools/local-quick-tools.manifest.json');
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
    server = await startStaticServer(serverPort);
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

    const homeUrl = `http://127.0.0.1:${serverPort}/${encodeURI('結構工具箱/index.html')}`;
    for (const viewport of viewports) {
      const label = viewport.key;
      const home = await navigateAndInspect(client, sessionId, homeUrl, viewport, homeExpression(manifest.tools));
      assert.deepEqual(home.errors, [], `${label} home console errors: ${home.errors.join(' | ')}`);
      assertHomeState(home.state, manifest.tools, label);

      for (const tool of manifest.tools) {
        const toolUrl = `http://127.0.0.1:${serverPort}/${encodeURI(`結構工具箱/${tool.html}`)}`;
        const result = await navigateAndInspect(client, sessionId, toolUrl, viewport, toolExpression(tool));
        assert.deepEqual(result.errors, [], `${label} ${tool.key} console errors: ${result.errors.join(' | ')}`);
        assertToolState(result.state, tool, label);
      }
    }

    await client.send('Browser.close').catch(() => {});
    console.log(`local quick browser smoke OK (${manifest.tools.length} tools, ${viewports.length} viewports)`);
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
