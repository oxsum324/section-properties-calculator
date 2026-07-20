const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const {
  resolveEvidenceDir,
  renderAndValidateReportPdf,
  validatePdfFile,
  writeEvidenceSummary,
} = require('../結構工具箱/tools/rendered-delivery-evidence');

const args = parseArgs(process.argv.slice(2));
const baseUrl = String(args['base-url'] || 'http://127.0.0.1:8123').replace(/\/$/, '');
const outputDir = path.resolve(String(args['output-dir'] || path.join(__dirname, 'output', 'audit')));
const historyDir = path.resolve(String(args['history-dir'] || outputDir));
const summaryJson = path.resolve(String(args['summary-json'] || path.join(historyDir, 'steel-browser-runner-summary.json')));
const quiet = Boolean(args.quiet);
const scenarioTimeoutMs = Number(args['scenario-timeout-ms'] || 90000);
const repoRoot = path.resolve(__dirname, '..');
const renderedEvidenceDir = resolveEvidenceDir(repoRoot, 'steel-formal');
const renderedEvidenceRecords = [];
const directPrintOutputDir = path.resolve(String(
  args['direct-print-output-dir']
    || path.join(repoRoot, 'output', 'playwright', 'steel-formal-direct-print-block')
));
const directPrintSummaryJson = path.join(directPrintOutputDir, 'steel-formal-direct-print-block-summary.json');

const viewports = [
  { label: 'desktop', width: 1440, height: 1100, mobile: false },
  { label: 'tablet', width: 834, height: 1112, mobile: false },
  { label: 'mobile', width: 390, height: 844, mobile: true },
];

const scenarios = [
  { name: 'main-plate', url: '/index.html' },
  { name: 'main-plate-report-popup-placeholder', url: '/index.html', setup: setupMainPlateProjectMetaPlaceholder, assert: assertMainPlateReportPopupPlaceholder },
  { name: 'main-tension', url: '/index.html', setup: setupMainTension },
  { name: 'main-tension-report-popup', url: '/index.html', setup: setupMainTensionReport, assert: assertMainTensionReportPopup },
  { name: 'standalone-plate', url: '/plate-check.html' },
  { name: 'standalone-plate-report-popup', url: '/plate-check.html', setup: setupStandalonePlateReport, assert: assertStandalonePlateReportPopup },
  { name: 'formal-beam', url: '/steel-beam-formal.html', setup: setupFormalProjectMetaPlaceholder, assert: assertFormalBeamReadiness },
  { name: 'formal-beam-import-candidate', url: '/steel-beam-formal.html?import=1', setup: setupFormalBeamImportCandidate, assert: assertFormalBeamImportCandidate },
  { name: 'formal-beam-meta-complete', url: '/steel-beam-formal.html', setup: setupFormalProjectMetaComplete, assert: assertFormalBeamReadinessMetaComplete },
  { name: 'formal-beam-report-popup', url: '/steel-beam-formal.html', setup: setupFormalProjectMetaComplete, assert: assertFormalBeamReportPopupComplete },
  { name: 'formal-beam-report-popup-placeholder', url: '/steel-beam-formal.html', setup: setupFormalProjectMetaPlaceholder, assert: assertFormalBeamReportPopupPlaceholder },
  { name: 'formal-beam-invalid', url: '/steel-beam-formal.html', setup: setupFormalBeamInvalid, assert: assertFormalBeamReadinessBlocked },
  { name: 'formal-column', url: '/steel-column-formal.html', setup: setupFormalProjectMetaPlaceholder, assert: assertFormalColumnReadiness },
  { name: 'formal-column-meta-complete', url: '/steel-column-formal.html', setup: setupFormalProjectMetaComplete, assert: assertFormalColumnReadinessMetaComplete },
  { name: 'formal-column-report-popup', url: '/steel-column-formal.html', setup: setupFormalProjectMetaComplete, assert: assertFormalColumnReportPopupComplete },
  { name: 'formal-column-report-popup-placeholder', url: '/steel-column-formal.html', setup: setupFormalProjectMetaPlaceholder, assert: assertFormalColumnReportPopupPlaceholder },
  { name: 'formal-column-invalid', url: '/steel-column-formal.html', setup: setupFormalColumnInvalid, assert: assertFormalColumnReadinessBlocked },
];

const STEEL_DIRECT_PRINT_TITLE = '鋼構正式工具主頁列印已封鎖';
const STEEL_DIRECT_PRINT_BODY = '此頁是操作介面，不是計算書。請關閉列印視窗，使用頁面上的「輸出正式報表」按鈕產生依目前案件資料與檢核狀態整理的正式報表；本頁不得作為附件。';
const steelDirectPrintPages = [
  { key: 'steel-main-formal', url: '/index.html', pageTitle: '鋼構正式規範核算工具 V1.0' },
  { key: 'steel-plate-formal', url: '/plate-check.html', pageTitle: '鋼構連接板正式規範核算工具 V1.0' },
  { key: 'steel-beam-formal', url: '/steel-beam-formal.html', pageTitle: '鋼梁正式規範核算工具 V1.0' },
  { key: 'steel-column-formal', url: '/steel-column-formal.html', pageTitle: '鋼柱正式規範核算工具 V1.0' },
];

const FORMAL_PROJECT_META = {
  projName: '鋼構正式工具驗證案',
  projNo: 'STEEL-VERIFY-001',
  projDesigner: 'Codex QA',
};

const FORMAL_PROJECT_META_PLACEHOLDER = {
  projName: '未填',
  projNo: 'STEEL-VERIFY-001',
  projDesigner: 'Codex QA',
};

const LEGACY_PROJECT_META_PLACEHOLDER = {
  projectName: '未填',
  connectionTag: 'PL-VERIFY-001',
  designer: 'Codex QA',
};

const LEGACY_TENSION_PROJECT_META = {
  projectName: '鋼構拉力構件驗證案',
  connectionTag: 'TM-VERIFY-001',
  designer: 'Codex QA',
};

const LEGACY_STANDALONE_PLATE_PROJECT_META = {
  projectName: '鋼構連接板驗證案',
  connectionTag: 'PL-VERIFY-002',
  designer: 'Codex QA',
};

const FORMAL_REPORT_TRACE_LABELS = ['產出工具', '工具版本', '輸出時間', '計算指紋'];
const FORMAL_REPORT_REFERENCE_NEEDLES = ['功能借鏡', 'SkyCiv', 'ClearCalcs', 'Dlubal'];
const CALCULATION_BOOK_UI_ONLY_NEEDLES = ['輸入模式', '計算書模式', '換算對照', '流程顯示', '報表模式', '輸出設定', '可切換', '面積直輸模式', '面積輸入模式', '設計依據與限制條件', '適用範圍', '限制與不適用事項', '審查提醒', '設計備註'];

function assertFormalReportTraceText(value, label) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  for (const needle of FORMAL_REPORT_TRACE_LABELS) {
    if (!text.includes(needle)) throw new Error(`${label} missing report trace label ${needle}: ${text}`);
  }
  const expectations = [
    [/產出工具\s*(?:連接板|拉力構件|鋼構接頭|鋼梁|鋼柱)正式規範核算工具/, '產出工具'],
    [/工具版本\s*v\d+(?:\.\d+)*(?:[-+.\w]*)?/i, '工具版本'],
    [/輸出時間\s*\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/, '輸出時間'],
    [/計算指紋\s*CF-[0-9A-F]{16}/, '計算指紋'],
  ];
  for (const [pattern, field] of expectations) {
    if (!pattern.test(text)) throw new Error(`${label} missing a valid ${field} value: ${text}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function log(message) {
  if (!quiet) console.log(message);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function findEdgeExecutable() {
  const candidates = [
    process.env.MSEDGE_PATH,
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Unable to locate msedge.exe. Set MSEDGE_PATH to the Edge executable path.');
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

async function waitForJson(url, timeoutMs = 20000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isTransientLaunchError(error) {
  if (!error) return false;
  if (['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) return true;
  return /spawn EPERM|WinError 5|access is denied|Permission denied|Timed out waiting for Edge DevTools|Edge exited before DevTools endpoint was available/i.test(error.message || '');
}

function formatError(error) {
  return error && (error.stack || error.message) ? (error.stack || error.message) : String(error);
}

async function launchEdgeOnce(edgePath) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steel-audit-edge-'));
  const debugPort = await getFreePort();
  const versionUrl = `http://127.0.0.1:${debugPort}/json/version`;
  const browserArgs = [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-popup-blocking',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];
  let child;
  try {
    child = spawn(edgePath, browserArgs, { stdio: 'ignore', windowsHide: true });
    const version = await Promise.race([
      waitForJson(versionUrl, 20000),
      new Promise((_, reject) => child.once('error', reject)),
    ]);
    if (!version.webSocketDebuggerUrl) throw new Error('Edge DevTools endpoint did not provide webSocketDebuggerUrl.');
    return { child, profileDir, wsUrl: version.webSocketDebuggerUrl, debugPort };
  } catch (error) {
    if (child && !child.killed) child.kill('SIGKILL');
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
    } catch (_) {}
    throw error;
  }
}

async function launchEdge() {
  const edgePath = findEdgeExecutable();
  const retryDelaysMs = [0, 5000, 15000, 30000, 60000];
  let lastError;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    try {
      if (attempt > 0) log(`Retrying Edge launch attempt ${attempt + 1}/${retryDelaysMs.length}...`);
      return await launchEdgeOnce(edgePath);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < retryDelaysMs.length - 1 && isTransientLaunchError(error);
      if (!canRetry) throw error;
      const delayMs = retryDelaysMs[attempt + 1];
      log(`Edge launch transient failure on attempt ${attempt + 1}: ${error.message}; retrying in ${delayMs}ms`);
      await wait(delayMs);
    }
  }
  throw lastError;
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Set();
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', event => reject(new Error(`WebSocket error: ${event.message || 'unknown'}`)), { once: true });
    });
    this.ws.addEventListener('message', event => this.onMessage(event.data));
    this.ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP connection closed.'));
      this.pending.clear();
    });
  }

  onMessage(data) {
    const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
    const message = JSON.parse(text);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result || {});
      return;
    }
    for (const handler of this.handlers) handler(message);
  }

  onEvent(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  async close() {
    if (!this.ws || this.ws.readyState >= 2) return;
    this.ws.close();
  }
}

