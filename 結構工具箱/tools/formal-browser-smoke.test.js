const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  resolveEvidenceDir,
  renderAndValidateReportPdf,
  validatePdfFile,
  writeEvidenceSummary,
} = require('./rendered-delivery-evidence');

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
const renderedEvidenceDir = resolveEvidenceDir(repoRoot, 'formal-tools');
const directPrintOutputDir = path.join(repoRoot, 'output', 'playwright', 'formal-direct-print-block');
const inlineValidationCases = {
  'wind-force': {
    inputs: { h: '0' },
    expectedMessage: '請輸入有效之 B / L / h / h_e'
  },
  'wind-cc': {
    inputs: { h: '0' },
    expectedMessage: '請輸入有效之 h / A'
  },
  'wind-open-roof': {
    inputs: { h: '0' },
    expectedMessage: '請輸入有效之 h / h_e / B / L / A'
  },
  'wind-parapet': {
    inputs: { h: '0' },
    expectedMessage: '請輸入有效之 h / h_p',
    reportRecovery: {
      recoveryInputs: { h: '18' },
      expectedReportIssue: '輸入條件尚未通過，無法產生計算書。'
    }
  },
  'wind-fence-sign': {
    inputs: { h: '0' },
    expectedMessage: '請輸入有效之 h / B',
    reportRecovery: {
      reportStatusSelector: '#inputStatus',
      recoveryInputs: { h: '2.0' },
      expectedReportIssue: '請輸入有效之 h / B。'
    }
  },
  'seismic-force': {
    inputs: { SsD: '0' },
    expectedMessage: '請完整填入有效的震區參數'
  },
  'seismic-appendage': {
    inputs: { SsD: '0' },
    expectedMessage: 'SsD 必須為大於 0 的數值',
    reportRecovery: {
      reportStatusSelector: '#inputStatus',
      recoveryInputs: { SsD: '0.6' },
      expectedReportIssue: 'SsD 必須為大於 0 的數值。'
    }
  },
  'seismic-misc': {
    inputs: { SsD: '0' },
    expectedMessage: 'SsD 必須為大於 0 的數值',
    reportRecovery: {
      reportStatusSelector: '#inputStatus',
      recoveryInputs: { SsD: '0.6' },
      expectedReportIssue: 'SsD 必須為大於 0 的數值。'
    }
  },
  'seismic-dynamic': {
    inputs: { hn: '0' },
    expectedMessage: '請完整填入有效的工址條件',
    reportRecovery: {
      reportStatusSelector: '#inputStatus',
      recoveryInputs: { hn: '17.2' },
      expectedReportIssue: '請完整填入有效的工址條件與動力分析結果。'
    }
  }
};

function assertFormalToolCoverage() {
  assert.equal(formalManifest.family, 'formal-tools', 'formal browser smoke manifest family');
  assert.equal(formalManifest.version, '0.3.0', 'formal browser smoke manifest version');
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

function waitForProcessExit(child, timeoutMs = 5000) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function terminateProcessTree(child) {
  if (!child || !Number.isInteger(child.pid)) return;
  if (process.platform === 'win32') {
    await new Promise(resolve => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.once('error', resolve);
      killer.once('exit', resolve);
    });
  } else {
    child.kill('SIGKILL');
  }
  await waitForProcessExit(child, 5000);
}

async function removeDirectoryBestEffort(directoryPath) {
  const resolved = path.resolve(directoryPath);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir())), `refusing to remove non-temp directory: ${resolved}`);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      return;
    } catch (err) {
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(err.code)) throw err;
      await delay(Math.min(1000, 250 * (attempt + 1)));
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

function isTransientEdgeLaunchError(error) {
  if (!error) return false;
  if (['EPERM', 'EACCES', 'EBUSY', 'ECONNREFUSED'].includes(error.code)) return true;
  return /spawn EPERM|WinError 5|access is denied|Permission denied|Timed out waiting|fetch failed|Edge exited before CDP was ready/i.test(error.message || '');
}

async function waitForEdgeVersion(child, versionUrl, timeoutMs = 15000) {
  let exitCode = null;
  const onExit = code => { exitCode = code; };
  child.once('exit', onExit);
  try {
    return await Promise.race([
      waitForJson(versionUrl, timeoutMs),
      new Promise((_, reject) => child.once('error', reject)),
    ]);
  } catch (error) {
    if (exitCode !== null && /Timed out waiting|fetch failed|HTTP \d+/i.test(error.message || '')) {
      throw new Error(`Edge exited before CDP was ready. exitCode=${exitCode}`);
    }
    throw error;
  } finally {
    child.off('exit', onExit);
  }
}

async function launchEdgeCdpWithRetry(edgePath, browserArgs, options, versionUrl, label) {
  const retryDelaysMs = [0, 5000, 15000, 30000, 60000];
  let lastError;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    let edge;
    try {
      edge = spawn(edgePath, browserArgs, options);
      const version = await waitForEdgeVersion(edge, versionUrl, 15000);
      return { edge, version };
    } catch (error) {
      lastError = error;
      if (edge && edge.exitCode === null) {
        await terminateProcessTree(edge);
      }
      const canRetry = attempt < retryDelaysMs.length - 1 && isTransientEdgeLaunchError(error);
      if (!canRetry) throw error;
      const delayMs = retryDelaysMs[attempt + 1];
      console.error(`[${label}] transient Edge launch failure on attempt ${attempt + 1}: ${error.message}; retrying in ${delayMs}ms`);
      await delay(delayMs);
    }
  }
  throw lastError;
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
    if (message.method === 'Page.javascriptDialogOpening') {
      errors.push({
        source: 'dialog',
        text: message.params.message || 'JavaScript dialog opened',
        url: message.params.url || '',
      });
      client.send('Page.handleJavaScriptDialog', { accept: true }, sessionId).catch(() => {});
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

async function evaluateWithUserGesture(client, sessionId, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  }, sessionId);

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluate with user gesture failed');
  }
  return result.result.value;
}

async function settlePage(client, sessionId, frames = 2) {
  await evaluate(client, sessionId, `(async () => {
    let remaining = ${JSON.stringify(frames)};
    await new Promise(resolve => {
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return true;
  })()`);
}

async function setMedia(client, sessionId, media = 'screen') {
  await client.send('Emulation.setEmulatedMedia', { media }, sessionId);
  await settlePage(client, sessionId, 1);
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
  await settlePage(client, sessionId, 2);
  return pageErrors;
}

