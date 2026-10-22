'use strict';
// 共用導覽頂欄冷開實測（輕量：只開 3 頁）：
//   1. 頂欄存在於靜態占位內、麵包屑三段文字、同家族清單數＝清冊同家族數−1、body data-family；
//   2. CLS：JS 開啟、桌機 1280 與手機 375 各一次，PerformanceObserver layout-shift 的 sources 不得含
//      [data-tool-chrome] 或 .tool-chrome-slot；占位高度渲染前（擋掉 tool-chrome.js）與渲染後皆 44px，nav 高度 44px；
//   3. 產生計算書後 popup 序列化 HTML 不含 tool-chrome；
//   4. print 媒體下頂欄 computed display 為 none；
//   5. axe（頂欄範圍 serious／critical 為 0；整頁 serious／critical 節點不得落在頂欄、不多於既有）；
//   6. file: 模式與 Pages 子目錄（/section-properties-calculator/）兩種載入方式皆能定位本頁；
//   --home-deep-link：另開首頁驗證 ?category=／?member= 深連結。
// 用法：node 結構工具箱/tools/nav/tool-chrome.browser.test.js [--home-deep-link] [--require-zero-page-violations]

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const repo = path.resolve(__dirname, '../../..');
const deps = path.join(repo, 'output/playwright/phase2-quality-deps/node_modules');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, '結構工具箱/tools/nav/tool-nav.manifest.json'), 'utf8'));
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const PAGES = [
  { route: '/rc-beam', report: { calculate: null, open: '#btnReport' } },
  { route: '/wind-kzt', report: null },
  { route: '/cable-tension-frequency', report: { calculate: '#btnCalc', open: '#btnPrint' } },
];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];
const NAV_HEIGHT = 44;
const SUBDIRECTORY = '/section-properties-calculator';

function waitForServer(server, timeoutMs = 20000) {
  let text = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`serve-local timed out: ${text}`)), timeoutMs);
    server.stdout.on('data', chunk => {
      text += chunk.toString('utf8');
      const match = text.match(/https?:\/\/127\.0\.0\.1:\d+\//);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', (code, signal) => { clearTimeout(timer); reject(new Error(`serve-local exited (${code}/${signal}): ${text}`)); });
  });
}

