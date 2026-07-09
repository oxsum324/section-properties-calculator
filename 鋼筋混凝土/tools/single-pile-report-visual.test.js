const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.SINGLE_PILE_REPORT_PORT || 0);
const OUT_DIR = path.resolve(process.env.SINGLE_PILE_REPORT_OUT || path.join(ROOT, 'output', 'playwright'));
const CASE_KEYS = (process.env.SINGLE_PILE_REPORT_CASES || 'default_code,bh5_regulation,optimistic_params_review')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const CASES = {
  default_code: {
    expectedSnapshot: 'OK',
    fragments: [
      '單樁承載力設計計算書',
      '採用方案',
      '土層與單樁承載',
      '服務性與樁身',
      '規範假設檢核',
      '土層與單樁採用深度',
      '逐層承載力表',
      '候選方案矩陣',
      'Qall 長期 ≥ 服務需求',
      'Wo ≤ 容許沉陷',
    ],
  },
  bh5_regulation: {
    setup: async page => {
      await page.click('#btnPresetBh5');
      await page.selectOption('#calcMode', 'regulation');
      await page.selectOption('#regulationMethod', 'static');
    },
    fragments: [
      '規範模式',
      '規範靜力學公式',
      '規範分項 FS',
      '土層與單樁承載',
      'N 值經驗式適用性',
      '逐層承載力表',
      '候選方案矩陣',
    ],
  },
  optimistic_params_review: {
    expectedSnapshot: '複核',
    setup: async page => {
      await page.fill('#alphaSoft', '1.20');
      await page.evaluate(() => {
        const el = document.getElementById('alphaSoft');
        el?.dispatchEvent(new Event('input', { bubbles: true }));
        el?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => window.singlePileLast?.complianceOk === false, null, { timeout: 10000 });
    },
    fragments: [
      '規範假設檢核',
      '細部折減參數',
      '候選方案矩陣',
    ],
  },
};

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

function assertArtifact(file, expectedSignature, title) {
  const st = fs.statSync(file);
  const header = fs.readFileSync(file).subarray(0, expectedSignature.length);
  assert(st.size > 1024, title, `${path.basename(file)} ${st.size} bytes`);
  assert(header.equals(Buffer.from(expectedSignature)), `${title} signature`, path.basename(file));
}

async function openReportPopup(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  const triggerSelector = options.triggerSelector ?? '#btnReport';
  const knownPages = new Set(page.context().pages());
  await page.click(triggerSelector);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const report = page.context().pages().find(candidate => candidate !== page && !candidate.isClosed() && !knownPages.has(candidate));
    if (report) return report;
    await page.waitForTimeout(100);
  }
  throw new Error(`report popup did not open within ${timeoutMs}ms`);
}

