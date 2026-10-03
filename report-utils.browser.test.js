'use strict';

// T2 定向瀏覽器回歸：45 入口、7 個 fmt 頁、7 份深測。序列執行，不自動重試。
// UI 可含同批 T3；report/utils/common/print 必須符合指定 T2 ref，且全程不可漂移。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const ROOT = __dirname;
// 已逐頁核對既有 API；快照源自 T3 manifest，但 T2 測試不依賴未提交的 T3 檔案。
const CALCULATION = [
  {"key":"/frame-analysis","file":"鋼架/平面剛架分析.html","resultSelector":"#storyResponseCard","calculateButton":"#btnCalc"},
  {"key":"/rc-beam","file":"鋼筋混凝土/tools/beam.html","resultSelector":"#bannerStatus","calculateFunction":"applyPanel","calculateArgument":"summary"},
  {"key":"/rc-deep-beam-stm","file":"鋼筋混凝土/tools/deep-beam-stm.html","resultSelector":"#statusBanner","calculateButton":"#btnCalc"},
  {"key":"/rc-column","file":"鋼筋混凝土/tools/column.html","resultSelector":"#bannerStatus","calculateFunction":"applyPanel","calculateArgument":"summary"},
  {"key":"/rc-slab","file":"鋼筋混凝土/tools/slab.html","resultSelector":"#bannerStatus","calculateFunction":"calcSlab"},
  {"key":"/rc-wall","file":"鋼筋混凝土/tools/wall.html","resultSelector":"#bannerStatus","calculateFunction":"applyPanel","calculateArgument":"summary"},
  {"key":"/rc-shear-wall","file":"鋼筋混凝土/tools/shear-wall.html","resultSelector":"#bannerStatus","calculateFunction":"applyPanel","calculateArgument":"summary"},
  {"key":"/rc-foundation","file":"鋼筋混凝土/tools/foundation.html","resultSelector":"#bannerStatus","calculateFunction":"calcFdtn"},
  {"key":"/rc-foundation-deep-beam-stm","file":"鋼筋混凝土/tools/foundation-deep-beam-stm.html","resultSelector":"#statusBanner","calculateButton":"#btnCalc"},
  {"key":"/rc-pile-cap-3d-stm","file":"鋼筋混凝土/tools/pile-cap-3d-stm.html","resultSelector":"#statusBanner","calculateButton":"#btnCalc"},
  {"key":"/rc-pile","file":"鋼筋混凝土/tools/single-pile-designer.html","resultSelector":"#banner","calculateButton":"#btnCalc"},
  {"key":"/rc-retrofit-section","file":"RC補強斷面性質.html","resultSelector":"#b-results, #c-results","calculateFunction":"calcBeam"},
  {"key":"/rc-column-cover-deviation","file":"結構工具箱/tools/rc/column-cover-deviation.html","resultSelector":"#bannerStatus","calculateButton":"#btnCalc"},
  {"key":"/steel-formal","file":"鋼構工具/index.html","resultSelector":"#approvalDecision","calculateButton":"#loadExampleBtn"},
  {"key":"/src-beam","file":"SRC工具/src-beam.html","resultSelector":"#resultHeadline","calculateButton":"#btnCalculate"},
  {"key":"/src-column","file":"SRC工具/src-column.html","resultSelector":"#resultHeadline","calculateButton":"#btnCalculate"},
  {"key":"/steel-beam-formal","file":"鋼構工具/steel-beam-formal.html","resultSelector":"#summaryResult","calculateButton":"#runCheckBtn"},
  {"key":"/steel-column-formal","file":"鋼構工具/steel-column-formal.html","resultSelector":"#summaryResult","calculateButton":"#runCheckBtn"},
  {"key":"/steel-plate","file":"鋼構工具/plate-check.html","resultSelector":"#approvalDecision","calculateButton":"#loadExampleBtn"},
  {"key":"/wind-force","file":"結構工具箱/tools/風力/wind-force.html","resultSelector":"#banner","calculateButton":"#btnCalc"},
  {"key":"/wind-cc","file":"結構工具箱/tools/風力/wind-cc.html","resultSelector":"#applicStatus","calculateButton":"#btnCalc"},
  {"key":"/wind-parapet","file":"結構工具箱/tools/風力/wind-parapet.html","resultSelector":"#applicStatus","calculateButton":"#btnCalc"},
  {"key":"/wind-open-roof","file":"結構工具箱/tools/風力/wind-open-roof.html","resultSelector":"#applicStatus","calculateButton":"#btnCalc"},
  {"key":"/wind-object-solid","file":"結構工具箱/tools/風力/wind-object-solid.html","resultSelector":"#resultPanel","calculateButton":"#btnCalc"},
  {"key":"/wind-object-frame","file":"結構工具箱/tools/風力/wind-object-frame.html","resultSelector":"#resultPanel","calculateButton":"#btnCalc"},
  {"key":"/wind-lattice-tower","file":"結構工具箱/tools/風力/wind-lattice-tower.html","resultSelector":"#resultPanel","calculateButton":"#btnCalc"},
  {"key":"/wind-object-tower","file":"結構工具箱/tools/風力/wind-object-tower.html","resultSelector":"#resultPanel","calculateButton":"#btnCalc"},
  {"key":"/wind-fence-sign","file":"結構工具箱/tools/風力/wind-fence-sign.html","resultSelector":"#resultPanel","calculateButton":"#btnCalc"},
  {"key":"/wind-sign-pole","file":"結構工具箱/tools/風力/wind-sign-pole.html","resultSelector":"#resultPanel","calculateButton":"#btnCalc"},
  {"key":"/seismic-force","file":"結構工具箱/tools/地震力/seismic-force.html","resultSelector":"#resultPanel","calculateButton":"#btnCalc"},
  {"key":"/seismic-appendage","file":"結構工具箱/tools/地震力/seismic-appendage.html","resultSelector":"#resultPanel","calculateButton":"#btnCalc"},
  {"key":"/seismic-misc","file":"結構工具箱/tools/地震力/seismic-misc.html","resultSelector":"#resultPanel","calculateButton":"#btnCalc"},
  {"key":"/foundation-local","file":"結構工具箱/tools/foundation/foundation-local.html","resultSelector":"#bannerStatus","calculateButton":"#btnCalc"},
  {"key":"/equipment-load","file":"結構工具箱/tools/equipment/equipment-load.html","resultSelector":"#bannerStatus","calculateButton":"#btnCalc"},
  {"key":"/earth-pressure","file":"結構工具箱/tools/earth/earth-pressure.html","resultSelector":"#bannerStatus","calculateButton":"#btnCalc"},
  {"key":"/floor-slab-westergaard","file":"結構工具箱/tools/floor-slab/floor-slab-westergaard.html","resultSelector":"#bannerStatus","calculateButton":"#btnCalc"},
  {"key":"/cable-tension-frequency","file":"結構工具箱/tools/cable-tension/cable-tension-frequency.html","resultSelector":"#bannerStatus","calculateButton":"#btnCalc"},
  {"key":"/beam-analysis","file":"連續梁分析.html","resultSelector":"#resultsCard","calculateFunction":"runAnalysis"},
];
const checker = require('./結構工具箱/tools/attachment-package-check.js');
const argument = (name, fallback = '') => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const lf = data => data.toString('utf8').replace(/\r\n/g, '\n');
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const REPORTS = ['結構工具箱/core/ui/report.js', '鋼構工具/core/ui/report.js', '鋼筋混凝土/shared/report.js'];
const FIXED = [...REPORTS, '結構工具箱/core/ui/report-utils.js', '鋼構工具/core/ui/report-utils.js', '鋼筋混凝土/shared/report-utils.js',
  '鋼筋混凝土/shared/common.js', '結構工具箱/core/direct-print-boundary.css', '鋼筋混凝土/shared/direct-print-boundary.css'];
