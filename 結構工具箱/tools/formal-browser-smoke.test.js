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

const formalTools = [
  {
    key: 'wind-force',
    route: '/wind-force',
    titleNeedle: '矩形建物 MWFRS',
    familyNeedle: '建築物耐風設計',
    calcButton: 'btnCalc',
    reportButtonSelector: '.btn-print',
    exportButton: null,
    reportMode: false,
    diagramSelector: null,
    diagramRoleNeedles: [],
    reportNeedles: ['矩形建物', 'MWFRS', '設計風力'],
  },
  {
    key: 'wind-cc',
    route: '/wind-cc',
    titleNeedle: '區域風壓',
    familyNeedle: '建築物耐風設計',
    calcButton: 'btnCalc',
    reportButtonSelector: '.btn-print',
    exportButton: null,
    reportMode: false,
    diagramSelector: '#refSvgWrap',
    diagramRoleNeedles: [],
    reportNeedles: ['區域風壓', 'C&amp;C', '設計採用表'],
  },
  {
    key: 'wind-open-roof',
    route: '/wind-open-roof',
    titleNeedle: '開放式建築屋面風壓',
    familyNeedle: '建築物耐風設計',
    calcButton: 'btnCalc',
    reportButtonSelector: '.btn-print',
    exportButton: null,
    reportMode: false,
    diagramSelector: null,
    diagramRoleNeedles: [],
    reportNeedles: ['開放式建築屋面', '圖 3.3', '設計採用表'],
  },
  {
    key: 'wind-parapet',
    route: '/wind-parapet',
    titleNeedle: '女兒牆風壓',
    familyNeedle: '建築物耐風設計',
    calcButton: 'btnCalc',
    reportButtonSelector: '.btn-print',
    exportButton: null,
    reportMode: false,
    diagramSelector: '#refSvgWrap',
    diagramRoleNeedles: [],
    reportNeedles: ['女兒牆', '圖 3.4', '設計採用表'],
  },
  {
    key: 'wind-object-solid',
    route: '/wind-object-solid',
    titleNeedle: '實體標示物風力',
    familyNeedle: '建築物耐風設計',
    calcButton: 'btnCalc',
    reportButton: 'btnReport',
    exportButton: 'btnExportCase',
    reportMode: true,
    diagramSelector: '#schemaSvg',
    diagramRoleNeedles: ['force-arrow-zone', 'force-label-zone', 'height-arrow-zone'],
    reportNeedles: ['表 2.10', '實體標示物', 'C<sub>f</sub>(ν)', 'C<sub>f</sub>(M/N)'],
  },
  {
    key: 'wind-object-frame',
    route: '/wind-object-frame',
    titleNeedle: '中空式 / 格子式風力',
    familyNeedle: '建築物耐風設計',
    calcButton: 'btnCalc',
    reportButton: 'btnReport',
    exportButton: 'btnExportCase',
    reportMode: true,
    diagramSelector: '#schemaSvg',
    diagramRoleNeedles: ['force-arrow-zone', 'force-label-zone', 'height-arrow-zone'],
    reportNeedles: ['表 2.11', '中空式', '格子式'],
  },
  {
    key: 'wind-lattice-tower',
    route: '/wind-lattice-tower',
    titleNeedle: '桁架高塔風力',
    familyNeedle: '建築物耐風設計',
    calcButton: 'btnCalc',
    reportButton: 'btnReport',
    exportButton: 'btnExportCase',
    reportMode: true,
    diagramSelector: '#schemaSvg',
    diagramRoleNeedles: ['force-arrow-zone', 'force-label-zone', 'height-arrow-zone'],
    reportNeedles: ['表 2.15', '桁架高塔', '分段'],
  },
  {
    key: 'wind-object-tower',
    route: '/wind-object-tower',
    titleNeedle: '煙囪 / 水塔風力',
    familyNeedle: '建築物耐風設計',
    calcButton: 'btnCalc',
    reportButton: 'btnReport',
    exportButton: 'btnExportCase',
    reportMode: true,
    diagramSelector: '#schemaSvg',
    diagramRoleNeedles: ['force-arrow-zone', 'force-label-zone', 'height-arrow-zone'],
    reportNeedles: ['表 2.12', '煙囪', '水塔'],
  },
  {
    key: 'wind-fence-sign',
    route: '/wind-fence-sign',
    titleNeedle: '圍籬牆 / 獨立招牌風力',
    familyNeedle: '建築物耐風設計',
    calcButton: 'btnCalc',
    reportButton: 'btnReport',
    exportButton: 'btnExportCase',
    reportMode: true,
    diagramSelector: '#schemaSvg',
    diagramRoleNeedles: ['wind-arrows', 'force-panel'],
    reportNeedles: ['圍籬牆', '獨立招牌', '表 2.10'],
  },
  {
    key: 'wind-sign-pole',
    route: '/wind-sign-pole',
    titleNeedle: '招牌 / 燈桿組合風力',
    familyNeedle: '建築物耐風設計',
    calcButton: 'btnCalc',
    reportButton: 'btnReport',
    exportButton: 'btnExportCase',
    reportMode: true,
    diagramSelector: '#schemaSvg',
    diagramRoleNeedles: ['panel-force-zone', 'support-load-zone', 'result-panel'],
    reportNeedles: ['表 2.10', '表 2.14', '表 2.13', '元件合計'],
  },
  {
    key: 'seismic-force',
    route: '/seismic-force',
    titleNeedle: '等值靜力分析',
    familyNeedle: '建築物耐震設計',
    calcButton: 'btnCalc',
    reportButton: 'btnReport',
    exportButton: null,
    reportMode: false,
    diagramSelector: '#spectrumChart',
    diagramRoleNeedles: [],
    reportNeedles: ['等值靜力分析', '主要組成一：地震力分配', '反應譜'],
  },
  {
    key: 'seismic-appendage',
    route: '/seismic-appendage',
    titleNeedle: '附屬構造物地震力',
    familyNeedle: '建築物耐震設計',
    calcButton: 'btnCalc',
    reportButton: 'btnReport',
    exportButton: 'btnExportCaseJson',
    reportMode: true,
    diagramSelector: '.line-h2-diagram',
    diagramRoleNeedles: ['fph-arrow-zone', 'fpv-arrow-zone', 'force-panel'],
    reportNeedles: ['附屬構造物', 'Fph', 'Fpv'],
  },
  {
    key: 'seismic-misc',
    route: '/seismic-misc',
    titleNeedle: '雜項工作物地震力',
    familyNeedle: '建築物耐震設計',
    calcButton: 'btnCalc',
    reportButton: 'btnReport',
    exportButton: 'btnExportCaseJson',
    reportMode: true,
    diagramSelector: '.line-h2-diagram',
    diagramRoleNeedles: ['vh-arrow-zone', 'vv-arrow-zone', 'force-panel'],
    reportNeedles: ['雜項工作物', 'Vh', 'Vv'],
  },
  {
    key: 'seismic-dynamic',
    route: '/seismic-dynamic',
    titleNeedle: '反應譜動力分析',
    familyNeedle: '建築物耐震設計',
    calcButton: 'btnCalc',
    reportButton: 'btnReport',
    exportButton: 'btnExportCaseJson',
    reportMode: false,
    diagramSelector: null,
    diagramRoleNeedles: [],
    reportNeedles: ['反應譜', '總橫力調整', '動力分析'],
  },
];

