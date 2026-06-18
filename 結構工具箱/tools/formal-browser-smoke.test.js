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

const viewports = [
  { key: 'desktop', width: 1365, height: 900, mobile: false },
  { key: 'mobile', width: 390, height: 844, mobile: true },
];

const formalManifest = readRootJson('結構工具箱/tools/formal-tools.manifest.json');
const formalTools = formalManifest.tools;
const requiredFormalRoutes = formalManifest.requiredRoutes;

function assertFormalToolCoverage() {
  assert.equal(formalManifest.family, 'formal-tools', 'formal browser smoke manifest family');
  assert.equal(formalManifest.version, '0.1.0', 'formal browser smoke manifest version');
  assert.ok(Array.isArray(formalTools), 'formal browser smoke manifest tools');
  assert.ok(Array.isArray(requiredFormalRoutes), 'formal browser smoke manifest required routes');
  const coveredRoutes = new Set(formalTools.map(tool => tool.route));
  for (const route of requiredFormalRoutes) {
    assert.ok(coveredRoutes.has(route), `formal browser smoke missing route: ${route}`);
  }
  assert.equal(
    coveredRoutes.size,
    requiredFormalRoutes.length,
    'formal browser smoke should keep required route list and tool list in sync'
  );
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
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
  console.warn(`Warning: could not remove temporary Edge profile: ${resolved}`);
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

function collectPageErrors(client, sessionId) {
  const errors = [];
  const unsubscribe = client.on(message => {
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push({
        source: 'exception',
        text: message.params.exceptionDetails?.text || 'Runtime exception',
        url: message.params.exceptionDetails?.url || '',
      });
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const args = message.params.args || [];
      errors.push({
        source: 'console',
        text: args.map(arg => arg.value || arg.description || arg.type).join(' '),
        url: '',
      });
    }
    if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
      errors.push({
        source: 'log',
        text: message.params.entry.text || 'Log error',
        url: message.params.entry.url || '',
      });
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

async function navigate(client, sessionId, url, viewport) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  }, sessionId);
  const pageErrors = collectPageErrors(client, sessionId);
  const loaded = waitForEvent(client, sessionId, 'Page.loadEventFired');
  await client.send('Page.navigate', { url }, sessionId);
  await loaded;
  await delay(300);
  return pageErrors;
}