// 來源：workflow manifest；其餘七頁的現有 inline calculate 入口，沒有猜測 selector。
const EXTRA = {
  'index.html': { key: '/section-properties', calculateFunction: 'calcHBeam', resultSelector: '#results' },
  '合成斷面性質.html': { key: '/composite-section', calculateFunction: 'calcAll', resultSelector: '#results' },
  '結構工具箱/tools/地震力/seismic-dynamic.html': { key: '/seismic-dynamic', calculateButton: '#btnCalc', resultSelector: '#banner' },
  '結構工具箱/tools/鋼構/steel-beam.html': { key: '/steel-beam-legacy', calculateFunction: 'runCheck', resultSelector: '#summaryResult' },
  '結構工具箱/tools/鋼構/steel-column.html': { key: '/steel-column-legacy', calculateFunction: 'runCheck', resultSelector: '#summaryResult' },
  '結構工具箱/tools/風力/wind-kzt.html': { key: '/wind-kzt', calculateButton: '#btnCalc', resultSelector: '#resultPanel' },
  '結構工具箱/tools/風力/wind-special.html': { key: '/wind-special', calculateButton: '#btnCalc', resultSelector: '#summary' },
};
const FORMAT_KEYS = ['/rc-beam', '/rc-column', '/rc-wall', '/rc-shear-wall', '/rc-pile', '/rc-deep-beam-stm', '/rc-foundation-deep-beam-stm'];
const DEEP_KEYS = ['/rc-beam', '/rc-wall', '/rc-pile', '/wind-object-solid', '/earth-pressure', '/steel-plate', '/steel-beam-formal'];
// earth 的既有局部報告使用 btnPrint；鋼構 app 使用 exportReportBtn。
const REPORT_BUTTONS = { '/earth-pressure': '#btnPrint', '/steel-plate': '#exportReportBtn' };
const PROJECT_READERS = { '/rc-beam': 'collectBeamProjectData', '/rc-column': 'collectColumnProjectData',
  '/rc-wall': 'collectWallProjectData', '/rc-shear-wall': 'collectShearWallProjectData', '/rc-pile': 'buildProjectPayload' };

