const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.WALL_REPORT_PORT || 0);
const OUT_DIR = path.resolve(process.env.WALL_REPORT_OUT || path.join(ROOT, 'output', 'playwright'));
const CASE_KEYS = (process.env.WALL_REPORT_CASES || 'shear_seismic,basement_oop,basement_pass_warn')
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
  shear_seismic: {
    title: '牆設計計算書',
    summary: 'NG',
    minCheckGroups: 8,
    fragments: [
      '結構剪力牆',
      "SSW fc' ≤ 350",
      '特殊邊界構材',
      'SBE 沿水平延伸',
      '18.7.4.4',
      '18.7.6.3',
      '條文對照 ＆ 方法分級',
      '牆水平斷面配筋示意',
      '規範檢核',
    ],
  },
  basement_oop: {
    title: '牆設計計算書',
    summary: 'NG',
    minCheckGroups: 7,
    fragments: [
      '地下室外牆',
      '地下室外牆模型',
      '懸臂牆 (底部固定)',
      '地下室外牆土壓自動計算',
      '面外撓曲',
      'P-Δ 方法',
      '工程近似',
      '牆水平斷面配筋示意',
    ],
  },
  basement_pass_warn: {
    title: '牆設計計算書',
    summary: '待確認',
    minCheckGroups: 8,
    fragments: [
      '地下室外牆',
      '地下室外牆模型',
      '簡支條帶',
      '地下室外牆土壓自動計算',
      '待確認 / 正式分析需求',
      '待確認事項 1',
      '不列為 OK 結論',
      '需正式分析確認',
      '正式設計仍須依實際支承',
      '面外 Slender Wall / P-Delta',
      '牆水平斷面配筋示意',
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

function assertArtifact(file, expectedSignature, title) {
  const st = fs.statSync(file);
  const header = fs.readFileSync(file).subarray(0, expectedSignature.length);
  assert(st.size > 1024, title, `${path.basename(file)} ${st.size} bytes`);
  assert(header.equals(Buffer.from(expectedSignature)), `${title} signature`, path.basename(file));
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
    window.applyWallTestCase(caseKey);
    const showSteps = document.getElementById('showSteps');
    if (showSteps) {
      showSteps.checked = true;
      showSteps.dispatchEvent(new Event('input', { bubbles: true }));
      showSteps.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (typeof window.calcWall === 'function') window.calcWall();
    document.querySelector('.section-tabs button[data-tab="summary"]')?.click();
  }, key);
  await page.waitForFunction(caseKey => window.wallLast && (
    window.wallLast.testCaseKey === caseKey ||
    document.getElementById('testCaseSelect')?.value === caseKey
  ), key, { timeout: 10000 });
}

async function reportMetrics(report) {
  return report.evaluate(() => {
    const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
    const paper = document.querySelector('.rep-paper');
    const paperRect = paper?.getBoundingClientRect();
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
      summary: clean(document.querySelector('.rep-summary')?.textContent),
      summaryClass: document.querySelector('.rep-summary')?.className || '',
      bodyText: clean(document.body.innerText),
      checkGroupCount: document.querySelectorAll('.rep-check').length,
      methodRowCount: document.querySelectorAll('.rep-method tbody tr').length,
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
  const toolUrl = `http://127.0.0.1:${actualPort}${encodedUrlPath('/鋼筋混凝土/tools/wall.html')}`;
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
      assert(!!expected, `${key} expected contract exists`, 'wall report visual case');
      const page = await browser.newPage({ viewport: { width: 1320, height: 980 }, deviceScaleFactor: 1 });
      attachPageGuards(page, guard, `${key}:tool`);

      const response = await page.goto(toolUrl, { waitUntil: 'networkidle', timeout: 30000 });
      assert(response && response.status() === 200, `${key} tool page loads`, `status=${response && response.status()}`);
      await applyCase(page, key);
      await page.waitForTimeout(350);

      const state = await page.evaluate(() => ({
        banner: document.getElementById('bannerStatus')?.innerText?.replace(/\s+/g, ' ').trim() || '',
        wallLastOk: !!window.wallLast,
        wallType: window.wallLast?.wallType,
        seismic: window.wallLast?.seismic,
        bwModelLabel: window.wallLast?.bwModelLabel,
        summaryOk: window.wallLast?.summaryOk,
        summaryText: window.wallLast?.summaryText,
        reviewWarningCount: window.wallLast?.reviewWarnings?.length || 0,
        methodRows: window.getWallMethodAuditRows ? window.getWallMethodAuditRows(window.wallLast).length : 0,
      }));
      assert(state.wallLastOk, `${key} calculation state exists`, state.banner);
      assert(state.methodRows >= 6, `${key} method audit rows`, `rows=${state.methodRows}`);
      if (expected.summary === 'NG' || expected.summary === '待確認') {
        assert(!state.banner.includes('OK — 符合規範'), `${key} no misleading summary banner`, state.banner);
      }
      if (expected.summary === '待確認') {
        assert(state.summaryOk === null, `${key} summary is manual review`, `summaryOk=${state.summaryOk}, text=${state.summaryText}`);
        assert(state.reviewWarningCount >= 1, `${key} review warnings captured`, `count=${state.reviewWarningCount}`);
      }

      const popupPromise = page.waitForEvent('popup', { timeout: 10000 });
      await page.click('#btnReport');
      const report = await popupPromise;
      attachPageGuards(report, guard, `${key}:report`);
      await report.waitForSelector('.rep-paper', { timeout: 10000 });
      await report.setViewportSize({ width: 980, height: 1300 });
      await report.waitForTimeout(500);

      const screenshotPath = path.join(OUT_DIR, `wall-report-${key}.png`);
      const pdfPath = path.join(OUT_DIR, `wall-report-${key}.pdf`);
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

      assert(metrics.title === expected.title, `${key} report title`, metrics.title);
      assert(metrics.summary.includes(expected.summary), `${key} summary status`, metrics.summary);
      assert(metrics.checkGroupCount >= expected.minCheckGroups, `${key} report check groups`, `count=${metrics.checkGroupCount}`);
      assert(metrics.methodRowCount >= 6, `${key} method audit table rows`, `count=${metrics.methodRowCount}`);
      assert(metrics.stepCount >= 4, `${key} report detailed steps`, `count=${metrics.stepCount}`);
      assert(metrics.diagramCount >= 1, `${key} report diagrams`, `count=${metrics.diagramCount}`);
      for (const img of metrics.imageNaturalSizes) {
        assert(img.width > 0 && img.height > 0, `${key} diagram rendered: ${img.alt || '(image)'}`, `${img.width}x${img.height}`);
      }
      for (const fragment of expected.fragments || []) {
        assert(metrics.bodyText.includes(fragment), `${key} report includes`, fragment);
      }
      assert(!/NaN|Infinity|undefined|null|∞/.test(metrics.bodyText), `${key} report has no raw invalid tokens`, 'no NaN/Infinity/undefined/null/∞');
      assert(!metrics.bodyText.includes('18.10'), `${key} report has no stale 18.10 clause refs`, 'uses 112 18.7 wall clauses');
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

  const auditPath = path.join(OUT_DIR, 'wall-report-visual-audit.json');
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
  assert(fs.existsSync(auditPath), 'wall report visual audit written', auditPath);

  if (failed) {
    console.error(`\n${failed} wall report visual checks failed.`);
    process.exit(1);
  }
  console.log(`\nWall report visual smoke OK (${CASE_KEYS.length} reports).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
