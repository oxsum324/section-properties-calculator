const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.RC_TEST_PORT || 8123);
const TOOL_URL = `http://127.0.0.1:${PORT}/%E9%8B%BC%E7%AD%8B%E6%B7%B7%E5%87%9D%E5%9C%9F/tools/slab.html`;
const htmlPath = path.join(__dirname, 'slab.html');
const commonPath = path.join(__dirname, '..', 'shared', 'common.js');
const casesPath = path.join(__dirname, 'slab-regression-cases.json');
const toleranceDefault = 0.001;
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
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
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function nearlyEqual(a, b, tolerance) {
  if (a == null && b == null) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  if (typeof a === 'string' || typeof b === 'string') return String(a) === String(b);
  if (!isFinite(a) || !isFinite(b)) return a === b;
  return Math.abs(a - b) <= tolerance;
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function sanitizeMetric(v) {
  return (v == null || (typeof v === 'number' && !isFinite(v))) ? null : v;
}

async function main() {
  const slabHtml = fs.readFileSync(htmlPath, 'utf8');
  const common = fs.readFileSync(commonPath, 'utf8');
  const pack = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const tolerance = pack.tolerance ?? toleranceDefault;

  assert(slabHtml.includes('id="testCaseSelect"'), 'slab.html has test case selector', 'built-in regression cases are wired in UI');
  assert(slabHtml.includes('id="caseJson"'), 'slab.html has case JSON textarea', 'JSON import/export UI exists');
  assert(slabHtml.includes('id="caseCompareResult"'), 'slab.html has compare panel', 'case compare output exists');
  assert(slabHtml.includes('id="baselineReport"'), 'slab.html has baseline report area', 'baseline report output exists');
  assert(common.includes('window.RCUI.buildReviewCheckGroup'), 'shared/common.js exposes review check group builder', 'review report rows have shared helper');
  assert(slabHtml.includes('RCUI.buildReviewCheckGroup'), 'slab report uses shared review check group builder', 'formal-analysis warning rows use shared helper');

  const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  assert(!!chromePath, 'browser executable', 'system Chrome/Edge found for slab regression test');
  const server = await serveStatic(ROOT, PORT);
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage();
  const pageErrors = [];
  const failedResponses = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('response', res => {
    if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`);
  });

  try {
    await page.goto(TOOL_URL, { waitUntil: 'networkidle' });
    await wait(250);
    assert(pageErrors.length === 0, 'slab page boot', 'no page errors during initial load');
    assert(failedResponses.length === 0, 'slab page resources', 'no missing static resources during initial load');

    for (const tc of pack.cases) {
      await page.evaluate(({ mode, values }) => {
        const setLoadMode = window.setLoadMode || (() => {});
        Object.entries(values).forEach(([id, value]) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.value = String(value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        setLoadMode(mode);
        if (typeof window.updateSelfWt === 'function') window.updateSelfWt();
        if (typeof window.updatePunchModeHint === 'function') window.updatePunchModeHint();
        if (typeof window.calcSlab === 'function') window.calcSlab();
      }, { mode: tc.mode, values: tc.values });
      await wait(250);

      const actual = await page.evaluate(() => ({
        stype: window.slabLast?.stype,
        wuSource: window.slabLast?.wuSource,
        wu: window.slabLast?.wu,
        hmin: window.slabLast?.hmin,
        VuX: window.slabLast?.VuX,
        VuY: window.slabLast?.VuY,
        phiVc1: window.slabLast?.phiVc1,
        phiVc1Y: window.slabLast?.phiVc1Y,
        punchVu: window.slabLast?.punchData?.VuPunch ?? null,
        punchPhiVc: window.slabLast?.punchData?.phiVc2 ?? null,
        punchAmp: window.slabLast?.punchData?.punchAmp ?? 1,
        methodLabel: window.slabLast?.methodLabel,
        numericalOk: window.slabLast?.numericalOk,
        summaryOk: window.slabLast?.summaryOk,
        summaryText: window.slabLast?.summaryText,
        reviewWarningCount: window.slabLast?.reviewWarnings?.length ?? 0,
        allOk: window.slabLast?.allOk
      }));
      ['wu', 'hmin', 'VuX', 'VuY', 'phiVc1', 'phiVc1Y', 'punchVu', 'punchPhiVc', 'punchAmp'].forEach(key => {
        actual[key] = sanitizeMetric(actual[key]);
      });

      Object.entries(tc.expected).forEach(([key, expected]) => {
        const pass = nearlyEqual(actual[key], expected, tolerance);
        assert(pass, `${tc.key} :: ${key}`, `expected=${expected} actual=${actual[key]}`);
      });
    }

    console.log('\nAll slab regression checks passed.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