function waitForEvent(cdp, method, sessionId, predicate = () => true, timeoutMs = 30000) {
  return withTimeout(new Promise(resolve => {
    const remove = cdp.onEvent(message => {
      if (message.method !== method) return;
      if (sessionId && message.sessionId !== sessionId) return;
      if (!predicate(message.params || {})) return;
      remove();
      resolve(message.params || {});
    });
  }), timeoutMs, method);
}

async function evaluate(cdp, sessionId, expression, label) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, sessionId);
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.text || result.exceptionDetails.exception?.description || label;
    throw new Error(`${label}: ${text}`);
  }
  return result.result?.value;
}

async function setupMainTension(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    const connectionType = document.querySelector('select[name="connectionType"]');
    if (!connectionType) throw new Error('missing connectionType select');
    connectionType.value = 'tension_member';
    connectionType.dispatchEvent(new Event('change', { bubbles: true }));
    const preset = document.querySelector('#examplePresetSelect');
    if (!preset) throw new Error('missing examplePresetSelect');
    preset.value = 'tension_bolted_plate';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    const button = document.querySelector('#loadExampleBtn');
    if (!button) throw new Error('missing loadExampleBtn');
    button.click();
    return true;
  })()`, 'main tension setup');
  await wait(300);
}

async function setupLegacyProjectMeta(cdp, sessionId, fields, label) {
  await evaluate(cdp, sessionId, `(() => {
    const fields = ${JSON.stringify(fields)};
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('missing [name="' + name + '"]');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return true;
  })()`, label);
  await wait(250);
}

async function setupMainTensionReport(cdp, sessionId) {
  await setupMainTension(cdp, sessionId);
  await setupLegacyProjectMeta(cdp, sessionId, LEGACY_TENSION_PROJECT_META, 'main tension project meta setup');
}

async function setupStandalonePlateReport(cdp, sessionId) {
  await setupLegacyProjectMeta(cdp, sessionId, LEGACY_STANDALONE_PLATE_PROJECT_META, 'standalone plate project meta setup');
}

async function setupMainPlateProjectMetaPlaceholder(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    const connectionType = document.querySelector('select[name="connectionType"]');
    if (!connectionType) throw new Error('missing connectionType select');
    connectionType.value = 'plate_check';
    connectionType.dispatchEvent(new Event('change', { bubbles: true }));
    const preset = document.querySelector('#examplePresetSelect');
    if (!preset) throw new Error('missing examplePresetSelect');
    preset.value = 'plate_geometry';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    const button = document.querySelector('#loadExampleBtn');
    if (!button) throw new Error('missing loadExampleBtn');
    button.click();
    return true;
  })()`, 'main plate placeholder preset setup');
  await wait(300);
  await evaluate(cdp, sessionId, `(() => {
    const fields = ${JSON.stringify(LEGACY_PROJECT_META_PLACEHOLDER)};
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('missing [name="' + name + '"]');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return true;
  })()`, 'main plate placeholder project meta setup');
  await wait(250);
}

async function setupFormalBeamInvalid(cdp, sessionId) {
  await setupFormalInvalid(cdp, sessionId, '#beamInputStatus', 'beam inline validation');
}

async function setupFormalBeamImportCandidate(cdp, sessionId) {
  const payload = {
    target: 'steel-beam',
    meta: {
      source: '連續梁分析',
      caseName: '主控組合 (梁)',
      factored: false,
      loadBasis: 'unconfirmed',
    },
    forces: { M: 12.5, MNeg: -18.75, V: -7.25 },
    member: { spanCm: 650 },
    section: { title: '上游參考斷面' },
    material: null,
  };
  const loadEvent = waitForEvent(cdp, 'Page.loadEventFired', sessionId, () => true, 30000);
  await evaluate(cdp, sessionId, `(() => {
    localStorage.setItem('structToolbox.pendingForces', ${JSON.stringify(JSON.stringify(payload))});
    location.reload();
    return true;
  })()`, 'formal beam import candidate reload');
  await loadEvent;
  await wait(350);
  await setupFormalProjectMetaComplete(cdp, sessionId);
}

async function setupFormalProjectMeta(cdp, sessionId, fields, label) {
  await evaluate(cdp, sessionId, `(() => {
    const fields = ${JSON.stringify(fields)};
    Object.entries(fields).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (!input) throw new Error('missing #' + id);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return true;
  })()`, label);
  await wait(250);
}

async function setupFormalProjectMetaPlaceholder(cdp, sessionId) {
  await setupFormalProjectMeta(cdp, sessionId, FORMAL_PROJECT_META_PLACEHOLDER, 'formal project meta placeholder setup');
}

async function setupFormalProjectMetaComplete(cdp, sessionId) {
  await setupFormalProjectMeta(cdp, sessionId, FORMAL_PROJECT_META, 'formal project meta setup');
}

async function setupFormalColumnInvalid(cdp, sessionId) {
  await setupFormalInvalid(cdp, sessionId, '#columnInputStatus', 'column inline validation');
}

async function setupFormalInvalid(cdp, sessionId, statusSelector, label) {
  await evaluate(cdp, sessionId, `(async () => {
    const input = document.querySelector('#inH');
    if (!input) throw new Error('missing #inH');
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const button = document.querySelector('#runCheckBtn');
    if (!button) throw new Error('missing #runCheckBtn');
    button.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    const status = document.querySelector('${statusSelector}')?.textContent || '';
    if (!status.includes('請確認 H 型鋼尺寸輸入完整且合理。')) {
      throw new Error('${label} status missing: ' + status);
    }
    return status;
  })()`, label);
}

async function assertFormalBeamReadiness(cdp, sessionId) {
  await assertFormalReportReadiness(cdp, sessionId, '#beamReportReadiness', 'beam report readiness');
  await assertFormalReportReadinessText(cdp, sessionId, '#beamReportReadiness', '計畫名稱 / 編號 / 設計人尚未完整', 'beam missing project metadata note');
  await assertFormalProjectMetaPlaceholderRendered(cdp, sessionId, {
    nameId: '#beamMetaProjectName',
    noId: '#beamMetaProjectNo',
    designerId: '#beamMetaDesigner',
  }, 'beam placeholder project meta render');
}

async function assertFormalBeamReadinessMetaComplete(cdp, sessionId) {
  await assertFormalReportReadiness(cdp, sessionId, '#beamReportReadiness', 'beam report readiness after metadata');
  await assertFormalReportReadinessTextAbsent(cdp, sessionId, '#beamReportReadiness', '計畫名稱 / 編號 / 設計人尚未完整', 'beam metadata warning should clear');
  await assertFormalProjectMetaRendered(cdp, sessionId, {
    nameId: '#beamMetaProjectName',
    noId: '#beamMetaProjectNo',
    designerId: '#beamMetaDesigner',
  }, 'beam project meta render');
}

async function assertFormalBeamReadinessBlocked(cdp, sessionId) {
  await assertFormalReportReadinessBlocked(cdp, sessionId, '#beamReportReadiness', 'beam report readiness');
}

