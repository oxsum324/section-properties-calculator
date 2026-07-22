const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { assertReportPdfTextQuality, assertReportScreenshotQuality, readPdfTextWithPoppler } = require('./report-screenshot-quality');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.RC_VISUAL_PORT || 0);
const CASES_PATH = path.join(__dirname, 'column-regression-cases.json');
const OUT_DIR = path.resolve(process.env.RC_VISUAL_OUT || (process.env.PREFLIGHT_RUN_DIR
  ? path.join(process.env.PREFLIGHT_RUN_DIR, 'rendered-delivery-evidence', 'rc-formal')
  : path.join(ROOT, 'output', 'playwright')));
const CASE_KEYS = (process.env.RC_VISUAL_CASES || 'default_rect_design,seismic_lap_class_a_ineligible_uses_b,seismic_detail_first_outside_spacing_ng')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

const EXPECTED_REPORT_TEXT = {
  default_rect_design: [
    '工程檢核總表',
    '柱端錨定',
    '握裹 / 搭接長度',
    '長細比 k·ℓu/r'
  ],
  seismic_lap_class_a_ineligible_uses_b: [
    '工程檢核總表',
    '搭接 / 施工圖',
    '搭接長度',
    'Class A未成立，按 Class B'
  ],
  seismic_detail_first_outside_spacing_ng: [
    '首支箍筋位置',
    'ℓo 外橫向筋間距',
    '搭接位置或搭接長度未完整輸入'
  ]
};

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
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
    '.svg': 'image/svg+xml'
  };
  const server = http.createServer((req, res) => {
    const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const safePath = path.normalize(path.join(rootDir, reqPath === '/' ? 'index.html' : reqPath));
    if (!safePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(safePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(safePath).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function applyCase(page, tc) {
  await page.evaluate(tcCase => {
    const setCheckbox = (id, desired) => {
      const el = document.getElementById(id);
      if (!el || el.checked === !!desired) return;
      el.click();
    };
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    document.querySelector(`.mode-btn[data-mode="${tcCase.mode}"]`)?.click();
    Object.entries(tcCase.checkboxes || {}).forEach(([id, desired]) => setCheckbox(id, desired));
    Object.entries(tcCase.selects || {}).forEach(([id, value]) => setValue(id, value));
    Object.entries(tcCase.values || {}).forEach(([id, value]) => setValue(id, value));
    if (typeof window.calcColumn === 'function') window.calcColumn();
  }, tc);
}

async function extractReportMetrics(report) {
  return report.evaluate(() => {
    const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
    const summary = document.querySelector('.rep-coverage-summary-wrap');
    const summaryText = clean(summary?.innerText);
    const cards = [...document.querySelectorAll('.rep-coverage-summary-card')].map(card => {
      const rect = card.getBoundingClientRect();
      return {
        title: clean(card.querySelector('.rep-coverage-summary-title')?.childNodes?.[0]?.textContent),
        text: clean(card.innerText),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
    const paperRect = document.querySelector('.rep-paper')?.getBoundingClientRect();
    const coverageRect = document.querySelector('.rep-coverage')?.getBoundingClientRect();
    const reportSummary = document.querySelector('.rep-summary');
    const bodyText = clean(document.querySelector('.rep-paper')?.innerText);
    const overflowing = [...document.querySelectorAll('.rep-paper table, .rep-paper th, .rep-paper td, .rep-paper pre')]
      .filter(el => el.scrollWidth > el.clientWidth + 2)
      .slice(0, 12)
      .map(el => ({
        tag: el.tagName,
        cls: el.className,
        text: clean(el.textContent).slice(0, 90),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth
      }));
    return {
      title: clean(document.querySelector('h1')?.textContent),
      calculationFingerprint: clean(document.querySelector('.rep-meta')?.innerText).match(/計算指紋\s*(CF-[A-F0-9]{16})/)?.[1] || '',
      documentState: document.querySelector('.rep-document-status-line')?.dataset.documentClass || '',
      documentApproved: document.querySelector('.rep-document-status-line')?.dataset.approved || '',
      documentStateText: clean(document.querySelector('.rep-document-status-line')?.textContent),
      hasApprovalControl: Boolean(document.getElementById('repAttachmentApproval')),
      bodyText,
      summaryText,
      hasReportSummary: Boolean(reportSummary),
      hasCoverageSummary: Boolean(summary),
      cardCount: cards.length,
      cards,
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      paperWidth: paperRect ? Math.round(paperRect.width) : null,
      coverageWidth: coverageRect ? Math.round(coverageRect.width) : null,
      hasHorizontalPageOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      summaryHasDuplicateUnset: summaryText.includes('未輸入；未輸入'),
      summaryHasBrokenLapNote: /等級=[AB]\s*\(/.test(summaryText),
      overflowSample: overflowing
    };
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pack = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
  const cases = CASE_KEYS.map(key => {
    const tc = pack.cases.find(c => c.key === key);
    assert(!!tc, `${key} case exists`, CASES_PATH);
    return tc;
  });
  const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  assert(!!chromePath, 'browser executable', chromePath || 'not found');

  const server = await serveStatic(ROOT, PORT);
  const actualPort = server.address().port;
  const toolUrl = `http://127.0.0.1:${actualPort}/%E9%8B%BC%E7%AD%8B%E6%B7%B7%E5%87%9D%E5%9C%9F/tools/column.html`;
  const browser = await chromium.launch({ headless: true, executablePath: chromePath, args: ['--disable-popup-blocking'] });
  const results = [];

  try {
    for (const tc of cases) {
      const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
      const pageErrors = [];
      const failedResponses = [];
      page.on('pageerror', err => pageErrors.push(err.message));
      page.on('response', res => {
        if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`);
      });

      await page.goto(toolUrl, { waitUntil: 'networkidle' });
      await applyCase(page, tc);
      await page.waitForTimeout(250);
      await page.click('.section-tabs button[data-tab="summary"]');
      const pageReadiness = await page.evaluate(() => {
        const card = document.getElementById('columnAttachmentReadinessCard');
        const methodCard = document.getElementById('columnMethodBoundaryCard');
        const target = document.getElementById('columnAttachmentReadiness');
        const rect = card?.getBoundingClientRect();
        return {
          text: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
          methodText: methodCard?.textContent?.replace(/\s+/g, ' ').trim() || '',
          methodDisplay: methodCard ? getComputedStyle(methodCard).display : '',
          status: target?.dataset.attachmentStatus || '',
          display: card ? getComputedStyle(card).display : '',
          width: rect ? Math.round(rect.width) : 0,
          height: rect ? Math.round(rect.height) : 0
        };
      });
      const sourceFingerprint = await page.evaluate(() => window.collectColumnProjectData().calculationFingerprint);

      const directPrintPdfPath = path.join(OUT_DIR, `column-direct-print-${tc.key}.pdf`);
      await page.emulateMedia({ media: 'print' });
      await page.waitForFunction(() => {
        const notice = document.querySelector('.rc-direct-print-boundary');
        if (!notice || notice.getClientRects().length === 0) return false;
        return Array.from(document.body.children).every(el =>
          el.classList.contains('rc-direct-print-boundary') || el.getClientRects().length === 0
        );
      }, { timeout: 5000 });
      const directPrintState = await page.evaluate(() => ({
        noticeRects: document.querySelector('.rc-direct-print-boundary')?.getClientRects().length || 0,
        noticeText: document.querySelector('.rc-direct-print-boundary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        visiblePageChildren: Array.from(document.body.children)
          .filter(el => !el.classList.contains('rc-direct-print-boundary') && el.getClientRects().length > 0)
          .map(el => el.id || el.className || el.tagName),
        watermark: getComputedStyle(document.body, '::after').content,
      }));
      await page.pdf({
        path: directPrintPdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
      });
      await page.emulateMedia({ media: 'screen' });
      const directPrintPdfText = readPdfTextWithPoppler(directPrintPdfPath);
      assert(directPrintState.noticeRects > 0, `${tc.key} blocked direct-print boundary visible`, JSON.stringify(directPrintState));
      assert(directPrintState.visiblePageChildren.length === 0, `${tc.key} direct print hides work page`, JSON.stringify(directPrintState.visiblePageChildren));
      assert(!directPrintState.watermark.includes('DRAFT'), `${tc.key} blocked print is not a draft report`, directPrintState.watermark);
      assert(directPrintPdfText.pages === 1, `${tc.key} blocked direct-print PDF page count`, String(directPrintPdfText.pages));
      for (const needle of ['RC 工具主頁列印已封鎖', '此頁是操作介面，不是計算書', '本頁不得作為附件']) {
        assert(directPrintPdfText.text.includes(needle), `${tc.key} direct-print PDF includes`, needle);
      }
      assert(!directPrintPdfText.text.includes('柱 Column 設計／檢核'), `${tc.key} direct-print PDF excludes work page`, '柱 Column 設計／檢核');
      assert(!directPrintPdfText.text.includes('DRAFT'), `${tc.key} direct-print PDF is not a draft calculation book`, 'DRAFT');
      assertArtifact(directPrintPdfPath, [0x25, 0x50, 0x44, 0x46], `${tc.key} blocked direct-print PDF written`);

      const report = await openReportPopup(page);
      await report.waitForSelector('.rep-paper', { timeout: 10000 });
      await report.setViewportSize({ width: 980, height: 1300 });
      await report.waitForTimeout(300);

      const screenshotPath = path.join(OUT_DIR, `column-report-${tc.key}.png`);
      const pdfPath = path.join(OUT_DIR, `column-report-${tc.key}.pdf`);
      await report.screenshot({ path: screenshotPath, fullPage: true });
      await report.emulateMedia({ media: 'print' });
      const printMetrics = await report.evaluate(() => ({
        toolbarDisplay: getComputedStyle(document.querySelector('.rep-toolbar')).display
      }));
      await report.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' } });
      await report.emulateMedia({ media: 'screen' });

      const metrics = await extractReportMetrics(report);
      const screenshotQuality = assertReportScreenshotQuality(screenshotPath, `${tc.key} report`, { assert });
      const pdfTextQuality = assertReportPdfTextQuality(pdfPath, `${tc.key} report`, {
        assert,
        include: ['計算書', '文件狀態：內部審閱'],
        includeAny: [['柱設計計算書', '柱檢核計算書']],
        exclude: ['DRAFT／非正式附件'],
      });
      results.push({ key: tc.key, pageErrors, failedResponses, screenshotPath, pdfPath, directPrintPdfPath, directPrintState, directPrintPdfText, metrics, printMetrics, screenshotQuality, pdfTextQuality });

      assert(pageErrors.length === 0, `${tc.key} report page errors`, 'none');
      assert(failedResponses.length === 0, `${tc.key} report failed responses`, 'none');
      assert(pageReadiness.text.includes('產報前檢查'), `${tc.key} page attachment readiness card`, pageReadiness.text);
      assert(pageReadiness.text.includes('不會寫入計算書或列印 PDF'), `${tc.key} page attachment readiness boundary`, pageReadiness.text);
      assert(pageReadiness.methodText.includes('計算方法與適用邊界'), `${tc.key} page method boundary card`, pageReadiness.methodText);
      assert(pageReadiness.methodText.includes('不會寫入計算書或列印 PDF'), `${tc.key} page method/report boundary`, pageReadiness.methodText);
      assert(pageReadiness.methodDisplay !== 'none', `${tc.key} page method boundary visible`, pageReadiness.methodDisplay);
      assert(pageReadiness.text.includes('優先閱讀'), `${tc.key} page attachment readiness priority`, pageReadiness.text);
      assert(['ready', 'review', 'blocked'].includes(pageReadiness.status), `${tc.key} page attachment readiness status`, pageReadiness.status);
      assert(pageReadiness.display !== 'none' && pageReadiness.width > 0 && pageReadiness.height > 0, `${tc.key} page attachment readiness visible`, `${pageReadiness.display} ${pageReadiness.width}x${pageReadiness.height}`);
      assert(!metrics.hasReportSummary, `${tc.key} report top reminder hidden`, 'no .rep-summary');
      assert(metrics.documentState === 'internal-review' && metrics.documentApproved === 'false' && metrics.hasApprovalControl, `${tc.key} report defaults to printable internal review`, metrics.documentStateText);
      assert(/^CF-[A-F0-9]{16}$/.test(sourceFingerprint), `${tc.key} project JSON calculation fingerprint`, sourceFingerprint);
      assert(metrics.calculationFingerprint === sourceFingerprint, `${tc.key} project JSON matches report calculation fingerprint`, `${sourceFingerprint} -> ${metrics.calculationFingerprint}`);
      assert(!metrics.hasCoverageSummary, `${tc.key} coverage summary hidden`, 'no .rep-coverage-summary-wrap');
      assert(metrics.cardCount === 0, `${tc.key} coverage summary cards hidden`, `count=${metrics.cardCount}`);
      assert(printMetrics.toolbarDisplay === 'none', `${tc.key} print toolbar hidden`, `display=${printMetrics.toolbarDisplay}`);
      assert(!metrics.hasHorizontalPageOverflow, `${tc.key} report horizontal overflow`, `scroll=${metrics.documentScrollWidth}, viewport=${metrics.viewportWidth}`);
      assert(metrics.overflowSample.length === 0, `${tc.key} report element overflow`, 'none');
      assert(!metrics.bodyText.includes('缺漏 / 複核摘要'), `${tc.key} no gap-summary title`, 'hidden from calculation report');
      assert(!metrics.bodyText.includes('⚠ 部分項目需人工複核'), `${tc.key} no top manual-review reminder`, 'hidden from calculation report');
      [
        '產報前檢查',
        '優先閱讀',
        '可作附件，需人工複核',
        '暫勿作附件',
        '不會寫入計算書或列印 PDF',
        '計算層級 / 複核邊界',
        '條文對照 ＆ 方法分級',
        '規範覆蓋矩陣',
        '若需載重包絡線，請先使用載重組合產生器',
      ].forEach(fragment => {
        assert(!metrics.bodyText.includes(fragment), `${tc.key} report excludes page-only attachment readiness`, fragment);
      });
      assert(metrics.coverageWidth == null || metrics.coverageWidth <= metrics.paperWidth, `${tc.key} coverage table width`, `coverage=${metrics.coverageWidth}, paper=${metrics.paperWidth}`);
      (EXPECTED_REPORT_TEXT[tc.key] || []).forEach(fragment => {
        assert(metrics.bodyText.includes(fragment), `${tc.key} report includes`, fragment);
      });
      assertArtifact(screenshotPath, [0x89, 0x50, 0x4e, 0x47], `${tc.key} screenshot written`);
      assertArtifact(pdfPath, [0x25, 0x50, 0x44, 0x46], `${tc.key} pdf written`);

      await report.close();
      await page.close();
    }

    const resolvedCase = pack.cases.find(tc => tc.key === 'development_anchor_manual_review');
    assert(!!resolvedCase, 'resolved review visual case exists', 'development_anchor_manual_review');
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(toolUrl, { waitUntil: 'networkidle' });
    await applyCase(page, resolvedCase);
    await page.evaluate(() => {
      const values = { projName: '正式附件核可測試工程', projNo: 'RC-COL-SIGN', projDesigner: 'QA' };
      Object.entries(values).forEach(([id, value]) => {
        const el = document.getElementById(id);
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      window.calcColumn();
    });
    await page.click('.section-tabs button[data-tab="summary"]');
    await page.selectOption('[data-review-item="column-anchorage"] [data-review-field="basis"]', 'drawing');
    await page.fill('[data-review-item="column-anchorage"] [data-review-field="reference"]', 'S-302');
    await page.fill('[data-review-item="column-anchorage"] [data-review-field="reviewer"]', 'QA-01');
    await page.fill('[data-review-item="column-anchorage"] [data-review-field="reviewedAt"]', '2026-07-17T14:30');
    await page.click('[data-review-item="column-anchorage"] [data-review-action="confirm"]');
    const readyState = await page.evaluate(() => ({
      status: document.getElementById('columnAttachmentReadiness')?.dataset.attachmentStatus,
      readyToSign: window.lastColumnAttachmentReadiness?.readyToSign,
      approvalRequired: window.lastColumnAttachmentReadiness?.approvalRequired
    }));
    assert(readyState.status === 'ready' && readyState.readyToSign === false && readyState.approvalRequired === true, 'resolved engineering review still awaits explicit document approval', JSON.stringify(readyState));

    const report = await openReportPopup(page);
    await report.waitForSelector('.rep-paper', { timeout: 10000 });
    await report.setViewportSize({ width: 980, height: 1300 });
    await report.waitForTimeout(300);
    await report.check('#repAttachmentApproval');
    await report.waitForFunction(() => document.querySelector('.rep-document-status-line')?.dataset.documentClass === 'formal-attachment');
    const screenshotPath = path.join(OUT_DIR, 'column-report-resolved-review-formal-attachment.png');
    const pdfPath = path.join(OUT_DIR, 'column-report-resolved-review-formal-attachment.pdf');
    await report.screenshot({ path: screenshotPath, fullPage: true });
    await report.emulateMedia({ media: 'print' });
    await report.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' } });
    await report.emulateMedia({ media: 'screen' });
    const metrics = await extractReportMetrics(report);
    const screenshotQuality = assertReportScreenshotQuality(screenshotPath, 'resolved review formal attachment', { assert });
    const pdfTextQuality = assertReportPdfTextQuality(pdfPath, 'resolved review formal attachment', {
      assert,
      include: ['柱檢核計算書', '文件狀態：正式附件', '核可時間', '配筋圖／S-302', 'QA-01', '已完成可追溯複核', '已複核'],
      exclude: ['DRAFT／非正式附件']
    });
    assert(metrics.bodyText.includes('人工複核採用記錄'), 'resolved review rendered report keeps traceable review heading', '人工複核採用記錄');
    ['DRAFT／非正式附件', '未輸入時不作通過判定', '人工複核項，不納入自動 OK 判定', '報告不作通過判定'].forEach(fragment => {
      assert(!metrics.bodyText.includes(fragment), 'resolved review rendered report has no stale draft conclusion', fragment);
    });
    assert(!metrics.hasHorizontalPageOverflow && metrics.overflowSample.length === 0, 'resolved review rendered report has no overflow', JSON.stringify(metrics.overflowSample));
    assert(metrics.documentState === 'formal-attachment' && metrics.documentApproved === 'true', 'resolved review checkbox produces formal attachment status', metrics.documentStateText);
    assertArtifact(screenshotPath, [0x89, 0x50, 0x4e, 0x47], 'resolved review screenshot written');
    assertArtifact(pdfPath, [0x25, 0x50, 0x44, 0x46], 'resolved review PDF written');
    results.push({ key: 'resolved-review-formal-attachment', screenshotPath, pdfPath, metrics, screenshotQuality, pdfTextQuality });
    await report.close();
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  const auditPath = path.join(OUT_DIR, 'column-report-visual-audit.json');
  fs.writeFileSync(auditPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nColumn report visual smoke OK (${results.length} reports).`);
  console.log(`Audit: ${auditPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