function pageStateExpression(tool) {
  return `(async () => {
    const text = document.body.innerText;
    const byId = id => document.getElementById(id);
    const calc = ${JSON.stringify(tool.calcButton)};
    const reportId = ${JSON.stringify(tool.reportButton || null)};
    const reportSelector = ${JSON.stringify(tool.reportButtonSelector || null)};
    const exportId = ${JSON.stringify(tool.exportButton || null)};
    if (calc && byId(calc)) {
      byId(calc).click();
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    const modeStates = [];
    for (const mode of ['simple', 'detail']) {
      const button = document.querySelector('[data-report-mode="' + mode + '"]');
      if (button) {
        button.click();
        await new Promise(resolve => setTimeout(resolve, 30));
        modeStates.push({
          mode,
          hiddenValue: byId('printReportMode')?.value || '',
          pressed: button.getAttribute('aria-pressed') || ''
        });
      }
    }
    const diagram = ${JSON.stringify(tool.diagramSelector)}
      ? document.querySelector(${JSON.stringify(tool.diagramSelector)})
      : null;
    const diagramBox = diagram ? diagram.getBoundingClientRect() : null;
    const diagramRoles = Array.from(document.querySelectorAll('[data-diagram-role]'))
      .map(node => node.getAttribute('data-diagram-role') || '');
    const boxPayload = box => box ? ({
      left: Math.round(box.left * 10) / 10,
      top: Math.round(box.top * 10) / 10,
      right: Math.round(box.right * 10) / 10,
      bottom: Math.round(box.bottom * 10) / 10,
      width: Math.round(box.width * 10) / 10,
      height: Math.round(box.height * 10) / 10
    }) : null;
    const svgClientBox = node => {
      try {
        if (!node.ownerSVGElement || typeof node.getBBox !== 'function' || typeof node.getScreenCTM !== 'function') return null;
        const bbox = node.getBBox();
        const matrix = node.getScreenCTM();
        if (!matrix || (bbox.width <= 0 && bbox.height <= 0)) return null;
        const makePoint = (x, y) => {
          const point = node.ownerSVGElement.createSVGPoint();
          point.x = x;
          point.y = y;
          return point.matrixTransform(matrix);
        };
        const points = [
          makePoint(bbox.x, bbox.y),
          makePoint(bbox.x + bbox.width, bbox.y),
          makePoint(bbox.x, bbox.y + bbox.height),
          makePoint(bbox.x + bbox.width, bbox.y + bbox.height)
        ];
        const xs = points.map(point => point.x);
        const ys = points.map(point => point.y);
        let left = Math.min(...xs);
        let right = Math.max(...xs);
        let top = Math.min(...ys);
        let bottom = Math.max(...ys);
        const strokeWidth = Number.parseFloat(getComputedStyle(node).strokeWidth || '1') || 1;
        if (right - left <= 0.5) {
          left -= strokeWidth / 2;
          right += strokeWidth / 2;
        }
        if (bottom - top <= 0.5) {
          top -= strokeWidth / 2;
          bottom += strokeWidth / 2;
        }
        return { left, top, right, bottom, width: right - left, height: bottom - top };
      } catch (_) {
        return null;
      }
    };
    const mergeBoxes = boxes => {
      const usable = boxes.filter(Boolean).filter(box => box.width > 0.5 && box.height > 0.5);
      if (!usable.length) return null;
      const left = Math.min(...usable.map(box => box.left));
      const top = Math.min(...usable.map(box => box.top));
      const right = Math.max(...usable.map(box => box.right));
      const bottom = Math.max(...usable.map(box => box.bottom));
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    const childClientBox = node => {
      const boxes = Array.from(node.querySelectorAll('*')).map(child => {
        const rect = child.getBoundingClientRect();
        return rect.width > 0.5 && rect.height > 0.5 ? rect : svgClientBox(child);
      });
      return mergeBoxes(boxes);
    };
    const roleBoxes = Array.from(document.querySelectorAll('[data-diagram-role]'))
      .map(node => {
        const role = node.getAttribute('data-diagram-role') || '';
        const rect = node.getBoundingClientRect();
        const box = rect.width > 0.5 && rect.height > 0.5 ? rect : svgClientBox(node) || childClientBox(node);
        return { role, box: boxPayload(box) };
      });
    const overflowing = Array.from(document.querySelectorAll('body *'))
      .filter(node => node.scrollWidth > node.clientWidth + 2 || node.getBoundingClientRect().right > document.documentElement.clientWidth + 2)
      .slice(0, 12)
      .map(node => ({
        tag: node.tagName,
        id: node.id || '',
        className: typeof node.className === 'string' ? node.className : '',
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        right: Math.round(node.getBoundingClientRect().right),
        text: (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
      }));
    return {
      title: document.title,
      bodyText: text.slice(0, 12000),
      hasFamily: text.includes(${JSON.stringify(tool.familyNeedle)}),
      hasTitleNeedle: text.includes(${JSON.stringify(tool.titleNeedle)}) || document.title.includes(${JSON.stringify(tool.titleNeedle)}),
      hasCalc: !calc || !!byId(calc),
      hasReport: reportId ? !!byId(reportId) : !!document.querySelector(reportSelector),
      hasExport: !exportId || !!byId(exportId),
      hasReportMode: !!byId('btnReportModeDetail') && !!byId('btnReportModeSimple'),
      modeStates,
      diagramExists: ${JSON.stringify(tool.diagramSelector)} ? !!diagram : true,
      diagramWidth: diagramBox ? diagramBox.width : 0,
      diagramHeight: diagramBox ? diagramBox.height : 0,
      diagramBounds: boxPayload(diagramBox),
      diagramRoles,
      roleBoxes,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      visibleTextLength: text.length
      , overflowing
    };
  })()`;
}