async function assertFormalBeamImportCandidate(cdp, sessionId) {
  const state = await evaluate(cdp, sessionId, `(() => {
    const read = id => document.getElementById(id);
    const initial = {
      panelHidden: read('beamImportReview')?.hidden,
      applyDisabled: read('beamImportApply')?.disabled,
      moment: read('inMu')?.value,
      shear: read('inVu')?.value,
      span: read('inL')?.value,
      fy: read('inFy')?.value,
      lb: read('inLb')?.value,
      cb: read('inCb')?.value,
      candidateText: read('beamImportReview')?.innerText || '',
    };
    read('beamImportMomentChoice').value = 'absolute';
    read('beamImportConfirm').checked = true;
    read('beamImportConfirm').dispatchEvent(new Event('change', { bubbles: true }));
    const enabledAfterConfirm = !read('beamImportApply').disabled;
    read('beamImportApply').click();
    const adopted = {
      moment: read('inMu')?.value,
      shear: read('inVu')?.value,
      span: read('inL')?.value,
      fy: read('inFy')?.value,
      lb: read('inLb')?.value,
      cb: read('inCb')?.value,
      badge: read('beamImportReviewBadge')?.textContent || '',
      status: read('beamImportStatus')?.textContent || '',
      reportValidation: read('beamReportReadiness')?.innerText || '',
      pendingStorage: localStorage.getItem('structToolbox.pendingForces'),
    };

    const originalOpen = window.open;
    const writes = [];
    window.open = () => ({
      document: {
        open() {},
        write(html) { writes.push(String(html || '')); },
        close() {},
      },
      focus() {},
    });
    try {
      read('btnReport').click();
    } finally {
      window.open = originalOpen;
    }
    const reportHtml = writes.join('');
    const reportDocument = new DOMParser().parseFromString(reportHtml, 'text/html');
    return {
      initial,
      enabledAfterConfirm,
      adopted,
      reportText: (reportDocument.body?.innerText || reportDocument.body?.textContent || '').replace(/\\s+/g, ' ').trim(),
    };
  })()`, 'formal beam import candidate adoption');

  if (state.initial.panelHidden !== false || state.initial.applyDisabled !== true) {
    throw new Error(`beam candidate should be visible but disabled before confirmation: ${JSON.stringify(state.initial)}`);
  }
  if (!state.initial.candidateText.includes('12.50 tf·m') || !state.initial.candidateText.includes('-18.75 tf·m') || !state.initial.candidateText.includes('7.25 tf') || !state.initial.candidateText.includes('650.0 cm') || !state.initial.candidateText.includes('載重基準：未確認')) {
    throw new Error(`beam candidate values missing: ${state.initial.candidateText}`);
  }
  if (state.initial.moment !== '30' || state.initial.shear !== '15' || state.initial.span !== '800') {
    throw new Error(`beam formal inputs changed before confirmation: ${JSON.stringify(state.initial)}`);
  }
  if (!state.enabledAfterConfirm || state.adopted.moment !== '18.75' || state.adopted.shear !== '7.25' || state.adopted.span !== '650') {
    throw new Error(`beam candidate adoption mismatch: ${JSON.stringify(state)}`);
  }
  if (state.adopted.fy !== state.initial.fy || state.adopted.lb !== state.initial.lb || state.adopted.cb !== state.initial.cb) {
    throw new Error(`beam candidate must not overwrite Fy/Lb/Cb: ${JSON.stringify(state)}`);
  }
  if (!state.adopted.badge.includes('已套用') || !state.adopted.status.includes('請再確認斷面、Fy、Lb／Cb')) {
    throw new Error(`beam candidate adoption status missing: ${JSON.stringify(state.adopted)}`);
  }
  if (!state.adopted.reportValidation.includes('重新執行檢核') || state.adopted.pendingStorage !== null) {
    throw new Error(`beam candidate should require rerun and clear pending storage: ${JSON.stringify(state.adopted)}`);
  }
  if (!state.reportText.includes('內力來源') || !state.reportText.includes('連續梁分析') || !state.reportText.includes('人工確認採用') || !state.reportText.includes('載重基準：已人工確認')) {
    throw new Error(`beam formal report should record the adopted source: ${state.reportText}`);
  }
  for (const forbidden of ['候選輸入值', '候選值尚未套用', '優先建議報告閱讀狀態', '不會寫入計算書或列印 PDF']) {
    if (state.reportText.includes(forbidden)) {
      throw new Error(`beam formal report should exclude page-only candidate/readiness wording "${forbidden}": ${state.reportText}`);
    }
  }
  await assertPageOnlyReadinessHiddenInPrint(cdp, sessionId, '#beamImportReview', 'beam import candidate review');
}

async function assertFormalBeamReportPopupComplete(cdp, sessionId, context = {}) {
  return assertFormalReportPopup(cdp, sessionId, {
    label: 'beam formal report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: '鋼梁正式規範核算計算書',
    expectedProject: {
      name: FORMAL_PROJECT_META.projName,
      no: FORMAL_PROJECT_META.projNo,
      designer: FORMAL_PROJECT_META.projDesigner,
    },
    sourcePayloadBuilder: 'buildBeamSourcePayload',
    sourceReplay: {
      builder: 'buildBeamSourcePayload', inputSelector: '#inputImportSourceJson', mutationSelector: '#inFy',
      sourceFieldKey: 'inFy', statusSelector: '#beamInputStatus', nestedFields: true,
    },
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-beam-formal' : '',
  });
}

async function assertFormalBeamReportPopupPlaceholder(cdp, sessionId) {
  return assertFormalReportPopup(cdp, sessionId, {
    label: 'beam formal report popup placeholder',
    titleNeedle: '鋼梁正式規範核算計算書',
    expectedProject: {
      name: '—',
      no: FORMAL_PROJECT_META_PLACEHOLDER.projNo,
      designer: FORMAL_PROJECT_META_PLACEHOLDER.projDesigner,
    },
    absentNeedles: ['未填'],
  });
}

async function assertMainPlateProjectMetaPlaceholderRendered(cdp, sessionId) {
  const meta = await evaluate(cdp, sessionId, `(() => ({
    name: document.querySelector('#metaProjectName')?.innerText?.trim() || '',
    tag: document.querySelector('#metaConnectionTag')?.innerText?.trim() || '',
    designer: document.querySelector('#metaDesigner')?.innerText?.trim() || '',
  }))()`, 'main plate placeholder project meta render');
  if (meta.name !== '—' || meta.tag !== LEGACY_PROJECT_META_PLACEHOLDER.connectionTag || meta.designer !== LEGACY_PROJECT_META_PLACEHOLDER.designer) {
    throw new Error(`main plate placeholder project meta render mismatch: ${JSON.stringify(meta)}`);
  }
}

async function assertMainPlateSummaryCopyPlaceholder(cdp, sessionId) {
  const snapshot = await evaluate(cdp, sessionId, `(async () => {
    window.__copiedSummary = '';
    const clipboardStub = { writeText: async (text) => { window.__copiedSummary = text; } };
    try {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboardStub });
    } catch (error) {
      if (!navigator.clipboard) throw error;
      navigator.clipboard.writeText = clipboardStub.writeText;
    }
    const button = document.querySelector('#copySummaryBtn');
    if (!button) throw new Error('missing #copySummaryBtn');
    button.click();
    await new Promise(resolve => setTimeout(resolve, 150));
    return {
      text: window.__copiedSummary || '',
      buttonText: button.textContent || '',
    };
  })()`, 'main plate summary copy placeholder');
  if (!snapshot.text.includes('計畫：—')) {
    throw new Error(`main plate copied summary should scrub placeholder project name: ${snapshot.text}`);
  }
  if (!snapshot.text.includes(`接頭：${LEGACY_PROJECT_META_PLACEHOLDER.connectionTag}`)) {
    throw new Error(`main plate copied summary should keep connection tag: ${snapshot.text}`);
  }
  if (snapshot.text.includes('未填')) {
    throw new Error(`main plate copied summary should exclude placeholder text: ${snapshot.text}`);
  }
}

async function assertMainPlateReportPopupPlaceholder(cdp, sessionId, context = {}) {
  await assertMainPlateProjectMetaPlaceholderRendered(cdp, sessionId);
  await assertMainPlateSummaryCopyPlaceholder(cdp, sessionId);
  return assertLegacyReportPopup(cdp, sessionId, {
    label: 'main plate report popup placeholder',
    buttonSelector: '#printReportBtn',
    titleNeedle: '連接板檢核計算書',
    expectedProject: {
      name: '—',
      tag: LEGACY_PROJECT_META_PLACEHOLDER.connectionTag,
      designer: LEGACY_PROJECT_META_PLACEHOLDER.designer,
    },
    absentNeedles: ['未填'],
    sourcePayloadBuilder: 'buildSteelConnectionSourcePayload',
    sourceReplay: {
      builder: 'buildSteelConnectionSourcePayload', inputSelector: '#importSourceJsonInput',
      mutationSelector: 'input[name="plateThickness"]:not([disabled])', sourceFieldKey: 'plateThickness',
      statusSelector: '#exportReportStatus', nestedFields: false,
    },
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-main-plate' : '',
  });
}

