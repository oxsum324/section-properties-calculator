const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const args = parseArgs(process.argv.slice(2));
const baseUrl = String(args['base-url'] || 'http://127.0.0.1:8123').replace(/\/$/, '');
const outputDir = path.resolve(String(args['output-dir'] || path.join(__dirname, 'output', 'audit')));
const historyDir = path.resolve(String(args['history-dir'] || outputDir));
const summaryJson = path.resolve(String(args['summary-json'] || path.join(historyDir, 'steel-browser-runner-summary.json')));
const quiet = Boolean(args.quiet);
const scenarioTimeoutMs = Number(args['scenario-timeout-ms'] || 90000);

const viewports = [
  { label: 'desktop', width: 1440, height: 1100, mobile: false },
  { label: 'tablet', width: 834, height: 1112, mobile: false },
  { label: 'mobile', width: 390, height: 844, mobile: true },
];

const scenarios = [
  { name: 'main-plate', url: '/index.html' },
  { name: 'main-tension', url: '/index.html', setup: setupMainTension },
  { name: 'standalone-plate', url: '/plate-check.html' },
  { name: 'formal-beam', url: '/steel-beam-formal.html' },
  { name: 'formal-beam-invalid', url: '/steel-beam-formal.html', setup: setupFormalBeamInvalid },
  { name: 'formal-column', url: '/steel-column-formal.html' },
  { name: 'formal-column-invalid', url: '/steel-column-formal.html', setup: setupFormalColumnInvalid },
];

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
  return /spawn EPERM|WinError 5|access is denied|Permission denied|Timed out waiting for Edge DevTools/i.test(error.message || '');
}

function formatError(error) {
  return error && (error.stack || error.message) ? (error.stack || error.message) : String(error);
}

async function launchEdgeOnce(edgePath) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steel-audit-edge-'));
  const browserArgs = [
    '--headless=new',
    '--remote-debugging-port=0',
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
    child = spawn(edgePath, browserArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    const wsUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for Edge DevTools endpoint.')), 20000);
      const inspect = chunk => {
        const text = String(chunk);
        const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      };
      child.stdout.on('data', inspect);
      child.stderr.on('data', inspect);
      child.once('error', error => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`Edge exited before DevTools endpoint was available. exitCode=${code}`));
      });
    });
    return { child, profileDir, wsUrl };
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

async function setupFormalBeamInvalid(cdp, sessionId) {
  await setupFormalInvalid(cdp, sessionId, '#beamInputStatus', 'beam inline validation');
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

async function runSnapshot(cdp, scenario, viewport) {
  const label = `${scenario.name}-${viewport.label}`;
  log(`Edge CDP snapshot [${label}] ${viewport.width}x${viewport.height}`);
  const records = { consoleErrors: [], networkAlerts: [], requestMap: new Map() };
  let targetId;
  let sessionId;
  let removeEvents = () => {};
  try {
    const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targetId = created.targetId;
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    sessionId = attached.sessionId;
    removeEvents = cdp.onEvent(message => collectPageEvent(records, message, sessionId));

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
    await wait(300);

    const snapshotText = await makeSnapshot(cdp, sessionId, label, viewport);
    const screenshotBuffer = await captureScreenshot(cdp, sessionId, viewport);
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
    removeEvents();
    if (targetId) {
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
  const records = [];
  const failures = [];
  const summaryLines = [];
  const cleanupWarnings = [];
  let browser;
  let cdp;
  try {
    browser = await launchEdge();
    cdp = new CdpConnection(browser.wsUrl);
    await cdp.open();
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
    failures,
    summaryLines,
    cleanupWarnings,
  };
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
  console.log(`steel browser runner OK (records=${records.length}, runner=edge-cdp)`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});