// 模擬 GitHub Pages 子目錄：把 repo 掛在 /section-properties-calculator/ 底下的最小靜態伺服器。
function startSubdirectoryServer() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (!pathname.startsWith(`${SUBDIRECTORY}/`)) { response.writeHead(404); response.end(); return; }
    const file = path.resolve(repo, ...pathname.slice(SUBDIRECTORY.length + 1).split('/'));
    if (!file.startsWith(repo) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}${SUBDIRECTORY}/` })));
}

function encodePath(file) {
  return file.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

// 在文件開始前掛 layout-shift 觀察器，記錄每筆位移的來源節點是否落在頂欄或占位內。
function layoutShiftInitScript() {
  window.__toolChromeShifts = [];
  const describe = node => {
    if (!node) return { text: '(null)', inChrome: false };
    const element = node.nodeType === 1 ? node : node.parentElement;
    const inChrome = Boolean(element && element.closest && element.closest('[data-tool-chrome],[data-tool-chrome-slot],.tool-chrome-slot'));
    const text = element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}` : node.nodeName;
    return { text, inChrome };
  };
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        window.__toolChromeShifts.push({
          value: entry.value,
          hadRecentInput: entry.hadRecentInput,
          startTime: entry.startTime,
          sources: (entry.sources || []).map(source => describe(source.node)),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (error) {
    window.__toolChromeShiftsError = String(error);
  }
}

async function readChrome(page, tool) {
  const nav = page.locator('[data-tool-chrome]');
  await nav.waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForFunction(() => {
    const slot = document.querySelector('[data-tool-chrome-slot]');
    return slot ? slot.firstElementChild?.hasAttribute('data-tool-chrome') : document.body.firstElementChild?.hasAttribute('data-tool-chrome');
  }, null, { timeout: 15000 });
  return nav.evaluate((element, expectedRoute) => {
    const slot = document.querySelector('[data-tool-chrome-slot]');
    return {
      inSlot: Boolean(slot && element.parentElement === slot && slot.children.length === 1),
      slotIsFirstChild: Boolean(slot && document.body.firstElementChild === slot),
      slotHeight: slot ? slot.getBoundingClientRect().height : null,
      slotMinHeight: slot ? slot.style.minHeight : null,
      route: element.getAttribute('data-tool-route'),
      bodyFamily: document.body.getAttribute('data-family'),
      home: element.querySelector('.tool-chrome__home')?.textContent.trim(),
      homeHref: element.querySelector('.tool-chrome__home')?.getAttribute('href'),
      family: element.querySelector('.tool-chrome__family')?.textContent.trim(),
      familyHref: element.querySelector('.tool-chrome__family')?.getAttribute('href'),
      current: element.querySelector('.tool-chrome__current')?.textContent.trim(),
      currentAriaCurrent: element.querySelector('.tool-chrome__current')?.getAttribute('aria-current'),
      siblingLinks: element.querySelectorAll('.tool-chrome__siblings li a').length,
      siblingCurrent: element.querySelectorAll('.tool-chrome__siblings li [aria-current="page"]').length,
      siblingHrefs: [...element.querySelectorAll('.tool-chrome__siblings li a')].map(link => link.getAttribute('href')),
      version: element.querySelector('.tool-chrome__version')?.textContent.trim(),
      state: element.querySelector('.tool-chrome__state')?.textContent.trim(),
      styleCount: document.head.querySelectorAll('style[data-tool-chrome-style]').length,
      position: getComputedStyle(element).position,
      height: element.getBoundingClientRect().height,
      top: element.getBoundingClientRect().top + window.scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      expectedRoute,
    };
  }, tool.route);
}

function assertChrome(label, chrome, tool) {
  const family = manifest.families.find(item => item.id === tool.family);
  const familyCount = manifest.tools.filter(item => item.family === tool.family).length;
  assert.equal(chrome.inSlot, true, `${label}: nav rendered into the static slot`);
  assert.equal(chrome.slotIsFirstChild, true, `${label}: slot is the first body child`);
  assert.equal(chrome.slotHeight, NAV_HEIGHT, `${label}: slot height after render is ${NAV_HEIGHT}px (${chrome.slotHeight})`);
  assert.equal(chrome.height, NAV_HEIGHT, `${label}: nav height is exactly ${NAV_HEIGHT}px (${chrome.height})`);
  assert.equal(chrome.top, 0, `${label}: nav starts at the top of the page`);
  assert.ok(chrome.scrollWidth <= chrome.viewportWidth, `${label}: no horizontal page overflow (${chrome.scrollWidth} > ${chrome.viewportWidth})`);
  assert.equal(chrome.route, tool.route, `${label}: nav identifies the route`);
  assert.equal(chrome.bodyFamily, tool.family, `${label}: body data-family`);
  assert.equal(chrome.home, '結構工具箱', `${label}: breadcrumb home text`);
  assert.equal(chrome.family, family.label, `${label}: breadcrumb family text`);
  assert.equal(chrome.current, tool.title, `${label}: breadcrumb current text`);
  assert.equal(chrome.currentAriaCurrent, 'page', `${label}: aria-current on current crumb`);
  assert.equal(chrome.siblingLinks, familyCount - 1, `${label}: sibling links = family count - 1`);
  assert.equal(chrome.siblingCurrent, 1, `${label}: current page marked once in sibling list`);
  assert.equal(chrome.version, tool.version, `${label}: version chip`);
  assert.equal(chrome.state, tool.stateLabel, `${label}: state chip`);
  assert.equal(chrome.styleCount, 1, `${label}: one injected style`);
  assert.notEqual(chrome.position, 'fixed', `${label}: nav never position: fixed`);
  assert.ok(chrome.homeHref && !chrome.homeHref.startsWith('/') && !/^[a-z]+:/i.test(chrome.homeHref), `${label}: home href is relative: ${chrome.homeHref}`);
  assert.ok(chrome.familyHref && !chrome.familyHref.startsWith('/') && !/^[a-z]+:/i.test(chrome.familyHref), `${label}: family href is relative: ${chrome.familyHref}`);
  for (const href of chrome.siblingHrefs) assert.ok(!href.startsWith('/') && !/^[a-z]+:/i.test(href), `${label}: sibling href is relative: ${href}`);
}

async function collectShifts(page) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(900);
  return page.evaluate(() => ({ error: window.__toolChromeShiftsError || null, shifts: window.__toolChromeShifts || [] }));
}