async function assertMainTensionReportPopup(cdp, sessionId, context = {}) {
  return assertLegacyReportPopup(cdp, sessionId, {
    label: 'main tension report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: '拉力構件檢核計算書',
    expectedProject: {
      name: LEGACY_TENSION_PROJECT_META.projectName,
      tag: LEGACY_TENSION_PROJECT_META.connectionTag,
      designer: LEGACY_TENSION_PROJECT_META.designer,
    },
    sourcePayloadBuilder: 'buildSteelConnectionSourcePayload',
    sourceReplay: {
      builder: 'buildSteelConnectionSourcePayload', inputSelector: '#importSourceJsonInput',
      mutationSelector: 'input[name="memberThickness"]:not([disabled])', sourceFieldKey: 'memberThickness',
      statusSelector: '#exportReportStatus', nestedFields: false,
    },
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-main-tension' : '',
  });
}

async function assertStandalonePlateReportPopup(cdp, sessionId, context = {}) {
  return assertLegacyReportPopup(cdp, sessionId, {
    label: 'standalone plate report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: '連接板檢核計算書',
    expectedProject: {
      name: LEGACY_STANDALONE_PLATE_PROJECT_META.projectName,
      tag: LEGACY_STANDALONE_PLATE_PROJECT_META.connectionTag,
      designer: LEGACY_STANDALONE_PLATE_PROJECT_META.designer,
    },
    sourcePayloadBuilder: 'buildSteelConnectionSourcePayload',
    sourceReplay: {
      builder: 'buildSteelConnectionSourcePayload', inputSelector: '#importSourceJsonInput',
      mutationSelector: 'input[name="plateThickness"]:not([disabled])', sourceFieldKey: 'plateThickness',
      statusSelector: '#exportReportStatus', nestedFields: false,
    },
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-standalone-plate' : '',
  });
}

async function assertFormalColumnReadiness(cdp, sessionId) {
  await assertFormalReportReadiness(cdp, sessionId, '#columnReportReadiness', 'column report readiness');
  await assertFormalReportReadinessText(cdp, sessionId, '#columnReportReadiness', '計畫名稱 / 編號 / 設計人尚未完整', 'column missing project metadata note');
  await assertFormalProjectMetaPlaceholderRendered(cdp, sessionId, {
    nameId: '#columnMetaProjectName',
    noId: '#columnMetaProjectNo',
    designerId: '#columnMetaDesigner',
  }, 'column placeholder project meta render');
}

async function assertFormalColumnReadinessMetaComplete(cdp, sessionId) {
  await assertFormalReportReadiness(cdp, sessionId, '#columnReportReadiness', 'column report readiness after metadata');
  await assertFormalReportReadinessTextAbsent(cdp, sessionId, '#columnReportReadiness', '計畫名稱 / 編號 / 設計人尚未完整', 'column metadata warning should clear');
  await assertFormalProjectMetaRendered(cdp, sessionId, {
    nameId: '#columnMetaProjectName',
    noId: '#columnMetaProjectNo',
    designerId: '#columnMetaDesigner',
  }, 'column project meta render');
}

async function assertFormalColumnReadinessBlocked(cdp, sessionId) {
  await assertFormalReportReadinessBlocked(cdp, sessionId, '#columnReportReadiness', 'column report readiness');
}

async function assertFormalColumnReportPopupComplete(cdp, sessionId, context = {}) {
  return assertFormalReportPopup(cdp, sessionId, {
    label: 'column formal report popup',
    buttonSelector: '#printReportBtn',
    titleNeedle: '鋼柱正式規範核算計算書',
    expectedProject: {
      name: FORMAL_PROJECT_META.projName,
      no: FORMAL_PROJECT_META.projNo,
      designer: FORMAL_PROJECT_META.projDesigner,
    },
    sourcePayloadBuilder: 'buildColumnSourcePayload',
    sourceReplay: {
      builder: 'buildColumnSourcePayload', inputSelector: '#inputImportSourceJson', mutationSelector: '#inFy',
      sourceFieldKey: 'inFy', statusSelector: '#columnInputStatus', nestedFields: true,
    },
    renderEvidenceKey: context.viewport?.label === 'desktop' ? 'steel-column-formal' : '',
  });
}

async function assertFormalColumnReportPopupPlaceholder(cdp, sessionId) {
  return assertFormalReportPopup(cdp, sessionId, {
    label: 'column formal report popup placeholder',
    titleNeedle: '鋼柱正式規範核算計算書',
    expectedProject: {
      name: '—',
      no: FORMAL_PROJECT_META_PLACEHOLDER.projNo,
      designer: FORMAL_PROJECT_META_PLACEHOLDER.projDesigner,
    },
    absentNeedles: ['未填'],
  });
}

async function assertFormalReportReadiness(cdp, sessionId, selector, label) {
  const text = await evaluate(cdp, sessionId, `(() => {
    const text = document.querySelector('${selector}')?.innerText || '';
    if (!text.includes('優先閱讀')) {
      throw new Error('${label} missing 優先閱讀: ' + text);
    }
    if (!text.includes('不會寫入計算書或列印 PDF')) {
      throw new Error('${label} missing print boundary note: ' + text);
    }
    return text;
  })()`, label);
  if (text.includes('[object Event]')) {
    throw new Error(`${label} should not stringify DOM events: ${text}`);
  }
  await assertPageOnlyReadinessHiddenInPrint(cdp, sessionId, selector, label);
}

async function assertFormalReportReadinessBlocked(cdp, sessionId, selector, label) {
  const text = await evaluate(cdp, sessionId, `(() => {
    const text = document.querySelector('${selector}')?.innerText || '';
    if (!text.includes('暫勿作附件')) {
      throw new Error('${label} missing blocked badge: ' + text);
    }
    if (!text.includes('不會寫入計算書或列印 PDF')) {
      throw new Error('${label} missing print boundary note: ' + text);
    }
    return text;
  })()`, `${label} blocked`);
  if (text.includes('[object Event]')) {
    throw new Error(`${label} should not stringify DOM events: ${text}`);
  }
  await assertPageOnlyReadinessHiddenInPrint(cdp, sessionId, selector, `${label} blocked`);
}

async function assertPageOnlyReadinessHiddenInPrint(cdp, sessionId, selector, label) {
  await cdp.send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
  await wait(100);
  try {
    const printState = await evaluate(cdp, sessionId, `(() => {
      const node = document.querySelector('${selector}');
      if (!node) {
        return { exists: false, targetDisplay: '', wrapperDisplay: '', visibility: '', text: '' };
      }
      const wrapper = node.closest('.page-only-report-status') || node;
      const wrapperStyle = window.getComputedStyle(wrapper);
      const targetStyle = window.getComputedStyle(node);
      return {
        exists: true,
        targetDisplay: targetStyle.display || '',
        wrapperDisplay: wrapperStyle.display || '',
        visibility: wrapperStyle.visibility || '',
        text: (wrapper.innerText || wrapper.textContent || '').replace(/\\s+/g, ' ').trim()
      };
    })()`);
    if (!printState.exists) {
      throw new Error(`${label} missing readiness node in print DOM`);
    }
    if (printState.wrapperDisplay !== 'none') {
      throw new Error(`${label} page-only readiness still visible in print: ${JSON.stringify(printState)}`);
    }
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' }, sessionId).catch(() => {});
    await wait(100);
  }
}

async function assertFormalReportReadinessText(cdp, sessionId, selector, expectedText, label) {
  await evaluate(cdp, sessionId, `(() => {
    const text = document.querySelector('${selector}')?.innerText || '';
    if (!text.includes('${expectedText}')) {
      throw new Error('${label} missing: ' + text);
    }
    return text;
  })()`, label);
}

async function assertFormalReportReadinessTextAbsent(cdp, sessionId, selector, unexpectedText, label) {
  await evaluate(cdp, sessionId, `(() => {
    const text = document.querySelector('${selector}')?.innerText || '';
    if (text.includes('${unexpectedText}')) {
      throw new Error('${label}: ' + text);
    }
    return text;
  })()`, label);
}

async function assertFormalProjectMetaRendered(cdp, sessionId, selectors, label) {
  const meta = await evaluate(cdp, sessionId, `(() => ({
    name: document.querySelector(${JSON.stringify(selectors.nameId)})?.innerText?.trim() || '',
    no: document.querySelector(${JSON.stringify(selectors.noId)})?.innerText?.trim() || '',
    designer: document.querySelector(${JSON.stringify(selectors.designerId)})?.innerText?.trim() || '',
  }))()`, label);
  if (meta.name !== FORMAL_PROJECT_META.projName || meta.no !== FORMAL_PROJECT_META.projNo || meta.designer !== FORMAL_PROJECT_META.projDesigner) {
    throw new Error(`${label} mismatch: ${JSON.stringify(meta)}`);
  }
}

