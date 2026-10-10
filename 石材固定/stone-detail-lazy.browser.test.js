'use strict';

// T30 真 Edge 回歸：延遲取圖、輸出封裝、timeout/retry 與實際 DOCX ZIP。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const PAGE_PATH = '石材固定/石材計算書產生器_規範版V2.html';
const FALLBACK = '節點參考圖暫無法載入';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\154.0.4258.62\\msedge.exe';
const { chromium } = require(path.join(ROOT, 'output', 'playwright', 'phase2-quality-deps', 'node_modules', 'playwright'));
const gitValue = args => execFileSync('git', args, { cwd:ROOT, encoding:'utf8', windowsHide:true }).trim();
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(ROOT, 'output', 'playwright', 'stone-detail-lazy', runStamp);
const summary = {
  schemaVersion: 1,
  test: 'stone-detail-lazy.browser.test.js',
  runNonce: crypto.randomUUID(),
  startedAt: new Date().toISOString(),
  startHead: gitValue(['rev-parse', 'HEAD']),
  startDirty: Boolean(gitValue(['status', '--porcelain'])),
  edgeExecutable: EDGE,
  browserVersion: null,
  pageBytes: fs.statSync(path.join(ROOT, PAGE_PATH)).size,
  assets: {},
  cases: [],
};

function recordAsset(key, filename) {
  const file = path.join(ROOT, '石材固定', 'assets', filename);
  summary.assets[key] = { path: `石材固定/assets/${filename}`, bytes: fs.statSync(file).size };
}
recordAsset('bk', 'detail-bk.webp');
recordAsset('pk', 'detail-pk.webp');