async function assertDirectWorkPagePrintBlocked(client, sessionId, tool, label, capturePdf = false) {
  const bodyClass = formalManifest.shared.directPrintBodyClass;
  const boundaryClass = formalManifest.shared.directPrintBoundaryClass;
  const boundaryNeedles = formalManifest.shared.directPrintBoundaryNeedles || [];
  const screenState = await evaluate(client, sessionId, `(() => {
    const boundary = document.querySelector('.${boundaryClass}');
    return {
      bodyClass: document.body.classList.contains('${bodyClass}'),
      boundaryExists: !!boundary,
      boundaryRects: boundary?.getClientRects().length || 0,
      stylesheetLoaded: Array.from(document.styleSheets)
        .some(sheet => String(sheet.href || '').includes('direct-print-boundary.css')),
    };
  })()`);
  assert.equal(screenState.bodyClass, true, `${label} ${tool.key} direct-print body class`);
  assert.equal(screenState.boundaryExists, true, `${label} ${tool.key} direct-print boundary exists`);
  assert.equal(screenState.boundaryRects, 0, `${label} ${tool.key} direct-print boundary hidden on screen`);
  assert.equal(screenState.stylesheetLoaded, true, `${label} ${tool.key} direct-print stylesheet loaded`);

  await setMedia(client, sessionId, 'print');
  try {
    const printState = await evaluate(client, sessionId, `(() => {
      const boundary = document.querySelector('.${boundaryClass}');
      return {
        boundaryRects: boundary?.getClientRects().length || 0,
        boundaryText: (boundary?.textContent || '').replace(/\\s+/g, ' ').trim(),
        visibleOtherChildren: Array.from(document.body.children)
          .filter(node => !node.classList.contains('${boundaryClass}') && node.getClientRects().length > 0)
          .map(node => node.id || node.className || node.tagName),
        beforeContent: getComputedStyle(document.body, '::before').content,
        afterContent: getComputedStyle(document.body, '::after').content,
      };
    })()`);
    assert.ok(printState.boundaryRects > 0, `${label} ${tool.key} direct-print boundary rendered`);
    assert.deepEqual(printState.visibleOtherChildren, [], `${label} ${tool.key} direct print hides complete work page`);
    for (const needle of boundaryNeedles) {
      assert.ok(printState.boundaryText.includes(needle), `${label} ${tool.key} direct-print notice includes ${needle}`);
    }
    assert.equal(
      printState.beforeContent.includes('DRAFT') || printState.afterContent.includes('DRAFT'),
      false,
      `${label} ${tool.key} direct print is not a draft report`
    );

    if (capturePdf) {
      fs.mkdirSync(directPrintOutputDir, { recursive: true });
      const pdfPath = path.join(directPrintOutputDir, `${tool.key}.pdf`);
      const printed = await client.send('Page.printToPDF', {
        printBackground: true,
        paperWidth: 8.27,
        paperHeight: 11.69,
        marginTop: 0.55,
        marginRight: 0.45,
        marginBottom: 0.55,
        marginLeft: 0.45,
        preferCSSPageSize: false,
        generateTaggedPDF: true,
      }, sessionId);
      const pdfBuffer = Buffer.from(printed.data || '', 'base64');
      assert.ok(pdfBuffer.length > 1024, `${label} ${tool.key} direct-print block produced PDF`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      const pdf = validatePdfFile(pdfPath, {
        label: `${tool.key} direct-print block`,
        minTextLength: 40,
        requiredNeedles: boundaryNeedles,
        forbiddenNeedles: [tool.titleNeedle, '計畫名稱', 'DRAFT'],
      });
      assert.equal(pdf.pageCount, 1, `${label} ${tool.key} direct-print block is one page`);
      return {
        key: tool.key,
        artifact: path.basename(pdfPath),
        pageCount: pdf.pageCount,
        textLength: pdf.textLength,
      };
    }
  } finally {
    await setMedia(client, sessionId, 'screen');
  }
  return null;
}

function pageStateExpression(tool) {
  return `(async () => {
    const settle = (frames = 2) => new Promise(resolve => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const text = document.body.innerText;
    const byId = id => document.getElementById(id);
    const calc = ${JSON.stringify(tool.calcButton)};
    const reportId = ${JSON.stringify(tool.reportButton || null)};
    const reportSelector = ${JSON.stringify(tool.reportButtonSelector || null)};
    const exportId = ${JSON.stringify(tool.exportButton || null)};
    if (calc && byId(calc)) {
      byId(calc).click();
      await settle(2);
    }
    const readPageOnlyReadinessText = () => (document.querySelector('.page-only-report-status')?.textContent || '').replace(/\\s+/g, ' ').trim();
    const setProjectField = (id, value) => {
      const node = byId(id);
      if (!node) return;
      node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setProjectField('projName', '未填');
    setProjectField('projNo', 'FORMAL-VERIFY-001');
    setProjectField('projDesigner', 'Codex QA');
    await settle(1);
    const placeholderProjectMetaReadinessText = readPageOnlyReadinessText();
    setProjectField('projName', '正式工具驗證案');
    await settle(1);
    const reportModeControls = ${JSON.stringify(tool.reportModeControls || null)};
    const chooseReportMode = async mode => {
      const customButtonId = reportModeControls && reportModeControls[mode + 'Button'];
      const button = customButtonId
        ? byId(customButtonId)
        : document.querySelector('[data-report-mode="' + mode + '"]');
      if (button) {
        button.click();
        await settle(1);
        return {
          mode,
          hiddenValue: byId('printReportMode')?.value || button.dataset.reportMode || customButtonId || mode,
          pressed: button.getAttribute('aria-pressed') || 'true'
        };
      }
      const select = byId((reportModeControls && reportModeControls.selectId) || 'reportMode');
      if (select) {
        const selectValue = (reportModeControls && reportModeControls[mode + 'Value']) || (mode === 'simple' ? 'summary' : 'detailed');
        const hasOption = Array.from(select.options || []).some(option => option.value === selectValue);
        if (hasOption) {
          select.value = selectValue;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          await settle(1);
          return { mode, hiddenValue: mode, pressed: 'true' };
        }
      }
      return null;
    };
    const modeStates = [];
    for (const mode of ['simple', 'detail']) {
      const state = await chooseReportMode(mode);
      if (state) modeStates.push(state);
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
    const pageOnlyReadiness = document.querySelector('.page-only-report-status');
    return {
      title: document.title,
      bodyText: text.slice(0, 12000),
      hasFamily: text.includes(${JSON.stringify(tool.familyNeedle)}),
      hasTitleNeedle: text.includes(${JSON.stringify(tool.titleNeedle)}) || document.title.includes(${JSON.stringify(tool.titleNeedle)}),
      hasCalc: !calc || !!byId(calc),
      hasReport: reportId ? !!byId(reportId) : !!document.querySelector(reportSelector),
      hasExport: !exportId || !!byId(exportId),
      hasReportMode: modeStates.length === 2,
      modeStates,
      diagramExists: ${JSON.stringify(tool.diagramSelector)} ? !!diagram : true,
      diagramWidth: diagramBox ? diagramBox.width : 0,
      diagramHeight: diagramBox ? diagramBox.height : 0,
      diagramBounds: boxPayload(diagramBox),
      diagramRoles,
      roleBoxes,
      hasPageOnlyReadiness: !!pageOnlyReadiness,
      placeholderProjectMetaReadinessText,
      pageOnlyReadinessText: (pageOnlyReadiness?.textContent || '').replace(/\\s+/g, ' ').trim(),
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
    const settle = (frames = 2) => new Promise(resolve => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
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
      const reportModeControls = ${JSON.stringify(tool.reportModeControls || null)};
      const chooseReportMode = async mode => {
        const customButtonId = reportModeControls && reportModeControls[mode + 'Button'];
        const modeButton = customButtonId
          ? document.getElementById(customButtonId)
          : document.querySelector('[data-report-mode="' + mode + '"]');
        if (modeButton) {
          modeButton.click();
          await settle(1);
          return true;
        }
        const select = document.getElementById((reportModeControls && reportModeControls.selectId) || 'reportMode');
        if (select) {
          const selectValue = (reportModeControls && reportModeControls[mode + 'Value']) || (mode === 'simple' ? 'summary' : 'detailed');
          if (Array.from(select.options || []).some(option => option.value === selectValue)) {
            select.value = selectValue;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await settle(1);
            return true;
          }
        }
        return false;
      };
      await chooseReportMode(reportMode || 'detail');
      const button = reportId ? document.getElementById(reportId) : document.querySelector(reportSelector);
      if (!button) return { missingButton: true, html: '' };
      button.click();
      await settle(2);
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

function exportCaptureExpression(tool, projectMetaState = 'complete', exportButtonId = null) {
  return `(async () => {
    const settle = (frames = 2) => new Promise(resolve => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
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
      const projectState = ${JSON.stringify(projectMetaState)};
      const setProjectField = (id, value) => {
        const node = document.getElementById(id);
        if (!node) return;
        node.value = value;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      };
      if (projectState === 'placeholder') {
        setProjectField('projName', '未填');
        setProjectField('projNo', 'FORMAL-VERIFY-001');
        setProjectField('projDesigner', 'Codex QA');
        await settle(1);
      } else if (projectState === 'complete') {
        setProjectField('projName', '正式工具驗證案');
        setProjectField('projNo', 'FORMAL-VERIFY-001');
        setProjectField('projDesigner', 'Codex QA');
        await settle(1);
      }
      const reportModeControls = ${JSON.stringify(tool.reportModeControls || null)};
      const detailButtonId = reportModeControls && reportModeControls.detailButton;
      const detailButton = detailButtonId
        ? document.getElementById(detailButtonId)
        : document.querySelector('[data-report-mode="detail"]');
      if (detailButton) {
        detailButton.click();
        await settle(1);
      } else {
        const reportModeSelect = document.getElementById((reportModeControls && reportModeControls.selectId) || 'reportMode');
        const detailValue = (reportModeControls && reportModeControls.detailValue) || 'detailed';
        if (reportModeSelect && Array.from(reportModeSelect.options || []).some(option => option.value === detailValue)) {
          reportModeSelect.value = detailValue;
          reportModeSelect.dispatchEvent(new Event('input', { bubbles: true }));
          reportModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          await settle(1);
        }
      }
      const exportId = ${JSON.stringify(exportButtonId)} || ${JSON.stringify(tool.exportButton)};
      const button = document.getElementById(exportId);
      if (!button) return { missingButton: true, exportId, downloads: [], payload: null, textLength: 0 };
      button.click();
      await settle(2);
      const text = objectUrls[0] ? await objectUrls[0].blob.text() : '';
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch (_) {}
      return {
        projectMetaState: projectState,
        exportId,
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

async function listPageTargetIds(client) {
  const result = await client.send('Target.getTargets');
  return new Set(
    (result.targetInfos || [])
      .filter(info => info.type === 'page')
      .map(info => info.targetId)
  );
}

const POPUP_TARGET_TIMEOUT_MS = 30000;
const POPUP_READY_TIMEOUT_MS = 30000;

async function waitForNewPageTarget(client, existingTargetIds, label = 'popup', timeoutMs = POPUP_TARGET_TIMEOUT_MS) {
  const startedAt = Date.now();
  let lastPageTargetCount = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const result = await client.send('Target.getTargets');
    const pageTargets = (result.targetInfos || []).filter(info => info.type === 'page');
    lastPageTargetCount = pageTargets.length;
    const popupTarget = pageTargets.find(info => !existingTargetIds.has(info.targetId));
    if (popupTarget) return popupTarget;
    await delay(100);
  }
  throw new Error(`Timed out waiting for popup target after ${timeoutMs}ms: ${label} :: existing=${existingTargetIds.size}, lastPages=${lastPageTargetCount}`);
}

async function waitForTargetClosed(client, targetId, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await client.send('Target.getTargets');
    if (!(result.targetInfos || []).some(info => info.targetId === targetId)) return true;
    await delay(100);
  }
  return false;
}

async function waitForPopupReady(client, sessionId, label, timeoutMs = POPUP_READY_TIMEOUT_MS) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const state = await evaluate(client, sessionId, `(() => ({
        readyState: document.readyState || '',
        title: document.title || '',
        heading: document.querySelector('h1')?.innerText?.trim() || '',
        bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim()
      }))()`);
      lastState = state;
      const reportMarker = state.heading.includes('計算書') || state.bodyText.includes('計算書') || state.title.includes('計算書');
      if (state.readyState === 'complete' && reportMarker && state.bodyText.includes('計畫名稱')) {
        return state;
      }
    } catch (_) {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for popup report content after ${timeoutMs}ms: ${label} :: ${JSON.stringify(lastState)}`);
}

async function popupReportCaptureState(client, pageSessionId, tool, mode = 'default', projectMetaState = 'complete') {
  const setupState = await evaluate(client, pageSessionId, reportPopupSetupExpression(tool, mode, projectMetaState));
  if (setupState.missingButton) {
    return {
      mode: setupState.mode || mode,
      projectMetaState,
      missingButton: true,
      popupOpened: false,
      popupErrors: [],
      title: '',
      heading: '',
      bodyText: '',
      html: '',
      auditHtml: '',
      projectMeta: [],
      readinessLevel: setupState.readinessLevel || '',
      documentState: '',
      documentReason: '',
      documentClass: '',
    };
  }

  const existingTargetIds = await listPageTargetIds(client);
  const openState = await evaluateWithUserGesture(client, pageSessionId, reportPopupOpenExpression(tool, mode));
  if (openState.missingButton) {
    return {
      mode: openState.mode || mode,
      projectMetaState,
      missingButton: true,
      popupOpened: false,
      popupErrors: [],
      title: '',
      heading: '',
      bodyText: '',
      html: '',
      auditHtml: '',
      projectMeta: [],
      readinessLevel: setupState.readinessLevel || '',
      documentState: '',
      documentReason: '',
      documentClass: '',
    };
  }

  const popupLabel = `${tool.key}:${mode}:${projectMetaState}`;
  const popupTarget = await waitForNewPageTarget(client, existingTargetIds, `${popupLabel} :: ${JSON.stringify(openState)}`);
  const attached = await client.send('Target.attachToTarget', {
    targetId: popupTarget.targetId,
    flatten: true,
  });
  const popupSessionId = attached.sessionId;
  await client.send('Page.enable', {}, popupSessionId);
  await client.send('Runtime.enable', {}, popupSessionId);
  await client.send('Log.enable', {}, popupSessionId);
  const popupErrors = collectPageErrors(client, popupSessionId);

  try {
    await waitForPopupReady(client, popupSessionId, popupLabel);
    const state = await evaluate(client, popupSessionId, `(() => {
      const html = document.documentElement ? document.documentElement.outerHTML : '';
      return {
        title: document.title || '',
        heading: document.querySelector('h1')?.innerText?.trim() || '',
        bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim(),
        html,
        auditHtml: html.replace(/data:image\\/png;base64,[^"'\\s<>]+/g, 'data:image/png;base64,[omitted]'),
        projectMeta: Array.from(document.querySelectorAll('.rep-meta div, .meta div')).map(node => (node.textContent || '').replace(/\\s+/g, ' ').trim()),
        documentState: document.querySelector('[data-document-state]')?.getAttribute('data-document-state') || '',
        documentReason: document.querySelector('[data-document-state]')?.getAttribute('data-document-reason') || '',
        documentClass: document.querySelector('[data-document-class]')?.getAttribute('data-document-class') || ''
      };
    })()`);
    return {
      mode: openState.mode || mode,
      projectMetaState,
      missingButton: false,
      popupOpened: true,
      popupErrors: popupErrors.errors.slice(),
      title: state.title,
      heading: state.heading,
      bodyText: state.bodyText,
      html: state.html,
      auditHtml: state.auditHtml,
      projectMeta: state.projectMeta,
      readinessLevel: setupState.readinessLevel || '',
      documentState: state.documentState,
      documentReason: state.documentReason,
      documentClass: state.documentClass,
    };
  } finally {
    popupErrors.unsubscribe();
    await client.send('Target.closeTarget', { targetId: popupTarget.targetId }).catch(() => {});
    const popupClosed = await waitForTargetClosed(client, popupTarget.targetId);
    assert.equal(popupClosed, true, `${popupLabel} popup target closes before the next report`);
  }
}

function jsonRoundTripExpression(tool, sourcePayload) {
  return `(async () => {
    const settle = (frames = 2) => new Promise(resolve => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
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
    const collectResultValues = () => Array.from(document.querySelectorAll('.result-item .value, .mini-card .value, .banner-key .v, .banner-key .k-val, #banner strong, #controlTable tbody td, #dirComboTable tbody td'))
      .map(node => (node.textContent || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean);
    const readText = selector => (document.querySelector(selector)?.textContent || '').replace(/\\s+/g, ' ').trim();
    const readCaseStatus = () => readText('#caseStatus') || readText('#caseJsonStatus') || readText('#staticImportStatus');
    const waitForImportStatus = async () => {
      const started = Date.now();
      while (Date.now() - started < 1000) {
        if (readCaseStatus().includes('已匯入案件 JSON')) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return readCaseStatus().includes('已匯入案件 JSON');
    };
    const clearCaseStatus = () => {
      for (const selector of ['#caseStatus', '#caseJsonStatus', '#staticImportStatus']) {
        const node = document.querySelector(selector);
        if (node) node.textContent = '';
      }
    };
    const waitForCaseStatus = async needle => {
      const started = Date.now();
      while (Date.now() - started < 1500) {
        if (readCaseStatus().includes(needle)) return readCaseStatus();
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return readCaseStatus();
    };
    const importPayloadDirectly = async (candidate, suffix, expectedNeedle) => {
      clearCaseStatus();
      importCaseJsonFile(new File(
        [JSON.stringify(candidate)],
        ${JSON.stringify(tool.key)} + '-' + suffix + '.json',
        { type: 'application/json' }
      ));
      const status = await waitForCaseStatus(expectedNeedle);
      await settle(2);
      return status;
    };
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
    await waitForImportStatus();
    await settle(2);

    let recalculatedAfterImport = false;
    let resultValues = collectResultValues();
    if (!resultValues.some(value => value !== '—')) {
      const calc = document.getElementById(${JSON.stringify(tool.calcButton)});
      if (calc) {
        calc.click();
        recalculatedAfterImport = true;
        await settle(2);
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
    const successfulCaseStatus = readCaseStatus();

    let versionGuard = { status: '', unchanged: false };
    let fingerprintGuard = { status: '', restored: false };
    if (typeof importCaseJsonFile === 'function') {
      const wrongVersion = JSON.parse(JSON.stringify(payload));
      wrongVersion.tool = { ...(wrongVersion.tool || {}), version: 'V0.0' };
      wrongVersion.toolVersion = 'V0.0';
      writeValue('projName', 'version-guard-sentinel');
      const versionStatus = await importPayloadDirectly(wrongVersion, 'wrong-version', '已保留原輸入');
      versionGuard = {
        status: versionStatus,
        unchanged: readValue('projName') === 'version-guard-sentinel'
      };

      const wrongFingerprint = JSON.parse(JSON.stringify(payload));
      wrongFingerprint.calculationFingerprint = 'CF-0000000000000000';
      writeValue('projName', 'fingerprint-guard-sentinel');
      const fingerprintStatus = await importPayloadDirectly(wrongFingerprint, 'wrong-fingerprint', '已保留原輸入');
      fingerprintGuard = {
        status: fingerprintStatus,
        restored: readValue('projName') === 'fingerprint-guard-sentinel'
      };
    }

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
      caseStatus: successfulCaseStatus,
      resultSelectors: {
        '#r-cf .value': readText('#r-cf .value'),
        '#r-qz .value': readText('#r-qz .value'),
        '#r-force .value': readText('#r-force .value')
      },
      resultValues,
      payloadSchema,
      payloadToolId,
      versionGuard,
      fingerprintGuard
    };
  })()`;
}

function goldenCaseExpression(tool, goldenCase) {
  const inputs = goldenCase.inputs || {};
  const expectedSelectors = Object.keys(goldenCase.expectedSelectors || {});
  const expectedMetricPaths = Object.keys(goldenCase.expectedMetrics || {});
  const clearLocalStorageKeys = goldenCase.clearLocalStorageKeys || [];
  return `(async () => {
    const settle = (frames = 2) => new Promise(resolve => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
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
      await settle(2);
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

function seismicDynamicProjectRestoreExpression() {
  return `(async () => {
    const settle = (frames = 2) => new Promise(resolve => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const byId = id => document.getElementById(id);
    const readProjectMeta = () => ({
      name: byId('projName')?.value || '',
      no: byId('projNo')?.value || '',
      designer: byId('projDesigner')?.value || ''
    });
    const setProjectMeta = meta => {
      for (const [id, value] of Object.entries({
        projName: meta.name,
        projNo: meta.no,
        projDesigner: meta.designer
      })) {
        const node = byId(id);
        if (!node) continue;
        node.value = value;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    const readReadinessText = () => (document.querySelector('.page-only-report-status')?.textContent || '').replace(/\\s+/g, ' ').trim();
    const numericValue = id => {
      const value = parseFloat(byId(id)?.value || '');
      return Number.isFinite(value) ? value : null;
    };
    const staleMeta = { name: '殘留案名', no: 'STALE-001', designer: '舊設計人' };

    setProjectMeta(staleMeta);
    if (byId('software')) byId('software').value = 'STALE-SOFTWARE';
    if (byId('remark')) byId('remark').value = 'STALE-REMARK';
    setStorageJson(STATIC_STORAGE_KEY, {
      savedAt: '2026-07-03T00:00:00.000Z',
      project: {
        name: '',
        no: '',
        designer: '',
        zone: '測試工址',
        zoneCity: byId('zoneCity')?.value || '',
        zoneDist: byId('zoneDist')?.value || '',
        SsD: numericValue('SsD') ?? 0.6,
        S1D: numericValue('S1D') ?? 0.25,
        SsM: numericValue('SsM') ?? 0.9,
        S1M: numericValue('S1M') ?? 0.35,
        siteInputMode: byId('siteInputMode')?.value || 'manual',
        SsDLower: numericValue('SsDLower') ?? 0.4,
        S1DLower: numericValue('S1DLower') ?? 0.15,
        siteClass: byId('siteClass')?.value || '2',
        importanceKey: byId('impClass')?.value || 'normal',
        hn: numericValue('hn') ?? 17.2,
        W: numericValue('W') ?? 2400
      },
      x: {
        systemKey: byId('sysX')?.value || '',
        Tdesign: numericValue('Tx') ?? 1.2,
        Vdesign: 123.4
      },
      y: {
        systemKey: byId('sysY')?.value || byId('sysX')?.value || '',
        Tdesign: numericValue('Ty') ?? 1.1,
        Vdesign: 118.2
      }
    });
    loadStaticSummaryIntoPage();
    await settle(2);
    const afterStatic = {
      ...readProjectMeta(),
      readinessText: readReadinessText(),
      staticImportStatus: (byId('staticImportStatus')?.textContent || '').replace(/\\s+/g, ' ').trim()
    };

    setProjectMeta({ name: '正式工具驗證案', no: 'FORMAL-VERIFY-001', designer: 'Codex QA' });
    await settle(1);
    const dynamicCalculated = calcDynamic();
    const savedDynamic = getStorageJson(DYNAMIC_STORAGE_KEY);
    if (savedDynamic?.project) {
      savedDynamic.project = Object.assign({}, savedDynamic.project, {
        name: '',
        no: '',
        designer: '',
        software: '',
        remark: ''
      });
      setStorageJson(DYNAMIC_STORAGE_KEY, savedDynamic);
    }
    setProjectMeta(staleMeta);
    if (byId('software')) byId('software').value = 'STALE-SOFTWARE';
    if (byId('remark')) byId('remark').value = 'STALE-REMARK';
    const dynamicRestored = restoreDynamicSummary();
    if (typeof renderDynamicReportReadiness === 'function') {
      renderDynamicReportReadiness();
    }
    await settle(2);
    const afterDynamic = {
      ...readProjectMeta(),
      software: byId('software')?.value || '',
      remark: byId('remark')?.value || '',
      readinessText: readReadinessText(),
      resultText: (byId('summaryCard')?.textContent || document.body.textContent || '').replace(/\\s+/g, ' ').trim()
    };

    return {
      dynamicCalculated,
      dynamicRestored,
      afterStatic,
      afterDynamic
    };
  })()`;
}

function windOverviewProjectStorageExpression() {
  return `(async () => {
    const settle = (frames = 2) => new Promise(resolve => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const normalizeText = value => String(value || '').replace(/\\s+/g, ' ').trim();
    const waitFor = async (selector, timeoutMs = 1500) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const node = document.querySelector(selector);
        if (node) return node;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return document.querySelector(selector);
    };
    const overviewStorageKey = 'wind-overview-params';
    const draftStorageKey = 'toolProjectStorage:wind-overview:draft.v1';
    localStorage.setItem(overviewStorageKey, JSON.stringify({
      city: '臺北市',
      terrain: 'C',
      impClass: 'IV',
      Kzt: 1,
      H: 30,
      floors: 10,
      Bx: 20,
      By: 40,
      projName: '舊案名',
      projNo: 'OLD-001',
      projDesigner: '舊設計人',
      savedAt: '2026-07-03T00:00:00.000Z'
    }));
    if (typeof loadOverview === 'function') {
      loadOverview();
      await settle(2);
    }
    const beforeSummary = normalizeText(document.getElementById('summaryBox')?.textContent || '');
    const draftPayload = {
      schema: 'tool-project-storage.v1',
      storageVersion: '0.1.0',
      tool: { id: 'wind-overview', name: '耐風設計案件總覽', version: 'V1' },
      savedAt: '2026-07-03T00:10:00.000Z',
      fields: {
        projName: { type: 'text', value: '' },
        projNo: { type: 'text', value: 'OVERVIEW-001' },
        projDesigner: { type: 'text', value: 'Codex QA' },
        city: { type: 'select-one', value: '臺北市' },
        terrain: { type: 'select-one', value: 'B' },
        impClass: { type: 'select-one', value: 'IV' },
        Kzt: { type: 'number', value: '1.10' },
        H: { type: 'number', value: '42' },
        floors: { type: 'number', value: '12' },
        Bx: { type: 'number', value: '18' },
        By: { type: 'number', value: '36' }
      }
    };
    draftPayload.review = {
      reviewVersion: '1',
      status: 'confirmed',
      reviewer: '測試複核人',
      reviewedAt: '2026-07-03T00:20:00.000Z',
      reviewedSnapshot: ToolProjectStorage.buildReviewSnapshotFromFields(draftPayload.fields),
      scope: '本頁案件資料與計算輸入'
    };
    localStorage.setItem(draftStorageKey, JSON.stringify(draftPayload));
    const loadDraftButton = await waitFor('[data-project-storage-draft-load]');
    let previewShownBeforeApply = false;
    let previewText = '';
    if (loadDraftButton) {
      loadDraftButton.click();
      await settle(3);
      const preview = document.querySelector('[data-project-storage-preview]');
      previewShownBeforeApply = !!preview && !preview.hidden;
      previewText = normalizeText(preview?.textContent || '');
      const applyDraftButton = await waitFor('[data-project-storage-apply]');
      if (applyDraftButton) {
        applyDraftButton.click();
        await settle(3);
      }
    }
    const summaryText = normalizeText(document.getElementById('summaryBox')?.textContent || '');
    const statusText = normalizeText(document.querySelector('[data-project-storage-status]')?.textContent || '');
    const reviewTextAfterApply = normalizeText(document.querySelector('[data-project-review]')?.textContent || '');
    const heightInput = document.getElementById('H');
    if (heightInput) {
      heightInput.value = '43';
      heightInput.dispatchEvent(new Event('input', { bubbles: true }));
      heightInput.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(2);
    }
    const reviewTextAfterChange = normalizeText(document.querySelector('[data-project-review]')?.textContent || '');
    const storedOverview = JSON.parse(localStorage.getItem(overviewStorageKey) || '{}');
    return {
      hasProjectStorageBar: !!document.querySelector('.project-storage-bar'),
      hasLoadDraftButton: !!loadDraftButton,
      hasReviewControl: !!document.querySelector('[data-project-review]'),
      previewShownBeforeApply,
      previewText,
      beforeSummary,
      projectName: document.getElementById('projName')?.value || '',
      projectNo: document.getElementById('projNo')?.value || '',
      projectDesigner: document.getElementById('projDesigner')?.value || '',
      summaryText,
      statusText,
      reviewTextAfterApply,
      reviewTextAfterChange,
      storedOverviewProjectName: storedOverview.projName || '',
      storedOverviewProjectNo: storedOverview.projNo || '',
      storedOverviewProjectDesigner: storedOverview.projDesigner || ''
    };
  })()`;
}

function inlineValidationExpression(tool) {
  const validationCase = inlineValidationCases[tool.key];
  if (!validationCase) return null;
  return `(async () => {
    const settle = (frames = 2) => new Promise(resolve => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const inputs = ${JSON.stringify(validationCase.inputs)};
    const calc = document.getElementById(${JSON.stringify(tool.calcButton)});
    const status = document.getElementById('inputStatus');
    const missingInputs = [];
    const setInput = (id, value) => {
      const el = document.getElementById(id);
      if (!el) {
        missingInputs.push(id);
        return;
      }
      if (el.type === 'checkbox') {
        el.checked = Boolean(value);
      } else {
        el.value = String(value);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    for (const [id, value] of Object.entries(inputs)) setInput(id, value);
    if (calc) {
      calc.click();
      await settle(2);
    }
    const result = {
      missingCalc: !calc,
      missingStatus: !status,
      missingInputs,
      statusText: (status?.textContent || '').replace(/\\s+/g, ' ').trim()
    };
    const recovery = ${JSON.stringify(validationCase.reportRecovery || null)};
    if (recovery) {
      const reportBtn = document.getElementById(${JSON.stringify(tool.reportButton || null)})
        || document.querySelector(${JSON.stringify(tool.reportButtonSelector || '.btn-print')});
      const reportStatusSelector = recovery.reportStatusSelector || '#windReportStatus';
      if (reportBtn) {
        reportBtn.click();
        await settle(2);
      }
      result.missingReportButton = !reportBtn;
      result.reportStatusAfterInvalidPrint = (document.querySelector(reportStatusSelector)?.textContent || '').replace(/\\s+/g, ' ').trim();
      for (const [id, value] of Object.entries(recovery.recoveryInputs || {})) setInput(id, value);
      if (calc) {
        calc.click();
        await settle(2);
      }
      result.reportStatusAfterRecovery = (document.querySelector(reportStatusSelector)?.textContent || '').replace(/\\s+/g, ' ').trim();
    }
    return result;
  })()`;
}

function reportPopupSetupExpression(tool, mode = null, projectMetaState = 'current') {
  return `(async () => {
    const settle = (frames = 2) => new Promise(resolve => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const byId = id => document.getElementById(id);
    const reportId = ${JSON.stringify(tool.reportButton || null)};
    const reportSelector = ${JSON.stringify(tool.reportButtonSelector || null)};
    const reportMode = ${JSON.stringify(mode)};
    const projectState = ${JSON.stringify(projectMetaState)};
    const reportModeControls = ${JSON.stringify(tool.reportModeControls || null)};
    const setProjectField = (id, value) => {
      const node = byId(id);
      if (!node) return;
      node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const chooseReportMode = async nextMode => {
      const customButtonId = reportModeControls && reportModeControls[nextMode + 'Button'];
      const modeButton = customButtonId
        ? byId(customButtonId)
        : document.querySelector('[data-report-mode="' + nextMode + '"]');
      if (modeButton) {
        modeButton.click();
        await settle(1);
        return true;
      }
      const select = byId((reportModeControls && reportModeControls.selectId) || 'reportMode');
      if (select) {
        const selectValue = (reportModeControls && reportModeControls[nextMode + 'Value']) || (nextMode === 'simple' ? 'summary' : 'detailed');
        if (Array.from(select.options || []).some(option => option.value === selectValue)) {
          select.value = selectValue;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          await settle(1);
          return true;
        }
      }
      return false;
    };
    if (projectState === 'placeholder') {
      setProjectField('projName', '未填');
      setProjectField('projNo', 'FORMAL-VERIFY-001');
      setProjectField('projDesigner', 'Codex QA');
      await settle(1);
    } else if (projectState === 'complete') {
      setProjectField('projName', '正式工具驗證案');
      setProjectField('projNo', 'FORMAL-VERIFY-001');
      setProjectField('projDesigner', 'Codex QA');
      await settle(1);
    }
    if (reportMode) await chooseReportMode(reportMode);
    await settle(1);
    const button = reportId ? byId(reportId) : document.querySelector(reportSelector);
    const readinessLevel = typeof window.ToolReportUI?.getPageReportReadinessLevel === 'function'
      ? window.ToolReportUI.getPageReportReadinessLevel(document)
      : (() => {
        if (document.querySelector('.page-only-report-status.blocked, .page-only-report-status .blocked')) return 'blocked';
        if (document.querySelector('.page-only-report-status.review, .page-only-report-status .review')) return 'review';
        if (document.querySelector('.page-only-report-status.ready, .page-only-report-status .ready')) return 'ready';
        return '';
      })();
    return {
      mode: reportMode || 'default',
      missingButton: !button,
      projectMetaState: projectState,
      readinessLevel,
    };
  })()`;
}

function reportPopupOpenExpression(tool, mode = null) {
  return `(() => {
    const reportId = ${JSON.stringify(tool.reportButton || null)};
    const reportSelector = ${JSON.stringify(tool.reportButtonSelector || null)};
    const reportMode = ${JSON.stringify(mode)};
    const runtimeErrors = [];
    const onError = event => runtimeErrors.push(String(event.message || event.error?.message || 'unknown page error'));
    window.addEventListener('error', onError);
    const button = reportId ? document.getElementById(reportId) : document.querySelector(reportSelector);
    if (!button) {
      window.removeEventListener('error', onError);
      return { mode: reportMode || 'default', missingButton: true, runtimeErrors };
    }
    button.click();
    window.removeEventListener('error', onError);
    return {
      mode: reportMode || 'default',
      missingButton: false,
      reportStatus: (document.getElementById('windReportStatus')?.textContent || '').replace(/\\s+/g, ' ').trim(),
      traceHelper: typeof window.ToolReportUI?.buildReportTrace,
      runtimeErrors,
    };
  })()`;
}

function assertPageState(state, tool, label) {
  const missingProjectMetaPattern = /計算書表頭尚未填齊計畫名稱、編號或設計人|計畫名稱、編號或設計人尚未完整，產報前建議補齊|計畫名稱 \/ 編號 \/ 設計人尚未完整，附件識別不足/;
  assert.equal(state.hasFamily, true, `${label} ${tool.key} family label`);
  assert.equal(state.hasTitleNeedle, true, `${label} ${tool.key} title label`);
  assert.equal(state.hasCalc, true, `${label} ${tool.key} calc button`);
  assert.equal(state.hasReport, true, `${label} ${tool.key} report button`);
  assert.equal(state.hasExport, true, `${label} ${tool.key} export button`);
  assert.equal(state.hasPageOnlyReadiness, true, `${label} ${tool.key} page-only readiness exists`);
  assert.ok(state.pageOnlyReadinessText.includes('不會寫入計算書或列印 PDF'), `${label} ${tool.key} page-only readiness boundary`);
  assert.ok(/暫勿作附件|優先複核|可作附件/.test(state.pageOnlyReadinessText), `${label} ${tool.key} page-only readiness status: ${state.pageOnlyReadinessText}`);
  assert.equal(state.pageOnlyReadinessText.includes('[object Event]'), false, `${label} ${tool.key} page-only readiness should not stringify DOM events: ${state.pageOnlyReadinessText}`);
  assert.equal(
    missingProjectMetaPattern.test(state.placeholderProjectMetaReadinessText),
    true,
    `${label} ${tool.key} page-only readiness should treat placeholder project metadata as missing: ${state.placeholderProjectMetaReadinessText}`
  );
  assert.equal(
    missingProjectMetaPattern.test(state.pageOnlyReadinessText),
    false,
    `${label} ${tool.key} page-only readiness should refresh after project meta input: ${state.pageOnlyReadinessText}`
  );
  assert.equal(state.horizontalOverflow, false, `${label} ${tool.key} horizontal overflow: ${JSON.stringify(state.overflowing, null, 2)}`);
  assert.ok(state.visibleTextLength > 500, `${label} ${tool.key} visible content`);

  if (tool.reportMode) {
    assert.equal(state.hasReportMode, true, `${label} ${tool.key} report mode controls`);
    assert.deepEqual(
      state.modeStates.map(mode => mode.mode),
      ['simple', 'detail'],
      `${label} ${tool.key} report mode toggles`
    );
    assert.equal(
      state.modeStates.every(mode => mode.pressed === 'true'),
      true,
      `${label} ${tool.key} report mode active states`
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

function assertReportContentState(state, tool, label, mode = 'default') {
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
  const pageOnlyNeedles = formalManifest.reportPageOnlyForbiddenNeedles || [];
  pageOnlyNeedles.forEach(needle => {
    const auditHtml = state.auditHtml || state.html;
    const index = auditHtml.indexOf(needle);
    const context = index >= 0 ? auditHtml.slice(Math.max(0, index - 160), index + 160) : '';
    assert.equal(index >= 0, false, `${label} ${tool.key} ${mode} report excludes page-only status ${needle}: ${context}`);
  });
  const disclosureNeedles = formalManifest.reportDisclosureNeedles?.[tool.discipline] || [];
  for (const needle of disclosureNeedles) {
    const auditHtml = state.auditHtml || state.html;
    assert.ok(auditHtml.includes(needle), `${label} ${tool.key} ${mode} report discloses ${needle}`);
  }
  if (tool.reportTraceRequired) {
    const auditHtml = state.auditHtml || state.html;
    ['產出工具', '工具版本', '輸出時間', '計算指紋'].forEach(needle => {
      assert.ok(auditHtml.includes(needle), `${label} ${tool.key} ${mode} report trace includes ${needle}`);
    });
    assert.match(auditHtml, /工具版本<\/b>\s*v\d+(?:\.\d+)*(?:[-+.\w]*)?/i, `${label} ${tool.key} ${mode} report trace canonical version`);
    assert.match(auditHtml, /計算指紋<\/b>CF-[0-9A-F]{16}/, `${label} ${tool.key} ${mode} report trace fingerprint`);
  }
  assertReportExpectations(state, tool, label, mode);
}

function windOverviewDispatchSetupExpression() {
  return `(async () => {
    const settle = (frames = 2) => new Promise(resolve => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const setInput = (id, value) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const validFields = {
      projName: '耐風共用派送案',
      projNo: 'WIND-DISPATCH-001',
      projDesigner: 'Codex QA',
      city: '臺北市',
      terrain: 'B',
      impClass: 'IV',
      Kzt: '1.15',
      H: '48',
      floors: '12',
      Bx: '18',
      By: '36'
    };
    Object.entries(validFields).forEach(([id, value]) => setInput(id, value));
    document.getElementById('btnSave')?.click();
    await settle(3);
    const sharedProfileKey = 'windSharedProfile:latest.v1';
    const overviewKey = 'wind-overview-params';
    const validSharedRaw = localStorage.getItem(sharedProfileKey);
    const validOverviewRaw = localStorage.getItem(overviewKey);
    const validMessage = String(document.getElementById('saveMsg')?.textContent || '').replace(/\\s+/g, ' ').trim();
    const invalidAttempts = [];
    for (const field of ['Kzt', 'H', 'Bx', 'By']) {
      for (const invalidValue of ['-1', '']) {
        Object.entries(validFields).forEach(([id, value]) => setInput(id, value));
        setInput(field, invalidValue);
        document.getElementById('btnSave')?.click();
        await settle(1);
        invalidAttempts.push({
          field,
          invalidValue,
          message: String(document.getElementById('saveMsg')?.textContent || '').replace(/\\s+/g, ' ').trim(),
          sharedProfileUnchanged: localStorage.getItem(sharedProfileKey) === validSharedRaw,
          overviewUnchanged: localStorage.getItem(overviewKey) === validOverviewRaw
        });
      }
    }
    Object.entries(validFields).forEach(([id, value]) => setInput(id, value));
    const raw = localStorage.getItem(sharedProfileKey);
    const profile = raw ? JSON.parse(raw) : null;
    const links = Array.from(document.querySelectorAll('a[data-wind-profile-dispatch="true"]')).map(link => link.getAttribute('href'));
    return {
      profile,
      links,
      message: validMessage,
      invalidAttempts,
      specialHref: document.querySelector('a[href^="wind-special.html"]')?.getAttribute('href') || ''
    };
  })()`;
}

function windSharedProfileTargetExpression() {
  return `(() => ({
    applied: document.documentElement.dataset.windProfileApplied || '',
    name: document.getElementById('projName')?.value || '',
    no: document.getElementById('projNo')?.value || '',
    designer: document.getElementById('projDesigner')?.value || '',
    city: document.getElementById('city')?.value || '',
    terrain: document.getElementById('terrain')?.value || '',
    importanceClass: document.getElementById('impClass')?.value || '',
    Kzt: document.getElementById('Kzt')?.value || '',
    B: document.getElementById('B')?.value || '',
    L: document.getElementById('L')?.value || '',
    floors: document.getElementById('N')?.value || '',
    storyHeight: document.getElementById('h')?.value || '',
    status: String(document.querySelector('[data-wind-shared-profile-status]')?.textContent || '').replace(/\\s+/g, ' ').trim(),
    targets: (window.__windSharedProfileApply?.applied || []).map(item => item.target)
  }))()`;
}

function assertReportState(state, tool, label, mode = 'default') {
  assert.equal(state.missingButton, false, `${label} ${tool.key} report button exists`);
  assert.equal(state.openCount, 1, `${label} ${tool.key} report open count`);
  assert.equal(state.openedDocument, true, `${label} ${tool.key} report document open`);
  assert.equal(state.closedDocument, true, `${label} ${tool.key} report document close`);
  assertReportContentState(state, tool, label, mode);
}

function assertPopupReportState(state, tool, label, mode = 'default') {
  const metaText = Array.isArray(state.projectMeta) ? state.projectMeta.join(' ') : '';
  const reportTitleText = `${state.title || ''} ${state.heading || ''}`.trim();
  assert.equal(state.projectMetaState, 'complete', `${label} ${tool.key} popup project state`);
  assert.equal(state.missingButton, false, `${label} ${tool.key} popup report button exists`);
  assert.equal(state.popupOpened, true, `${label} ${tool.key} popup report opened`);
  assert.ok(reportTitleText.includes('計算書'), `${label} ${tool.key} popup report title`);
  assert.ok(state.bodyText.includes('計畫名稱'), `${label} ${tool.key} popup report meta`);
  assert.equal(state.bodyText.includes('[object Event]'), false, `${label} ${tool.key} popup report should not stringify DOM events`);
  assert.ok(metaText.includes('正式工具驗證案') || state.bodyText.includes('正式工具驗證案'), `${label} ${tool.key} popup report project name`);
  assert.ok(metaText.includes('FORMAL-VERIFY-001') || state.bodyText.includes('FORMAL-VERIFY-001'), `${label} ${tool.key} popup report project no`);
  assert.ok(metaText.includes('Codex QA') || state.bodyText.includes('Codex QA'), `${label} ${tool.key} popup report project designer`);
  assert.equal(state.bodyText.includes('未填'), false, `${label} ${tool.key} popup report should exclude placeholder project text`);
  assertPopupDocumentStateMatchesPage(state, tool, label);
  assertNoPageErrors(state.popupErrors || [], `${label} ${tool.key} popup report`);
  assertReportContentState(state, tool, label, mode);
}

function assertPlaceholderPopupReportState(state, tool, label, mode = 'default') {
  const metaText = Array.isArray(state.projectMeta) ? state.projectMeta.join(' ') : '';
  const reportText = `${metaText} ${state.bodyText || ''}`.trim();
  const reportTitleText = `${state.title || ''} ${state.heading || ''}`.trim();
  assert.equal(state.projectMetaState, 'placeholder', `${label} ${tool.key} placeholder popup project state`);
  assert.equal(state.missingButton, false, `${label} ${tool.key} placeholder popup report button exists`);
  assert.equal(state.popupOpened, true, `${label} ${tool.key} placeholder popup report opened`);
  assert.ok(reportTitleText.includes('計算書'), `${label} ${tool.key} placeholder popup report title`);
  assert.ok(reportText.includes('FORMAL-VERIFY-001'), `${label} ${tool.key} placeholder popup report project no`);
  assert.ok(reportText.includes('Codex QA'), `${label} ${tool.key} placeholder popup report project designer`);
  assert.equal(reportText.includes('未填'), false, `${label} ${tool.key} placeholder popup report should exclude placeholder project text`);
  assert.equal(reportText.includes('正式工具驗證案'), false, `${label} ${tool.key} placeholder popup report should not retain completed project name`);
  assert.ok(['review', 'blocked'].includes(state.readinessLevel), `${label} ${tool.key} placeholder page requires review or is blocked`);
  assertPopupDocumentStateMatchesPage(state, tool, label);
  for (const needle of formalManifest.reportPageOnlyForbiddenNeedles || []) {
    assert.equal(reportText.includes(needle), false, `${label} ${tool.key} placeholder popup excludes page-only wording: ${needle}`);
  }
  assertNoPageErrors(state.popupErrors || [], `${label} ${tool.key} placeholder popup report`);
  assertReportContentState(state, tool, label, mode);
}

function assertPopupDocumentStateMatchesPage(state, tool, label) {
  assert.ok(['ready', 'review', 'blocked'].includes(state.readinessLevel), `${label} ${tool.key} exposes page readiness`);
  if (state.readinessLevel === 'ready') {
    assert.equal(state.documentState, '', `${label} ${tool.key} ready popup report has no draft document state`);
    assert.equal(state.documentReason, '', `${label} ${tool.key} ready popup report has no draft reason`);
    assert.equal(state.documentClass, 'ready-to-sign', `${label} ${tool.key} ready popup report carries sign-off candidate class`);
    assert.ok(state.bodyText.includes('文件分類｜可送簽版'), `${label} ${tool.key} ready popup report identifies the sign-off candidate`);
    assert.ok(state.bodyText.includes('正式附件仍須完成公司簽認'), `${label} ${tool.key} ready popup report preserves the approval boundary`);
    assert.equal(state.bodyText.includes('DRAFT／非正式附件'), false, `${label} ${tool.key} ready popup report has no draft label`);
    return;
  }
  assert.equal(state.documentClass, '', `${label} ${tool.key} non-ready popup report does not claim ready-to-sign class`);
  assert.equal(state.documentState, 'draft', `${label} ${tool.key} non-ready popup report is draft`);
  assert.equal(state.documentReason, state.readinessLevel, `${label} ${tool.key} popup reason matches page readiness`);
  const expectedLabel = state.readinessLevel === 'blocked'
    ? 'DRAFT／非正式附件 - 檢核不符'
    : 'DRAFT／非正式附件 - 待人工複核';
  assert.ok(state.bodyText.includes(expectedLabel), `${label} ${tool.key} popup report includes ${expectedLabel}`);
}

function getReportDocumentState(state) {
  const html = String(state?.html || '');
  const reason = state?.documentReason
    || html.match(/data-document-reason=["'](ready|review|blocked)["']/i)?.[1]?.toLowerCase()
    || '';
  const draft = state?.documentState === 'draft' || /data-document-state=["']draft["']/i.test(html);
  return { draft, reason };
}

function getReportPdfDocumentStateNeedles(state) {
  const documentState = getReportDocumentState(state);
  const label = documentState.reason === 'blocked'
    ? 'DRAFT／非正式附件 - 檢核不符'
    : 'DRAFT／非正式附件 - 待人工複核';
  return {
    required: documentState.draft ? [label] : ['文件分類｜可送簽版'],
    forbidden: documentState.draft ? [] : ['DRAFT／非正式附件'],
  };
}

function assertSeismicDynamicProjectRestoreState(state, label) {
  assert.equal(state.dynamicCalculated, true, `${label} seismic-dynamic recalculates before restore test`);
  assert.equal(state.dynamicRestored, true, `${label} seismic-dynamic restores saved summary`);
  assert.equal(state.afterStatic.name, '', `${label} seismic-dynamic static restore clears project name`);
  assert.equal(state.afterStatic.no, '', `${label} seismic-dynamic static restore clears project number`);
  assert.equal(state.afterStatic.designer, '', `${label} seismic-dynamic static restore clears designer`);
  assert.ok(state.afterStatic.staticImportStatus.includes('已讀到等值靜力分析摘要'), `${label} seismic-dynamic static summary status`);
  assert.ok(state.afterStatic.staticImportStatus.includes('案件：—'), `${label} seismic-dynamic static restore summary clears project name`);
  assert.equal(state.afterDynamic.name, '', `${label} seismic-dynamic dynamic restore clears project name`);
  assert.equal(state.afterDynamic.no, '', `${label} seismic-dynamic dynamic restore clears project number`);
  assert.equal(state.afterDynamic.designer, '', `${label} seismic-dynamic dynamic restore clears designer`);
  assert.equal(state.afterDynamic.software, '', `${label} seismic-dynamic dynamic restore clears software`);
  assert.equal(state.afterDynamic.remark, '', `${label} seismic-dynamic dynamic restore clears remark`);
  assert.ok(state.afterDynamic.resultText.includes('動力分析'), `${label} seismic-dynamic restored result remains rendered`);
  assert.equal(state.afterDynamic.resultText.includes('殘留案名'), false, `${label} seismic-dynamic restored result should not keep stale project name`);
}

function assertWindOverviewProjectStorageState(state, label) {
  assert.equal(state.hasProjectStorageBar, true, `${label} wind-overview project storage bar exists`);
  assert.equal(state.hasLoadDraftButton, true, `${label} wind-overview project storage draft load button exists`);
  assert.equal(state.hasReviewControl, true, `${label} wind-overview page-only review control exists`);
  assert.equal(state.previewShownBeforeApply, true, `${label} wind-overview preview requires confirmation before applying draft`);
  assert.ok(state.previewText.includes('儲存格式 0.1.0'), `${label} wind-overview preview exposes legacy storage version`);
  assert.ok(state.beforeSummary.includes('舊案名'), `${label} wind-overview baseline summary uses existing localStorage`);
  assert.equal(state.projectName, '', `${label} wind-overview draft restore clears project name`);
  assert.equal(state.projectNo, 'OVERVIEW-001', `${label} wind-overview draft restore keeps project number`);
  assert.equal(state.projectDesigner, 'Codex QA', `${label} wind-overview draft restore keeps project designer`);
  assert.ok(/案件\s*—/.test(state.summaryText), `${label} wind-overview summary falls back to blank project name: ${state.summaryText}`);
  assert.ok(state.summaryText.includes('OVERVIEW-001'), `${label} wind-overview summary shows restored project number`);
  assert.ok(state.summaryText.includes('Codex QA'), `${label} wind-overview summary shows restored project designer`);
  assert.equal(state.summaryText.includes('舊案名'), false, `${label} wind-overview summary should not retain stale localStorage project name`);
  assert.ok(state.statusText.includes('已讀取：瀏覽器暫存'), `${label} wind-overview draft load status`);
  assert.ok(state.reviewTextAfterApply.includes('已由 測試複核人'), `${label} wind-overview restores confirmed review from JSON`);
  assert.ok(state.reviewTextAfterApply.includes('不會寫入計算書、列印或 PDF'), `${label} wind-overview review keeps page-only boundary visible`);
  assert.ok(state.reviewTextAfterChange.includes('需重新確認'), `${label} wind-overview input change invalidates confirmed review`);
  assert.equal(state.storedOverviewProjectName, '舊案名', `${label} wind-overview page summary should refresh from current fields, not mutate overview storage`);
  assert.equal(state.storedOverviewProjectNo, 'OLD-001', `${label} wind-overview overview storage remains previous number`);
  assert.equal(state.storedOverviewProjectDesigner, '舊設計人', `${label} wind-overview overview storage remains previous designer`);
}

function assertWindOverviewDispatchState(state, label) {
  assert.equal(state.profile?.schema, 'wind-shared-profile.v1', `${label} shared profile schema`);
  assert.equal(state.profile?.project?.name, '耐風共用派送案', `${label} shared project name`);
  assert.equal(state.profile?.building?.height, 48, `${label} shared building height`);
  assert.equal(state.links.length, 11, `${label} supported tool links decorated`);
  state.links.forEach(href => assert.ok(href.includes('windProfile=latest'), `${label} dispatch query: ${href}`));
  assert.equal(state.specialHref, 'wind-special.html', `${label} special adjustment keeps non-profile route`);
  assert.ok(state.message.includes('11 個工具入口已啟用一鍵自動預填'), `${label} save message confirms dispatch`);
  assert.equal(state.invalidAttempts.length, 8, `${label} checks blank and negative values for every positive input`);
  state.invalidAttempts.forEach(attempt => {
    const invalidLabel = `${label} ${attempt.field}=${JSON.stringify(attempt.invalidValue)}`;
    assert.equal(attempt.sharedProfileUnchanged, true, `${invalidLabel} keeps valid shared profile`);
    assert.equal(attempt.overviewUnchanged, true, `${invalidLabel} keeps valid overview profile`);
    assert.equal(attempt.message.includes('已儲存'), false, `${invalidLabel} does not announce a successful save`);
    assert.ok(attempt.message.includes('都需大於 0'), `${invalidLabel} shows positive-value validation`);
  });
}

function assertWindSharedProfileTargetState(state, label) {
  assert.equal(state.applied, 'true', `${label} profile applied marker`);
  assert.equal(state.name, '耐風共用派送案', `${label} project name`);
  assert.equal(state.no, 'WIND-DISPATCH-001', `${label} project number`);
  assert.equal(state.designer, 'Codex QA', `${label} designer`);
  assert.equal(state.city, '臺北市', `${label} city`);
  assert.equal(state.terrain, 'B', `${label} terrain`);
  assert.equal(state.importanceClass, 'IV', `${label} importance class`);
  assert.equal(Number(state.Kzt), 1.15, `${label} Kzt`);
  assert.equal(Number(state.B), 18, `${label} windward width`);
  assert.equal(Number(state.L), 36, `${label} along-wind length`);
  assert.equal(Number(state.floors), 12, `${label} floors`);
  assert.equal(Number(state.storyHeight), 4, `${label} derived uniform story height`);
  assert.ok(state.status.includes('已從耐風案件總覽自動預填 11 項'), `${label} visible applied status`);
  ['projName', 'projNo', 'projDesigner', 'city', 'terrain', 'impClass', 'Kzt', 'B', 'L', 'N', 'h']
    .forEach(target => assert.ok(state.targets.includes(target), `${label} applied target ${target}`));
}

function assertExportState(state, tool, label) {
  if (!tool.exportButton) return;
  const serializedPayload = JSON.stringify(state.payload || {});
  assert.equal(state.projectMetaState, 'complete', `${label} ${tool.key} export project state`);
  assert.equal(state.missingButton, false, `${label} ${tool.key} export button exists`);
  assert.equal(state.downloadCount, 1, `${label} ${tool.key} export download count`);
  assert.equal(state.blobCount, 1, `${label} ${tool.key} export blob count`);
  assert.ok(state.textLength > 300, `${label} ${tool.key} export payload length`);
  assert.ok(state.payload && typeof state.payload === 'object', `${label} ${tool.key} export JSON`);
  assert.match(state.payload.calculationFingerprint || '', /^CF-[0-9A-F]{16}$/, `${label} ${tool.key} export calculation fingerprint`);
  assert.ok(state.downloads[0].download.endsWith('.json'), `${label} ${tool.key} export filename`);
  assert.equal(state.downloads[0].attached, true, `${label} ${tool.key} export anchor attached`);
  assert.ok(state.payload.project && typeof state.payload.project === 'object', `${label} ${tool.key} export project payload`);
  assert.equal(state.payload.project.name, '正式工具驗證案', `${label} ${tool.key} export project name`);
  assert.equal(state.payload.project.no, 'FORMAL-VERIFY-001', `${label} ${tool.key} export project no`);
  assert.equal(state.payload.project.designer, 'Codex QA', `${label} ${tool.key} export project designer`);
  assert.equal(serializedPayload.includes('未填'), false, `${label} ${tool.key} export excludes raw placeholder metadata`);
  [
    '產報前檢查',
    '優先閱讀',
    '頁面輔助',
    '公司內部整理計算附件',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => {
    assert.equal(serializedPayload.includes(needle), false, `${label} ${tool.key} export excludes page-only readiness ${needle}`);
  });
  assert.ok(
    serializedPayload.includes(tool.key.split('-')[0]) ||
      serializedPayload.includes(tool.titleNeedle.slice(0, 2)) ||
      serializedPayload.includes('project'),
    `${label} ${tool.key} export payload identity`
  );
}

function assertSourceReportFingerprintLink(exportState, reportState, tool, label) {
  if (!tool.exportButton || !tool.reportTraceRequired) return;
  const reportFingerprint = String(reportState?.html || '').match(/計算指紋<\/b>\s*(CF-[0-9A-F]{16})/)?.[1] || '';
  assert.match(reportFingerprint, /^CF-[0-9A-F]{16}$/, `${label} ${tool.key} linked report fingerprint`);
  assert.equal(
    exportState?.payload?.calculationFingerprint,
    reportFingerprint,
    `${label} ${tool.key} source JSON and detailed report fingerprint link`
  );
}

function assertPlaceholderExportState(state, tool, label) {
  if (!tool.exportButton) return;
  const serializedPayload = JSON.stringify(state.payload || {});
  assert.equal(state.projectMetaState, 'placeholder', `${label} ${tool.key} placeholder export project state`);
  assert.equal(state.missingButton, false, `${label} ${tool.key} placeholder export button exists`);
  assert.equal(state.downloadCount, 1, `${label} ${tool.key} placeholder export download count`);
  assert.equal(state.blobCount, 1, `${label} ${tool.key} placeholder export blob count`);
  assert.ok(state.payload && typeof state.payload === 'object', `${label} ${tool.key} placeholder export JSON`);
  assert.ok(state.payload.project && typeof state.payload.project === 'object', `${label} ${tool.key} placeholder export project payload`);
  assert.equal(state.payload.project.name, '', `${label} ${tool.key} placeholder export project name`);
  assert.equal(state.payload.project.no, 'FORMAL-VERIFY-001', `${label} ${tool.key} placeholder export project no`);
  assert.equal(state.payload.project.designer, 'Codex QA', `${label} ${tool.key} placeholder export project designer`);
  assert.equal(serializedPayload.includes('未填'), false, `${label} ${tool.key} placeholder export excludes raw placeholder metadata`);
  assert.equal(serializedPayload.includes('正式工具驗證案'), false, `${label} ${tool.key} placeholder export should not retain completed project name`);
  [
    '產報前檢查',
    '優先閱讀',
    '頁面輔助',
    '公司內部整理計算附件',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => {
    assert.equal(serializedPayload.includes(needle), false, `${label} ${tool.key} placeholder export excludes page-only readiness ${needle}`);
  });
}

function assertExtraExportState(state, tool, extraExport, label) {
  const exportLabel = extraExport.name || extraExport.id;
  const serializedPayload = JSON.stringify(state.payload || {});
  assert.equal(state.projectMetaState, 'complete', `${label} ${tool.key} ${exportLabel} export project state`);
  assert.equal(state.missingButton, false, `${label} ${tool.key} ${exportLabel} export button exists`);
  assert.equal(state.exportId, extraExport.id, `${label} ${tool.key} ${exportLabel} export target`);
  assert.equal(state.downloadCount, 1, `${label} ${tool.key} ${exportLabel} export download count`);
  assert.equal(state.blobCount, 1, `${label} ${tool.key} ${exportLabel} export blob count`);
  assert.ok(state.textLength > 150, `${label} ${tool.key} ${exportLabel} export payload length`);
  assert.ok(state.payload && typeof state.payload === 'object', `${label} ${tool.key} ${exportLabel} export JSON`);
  assert.ok(state.downloads[0].download.includes(extraExport.filenameNeedle), `${label} ${tool.key} ${exportLabel} export filename`);
  assert.equal(state.downloads[0].attached, true, `${label} ${tool.key} ${exportLabel} export anchor attached`);
  assert.ok(state.payload.project && typeof state.payload.project === 'object', `${label} ${tool.key} ${exportLabel} export project payload`);
  assert.equal(state.payload.project.name, '正式工具驗證案', `${label} ${tool.key} ${exportLabel} export project name`);
  assert.equal(state.payload.project.no, 'FORMAL-VERIFY-001', `${label} ${tool.key} ${exportLabel} export project no`);
  assert.equal(state.payload.project.designer, 'Codex QA', `${label} ${tool.key} ${exportLabel} export project designer`);
  assert.equal(serializedPayload.includes('未填'), false, `${label} ${tool.key} ${exportLabel} export excludes raw placeholder metadata`);
  [
    '產報前檢查',
    '優先閱讀',
    '頁面輔助',
    '公司內部整理計算附件',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => {
    assert.equal(serializedPayload.includes(needle), false, `${label} ${tool.key} ${exportLabel} export excludes page-only readiness ${needle}`);
  });
}

function assertExtraPlaceholderExportState(state, tool, extraExport, label) {
  const exportLabel = extraExport.name || extraExport.id;
  const serializedPayload = JSON.stringify(state.payload || {});
  assert.equal(state.projectMetaState, 'placeholder', `${label} ${tool.key} ${exportLabel} placeholder export project state`);
  assert.equal(state.missingButton, false, `${label} ${tool.key} ${exportLabel} placeholder export button exists`);
  assert.equal(state.exportId, extraExport.id, `${label} ${tool.key} ${exportLabel} placeholder export target`);
  assert.equal(state.downloadCount, 1, `${label} ${tool.key} ${exportLabel} placeholder export download count`);
  assert.equal(state.blobCount, 1, `${label} ${tool.key} ${exportLabel} placeholder export blob count`);
  assert.ok(state.payload && typeof state.payload === 'object', `${label} ${tool.key} ${exportLabel} placeholder export JSON`);
  assert.ok(state.payload.project && typeof state.payload.project === 'object', `${label} ${tool.key} ${exportLabel} placeholder export project payload`);
  assert.equal(state.payload.project.name, '', `${label} ${tool.key} ${exportLabel} placeholder export project name`);
  assert.equal(state.payload.project.no, 'FORMAL-VERIFY-001', `${label} ${tool.key} ${exportLabel} placeholder export project no`);
  assert.equal(state.payload.project.designer, 'Codex QA', `${label} ${tool.key} ${exportLabel} placeholder export project designer`);
  assert.equal(serializedPayload.includes('未填'), false, `${label} ${tool.key} ${exportLabel} placeholder export excludes raw placeholder metadata`);
  assert.equal(serializedPayload.includes('正式工具驗證案'), false, `${label} ${tool.key} ${exportLabel} placeholder export should not retain completed project name`);
  [
    '產報前檢查',
    '優先閱讀',
    '頁面輔助',
    '公司內部整理計算附件',
    '不會寫入計算書或列印 PDF'
  ].forEach(needle => {
    assert.equal(serializedPayload.includes(needle), false, `${label} ${tool.key} ${exportLabel} placeholder export excludes page-only readiness ${needle}`);
  });
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
    `${label} ${tool.key} JSON round-trip restores inputs: ${JSON.stringify({ caseStatus: state.caseStatus, mismatches: state.mismatches }, null, 2)}`
  );
  assert.ok(
    state.caseStatus.includes('已匯入案件 JSON'),
    `${label} ${tool.key} JSON round-trip status: ${state.caseStatus}`
  );
  assert.equal(state.payloadToolId, tool.key, `${label} ${tool.key} JSON round-trip payload tool`);
  assert.ok(state.payloadSchema, `${label} ${tool.key} JSON round-trip payload schema`);
  assert.equal(state.versionGuard?.unchanged, true, `${label} ${tool.key} wrong-version JSON leaves the prior inputs unchanged`);
  assert.ok(state.versionGuard?.status.includes('工具版本不符'), `${label} ${tool.key} wrong-version status: ${state.versionGuard?.status}`);
  assert.ok(state.versionGuard?.status.includes('已保留原輸入'), `${label} ${tool.key} wrong-version status preserves original inputs`);
  assert.equal(state.fingerprintGuard?.restored, true, `${label} ${tool.key} fingerprint mismatch restores the prior inputs`);
  assert.ok(state.fingerprintGuard?.status.includes('重現失敗'), `${label} ${tool.key} fingerprint mismatch status: ${state.fingerprintGuard?.status}`);
  assert.ok(state.fingerprintGuard?.status.includes('已保留原輸入'), `${label} ${tool.key} fingerprint mismatch status preserves original inputs`);
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

function assertInlineValidationState(state, tool, label) {
  const validationCase = inlineValidationCases[tool.key];
  if (!validationCase) return;
  assert.ok(state && typeof state === 'object', `${label} ${tool.key} inline validation state`);
  assert.equal(state.missingCalc, false, `${label} ${tool.key} inline validation calc button`);
  assert.equal(state.missingStatus, false, `${label} ${tool.key} inline validation status element`);
  assert.deepEqual(state.missingInputs, [], `${label} ${tool.key} inline validation input ids`);
  assert.ok(
    state.statusText.includes(validationCase.expectedMessage),
    `${label} ${tool.key} inline validation message: ${state.statusText}`
  );
  if (validationCase.reportRecovery) {
    assert.equal(state.missingReportButton, false, `${label} ${tool.key} inline validation report button`);
    assert.ok(
      state.reportStatusAfterInvalidPrint.includes(validationCase.reportRecovery.expectedReportIssue),
      `${label} ${tool.key} invalid print report status: ${state.reportStatusAfterInvalidPrint}`
    );
    assert.equal(
      state.reportStatusAfterRecovery,
      '',
      `${label} ${tool.key} recovery should clear report status: ${state.reportStatusAfterRecovery}`
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
  const renderedEvidenceRecords = [];
  const directPrintRecords = [];

  try {
    server = await startStaticServer(serverPort, vercelConfig);
    const launch = await launchEdgeCdpWithRetry(edgePath, [
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
    }, `http://127.0.0.1:${debugPort}/json/version`, 'formal-tools');
    edge = launch.edge;
    const version = launch.version;
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
      {
        const label = `${viewport.key} wind-overview project storage`;
        const pageErrors = await navigate(client, sessionId, `http://127.0.0.1:${serverPort}/wind-overview`, viewport);
        const state = await evaluate(client, sessionId, windOverviewProjectStorageExpression());
        assertWindOverviewProjectStorageState(state, label);
        const dispatchState = await evaluate(client, sessionId, windOverviewDispatchSetupExpression());
        assertWindOverviewDispatchState(dispatchState, `${viewport.key} wind-overview dispatch`);
        pageErrors.unsubscribe();
        assertNoPageErrors(pageErrors.errors, label);

        const targetLabel = `${viewport.key} wind-force shared profile`;
        const targetErrors = await navigate(client, sessionId, `http://127.0.0.1:${serverPort}/${encodeURI('結構工具箱/tools/風力/wind-force.html')}?windProfile=latest`, viewport);
        const targetState = await evaluate(client, sessionId, windSharedProfileTargetExpression());
        assertWindSharedProfileTargetState(targetState, targetLabel);
        targetErrors.unsubscribe();
        assertNoPageErrors(targetErrors.errors, targetLabel);
      }
      for (const tool of formalTools) {
        console.log(`formal browser smoke progress: ${viewport.key} ${tool.key} start`);
        const label = `${viewport.key} route`;
        const url = `http://127.0.0.1:${serverPort}${tool.route}`;
        const pageErrors = await navigate(client, sessionId, url, viewport);
        const state = await evaluate(client, sessionId, pageStateExpression(tool));
        assertPageState(state, tool, label);
        const directPrintRecord = await assertDirectWorkPagePrintBlocked(
          client,
          sessionId,
          tool,
          label,
          viewport.key === 'desktop'
        );
        if (directPrintRecord) directPrintRecords.push(directPrintRecord);

        if (viewport.key === 'desktop') {
          const interactionLabel = 'desktop interaction';
          const exportState = tool.exportButton
            ? await evaluate(client, sessionId, exportCaptureExpression(tool))
            : null;
          const linkedReportState = tool.exportButton && tool.reportTraceRequired
            ? await evaluate(client, sessionId, reportCaptureExpression(tool, 'detail'))
            : null;
          const placeholderExportState = tool.exportButton
            ? await evaluate(client, sessionId, exportCaptureExpression(tool, 'placeholder'))
            : null;
          const extraExportStates = [];
          const placeholderExtraExportStates = [];
          for (const extraExport of tool.extraExportButtons || []) {
            extraExportStates.push({
              extraExport,
              state: await evaluate(client, sessionId, exportCaptureExpression(tool, 'complete', extraExport.id))
            });
            placeholderExtraExportStates.push({
              extraExport,
              state: await evaluate(client, sessionId, exportCaptureExpression(tool, 'placeholder', extraExport.id))
            });
          }
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
          const popupModes = Array.isArray(tool.popupReportModes) && tool.popupReportModes.length > 0
            ? tool.popupReportModes
            : (tool.reportMode ? ['detail'] : ((tool.reportButton || tool.reportButtonSelector) ? ['default'] : []));
          const popupReportStates = {};
          const placeholderPopupReportStates = {};
          for (const mode of popupModes) {
            popupReportStates[mode] = await popupReportCaptureState(client, sessionId, tool, mode, 'complete');
            placeholderPopupReportStates[mode] = await popupReportCaptureState(client, sessionId, tool, mode, 'placeholder');
          }
          assertExportState(exportState, tool, interactionLabel);
          assertSourceReportFingerprintLink(exportState, linkedReportState, tool, interactionLabel);
          assertPlaceholderExportState(placeholderExportState, tool, `${interactionLabel} placeholder`);
          for (const { extraExport, state } of extraExportStates) {
            assertExtraExportState(state, tool, extraExport, interactionLabel);
          }
          for (const { extraExport, state } of placeholderExtraExportStates) {
            assertExtraPlaceholderExportState(state, tool, extraExport, `${interactionLabel} placeholder`);
          }
          assertJsonRoundTripState(roundTripState, tool, interactionLabel);
          for (const { goldenCase, state: goldenState } of goldenStates) {
            assertGoldenCaseState(goldenState, tool, goldenCase, interactionLabel);
          }
          for (const [mode, reportState] of Object.entries(reportStates)) {
            assertReportState(reportState, tool, interactionLabel, mode);
          }
          for (const [mode, popupReportState] of Object.entries(popupReportStates)) {
            assertPopupReportState(popupReportState, tool, `${interactionLabel} popup`, mode);
          }
          for (const [mode, popupReportState] of Object.entries(placeholderPopupReportStates)) {
            assertPlaceholderPopupReportState(popupReportState, tool, `${interactionLabel} popup placeholder`, mode);
          }
          const renderedReportState = popupReportStates.detail
            || popupReportStates.default
            || reportStates.detail
            || reportStates.default
            || reportStates.simple;
          assert.ok(renderedReportState?.html, `${interactionLabel} ${tool.key} has report HTML for real PDF evidence`);
          const renderedDocumentStateNeedles = getReportPdfDocumentStateNeedles(renderedReportState);
          const renderedEvidence = await renderAndValidateReportPdf(client, {
            html: renderedReportState.html,
            outputDir: renderedEvidenceDir,
            artifactName: `${tool.key}-formal-report`,
            label: `${tool.key} formal report`,
            renderer: tool.reportMode ? 'formal-detailed' : 'formal-default',
            titleNeedle: tool.titleNeedle,
            requiredNeedles: [
              tool.titleNeedle,
              '計畫名稱',
              ...(tool.reportNeedles || []),
              ...(tool.reportTraceRequired ? ['產出工具', '工具版本', '輸出時間', '計算指紋'] : []),
              ...renderedDocumentStateNeedles.required,
            ],
            forbiddenNeedles: [
              ...(formalManifest.reportForbiddenNeedles || []),
              ...(formalManifest.reportPageOnlyForbiddenNeedles || []),
              ...renderedDocumentStateNeedles.forbidden,
            ],
          });
          if (tool.reportTraceRequired) {
            assert.match(fs.readFileSync(renderedEvidence.pdf.textPath, 'utf8'), /工具版本\s*v\d+(?:\.\d+)*(?:[-+.\w]*)?/i, `${interactionLabel} ${tool.key} formal PDF canonical version`);
          }
          renderedEvidenceRecords.push({
            key: tool.key,
            renderer: renderedEvidence.renderer,
            artifact: path.basename(renderedEvidence.pdfPath),
            evidence: path.basename(renderedEvidence.evidencePath),
            pageCount: renderedEvidence.pdf.pageCount,
            textLength: renderedEvidence.pdf.textLength,
          });
          if (tool.key === 'wind-force') {
            const summaryDocumentStateNeedles = getReportPdfDocumentStateNeedles(reportStates.simple);
            const summaryEvidence = await renderAndValidateReportPdf(client, {
              html: reportStates.simple.html,
              outputDir: renderedEvidenceDir,
              artifactName: 'shared-summary-layout',
              label: 'shared formal summary layout',
              renderer: 'formal-summary',
              titleNeedle: tool.titleNeedle,
              requiredNeedles: [
                tool.titleNeedle,
                '計畫名稱',
                ...(tool.reportNeedles || []),
                ...(tool.reportTraceRequired ? ['產出工具', '工具版本', '輸出時間', '計算指紋'] : []),
                ...summaryDocumentStateNeedles.required,
              ],
              forbiddenNeedles: [
                ...(formalManifest.reportForbiddenNeedles || []),
                ...(formalManifest.reportPageOnlyForbiddenNeedles || []),
                ...summaryDocumentStateNeedles.forbidden,
              ],
            });
            if (tool.reportTraceRequired) {
              assert.match(fs.readFileSync(summaryEvidence.pdf.textPath, 'utf8'), /工具版本\s*v\d+(?:\.\d+)*(?:[-+.\w]*)?/i, 'shared formal summary PDF canonical version');
            }
            renderedEvidenceRecords.push({
              key: 'shared-summary-layout',
              renderer: summaryEvidence.renderer,
              artifact: path.basename(summaryEvidence.pdfPath),
              evidence: path.basename(summaryEvidence.evidencePath),
              pageCount: summaryEvidence.pdf.pageCount,
              textLength: summaryEvidence.pdf.textLength,
            });
            renderedEvidenceRecords.push({
              key: 'shared-detailed-layout',
              renderer: renderedEvidence.renderer,
              artifact: path.basename(renderedEvidence.pdfPath),
              evidence: path.basename(renderedEvidence.evidencePath),
              pageCount: renderedEvidence.pdf.pageCount,
              textLength: renderedEvidence.pdf.textLength,
            });
          }
          const inlineValidationState = inlineValidationCases[tool.key]
            ? await evaluate(client, sessionId, inlineValidationExpression(tool))
            : null;
          assertInlineValidationState(inlineValidationState, tool, interactionLabel);
          if (tool.key === 'seismic-dynamic') {
            const projectRestoreState = await evaluate(client, sessionId, seismicDynamicProjectRestoreExpression());
            assertSeismicDynamicProjectRestoreState(projectRestoreState, interactionLabel);
          }
        };

        pageErrors.unsubscribe();
        assertNoPageErrors(pageErrors.errors, `${label} ${tool.key}`);
        console.log(`formal browser smoke progress: ${viewport.key} ${tool.key} OK`);
      }
    }

    const expectedRenderedEvidence = [
      ...formalTools.map(tool => tool.key),
      'shared-summary-layout',
      'shared-detailed-layout',
    ];
    const renderedSummary = writeEvidenceSummary(
      renderedEvidenceDir,
      'formal-tools',
      renderedEvidenceRecords,
      expectedRenderedEvidence
    );
    assert.equal(directPrintRecords.length, formalTools.length, 'formal direct-print PDF coverage');
    const directPrintSummaryPath = path.join(directPrintOutputDir, 'formal-direct-print-block-summary.json');
    fs.writeFileSync(directPrintSummaryPath, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      required: formalTools.map(tool => tool.key),
      complete: directPrintRecords.map(record => record.key),
      records: directPrintRecords,
      pass: directPrintRecords.length === formalTools.length,
    }, null, 2)}\n`, 'utf8');
    await client.send('Browser.close').catch(() => {});
    await waitForProcessExit(edge, 5000);
    await terminateProcessTree(edge);
    console.log(`formal browser smoke OK (${formalTools.length} tools, ${viewports.length} viewports, renderedEvidence=${renderedEvidenceRecords.length}, directPrintBlocks=${directPrintRecords.length}, summary=${renderedSummary.summaryPath})`);
  } finally {
    if (client) client.close();
    await terminateProcessTree(edge);
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