const requiredFormalRoutes = [
  '/wind-force',
  '/wind-cc',
  '/wind-open-roof',
  '/wind-parapet',
  '/wind-object-solid',
  '/wind-object-frame',
  '/wind-lattice-tower',
  '/wind-object-tower',
  '/wind-fence-sign',
  '/wind-sign-pole',
  '/seismic-force',
  '/seismic-appendage',
  '/seismic-misc',
  '/seismic-dynamic',
];

function assertFormalToolCoverage() {
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
      diagramRoles,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      visibleTextLength: text.length
      , overflowing
    };
  })()`;
}

function reportCaptureExpression(tool) {
  return `(async () => {
    const originalOpen = window.open;
    const reportId = ${JSON.stringify(tool.reportButton || null)};
    const reportSelector = ${JSON.stringify(tool.reportButtonSelector || null)};
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
      const detail = document.querySelector('[data-report-mode="detail"]');
      if (detail) detail.click();
      await new Promise(resolve => setTimeout(resolve, 30));
      const button = reportId ? document.getElementById(reportId) : document.querySelector(reportSelector);
      if (!button) return { missingButton: true, html: '' };
      button.click();
      await new Promise(resolve => setTimeout(resolve, 50));
      const html = writes.join('');
      return {
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

function assertReportState(state, tool, label) {
  assert.equal(state.missingButton, false, `${label} ${tool.key} report button exists`);
  assert.equal(state.openCount, 1, `${label} ${tool.key} report open count`);
  assert.equal(state.openedDocument, true, `${label} ${tool.key} report document open`);
  assert.equal(state.closedDocument, true, `${label} ${tool.key} report document close`);
  assert.ok(state.html.length > 1800, `${label} ${tool.key} report length`);
  assert.ok(state.html.includes('計算書'), `${label} ${tool.key} report title`);
  for (const needle of tool.reportNeedles) {
    assert.ok(state.html.includes(needle), `${label} ${tool.key} report includes ${needle}`);
  }
  [
    '工具內建',
    '工具建議',
    '專業版',
    'undefined',
    'NaN',
  ].forEach(needle => {
    const auditHtml = state.auditHtml || state.html;
    const index = auditHtml.indexOf(needle);
    const context = index >= 0 ? auditHtml.slice(Math.max(0, index - 160), index + 160) : '';
    assert.equal(index >= 0, false, `${label} ${tool.key} report avoids ${needle}: ${context}`);
  });
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
      const reportState = await evaluate(client, sessionId, reportCaptureExpression(tool));
      pageErrors.unsubscribe();
      assertNoPageErrors(pageErrors.errors, `${label} ${tool.key}`);
      assertExportState(exportState, tool, label);
      assertReportState(reportState, tool, label);
    }

    console.log(`formal browser smoke OK (${formalTools.length} tools, ${viewports.length} viewports)`);
  } finally {
    if (client) client.close();
    if (edge && !edge.killed) edge.kill();
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
