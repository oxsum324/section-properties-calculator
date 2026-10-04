'use strict';
// T5：只在本機序列執行。實際下載 DOCX，再由獨立 OpenXML 讀取器核對來源 DOM。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const ROOT = __dirname;
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 2000000;
const BOUNDARY = ['文件類別：文字備查', '正式附件資格：否', '文件用途：文字備查版（不作為正式附件）'];
const RC_PROJECT = { projectName: '臺灣地區公共設施耐震補強與鋼筋混凝土梁構件詳細設計暨施工品質整合審查示範工程', projectNo: 'DOCX-QA', designer: 'QA' };
// T9 四案固定由實際工具頁產生；不以 selector 猜測或任意更換計算入口。
const CASES = [
  { key: 'rc-beam', file: '鋼筋混凝土/tools/beam.html', calculate: 'applyPanel', argument: 'summary', report: '#btnReport', paper: '.rep-paper' },
  { key: 'steel-beam-formal', file: '鋼構工具/steel-beam-formal.html', sourceFiles: ['鋼構工具/steel-beam-formal.js'], button: '#runCheckBtn', report: '#btnReport', paper: '.rep-paper, .paper' },
  { key: 'wind-force', file: '結構工具箱/tools/風力/wind-force.html', button: '#btnCalc', report: '.btn-print', paper: '.rep-paper, .paper' },
  { key: 'earth-pressure', file: '結構工具箱/tools/earth/earth-pressure.html', button: '#btnCalc', report: '#btnPrint', paper: '.paper' },
];
const RUNTIME = '石材固定/vendor/package/dist/index.iife.js';
const SOURCES = ['結構工具箱/core/ui/report-docx.js', '結構工具箱/core/ui/report.js', '鋼筋混凝土/shared/report.js', '鋼構工具/core/ui/report.js', RUNTIME, ...CASES.flatMap(item => [item.file, ...(item.sourceFiles || [])])];
const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? '' : process.argv[index + 1] || ''; };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const compact = value => String(value || '').replace(/\s+/g, '');
function sourceHashes() { return SOURCES.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(ROOT, file))) })); }