function startStaticServer() {
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html'; }
    catch (_) { response.writeHead(400); response.end('Invalid path'); return; }
    if (pathname === 'favicon.ico') { response.writeHead(204); response.end(); return; }
    const fullPath = path.resolve(ROOT, pathname);
    const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
    if (fullPath !== ROOT && !fullPath.startsWith(rootPrefix)) { response.writeHead(403); response.end('Forbidden'); return; }
    fs.readFile(fullPath, (error, content) => {
      if (error) { response.writeHead(404); response.end('Not found'); return; }
      const type = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp' })[path.extname(fullPath).toLowerCase()] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      response.end(content);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function diagnosticsFor(context, label) {
  const item = { name: label, passed: false, assertions: [], requests: [], consoleErrors: [], pageErrors: [], requestFailures: [], runtimeResponses: [] };
  const pageLabels = new WeakMap();
  const registeredPages = new WeakSet();
  let nextPage = 0;
  const labelPage = page => {
    if (registeredPages.has(page)) return pageLabels.get(page);
    registeredPages.add(page);
    if (!pageLabels.has(page)) pageLabels.set(page, `${label}-page-${++nextPage}`);
    const pageLabel = pageLabels.get(page);
    page.on('console', message => {
      if (message.type() === 'error') item.consoleErrors.push({ page: pageLabel, url: page.url(), text: message.text(), location: message.location() });
    });
    page.on('pageerror', error => item.pageErrors.push({ page: pageLabel, url: page.url(), message: String(error), stack: error.stack || '' }));
    page.on('requestfailed', request => item.requestFailures.push({ page: pageLabel, pageUrl: page.url(), url: request.url(), failure: request.failure()?.errorText || '' }));
    return pageLabel;
  };
  context.on('page', labelPage);
  context.on('request', request => {
    const url = request.url();
    if (/\/assets\/detail-(?:bk|pk)\.webp(?:$|\?)/.test(url)) item.requests.push({ url, page: request.frame()?.page()?.url() || '', at: new Date().toISOString() });
  });
  context.on('response', response => {
    if (response.url().includes('/vendor/package/dist/index.iife.js')) {
      response.body().then(body => item.runtimeResponses.push({ url:response.url(), status:response.status(), contentType:response.headers()['content-type'] || '', bytes:body.length, sha256:require('node:crypto').createHash('sha256').update(body).digest('hex') }))
        .catch(error => item.runtimeResponses.push({ url:response.url(), status:response.status(), bodyError:String(error) }));
    }
  });
  return { item, labelPage };
}

async function newScenario(browser, label) {
  const context = await browser.newContext({ acceptDownloads: true });
  const diagnostics = diagnosticsFor(context, label);
  const page = await context.newPage();
  diagnostics.labelPage(page);
  await page.goto(`${summary.appUrl}${PAGE_PATH}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => typeof window.render === 'function' && document.querySelector('#preview-sheets'), undefined, { timeout: 30000 });
  await page.waitForTimeout(350);
  return { context, page, diagnostics };
}

async function assertNoFatalPageErrors(testCase) {
  assert.equal(testCase.pageErrors.length, 0, `unexpected pageerror: ${JSON.stringify(testCase.pageErrors)}`);
}

async function scenario(label, run) {
  const item = { name: label, passed: false, assertions: [], requests: [], consoleErrors: [], pageErrors: [], requestFailures: [] };
  summary.cases.push(item);
  try {
    await run(item);
    item.passed = true;
  } catch (error) {
    item.failure = { message: String(error), stack: error.stack || '' };
  }
  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
}

function assertThat(item, condition, message) {
  assert.ok(condition, message);
  item.assertions.push(message);
}

async function coldAndZoom(browser) {
  await scenario('cold-render-and-zoom', async item => {
    const { context, page, diagnostics } = await newScenario(browser, item.name);
    Object.assign(item, diagnostics.item);
    try {
      await page.evaluate(() => render());
      await page.waitForTimeout(250);
      assertThat(item, item.requests.length === 0, 'cold load and synchronous render request zero detail images');
      const thumbBackgrounds = await page.locator('#v2_method_grid .mthumb').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundImage));
      assertThat(item, thumbBackgrounds.every(value => !/detail-(?:bk|pk)\.webp/.test(value)), 'method thumbnails do not point at detail WebP URLs');
      assertThat(item, await page.locator('#preview-sheets').evaluate(node => !/src\s*=\s*["\']undefined/i.test(node.innerHTML)), 'initial report markup has no undefined image source');

      const pk = page.locator('.v2-method-card[data-method="pk_4h"] .zoom-btn');
      await pk.click();
      await page.waitForFunction(() => document.querySelector('#v2_lightbox_img')?.src.startsWith('data:image/webp;base64,'), undefined, { timeout: 15000 });
      assertThat(item, item.requests.filter(request => request.url.includes('detail-pk.webp')).length === 1, 'first pin zoom fetches detail-pk.webp exactly once');
      assertThat(item, item.requests.filter(request => request.url.includes('detail-bk.webp')).length === 0, 'pin zoom does not fetch detail-bk.webp');
      const pkInfo = await page.locator('#v2_lightbox_img').evaluate(image => ({ width:image.naturalWidth, height:image.naturalHeight, alt:image.alt }));
      assertThat(item, pkInfo.width === 1600 && pkInfo.height === 1280 && pkInfo.alt === '插銷式固定節點參考示意圖', 'pin zoom decodes 1600x1280 with its existing descriptive alt');
      await page.locator('#v2-lightbox .lightbox-close').click();
      await page.locator('.v2-method-card[data-method="bk_4h"] .zoom-btn').click();
      await page.waitForFunction(() => document.querySelector('#v2_lightbox_img')?.src.startsWith('data:image/webp;base64,') && document.querySelector('#v2_lightbox_img')?.alt.includes('背扣'), undefined, { timeout: 15000 });
      assertThat(item, item.requests.filter(request => request.url.includes('detail-bk.webp')).length === 1, 'first back-clip zoom fetches detail-bk.webp exactly once');
      await page.locator('#v2-lightbox .lightbox-close').click();
      const popupEvent = page.waitForEvent('popup', { timeout:60000 });
      await page.locator('button[onclick="previewPrint()"]') .click();
      await page.waitForTimeout(200);
      if (await page.locator('#v2-check-modal.show').isVisible().catch(()=>false)) await page.locator('#v2_check_proceed').click();
      const popup = await popupEvent;
      await popup.waitForFunction(() => document.querySelector('img[src^="data:image/webp;base64,"]'), undefined, { timeout:30000 });
      assertThat(item, await popup.locator('img[src^="data:image/webp;base64,"]').count() > 0, 'cached detail images render in preview immediately after zoom');
      await assertNoFatalPageErrors(item);
    } finally { await context.close(); }
  });
}

async function dedupeTimeoutRetry(browser) {
  await scenario('promise-dedupe-timeout-retry', async item => {
    const { context, page, diagnostics } = await newScenario(browser, item.name);
    Object.assign(item, diagnostics.item);
    try {
      let requestCount = 0;
      await page.route('**/assets/detail-bk.webp', async route => {
        requestCount++;
        if (requestCount === 1) {
          await new Promise(resolve => setTimeout(resolve, 14000));
          try { await route.continue(); } catch (_) {}
          return;
        }
        await route.continue();
      });
      const first = await page.evaluate(() => {
        const first = getDetailImageDataUrl('bk');
        const second = getDetailImageDataUrl('bk');
        window.__firstDetailPromise = first;
        window.__firstDetailResults = Promise.allSettled([first, second]).then(values=>values.map(value=>value.status === 'rejected' ? value.reason.message : 'resolved'));
        return { samePromise:first === second };
      });
      first.results = await page.evaluate(() => window.__firstDetailResults);
      assertThat(item, first.results.every(value => value === 'Detail image request timed out'), 'one 12-second timeout rejects both concurrent callers');
      assertThat(item, first.samePromise && await page.evaluate(() => !_detailImagePromises.has('bk') && !_detailImageDataUrls.has('bk')), 'callers share one promise; timeout clears it without caching stale data');
      const requestCountAfterTimeout = item.requests.length;
      const retried = await page.evaluate(async () => {
        const retry = getDetailImageDataUrl('bk');
        const isNewPromise = retry !== window.__firstDetailPromise;
        const url = await retry;
        return { isNewPromise, dataUrl:url.startsWith('data:image/webp;base64,'), width:await new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image.naturalWidth); image.onerror = () => resolve(0); image.src = url; }) };
      });
      assertThat(item, retried.dataUrl && retried.width === 1600, 'same key succeeds after timeout on retry');
      assertThat(item, retried.isNewPromise && item.requests.length === requestCountAfterTimeout + 1, 'retry uses a new promise and produces one additional observed request');
      await assertNoFatalPageErrors(item);
    } finally { await context.close(); }
  });
}

async function popupSuccessOffline(browser) {
  await scenario('popup-inline-and-offline', async item => {
    const { context, page, diagnostics } = await newScenario(browser, item.name);
    Object.assign(item, diagnostics.item);
    try {
      await page.evaluate(() => {
        const original = window.openPagedPrintWindow;
        window.openPagedPrintWindow = function(html, existingWindow){ window.__stonePagedHtml = html; return original.call(this, html, existingWindow); };
      });
      const popupEvent = page.waitForEvent('popup');
      await page.locator('button[onclick="previewPrint()"]').click();
      const popup = await popupEvent;
      await popup.waitForFunction(() => document.querySelector('#preview-sheets img[src^="data:image/webp;base64,"]') || document.querySelector('#printout img[src^="data:image/webp;base64,"]') || document.querySelector('img[src^="data:image/webp;base64,"]'), undefined, { timeout: 30000 });
      const html = await page.evaluate(() => window.__stonePagedHtml || '');
      assertThat(item, html.includes('data:image/webp;base64,') && !/assets\/detail-(?:bk|pk)\.webp/.test(html), 'actual popup payload embeds detail images and contains no external detail URL');
      const htmlPath = path.join(outputDir, 'stone-report-popup.html');
      fs.writeFileSync(htmlPath, Buffer.from(html, 'utf8'));
      const offline = await context.newPage();
      await popup.close();
      await context.setOffline(true);
      await offline.goto(pathToFileURL(htmlPath).href, { waitUntil:'load', timeout:30000 });
      const image = await offline.locator('img[src^="data:image/webp;base64,"]').first().evaluate(node => ({ width:node.naturalWidth, height:node.naturalHeight, alt:node.alt }));
      assertThat(item, image.width === 1600 && image.height === 1280 && image.alt.length > 0, 'same popup HTML bytes reopen offline with a decoded, described detail image');
      assertThat(item, item.requests.length === 1, 'popup output materializes each used detail key once');
      await assertNoFatalPageErrors(item);
    } finally { await context.close(); }
  });
}

async function popupBlockedFallback(browser) {
  await scenario('popup-blocked-image-fallback', async item => {
    const { context, page, diagnostics } = await newScenario(browser, item.name);
    Object.assign(item, diagnostics.item);
    try {
      await page.route('**/assets/detail-*.webp', route => route.abort());
      await page.evaluate(() => {
        const nativeOpen = window.open;
        window.open = function(...args){ const reserved = nativeOpen.apply(this, args); window.__stoneReservedPopup = reserved; return reserved; };
        const original = window.openPagedPrintWindow;
        window.openPagedPrintWindow = function(html, existingWindow){
          window.__stonePagedHtml = html;
          const inspect = target => target ? { url:target.location.href, closed:target.closed, title:target.document.title, readyState:target.document.readyState, bodyLength:target.document.body?.innerHTML?.length||0 } : null;
          const before = inspect(existingWindow);
          const sameAsReserved = existingWindow === window.__stoneReservedPopup;
          original.call(this, html, existingWindow);
          window.__stoneWriteInfo = { sameAsReserved, before, after:inspect(existingWindow), openerUrl:location.href };
        };
      });
      const popupEvent = page.waitForEvent('popup');
      await page.locator('button[onclick="previewPrint()"]').click();
      const popup = await popupEvent;
      item.contextPagesAtPopup = await Promise.all(context.pages().map(async p => ({ url:p.url(), title:await p.title(), body:(await p.locator('body').innerText().catch(()=>'')).slice(0,100) })));
      item.popupStateAtOpen = await popup.evaluate(() => ({ url:location.href, title:document.title, readyState:document.readyState, bodyLength:document.body?.innerHTML?.length||0, opener:!!window.opener }));
      const html = await page.evaluate(() => window.__stonePagedHtml || '');
      item.writeInfo = await page.evaluate(() => window.__stoneWriteInfo || null);
      fs.writeFileSync(path.join(outputDir, 'stone-report-popup-blocked.html'), Buffer.from(html, 'utf8'));
      try {
        await popup.waitForFunction(text => document.body?.innerText?.includes(text), FALLBACK, { timeout:15000 });
      } catch (error) {
        await popup.screenshot({ path:path.join(outputDir, 'stone-report-popup-blocked.png'), fullPage:true }).catch(()=>{});
        throw error;
      }
      const fallbackInfo = await popup.evaluate(text => {
        const node = Array.from(document.querySelectorAll('*')).find(el => el.children.length === 0 && el.textContent === text);
        return { url:location.href, title:document.title, bodyText:document.body?.innerText?.slice(0,250)||'', htmlLength:document.documentElement?.innerHTML?.length||0, htmlHasFallback:document.documentElement?.innerHTML?.includes(text)||false, node:node ? { tag:node.tagName, className:node.className, display:getComputedStyle(node).display, visibility:getComputedStyle(node).visibility, rect:(()=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})(), text:node.textContent } : null };
      }, FALLBACK);
      item.popupFallbackDOM = fallbackInfo;
      item.contextPages = await Promise.all(context.pages().map(async p => ({ url:p.url(), title:await p.title(), text:(await p.locator('body').innerText().catch(()=>'' )).slice(0,300) })));
      assertThat(item, item.writeInfo?.sameAsReserved === true && item.writeInfo.before?.closed === false, 'async materialization writes to the synchronously reserved popup');
      assertThat(item, html.includes(FALLBACK) && !/src\s*=\s*["\']undefined/i.test(html), 'blocked image is replaced by the fixed text fallback');
      assertThat(item, !!fallbackInfo?.node && fallbackInfo.node.display !== 'none' && fallbackInfo.node.visibility !== 'hidden' && fallbackInfo.node.rect.width > 0 && fallbackInfo.node.rect.height > 0, 'fixed fallback note is visible in the rendered popup');
      await assertNoFatalPageErrors(item);
    } finally { await context.close(); }
  });
}

async function downloadWord(page, context, destination) {
  const downloadEvent = page.waitForEvent('download', { timeout:60000 });
  await page.locator('#chips_w_src .chip[data-v="manual"]').click();
  await page.waitForFunction(() => document.querySelector('#chips_w_src .chip[data-v="manual"]')?.getAttribute('aria-pressed') === 'true', undefined, { timeout:10000 });
  await page.locator('button[onclick="exportForWord()"]').click();
  const modal = page.locator('#v2-check-modal.show');
  page.__stoneExportConfirmations = [];
  for (let step = 0; step < 3; step++) {
    try { await modal.waitFor({ state:'visible', timeout:10000 }); }
    catch (_) { break; }
    const body = await page.locator('#v2_check_body').innerText().catch(()=>'');
    page.__stoneExportConfirmations.push(body.slice(0, 500));
    await page.locator('#v2_check_proceed').click();
  }
  const download = await downloadEvent;
  await download.saveAs(destination);
  return { download, path:destination, confirmations:page.__stoneExportConfirmations };
}

const inspectDocxPython = String.raw`
import json, posixpath, struct, sys, zipfile, xml.etree.ElementTree as ET
p=sys.argv[1]
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
with zipfile.ZipFile(p) as z:
    names=set(z.namelist())
    doc=ET.fromstring(z.read('word/document.xml'))
    relroot=ET.fromstring(z.read('word/_rels/document.xml.rels'))
    rels={e.attrib['Id']:e.attrib['Target'] for e in relroot}
    embeds=[e.attrib['{'+ns['r']+'}embed'] for e in doc.findall('.//a:blip',ns)]
    targets=[]
    for rid in embeds:
        assert rid in rels, 'drawing relationship missing'
        target=posixpath.normpath(posixpath.join('word',rels[rid]))
        assert target in names, 'drawing target missing: '+target
        targets.append(target)
    details=[]
    for target in sorted(set(targets)):
        data=z.read(target)
        if data[:8]==b'\x89PNG\r\n\x1a\n' and len(data)>=24:
            width,height=struct.unpack('>II',data[16:24])
            if (width,height)==(1600,1280): details.append({'target':target,'bytes':len(data),'width':width,'height':height})
    text=' '.join(e.text or '' for e in doc.findall('.//w:t',ns))
    assert embeds, 'document.xml has no image drawing'
    assert details, 'no 1600x1280 detail image is referenced by document.xml'
    assert 'assets/detail-' not in text, 'external detail URL leaked into document'
    print(json.dumps({'embeds':len(embeds),'relationships':len(rels),'detailImages':details,'text':text},ensure_ascii=True))
`;

async function docxSuccess(browser) {
  await scenario('docx-real-runtime-detail-media', async item => {
    const { context, page, diagnostics } = await newScenario(browser, item.name);
    Object.assign(item, diagnostics.item);
    try {
      await page.evaluate(() => addCase());
      await page.waitForTimeout(250);
      const saved = await downloadWord(page, context, path.join(outputDir, 'stone-detail-success.docx'));
      item.exportConfirmations = saved.confirmations;
      assertThat(item, saved.download.suggestedFilename().toLowerCase().endsWith('.docx'), 'unintercepted production DOCX runtime produces a real .docx download');
      assertThat(item, item.requests.length >= 1 && item.requests.every(request => request.url.includes('detail-bk.webp') || request.url.includes('detail-pk.webp')), 'DOCX materializes detail images through the lazy image loader');
      const parsed = JSON.parse(execFileSync('python', ['-c', inspectDocxPython, saved.path], { cwd:ROOT, encoding:'utf8', windowsHide:true }));
      assertThat(item, parsed.detailImages.length >= 1 && parsed.embeds >= 1, 'actual DOCX ZIP has a linked 1600x1280 detail PNG in word/media');
      item.docxPackage = { embeds:parsed.embeds, relationships:parsed.relationships, detailImages:parsed.detailImages };
      item.docxRuntime = { packageVersion:JSON.parse(fs.readFileSync(path.join(ROOT, '石材固定', 'vendor', 'package', 'package.json'), 'utf8')).version, responses:item.runtimeResponses };
      assertThat(item, item.runtimeResponses.some(response => response.status === 200 && response.bytes > 0), 'real local DOCX runtime returned HTTP 200 with response bytes');
      assertThat(item, item.requests.filter(request => request.url.includes('detail-bk.webp')).length <= 1 && item.requests.filter(request => request.url.includes('detail-pk.webp')).length <= 1, 'DOCX requests each used detail key at most once');
      await assertNoFatalPageErrors(item);
    } finally { await context.close(); }
  });
}

async function docxBlockedImage(browser) {
  await scenario('docx-blocked-image-fixed-note', async item => {
    const { context, page, diagnostics } = await newScenario(browser, item.name);
    Object.assign(item, diagnostics.item);
    try {
      await page.route('**/assets/detail-*.webp', route => route.abort());
      await page.evaluate(() => addCase());
      const saved = await downloadWord(page, context, path.join(outputDir, 'stone-detail-blocked.docx'));
      item.exportConfirmations = saved.confirmations;
      assertThat(item, saved.download.suggestedFilename().toLowerCase().endsWith('.docx'), 'real DOCX runtime remains active when only detail image is blocked');
      const parsed = JSON.parse(execFileSync('python', ['-c', inspectDocxPython.replace("    assert details, 'no 1600x1280 detail image is referenced by document.xml'", "    details=[]"), saved.path], { cwd:ROOT, encoding:'utf8', windowsHide:true }));
      assertThat(item, parsed.text.includes(FALLBACK), 'blocked detail image becomes the fixed fallback note in DOCX text');
      assertThat(item, !parsed.text.includes('assets/detail-'), 'DOCX text contains no external image path');
      item.docxPackage = { embeds:parsed.embeds, relationships:parsed.relationships, detailImages:parsed.detailImages };
      await assertNoFatalPageErrors(item);
    } finally { await context.close(); }
  });
}

async function docFallbackOffline(browser) {
  await scenario('doc-fallback-download-offline', async item => {
    const { context, page, diagnostics } = await newScenario(browser, item.name);
    Object.assign(item, diagnostics.item);
    try {
      await page.route('**/vendor/package/dist/index.iife.js', route => route.abort());
      await page.evaluate(() => addCase());
      const saved = await downloadWord(page, context, path.join(outputDir, 'stone-detail-doc-fallback.doc'));
      item.exportConfirmations = saved.confirmations;
      assertThat(item, saved.download.suggestedFilename().toLowerCase().endsWith('.doc'), 'blocked DOCX runtime uses the actual HTML .doc fallback download');
      const htmlPath = path.join(outputDir, 'stone-detail-doc-fallback.html');
      fs.copyFileSync(saved.path, htmlPath);
      const offline = await context.newPage();
      await context.setOffline(true);
      await offline.goto(pathToFileURL(htmlPath).href, { waitUntil:'load', timeout:30000 });
      const image = await offline.locator('img[src^="data:image/webp;base64,"]').first().evaluate(node => ({ width:node.naturalWidth, height:node.naturalHeight, alt:node.alt }));
      assertThat(item, image.width === 1600 && image.height === 1280 && image.alt.length > 0, 'actual downloaded .doc bytes reopen offline with the embedded detail image');
      assertThat(item, await offline.locator('img[src^="https://"], img[src^="http://"]').count() === 0, 'offline .doc fallback contains no remote image source');
      await assertNoFatalPageErrors(item);
    } finally { await context.close(); }
  });
}

async function main() {
  fs.mkdirSync(outputDir, { recursive:true });
  const server = await startStaticServer();
  const address = server.address();
  summary.appUrl = `http://127.0.0.1:${address.port}/`;
  let browser;
  try {
    assert.ok(fs.existsSync(EDGE), `Pinned Edge 154 executable missing: ${EDGE}`);
    browser = await chromium.launch({ headless:true, executablePath:EDGE, args:['--no-first-run'] });
    summary.browserVersion = browser.version();
    assert.match(summary.browserVersion, /^154\./, `unexpected Edge version ${summary.browserVersion}`);
    const cases = [
      ['cold-render-and-zoom', coldAndZoom],
      ['promise-dedupe-timeout-retry', dedupeTimeoutRetry],
      ['popup-inline-and-offline', popupSuccessOffline],
      ['popup-blocked-image-fallback', popupBlockedFallback],
      ['docx-real-runtime-detail-media', docxSuccess],
      ['docx-blocked-image-fixed-note', docxBlockedImage],
      ['doc-fallback-download-offline', docFallbackOffline],
    ];
    const only = process.env.STONE_LAZY_ONLY ? process.env.STONE_LAZY_ONLY.split(',').map(value=>value.trim()).filter(Boolean) : null;
    const selected = only ? cases.filter(([id]) => only.includes(id)) : cases;
    if (only) assert.equal(selected.length, only.length, `unknown STONE_LAZY_ONLY case(s): ${only.join(',')}`);
    for (const [, run] of selected) await run(browser);
    summary.debugSelection = only || null;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    summary.finishedAt = new Date().toISOString();
    summary.endHead = gitValue(['rev-parse', 'HEAD']);
    summary.endDirty = Boolean(gitValue(['status', '--porcelain']));
    summary.headUnchanged = summary.startHead === summary.endHead;
    const requiredIds = summary.debugSelection || ['cold-render-and-zoom','promise-dedupe-timeout-retry','popup-inline-and-offline','popup-blocked-image-fallback','docx-real-runtime-detail-media','docx-blocked-image-fixed-note','doc-fallback-download-offline'];
    summary.requiredIds = requiredIds;
    summary.passed = summary.headUnchanged && summary.cases.length === requiredIds.length && summary.cases.every((item, index) => item.name === requiredIds[index] && item.passed);
    fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  }
  if (!summary.passed) {
    const failures = summary.cases.filter(item => !item.passed).map(item => `${item.name}: ${item.failure?.message || 'failed'}`);
    throw new Error(`T30 browser tests failed. Summary: ${path.join(outputDir, 'summary.json')}\n${failures.join('\n')}`);
  }
  process.stdout.write(`${JSON.stringify({ passed:summary.passed, cases:summary.cases.length, browserVersion:summary.browserVersion, summary:path.join(outputDir, 'summary.json') }, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