function summarizeShifts(shifts) {
  const unsolicited = shifts.filter(shift => !shift.hadRecentInput);
  const chrome = unsolicited.filter(shift => shift.sources.some(source => source.inChrome));
  return {
    entries: unsolicited.length,
    cls: Number(unsolicited.reduce((sum, shift) => sum + shift.value, 0).toFixed(4)),
    chromeCls: Number(chrome.reduce((sum, shift) => sum + shift.value, 0).toFixed(4)),
    chromeSources: chrome.flatMap(shift => shift.sources.filter(source => source.inChrome).map(source => source.text)),
    sources: unsolicited.flatMap(shift => shift.sources.map(source => `${source.text}${source.inChrome ? '[chrome]' : ''}`)).slice(0, 12),
  };
}

// 擋掉 tool-chrome.js 的對照載入：量占位高度（渲染前）與整頁 CLS 基準（頂欄以外的既有位移）。
async function measureSlotWithoutChrome(browser, viewport, url) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  await context.addInitScript(layoutShiftInitScript);
  const page = await context.newPage();
  await page.route(/tool-chrome\.js(?:\?.*)?$/, route => route.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const shiftReport = await collectShifts(page);
  const slot = await page.locator('[data-tool-chrome-slot]').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    children: element.children.length,
    isFirstChild: document.body.firstElementChild === element,
  }));
  await context.close();
  return { ...slot, cls: summarizeShifts(shiftReport.shifts).cls };
}