function reportCaptureExpression(tool, mode = null) {
  return `(async () => {
    const originalOpen = window.open;
    const reportId = ${JSON.stringify(tool.reportButton || null)};
    const reportSelector = ${JSON.stringify(tool.reportButtonSelector || null)};
    const reportMode = ${JSON.stringify(mode)};
    const opened = [];
    const writes = [];
    let openedDocument = false;
    let closedDocument = false;
    window.open = function (url, target, features) {
      opened.push({ url: url || '', target: target || '', features: features || '' });
      return {
        document: {
          open() { openedDocument = true; },
          write(html) { writes.push(String(html || '')); },
          close() { closedDocument = true; }
        },
        focus() {}
      };
    };

    try {
      if (reportMode) {
        const modeButton = document.querySelector('[data-report-mode="' + reportMode + '"]');
        if (modeButton) {
          modeButton.click();
          await new Promise(resolve => setTimeout(resolve, 30));
        }
      } else {
        const detail = document.querySelector('[data-report-mode="detail"]');
        if (detail) detail.click();
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      const button = reportId ? document.getElementById(reportId) : document.querySelector(reportSelector);
      if (!button) return { missingButton: true, html: '' };
      button.click();
      await new Promise(resolve => setTimeout(resolve, 50));
      const html = writes.join('');
      return {
        mode: reportMode || 'default',
        missingButton: false,
        openCount: opened.length,
        opened,
        openedDocument,
        closedDocument,
        html,
        auditHtml: html.replace(/data:image\\/png;base64,[^"'\\s<>]+/g, 'data:image/png;base64,[omitted]')
      };
    } finally {
      window.open = originalOpen;
    }
  })()`;
}

function exportCaptureExpression(tool) {
  return `(async () => {
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    const originalClick = HTMLAnchorElement.prototype.click;
    const objectUrls = [];
    const downloads = [];
    const revoked = [];

    URL.createObjectURL = function (blob) {
      const url = 'blob:formal-smoke-' + objectUrls.length;
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
      const button = document.getElementById(${JSON.stringify(tool.exportButton)});
      if (!button) return { missingButton: true, downloads: [], payload: null, textLength: 0 };
      button.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const text = objectUrls[0] ? await objectUrls[0].blob.text() : '';
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch (_) {}
      return {
        missingButton: false,
        downloadCount: downloads.length,
        downloads,
        revoked,
        blobCount: objectUrls.length,
        textLength: text.length,
        payload,
        textSample: text.slice(0, 300)
      };
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  })()`;
}