// 此函數在來源報告視窗執行，保留可見文字而排除明確的操作控制項與圖形。
function sourceInventory() {
  const paper = document.querySelector('.rep-paper, .paper');
  if (!paper) throw Error('來源計算書內容不存在');
  const ui = 'script,style,noscript,button,input,select,textarea,.rep-toolbar,.toolbar,.rep-approval-control,.rep-approval-meta-control,.rep-download-control,.rep-window-status,.rep-document-status-line,.rep-content-integrity-status,.rep-content-integrity-alert,[data-page-only="true"],mjx-assistive-mml';
  function excluded(node) {
    for (let p = node.nodeType === 1 ? node : node.parentElement; p && p !== paper.parentElement; p = p.parentElement) {
      if (p.matches(ui) || [...p.classList].some(name => name.startsWith('page-only-')) || p.hidden) return true;
      const style = getComputedStyle(p);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    }
    return false;
  }
  function words(node, root = node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1 || excluded(node) || node.matches('img,svg,canvas') || (node !== root && node.tagName === 'TABLE')) return '';
    return [...node.childNodes].map(child => words(child, root)).join('');
  }
  const tables = [...paper.querySelectorAll('table')].filter(node => !excluded(node)).map(table => ({
    caption: table.caption ? words(table.caption) : '',
    className: String(table.className || ''),
    sectionHeading: (table.closest('.rep-block, .block')?.querySelector('h3, h4') || {}).textContent || '',
    headerRows: table.tHead ? table.tHead.rows.length : (table.rows[0] && [...table.rows[0].cells].every(cell => cell.tagName === 'TH') ? 1 : 0),
    rows: [...table.rows].filter(row => row.closest('table') === table && !excluded(row)).map(row => [...row.cells].filter(cell => !excluded(cell)).map(cell => ({ text: words(cell), colSpan: cell.colSpan, rowSpan: cell.rowSpan })))
  }));
  const images = [...paper.querySelectorAll('svg,img,canvas')].filter(node => !excluded(node) && !node.parentElement.closest('svg')).map(node => ({ tag: node.tagName, label: node.getAttribute('aria-label') || node.getAttribute('alt') || '', width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
  return { tables, images, sourceStatus: document.querySelector('.rep-document-status-line')?.dataset.documentClass || '', paperClass: paper.className };
}

async function inspectDocx(file, inventory, directory) {
  const JSZip = require('./螺栓檢討/bolt-review-tool/node_modules/jszip');
  const { JSDOM } = require('./螺栓檢討/bolt-review-tool/node_modules/jsdom');
  const checker = require('./結構工具箱/tools/attachment-package-check.js');
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.length <= MAX_BYTES && bytes.length > 0, 'DOCX 必須小於等於 2 MB');
  assert.equal(bytes.subarray(0, 2).toString(), 'PK', '必須是 ZIP 格式 DOCX，不能是改副檔名的 HTML');
  const zip = await JSZip.loadAsync(bytes);
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const xml = new JSDOM(await zip.file('word/document.xml').async('string'), { contentType: 'application/xml' });
  const doc = xml.window.document;
  const own = (node, name) => [...node.children].filter(child => child.namespaceURI === W && child.localName === name);
  function cellText(node, top = node) {
    if (node !== top && node.localName === 'tbl') return '';
    if (node.localName === 'drawing' || node.localName === 'pict') return '';
    if (node.localName === 'r' && node.getElementsByTagNameNS(W, 'vanish').length) return '';
    if (node.localName === 't') return node.textContent;
    return [...node.children].map(child => cellText(child, top)).join('');
  }
  const tables = [...doc.getElementsByTagNameNS(W, 'tbl')];
  assert.equal(tables.length, inventory.tables.length, '來源 HTML 與 DOCX 表格數');
  let rows = 0, cells = 0;
  tables.forEach((table, index) => {
    const actualRows = own(table, 'tr'), source = inventory.tables[index];
    assert.equal(actualRows.length, source.rows.length, `表 ${index + 1} 列數`); rows += actualRows.length;
    actualRows.forEach((row, rowIndex) => {
      const actualCells = own(row, 'tc').filter(cell => {
        const merge = own(cell, 'tcPr')[0]?.getElementsByTagNameNS(W, 'vMerge')[0];
        return !merge || merge.getAttributeNS(W, 'val') === 'restart';
      });
      assert.equal(actualCells.length, source.rows[rowIndex].length, `表 ${index + 1} 列 ${rowIndex + 1} 原始儲存格數`);
      actualCells.forEach((cell, cellIndex) => {
        assert.equal(compact(cellText(cell)), compact(source.rows[rowIndex][cellIndex].text), `表 ${index + 1} 列 ${rowIndex + 1} 格 ${cellIndex + 1} 可見文字與數值`);
        cells++;
      });
    });
  });
  const visibleText = [...doc.getElementsByTagNameNS(W, 't')].map(node => node.textContent).join('');
  for (const value of Object.values(inventory.projectMetadata || {})) assert.ok(compact(visibleText).includes(compact(value)), '來源計畫資訊必須完整保留：' + value);
  for (const text of BOUNDARY) assert.ok(visibleText.includes(text), text);
  assert.ok(!visibleText.includes('DOCX_QA_PAGE_ONLY_SENTINEL') && !visibleText.includes('DOCX_QA_CONTROL_SENTINEL'), '操作控制項與 page-only 不得進入 DOCX');
  const size = doc.getElementsByTagNameNS(W, 'pgSz')[0];
  assert.equal(Number(size?.getAttributeNS(W, 'w')), 11906); assert.equal(Number(size?.getAttributeNS(W, 'h')), 16838);
  const footerFiles = Object.keys(zip.files).filter(name => /^word\/footer\d+\.xml$/.test(name));
  assert.ok(footerFiles.length > 0, '需有 Word 頁尾');
  const footers = await Promise.all(footerFiles.map(name => zip.file(name).async('string')));
  const footerXml = footers.join('');
  assert.match(footerXml, />\s*PAGE\s*</); assert.match(footerXml, />\s*NUMPAGES\s*</);
  assert.ok(footerXml.includes('文字備查') && footerXml.includes('不作為正式附件'));
  const images = [];
  const drawingCount = doc.getElementsByTagNameNS(W, 'drawing').length;
  assert.equal(drawingCount, inventory.images.length, '每個來源圖像都必須轉成內嵌圖像');
  for (const name of Object.keys(zip.files).filter(name => /^word\/media\/[^/]+$/.test(name) && !zip.files[name].dir)) {
    const png = await zip.file(name).async('nodebuffer');
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), name + ' 必須是 PNG');
    const filename = path.basename(file, '.docx') + '-' + path.basename(name);
    fs.writeFileSync(path.join(directory, filename), png);
    images.push({ file: filename, sha256: sha(png), bytes: png.length, width: png.readUInt32BE(16), height: png.readUInt32BE(20) });
  }
  for (const name of Object.keys(zip.files).filter(name => name.endsWith('.rels'))) {
    const rels = new JSDOM(await zip.file(name).async('string'), { contentType: 'application/xml' });
    for (const rel of rels.window.document.documentElement.children) {
      if (!/\/image$/.test(rel.getAttribute('Type') || '')) continue;
      assert.notEqual(rel.getAttribute('TargetMode'), 'External', name + ' 不可有外連圖片');
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(path.posix.dirname(name)), rel.getAttribute('Target')));
      assert.ok(zip.file(target), '圖片 relationship 必須解析到 ZIP 內檔案：' + target);
    }
    rels.window.close();
  }
  const inspected = checker.inspectAttachment(file, directory);
  const analysis = checker.analyzePackage([inspected]);
  assert.deepEqual(inspected.errors, [], '附件檢查器須實際讀取 DOCX');
  assert.ok(inspected.nonFormalReferenceNeedles.length > 0, '非正式邊界須被附件檢查器辨識');
  assert.equal(analysis.status, 'blocked');
  assert.ok(analysis.issues.some(issue => issue.code === 'non-formal-reference-text'));
  fs.writeFileSync(path.join(directory, path.basename(file, '.docx') + '-attachment-check.json'), JSON.stringify({ inspected, analysis }, null, 2));
  xml.window.close();
  return { bytes: bytes.length, sha256: sha(bytes), tables: tables.length, rows, cells, drawings: drawingCount, images, sourceStatus: inventory.sourceStatus, attachmentStatus: analysis.status };
}