async function assertFormalProjectMetaPlaceholderRendered(cdp, sessionId, selectors, label) {
  const meta = await evaluate(cdp, sessionId, `(() => ({
    name: document.querySelector(${JSON.stringify(selectors.nameId)})?.innerText?.trim() || '',
    no: document.querySelector(${JSON.stringify(selectors.noId)})?.innerText?.trim() || '',
    designer: document.querySelector(${JSON.stringify(selectors.designerId)})?.innerText?.trim() || '',
  }))()`, label);
  if (meta.name !== '—' || meta.no !== FORMAL_PROJECT_META_PLACEHOLDER.projNo || meta.designer !== FORMAL_PROJECT_META_PLACEHOLDER.projDesigner) {
    throw new Error(`${label} mismatch: ${JSON.stringify(meta)}`);
  }
}

async function assertSourceJsonReplay(cdp, sessionId, options) {
  const state = await evaluate(cdp, sessionId, `(async () => {
    const source = window.__steelSourceReplayPayload;
    const builder = window[${JSON.stringify(options.builder)}];
    const input = document.querySelector(${JSON.stringify(options.inputSelector)});
    const field = document.querySelector(${JSON.stringify(options.mutationSelector)});
    const status = document.querySelector(${JSON.stringify(options.statusSelector)});
    if (!source || typeof builder !== 'function' || !input || !field || !status) {
      throw new Error('source replay prerequisites missing');
    }
    const expectedValue = ${options.nestedFields
      ? `source.fields?.[${JSON.stringify(options.sourceFieldKey)}]?.value`
      : `source.fields?.[${JSON.stringify(options.sourceFieldKey)}]`};
    if (expectedValue === undefined) throw new Error('source replay field missing');
    const triggerImport = async (payload, statusNeedle) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(payload)], 'calculation-source.json', { type: 'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5000) {
        if ((status.textContent || '').includes(statusNeedle)) return status.textContent || '';
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('source replay status timeout: ' + (status.textContent || ''));
    };
    field.value = String(Number(field.value || 0) + 17);
    field.dispatchEvent(new Event('change', { bubbles: true }));
    const successStatus = await triggerImport(source, '已匯入並重現計算');
    const replay = builder();
    const restoredValue = field.value;
    const invalid = JSON.parse(JSON.stringify(source));
    invalid.tool.version = 'V999.0';
    const beforeReject = builder().calculationFingerprint;
    const rejectedStatus = await triggerImport(invalid, '工具版本不符');
    const afterReject = builder().calculationFingerprint;
    return {
      expectedValue: String(expectedValue),
      restoredValue: String(restoredValue),
      sourceFingerprint: source.calculationFingerprint,
      replayFingerprint: replay?.calculationFingerprint || '',
      successStatus,
      rejectedStatus,
      beforeReject,
      afterReject,
      inputCleared: input.value === '',
    };
  })()`, `${options.label} source JSON replay`);
  if (state.restoredValue !== state.expectedValue || state.replayFingerprint !== state.sourceFingerprint) {
    throw new Error(`${options.label} source replay mismatch: ${JSON.stringify(state)}`);
  }
  if (!state.successStatus.includes(state.sourceFingerprint) || !state.rejectedStatus.includes('已保留原輸入')) {
    throw new Error(`${options.label} source replay status mismatch: ${JSON.stringify(state)}`);
  }
  if (state.beforeReject !== state.afterReject || !state.inputCleared) {
    throw new Error(`${options.label} rejected source should preserve state and clear file input: ${JSON.stringify(state)}`);
  }
}

async function assertFormalReportPopup(cdp, sessionId, options) {
  const sourceExport = options.sourcePayloadBuilder
    ? await evaluate(cdp, sessionId, `(() => {
        const builder = window[${JSON.stringify(options.sourcePayloadBuilder)}];
        if (typeof builder !== 'function') throw new Error('missing source payload builder ${options.sourcePayloadBuilder}');
         const payload = builder();
         window.__steelSourceReplayPayload = payload;
        const button = document.querySelector('#btnExportSourceJson');
        if (!button) throw new Error('missing #btnExportSourceJson');
        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;
        const originalAnchorClick = HTMLAnchorElement.prototype.click;
        let download = null;
        try {
          URL.createObjectURL = () => 'blob:steel-source-json-browser-test';
          URL.revokeObjectURL = () => {};
          HTMLAnchorElement.prototype.click = function captureSourceDownload() {
            download = { filename: this.download || '', href: this.href || '' };
          };
          button.click();
        } finally {
          URL.createObjectURL = originalCreateObjectURL;
          URL.revokeObjectURL = originalRevokeObjectURL;
          HTMLAnchorElement.prototype.click = originalAnchorClick;
        }
        return {
          payload,
          download,
          status: document.querySelector('#beamInputStatus, #columnInputStatus')?.textContent || '',
        };
      })()`, `${options.label} source payload`)
    : null;
  const sourcePayload = sourceExport?.payload || null;
  if (sourcePayload && options.sourceReplay) {
    await assertSourceJsonReplay(cdp, sessionId, { ...options.sourceReplay, label: options.label });
  }
  const popup = await openFormalReportPopup(cdp, sessionId, options.label, options.buttonSelector || '#btnReport');
  const snapshot = await evaluate(cdp, popup.sessionId, `(() => ({
    title: document.title || '',
    header: document.querySelector('.rep-header h1')?.innerText?.trim() || '',
    bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim(),
    html: document.documentElement?.outerHTML || '',
    metaRows: Array.from(document.querySelectorAll('.rep-meta div')).map((node) => (node.innerText || '').replace(/\\s+/g, ' ').trim()),
    sectionHeadings: Array.from(document.querySelectorAll('.rep-paper h3')).map((node) => (node.innerText || '').replace(/\\s+/g, ' ').trim()),
    uiCardCount: document.querySelectorAll('.rep-highlights, .rep-summary-facts').length,
  }))()`, `${options.label} snapshot`);
  if (!snapshot.title.includes(options.titleNeedle) || !snapshot.header.includes(options.titleNeedle)) {
    throw new Error(`${options.label} title mismatch: ${JSON.stringify(snapshot)}`);
  }
  const forbiddenNeedles = [
    '優先建議報告閱讀狀態',
    '報告閱讀狀態',
    '頁面輔助',
    '頁面顯示，不進計算書、列印或 PDF',
    '不會寫入計算書或列印 PDF',
    '計畫名稱 / 編號 / 設計人尚未完整',
    ...FORMAL_REPORT_REFERENCE_NEEDLES,
    ...CALCULATION_BOOK_UI_ONLY_NEEDLES,
    '符號說明',
    ...(Array.isArray(options.absentNeedles) ? options.absentNeedles : []),
  ];
  for (const needle of forbiddenNeedles) {
    if (snapshot.bodyText.includes(needle)) {
      throw new Error(`${options.label} should exclude "${needle}": ${snapshot.bodyText}`);
    }
  }
  if (snapshot.uiCardCount !== 0) {
    throw new Error(`${options.label} should not render interface-style cards: ${snapshot.uiCardCount}`);
  }
  const conclusionIndex = snapshot.sectionHeadings.lastIndexOf('檢核結論');
  if (conclusionIndex < 0 || conclusionIndex !== snapshot.sectionHeadings.length - 1) {
    throw new Error(`${options.label} should place 檢核結論 after calculation content: ${JSON.stringify(snapshot.sectionHeadings)}`);
  }
  const [nameRow = '', noRow = '', designerRow = ''] = snapshot.metaRows;
  if (!nameRow.includes(options.expectedProject.name)) {
    throw new Error(`${options.label} project name mismatch: ${JSON.stringify(snapshot.metaRows)}`);
  }
  if (!noRow.includes(options.expectedProject.no)) {
    throw new Error(`${options.label} project no mismatch: ${JSON.stringify(snapshot.metaRows)}`);
  }
  if (!designerRow.includes(options.expectedProject.designer)) {
    throw new Error(`${options.label} project designer mismatch: ${JSON.stringify(snapshot.metaRows)}`);
  }
  assertFormalReportTraceText(snapshot.bodyText, options.label);
  if (sourcePayload) {
    const reportFingerprint = snapshot.bodyText.match(/計算指紋\s*(CF-[0-9A-F]{16})/)?.[1] || '';
    if (sourcePayload.schemaVersion !== 1 || sourcePayload.kind !== 'formal-calculation-source') {
      throw new Error(`${options.label} invalid source payload envelope: ${JSON.stringify(sourcePayload)}`);
    }
    if (!sourcePayload.tool?.name || !sourcePayload.tool?.version || !sourcePayload.fields?.inFy) {
      throw new Error(`${options.label} incomplete source payload trace/input fields: ${JSON.stringify(sourcePayload)}`);
    }
    if (sourcePayload.project?.no !== options.expectedProject.no) {
      throw new Error(`${options.label} source payload project mismatch: ${JSON.stringify(sourcePayload.project)}`);
    }
    if (!sourceExport.download?.filename?.endsWith('.json') || !sourceExport.status.includes(sourcePayload.calculationFingerprint)) {
      throw new Error(`${options.label} source JSON download/status mismatch: ${JSON.stringify(sourceExport)}`);
    }
    if (!reportFingerprint || sourcePayload.calculationFingerprint !== reportFingerprint || sourcePayload.report?.calculationFingerprint !== reportFingerprint) {
      throw new Error(`${options.label} source/report fingerprint mismatch: ${sourcePayload.calculationFingerprint} / ${sourcePayload.report?.calculationFingerprint} / ${reportFingerprint}`);
    }
  }
  if (options.renderEvidenceKey) {
    const evidence = await renderAndValidateReportPdf(cdp, {
      html: snapshot.html,
      outputDir: renderedEvidenceDir,
      artifactName: options.renderEvidenceKey,
      label: options.label,
      renderer: 'steel-formal-report',
      titleNeedle: options.titleNeedle,
      requiredNeedles: [options.titleNeedle, '計畫名稱', '計算過程明細', '檢核結論', ...FORMAL_REPORT_TRACE_LABELS],
      forbiddenNeedles,
    });
    assertFormalReportTraceText(fs.readFileSync(evidence.pdf.textPath, 'utf8'), `${options.label} rendered PDF`);
    renderedEvidenceRecords.push({
      key: options.renderEvidenceKey,
      renderer: evidence.renderer,
      artifact: path.basename(evidence.pdfPath),
      evidence: path.basename(evidence.evidencePath),
      pageCount: evidence.pdf.pageCount,
      textLength: evidence.pdf.textLength,
    });
  }
  return {
    captureSessionId: popup.sessionId,
    captureTargetId: popup.targetId,
  };
}