function jsonRoundTripExpression(tool, sourcePayload) {
  return `(async () => {
    const payload = ${JSON.stringify(sourcePayload || null)};
    if (!payload || typeof payload !== 'object') {
      return { missingPayload: true, mismatches: [], resultSelectors: {} };
    }

    const payloadValues = payload.values || payload.inputs?.values || {};
    const payloadChecks = payload.inputs?.checks || {};
    const valueIds = Object.keys(payloadValues);
    const checkIds = Object.keys(payloadChecks);
    const payloadSchema = payload.schema || payload.schemaVersion || '';
    const payloadToolId = payload.tool?.id || String(payloadSchema).split('.case.')[0] || '';
    const projectIds = {
      name: 'projName',
      no: 'projNo',
      designer: 'projDesigner'
    };
    const expected = {};
    const actual = {};
    const mismatches = [];
    const mutated = [];
    const readValue = id => {
      const el = document.getElementById(id);
      if (!el) return undefined;
      return el.type === 'checkbox' ? el.checked : el.value;
    };
    const writeValue = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return false;
      if (el.type === 'checkbox') {
        el.checked = Boolean(value);
      } else {
        el.value = value == null ? '' : String(value);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const expectedFor = (id, value) => {
      const el = document.getElementById(id);
      return el && el.type === 'checkbox' ? Boolean(value) : String(value ?? '');
    };
    const collectResultValues = () => Array.from(document.querySelectorAll('.result-item .value, .mini-card .value'))
      .map(node => (node.textContent || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean);
    const mutate = id => {
      const el = document.getElementById(id);
      if (!el) return;
      let next;
      if (el.type === 'checkbox') {
        next = !el.checked;
      } else if (el.tagName === 'SELECT') {
        const alternate = Array.from(el.options).map(option => option.value).find(value => value !== el.value);
        next = alternate ?? el.value;
      } else if (el.type === 'number') {
        next = String((Number(el.value) || 0) + 7.25);
      } else {
        next = 'roundtrip-mutated';
      }
      if (writeValue(id, next)) mutated.push(id);
    };

    for (const [key, id] of Object.entries(projectIds)) {
      expected['project.' + key] = expectedFor(id, payload.project?.[key]);
      mutate(id);
    }
    for (const id of valueIds) {
      expected['values.' + id] = expectedFor(id, payloadValues[id]);
      mutate(id);
    }
    for (const id of checkIds) {
      expected['checks.' + id] = expectedFor(id, payloadChecks[id]);
      mutate(id);
    }

    const fileInput = document.getElementById('caseJsonFile');
    const file = new File([JSON.stringify(payload)], ${JSON.stringify(tool.key)} + '-roundtrip.json', { type: 'application/json' });
    let usedFileInput = false;
    let usedDirectImport = false;
    let importError = '';
    if (fileInput && typeof DataTransfer === 'function') {
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        usedFileInput = true;
      } catch (err) {
        importError = err && err.message ? err.message : String(err);
      }
    }
    if (!usedFileInput && typeof importCaseJsonFile === 'function') {
      importCaseJsonFile(file);
      usedDirectImport = true;
    }
    await new Promise(resolve => setTimeout(resolve, 260));

    let recalculatedAfterImport = false;
    let resultValues = collectResultValues();
    if (!resultValues.some(value => value !== '—')) {
      const calc = document.getElementById(${JSON.stringify(tool.calcButton)});
      if (calc) {
        calc.click();
        recalculatedAfterImport = true;
        await new Promise(resolve => setTimeout(resolve, 220));
        resultValues = collectResultValues();
      }
    }

    for (const [key, id] of Object.entries(projectIds)) {
      actual['project.' + key] = readValue(id);
    }
    for (const id of valueIds) {
      actual['values.' + id] = readValue(id);
    }
    for (const id of checkIds) {
      actual['checks.' + id] = readValue(id);
    }
    for (const [key, expectedValue] of Object.entries(expected)) {
      const actualValue = actual[key];
      const matches = typeof expectedValue === 'boolean'
        ? actualValue === expectedValue
        : String(actualValue ?? '') === String(expectedValue);
      if (!matches) mismatches.push({ key, expected: expectedValue, actual: actualValue });
    }

    const text = selector => (document.querySelector(selector)?.textContent || '').replace(/\\s+/g, ' ').trim();
    const caseStatus = text('#caseStatus') || text('#caseJsonStatus') || text('#staticImportStatus');
    return {
      missingPayload: false,
      missingFileInput: !fileInput,
      usedFileInput,
      usedDirectImport,
      importError,
      mutatedCount: mutated.length,
      expectedCount: Object.keys(expected).length,
      recalculatedAfterImport,
      mismatches,
      caseStatus,
      resultSelectors: {
        '#r-cf .value': text('#r-cf .value'),
        '#r-qz .value': text('#r-qz .value'),
        '#r-force .value': text('#r-force .value')
      },
      resultValues,
      payloadSchema,
      payloadToolId
    };
  })()`;
}