async function textDownload(page, file) {
  const generated = await page.evaluate(() => window.buildReportText());
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#repDownloadCurrentText').click()]);
  await download.saveAs(file);
  const raw = fs.readFileSync(file, 'utf8'); assert.equal(raw.charCodeAt(0), 0xfeff, 'TXT 必須保留 UTF-8 BOM');
  const text = raw.slice(1); assert.equal(text, generated, '下載 TXT 與同頁公開 API 相同');
  const marker = '文字內容 SHA-256（非數位簽章）：', index = text.lastIndexOf(marker);
  assert.ok(index > 0); assert.equal(text.slice(index + marker.length).trim(), sha(text.slice(0, index)), '下載 TXT 內容 SHA-256');
  for (const line of BOUNDARY) assert.ok(text.includes(line), line);
  return { text, sha256: sha(text), file: path.basename(file) };
}
async function verifyHtmlRegression(browser, report, html, file, output, origin) {
  const checker = require('./結構工具箱/tools/attachment-package-check.js');
  const rc = html.includes('rc-calculation-book-content-v1');
  const contentSeal = (rc ? checker.verifyRcHtmlContentSeal : checker.verifyFormalHtmlContentSeal)(html);
  const approvalSeal = (rc ? checker.verifyRcHtmlApprovalSeal : checker.verifyFormalHtmlApprovalSeal)(html);
  assert.equal(contentSeal.status, 'verified', 'HTML content seal：' + JSON.stringify(contentSeal));
  assert.equal(approvalSeal.status, 'verified', 'HTML approval seal：' + JSON.stringify(approvalSeal));
  const text = await textDownload(report, path.join(output, file + '-source.txt'));
  const identity = await report.evaluate(() => ({ title: document.querySelector('h1')?.textContent || '', fingerprint: document.querySelector('[data-calculation-fingerprint]')?.dataset.calculationFingerprint || '' }));
  const offline = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  await offline.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await offline.newPage(), errors = [], blockedRequests = [], consoleMessages = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleMessages.push(message.text()); });
  const offlineUrl = new URL('/__t5_offline/' + file + '.html', origin).href;
  await offline.route('**/*', route => {
    if (route.request().url() === offlineUrl) return route.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: html });
    blockedRequests.push(route.request().url()); return route.abort('internetdisconnected');
  });
  const evidence = { contentSeal, approvalSeal, identity, txtSha256: text.sha256, blockedRequests, consoleMessages, errors };
  try {
    await page.goto(offlineUrl, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.buildReportText === 'function');
    assert.equal(await page.evaluate(() => window.opener === null), true, '離線重開不可依賴 opener');
    const after = await page.evaluate(() => ({ title: document.querySelector('h1')?.textContent || '', fingerprint: document.querySelector('[data-calculation-fingerprint]')?.dataset.calculationFingerprint || '' }));
    assert.deepEqual(after, identity, '離線 HTML 標題與計算指紋不變');
    const offlineText = await textDownload(page, path.join(output, file + '-offline.txt'));
    assert.equal(offlineText.text, text.text, '無 opener 且全依賴斷網後 TXT 逐字一致');
    assert.equal(offlineText.sha256, text.sha256);
    await page.screenshot({ path: path.join(output, file + '-offline-screen.png'), fullPage: true });
    await page.emulateMedia({ media: 'print' });
    const print = await page.evaluate(() => {
      const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden';
      const controls = '.rep-toolbar,.toolbar,.rep-approval-control,.rep-approval-meta-control,.rep-content-integrity-status,[data-page-only="true"],.page-only-report-status,[data-hy-workflow],button,input,select,textarea';
      const paper = document.querySelector('.rep-paper, .paper');
      return { paperVisible: !!paper && visible(paper), leaks: [...document.querySelectorAll(controls)].filter(visible).map(node => node.id || node.className || node.tagName) };
    });
    assert.equal(print.paperVisible, true, '離線列印必須保留報告內容'); assert.deepEqual(print.leaks, [], '離線列印不能出現操作控制項');
    await page.screenshot({ path: path.join(output, file + '-offline-print.png'), fullPage: true });
    assert.deepEqual(errors, [], '離線 HTML 不得有 JS 執行錯誤');
    assert.ok(!blockedRequests.some(url => decodeURIComponent(url).includes(RUNTIME)), '離線 HTML 初始載入也不可嘗試載入 DOCX runtime');
    evidence.print = print; evidence.opener = null; evidence.offlineTextSha256 = offlineText.sha256;
  } catch (error) {
    evidence.failure = String(error.stack || error); throw error;
  } finally {
    fs.writeFileSync(path.join(output, file + '-html-regression.json'), JSON.stringify(evidence, null, 2));
    await offline.tracing.stop({ path: path.join(output, file + '-offline-trace.zip') }); await offline.close();
  }
  return evidence;
}
async function saveSource(report, file, output, options) {
  const inventory = await report.evaluate(sourceInventory);
  if (options.projectMetadata) inventory.projectMetadata = options.projectMetadata;
  fs.writeFileSync(path.join(output, file + '-source-inventory.json'), JSON.stringify(inventory, null, 2));
  fs.writeFileSync(path.join(output, file + '-source-dom.html'), await report.content());
  const [download] = await Promise.all([report.waitForEvent('download'), report.locator('#repDownloadCurrentHtml').click()]);
  const portable = path.join(output, file + '-source-portable.html'); await download.saveAs(portable);
  inventory.htmlRegression = await verifyHtmlRegression(options.browser, report, fs.readFileSync(portable, 'utf8'), file, output, options.origin);
  return inventory;
}
async function wordDownload(report, name, inventory, output) {
  const [download] = await Promise.all([report.waitForEvent('download', { timeout: 90000 }), report.locator('#repDownloadCurrentWord').click()]);
  assert.match(download.suggestedFilename(), /\.docx$/i);
  const file = path.join(output, name + '.docx'); await download.saveAs(file);
  const result = await inspectDocx(file, inventory, output);
  const api = await report.evaluate(async () => { const { blob, stats, mimeType } = await window.buildReportDocx(); return { bytes: blob.size, stats, mimeType }; });
  assert.equal(api.mimeType, MIME); assert.ok(api.bytes <= MAX_BYTES);
  assert.equal(api.stats.tables, result.tables); assert.equal(api.stats.rows, result.rows); assert.equal(api.stats.cells, result.cells); assert.equal(api.stats.images, result.drawings);
  return { ...result, suggestedFilename: download.suggestedFilename(), api };
}