function serveStatic(rootDir, port = PORT) {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
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



function attachPageGuards(page, bucket, label) {
  page.on('console', msg => {
    if (msg.type() === 'error') bucket.consoleErrors.push({ label, url: page.url(), text: msg.text() });
  });
  page.on('pageerror', err => bucket.pageErrors.push({ label, url: page.url(), text: err.message }));
  page.on('response', res => {
    if (res.status() >= 400) bucket.failedResponses.push({ label, status: res.status(), url: res.url() });
  });
}

async function applyCase(page, key) {
  const tc = CASES[key];
  if (!tc) throw new Error(`Unknown single pile report visual case: ${key}`);
  if (tc.setup) await tc.setup(page);
  await page.waitForFunction(() => window.singlePileLast && window.singlePileLast.candidateCount > 0, null, { timeout: 10000 });
}

async function reportMetrics(report) {
  return report.evaluate(() => {
    const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
    const paper = document.querySelector('.rep-paper');
    const paperRect = paper?.getBoundingClientRect();
    const overflowing = [...document.querySelectorAll('.rep-paper table, .rep-paper th, .rep-paper td, .rep-paper figure, .rep-paper pre, .rep-paper img')]
      .filter(el => el.scrollWidth > el.clientWidth + 2)
      .slice(0, 12)
      .map(el => ({
        tag: el.tagName,
        cls: el.className,
        text: clean(el.textContent || el.getAttribute('alt')).slice(0, 100),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      }));
    return {
      title: clean(document.querySelector('h1')?.textContent),
      summary: clean(document.querySelector('.rep-summary')?.textContent),
      hasReportSummary: Boolean(document.querySelector('.rep-summary')),
      bodyText: clean(document.body.innerText),
      checkGroupCount: document.querySelectorAll('.rep-check').length,
      stepCount: document.querySelectorAll('.rep-step').length,
      diagramCount: document.querySelectorAll('.rep-diagram img').length,
      imageNaturalSizes: [...document.querySelectorAll('.rep-diagram img')].map(img => ({
        alt: img.getAttribute('alt') || '',
        width: img.naturalWidth,
        height: img.naturalHeight,
      })),
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      paperWidth: paperRect ? Math.round(paperRect.width) : null,
      overflowSample: overflowing,
    };
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const chromePath = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert(!!chromePath, 'browser executable', chromePath || 'not found');
  if (!chromePath) process.exit(1);

  for (const key of CASE_KEYS) {
    assert(!!CASES[key], `${key} expected contract exists`, 'single pile report visual case');
  }

  const server = await serveStatic(ROOT, PORT);
  const actualPort = server.address().port;
  const toolUrl = `http://127.0.0.1:${actualPort}${encodedUrlPath('/鋼筋混凝土/tools/single-pile-designer.html')}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--disable-popup-blocking'],
  });

  const guard = { consoleErrors: [], pageErrors: [], failedResponses: [] };
  const results = [];

  try {
    for (const key of CASE_KEYS) {
      const expected = CASES[key];
      const page = await browser.newPage({ viewport: { width: 1320, height: 980 }, deviceScaleFactor: 1 });
      attachPageGuards(page, guard, `${key}:tool`);

      const response = await page.goto(toolUrl, { waitUntil: 'networkidle', timeout: 30000 });
      assert(response && response.status() === 200, `${key} tool page loads`, `status=${response && response.status()}`);
      await applyCase(page, key);
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => ({
        banner: document.getElementById('banner')?.innerText?.replace(/\s+/g, ' ').trim() || '',
        bannerClass: document.getElementById('banner')?.className || '',
        hasReportButton: !!document.getElementById('btnReport'),
        hasOpenReport: typeof window.openReport === 'function',
        ok: window.singlePileLast?.ok,
        complianceOk: window.singlePileLast?.complianceOk,
        complianceWarningCount: window.singlePileLast?.complianceWarningCount,
        summaryOk: window.singlePileLast?.summaryOk,
        summaryStatusText: window.singlePileLast?.summaryStatusText,
        candidateCount: window.singlePileLast?.candidateCount,
        best: window.singlePileLast?.recommendation,
        control: window.singlePileLast?.recommendation || window.singlePileLast?.displayCandidate,
        mode: window.singlePileLast?.calcMode,
        readinessText: document.getElementById('singlePileAttachmentReadinessCard')?.innerText?.replace(/\s+/g, ' ').trim() || '',
      }));
      assert(state.hasReportButton, `${key} report button exists`, 'btnReport');
      assert(state.hasOpenReport, `${key} shared report module loaded`, 'openReport');
      assert(state.candidateCount > 10, `${key} candidate matrix populated`, `count=${state.candidateCount}`);
      assert(state.readinessText.includes('產報前檢查'), `${key} page attachment readiness card`, state.readinessText);
      assert(state.readinessText.includes('不會寫入計算書或列印 PDF'), `${key} page attachment readiness boundary`, state.readinessText);
      assert(state.readinessText.includes('優先閱讀'), `${key} page attachment readiness priority`, state.readinessText);
      if (expected.expectedSnapshot === 'OK') {
        assert(state.best && state.best.diaCm >= 40, `${key} recommendation exists`, `D=${state.best?.diaCm}`);
        assert(state.summaryOk === true, `${key} summary snapshot OK`, state.summaryStatusText);
      } else if (expected.expectedSnapshot && expected.expectedSnapshot.includes('複核')) {
        assert(state.best && state.best.diaCm >= 40, `${key} review candidate exists`, `D=${state.best?.diaCm}`);
        assert(state.summaryOk === null, `${key} summary snapshot needs review`, state.summaryStatusText);
        assert(state.complianceOk === false && state.complianceWarningCount > 0, `${key} compliance warnings surfaced`, `count=${state.complianceWarningCount}`);
        assert(state.banner.includes('需人工複核') && state.bannerClass.includes('warn'), `${key} no misleading green banner`, state.banner);
        assert(state.readinessText.includes('可作附件，需人工複核'), `${key} page readiness flags review`, state.readinessText);
      } else {
        assert(state.control && state.control.diaCm >= 40, `${key} control candidate exists`, `D=${state.control?.diaCm}`);
      }
      const report = await openReportPopup(page);
      attachPageGuards(report, guard, `${key}:report`);
      await report.waitForSelector('.rep-paper', { timeout: 10000 });
      await report.setViewportSize({ width: 980, height: 1300 });
      await report.waitForTimeout(500);

      const screenshotPath = path.join(OUT_DIR, `single-pile-report-${key}.png`);
      const pdfPath = path.join(OUT_DIR, `single-pile-report-${key}.pdf`);
      await report.screenshot({ path: screenshotPath, fullPage: true });
      await report.emulateMedia({ media: 'print' });
      const printMetrics = await report.evaluate(() => ({
        toolbarDisplay: getComputedStyle(document.querySelector('.rep-toolbar')).display,
      }));
      await report.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
      });
      await report.emulateMedia({ media: 'screen' });

      const metrics = await reportMetrics(report);
      results.push({ key, screenshotPath, pdfPath, state, metrics, printMetrics });

      assert(metrics.title === '單樁承載力設計計算書', `${key} report title`, metrics.title);
      assert(!metrics.hasReportSummary, `${key} report status summary hidden`, 'no .rep-summary');
      assert(metrics.checkGroupCount >= 3, `${key} report check groups`, `count=${metrics.checkGroupCount}`);
      assert(metrics.stepCount >= 4, `${key} report detailed steps`, `count=${metrics.stepCount}`);
      assert(metrics.diagramCount >= 1, `${key} report diagram`, `count=${metrics.diagramCount}`);
      for (const img of metrics.imageNaturalSizes) {
        assert(img.width > 0 && img.height > 0, `${key} diagram rendered: ${img.alt || '(image)'}`, `${img.width}x${img.height}`);
      }
      for (const fragment of expected.fragments || []) {
        assert(metrics.bodyText.includes(fragment), `${key} report includes`, fragment);
      }
      for (const forbidden of [
        '產報前檢查',
        '優先閱讀',
        '可作附件，需人工複核',
        '暫勿作附件',
        '不會寫入計算書或列印 PDF',
        '人工複核 / 補充資料需求',
        '人工複核項目 1',
        '不列為 OK 結論',
        '需補充資料確認',
      ]) {
        assert(!metrics.bodyText.includes(forbidden), `${key} report excludes page-only status`, forbidden);
      }
      assert(!/NaN|Infinity|undefined|null|∞/.test(metrics.bodyText), `${key} report has no raw invalid tokens`, 'no NaN/Infinity/undefined/null/∞');
      assert(metrics.overflowSample.length === 0, `${key} report element overflow`, metrics.overflowSample.map(o => `${o.tag}.${o.cls}`).join(', ') || 'none');
      assert(metrics.documentScrollWidth <= metrics.viewportWidth + 2, `${key} report horizontal overflow`, `scroll=${metrics.documentScrollWidth}, viewport=${metrics.viewportWidth}`);
      assert(printMetrics.toolbarDisplay === 'none', `${key} print toolbar hidden`, `display=${printMetrics.toolbarDisplay}`);
      assertArtifact(screenshotPath, [0x89, 0x50, 0x4e, 0x47], `${key} screenshot written`);
      assertArtifact(pdfPath, [0x25, 0x50, 0x44, 0x46], `${key} pdf written`);

      await report.close();
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  const auditPath = path.join(OUT_DIR, 'single-pile-report-visual-audit.json');
  fs.writeFileSync(auditPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    toolUrl,
    results,
    consoleErrors: guard.consoleErrors,
    pageErrors: guard.pageErrors,
    failedResponses: guard.failedResponses,
  }, null, 2), 'utf8');

  assert(guard.consoleErrors.length === 0, 'browser console errors', guard.consoleErrors.map(item => `${item.label}: ${item.text}`).join(' / ') || 'none');
  assert(guard.pageErrors.length === 0, 'browser page errors', guard.pageErrors.map(item => `${item.label}: ${item.text}`).join(' / ') || 'none');
  assert(guard.failedResponses.length === 0, 'browser failed responses', guard.failedResponses.map(item => `${item.label}: ${item.status} ${item.url}`).join(' / ') || 'none');
  assert(fs.existsSync(auditPath), 'single pile report visual audit written', auditPath);

  if (failed) {
    console.error(`\n${failed} single pile report visual checks failed.`);
    process.exit(1);
  }
  console.log(`\nSingle pile report visual smoke OK (${CASE_KEYS.length} reports).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