function goldenCaseExpression(tool, goldenCase) {
  const inputs = goldenCase.inputs || {};
  const expectedSelectors = Object.keys(goldenCase.expectedSelectors || {});
  const expectedMetricPaths = Object.keys(goldenCase.expectedMetrics || {});
  const clearLocalStorageKeys = goldenCase.clearLocalStorageKeys || [];
  return `(async () => {
    const inputs = ${JSON.stringify(inputs)};
    const expectedSelectors = ${JSON.stringify(expectedSelectors)};
    const expectedMetricPaths = ${JSON.stringify(expectedMetricPaths)};
    const clearLocalStorageKeys = ${JSON.stringify(clearLocalStorageKeys)};
    const calc = document.getElementById(${JSON.stringify(tool.calcButton)});
    const applied = [];
    const missingInputs = [];
    for (const key of clearLocalStorageKeys) {
      try {
        localStorage.removeItem(key);
      } catch (_) {}
    }
    const setInput = (id, value) => {
      const el = document.getElementById(id);
      if (!el) {
        missingInputs.push(id);
        return;
      }
      if (el.type === 'checkbox') {
        el.checked = Boolean(value);
      } else {
        el.value = value == null ? '' : String(value);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      applied.push(id);
    };
    for (const [id, value] of Object.entries(inputs)) setInput(id, value);
    if (calc) {
      calc.click();
      await new Promise(resolve => setTimeout(resolve, 180));
    }
    const normalizedText = node => (node?.textContent || '').replace(/\\s+/g, ' ').trim();
    const selectorValues = {};
    const missingSelectors = [];
    for (const selector of expectedSelectors) {
      const node = document.querySelector(selector);
      if (!node) {
        missingSelectors.push(selector);
        selectorValues[selector] = '';
      } else {
        selectorValues[selector] = normalizedText(node);
      }
    }
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
    for (const path of expectedMetricPaths) {
      metricValues[path] = readMetric(path);
    }
    const resultPanel = document.getElementById('resultPanel');
    return {
      missingCalc: !calc,
      applied,
      missingInputs,
      selectorValues,
      missingSelectors,
      metricValues,
      missingMetrics,
      bodyText: normalizedText(document.body),
      resultText: normalizedText(resultPanel || document.body)
    };
  })()`;
}

function assertPageState(state, tool, label) {
  assert.equal(state.hasFamily, true, `${label} ${tool.key} family label`);
  assert.equal(state.hasTitleNeedle, true, `${label} ${tool.key} title label`);
  assert.equal(state.hasCalc, true, `${label} ${tool.key} calc button`);
  assert.equal(state.hasReport, true, `${label} ${tool.key} report button`);
  assert.equal(state.hasExport, true, `${label} ${tool.key} export button`);
  assert.equal(state.horizontalOverflow, false, `${label} ${tool.key} horizontal overflow: ${JSON.stringify(state.overflowing, null, 2)}`);
  assert.ok(state.visibleTextLength > 500, `${label} ${tool.key} visible content`);

  if (tool.reportMode) {
    assert.equal(state.hasReportMode, true, `${label} ${tool.key} report mode controls`);
    assert.deepEqual(
      state.modeStates.map(mode => `${mode.mode}:${mode.hiddenValue}:${mode.pressed}`),
      ['simple:simple:true', 'detail:detail:true'],
      `${label} ${tool.key} report mode toggles`
    );
  }

  assert.equal(state.diagramExists, true, `${label} ${tool.key} diagram exists`);
  if (tool.diagramSelector) {
    assert.ok(state.diagramWidth > 120, `${label} ${tool.key} diagram width`);
    assert.ok(state.diagramHeight > 80, `${label} ${tool.key} diagram height`);
    for (const role of tool.diagramRoleNeedles) {
      assert.ok(state.diagramRoles.includes(role), `${label} ${tool.key} diagram role: ${role}`);
    }
  }

  assertDiagramGeometry(state, tool, label);

  [
    '工具內建',
    '工具建議',
    '專業版',
    'undefined',
    'NaN',
  ].forEach(needle => {
    assert.equal(state.bodyText.includes(needle), false, `${label} ${tool.key} page avoids ${needle}`);
  });
}

