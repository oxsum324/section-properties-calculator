const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { assertReportPdfTextQuality, assertReportScreenshotQuality } = require('./report-screenshot-quality');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.SLAB_REPORT_PORT || 0);
const OUT_DIR = path.resolve(process.env.SLAB_REPORT_OUT || (process.env.PREFLIGHT_RUN_DIR
  ? path.join(process.env.PREFLIGHT_RUN_DIR, 'rendered-delivery-evidence', 'rc-formal')
  : path.join(ROOT, 'output', 'playwright')));
const CASE_KEYS = (process.env.SLAB_REPORT_CASES || 'one_basic,two_basic,flat_interior_pass_warn,flat_edge_cons,flat_corner_cons')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const EXPECTED = {
  one_basic: {
    title: '板初步設計計算書',
    minCheckGroups: 6,
    fragments: [
      '單向板',
      '單向板：規範 6.5 連續板係數法',
      '板 1 m 寬條帶斷面配筋示意',
      '溫度收縮筋檢核',
      '單向板長向：此方向僅配溫度收縮筋',
      '計算過程明細',
    ],
  },
  flat_edge_cons: {
    title: '板初步設計計算書',
    minCheckGroups: 7,
    fragments: [
      '無梁版',
      '邊柱',
      '保守放大模式',
      '雙向衝剪',
      '保守放大 = 1.30',
      '簡化二向條帶初估',
      'unbalanced moment transfer',
      '板 1 m 寬條帶斷面配筋示意',
    ],
  },
  flat_corner_cons: {
    title: '板初步設計計算書',
    minCheckGroups: 7,
    fragments: [
      '無梁版',
      '角柱',
      '保守放大模式',
      '雙向衝剪',
      'bo = c1+c2+d',
      '角柱二邊連續；臨界周長延伸至兩側板邊緣。',
      '臨界斷面內面積 = 4738.5 cm²',
      '保守放大 = 1.50',
      'unbalanced moment transfer',
    ],
  },
  two_basic: {
    title: '板初步設計計算書',
    minCheckGroups: 6,
    fragments: [
      '雙向板 (有梁)',
      '簡化二向條帶法',
      'Rankine-Grashof',
      '非完整 8.10 DDM',
      '板 1 m 寬條帶斷面配筋示意',
    ],
  },
  flat_interior_pass_warn: {
    title: '板初步設計計算書',
    minCheckGroups: 7,
    fragments: [
      '無梁版',
      '內版',
      '初估模式',
      '非完整 8.10 DDM',
      'unbalanced moment transfer',
      '板 1 m 寬條帶斷面配筋示意',
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
  await page.evaluate(caseKey => {
    const selector = document.getElementById('testCaseSelect');
    if (selector) selector.value = caseKey;
    window.applySlabTestCase(caseKey);
    const showSteps = document.getElementById('showSteps');
    if (showSteps) {
      showSteps.checked = true;
      showSteps.dispatchEvent(new Event('input', { bubbles: true }));
      showSteps.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (typeof window.calcSlab === 'function') window.calcSlab();
  }, key);
  await page.waitForFunction(caseKey => window.slabLast && (
    window.slabLast.testCaseKey === caseKey ||
    document.getElementById('testCaseSelect')?.value === caseKey
  ), key, { timeout: 10000 });
}

async function reportMetrics(report) {
  return report.evaluate(() => {
    const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
    const paper = document.querySelector('.rep-paper');
    const paperRect = paper?.getBoundingClientRect();
    const calculationPaper = paper?.cloneNode(true);
    calculationPaper?.querySelector('.rep-document-status-line')?.remove();
    const overflowing = [...document.querySelectorAll('.rep-paper table, .rep-paper th, .rep-paper td, .rep-paper figure, .rep-paper pre')]
      .filter(el => el.scrollWidth > el.clientWidth + 2)
      .slice(0, 12)
      .map(el => ({
        tag: el.tagName,
        cls: el.className,
        text: clean(el.textContent).slice(0, 100),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      }));
    return {
      title: clean(document.querySelector('h1')?.textContent),
      calculationFingerprint: clean(document.querySelector('.rep-meta')?.innerText).match(/計算指紋\s*(CF-[A-F0-9]{16})/)?.[1] || '',
      summary: clean(document.querySelector('.rep-summary')?.textContent),
      summaryClass: document.querySelector('.rep-summary')?.className || '',
      hasReportSummary: Boolean(document.querySelector('.rep-summary')),
      documentState: document.querySelector('.rep-document-status-line')?.dataset.documentClass || '',
      documentApproved: document.querySelector('.rep-document-status-line')?.dataset.approved || '',
      documentStateText: clean(document.querySelector('.rep-document-status-line')?.textContent),
      bodyText: clean(document.body.innerText),
      calculationText: clean(calculationPaper?.innerText),
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

  const server = await serveStatic(ROOT, PORT);
  const actualPort = server.address().port;
  const toolUrl = `http://127.0.0.1:${actualPort}${encodedUrlPath('/鋼筋混凝土/tools/slab.html')}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--disable-popup-blocking'],
  });

  const guard = { consoleErrors: [], pageErrors: [], failedResponses: [] };
  const results = [];

  try {
    for (const key of CASE_KEYS) {
      const expected = EXPECTED[key];
      assert(!!expected, `${key} expected contract exists`, 'slab report visual case');
      const page = await browser.newPage({ viewport: { width: 1320, height: 980 }, deviceScaleFactor: 1 });
      attachPageGuards(page, guard, `${key}:tool`);

      const response = await page.goto(toolUrl, { waitUntil: 'networkidle', timeout: 30000 });
      assert(response && response.status() === 200, `${key} tool page loads`, `status=${response && response.status()}`);
      await page.fill('#projName', 'RC 板正式附件測試');
      await page.fill('#projNo', 'RC-SLAB-001');
      await page.fill('#projDesigner', 'QA');
      await applyCase(page, key);
      await page.waitForTimeout(350);

      const state = await page.evaluate(() => ({
        banner: document.getElementById('bannerStatus')?.innerText?.replace(/\s+/g, ' ').trim() || '',
        slabLastOk: !!window.slabLast,
        stype: window.slabLast?.stype,
        allOk: window.slabLast?.allOk,
        reviewWarningCount: window.slabLast?.reviewWarnings?.length ?? 0,
        methodLabel: window.slabLast?.methodLabel,
        hasSectionSvg: !!document.querySelector('#sectionSVG svg'),
        readinessText: document.getElementById('slabAttachmentReadinessCard')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        readinessStatus: document.getElementById('slabAttachmentReadiness')?.dataset.attachmentStatus || '',
        readinessDisplay: getComputedStyle(document.getElementById('slabAttachmentReadinessCard')).display,
      }));
      assert(state.slabLastOk, `${key} calculation state exists`, state.banner);
      assert(state.hasSectionSvg, `${key} section SVG exists`, state.methodLabel);
      assert(state.readinessText.includes('產報前檢查'), `${key} page attachment readiness card`, state.readinessText);
      assert(state.readinessText.includes('不會寫入計算書或列印 PDF'), `${key} page attachment readiness boundary`, state.readinessText);
      assert(state.readinessText.includes('優先閱讀'), `${key} page attachment readiness priority`, state.readinessText);
      assert(['ready', 'review', 'estimate', 'blocked'].includes(state.readinessStatus), `${key} page attachment readiness status`, state.readinessStatus);
      assert(state.readinessDisplay !== 'none', `${key} page attachment readiness visible`, state.readinessDisplay);
      assert(state.readinessText.includes('案件識別資料') && state.readinessText.includes('已填'), `${key} page metadata completeness`, state.readinessText);
      if (state.reviewWarningCount > 0 || state.allOk === false) {
        assert(!state.banner.includes('OK — 初步檢查通過'), `${key} no misleading page banner`, state.banner);
      }
      const sourceFingerprint = await page.evaluate(() => window.collectSlabProjectData().calculationFingerprint);
      const report = await openReportPopup(page);
      attachPageGuards(report, guard, `${key}:report`);
      await report.waitForSelector('.rep-paper', { timeout: 10000 });
      await report.setViewportSize({ width: 980, height: 1300 });
      await report.waitForTimeout(500);

      const screenshotPath = path.join(OUT_DIR, `slab-report-${key}.png`);
      const pdfPath = path.join(OUT_DIR, `slab-report-${key}.pdf`);
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
      const screenshotQuality = assertReportScreenshotQuality(screenshotPath, `${key} report`, { assert });
      const pdfTextQuality = assertReportPdfTextQuality(pdfPath, `${key} report`, {
        assert,
        include: ['板初步設計計算書', '計算書', '文件狀態：內部審閱'],
        exclude: ['DRAFT／非正式附件'],
      });
      results.push({ key, screenshotPath, pdfPath, state, metrics, printMetrics, screenshotQuality, pdfTextQuality });

      assert(metrics.title === expected.title, `${key} report title`, metrics.title);
      assert(/^CF-[A-F0-9]{16}$/.test(sourceFingerprint), `${key} project JSON calculation fingerprint`, sourceFingerprint);
      assert(metrics.calculationFingerprint === sourceFingerprint, `${key} project JSON matches report calculation fingerprint`, `${sourceFingerprint} -> ${metrics.calculationFingerprint}`);
      assert(!metrics.hasReportSummary, `${key} report status banner hidden`, 'no .rep-summary');
      assert(metrics.documentState === 'internal-review' && metrics.documentApproved === 'false', `${key} report defaults to printable internal review independent of engineering readiness`, `${state.readinessStatus} -> ${metrics.documentState}`);
      assert(metrics.documentStateText.includes('文件狀態：內部審閱'), `${key} report carries concise document status`, metrics.documentStateText);
      assert(metrics.checkGroupCount >= expected.minCheckGroups, `${key} report check groups`, `count=${metrics.checkGroupCount}`);
      assert(metrics.stepCount >= 1, `${key} report detailed steps`, `count=${metrics.stepCount}`);
      assert(metrics.diagramCount >= 1, `${key} report diagrams`, `count=${metrics.diagramCount}`);
      for (const img of metrics.imageNaturalSizes) {
        assert(img.width > 0 && img.height > 0, `${key} diagram rendered: ${img.alt || '(image)'}`, `${img.width}x${img.height}`);
      }
      for (const fragment of expected.fragments || []) {
        assert(metrics.bodyText.includes(fragment), `${key} report includes`, fragment);
      }
      [
        '待確認 / 正式分析需求',
        '待確認事項',
        '需正式分析確認',
        '⚠ 待確認',
        '產報前檢查',
        '優先閱讀',
        '可作附件，需人工複核',
        '僅供初估，不建議直接作附件',
        '暫勿作附件',
        '不會寫入計算書或列印 PDF',
      ].forEach(fragment => {
        assert(!metrics.calculationText.includes(fragment), `${key} report excludes page-only review prompt`, fragment);
      });
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

  const auditPath = path.join(OUT_DIR, 'slab-report-visual-audit.json');
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
  assert(fs.existsSync(auditPath), 'slab report visual audit written', auditPath);

  if (failed) {
    console.error(`\n${failed} slab report visual checks failed.`);
    process.exit(1);
  }
  console.log(`\nSlab report visual smoke OK (${CASE_KEYS.length} reports).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
