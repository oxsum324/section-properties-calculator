const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.SHEAR_WALL_REPORT_PORT || 0);
const OUT_DIR = path.resolve(process.env.SHEAR_WALL_REPORT_OUT || path.join(ROOT, 'output', 'playwright'));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const CASES = [
  {
    key: 'slender_seismic',
    title: '細長結構牆耐震例',
    setup: async page => {
      await page.evaluate(() => window.applyTestCase('slender_seismic'));
    },
    expected: [
      '剪力牆設計計算書',
      '面內 P-M 互制圖',
      '牆斷面配筋示意',
      '特殊邊界構材',
      '施工縫剪摩擦',
    ],
    summaryMustInclude: '待確認',
  },
  {
    key: 'axial_out_of_range',
    title: 'Pu 軸力越界例',
    setup: async page => {
      await page.evaluate(() => {
        window.applyTestCase('slender_seismic');
        const setField = (id, value) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.value = String(value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        setField('Pu', 3000);
        setField('Mu', 650);
        setField('Vu', 160);
        window.calcShearWall();
      });
    },
    expected: [
      'Pu 超出 P-M 封包，c@Pu 不採用',
      'Pu 超出軸力封包，φMn 與 c@Pu 不採用',
      'c@Pu 不採用，需求長度須另行確認',
      '水平長度須另行確認',
      '不適用',
    ],
    summaryMustInclude: 'NG',
  },
];

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
      hasReportSummary: Boolean(document.querySelector('.rep-summary')),
      bodyText: clean(document.body.innerText),
      checkGroupCount: document.querySelectorAll('.rep-check').length,
      diagramCount: document.querySelectorAll('.rep-diagram img').length,
      imageNaturalSizes: [...document.querySelectorAll('.rep-diagram img')].map(img => ({
        alt: img.getAttribute('alt') || '',
        width: img.naturalWidth,
        height: img.naturalHeight,
      })),
      toolbarDisplayPrint: null,
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
  const toolUrl = `http://127.0.0.1:${actualPort}${encodedUrlPath('/鋼筋混凝土/tools/shear-wall.html')}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--disable-popup-blocking'],
  });

  const guard = { consoleErrors: [], pageErrors: [], failedResponses: [] };
  const results = [];

  try {
    for (const tc of CASES) {
      const page = await browser.newPage({ viewport: { width: 1320, height: 980 }, deviceScaleFactor: 1 });
      attachPageGuards(page, guard, `${tc.key}:tool`);

      const response = await page.goto(toolUrl, { waitUntil: 'networkidle', timeout: 30000 });
      assert(response && response.status() === 200, `${tc.key} tool page loads`, `status=${response && response.status()}`);
      await tc.setup(page);
      await page.evaluate(() => document.querySelector('.section-tabs button[data-tab="summary"]')?.click());
      await page.waitForTimeout(350);

      const state = await page.evaluate(() => ({
        banner: document.getElementById('bannerStatus')?.innerText?.replace(/\s+/g, ' ').trim() || '',
        swLastOk: !!window.swLast,
        reviewWarnings: window.swLast?.reviewWarnings || [],
        pmAxialOk: window.swLast?.pmAxialOk,
        pmOk: window.swLast?.pmOk,
        readinessText: document.getElementById('shearWallAttachmentReadinessCard')?.innerText?.replace(/\s+/g, ' ').trim() || '',
      }));
      assert(state.swLastOk, `${tc.key} calculation state exists`, state.banner);
      assert(state.reviewWarnings.length > 0, `${tc.key} has review warning coverage`, `${state.reviewWarnings.length} warnings`);
      assert(!state.banner.includes('OK — 符合規範'), `${tc.key} no misleading summary banner`, state.banner);
      assert(state.readinessText.includes('產報前檢查'), `${tc.key} page attachment readiness card`, state.readinessText);
      assert(state.readinessText.includes('不會寫入計算書或列印 PDF'), `${tc.key} page attachment readiness boundary`, state.readinessText);
      assert(state.readinessText.includes('優先閱讀'), `${tc.key} page attachment readiness priority`, state.readinessText);
      if (tc.summaryMustInclude === '待確認') {
        assert(state.banner.includes('待確認 —'), `${tc.key} banner uses pending-review count`, state.banner);
        assert(state.readinessText.includes('可作附件，需人工複核'), `${tc.key} page readiness flags review`, state.readinessText);
      }

      const popupPromise = page.waitForEvent('popup', { timeout: 10000 });
      await page.click('#btnReport');
      const report = await popupPromise;
      attachPageGuards(report, guard, `${tc.key}:report`);
      await report.waitForSelector('.rep-paper', { timeout: 10000 });
      await report.setViewportSize({ width: 980, height: 1300 });
      await report.waitForTimeout(500);

      const screenshotPath = path.join(OUT_DIR, `shear-wall-report-${tc.key}.png`);
      const pdfPath = path.join(OUT_DIR, `shear-wall-report-${tc.key}.pdf`);
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
      metrics.toolbarDisplayPrint = printMetrics.toolbarDisplay;
      results.push({ key: tc.key, title: tc.title, screenshotPath, pdfPath, state, metrics });

      assert(metrics.title === '剪力牆設計計算書', `${tc.key} report title`, metrics.title);
      assert(!metrics.hasReportSummary, `${tc.key} report status summary hidden`, 'no .rep-summary');
      assert(metrics.checkGroupCount >= 7, `${tc.key} report check groups`, `count=${metrics.checkGroupCount}`);
      assert(metrics.diagramCount >= 2, `${tc.key} report diagrams`, `count=${metrics.diagramCount}`);
      for (const img of metrics.imageNaturalSizes) {
        assert(img.width > 0 && img.height > 0, `${tc.key} diagram rendered: ${img.alt || '(image)'}`, `${img.width}x${img.height}`);
      }
      for (const fragment of tc.expected) {
        assert(metrics.bodyText.includes(fragment), `${tc.key} report includes`, fragment);
      }
      for (const forbidden of [
        '產報前檢查',
        '優先閱讀',
        '可作附件，需人工複核',
        '暫勿作附件',
        '不會寫入計算書或列印 PDF',
        '待確認事項 1',
        '不列為 OK 結論',
      ]) {
        assert(!metrics.bodyText.includes(forbidden), `${tc.key} report excludes page-only status`, forbidden);
      }
      assert(!/NaN|Infinity|undefined|null|∞/.test(metrics.bodyText), `${tc.key} report has no raw invalid tokens`, 'no NaN/Infinity/undefined/null/∞');
      assert(metrics.overflowSample.length === 0, `${tc.key} report element overflow`, metrics.overflowSample.map(o => `${o.tag}.${o.cls}`).join(', ') || 'none');
      assert(metrics.documentScrollWidth <= metrics.viewportWidth + 2, `${tc.key} report horizontal overflow`, `scroll=${metrics.documentScrollWidth}, viewport=${metrics.viewportWidth}`);
      assert(metrics.toolbarDisplayPrint === 'none', `${tc.key} print toolbar hidden`, `display=${metrics.toolbarDisplayPrint}`);
      assertArtifact(screenshotPath, [0x89, 0x50, 0x4e, 0x47], `${tc.key} screenshot written`);
      assertArtifact(pdfPath, [0x25, 0x50, 0x44, 0x46], `${tc.key} pdf written`);

      await report.close();
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  const auditPath = path.join(OUT_DIR, 'shear-wall-report-visual-audit.json');
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
  assert(fs.existsSync(auditPath), 'shear wall report visual audit written', auditPath);

  if (failed) {
    console.error(`\n${failed} shear wall report visual checks failed.`);
    process.exit(1);
  }
  console.log(`\nShear wall report visual smoke OK (${CASES.length} reports).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