function assertDiagramGeometry(state, tool, label) {
  const checks = tool.diagramChecks || {};
  if (!tool.diagramSelector || !checks.roleBoxesNonZero && !checks.rolesInsideDiagram) return;
  assert.ok(state.diagramBounds, `${label} ${tool.key} diagram bounds`);

  const roleBoxes = state.roleBoxes || [];
  const roles = tool.diagramRoleNeedles || [];
  for (const role of roles) {
    const candidates = roleBoxes.filter(item => item.role === role && item.box);
    assert.ok(candidates.length > 0, `${label} ${tool.key} geometry role exists: ${role}`);
    const usable = candidates.find(item => item.box.width > 0.5 && item.box.height > 0.5);
    assert.ok(usable, `${label} ${tool.key} geometry role has non-zero box: ${role}`);

    if (checks.rolesInsideDiagram) {
      const box = usable.box;
      const diagram = state.diagramBounds;
      const tolerance = 3;
      assert.ok(box.left >= diagram.left - tolerance, `${label} ${tool.key} ${role} left inside diagram`);
      assert.ok(box.top >= diagram.top - tolerance, `${label} ${tool.key} ${role} top inside diagram`);
      assert.ok(box.right <= diagram.right + tolerance, `${label} ${tool.key} ${role} right inside diagram`);
      assert.ok(box.bottom <= diagram.bottom + tolerance, `${label} ${tool.key} ${role} bottom inside diagram`);
    }
  }
}

function assertReportExpectations(state, tool, label, mode) {
  const expectations = tool.reportExpectations?.[mode];
  if (!expectations) return;
  const auditHtml = state.auditHtml || state.html || '';
  for (const needle of expectations.mustInclude || []) {
    assert.ok(auditHtml.includes(needle), `${label} ${tool.key} ${mode} report includes ${needle}`);
  }
  for (const needle of expectations.mustExclude || []) {
    const index = auditHtml.indexOf(needle);
    const context = index >= 0 ? auditHtml.slice(Math.max(0, index - 160), index + 160) : '';
    assert.equal(index >= 0, false, `${label} ${tool.key} ${mode} report excludes ${needle}: ${context}`);
  }
}

function assertReportState(state, tool, label, mode = 'default') {
  assert.equal(state.missingButton, false, `${label} ${tool.key} report button exists`);
  assert.equal(state.openCount, 1, `${label} ${tool.key} report open count`);
  assert.equal(state.openedDocument, true, `${label} ${tool.key} report document open`);
  assert.equal(state.closedDocument, true, `${label} ${tool.key} report document close`);
  assert.ok(state.html.length > 1800, `${label} ${tool.key} report length`);
  assert.ok(state.html.includes('計算書'), `${label} ${tool.key} report title`);
  if (mode === 'default' || mode === 'detail') {
    for (const needle of tool.reportNeedles) {
      assert.ok(state.html.includes(needle), `${label} ${tool.key} ${mode} report includes ${needle}`);
    }
  }
  const forbiddenNeedles = formalManifest.reportForbiddenNeedles || [
    '工具內建',
    '工具建議',
    '專業版',
    'undefined',
    'NaN',
  ];
  forbiddenNeedles.forEach(needle => {
    const auditHtml = state.auditHtml || state.html;
    const index = auditHtml.indexOf(needle);
    const context = index >= 0 ? auditHtml.slice(Math.max(0, index - 160), index + 160) : '';
    assert.equal(index >= 0, false, `${label} ${tool.key} ${mode} report avoids ${needle}: ${context}`);
  });
  assertReportExpectations(state, tool, label, mode);
}