async function prepareCalculationSource(page, tool, projectMetadata = RC_PROJECT) {
  if (tool.key === 'rc-beam') {
    await page.locator('#projName').fill(projectMetadata.projectName);
    await page.locator('#projNo').fill(projectMetadata.projectNo);
    await page.locator('#projDesigner').fill(projectMetadata.designer);
    await page.locator('#projDesigner').blur();
  }
  if (tool.button) await page.locator(tool.button).click();
  else await page.evaluate(tool => window[tool.calculate](tool.argument), tool);
  if (tool.key !== 'rc-beam') return null;
  // collectBeamProjectData 會重算；既有 CF 包含依分頁產生的 summary.banner。
  // 先切換至本次計算入口，再保存將交給報告的實際來源，不能保存 geom 舊快照。
  const snapshot = await page.evaluate(() => window.collectBeamProjectData());
  assert.deepEqual(snapshot.metadata, projectMetadata);
  assert.equal(snapshot.activeTab, tool.argument);
  return snapshot;
}

// RC document.open/write 的 popup 可被 Chromium 回報為 opener URL；Playwright 的
// Frame 對照可能漏發 request/route callback。其 Network 在 popup target，
// document.write 繼承的 Fetch loader 則在 opener；兩個 session 必須分開。
async function createCdpReportNetworkProbe(context, report, record, requestOwner = report) {
  const session = await context.newCDPSession(report);
  let fetchSession = session;
  try { if (requestOwner !== report) fetchSession = await context.newCDPSession(requestOwner); }
  catch (error) { await session.detach(); throw error; }
  const requests = new Map(), pending = [], active = new Set(), listeners = [];
  const events = record.runtimeNetworkEvents = [];
  const runtimeUrl = url => decodeURIComponent(new URL(url).pathname).endsWith('/' + RUNTIME);
  const observedUrl = url => runtimeUrl(url) || new URL(url).pathname.endsWith('/__docx_qa_missing__.png');
  const note = (kind, data = {}) => events.push({ kind, at: new Date().toISOString(), ...data });
  note('probe-targets', { networkTarget: 'report-popup', fetchTarget: requestOwner === report ? 'report-popup' : 'report-opener' });
  function listen(name, callback) { session.on(name, callback); listeners.push([name, callback]); }
  listen('Network.requestWillBeSent', event => {
    if (!observedUrl(event.request.url)) return;
    requests.set(event.requestId, event.request.url);
    if (runtimeUrl(event.request.url)) record.runtimeRequests.push(event.request.url);
    note('request', { requestId: event.requestId, url: event.request.url, frameId: event.frameId, documentURL: event.documentURL });
  });
  listen('Network.responseReceived', event => {
    if (requests.has(event.requestId)) note('response', { requestId: event.requestId, status: event.response.status, fromDiskCache: event.response.fromDiskCache });
  });
  listen('Network.loadingFailed', event => {
    if (requests.has(event.requestId)) note('network-failed', { requestId: event.requestId, errorText: event.errorText, canceled: event.canceled });
  });
  listen('Network.loadingFinished', event => {
    if (!requests.has(event.requestId) || !runtimeUrl(requests.get(event.requestId))) return;
    pending.push(session.send('Network.getResponseBody', { requestId: event.requestId }).then(result => {
      const bytes = Buffer.from(result.body, result.base64Encoded ? 'base64' : 'utf8');
      note('response-body', { requestId: event.requestId, bytes: bytes.length, sha256: sha(bytes) });
    }).catch(error => note('response-body-error', { requestId: event.requestId, message: error.message })));
  });
  try { await session.send('Network.enable'); }
  catch (error) {
    try { if (fetchSession !== session) await fetchSession.detach(); }
    finally { await session.detach(); }
    throw error;
  }
  return {
    events,
    async flush() { await Promise.all(pending); },
    async injectFailure(urlPattern) {
      const paused = new Map(), failures = [], errors = [];
      let released = false, closed = false, resolvePause;
      const firstPause = new Promise(resolve => { resolvePause = resolve; });
      function fail(event) {
        if (!paused.delete(event.requestId)) return;
        const task = fetchSession.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' })
          .then(() => note('fail-request', { fetchRequestId: event.requestId, networkId: event.networkId, url: event.request.url }))
          .catch(error => { errors.push(error); note('fail-request-error', { message: error.message }); });
        failures.push(task);
      }
      const onPaused = event => {
        paused.set(event.requestId, event);
        note('fetch-paused', { fetchRequestId: event.requestId, networkId: event.networkId, url: event.request.url });
        resolvePause(event);
        if (released) fail(event);
      };
      const injection = {
        async waitForPause(timeout = 5000) {
          let timer;
          try { return await Promise.race([firstPause, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('CDP 故障注入未攔到實際請求：' + urlPattern)), timeout); })]); }
          finally { clearTimeout(timer); }
        },
        async release() {
          released = true;
          for (const event of [...paused.values()]) fail(event);
          await Promise.all(failures);
          if (errors.length) throw errors[0];
        },
        async close() {
          if (closed) return; closed = true;
          try { await this.release(); }
          finally {
            try { await fetchSession.send('Fetch.disable'); }
            finally { fetchSession.off('Fetch.requestPaused', onPaused); active.delete(injection); }
          }
        }
      };
      fetchSession.on('Fetch.requestPaused', onPaused);
      active.add(injection);
      try { await fetchSession.send('Fetch.enable', { patterns: [{ urlPattern, requestStage: 'Request' }] }); }
      catch (error) { await injection.close(); throw error; }
      return injection;
    },
    async close() {
      try { for (const injection of [...active]) await injection.close(); await Promise.all(pending); }
      finally {
        for (const [name, callback] of listeners) session.off(name, callback);
        try { if (fetchSession !== session) await fetchSession.detach(); }
        finally { await session.detach(); }
      }
    }
  };
}