async function assertLegacyReportPopup(cdp, sessionId, options) {
  const sourceExport = options.sourcePayloadBuilder
    ? await evaluate(cdp, sessionId, `(() => {
        const builder = window[${JSON.stringify(options.sourcePayloadBuilder)}];
        if (typeof builder !== 'function') throw new Error('missing source payload builder ${options.sourcePayloadBuilder}');
         const payload = builder();
         window.__steelSourceReplayPayload = payload;
        const button = document.querySelector('#exportSourceJsonBtn');
        if (!button) throw new Error('missing #exportSourceJsonBtn');
        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;
        const originalAnchorClick = HTMLAnchorElement.prototype.click;
        let download = null;
        try {
          URL.createObjectURL = () => 'blob:steel-connection-source-json-browser-test';
          URL.revokeObjectURL = () => {};
          HTMLAnchorElement.prototype.click = function captureSourceDownload() {
            download = { filename: this.download || '', href: this.href || '' };
          };
          button.click();
        } finally {
          URL.createObjectURL = originalCreateObjectURL;
          URL.revokeObjectURL = originalRevokeObjectURL;
          HTMLAnchorElement.prototype.click = originalAnchorClick;
        }
        return {
          payload,
          download,
          status: document.querySelector('#exportReportStatus')?.textContent || '',
        };
      })()`, `${options.label} source payload`)
    : null;
  const sourcePayload = sourceExport?.payload || null;
  if (sourcePayload && options.sourceReplay) {
    await assertSourceJsonReplay(cdp, sessionId, { ...options.sourceReplay, label: options.label });
  }
  const popup = await openLegacyReportPopup(cdp, sessionId, options.label, options.buttonSelector);
  const snapshot = await evaluate(cdp, popup.sessionId, `(() => ({
    title: document.title || '',
    header: document.querySelector('h1')?.innerText?.trim() || '',
    bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim(),
    html: document.documentElement?.outerHTML || '',
    metaRows: Array.from(document.querySelectorAll('.meta div')).map((node) => (node.innerText || '').replace(/\\s+/g, ' ').trim()),
    sectionHeadings: Array.from(document.querySelectorAll('.paper h3')).map((node) => (node.innerText || '').replace(/\\s+/g, ' ').trim()),
  }))()`, `${options.label} snapshot`);
  if (!snapshot.title.includes(options.titleNeedle) || !snapshot.header.includes(options.titleNeedle)) {
    throw new Error(`${options.label} title mismatch: ${JSON.stringify(snapshot)}`);
  }
  const forbiddenNeedles = [
    '優先建議報告閱讀狀態',
    '報告閱讀狀態',
    '頁面輔助',
    '頁面顯示，不進計算書、列印或 PDF',
    '不會寫入計算書或列印 PDF',
    '計畫名稱 / 編號 / 設計人尚未完整',
    ...FORMAL_REPORT_REFERENCE_NEEDLES,
    ...CALCULATION_BOOK_UI_ONLY_NEEDLES,
    '審查摘要',
    ...(Array.isArray(options.absentNeedles) ? options.absentNeedles : []),
  ];
  for (const needle of forbiddenNeedles) {
    if (snapshot.bodyText.includes(needle)) {
      throw new Error(`${options.label} should exclude "${needle}": ${snapshot.bodyText}`);
    }
  }
  const legacyConclusionIndex = snapshot.sectionHeadings.lastIndexOf('檢核結論');
  if (legacyConclusionIndex < 0 || legacyConclusionIndex !== snapshot.sectionHeadings.length - 1) {
    throw new Error(`${options.label} should place 檢核結論 after calculation content: ${JSON.stringify(snapshot.sectionHeadings)}`);
  }
  const [nameRow = '', tagRow = '', designerRow = ''] = snapshot.metaRows;
  if (!nameRow.includes(options.expectedProject.name)) {
    throw new Error(`${options.label} project name mismatch: ${JSON.stringify(snapshot.metaRows)}`);
  }
  if (!tagRow.includes(options.expectedProject.tag)) {
    throw new Error(`${options.label} connection tag mismatch: ${JSON.stringify(snapshot.metaRows)}`);
  }
  if (!designerRow.includes(options.expectedProject.designer)) {
    throw new Error(`${options.label} project designer mismatch: ${JSON.stringify(snapshot.metaRows)}`);
  }
  assertFormalReportTraceText(snapshot.bodyText, options.label);
  if (sourcePayload) {
    const reportFingerprint = snapshot.bodyText.match(/計算指紋\s*(CF-[0-9A-F]{16})/)?.[1] || '';
    if (sourcePayload.schemaVersion !== 1 || sourcePayload.kind !== 'formal-calculation-source') {
      throw new Error(`${options.label} invalid source payload envelope: ${JSON.stringify(sourcePayload)}`);
    }
    if (!sourcePayload.tool?.name || !sourcePayload.tool?.version || !sourcePayload.fields?.connectionType) {
      throw new Error(`${options.label} incomplete source payload trace/input fields: ${JSON.stringify(sourcePayload)}`);
    }
    if (sourcePayload.project?.no !== options.expectedProject.tag) {
      throw new Error(`${options.label} source payload project mismatch: ${JSON.stringify(sourcePayload.project)}`);
    }
    if (!sourceExport.download?.filename?.endsWith('.json') || !sourceExport.status.includes(sourcePayload.calculationFingerprint)) {
      throw new Error(`${options.label} source JSON download/status mismatch: ${JSON.stringify(sourceExport)}`);
    }
    if (!reportFingerprint || sourcePayload.calculationFingerprint !== reportFingerprint || sourcePayload.report?.calculationFingerprint !== reportFingerprint) {
      throw new Error(`${options.label} source/report fingerprint mismatch: ${sourcePayload.calculationFingerprint} / ${sourcePayload.report?.calculationFingerprint} / ${reportFingerprint}`);
    }
  }
  if (options.renderEvidenceKey) {
    const evidence = await renderAndValidateReportPdf(cdp, {
      html: snapshot.html,
      outputDir: renderedEvidenceDir,
      artifactName: options.renderEvidenceKey,
      label: options.label,
      renderer: 'steel-main-report',
      titleNeedle: options.titleNeedle,
      requiredNeedles: [options.titleNeedle, '計畫名稱', '檢核結論', ...FORMAL_REPORT_TRACE_LABELS],
      forbiddenNeedles,
    });
    assertFormalReportTraceText(fs.readFileSync(evidence.pdf.textPath, 'utf8'), `${options.label} rendered PDF`);
    renderedEvidenceRecords.push({
      key: options.renderEvidenceKey,
      renderer: evidence.renderer,
      artifact: path.basename(evidence.pdfPath),
      evidence: path.basename(evidence.evidencePath),
      pageCount: evidence.pdf.pageCount,
      textLength: evidence.pdf.textLength,
    });
  }
  return {
    captureSessionId: popup.sessionId,
    captureTargetId: popup.targetId,
  };
}

