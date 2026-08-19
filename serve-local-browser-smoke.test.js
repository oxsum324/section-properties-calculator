'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = __dirname;
const serverPath = path.join(repoRoot, 'serve-local.js');
const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function browserLaunchOptions() {
  const executablePath = browserCandidates.find(file => fs.existsSync(file));
  return executablePath ? { executablePath } : {};
}

function startLocalServer() {
  const child = spawn(process.execPath, [serverPath, '--no-open'], {
    cwd: repoRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`serve-local startup timed out\n${output}`)), 10000);
    const consume = chunk => {
      output += chunk.toString('utf8');
      const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+\/)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    };
    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`serve-local exited before startup (${code})\n${output}`));
    });
  });
  return { child, ready };
}

async function stopLocalServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function verifyRoute(page, base, route, verify) {
  const origin = new URL(base).origin;
  const failures = [];
  const isLocal = value => {
    try { return new URL(value).origin === origin; } catch { return false; }
  };
  const isIgnoredBrowserProbe = value => {
    try { return new URL(value).pathname === '/favicon.ico'; } catch { return false; }
  };
  const onConsole = message => {
    if (message.type() !== 'error') return;
    const location = message.location()?.url || '';
    if ((!location || isLocal(location)) && !isIgnoredBrowserProbe(location)) {
      failures.push(`console ${location || '(no URL)'}: ${message.text()}`);
    }
  };
  const onPageError = error => failures.push(`page: ${error.message || String(error)}`);
  const onRequestFailed = request => {
    if (isLocal(request.url()) && !isIgnoredBrowserProbe(request.url())) {
      failures.push(`request: ${request.url()} ${request.failure()?.errorText || ''}`);
    }
  };
  const onResponse = response => {
    if (isLocal(response.url()) && !isIgnoredBrowserProbe(response.url()) && response.status() >= 400) {
      failures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);
  try {
    const response = await page.goto(new URL(route, base).href, { waitUntil: 'networkidle', timeout: 30000 });
    assert.ok(response && response.status() < 400, `${route} navigation must succeed`);
    await verify();
    await page.waitForTimeout(100);
    assert.deepEqual(failures, [], `${route} must not produce local browser failures`);
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('requestfailed', onRequestFailed);
    page.off('response', onResponse);
  }
}

async function exerciseEntrypoints(page, base) {
  await verifyRoute(page, base, 'steel-formal/', async () => {
    await page.waitForFunction(() => document.title === '鋼構連接板正式規範核算工具 V1.0');
    assert.equal(decodeURIComponent(new URL(page.url()).pathname), '/鋼構工具/');
    assert.ok(await page.locator('#examplePresetSelect option').count() > 1, 'steel presets require app.js');
  });

  await verifyRoute(page, base, 'rc/', async () => {
    assert.equal(decodeURIComponent(new URL(page.url()).pathname), '/鋼筋混凝土/');
    await page.locator('a[href="tools/beam.html"]').click();
    await page.waitForLoadState('networkidle');
    assert.equal(decodeURIComponent(new URL(page.url()).pathname), '/鋼筋混凝土/tools/beam.html');
    assert.match(await page.title(), /梁設計 — RC 工具箱 V3\.1/);
  });

  await verifyRoute(page, base, 'section/?pickI=1', async () => {
    assert.equal(decodeURIComponent(new URL(page.url()).pathname), '/section');
    assert.equal(new URL(page.url()).search, '?pickI=1');
    await page.getByRole('button', { name: '圓管', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.tab-btn.active')?.textContent.trim() === '圓管');
  });

  // Keep the real directory route stable; /anchor must redirect here without a loop.
  await verifyRoute(page, base, 'anchor/', async () => {
    assert.equal(decodeURIComponent(new URL(page.url()).pathname), '/anchor/');
    assert.match(await page.title(), /錨栓檢討工具/);
    await page.getByRole('button', { name: /開始檢核/ }).waitFor({ state: 'visible' });
  });

  await verifyRoute(page, base, `${encodeURIComponent('結構工具箱')}/audit-dashboard.html?audit_scope=local`, async () => {
    await page.waitForFunction(() => (
      document.body?.dataset.auditScope === 'local'
      && document.getElementById('loadedAt')?.textContent !== '尚未載入'
    ));
    const optionalResponses = await page.evaluate(async () => Promise.all([
      '../pages-deployment.json',
      '../output/audit/gsm-lifecycle-monitor-status.json',
      '../output/audit/gsm-lifecycle-monitor-history.json',
      '../output/audit/gsm-lifecycle-monitor-task-status.json',
    ].map(async url => {
      const response = await fetch(url, { cache: 'no-store' });
      return {
        status: response.status,
        marker: response.headers.get('x-local-optional-resource'),
        payload: await response.json(),
      };
    })));
    assert.ok(optionalResponses.every(item => (
      item.status === 200 && item.marker === 'missing' && item.payload === null
    )), 'dashboard optional JSON fallbacks must be explicit null responses');
  });

  const unknownResponse = await page.context().request.get(new URL('missing-required-resource.json', base).href);
  assert.equal(unknownResponse.status(), 404, 'unknown missing resources must remain visible as 404');
}

async function main() {
  const { child, ready } = startLocalServer();
  let browser;
  try {
    const base = await ready;
    browser = await chromium.launch({ headless: true, ...browserLaunchOptions() });
    for (const viewport of [
      { name: 'desktop', width: 1280, height: 800 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: 'zh-TW',
      });
      const page = await context.newPage();
      await exerciseEntrypoints(page, base);
      await context.close();
      process.stdout.write(`PASS | ${viewport.name} local entrypoints\n`);
    }
    console.log('serve-local browser smoke OK (5 routes x 2 viewports)');
  } finally {
    if (browser) await browser.close();
    await stopLocalServer(child);
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
