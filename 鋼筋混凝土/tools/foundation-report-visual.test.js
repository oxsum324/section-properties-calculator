const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.FOUNDATION_REPORT_PORT || 0);
const CASES_PATH = path.join(__dirname, 'foundation-regression-cases.json');
const OUT_DIR = path.resolve(process.env.FOUNDATION_REPORT_OUT || path.join(ROOT, 'output', 'playwright'));
const CASE_KEYS = (process.env.FOUNDATION_REPORT_CASES || 'iso_default,combined_default,combined_pass_warn,mat_pass_warn,retain_counterfort_warn,pile_default')
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
  iso_default: {
    title: '基礎設計計算書 — 獨立基腳',
    summary: 'NG',
    minCheckGroups: 4,
    fragments: [
      '基礎設計計算書 — 獨立基腳',
      '容許土壓 / 偏心 / 抗滑 / 抗傾覆',
      'qmax ≤ qa',
      'φVc ≥ Vu (單向)',
      'φVc ≥ Vu (衝剪)',
      'φMn ≥ Mu',
      '握裹',
      'ℓd 可用 ≥ ℓd 需求',
    ],
  },
  combined_default: {
    title: '基礎設計計算書 — 聯合基腳',
    summary: 'NG',
    minCheckGroups: 3,
    fragments: [
      '基礎設計計算書 — 聯合基腳',
      'HDL / HE',
      '抗滑 N / H',
      '土壓 / 偏心 / 抗滑',
      '抗滑 FS ≥ 1.5',
      '未控制',
      '長向梁化包絡',
      '各柱 φVc ≥ Vu (衝剪)',
    ],
  },
  combined_pass_warn: {
    title: '基礎設計計算書 — 聯合基腳',
    summary: '待確認',
    minCheckGroups: 4,
    fragments: [
      '基礎設計計算書 — 聯合基腳',
      '待確認 / 正式聯合基腳分析需求',
      '待確認事項 1',
      '不列為 OK 結論',
      '需正式分析確認',
      '聯合基腳長向反力',
      '代表控制檢核',
    ],
  },
  mat_pass_warn: {
    title: '基礎設計計算書 — 筏式基礎',
    summary: '待確認',
    minCheckGroups: 3,
    fragments: [
      '基礎設計計算書 — 筏式基礎',
      '待確認 / 正式筏基分析需求',
      '待確認事項 1',
      '不列為 OK 結論',
      '需正式分析確認',
      '多代表柱 tributary',
      'DDM',
      '彈簧床分析',
    ],
  },
  pile_default: {
    title: '基礎設計計算書 — 樁基／樁帽',
    summary: 'NG',
    minCheckGroups: 4,
    fragments: [
      '基礎設計計算書 — 樁基／樁帽',
      '場址',
      '樁體',
      '土層與單樁承載',
      '群樁構造',
      '服務性與樁身',
      '樁帽結構',
      'Rmax ≤ Qallow,eff',
      'Wo ≤ 容許沉陷',
      '樁身壓應力',
      '樁帽 φMn ≥ Mu',
      'Qall ≥ 服務需求',
      '逐層承載力表',
    ],
  },
  retain_counterfort_warn: {
    title: '基礎設計計算書 — 擋土牆',
    summary: '待確認',
    minCheckGroups: 3,
    fragments: [
      '基礎設計計算書 — 擋土牆',
      '扶壁式（目前為近似檢核）',
      '穩定檢核',
      '牆身強度檢核',
      '待確認 / 正式扶壁系統分析需求',
      '待確認事項 1',
      '不列為 OK 結論',
      '需正式分析確認',
      '雙向板 / T 梁系統分析',
      '扶壁間距 sf 尚未納入',
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

async function applyCase(page, tc) {
  await page.click(`#mainTabs button[data-tab="${tc.tab}"]`);
  if (tc.values) {
    await page.evaluate(values => {
      Object.entries(values).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      if (typeof window.calcFdtn === 'function') window.calcFdtn();
    }, tc.values);
  }
  await page.waitForFunction(expectedTab => window.ftLast?.tab === expectedTab, tc.tab, { timeout: 10000 });
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
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      paperWidth: paperRect ? Math.round(paperRect.width) : null,
      overflowSample: overflowing,
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
  const chromePath = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert(!!chromePath, 'browser executable', chromePath || 'not found');
  if (!chromePath) process.exit(1);

  const server = await serveStatic(ROOT, PORT);
  const actualPort = server.address().port;
  const toolUrl = `http://127.0.0.1:${actualPort}${encodedUrlPath('/鋼筋混凝土/tools/foundation.html')}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--disable-popup-blocking'],
  });

  const guard = { consoleErrors: [], pageErrors: [], failedResponses: [] };
  const results = [];

  try {
    for (const tc of cases) {
      const page = await browser.newPage({ viewport: { width: 1320, height: 980 }, deviceScaleFactor: 1 });
      attachPageGuards(page, guard, `${tc.key}:tool`);

      const response = await page.goto(toolUrl, { waitUntil: 'networkidle', timeout: 30000 });
      assert(response && response.status() === 200, `${tc.key} tool page loads`, `status=${response && response.status()}`);
      await applyCase(page, tc);
      await page.waitForTimeout(350);

      const state = await page.evaluate(() => ({
        banner: document.getElementById('bannerStatus')?.innerText?.replace(/\s+/g, ' ').trim() || '',
        ftLastOk: !!window.ftLast,
        tab: window.ftLast?.tab,
        mcDdmText: document.getElementById('mc-ddm')?.innerText?.replace(/\s+/g, ' ').trim() || '',
        mcDdmWarn: document.getElementById('mc-ddm')?.classList.contains('warn') && !document.getElementById('mc-ddm')?.classList.contains('ok'),
        okQ: window.ftLast?.okQ,
        okR: window.ftLast?.okR,
        okSettlement: window.ftLast?.okSettlement,
        okPileStress: window.ftLast?.okPileStress,
        summaryOk: window.ftLast?.summaryOk,
      }));
      assert(state.ftLastOk && state.tab === tc.tab, `${tc.key} calculation state exists`, state.banner);
      if (EXPECTED[tc.key]?.summary === '待確認') {
        assert(!state.banner.includes('OK — 符合規範') && !state.banner.includes('✓ OK'), `${tc.key} no misleading OK banner`, state.banner);
      }
      if (tc.tab === 'mat') {
        assert(state.mcDdmText.includes('待確認') && state.mcDdmWarn, `${tc.key} DDM unavailable UI is warning`, state.mcDdmText);
      }

      const popupPromise = page.waitForEvent('popup', { timeout: 10000 });
      await page.click('#btnReport');
      const report = await popupPromise;
      attachPageGuards(report, guard, `${tc.key}:report`);
      await report.waitForSelector('.rep-paper', { timeout: 10000 });
      await report.setViewportSize({ width: 980, height: 1300 });
      await report.waitForTimeout(500);

      const screenshotPath = path.join(OUT_DIR, `foundation-report-${tc.key}.png`);
      const pdfPath = path.join(OUT_DIR, `foundation-report-${tc.key}.pdf`);
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
      const expected = EXPECTED[tc.key] || {};
      results.push({ key: tc.key, screenshotPath, pdfPath, state, metrics, printMetrics });

      assert(metrics.title === expected.title, `${tc.key} report title`, metrics.title);
      assert(metrics.summary.includes(expected.summary), `${tc.key} summary status`, metrics.summary);
      assert(metrics.checkGroupCount >= (expected.minCheckGroups || 4), `${tc.key} report check groups`, `count=${metrics.checkGroupCount}`);
      for (const fragment of expected.fragments || []) {
        assert(metrics.bodyText.includes(fragment), `${tc.key} report includes`, fragment);
      }
      assert(!/NaN|Infinity|undefined|null|∞/.test(metrics.bodyText), `${tc.key} report has no raw invalid tokens`, 'no NaN/Infinity/undefined/null/∞');
      assert(metrics.overflowSample.length === 0, `${tc.key} report element overflow`, metrics.overflowSample.map(o => `${o.tag}.${o.cls}`).join(', ') || 'none');
      assert(metrics.documentScrollWidth <= metrics.viewportWidth + 2, `${tc.key} report horizontal overflow`, `scroll=${metrics.documentScrollWidth}, viewport=${metrics.viewportWidth}`);
      assert(printMetrics.toolbarDisplay === 'none', `${tc.key} print toolbar hidden`, `display=${printMetrics.toolbarDisplay}`);
      assertArtifact(screenshotPath, [0x89, 0x50, 0x4e, 0x47], `${tc.key} screenshot written`);
      assertArtifact(pdfPath, [0x25, 0x50, 0x44, 0x46], `${tc.key} pdf written`);

      await report.close();
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  const auditPath = path.join(OUT_DIR, 'foundation-report-visual-audit.json');
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
  assert(fs.existsSync(auditPath), 'foundation report visual audit written', auditPath);

  if (failed) {
    console.error(`\n${failed} foundation report visual checks failed.`);
    process.exit(1);
  }
  console.log(`\nFoundation report visual smoke OK (${cases.length} reports).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