function assertExportState(state, tool, label) {
  if (!tool.exportButton) return;
  assert.equal(state.missingButton, false, `${label} ${tool.key} export button exists`);
  assert.equal(state.downloadCount, 1, `${label} ${tool.key} export download count`);
  assert.equal(state.blobCount, 1, `${label} ${tool.key} export blob count`);
  assert.ok(state.textLength > 300, `${label} ${tool.key} export payload length`);
  assert.ok(state.payload && typeof state.payload === 'object', `${label} ${tool.key} export JSON`);
  assert.ok(state.downloads[0].download.endsWith('.json'), `${label} ${tool.key} export filename`);
  assert.equal(state.downloads[0].attached, true, `${label} ${tool.key} export anchor attached`);
  assert.ok(
    JSON.stringify(state.payload).includes(tool.key.split('-')[0]) ||
      JSON.stringify(state.payload).includes(tool.titleNeedle.slice(0, 2)) ||
      JSON.stringify(state.payload).includes('project'),
    `${label} ${tool.key} export payload identity`
  );
}

function assertJsonRoundTripState(state, tool, label) {
  if (!tool.jsonRoundTrip) return;
  assert.ok(state && typeof state === 'object', `${label} ${tool.key} JSON round-trip state`);
  assert.equal(state.missingPayload, false, `${label} ${tool.key} JSON round-trip source payload`);
  assert.equal(state.missingFileInput, false, `${label} ${tool.key} JSON round-trip file input`);
  assert.ok(
    state.usedFileInput || state.usedDirectImport,
    `${label} ${tool.key} JSON round-trip import path: ${state.importError || 'not invoked'}`
  );
  assert.ok(state.mutatedCount >= 3, `${label} ${tool.key} JSON round-trip mutates page before import`);
  assert.deepEqual(
    state.mismatches,
    [],
    `${label} ${tool.key} JSON round-trip restores inputs: ${JSON.stringify(state.mismatches, null, 2)}`
  );
  assert.ok(
    state.caseStatus.includes('已匯入案件 JSON'),
    `${label} ${tool.key} JSON round-trip status: ${state.caseStatus}`
  );
  assert.equal(state.payloadToolId, tool.key, `${label} ${tool.key} JSON round-trip payload tool`);
  assert.ok(state.payloadSchema, `${label} ${tool.key} JSON round-trip payload schema`);
  const recalculatedValues = [
    ...Object.values(state.resultSelectors || {}),
    ...(state.resultValues || []),
  ].filter(Boolean);
  assert.ok(
    recalculatedValues.some(value => value !== '—'),
    `${label} ${tool.key} JSON round-trip recalculates result`
  );
}

function assertGoldenCaseState(state, tool, goldenCase, label) {
  assert.equal(state.missingCalc, false, `${label} ${tool.key} ${goldenCase.id} calc button exists`);
  assert.deepEqual(state.missingInputs, [], `${label} ${tool.key} ${goldenCase.id} input ids`);
  assert.deepEqual(state.missingSelectors, [], `${label} ${tool.key} ${goldenCase.id} result selectors`);
  assert.deepEqual(state.missingMetrics || [], [], `${label} ${tool.key} ${goldenCase.id} metric paths`);

  for (const [selector, expected] of Object.entries(goldenCase.expectedSelectors || {})) {
    assert.equal(
      state.selectorValues[selector],
      expected,
      `${label} ${tool.key} ${goldenCase.id} ${selector}`
    );
  }

  for (const needle of goldenCase.expectedTextNeedles || []) {
    const normalizedNeedle = String(needle).replace(/\s+/g, ' ').trim();
    assert.ok(
      state.resultText.includes(normalizedNeedle) || state.bodyText.includes(normalizedNeedle),
      `${label} ${tool.key} ${goldenCase.id} text includes ${needle}; resultText=${state.resultText.slice(0, 900)}`
    );
  }

  for (const [path, expectation] of Object.entries(goldenCase.expectedMetrics || {})) {
    const expected = typeof expectation === 'number' ? expectation : expectation.value;
    const tolerance = typeof expectation === 'number' ? 1e-9 : (expectation.tolerance ?? 1e-9);
    const actual = state.metricValues?.[path];
    assert.equal(typeof actual, 'number', `${label} ${tool.key} ${goldenCase.id} ${path} metric type`);
    assert.ok(
      Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
      `${label} ${tool.key} ${goldenCase.id} ${path} expected ${expected} +/- ${tolerance}, got ${actual}`
    );
  }
}