function scripts(source, file) {
  return [...source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match =>
    path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1].split('?')[0])));
}
function inventory() {
  const list = git(['ls-files', '-z']).split('\0').filter(file => file.endsWith('.html')).map(file => {
    const refs = scripts(read(file), file).filter(ref => REPORTS.includes(ref));
    if (!refs.length) return null;
    const adapter = CALCULATION.find(tool => tool.file === file) || EXTRA[file];
    assert.ok(adapter, `需明確新增計算入口映射：${file}`);
    return { ...adapter, file, reportDependencies: refs, format: FORMAT_KEYS.includes(adapter.key), deep: DEEP_KEYS.includes(adapter.key) };
  }).filter(Boolean);
  assert.equal(list.length, 45, 'actual report.js consumers changed; review inventory before running');
  assert.equal(list.filter(tool => tool.format).length, 7);
  assert.equal(list.filter(tool => tool.deep).length, 7);
  return list;
}
function fixedState(ref) {
  return FIXED.map(file => {
    const data = fs.readFileSync(path.join(ROOT, file));
    const base = git(['show', ref === 'INDEX' ? ':' + file : ref + ':' + file]);
    const state = { file, bytes: data.length, sha256: hash(data), lfSha256: hash(lf(data)), baselineLfSha256: hash(lf(base)) };
    assert.equal(state.lfSha256, state.baselineLfSha256, `${file} 與 ${ref} 不同；不可把 T4/T5 renderer 當 T2 驗證`);
    return state;
  });
}
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function calculate(page, tool) {
  if (tool.calculateButton) await page.locator(tool.calculateButton).click();
  else {
    await page.evaluate(tool => {
      const name = tool.calculateFunction;
      if (typeof window[name] !== 'function') throw Error('缺少已登錄計算入口：' + name);
      return window[name](...('calculateArgument' in tool ? [tool.calculateArgument] : []));
    }, tool);
  }
  await settle(page);
  const result = await page.locator(tool.resultSelector).allTextContents();
  assert.ok(result.join('').trim(), `${tool.key} 計算後結果區不能空白`);
  return result.map(value => value.replace(/\s+/g, ' ').trim());
}
function guard(page, record, label, offline = false) {
  const listen = (event, callback) => page.on(event, (...args) => {
    Promise.resolve().then(() => callback(...args)).catch(error => {
      record.errors.push({ label, kind: 'event-handler', event, message: String(error.stack || error) });
    });
  });
  listen('pageerror', error => record.errors.push({ label, kind: 'pageerror', message: error.message }));
  listen('console', message => {
    if (message.type() !== 'error') return;
    const item = { label, kind: 'console', message: message.text(), location: message.location() };
    let defaultFavicon = false;
    try {
      const url = new URL(item.location.url);
      defaultFavicon = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/favicon.ico'
        && /^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/.test(item.message);
    } catch (_) { /* 缺少有效 URL 的其他 console error 仍須失敗。 */ }
    if (defaultFavicon) record.ignoredDefaultFavicon404.push(item);
    else if (offline && /Failed to load resource: net::ERR_(?:FAILED|INTERNET_DISCONNECTED|BLOCKED_BY_CLIENT)/.test(item.message)) record.expectedOfflineNetwork.push(item);
    else record.errors.push(item);
  });
  listen('dialog', async dialog => { record.errors.push({ label, kind: 'dialog', message: dialog.message() }); await dialog.dismiss(); });
  listen('requestfailed', request => {
    const item = { label, url: request.url(), failure: request.failure() };
    if (offline) record.blockedOfflineRequests.push(item);
    else if (['script', 'stylesheet'].includes(request.resourceType())) record.errors.push({ ...item, kind: 'dependency-request' });
  });
  listen('response', response => {
    if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType())) record.errors.push({ label, kind: 'dependency-http', url: response.url(), status: response.status() });
  });
}
async function instrumentReport(page) {
  // 只攔截呼叫契約，不改 cfg、工程結果或 renderer；數值比對涵蓋實際格式化呼叫點。
  await page.evaluate(() => {
    const original = window.openReport;
    if (typeof original !== 'function') throw Error('openReport 尚未載入');
    window.openReport = function (cfg) {
      const metrics = (cfg.checks || []).flatMap(group => group.items || []).map(item => ({ label: String(item.label || ''), value: String(item.value ?? '') }))
        .filter(item => /\d/.test(item.value) && item.value.length < 160);
      window.__t2CapturedReport = { fingerprint: cfg.calculationFingerprint || window.buildCalculationFingerprint(cfg), metrics };
      return original.apply(this, arguments);
    };
  });
}
async function reportState(report) {
  await report.waitForFunction(() => typeof window.serializeReportDocumentHtml === 'function');
  await settle(report);
  return report.evaluate(() => ({
    fingerprint: document.querySelector('[data-calculation-fingerprint]')?.dataset.calculationFingerprint || '',
    text: (document.querySelector('.rep-paper, .paper')?.innerText || '').replace(/\s+/g, ' ').trim(),
    title: document.querySelector('h1')?.textContent || '',
  }));
}
async function printBoundary(page, report, tool, record, output) {
  await page.emulateMedia({ media: 'print' });
  const work = await page.evaluate(() => {
    const selector = '.formal-direct-print-boundary,.local-quick-direct-print-boundary,.steel-formal-direct-print-boundary,.rc-direct-print-boundary';
    const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden';
    return { notices: [...document.querySelectorAll(selector)].filter(visible).map(node => node.textContent),
      leakedChildren: [...document.body.children].filter(node => !node.matches(selector) && visible(node)).map(node => node.id || node.tagName) };
  });
  assert.equal(work.notices.length, 1, `${tool.key} 工作頁列印須顯示單一封鎖說明`);
  assert.deepEqual(work.leakedChildren, []);
  record.directPrint = work;
  await page.screenshot({ path: path.join(output, `${record.slug}-direct-print.png`) });
  await page.emulateMedia({ media: 'screen' });
  await report.emulateMedia({ media: 'print' });
  const leaked = await report.locator('.rep-toolbar,.toolbar,.rep-approval-control,.rep-approval-meta-control,.rep-content-integrity-status,[data-page-only="true"],.page-only-report-status,[data-hy-workflow]').evaluateAll(nodes =>
    nodes.filter(node => node.getClientRects().length && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden').map(node => node.id || node.className));
  assert.deepEqual(leaked, [], `${tool.key} 計算書不得列印操作提示`);
  await report.screenshot({ path: path.join(output, `${record.slug}-report-print.png`) });
  await report.emulateMedia({ media: 'screen' });
}
async function deepCheck(browser, page, report, tool, record, output, baseUrl) {
  const before = await reportState(report);
  const [htmlDownload] = await Promise.all([report.waitForEvent('download'), report.locator('#repDownloadCurrentHtml').click()]);
  const htmlFile = path.join(output, record.slug + '.html');
  await htmlDownload.saveAs(htmlFile);
  const html = fs.readFileSync(htmlFile, 'utf8');
  const isRC = html.includes('rc-calculation-book-content-v1');
  const contentSeal = (isRC ? checker.verifyRcHtmlContentSeal : checker.verifyFormalHtmlContentSeal)(html);
  const approvalSeal = (isRC ? checker.verifyRcHtmlApprovalSeal : checker.verifyFormalHtmlApprovalSeal)(html);
  assert.equal(contentSeal.status, 'verified', JSON.stringify(contentSeal));
  assert.equal(approvalSeal.status, 'verified', JSON.stringify(approvalSeal));
  const generatedText = await report.evaluate(() => window.buildReportText());
  const [txtDownload] = await Promise.all([report.waitForEvent('download'), report.locator('#repDownloadCurrentText').click()]);
  const txtFile = path.join(output, record.slug + '.txt');
  await txtDownload.saveAs(txtFile);
  const raw = fs.readFileSync(txtFile, 'utf8');
  assert.equal(raw.charCodeAt(0), 0xfeff, 'TXT 應保留 UTF-8 BOM');
  const txt = raw.slice(1);
  assert.equal(txt, generatedText);
  const marker = '文字內容 SHA-256（非數位簽章）：';
  const offset = txt.lastIndexOf(marker);
  assert.ok(offset > 0);
  assert.equal(txt.slice(offset + marker.length).trim(), hash(txt.slice(0, offset)), '實際下載 TXT SHA-256');
  for (const line of ['文件類別：文字備查', '正式附件資格：否', '文件用途：文字備查版（不作為正式附件）']) assert.ok(txt.includes(line));
  await printBoundary(page, report, tool, record, output);
  const offline = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const offlinePage = await offline.newPage();
  guard(offlinePage, record, 'offline', true);
  const offlineUrl = new URL('/__t2_offline/' + record.slug + '.html', baseUrl).href;
  await offline.route('**/*', route => route.request().url() === offlineUrl
    ? route.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: html }) : route.abort('internetdisconnected'));
  try {
    await offlinePage.goto(offlineUrl, { waitUntil: 'load' });
    const after = await reportState(offlinePage);
    assert.equal(after.fingerprint, before.fingerprint);
    assert.equal(after.title, before.title);
    assert.equal(await offlinePage.evaluate(() => window.opener === null), true);
    assert.equal(await offlinePage.evaluate(() => window.buildReportText()), generatedText, '離線重開計算書 TXT 與下載前一致');
    await offlinePage.screenshot({ path: path.join(output, record.slug + '-offline.png') });
    record.deep = { html: path.basename(htmlFile), txt: path.basename(txtFile), contentSeal, approvalSeal,
      fingerprint: before.fingerprint, txtSha256: hash(txt), offline: true, wordOrPdfRendered: false };
  } finally { await offline.close(); }
}
async function main() {
  const all = inventory(), phase = argument('--phase', 'all'), only = argument('--only').split(',').filter(Boolean).map(key => '/' + key.replace(/^\//, ''));
  assert.ok(['all', 'load', 'fmt', 'deep'].includes(phase));
  for (const key of only) assert.ok(all.some(tool => tool.key === key), '未知工具：' + key);
  const selected = all.filter(tool => (!only.length || only.includes(tool.key)) && (phase === 'fmt' ? tool.format : phase === 'deep' ? tool.deep : true));
  if (process.argv.includes('--list')) { selected.forEach(tool => console.log(`${tool.key} | fmt=${tool.format} deep=${tool.deep} | ${tool.file}`)); return; }
  assert.ok(selected.length);
  const baselineRef = argument('--baseline-ref', 'INDEX');
  const fixed = fixedState(baselineRef);
  const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8);
  const output = path.join(ROOT, 'output/playwright/report-utils', runId);
  fs.mkdirSync(output, { recursive: true });
  const summary = { runId, phase, baselineRef, head: git(['rev-parse', 'HEAD']).trim(),
    scope: 'same worktree may contain T3 UI; fixed T2 renderer/utils/common/print hashes; no Word or rendered PDF verification',
    worktree: git(['status', '--porcelain']), fixed, selected: selected.map(tool => tool.key), cases: [], failures: [], browserExecuted: false };
  const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  save();
  let server, browser;
  try {
    let baseUrl = argument('--base-url');
    if (!baseUrl) {
      let serverText = '';
      server = spawn(process.execPath, [path.join(ROOT, 'serve-local.js'), '--no-open'], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const log = fs.createWriteStream(path.join(output, 'server.log'));
      server.stdout.on('data', data => { serverText += data; log.write(data); }); server.stderr.on('data', data => log.write(data)); server.once('close', () => log.end());
      baseUrl = await new Promise((resolve, reject) => {
        const start = Date.now(); const timer = setInterval(() => {
          const found = serverText.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
          if (found) { clearInterval(timer); resolve(found[1]); }
          else if (server.exitCode !== null || Date.now() - start > 20000) { clearInterval(timer); reject(Error('本機測試服務無法啟動')); }
        }, 100);
      });
    }
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseUrl).hostname), '僅允許本機 URL');
    const { chromium } = require('playwright');
    const edge = process.env.EDGE_PATH || ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(file => fs.existsSync(file));
    browser = await chromium.launch({ headless: true, ...(edge ? { executablePath: edge } : {}), args: ['--no-first-run', '--disable-popup-blocking'] });
    summary.browserExecuted = true;
    for (const tool of selected) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      const record = { key: tool.key, file: tool.file, slug: tool.key.slice(1), sourceSha256: hash(read(tool.file)),
        errors: [], ignoredDefaultFavicon404: [], expectedOfflineNetwork: [], blockedOfflineRequests: [], status: 'running' };
      summary.cases.push(record); save();
      const page = await context.newPage(); guard(page, record, 'page');
      context.on('page', popup => {
        try { if (popup !== page) guard(popup, record, 'report'); }
        catch (error) { record.errors.push({ label: 'report', kind: 'event-handler', event: 'page', message: String(error.stack || error) }); }
      });
      try {
        const response = await page.goto(new URL(tool.file.split('/').map(encodeURIComponent).join('/'), baseUrl + '/').href, { waitUntil: 'load', timeout: 45000 });
        assert.equal(response.status(), 200);
        await page.waitForFunction(rc => typeof window.StructReportUtils?.sha256Text === 'function' && (!rc || typeof window.RCReportUtils?.sha256Text === 'function'), tool.reportDependencies.includes('鋼筋混凝土/shared/report.js'));
        record.calculation = await calculate(page, tool);
        await page.screenshot({ path: path.join(output, record.slug + '-calculated.png') });
        const needsReport = phase !== 'load' && (tool.format || (tool.deep && phase !== 'fmt'));
        if (needsReport) {
          if (tool.format) await instrumentReport(page);
          const collector = PROJECT_READERS[tool.key];
          const sourceFingerprint = collector ? await page.evaluate(name => window[name]().calculationFingerprint, collector) : '';
          const [report] = await Promise.all([
            page.waitForEvent('popup', { timeout: 60000 }),
            page.locator(REPORT_BUTTONS[tool.key] || '#btnReport').click(),
          ]);
          await report.waitForLoadState('load');
          const state = await reportState(report);
          assert.match(state.fingerprint, /^CF-[A-F0-9]{16}$/);
          if (tool.format) {
            const captured = await page.evaluate(() => window.__t2CapturedReport);
            assert.ok(captured, '須取得實際 report config');
            assert.equal(state.fingerprint, sourceFingerprint || captured.fingerprint);
            const metrics = [...new Map(captured.metrics.map(item => [item.value, item])).values()].slice(0, 12);
            assert.ok(metrics.length >= 3, '至少三個不同工程數值');
            const reportText = state.text.replace(/\s+/g, '');
            for (const item of metrics) assert.ok(reportText.includes(item.value.replace(/\s+/g, '')), item.label + ': ' + item.value);
            record.numericReconciliation = { strategy: 'actual formatted report config values + source project fingerprint', fingerprint: state.fingerprint, metrics };
          }
          await report.screenshot({ path: path.join(output, record.slug + '-report.png') });
          if (tool.deep && phase !== 'fmt') await deepCheck(browser, page, report, tool, record, output, baseUrl);
        }
        assert.deepEqual(record.errors, [], '頁面／報告 console 或依賴錯誤');
        record.status = 'passed';
      } catch (error) {
        record.status = 'failed'; record.failure = String(error.stack || error);
        summary.failures.push({ key: tool.key, error: record.failure });
        await page.screenshot({ path: path.join(output, record.slug + '-failure.png') }).catch(() => {});
      } finally {
        await context.tracing.stop({ path: path.join(output, record.slug + '-trace.zip') });
        await context.close(); save();
      }
    }
    for (const initial of fixed) assert.equal(hash(fs.readFileSync(path.join(ROOT, initial.file))), initial.sha256, '測試中 T2 固定檔案漂移：' + initial.file);
  } catch (error) { summary.failures.push({ fatal: String(error.stack || error) }); }
  finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null) server.kill();
    summary.finishedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ output, cases: summary.cases.length, failed: summary.failures.length, browserExecuted: summary.browserExecuted }));
    if (summary.failures.length) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
