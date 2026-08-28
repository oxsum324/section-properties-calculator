const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { captureReportTextDownload } = require('./鋼筋混凝土/tools/report-text-download-check');

const ROOT = __dirname;
const OUT_DIR = path.resolve(process.env.CONTINUOUS_BEAM_REPORT_OUT || (process.env.PREFLIGHT_RUN_DIR
  ? path.join(process.env.PREFLIGHT_RUN_DIR, 'continuous-beam-text-export')
  : path.join(ROOT, 'output', 'playwright', 'continuous-beam')));
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function safeRequestPath(reqUrl) {
  return decodeURIComponent(new URL(reqUrl || '/', 'http://127.0.0.1').pathname);
}

function serveStatic(rootDir) {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };
  const server = http.createServer((req, res) => {
    const requestPath = safeRequestPath(req.url);
    const target = path.normalize(path.join(rootDir, requestPath === '/' ? '連續梁分析.html' : requestPath));
    const relative = path.relative(rootDir, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(target, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function launchBrowser(executablePath) {
  let lastError;
  for (const delayMs of [0, 5000, 15000]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
      return await chromium.launch({ headless: true, executablePath });
    } catch (error) {
      lastError = error;
      if (!/spawn EPERM|WinError 5|access is denied|Permission denied/i.test(String(error?.message || error))) throw error;
    }
  }
  throw lastError;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const chromePath = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert(Boolean(chromePath), 'continuous beam browser executable exists', chromePath || 'not found');

  let server;
  let browser;
  try {
    server = await serveStatic(ROOT);
    const pageUrl = `http://127.0.0.1:${server.address().port}/${encodeURIComponent('連續梁分析.html')}`;
    browser = await launchBrowser(chromePath);
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const response = await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
    assert(response?.status() === 200, 'continuous beam work page loads', `status=${response?.status()}`);
    await page.waitForFunction(() => typeof window.runAnalysis === 'function' && typeof window.exportPDF === 'function' && window.model?.spans?.length, null, { timeout: 15000 });

    const result = await page.evaluate(() => {
      document.getElementById('projName').value = '連續梁 TXT 驗證案';
      document.getElementById('projNo').value = 'CB-TXT-001';
      document.getElementById('projDesigner').value = '測試設計者';
      document.getElementById('projNote').value = '同一份報表狀態衍生文字備查';
      window.initModel(1);
      window.model.supports[0] = { type: 'pin' };
      window.model.supports[1] = { type: 'roller' };
      window.model.spans[0] = { L: 6, eiMul: 1, hinges: [] };
      window.model.loads[0] = [{ type: 'udl', w: 10 }];
      document.getElementById('numSpans').value = '1';
      window.renderSpanInputs();
      window.renderLoadSpanSelect();
      window.renderLoadInputs();
      window.runAnalysis();
      return {
        version: document.getElementById('continuousBeamVersion')?.textContent || '',
        reportReady: Boolean(window.solution && window.diagrams),
        reactionText: document.getElementById('reactionTable')?.textContent || '',
      };
    });
    assert(result.version === 'V1.4', 'continuous beam public version is current', result.version);
    assert(result.reportReady && /30(?:\.0+)?/.test(result.reactionText), 'continuous beam representative result is calculated', result.reactionText.replace(/\s+/g, ' ').trim());

    const popupPromise = page.waitForEvent('popup', { timeout: 15000 });
    await page.evaluate(() => window.exportPDF());
    const report = await popupPromise;
    await report.waitForLoadState('domcontentloaded');
    await report.waitForFunction(() => document.getElementById('repDownloadCurrentText') && typeof window.buildReportText === 'function', null, { timeout: 15000 });

    const record = await captureReportTextDownload(report, {
      outputDir: OUT_DIR,
      filePrefix: 'continuous-beam',
      caseKey: 'simple-span-udl',
      label: 'continuous beam simple-span UDL report',
      assert,
      expectedFragments: [
        '連續梁分析計算書',
        '連續梁 TXT 驗證案',
        'CB-TXT-001',
        '基本設定',
        '載重清單',
        '支承反力',
        '各跨內力極值',
        '梁示意圖',
        '剪力圖',
        '彎矩圖',
        '線彈性連續梁分析',
      ],
      minBytes: 1200,
    });

    const summary = {
      generatedAt: new Date().toISOString(),
      tool: 'continuous-beam',
      version: result.version,
      caseKey: 'simple-span-udl',
      referenceTextRole: 'non-formal-reference-text',
      referenceTextPackageStatus: record.packageStatus,
      referenceTextBytes: record.bytes,
      referenceTextArtifact: record.artifact,
      suggestedFilename: record.suggestedFilename,
      hasBom: record.hasBom,
      packageIssueCodes: record.packageIssueCodes,
      pass: record.packageStatus === 'blocked' && record.packageIssueCodes.includes('non-formal-reference-text'),
    };
    fs.writeFileSync(path.join(OUT_DIR, 'continuous-beam-text-export-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    assert(summary.pass, 'continuous beam TXT evidence summary passes', JSON.stringify(summary));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