async function openFormalReportPopup(cdp, sessionId, label, buttonSelector = '#btnReport') {
  const beforeTargets = await cdp.send('Target.getTargets');
  const existingTargetIds = new Set(
    (beforeTargets.targetInfos || [])
      .filter((info) => info.type === 'page')
      .map((info) => info.targetId)
  );
  await evaluate(cdp, sessionId, `(() => {
    const button = document.querySelector(${JSON.stringify(buttonSelector)});
    if (!button) throw new Error('missing ${buttonSelector}');
    button.click();
    return true;
  })()`, `${label} open report`);
  const popupTarget = await waitForNewPageTarget(cdp, existingTargetIds, `${label} target`);
  const attached = await cdp.send('Target.attachToTarget', { targetId: popupTarget.targetId, flatten: true });
  const popupSessionId = attached.sessionId;
  await cdp.send('Page.enable', {}, popupSessionId);
  await cdp.send('Runtime.enable', {}, popupSessionId);
  await waitForPopupReady(cdp, popupSessionId, `${label} ready`);
  return {
    targetId: popupTarget.targetId,
    sessionId: popupSessionId,
  };
}

async function openLegacyReportPopup(cdp, sessionId, label, buttonSelector) {
  const beforeTargets = await cdp.send('Target.getTargets');
  const existingTargetIds = new Set(
    (beforeTargets.targetInfos || [])
      .filter((info) => info.type === 'page')
      .map((info) => info.targetId)
  );
  await evaluate(cdp, sessionId, `(() => {
    const button = document.querySelector(${JSON.stringify(buttonSelector)});
    if (!button) throw new Error('missing ${buttonSelector}');
    button.click();
    return true;
  })()`, `${label} open report`);
  const popupTarget = await waitForNewPageTarget(cdp, existingTargetIds, `${label} target`);
  const attached = await cdp.send('Target.attachToTarget', { targetId: popupTarget.targetId, flatten: true });
  const popupSessionId = attached.sessionId;
  await cdp.send('Page.enable', {}, popupSessionId);
  await cdp.send('Runtime.enable', {}, popupSessionId);
  await waitForPopupReady(cdp, popupSessionId, `${label} ready`);
  return {
    targetId: popupTarget.targetId,
    sessionId: popupSessionId,
  };
}

async function waitForNewPageTarget(cdp, existingTargetIds, label, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await cdp.send('Target.getTargets');
    const targetInfo = (result.targetInfos || []).find((info) => info.type === 'page' && !existingTargetIds.has(info.targetId));
    if (targetInfo) return targetInfo;
    await wait(100);
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

async function waitForPopupReady(cdp, sessionId, label, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const state = await evaluate(cdp, sessionId, `(() => ({
        readyState: document.readyState || '',
        title: document.title || '',
        bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim(),
      }))()`, label);
      if (state.readyState === 'complete' && state.title && state.bodyText.includes('計畫名稱')) {
        return state;
      }
    } catch (_) {}
    await wait(100);
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

async function verifySteelDirectPrintBlock(cdp, page) {
  const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
  let sessionId;
  try {
    const attached = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
    sessionId = attached.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    const loadEvent = waitForEvent(cdp, 'Page.loadEventFired', sessionId, () => true, 45000);
    await cdp.send('Page.navigate', { url: `${baseUrl}${page.url}` }, sessionId);
    await loadEvent;
    await wait(300);

    const screenState = await evaluate(cdp, sessionId, `(() => {
      const boundary = document.querySelector('.steel-formal-direct-print-boundary');
      const stylesheet = document.querySelector('link[href$="direct-print-boundary.css"]');
      return {
        bodyClass: document.body?.classList.contains('steel-formal-output-page') || false,
        boundaryExists: Boolean(boundary),
        boundaryRects: boundary?.getClientRects().length || 0,
        stylesheetExists: Boolean(stylesheet),
        stylesheetLoaded: Boolean(stylesheet?.sheet),
      };
    })()`, `${page.key} screen direct-print state`);
    if (!screenState.bodyClass) throw new Error(`${page.key} missing steel-formal-output-page body class`);
    if (!screenState.boundaryExists) throw new Error(`${page.key} missing steel formal direct-print notice`);
    if (screenState.boundaryRects !== 0) throw new Error(`${page.key} direct-print notice must stay hidden on screen`);
    if (!screenState.stylesheetExists || !screenState.stylesheetLoaded) {
      throw new Error(`${page.key} shared direct-print stylesheet is unavailable`);
    }

    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
    await wait(150);
    const printState = await evaluate(cdp, sessionId, `(() => {
      const clean = value => String(value || '').replace(/\\s+/g, ' ').trim();
      const boundary = document.querySelector('.steel-formal-direct-print-boundary');
      const visibleSiblings = Array.from(document.body?.children || [])
        .filter(node => node !== boundary && node.getClientRects().length > 0)
        .map(node => ({ tag: node.tagName, id: node.id || '', className: node.className || '' }));
      return {
        boundaryRects: boundary?.getClientRects().length || 0,
        boundaryText: clean(boundary?.innerText),
        visibleSiblings,
        bodyPseudo: clean([
          getComputedStyle(document.body, '::before').content,
          getComputedStyle(document.body, '::after').content,
        ].join(' ')),
      };
    })()`, `${page.key} print direct-print state`);
    if (printState.boundaryRects === 0) throw new Error(`${page.key} direct-print notice is not visible in print media`);
    if (printState.visibleSiblings.length > 0) {
      throw new Error(`${page.key} still prints work-page children: ${JSON.stringify(printState.visibleSiblings)}`);
    }
    for (const needle of [STEEL_DIRECT_PRINT_TITLE, STEEL_DIRECT_PRINT_BODY]) {
      if (!printState.boundaryText.includes(needle)) throw new Error(`${page.key} print notice missing ${needle}`);
    }
    if (/DRAFT|非正式附件/i.test(printState.bodyPseudo)) {
      throw new Error(`${page.key} direct print must not create a draft calculation-book classification`);
    }

    const pdfResult = await cdp.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.25,
      marginBottom: 0.25,
      marginLeft: 0.25,
      marginRight: 0.25,
    }, sessionId);
    const pdfPath = path.join(directPrintOutputDir, `${page.key}.pdf`);
    fs.writeFileSync(pdfPath, Buffer.from(pdfResult.data || '', 'base64'));
    const pdf = validatePdfFile(pdfPath, {
      label: `${page.key} work-page direct-print block`,
      titleNeedle: STEEL_DIRECT_PRINT_TITLE,
      requiredNeedles: [STEEL_DIRECT_PRINT_TITLE, '此頁是操作介面，不是計算書', '輸出正式報表', '本頁不得作為附件'],
      forbiddenNeedles: [page.pageTitle, '計畫名稱', 'DRAFT', '非正式附件'],
      minTextLength: 60,
    });
    if (pdf.pageCount !== 1) throw new Error(`${page.key} direct-print block must be one page, got ${pdf.pageCount}`);
    return {
      key: page.key,
      url: page.url,
      pdfPath,
      textPath: pdf.textPath,
      pageCount: pdf.pageCount,
      textLength: pdf.textLength,
      screenBoundaryRects: screenState.boundaryRects,
      printBoundaryRects: printState.boundaryRects,
      visibleSiblingCount: printState.visibleSiblings.length,
    };
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' }, sessionId).catch(() => {});
    await cdp.send('Target.closeTarget', { targetId: created.targetId }).catch(() => {});
  }
}

async function runSnapshot(cdp, scenario, viewport) {
  const label = `${scenario.name}-${viewport.label}`;
  log(`Edge CDP snapshot [${label}] ${viewport.width}x${viewport.height}`);
  const records = { consoleErrors: [], networkAlerts: [], requestMap: new Map() };
  const targetIds = [];
  const removeEventListeners = [];
  let sessionId;
  let captureSessionId;
  try {
    const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targetIds.push(created.targetId);
    const attached = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
    sessionId = attached.sessionId;
    captureSessionId = sessionId;
    removeEventListeners.push(cdp.onEvent(message => collectPageEvent(records, message, sessionId)));

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    }, sessionId);

    const loadEvent = waitForEvent(cdp, 'Page.loadEventFired', sessionId, () => true, 45000);
    await cdp.send('Page.navigate', { url: `${baseUrl}${scenario.url}` }, sessionId);
    await loadEvent;
    await wait(300);
    if (scenario.setup) await scenario.setup(cdp, sessionId);
    if (scenario.assert) {
      const assertResult = await scenario.assert(cdp, sessionId, { scenario, viewport });
      if (assertResult?.captureSessionId) captureSessionId = assertResult.captureSessionId;
      if (assertResult?.captureTargetId) targetIds.push(assertResult.captureTargetId);
    }
    await wait(300);

    const snapshotText = await makeSnapshot(cdp, captureSessionId, label, viewport);
    const screenshotBuffer = await captureScreenshot(cdp, captureSessionId, viewport);
    const output = writeScenarioArtifacts(label, snapshotText, screenshotBuffer, records);
    const consoleErrors = records.consoleErrors.length;
    const networkAlerts = records.networkAlerts.length;
    return {
      label,
      snapshot: output.snapshotPath,
      screenshot: output.screenshotPath,
      console: output.consolePath,
      network: output.networkPath,
      consoleErrors,
      networkAlerts,
      failures: [
        ...(consoleErrors > 0 ? [`${label}: consoleErrors=${consoleErrors}`] : []),
        ...(networkAlerts > 0 ? [`${label}: networkAlerts=${networkAlerts}`] : []),
      ],
    };
  } catch (error) {
    const output = writeScenarioArtifacts(label, `Page URL: ${baseUrl}${scenario.url}\nScenario: ${label}\nERROR: ${error.message}\n`, Buffer.alloc(0), records);
    return {
      label,
      snapshot: output.snapshotPath,
      screenshot: output.screenshotPath,
      console: output.consolePath,
      network: output.networkPath,
      consoleErrors: records.consoleErrors.length,
      networkAlerts: records.networkAlerts.length,
      failures: [`${label}: ${error.message}`],
    };
  } finally {
    for (const remove of removeEventListeners.reverse()) {
      try { remove(); } catch (_) {}
    }
    for (const targetId of targetIds.reverse()) {
      await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    }
  }
}