async function main() {
  const { chromium } = require(path.join(deps, 'playwright'));
  const { AxeBuilder } = require(path.join(deps, '@axe-core/playwright'));
  const edge = edgeCandidates.find(candidate => fs.existsSync(candidate));
  const withHomeDeepLink = process.argv.includes('--home-deep-link');
  const summary = { startedAt: new Date().toISOString(), pages: [], failures: [] };
  let server; let browser; let subdirectory;
  try {
    server = spawn(process.execPath, [path.join(repo, 'serve-local.js'), '0', '--no-open'], { cwd: repo, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stderr.on('data', () => {});
    const baseUrl = await waitForServer(server);
    subdirectory = await startSubdirectoryServer();
    browser = await chromium.launch({ headless: true, ...(edge ? { executablePath: edge } : {}), args: ['--no-first-run', '--no-default-browser-check'] });

    for (const spec of PAGES) {
      const tool = manifest.tools.find(item => item.route === spec.route);
      assert.ok(tool, `manifest has ${spec.route}`);
      const label = tool.route;
      const url = new URL(encodePath(tool.file), baseUrl).toString();
      const record = { route: tool.route, file: tool.file, viewports: {} };
      summary.pages.push(record);

      // 1+2. 桌機與手機：冷開、占位、CLS
      for (const viewport of VIEWPORTS) {
        const viewportLabel = `${label} (${viewport.name})`;
        const before = await measureSlotWithoutChrome(browser, viewport, url);
        assert.equal(before.height, NAV_HEIGHT, `${viewportLabel}: slot height before render is ${NAV_HEIGHT}px (${before.height})`);
        assert.equal(before.children, 0, `${viewportLabel}: slot is empty before render`);
        assert.equal(before.isFirstChild, true, `${viewportLabel}: slot is the first body child before render`);

        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        await context.addInitScript(layoutShiftInitScript);
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.stack || error.message));
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        assert.equal(response?.status(), 200, `${viewportLabel}: HTTP 200`);
        const chrome = await readChrome(page, tool);
        assertChrome(viewportLabel, chrome, tool);
        const shiftReport = await collectShifts(page);
        assert.equal(shiftReport.error, null, `${viewportLabel}: layout-shift observer installed`);
        const shifts = summarizeShifts(shiftReport.shifts);
        assert.deepEqual(shifts.chromeSources, [], `${viewportLabel}: layout shifts must not originate from the nav or its slot`);
        assert.equal(shifts.chromeCls, 0, `${viewportLabel}: nav-attributed CLS is 0`);
        assert.deepEqual(pageErrors, [], `${viewportLabel}: no page errors`);
        // 整頁 CLS 與擋掉 tool-chrome.js 的對照值只記錄供回報（既有位移來自頁面本身，逐次載入會有時序差異）。
        if (shifts.cls > before.cls + 0.02) console.warn(`warn ${viewportLabel}: page CLS ${shifts.cls} exceeds the no-chrome baseline ${before.cls}; sources ${shifts.sources.join(' ')}`);
        record.viewports[viewport.name] = { slotBefore: before.height, slotAfter: chrome.slotHeight, navHeight: chrome.height, cls: shifts.cls, clsWithoutChrome: before.cls, chromeCls: shifts.chromeCls, shiftEntries: shifts.entries, shiftSources: shifts.sources };

        if (viewport.name === 'desktop') {
          record.chrome = chrome;
          const homeStatus = (await page.request.get(new URL(chrome.homeHref, url).toString())).status();
          assert.equal(homeStatus, 200, `${label}: home link resolves`);
          record.familyLinkStatus = (await page.request.get(new URL(chrome.familyHref, url).toString())).status();
          const siblingStatuses = [];
          for (const href of chrome.siblingHrefs) siblingStatuses.push((await page.request.get(new URL(href, url).toString())).status());
          record.siblingLinkStatuses = siblingStatuses;
          assert.ok(siblingStatuses.every(status => status === 200), `${label}: sibling links resolve: ${siblingStatuses.join(',')}`);

          // 3. 計算書序列化不得含頂欄
          if (spec.report) {
            if (spec.report.calculate) await page.locator(spec.report.calculate).click();
            const popupPromise = context.waitForEvent('page', { timeout: 30000 });
            await page.locator(spec.report.open).click();
            const popup = await popupPromise;
            await popup.waitForLoadState('domcontentloaded');
            await popup.waitForFunction(() => document.body && document.body.children.length > 0, null, { timeout: 30000 });
            const html = await popup.content();
            assert.ok(html.length > 1000, `${label}: report popup has content`);
            assert.ok(!/tool-chrome/i.test(html), `${label}: serialized report must not contain tool-chrome`);
            assert.ok(!/data-tool-chrome-style|data-tool-chrome-slot/i.test(html), `${label}: serialized report must not contain the injected style or slot`);
            record.reportBytes = html.length;
            await popup.close();
          }

          // 4. 列印媒體隱藏（頂欄與占位）
          await page.emulateMedia({ media: 'print' });
          const printDisplay = await page.evaluate(() => ({
            nav: getComputedStyle(document.querySelector('[data-tool-chrome]')).display,
            slot: getComputedStyle(document.querySelector('[data-tool-chrome-slot]')).display,
          }));
          assert.equal(printDisplay.nav, 'none', `${label}: nav hidden in print media`);
          assert.equal(printDisplay.slot, 'none', `${label}: slot hidden in print media`);
          await page.emulateMedia({ media: 'screen' });
          record.printDisplay = printDisplay;

          // 5. axe：頂欄範圍 serious／critical 必須 0；整頁 serious／critical 節點不得落在頂欄內，且不多於移除頂欄後的既有數。
          const severeOf = result => result.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
          const describe = result => result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.length }));
          const axeNav = await new AxeBuilder({ page }).include('[data-tool-chrome]').analyze();
          const axePage = await new AxeBuilder({ page }).analyze();
          const severePageNodes = severeOf(axePage).reduce((sum, item) => sum + item.nodes.length, 0);
          const navTargets = severeOf(axePage).flatMap(item => item.nodes.flatMap(node => node.target.map(String))).filter(target => /tool-chrome/.test(target));
          await page.evaluate(() => { document.querySelector('[data-tool-chrome]')?.remove(); document.querySelector('style[data-tool-chrome-style]')?.remove(); });
          const axeWithout = await new AxeBuilder({ page }).analyze();
          const severeWithoutNodes = severeOf(axeWithout).reduce((sum, item) => sum + item.nodes.length, 0);
          record.axe = { navViolations: describe(axeNav), pageViolations: describe(axePage), pageSeriousCriticalNodes: severePageNodes, preExistingSeriousCriticalNodes: severeWithoutNodes };
          assert.equal(severeOf(axeNav).length, 0, `${label}: axe serious/critical inside nav: ${JSON.stringify(record.axe.navViolations)}`);
          assert.deepEqual(navTargets, [], `${label}: page-level serious/critical nodes must not touch the nav`);
          assert.ok(severePageNodes <= severeWithoutNodes, `${label}: nav adds serious/critical nodes (${severePageNodes} > ${severeWithoutNodes})`);
          if (process.argv.includes('--require-zero-page-violations')) {
            assert.equal(severePageNodes, 0, `${label}: axe serious/critical on page: ${JSON.stringify(record.axe.pageViolations)}`);
          }
        }
        await context.close();
      }

      // 6. file: 模式與 Pages 子目錄
      const fileContext = await browser.newContext();
      const filePage = await fileContext.newPage();
      await filePage.goto(pathToFileURL(path.join(repo, tool.file)).toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
      assertChrome(`${label} (file:)`, await readChrome(filePage, tool), tool);
      await filePage.goto(new URL(encodePath(tool.file), subdirectory.baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
      const subChrome = await readChrome(filePage, tool);
      assertChrome(`${label} (subdirectory)`, subChrome, tool);
      assert.equal((await filePage.request.get(new URL(subChrome.homeHref, filePage.url()).toString())).status(), 200, `${label}: subdirectory home link resolves`);
      await fileContext.close();
      const desktop = record.viewports.desktop;
      const mobile = record.viewports.mobile;
      console.log(`ok ${label}: siblings=${record.chrome.siblingLinks} familyLink=${record.familyLinkStatus} report=${record.reportBytes ?? '-'} print=${record.printDisplay.nav}/${record.printDisplay.slot} axeNav=${record.axe.navViolations.length} pageSeriousCritical=${record.axe.pageSeriousCriticalNodes} preExisting=${record.axe.preExistingSeriousCriticalNodes} | desktop slot ${desktop.slotBefore}->${desktop.slotAfter} nav ${desktop.navHeight} CLS ${desktop.cls} (no-chrome ${desktop.clsWithoutChrome}, chrome ${desktop.chromeCls}) | mobile slot ${mobile.slotBefore}->${mobile.slotAfter} nav ${mobile.navHeight} CLS ${mobile.cls} (no-chrome ${mobile.clsWithoutChrome}, chrome ${mobile.chromeCls})`);
    }

    if (withHomeDeepLink) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(new URL('結構工具箱/index.html?category=wind', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#categoryOverview .category-card[aria-pressed="true"]:not([disabled])'), null, { timeout: 15000 });
      const active = await page.locator('#categoryOverview .category-card[aria-pressed="true"]').first().innerText();
      assert.ok(active.includes('風力規範外力'), `?category=wind activates the wind filter: ${active}`);
      await page.goto(new URL('結構工具箱/index.html?member=steel', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#memberSystemTabs .member-system-tab[aria-selected="true"]'), null, { timeout: 15000 });
      const member = await page.locator('#memberSystemTabs .member-system-tab[aria-selected="true"]').innerText();
      assert.ok(member.includes('鋼構'), `?member=steel selects the steel tab: ${member}`);
      const memberFilter = await page.locator('#categoryOverview .category-card[aria-pressed="true"]').first().innerText();
      assert.ok(memberFilter.includes('構件承載力檢核'), `?member=steel also activates the member category: ${memberFilter}`);
      await page.goto(new URL('結構工具箱/index.html?category=bogus&member=nope', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#categoryOverview .category-card[aria-pressed="true"]:not([disabled])'), null, { timeout: 15000 });
      const fallback = await page.locator('#categoryOverview .category-card[aria-pressed="true"]').first().innerText();
      assert.ok(fallback.includes('全部'), `invalid deep links are ignored: ${fallback}`);
      await context.close();
      summary.homeDeepLink = { category: active, member, fallback };
      console.log('ok homepage deep links');
    }
    summary.passed = true;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (subdirectory) subdirectory.server.close();
    if (server) server.kill();
  }
  const out = path.join(repo, 'output/playwright/tool-chrome');
  fs.mkdirSync(out, { recursive: true });
  const summaryPath = path.join(out, `summary-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`tool-chrome browser test passed: ${summary.pages.length} pages (${summaryPath})`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
