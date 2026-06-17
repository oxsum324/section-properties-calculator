const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
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

function createRouteMaps(vercelConfig) {
  const rewriteMap = new Map();
  const redirectMap = new Map();
  for (const rewrite of vercelConfig.rewrites || []) {
    if (rewrite.source && rewrite.destination) {
      rewriteMap.set(rewrite.source, rewrite.destination);
    }
  }
  for (const redirect of vercelConfig.redirects || []) {
    if (redirect.source && redirect.destination) {
      redirectMap.set(redirect.source, redirect.destination);
    }
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

async function removeDirectoryBestEffort(directoryPath) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(directoryPath, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
      return;
    } catch (err) {
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(err.code)) throw err;
      await delay(250 * (attempt + 1));
    }
  }
  console.warn(`Warning: could not remove temporary Edge profile: ${directoryPath}`);
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
    const relativeLinks = links.filter(href => !/^(?:[a-z][a-z0-9+.-]*:|\\/|#|\\$)/i.test(href));
    return {
      title: document.title,
      requiredLinks: required.map(href => ({ href, exists: links.includes(href) })),
      relativeLinks,
      hasLocalSection: document.body.innerText.includes('施工臨時設施 / 局部檢核'),
      hasNextToolsPanel: !!document.getElementById('nextToolsPanel'),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    };
  })()`;
}

function newHomeExpression(tools) {
  return `(() => {
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href'));
    const cards = Array.from(document.querySelectorAll('.tool-card'));
    const cardStates = cards.map(card => ({
      href: card.getAttribute('href'),
      routeHref: card.getAttribute('data-route-href') || ''
    }));
    const statusLinks = Array.from(document.querySelectorAll('[data-file-href]')).map(a => a.getAttribute('href'));
    const required = ${JSON.stringify(tools.map(tool => tool.indexHref))};
    const text = document.body.innerText;
    const categoryMarks = Array.from(document.querySelectorAll('.category-card .icon-mark')).map(node => node.textContent.trim()).sort();
    const toolMarks = Array.from(document.querySelectorAll('.tool-card__icon .icon-mark')).map(node => node.textContent.trim());
    const categoryIconCount = document.querySelectorAll('.category-icon svg').length;
    const toolIconCount = document.querySelectorAll('.tool-card__icon svg').length;
    const toolUpdatedCount = document.querySelectorAll('.tool-updated').length;
    const toolStateChipCount = document.querySelectorAll('.tool-card .tool-state').length;
    const toolBoundaryCount = document.querySelectorAll('.tool-boundary').length;
    const toolProfileCount = document.querySelectorAll('.tool-profile').length;
    const toolOutputCount = Array.from(document.querySelectorAll('.tool-profile__item span')).filter(node => node.textContent.trim() === '輸出').length;
    const toolStates = Array.from(document.querySelectorAll('.tool-card')).map(card => card.getAttribute('data-state') || '');
    const duplicateMetaLabels = cards.map(card => {
      const labels = Array.from(card.querySelectorAll('.tool-meta span')).map(node => node.textContent.trim()).filter(Boolean);
      return labels.filter((label, index) => labels.indexOf(label) !== index);
    }).filter(duplicates => duplicates.length > 0);
    const hasToolFinder = text.includes('Tool Finder');
    const hasToolSearch = !!document.getElementById('toolSearch');
    const memberButton = Array.from(document.querySelectorAll('.category-card')).find(card => card.textContent.includes('構件承載力檢核'));
    if (memberButton) memberButton.click();
    const memberPanel = document.getElementById('memberSystemPanel');
    const memberTabs = Array.from(document.querySelectorAll('.member-system-tab strong')).map(node => node.textContent.trim());
    const memberGroups = Array.from(document.querySelectorAll('.tool-group__head h3')).map(node => node.textContent.trim());
    const memberToolSystems = Array.from(document.querySelectorAll('.tool-card .tool-chip--system')).map(node => node.textContent.trim());
    const srcButton = Array.from(document.querySelectorAll('.member-system-tab')).find(button => button.textContent.includes('SRC'));
    if (srcButton) srcButton.click();
    const srcEmptyText = document.getElementById('emptyState')?.innerText || '';
    return {
      title: document.title,
      protocol: window.location.protocol,
      hasHomeApp: !!document.querySelector('[data-home-app]'),
      hasToolGrid: !!document.getElementById('toolGrid'),
      hasCategoryOverview: !!document.getElementById('categoryOverview'),
      hasNextToolsPanel: !!document.getElementById('nextToolsPanel'),
      hasOriginalHomeLink: links.includes('/結構工具箱/index-classic.html') || links.includes('index-classic.html'),
      hasDoNotReplaceCopy: text.includes('不取代原本首頁'),
      hasLocalSection: text.includes('施工臨時設施 / 局部檢核'),
      imageCount: document.querySelectorAll('img').length,
      categoryIconCount,
      toolIconCount,
      toolUpdatedCount,
      toolStateChipCount,
      toolBoundaryCount,
      toolProfileCount,
      toolOutputCount,
      toolStates,
      duplicateMetaLabels,
      hasStateFilterPanel: !!document.getElementById('stateFilterPanel'),
      hasToolFinder,
      hasToolSearch,
      categoryMarks,
      toolMarks,
      hasMemberSystemPanel: !!memberPanel && memberPanel.hidden === false,
      memberTabs,
      memberGroups,
      memberToolSystems,
      srcEmptyText,
      hasCategoryArt: !!document.querySelector('.category-art'),
      cardCount: cards.length,
      requiredLinks: required.map(href => ({
        href,
        exists: cardStates.some(card => card.href === href || card.routeHref === href)
      })),
      absoluteCardLinks: cardStates.filter(card => /^\\//.test(card.href || '')).map(card => card.href),
      absoluteStatusLinks: statusLinks.filter(href => /^\\//.test(href || '')),
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
      hasWallTypeOutputBody: !!document.getElementById('wallTypeOutputBody'),
      hasDiagramBody: !!document.getElementById('diagramBody'),
      hasCheckList: !!document.getElementById('checkList'),
      hasExportScript: scripts.includes('/結構工具箱/tools/local-quick-export.js'),
      hasCoreScript: scripts.includes(${JSON.stringify(`/結構工具箱/${tool.core}`)}),
      hasJsonImportButton: !!document.getElementById('btnImportJson'),
      hasJsonFileInput: !!document.getElementById('jsonFile'),
      jsonStatus: text('jsonStatus'),
      coreVersion: text('coreVersion'),
      banner: text('bannerStatus'),
      metricText: text('metricGrid'),
      wallTypeOutputText: text('wallTypeOutputBody'),
      diagramText: text('diagramBody'),
      diagramSvgCount: document.querySelectorAll('#diagramBody svg.pressure-diagram').length,
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

function earthWallTypeExpression() {
  return `(() => {
    const text = (id) => document.getElementById(id)?.textContent?.replace(/\\s+/g, ' ').trim() || '';
    const select = document.getElementById('wallType');
    select.value = 'gravity';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      value: select.value,
      outputText: text('wallTypeOutputBody'),
      diagramText: text('diagramBody'),
      modelSummary: text('modelSummary')
    };
  })()`;
}

function jsonImportExpression(tool, payload) {
  return `(async () => {
    const tool = ${JSON.stringify({ key: tool.key })};
    const payload = ${JSON.stringify(payload)};
    payload.project = Object.assign({}, payload.project, { name: '回讀測試案' });
    document.getElementById('projName').value = '';
    if (tool.key === 'equipment-load') {
      document.getElementById('equipmentWeight').value = '99';
      document.getElementById('fluidWeight').value = '9';
    }
    if (tool.key === 'earth-pressure') {
      document.getElementById('H').value = '9.99';
      document.getElementById('surcharge').value = '8.88';
      document.getElementById('wallType').value = 'gravity';
    }
    const fileInput = document.getElementById('jsonFile');
    const file = new File([JSON.stringify(payload)], tool.key + '-import.json', { type: 'application/json' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 180));
    if (tool.key === 'equipment-load') {
      return {
        tool: tool.key,
        equipmentWeight: document.getElementById('equipmentWeight').value,
        fluidWeight: document.getElementById('fluidWeight').value,
        projectName: document.getElementById('projName').value,
        jsonStatus: document.getElementById('jsonStatus')?.textContent || '',
        banner: document.getElementById('bannerStatus')?.textContent || ''
      };
    }
    return {
      tool: tool.key,
      H: document.getElementById('H').value,
      surcharge: document.getElementById('surcharge').value,
      wallType: document.getElementById('wallType').value,
      projectName: document.getElementById('projName').value,
      banner: document.getElementById('bannerStatus')?.textContent || '',
      metricText: document.getElementById('metricGrid')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      wallTypeOutput: document.getElementById('wallTypeOutputBody')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      diagramText: document.getElementById('diagramBody')?.textContent?.replace(/\\s+/g, ' ').trim() || ''
    };
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
}

function assertNewHomeState(state, tools, label) {
  assert.equal(state.title, '結構工具箱', `${label} new home title`);
  assert.ok(state.hasHomeApp, `${label} new home app shell`);
  assert.ok(state.hasToolGrid, `${label} new home tool grid`);
  assert.ok(state.hasCategoryOverview, `${label} new home category overview`);
  assert.ok(state.hasNextToolsPanel, `${label} new home next tools panel`);
  assert.ok(state.hasOriginalHomeLink, `${label} new home links to classic menu`);
  // 新版已成為正式首頁，不再保留「不取代原本首頁」文案
  assert.ok(state.hasLocalSection, `${label} new home local section`);
  assert.equal(state.imageCount, 0, `${label} new home image elements`);
  assert.equal(state.categoryIconCount, 7, `${label} new home category icons`);
  assert.equal(state.toolIconCount, state.cardCount, `${label} new home tool card icons`);
  assert.equal(state.toolUpdatedCount, state.cardCount, `${label} new home tool updated dates`);
  assert.equal(state.toolStateChipCount, state.cardCount, `${label} new home compact state chips`);
  assert.equal(state.toolBoundaryCount, 0, `${label} new home hidden fit limit fields`);
  assert.equal(state.toolProfileCount, state.cardCount, `${label} new home tool profiles`);
  assert.equal(state.toolOutputCount, state.cardCount, `${label} new home tool output fields`);
  assert.equal(state.toolStates.every(toolState => /^(formal|assist|reference|estimate|report|workflow|service|legacy|external)$/.test(toolState)), true, `${label} new home governed tool states`);
  assert.deepEqual(state.duplicateMetaLabels, [], `${label} new home duplicate meta labels`);
  assert.equal(state.hasStateFilterPanel, false, `${label} new home removes state filter panel`);
  assert.equal(state.hasToolFinder, false, `${label} new home removes Tool Finder`);
  assert.equal(state.hasToolSearch, false, `${label} new home removes search input`);
  assert.deepEqual(state.categoryMarks, ['B', 'E', 'F', 'P', 'S', 'T', 'W'], `${label} new home category icon marks`);
  assert.equal(state.toolMarks.every(mark => /^[BEFPSTW]$/.test(mark)), true, `${label} new home tool icon marks`);
  assert.equal(state.hasMemberSystemPanel, true, `${label} new home member system panel`);
  assert.deepEqual(state.memberTabs, ['全部', 'RC', '鋼構', 'SRC'], `${label} new home member system tabs`);
  assert.deepEqual(state.memberGroups, ['RC', '鋼構'], `${label} new home member grouped tools`);
  assert.equal(state.memberToolSystems.every(system => ['RC', '鋼構'].includes(system)), true, `${label} new home member tool systems`);
  assert.ok(state.srcEmptyText.includes('此材料系統尚未建立工具'), `${label} new home SRC empty state`);
  assert.equal(state.hasCategoryArt, false, `${label} new home category art`);
  assert.ok(state.cardCount >= tools.length, `${label} new home card count`);
  assert.equal(state.horizontalOverflow, false, `${label} new home horizontal overflow`);
  for (const link of state.requiredLinks) {
    assert.equal(link.exists, true, `${label} new home link exists: ${link.href}`);
  }
  if (state.protocol === 'file:') {
    assert.deepEqual(state.absoluteCardLinks, [], `${label} new home file-mode card links`);
    assert.deepEqual(state.absoluteStatusLinks, [], `${label} new home file-mode status links`);
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
  assert.match(state.coreVersion, /^Core v0\.\d+\.0$/, `${label} ${tool.key} core version`);
  if (tool.key === 'equipment-load') {
    assert.equal(state.hasJsonImportButton, true, `${label} ${tool.key} JSON import button`);
    assert.equal(state.hasJsonFileInput, true, `${label} ${tool.key} JSON file input`);
    assert.ok(state.jsonStatus.includes('JSON'), `${label} ${tool.key} JSON status`);
    assert.ok(state.checkText.includes('混凝土承壓'), `${label} ${tool.key} concrete bearing check`);
    assert.ok(state.checkText.includes('穿孔剪力'), `${label} ${tool.key} punching shear check`);
    assert.ok(state.checkText.includes('鋼板分散'), `${label} ${tool.key} steel plate check`);
  }
  if (tool.key === 'earth-pressure') {
    assert.equal(state.hasWallTypeOutputBody, true, `${label} ${tool.key} wall type output body`);
    assert.ok(state.wallTypeOutputText.includes('懸臂式工作輸出'), `${label} ${tool.key} cantilever output`);
    assert.ok(state.wallTypeOutputText.includes('整體穩定'), `${label} ${tool.key} wall type output groups`);
    assert.equal(state.hasDiagramBody, true, `${label} ${tool.key} diagram body`);
    assert.equal(state.diagramSvgCount, 1, `${label} ${tool.key} pressure diagram svg`);
    assert.ok(state.diagramText.includes('土壓與穩定示意'), `${label} ${tool.key} diagram title`);
    assert.ok(state.diagramText.includes('基底反力示意'), `${label} ${tool.key} base reaction diagram`);
    assert.ok(state.diagramText.includes('圖例'), `${label} ${tool.key} diagram legend`);
    assert.ok(state.diagramText.includes('趾版 toe'), `${label} ${tool.key} cantilever toe label`);
  }
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
  assert.match(state.payload.result.resultSchemaVersion, /\.result\.v0\.\d+$/, `${label} ${tool.key} payload result schema`);
  assert.equal(state.payload.result.provenance.core, tool.coreGlobal, `${label} ${tool.key} payload provenance core`);
  assert.ok(Array.isArray(state.payload.result.checks), `${label} ${tool.key} payload checks`);
  assert.ok(state.payload.result.checks.length >= 3, `${label} ${tool.key} payload checks count`);
  assert.ok(Array.isArray(state.payload.result.summary.primaryMetrics), `${label} ${tool.key} payload metrics`);
  assert.ok(state.payload.result.summary.primaryMetrics.length >= 3, `${label} ${tool.key} payload metrics count`);
  if (tool.key === 'equipment-load') {
    assert.equal(state.payload.input.equipmentWeight, 12, `${label} ${tool.key} payload input`);
  }
  if (tool.key === 'earth-pressure') {
    assert.equal(state.payload.result.wallType, 'cantilever', `${label} ${tool.key} payload wall type`);
    assert.equal(state.payload.result.wallTypeOutput.headline, '懸臂式工作輸出', `${label} ${tool.key} payload wall output`);
  }
}

function assertEquipmentJsonImportState(state, label) {
  assert.equal(state.equipmentWeight, '12', `${label} equipment import weight`);
  assert.equal(state.fluidWeight, '2', `${label} equipment import fluid weight`);
  assert.equal(state.projectName, '回讀測試案', `${label} equipment import project`);
  assert.ok(state.jsonStatus.includes('已讀取 JSON'), `${label} equipment import status`);
  assert.ok(state.banner && state.banner !== '尚未計算', `${label} equipment import recalculates`);
}

function assertEarthJsonImportState(state, label) {
  assert.equal(state.H, '2.5', `${label} earth import height`);
  assert.equal(state.surcharge, '1', `${label} earth import surcharge`);
  assert.equal(state.wallType, 'cantilever', `${label} earth import wall type`);
  assert.equal(state.projectName, '回讀測試案', `${label} earth import project`);
  assert.ok(state.banner.includes('已讀取 JSON'), `${label} earth import banner`);
  assert.ok(state.metricText.includes('側向合力'), `${label} earth import recalculates metrics`);
  assert.ok(state.wallTypeOutput.includes('懸臂式工作輸出'), `${label} earth import wall output`);
  assert.ok(state.diagramText.includes('懸臂式擋土牆'), `${label} earth import diagram`);
}

function assertReportState(state, tool, label) {
  assert.equal(state.openCount, 1, `${label} ${tool.key} report open count`);
  assert.equal(state.opened[0].target, '_blank', `${label} ${tool.key} report target`);
  assert.equal(state.documentOpened, true, `${label} ${tool.key} report document open`);
  assert.equal(state.closed, true, `${label} ${tool.key} report document close`);
  assert.ok(state.htmlLength > 1500, `${label} ${tool.key} report HTML length`);
  const requiredNeedles = [
    tool.label,
    '計算書',
  ];
  const removedFromLocalReport = ['工具與責任邊界', '適用範圍', '不適用範圍', '計算核心', '輸入格式', '計算指紋'];
  if (tool.key === 'foundation-local') {
    // 已正式化：兩段式計算書（預設詳算式）含計算內容與示意圖，不再以「初估」標示
    requiredNeedles.push('計算內容', '計算示意圖', '載重情況');
    removedFromLocalReport.forEach(needle => {
      assert.equal(state.html.includes(needle), false, `${label} ${tool.key} report removes ${needle}`);
    });
  } else if (tool.key === 'earth-pressure') {
    // 已正式化：兩段式計算書（預設詳算式）含計算內容、Rankine 公式、示意圖與牆型工作輸出
    requiredNeedles.push('計算內容', '計算示意圖', 'Rankine', '牆型工作輸出');
    removedFromLocalReport.forEach(needle => {
      assert.equal(state.html.includes(needle), false, `${label} ${tool.key} report removes ${needle}`);
    });
  } else if (tool.key === 'equipment-load') {
    // 已正式化：兩段式計算書（預設詳算式）含計算內容與示意圖
    requiredNeedles.push('計算內容', '計算示意圖', '單點反力');
    removedFromLocalReport.forEach(needle => {
      assert.equal(state.html.includes(needle), false, `${label} ${tool.key} report removes ${needle}`);
    });
  } else {
    requiredNeedles.push('初估', '計算核心', '輸入格式', '計算指紋', '適用範圍', '不適用範圍');
  }
  requiredNeedles.forEach(needle => {
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

    // 經典公文版選單（已封存為 index-classic.html）
    const homeCases = [
      { key: 'file-classic', url: `http://127.0.0.1:${serverPort}/${encodeURI('結構工具箱/index-classic.html')}` },
    ];
    // 正式工具箱首頁（弘一設計系統新版）— 根路由、/platform 與 /toolbox-home 皆導向於此
    const newHomeCases = [
      { key: 'file-home', url: `http://127.0.0.1:${serverPort}/${encodeURI('結構工具箱/index.html')}` },
      { key: 'route-root', url: `http://127.0.0.1:${serverPort}/` },
      { key: 'route-platform', url: `http://127.0.0.1:${serverPort}/platform` },
      { key: 'route-toolbox-home', url: `http://127.0.0.1:${serverPort}/toolbox-home` },
      { key: 'file-url-new-home', url: pathToFileURL(toolboxFile('index.html')).href },
    ];
    for (const viewport of viewports) {
      for (const homeCase of homeCases) {
        const label = `${viewport.key} ${homeCase.key}`;
        const home = await navigateAndInspect(client, sessionId, homeCase.url, viewport, homeExpression(manifest.tools));
        assert.deepEqual(home.errors, [], `${label} console errors: ${home.errors.join(' | ')}`);
        assertHomeState(home.state, manifest.tools, label);
      }
      for (const newHomeCase of newHomeCases) {
        const label = `${viewport.key} ${newHomeCase.key}`;
        const home = await navigateAndInspect(client, sessionId, newHomeCase.url, viewport, newHomeExpression(manifest.tools));
        assert.deepEqual(home.errors, [], `${label} console errors: ${home.errors.join(' | ')}`);
        assertNewHomeState(home.state, manifest.tools, label);
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
            if (tool.key === 'equipment-load' || tool.key === 'earth-pressure') {
              const importState = await evaluate(client, sessionId, jsonImportExpression(tool, exportState.payload));
              if (tool.key === 'equipment-load') assertEquipmentJsonImportState(importState, label);
              if (tool.key === 'earth-pressure') assertEarthJsonImportState(importState, label);
            }
            if (tool.key === 'earth-pressure') {
              const wallTypeState = await evaluate(client, sessionId, earthWallTypeExpression());
              assert.equal(wallTypeState.value, 'gravity', `${label} ${tool.key} gravity wall type selection`);
              assert.ok(wallTypeState.outputText.includes('重力式工作輸出'), `${label} ${tool.key} gravity output`);
              assert.ok(wallTypeState.outputText.includes('自重與抗傾覆'), `${label} ${tool.key} gravity output groups`);
              assert.ok(wallTypeState.diagramText.includes('重力式擋土牆'), `${label} ${tool.key} gravity diagram label`);
              assert.ok(wallTypeState.diagramText.includes('重力式塊體'), `${label} ${tool.key} gravity wall body`);
              assert.ok(wallTypeState.modelSummary.includes('重力式擋土牆'), `${label} ${tool.key} gravity model summary`);
            }
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
    await removeDirectoryBestEffort(userDataDir);
  }
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