function collectPageEvent(records, message, sessionId) {
  if (message.sessionId !== sessionId) return;
  const params = message.params || {};
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(params.type)) {
    const text = (params.args || []).map(arg => arg.value ?? arg.description ?? '').join(' ');
    records.consoleErrors.push(`[${params.type}] ${text}`.trim());
  }
  if (message.method === 'Runtime.exceptionThrown') {
    records.consoleErrors.push(params.exceptionDetails?.text || params.exceptionDetails?.exception?.description || 'Runtime exception');
  }
  if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(params.entry?.level)) {
    const level = params.entry.level;
    const text = params.entry.text || '';
    if (level === 'error') records.consoleErrors.push(`[log] ${text}`.trim());
  }
  if (message.method === 'Network.requestWillBeSent') {
    records.requestMap.set(params.requestId, { method: params.request?.method || 'GET', url: params.request?.url || '' });
  }
  if (message.method === 'Network.responseReceived') {
    const status = params.response?.status || 0;
    const url = params.response?.url || records.requestMap.get(params.requestId)?.url || '';
    if (status >= 400 && !isIgnoredNetworkUrl(url)) {
      const method = records.requestMap.get(params.requestId)?.method || 'GET';
      records.networkAlerts.push(`${method} ${url} ${status}`);
    }
  }
}

function isIgnoredNetworkUrl(url) {
  return !url || url.startsWith('data:') || url.startsWith('blob:') || /\/favicon\.ico(?:$|[?#])/.test(url);
}

async function makeSnapshot(cdp, sessionId, label, viewport) {
  const value = await evaluate(cdp, sessionId, `(() => ({
    url: location.href,
    title: document.title,
    text: document.body ? document.body.innerText : '',
    activeElement: document.activeElement ? document.activeElement.tagName : ''
  }))()`, `${label} snapshot`);
  return [
    `Page URL: ${value.url}`,
    `Title: ${value.title}`,
    `Scenario: ${label}`,
    `Viewport: ${viewport.width}x${viewport.height}`,
    `Active Element: ${value.activeElement}`,
    '',
    value.text || '',
  ].join('\n');
}

async function captureScreenshot(cdp, sessionId, viewport) {
  const metrics = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
  const contentSize = metrics.cssContentSize || metrics.contentSize || { width: viewport.width, height: viewport.height };
  const width = Math.max(viewport.width, Math.ceil(contentSize.width || viewport.width));
  const height = Math.max(viewport.height, Math.ceil(contentSize.height || viewport.height));
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  }, sessionId);
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  }, sessionId);
  return Buffer.from(result.data || '', 'base64');
}

function writeScenarioArtifacts(label, snapshotText, screenshotBuffer, records) {
  const snapshotPath = path.join(outputDir, `playwright-${label}.txt`);
  const screenshotPath = path.join(outputDir, `playwright-${label}.png`);
  const consolePath = path.join(outputDir, `playwright-${label}-console.txt`);
  const networkPath = path.join(outputDir, `playwright-${label}-network.txt`);
  const snapshotHistoryPath = path.join(historyDir, `playwright-${label}.txt`);
  const screenshotHistoryPath = path.join(historyDir, `playwright-${label}.png`);
  const consoleHistoryPath = path.join(historyDir, `playwright-${label}-console.txt`);
  const networkHistoryPath = path.join(historyDir, `playwright-${label}-network.txt`);

  const consoleText = [`Errors: ${records.consoleErrors.length}`, ...records.consoleErrors].join('\n') + '\n';
  const networkText = [`Network alerts: ${records.networkAlerts.length}`, ...records.networkAlerts].join('\n') + '\n';
  fs.writeFileSync(snapshotPath, snapshotText, 'utf8');
  fs.writeFileSync(snapshotHistoryPath, snapshotText, 'utf8');
  fs.writeFileSync(consolePath, consoleText, 'utf8');
  fs.writeFileSync(consoleHistoryPath, consoleText, 'utf8');
  fs.writeFileSync(networkPath, networkText, 'utf8');
  fs.writeFileSync(networkHistoryPath, networkText, 'utf8');
  if (screenshotBuffer.length > 0) {
    fs.writeFileSync(screenshotPath, screenshotBuffer);
    fs.writeFileSync(screenshotHistoryPath, screenshotBuffer);
  } else {
    fs.writeFileSync(screenshotPath, Buffer.alloc(0));
    fs.writeFileSync(screenshotHistoryPath, Buffer.alloc(0));
  }
  return { snapshotPath, screenshotPath, consolePath, networkPath };
}

async function main() {
  ensureDir(outputDir);
  ensureDir(historyDir);
  ensureDir(directPrintOutputDir);
  const records = [];
  const directPrintRecords = [];
  const directPrintFailures = [];
  const failures = [];
  const summaryLines = [];
  const cleanupWarnings = [];
  let browser;
  let cdp;
  try {
    browser = await launchEdge();
    cdp = new CdpConnection(browser.wsUrl);
    await cdp.open();
    for (const page of steelDirectPrintPages) {
      try {
        const record = await withTimeout(
          verifySteelDirectPrintBlock(cdp, page),
          scenarioTimeoutMs,
          `${page.key}-direct-print`
        );
        directPrintRecords.push(record);
        summaryLines.push(`- ${page.key} direct-print block: pdf=${record.pdfPath}`);
      } catch (error) {
        const failure = `${page.key}-direct-print: ${error.message || formatError(error)}`;
        directPrintFailures.push(failure);
        failures.push(failure);
        summaryLines.push(`- ${failure}`);
      }
    }
    for (const scenario of scenarios) {
      for (const viewport of viewports) {
        const record = await withTimeout(runSnapshot(cdp, scenario, viewport), scenarioTimeoutMs, `${scenario.name}-${viewport.label}`);
        records.push(record);
        summaryLines.push(`- ${record.label}: snapshot=${record.snapshot}`);
        summaryLines.push(`  screenshot=${record.screenshot}`);
        summaryLines.push(`  console=${record.console}`);
        summaryLines.push(`  network=${record.network}`);
        summaryLines.push(`  consoleErrors=${record.consoleErrors}, networkAlerts=${record.networkAlerts}`);
        failures.push(...record.failures);
      }
    }
  } catch (error) {
    const detail = formatError(error);
    failures.push(`audit-aborted: ${error.message || detail}`);
    summaryLines.push(`- audit-aborted: ${detail}`);
  } finally {
    if (cdp && cdp.ws) {
      await cdp.send('Browser.close').catch(() => {});
      await cdp.close().catch(() => {});
    }
    if (browser) {
      await wait(500);
      if (browser.child && !browser.child.killed) browser.child.kill('SIGKILL');
      try {
        fs.rmSync(browser.profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
      } catch (err) {
        cleanupWarnings.push(`profile cleanup warning: ${browser.profileDir}: ${err.message}`);
      }
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    runner: 'edge-cdp',
    records,
    directPrintRecords,
    failures,
    summaryLines,
    cleanupWarnings,
  };
  fs.writeFileSync(directPrintSummaryJson, JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl,
    expectedCount: steelDirectPrintPages.length,
    records: directPrintRecords,
    failures: directPrintFailures,
  }, null, 2) + '\n', 'utf8');
  const renderedSummary = failures.length === 0
    ? writeEvidenceSummary(
      renderedEvidenceDir,
      'steel-formal',
      renderedEvidenceRecords,
      ['steel-main-plate', 'steel-main-tension', 'steel-standalone-plate', 'steel-beam-formal', 'steel-column-formal']
    )
    : null;
  if (renderedSummary) {
    summaryLines.push(`- rendered delivery evidence: ${renderedSummary.summaryPath}`);
  }
  for (const warning of cleanupWarnings) {
    summaryLines.push(`- ${warning}`);
  }
  fs.writeFileSync(summaryJson, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  if (failures.length > 0) {
    console.error(`steel browser runner found ${failures.length} issue(s)`);
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
    return;
  }
  console.log(`steel browser runner OK (records=${records.length}, directPrintBlocks=${directPrintRecords.length}, runner=edge-cdp)`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