function assertNoPageErrors(errors, label) {
  const relevantErrors = errors.filter(error => {
    const url = error.url || '';
    return !/\/favicon\.ico(?:$|\?)/i.test(url);
  });
  assert.deepEqual(relevantErrors, [], `${label} console errors: ${JSON.stringify(errors, null, 2)}`);
}

async function main() {
  assertFormalToolCoverage();

  const vercelConfig = readRootJson('vercel.json');
  const edgePath = EDGE_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert.ok(edgePath, `Microsoft Edge not found in: ${EDGE_CANDIDATES.join(', ')}`);
  assert.equal(typeof WebSocket, 'function', 'Node WebSocket support is required for CDP smoke');

  const serverPort = await getFreePort();
  const debugPort = await getFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'formal-tools-edge-'));
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

    for (const viewport of viewports) {
      for (const tool of formalTools) {
        const label = `${viewport.key} route`;
        const url = `http://127.0.0.1:${serverPort}${tool.route}`;
        const pageErrors = await navigate(client, sessionId, url, viewport);
        const state = await evaluate(client, sessionId, pageStateExpression(tool));
        pageErrors.unsubscribe();
        assertNoPageErrors(pageErrors.errors, `${label} ${tool.key}`);
        assertPageState(state, tool, label);
      }
    }

    for (const tool of formalTools) {
      const label = 'desktop interaction';
      const url = `http://127.0.0.1:${serverPort}${tool.route}`;
      const pageErrors = await navigate(client, sessionId, url, viewports[0]);
      await evaluate(client, sessionId, pageStateExpression(tool));
      const exportState = tool.exportButton
        ? await evaluate(client, sessionId, exportCaptureExpression(tool))
        : null;
      const roundTripState = tool.jsonRoundTrip
        ? await evaluate(client, sessionId, jsonRoundTripExpression(tool, exportState?.payload))
        : null;
      const goldenStates = [];
      for (const goldenCase of tool.goldenCases || []) {
        goldenStates.push({
          goldenCase,
          state: await evaluate(client, sessionId, goldenCaseExpression(tool, goldenCase)),
        });
      }
      const reportStates = tool.reportMode
        ? {
          simple: await evaluate(client, sessionId, reportCaptureExpression(tool, 'simple')),
          detail: await evaluate(client, sessionId, reportCaptureExpression(tool, 'detail')),
        }
        : {
          default: await evaluate(client, sessionId, reportCaptureExpression(tool)),
        };
      pageErrors.unsubscribe();
      assertNoPageErrors(pageErrors.errors, `${label} ${tool.key}`);
      assertExportState(exportState, tool, label);
      assertJsonRoundTripState(roundTripState, tool, label);
      for (const { goldenCase, state } of goldenStates) {
        assertGoldenCaseState(state, tool, goldenCase, label);
      }
      for (const [mode, reportState] of Object.entries(reportStates)) {
        assertReportState(reportState, tool, label, mode);
      }
    }

    await client.send('Browser.close').catch(() => {});
    console.log(`formal browser smoke OK (${formalTools.length} tools, ${viewports.length} viewports)`);
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
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await removeDirectoryBestEffort(userDataDir);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
