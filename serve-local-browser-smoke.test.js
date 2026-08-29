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

const reportReadinessPages = [
  'RC補強斷面性質.html',
  '合成斷面性質.html',
  '連續梁分析.html',
  '覆工板/index.html',
  '鋼架/平面剛架分析.html',
  '結構工具箱/tools/earth/earth-pressure.html',
  '結構工具箱/tools/equipment/equipment-load.html',
  '結構工具箱/tools/foundation/foundation-local.html',
  '結構工具箱/tools/鋼構/steel-beam.html',
  '結構工具箱/tools/鋼構/steel-column.html',
  '結構工具箱/tools/地震力/seismic-appendage.html',
  '結構工具箱/tools/地震力/seismic-dynamic.html',
  '結構工具箱/tools/地震力/seismic-force.html',
  '結構工具箱/tools/地震力/seismic-misc.html',
  '結構工具箱/tools/風力/wind-cc.html',
  '結構工具箱/tools/風力/wind-fence-sign.html',
  '結構工具箱/tools/風力/wind-force.html',
  '結構工具箱/tools/風力/wind-kzt.html',
  '結構工具箱/tools/風力/wind-lattice-tower.html',
  '結構工具箱/tools/風力/wind-object-frame.html',
  '結構工具箱/tools/風力/wind-object-solid.html',
  '結構工具箱/tools/風力/wind-object-tower.html',
  '結構工具箱/tools/風力/wind-open-roof.html',
  '結構工具箱/tools/風力/wind-parapet.html',
  '結構工具箱/tools/風力/wind-sign-pole.html',
  '結構工具箱/tools/風力/wind-special.html',
];

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

async function verifySharedReportReadinessStyles(page, base) {
  assert.equal(reportReadinessPages.length, 26, 'report-readiness browser inventory stays explicit');
  for (const route of reportReadinessPages) {
    const response = await page.goto(new URL(route, base).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert.ok(response && response.status() < 400, `${route} readiness smoke navigation`);
    await page.waitForFunction(() => Array.from(document.styleSheets)
      .some(sheet => String(sheet.href || '').endsWith('/core/report-readiness.css')));
    await page.waitForFunction(() => document.querySelector('.report-readiness'));
    if (route === '覆工板/index.html') {
      await page.locator('nav.tabs button[data-tab="report"]').click();
    }
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.report-readiness'))
      .some(node => node.getClientRects().length > 0));

    const screenState = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      const sharedSheet = sheets.find(sheet => String(sheet.href || '').endsWith('/core/report-readiness.css'));
      const nodes = Array.from(document.querySelectorAll('.report-readiness'));
      const fixture = document.createElement('div');
      fixture.className = 'report-readiness';
      fixture.setAttribute('data-readiness-style-smoke', '');
      fixture.innerHTML = `
        <div class="report-readiness-grid">
          <div class="report-readiness-item"><span>標籤 A</span><strong>值 A</strong></div>
          <div class="report-readiness-item"><strong>標籤 B</strong><span>值 B</span></div>
        </div>`;
      document.body.appendChild(fixture);
      const items = Array.from(fixture.querySelectorAll('.report-readiness-item'));
      const itemRoles = items.map(item => {
        const first = item.firstElementChild;
        const last = item.lastElementChild;
        return {
          order: `${first.tagName}:${last.tagName}`,
          firstWeight: getComputedStyle(first).fontWeight,
          lastWeight: getComputedStyle(last).fontWeight,
          firstMarginTop: getComputedStyle(first).marginTop,
          lastMarginTop: getComputedStyle(last).marginTop,
        };
      });
      fixture.remove();
      return {
        stylesheetHref: sharedSheet?.href || '',
        stylesheetRuleCount: (() => {
          try { return sharedSheet?.cssRules?.length || 0; } catch { return 0; }
        })(),
        panelCount: nodes.length,
        visiblePanelCount: nodes.filter(node => node.getClientRects().length > 0).length,
        allPanelsUseGrid: nodes.every(node => getComputedStyle(node).display === 'grid'),
        itemRoles,
      };
    });

    assert.ok(screenState.stylesheetHref.endsWith('/core/report-readiness.css'), `${route} loads shared readiness CSS`);
    assert.ok(screenState.stylesheetRuleCount > 10, `${route} shared readiness CSS rules are readable`);
    assert.ok(screenState.panelCount > 0, `${route} renders a readiness panel`);
    assert.ok(screenState.visiblePanelCount > 0, `${route} readiness panel is visible on screen`);
    assert.equal(screenState.allPanelsUseGrid, true, `${route} readiness panels use the shared grid layout`);
    assert.deepEqual(
      screenState.itemRoles.map(item => item.order),
      ['SPAN:STRONG', 'STRONG:SPAN'],
      `${route} smoke covers both readiness item markup orders`
    );
    screenState.itemRoles.forEach((item, index) => {
      assert.equal(item.firstWeight, '700', `${route} readiness item ${index + 1} first child is the label`);
      assert.equal(item.lastWeight, '800', `${route} readiness item ${index + 1} last child is the value`);
      assert.equal(item.firstMarginTop, '0px', `${route} readiness item ${index + 1} label has no value offset`);
      assert.equal(item.lastMarginTop, '2px', `${route} readiness item ${index + 1} value keeps the downward offset`);
    });

    await page.emulateMedia({ media: 'print' });
    try {
      const printState = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('.page-only-report-status'));
        return {
          count: nodes.length,
          visibleCount: nodes.filter(node => node.getClientRects().length > 0).length,
        };
      });
      assert.ok(printState.count > 0, `${route} keeps page-only readiness nodes in print DOM`);
      assert.equal(printState.visibleCount, 0, `${route} hides page-only readiness from print layout`);
    } finally {
      await page.emulateMedia({ media: 'screen' });
    }
  }
}

