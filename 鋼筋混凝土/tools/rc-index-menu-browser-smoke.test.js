const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { readPdfTextWithPoppler } = require('./report-screenshot-quality');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.RC_INDEX_SMOKE_PORT || 0);
const OUT_DIR = path.resolve(process.env.RC_INDEX_SMOKE_OUT || path.join(ROOT, 'output', 'playwright'));
const INDEX_PATH = '/鋼筋混凝土/index.html';
const EXPECTED_CARD_COUNT = 8;
const FORMAL_PRINT_KEYS = new Map([
  ['tools/beam.html', 'beam'],
  ['tools/column.html', 'column'],
  ['tools/slab.html', 'slab'],
  ['tools/wall.html', 'wall'],
  ['tools/shear-wall.html', 'shear-wall'],
  ['tools/foundation.html', 'foundation'],
  ['tools/single-pile-designer.html', 'single-pile'],
  ['../RC補強斷面性質.html', 'retrofit'],
]);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

let failed = 0;
function assert(pass, title, detail) {
  if (!pass) {
    failed += 1;
    console.error(`FAIL | ${title} | ${detail}`);
  } else {
    console.log(`PASS | ${title} | ${detail}`);
  }
}

function encodedUrlPath(pathname) {
  return pathname.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function safeRequestPath(reqUrl) {
  const pathname = new URL(reqUrl || '/', 'http://127.0.0.1').pathname;
  return decodeURIComponent(pathname);
}

function serveStatic(rootDir, port = PORT) {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req, res) => {
    const reqPath = safeRequestPath(req.url);
    const target = path.normalize(path.join(rootDir, reqPath === '/' ? 'index.html' : reqPath));
    const rel = path.relative(rootDir, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(target, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream',
      });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function assertArtifact(file, expectedSignature, title) {
  const st = fs.statSync(file);
  const header = fs.readFileSync(file).subarray(0, expectedSignature.length);
  assert(st.size > 1024, title, `${path.basename(file)} ${st.size} bytes`);
  assert(header.equals(Buffer.from(expectedSignature)), `${title} signature`, path.basename(file));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientBrowserLaunchError(error) {
  if (!error) return false;
  if (['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) return true;
  return /spawn EPERM|WinError 5|access is denied|Permission denied/i.test(error.message || '');
}

async function launchChromiumWithRetry(chromePath) {
  const retryDelaysMs = [0, 5000, 15000, 30000, 60000];
  let lastError;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    try {
      return await chromium.launch({ headless: true, executablePath: chromePath });
    } catch (error) {
      lastError = error;
      const canRetry = attempt < retryDelaysMs.length - 1 && isTransientBrowserLaunchError(error);
      if (!canRetry) throw error;
      const delayMs = retryDelaysMs[attempt + 1];
      console.error(`[rc-index-menu] transient browser launch failure on attempt ${attempt + 1}: ${error.message}; retrying in ${delayMs}ms`);
      await delay(delayMs);
    }
  }
  throw lastError;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const chromePath = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert(!!chromePath, 'browser executable', chromePath || 'not found');
  if (!chromePath) process.exit(1);

  let server;
  let browser;
  let page;
  let indexUrl = '';
  const screenshotPath = path.join(OUT_DIR, 'rc-index-menu-link-smoke.png');
  const auditPath = path.join(OUT_DIR, 'rc-index-menu-browser-smoke.json');
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];
  const visited = [];
  const directPrintArtifacts = [];

  try {
    server = await serveStatic(ROOT, PORT);
    const actualPort = server.address().port;
    indexUrl = `http://127.0.0.1:${actualPort}${encodedUrlPath(INDEX_PATH)}`;
    browser = await launchChromiumWithRetry(chromePath);
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push({ url: page.url(), text: msg.text() });
    });
    page.on('pageerror', err => pageErrors.push({ url: page.url(), text: err.message }));
    page.on('response', res => {
      if (res.status() >= 400) failedResponses.push({ status: res.status(), url: res.url() });
    });

    const indexResponse = await page.goto(indexUrl, { waitUntil: 'load', timeout: 30000 });
    assert(indexResponse && indexResponse.status() === 200, 'index loads', `status=${indexResponse && indexResponse.status()}`);
    await page.waitForSelector('.menu-card', { timeout: 10000 });

    const cards = await page.$$eval('.menu-card', nodes => nodes.map(node => ({
      href: node.getAttribute('href') || '',
      title: (node.querySelector('h3')?.textContent || node.textContent || '').replace(/\s+/g, ' ').trim(),
    })));
    assert(cards.length === EXPECTED_CARD_COUNT, 'index menu card count', `count=${cards.length}`);

    for (const card of cards) {
      const targetUrl = new URL(card.href, indexUrl).toString();
      const response = await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
      const status = response ? response.status() : null;
      const pageTitle = await page.title();
      const bodyChars = await page.locator('body').innerText({ timeout: 10000 }).then(text => text.trim().length);
      visited.push({ href: card.href, menuTitle: card.title, status, pageTitle, bodyChars, url: targetUrl });

      assert(status === 200, `menu target loads: ${card.href}`, `status=${status}`);
      assert(pageTitle.length > 0, `menu target has title: ${card.href}`, pageTitle || '(empty)');
      assert(bodyChars >= 100, `menu target has content: ${card.href}`, `bodyChars=${bodyChars}`);

      const printKey = FORMAL_PRINT_KEYS.get(card.href);
      assert(!!printKey, `menu target has formal print key: ${card.href}`, printKey || '(missing)');
      const screenBoundary = await page.evaluate(() => {
        const boundary = document.querySelector('.rc-direct-print-boundary');
        return {
          bodyClass: document.body.classList.contains('rc-formal-output-page'),
          display: boundary ? getComputedStyle(boundary).display : '',
          rects: boundary?.getClientRects().length || 0,
        };
      });
      assert(screenBoundary.bodyClass, `menu target declares formal-output page: ${card.href}`, JSON.stringify(screenBoundary));
      assert(screenBoundary.display === 'none' && screenBoundary.rects === 0, `blocked-print notice stays screen-hidden: ${card.href}`, JSON.stringify(screenBoundary));

      if (printKey) {
        const directPrintPdfPath = path.join(OUT_DIR, `rc-direct-print-block-${printKey}.pdf`);
        await page.emulateMedia({ media: 'print' });
        const directPrintState = await page.evaluate(() => {
          const boundary = document.querySelector('.rc-direct-print-boundary');
          return {
            boundaryRects: boundary?.getClientRects().length || 0,
            boundaryText: boundary?.textContent?.replace(/\s+/g, ' ').trim() || '',
            visiblePageChildren: Array.from(document.body.children)
              .filter(el => !el.classList.contains('rc-direct-print-boundary') && el.getClientRects().length > 0)
              .map(el => el.id || el.className || el.tagName),
            beforeContent: getComputedStyle(document.body, '::before').content,
            afterContent: getComputedStyle(document.body, '::after').content,
          };
        });
        await page.pdf({
          path: directPrintPdfPath,
          format: 'A4',
          printBackground: true,
          margin: { top: '16mm', right: '16mm', bottom: '16mm', left: '16mm' },
        });
        await page.emulateMedia({ media: 'screen' });

        const directPrintPdfText = readPdfTextWithPoppler(directPrintPdfPath);
        assert(directPrintState.boundaryRects > 0, `blocked-print notice is rendered: ${card.href}`, JSON.stringify(directPrintState));
        assert(directPrintState.visiblePageChildren.length === 0, `direct print hides complete work page: ${card.href}`, JSON.stringify(directPrintState.visiblePageChildren));
        assert(!directPrintState.beforeContent.includes('DRAFT') && !directPrintState.afterContent.includes('DRAFT'), `direct print has no draft-report watermark: ${card.href}`, `${directPrintState.beforeContent} / ${directPrintState.afterContent}`);
        assert(directPrintPdfText.pages === 1, `blocked-print PDF is one page: ${card.href}`, `pages=${directPrintPdfText.pages}`);
        for (const needle of ['RC 工具主頁列印已封鎖', '此頁是操作介面，不是計算書', '本頁不得作為附件']) {
          assert(directPrintPdfText.text.includes(needle), `blocked-print PDF includes boundary: ${card.href}`, needle);
        }
        assert(!directPrintPdfText.text.includes(card.title), `blocked-print PDF excludes work-page title: ${card.href}`, card.title);
        assert(!directPrintPdfText.text.includes('DRAFT'), `blocked-print PDF is not a draft calculation book: ${card.href}`, 'DRAFT');
        assertArtifact(directPrintPdfPath, [0x25, 0x50, 0x44, 0x46], `blocked-print PDF written: ${card.href}`);
        directPrintArtifacts.push({
          href: card.href,
          key: printKey,
          pdfPath: directPrintPdfPath,
          pages: directPrintPdfText.pages,
          textLength: directPrintPdfText.textLength,
          state: directPrintState,
        });
      }
    }

    await page.goto(indexUrl, { waitUntil: 'load', timeout: 30000 });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    assertArtifact(screenshotPath, [0x89, 0x50, 0x4e, 0x47], 'index menu screenshot written');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve));
  }

  fs.writeFileSync(auditPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    indexUrl,
    screenshotPath,
    visited,
    directPrintArtifacts,
    consoleErrors,
    pageErrors,
    failedResponses,
  }, null, 2), 'utf8');

  assert(consoleErrors.length === 0, 'browser console errors', consoleErrors.map(item => item.text).join(' / ') || 'none');
  assert(pageErrors.length === 0, 'browser page errors', pageErrors.map(item => item.text).join(' / ') || 'none');
  assert(failedResponses.length === 0, 'browser failed responses', failedResponses.map(item => `${item.status} ${item.url}`).join(' / ') || 'none');
  assert(fs.existsSync(auditPath), 'browser smoke audit written', auditPath);

  if (failed) {
    console.error(`\n${failed} RC index menu browser smoke checks failed.`);
    process.exit(1);
  }

  console.log('\nAll RC index menu browser smoke checks passed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