async function main() {
  if (process.argv.includes('--list')) { CASES.forEach(item => console.log(`${item.key} | ${item.file}`)); return; }
  const only = arg('--only').split(',').map(value => value.trim().replace(/^\//, '')).filter(Boolean);
  if (only.some(key => !CASES.some(item => item.key === key))) throw Error('未知 T5 工具入口');
  const selected = CASES.filter(item => !only.length || only.includes(item.key));
  const output = path.join(ROOT, 'output/playwright/report-docx', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8));
  fs.mkdirSync(output, { recursive: true });
  const summary = { started: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), selected: selected.map(item => item.key), sources: sourceHashes(), cases: [], failures: [] };
  const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2)); save();
  let server, browser;
  try {
    let baseUrl = arg('--base-url');
    if (!baseUrl) {
      server = spawn(process.execPath, [path.join(ROOT, 'serve-local.js'), '--no-open'], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let serverText = ''; const log = fs.createWriteStream(path.join(output, 'server.log'));
      server.stdout.on('data', data => { serverText += data; log.write(data); }); server.stderr.on('data', data => log.write(data)); server.on('close', () => log.end());
      baseUrl = await new Promise((resolve, reject) => {
        const started = Date.now(), timer = setInterval(() => {
          const match = serverText.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
          if (match) { clearInterval(timer); resolve(match[1]); }
          else if (server.exitCode !== null || Date.now() - started > 20000) { clearInterval(timer); reject(Error('本機伺服器未啟動')); }
        }, 100);
      });
    }
    const origin = new URL(baseUrl); if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw Error('僅允許本機來源');
    const { chromium } = require('playwright');
    const edge = process.env.EDGE_PATH || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(file => fs.existsSync(file));
    browser = await chromium.launch({ headless: true, ...(edge ? { executablePath: edge } : {}), args: ['--no-first-run', '--disable-popup-blocking'] });
    for (const tool of selected) {
      const record = { key: tool.key, scenario: '工具實際產生的示範報告', errors: [], consoleErrors: [], runtimeRequests: [], expectedFailures: [], checks: [] };
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      let report, cdpProbe;
      context.on('page', page => {
        page.on('pageerror', error => record.errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') record.consoleErrors.push({ message: message.text(), location: message.location() }); });
      });
      context.on('request', request => {
        if (!decodeURIComponent(new URL(request.url()).pathname).endsWith('/' + RUNTIME)) return;
        if (tool.key === 'rc-beam' && report) (record.playwrightRuntimeRequests ||= []).push(request.url());
        else record.runtimeRequests.push(request.url());
      });
      try {
        const page = await context.newPage();
        await page.goto(new URL(tool.file.split('/').map(encodeURIComponent).join('/'), origin.origin + '/').href, { waitUntil: 'networkidle' });
        const snapshot = await prepareCalculationSource(page, tool);
        if (snapshot) {
          record.projectMetadata = snapshot.metadata;
          record.projectSnapshot = { file: tool.key + '-source-project.json', sha256: sha(JSON.stringify(snapshot, null, 2)), calculationFingerprint: snapshot.calculationFingerprint };
          fs.writeFileSync(path.join(output, record.projectSnapshot.file), JSON.stringify(snapshot, null, 2));
        }
        [report] = await Promise.all([page.waitForEvent('popup', { timeout: 60000 }), page.locator(tool.report).click()]);
        if (tool.key === 'rc-beam') cdpProbe = await createCdpReportNetworkProbe(context, report, record, page);
        await report.waitForFunction(() => typeof window.buildReportDocx === 'function' && typeof window.serializeReportDocumentHtml === 'function');
        await report.locator(tool.paper).first().waitFor({ state: 'visible' });
        await report.locator('#repDownloadCurrentWord').waitFor({ state: 'visible' });
        await report.evaluate(async () => { await document.fonts.ready; if (window.MathJax?.typesetPromise) await window.MathJax.typesetPromise(); });
        assert.equal(record.runtimeRequests.length, 0, 'DOCX runtime 不可在工作頁／報告初始載入');
        assert.equal(await report.evaluate(() => typeof window.buildReportWordHtml), 'undefined', '不得殘留 HTML 偽 Word API');
        const sourceOptions = { browser, origin: origin.origin, projectMetadata: record.projectMetadata };
        const inventory = await saveSource(report, tool.key, output, sourceOptions);
        if (record.projectSnapshot) assert.equal(inventory.htmlRegression.identity.fingerprint, record.projectSnapshot.calculationFingerprint, 'RC 報告指紋必須可回溯至實際輸入 JSON');
        record.htmlRegression = inventory.htmlRegression;
        record.checks.push('html-dual-seals', 'offline-no-opener-print-and-text-sha');
        await report.screenshot({ path: path.join(output, tool.key + '-source.png'), fullPage: true });
        // 明確的測試污染只加在輸出控制區，不能流入轉換器輸出。
        await report.evaluate(() => {
          const paper = document.querySelector('.rep-paper, .paper');
          const pageOnly = document.createElement('span'); pageOnly.dataset.pageOnly = 'true'; pageOnly.dataset.docxQa = 'page-only'; pageOnly.textContent = 'DOCX_QA_PAGE_ONLY_SENTINEL'; paper.append(pageOnly);
          const button = document.createElement('button'); button.textContent = 'DOCX_QA_CONTROL_SENTINEL'; button.dataset.docxQa = 'control'; paper.append(button);
        });
        if (tool.key === 'rc-beam') {
          const runtimePattern = await page.evaluate(() => window.ReportDocxLibraryURL);
          assert.equal(new URL(runtimePattern).origin, origin.origin, '故障注入只能針對本機實際 vendor URL');
          const failure = await cdpProbe.injectFailure(runtimePattern);
          let downloads = 0; const downloaded = () => downloads++;
          try {
            await report.locator('#repDownloadCurrentWord').click();
            const intercepted = await failure.waitForPause();
            await report.waitForFunction(() => Boolean(document.querySelector('script[data-report-docx-runtime="true"]')));
            const [pendingHtml] = await Promise.all([report.waitForEvent('download'), report.locator('#repDownloadCurrentHtml').click()]);
            const pendingFile = path.join(output, tool.key + '-runtime-pending-source.html');
            await pendingHtml.saveAs(pendingFile);
            const pendingText = fs.readFileSync(pendingFile, 'utf8');
            const { JSDOM } = require('./螺栓檢討/bolt-review-tool/node_modules/jsdom');
            const pendingDocument = new JSDOM(pendingText);
            try {
              assert.equal(pendingDocument.window.document.querySelector('script[data-report-docx-runtime]'), null, '等待 Word 時保存 HTML 必須移除暫存 runtime');
              assert.equal([...pendingDocument.window.document.querySelectorAll('script[src]')].some(script => decodeURI(new URL(script.src, origin.origin).pathname).endsWith('/' + RUNTIME)), false, '重開 HTML 不得預先下載 vendor');
              assert.ok(pendingDocument.window.document.querySelector('script:not([src])'), '原核可與驗證程式必須保留');
            } finally { pendingDocument.window.close(); }
            record.pendingRuntimeHtml = { file: path.basename(pendingFile), sha256: sha(pendingText) };
            record.checks.push('pending-runtime-html-remains-portable');
            report.on('download', downloaded);
            await failure.release();
            await report.waitForFunction(() => /元件無法載入/.test(document.querySelector('#repWindowStatus')?.textContent || ''), {}, { timeout: 10000 });
            assert.equal(downloads, 0, 'runtime 載入失敗不得下載假 Word');
            const failureMessage = await report.locator('#repWindowStatus').textContent();
            assert.doesNotMatch(failureMessage, /逾時/, '必須是實際網路失敗，不能以未命中的注入逾時代替');
            assert.equal(await report.evaluate(() => Boolean(window.docx?.Packer)), false, '失敗請求不得載入 vendor');
            record.expectedFailures.push({ kind: 'runtime-network', message: failureMessage, fetchRequestId: intercepted.requestId, networkId: intercepted.networkId });
          } finally {
            report.off('download', downloaded); await failure.close();
          }
        }
        record.docx = await wordDownload(report, tool.key, inventory, output);
        assert.equal(record.runtimeRequests.length, tool.key === 'rc-beam' ? 2 : 1, '只有首次需求載入一份 runtime；故障案例僅多一次明確失敗');
        if (cdpProbe) {
          await cdpProbe.flush();
          const body = cdpProbe.events.filter(event => event.kind === 'response-body');
          assert.equal(body.length, 1, '重試必須有一份實際 vendor response body');
          assert.equal(body[0].sha256, sha(fs.readFileSync(path.join(ROOT, RUNTIME))), '重試載入的元件內容與本機 vendored 來源一致');
          assert.ok(cdpProbe.events.some(event => event.kind === 'response' && event.requestId === body[0].requestId && event.status === 200));
          assert.ok(cdpProbe.events.some(event => event.kind === 'network-failed' && event.requestId === record.expectedFailures[0].networkId), '失敗請求必須有 Chromium loadingFailed 證據');
          record.runtimeLibraryReady = await report.evaluate(() => Boolean(window.docx?.Packer));
          assert.equal(record.runtimeLibraryReady, true);
        }
        record.checks.push('downloaded-docx-openxml-dom-reconciliation', 'lazy-runtime-and-repeat-api', 'nonformal-attachment-blocked');
        if (tool.key === 'rc-beam') {
          await report.evaluate(() => document.querySelectorAll('[data-docx-qa]').forEach(node => node.remove()));
          await report.locator('#repAttachmentApprovedBy').fill('QA 自動驗收');
          await report.locator('#repAttachmentApprovalBasis').fill('驗收 fixture：僅確認正式來源轉 Word 仍被封鎖，不作實際核可');
          await report.locator('#repAttachmentApproval').check();
          await report.waitForFunction(() => document.querySelector('.rep-document-status-line')?.dataset.documentClass === 'formal-attachment');
          const formal = await saveSource(report, tool.key + '-approved-source-fixture', output, sourceOptions);
          record.formalSourceDocx = await wordDownload(report, tool.key + '-formal-source-nonformal-word', formal, output);
          assert.equal(record.formalSourceDocx.attachmentStatus, 'blocked');
          record.checks.push('formal-source-still-nonformal');
          const missingImage = await cdpProbe.injectFailure(new URL('/__docx_qa_missing__.png', origin.origin).href);
          try {
            await missingImage.release();
            record.expectedFailures.push(await report.evaluate(async () => {
            const image = document.createElement('img'); image.width = 64; image.height = 40; image.src = '/__docx_qa_missing__.png'; document.querySelector('.rep-paper, .paper').append(image);
            try { await window.buildReportDocx(); return { kind: 'missing-image', rejected: false }; }
            catch (error) { return { kind: 'missing-image', rejected: true, message: error.message }; }
            finally { image.remove(); }
            }));
            await missingImage.waitForPause();
          } finally { await missingImage.close(); }
          assert.equal(record.expectedFailures.at(-1).rejected, true); assert.match(record.expectedFailures.at(-1).message, /圖像|圖片/);
          record.expectedFailures.push(await report.evaluate(async () => {
            const nodes = [];
            for (let imageIndex = 0; imageIndex < 2; imageIndex++) {
              const canvas = document.createElement('canvas'); canvas.width = 650; canvas.height = 650;
              const ctx = canvas.getContext('2d'), data = ctx.createImageData(650, 650); let state = 123456789 + imageIndex;
              for (let i = 0; i < data.data.length; i += 4) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; data.data[i] = state & 255; data.data[i + 1] = (state >>> 8) & 255; data.data[i + 2] = (state >>> 16) & 255; data.data[i + 3] = 255; }
              ctx.putImageData(data, 0, 0); document.querySelector('.rep-paper, .paper').append(canvas); nodes.push(canvas);
            }
            try { await window.buildReportDocx(); return { kind: 'oversize', rejected: false }; }
            catch (error) { return { kind: 'oversize', rejected: true, message: error.message }; }
            finally { nodes.forEach(node => node.remove()); }
          }));
          assert.equal(record.expectedFailures.at(-1).rejected, true); assert.match(record.expectedFailures.at(-1).message, /超過 2 MB/);
          record.checks.push('real-network-retry', 'real-missing-image-rejection', 'real-oversize-rejection');
        }
        assert.deepEqual(record.errors, [], '不得有執行期 JS 錯誤');
        const unexpectedConsole = record.consoleErrors.filter(item => {
          let pathname = ''; try { pathname = decodeURIComponent(new URL(item.location.url).pathname); } catch (_) { /* 非網路 console 錯誤仍需失敗 */ }
          const resourceError = /^Failed to load resource:/.test(item.message);
          return !(resourceError && (pathname === '/favicon.ico' || (tool.key === 'rc-beam' && (pathname.endsWith('/' + RUNTIME) || pathname === '/__docx_qa_missing__.png'))));
        });
        assert.deepEqual(unexpectedConsole, [], '不得有非預期 console 錯誤');
      } catch (error) {
        record.failure = String(error.stack || error); summary.failures.push({ key: tool.key, error: record.failure });
        try { if (report) await report.screenshot({ path: path.join(output, tool.key + '-failure.png'), fullPage: true }); } catch (_) { /* 保留原失敗 */ }
      } finally {
        if (cdpProbe) await cdpProbe.close();
        await context.tracing.stop({ path: path.join(output, tool.key + '-trace.zip') }); await context.close();
        fs.writeFileSync(path.join(output, tool.key + '.json'), JSON.stringify(record, null, 2)); summary.cases.push(record); save();
        console.log(`${record.failure ? 'FAIL' : 'PASS'} ${tool.key}`);
      }
    }
    assert.deepEqual(sourceHashes(), summary.sources, '受測正式來源不得於執行途中漂移');
  } catch (error) { summary.failures.push({ fatal: String(error.stack || error) }); }
  finally {
    if (browser) await browser.close(); if (server && server.exitCode === null) server.kill();
    summary.finished = new Date().toISOString(); summary.elapsedMs = Date.parse(summary.finished) - Date.parse(summary.started);
    summary.artifacts = fs.readdirSync(output).filter(file => !['summary.json', 'server.log'].includes(file)).map(file => ({ file, bytes: fs.statSync(path.join(output, file)).size, sha256: sha(fs.readFileSync(path.join(output, file))) }));
    save(); console.log(JSON.stringify({ cases: summary.cases.length, failures: summary.failures.length, output }));
    if (summary.failures.length) process.exitCode = 1;
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { CASES, sourceInventory, inspectDocx, prepareCalculationSource, createCdpReportNetworkProbe };