async function verifySectionShapeInteractions(page) {
  const tabButtons = page.locator('.tab-btn');
  assert.equal(await tabButtons.count(), 10, 'section calculator must expose all ten primary shape tabs');

  for (let index = 0; index < 10; index += 1) {
    const button = tabButtons.nth(index);
    const expectedTab = (await button.textContent()).trim();
    await button.click();
    await page.waitForFunction(tab => (
      document.querySelector('.tab-btn.active')?.textContent.trim() === tab
    ), expectedTab);

    const state = await page.evaluate(() => {
      const canvas = document.getElementById('sectionCanvas');
      const blank = document.createElement('canvas');
      blank.width = canvas.width;
      blank.height = canvas.height;
      return {
        activeTab: document.querySelector('.tab-btn.active')?.textContent.trim(),
        heading: document.querySelector('#input-panel h2')?.textContent.trim(),
        inputCount: document.querySelectorAll('#input-panel input, #input-panel select').length,
        resultCount: lastResults.length,
        renderedResultCount: document.querySelectorAll('#results .result-item').length,
        finiteResults: lastResults.length > 0 && lastResults.every(row => Number.isFinite(Number(row[1]))),
        hasDiagram: canvas.toDataURL() !== blank.toDataURL(),
      };
    });
    assert.equal(state.activeTab, expectedTab, `${expectedTab} tab must become active`);
    assert.ok(state.heading, `${expectedTab} must render its input panel`);
    assert.ok(state.inputCount > 0, `${expectedTab} must expose editable inputs`);
    assert.ok(state.resultCount > 0, `${expectedTab} must calculate default results`);
    assert.equal(state.renderedResultCount, state.resultCount, `${expectedTab} must render every calculated result`);
    assert.equal(state.finiteResults, true, `${expectedTab} default results must all be finite`);
    assert.equal(state.hasDiagram, true, `${expectedTab} must render a section diagram`);

    if (index === 0) {
      await page.locator('#h-select').selectOption({ index: 1 });
      assert.deepEqual(await page.locator('#h-H, #h-B, #h-tw, #h-tf, #h-R').evaluateAll(elements => (
        elements.map(element => element.value)
      )), ['100', '50', '5', '7', '8'], 'H-section catalogue selection must update all dimensions');
    }
  }

  await page.getByRole('button', { name: '基本幾何斷面', exact: true }).click();
  const geoSelect = page.locator('#geo-type');
  const options = await geoSelect.locator('option').evaluateAll(elements => elements.map(option => ({
    value: option.value,
    label: option.textContent.trim(),
  })));
  assert.equal(options.length, 32, 'basic geometry selector must expose all 32 section types');

  for (const option of options) {
    await geoSelect.selectOption(option.value);
    const state = await page.evaluate(() => {
      const canvas = document.getElementById('sectionCanvas');
      const blank = document.createElement('canvas');
      blank.width = canvas.width;
      blank.height = canvas.height;
      return {
        selected: document.getElementById('geo-type').value,
        inputCount: document.querySelectorAll('#geo-inputs input').length,
        resultCount: lastResults.length,
        renderedResultCount: document.querySelectorAll('#results .result-item').length,
        finiteResults: lastResults.length > 0 && lastResults.every(row => Number.isFinite(Number(row[1]))),
        visibleValuesValid: [...document.querySelectorAll('#results .result-item .value')]
          .every(element => !/(?:NaN|Infinity)/.test(element.textContent)),
        hasDiagram: canvas.toDataURL() !== blank.toDataURL(),
        diagramLabel: canvas.getAttribute('aria-label'),
        title: lastTitle,
      };
    });
    assert.equal(state.selected, option.value, `${option.label} must remain selected`);
    assert.ok(state.inputCount > 0, `${option.label} must render its input fields`);
    assert.ok(state.resultCount > 0, `${option.label} must calculate default results`);
    assert.equal(state.renderedResultCount, state.resultCount, `${option.label} must render every calculated result`);
    assert.equal(state.finiteResults, true, `${option.label} default results must all be finite`);
    assert.equal(state.visibleValuesValid, true, `${option.label} must not render NaN or Infinity`);
    assert.ok(state.title.includes(option.label), `${option.label} must update the calculation title`);
    assert.equal(state.hasDiagram, true, `${option.label} must render a section or calculation-model diagram`);
    assert.ok(state.diagramLabel, `${option.label} diagram must have an accessible label`);
    if (option.value === 'general') {
      assert.match(state.diagramLabel, /平行軸定理.*非實際比例/, `${option.label} must disclose the conceptual diagram boundary`);
      const reportPromise = page.waitForEvent('popup');
      await page.getByRole('button', { name: '📄 計算書' }).click();
      const reportPage = await reportPromise;
      await reportPage.waitForLoadState('domcontentloaded');
      const reportDiagram = await reportPage.locator('.fig img').evaluate((image) => ({
        alt: image.getAttribute('alt'),
        sourceType: image.src.split(';', 1)[0],
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      }));
      assert.match(reportDiagram.alt, /平行軸定理.*非實際比例/, `${option.label} report must preserve the diagram description`);
      assert.equal(reportDiagram.sourceType, 'data:image/png', `${option.label} report must embed the rendered diagram`);
      assert.ok(reportDiagram.naturalWidth > 0 && reportDiagram.naturalHeight > 0, `${option.label} report diagram must load`);
      await reportPage.close();
    }
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
    await verifySectionShapeInteractions(page);
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
    const readinessContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'zh-TW',
    });
    try {
      await verifySharedReportReadinessStyles(await readinessContext.newPage(), base);
      process.stdout.write(`PASS | ${reportReadinessPages.length} shared report-readiness pages\n`);
    } finally {
      await readinessContext.close();
    }
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
    console.log(`serve-local browser smoke OK (5 routes x 2 viewports; ${reportReadinessPages.length} shared readiness pages; section 10 primary + 32 geometry shapes)`);
  } finally {
    if (browser) await browser.close();
    await stopLocalServer(child);
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
