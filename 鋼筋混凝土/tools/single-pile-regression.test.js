const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.RC_TEST_PORT || 8124);
const TOOL_URL = `http://127.0.0.1:${PORT}/%E9%8B%BC%E7%AD%8B%E6%B7%B7%E5%87%9D%E5%9C%9F/tools/single-pile-designer.html`;
const htmlPath = path.join(__dirname, 'single-pile-designer.html');
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
    '.json': 'application/json; charset=utf-8'
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

async function main() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert(html.includes('window.singlePileLast'), 'single-pile page exports snapshot', 'window.singlePileLast exists');
  assert(html.includes('id="candidateTable"'), 'single-pile page has candidate table', 'candidate matrix exists');
  assert(html.includes('id="layerTable"'), 'single-pile page has layer table', 'layer breakdown exists');
  assert(html.includes('btnPresetBh5'), 'single-pile preset shortcuts', 'R17 shortcut buttons exist');
  assert(html.includes('id="calcMode"'), 'single-pile calc mode', 'calc mode selector exists');
  assert(html.includes('btnSaveDefaults'), 'single-pile save defaults control', 'save default button exists');
  assert(html.includes('page-only-case-tools'), 'single-pile preset workflow page-only card', 'page-only-case-tools exists');
  assert(html.includes('../shared/common.js'), 'single-pile page loads shared common helper', 'RCUI helper is available');
  assert(html.includes('RCUI.renderAttachmentReadiness'), 'single-pile page uses shared attachment readiness renderer', 'page-only readiness helper is used');
  assert(html.includes('id="singlePileAttachmentReadiness"'), 'single-pile page has attachment readiness card', 'page-only readiness target exists');
  assert(html.includes('summary: false'), 'single-pile report disables top status summary', 'attachment status is not printed');
  assert(!html.includes('人工複核 / 補充資料需求'), 'single-pile report excludes manual-review group', 'manual-review overview stays page-only');
  assert(!html.includes('不列為 OK 結論；補齊資料後方可作為完整檢核'), 'single-pile report excludes manual-review verdict banner', 'report has no overview verdict text');
  assert(html.includes('不會寫入計算書或列印 PDF'), 'single-pile readiness boundary copy', 'page says readiness is not printed');
  assert(html.includes('id="reportStatus"'), 'single-pile report status', 'blocked report generation is shown inline');
  assert(!html.includes('alert('), 'single-pile report feedback', 'no blocking alerts in single-pile page');
  assert(/@media\s+print[\s\S]*\.page-only-case-tools[\s\S]*display:\s*none\s*!important/.test(html), 'single-pile page print hides workflow card', 'page-only-case-tools display none');

  const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  assert(!!chromePath, 'browser executable', 'system Chrome/Edge found for single pile regression test');

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
    assert(pageErrors.length === 0, 'single-pile page boot', 'no page errors during initial load');
    assert(failedResponses.length === 0, 'single-pile resources', 'no missing static resources during initial load');

    const snapshot = await page.evaluate(() => window.singlePileLast);
    assert(snapshot && snapshot.ok === true, 'single-pile default case', 'default example finds a valid recommendation');
    assert(snapshot.layers >= 4, 'single-pile default layers', `layers=${snapshot.layers}`);
    assert(snapshot.recommendation && snapshot.recommendation.diaCm >= 40, 'single-pile recommendation dia', `dia=${snapshot.recommendation?.diaCm}`);
    assert(snapshot.recommendation && snapshot.recommendation.depthM >= 8, 'single-pile recommendation depth', `depth=${snapshot.recommendation?.depthM}`);
    assert(snapshot.recommendation && snapshot.recommendation.QallLong >= snapshot.longTermLoad, 'single-pile long-term bearing check', `QallLong=${snapshot.recommendation?.QallLong} long=${snapshot.longTermLoad}`);
    assert(snapshot.recommendation && snapshot.recommendation.QallShort >= snapshot.shortTermLoad, 'single-pile short-term bearing check', `QallShort=${snapshot.recommendation?.QallShort} short=${snapshot.shortTermLoad}`);
    assert(snapshot.recommendation && snapshot.recommendation.upliftRa > 0, 'single-pile uplift output', `Ra=${snapshot.recommendation?.upliftRa}`);
    assert(snapshot.complianceOk === true, 'single-pile compliance defaults', 'default preset stays within conservative defaults');

    const rowCount = await page.locator('#candidateTable tbody tr').count();
    assert(rowCount > 10, 'single-pile candidate rows', `rows=${rowCount}`);

    await page.setViewportSize({ width: 1280, height: 800 });
    const desktopLayout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    assert(desktopLayout.scrollWidth <= desktopLayout.clientWidth + 2, 'single-pile desktop layout', `scroll=${desktopLayout.scrollWidth}, client=${desktopLayout.clientWidth}`);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileLayout = await page.evaluate(() => {
      const candidateWrap = document.querySelector('#candidateTable').closest('.table-wrap');
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        tableClientWidth: candidateWrap.clientWidth,
        tableScrollWidth: candidateWrap.scrollWidth
      };
    });
    assert(mobileLayout.scrollWidth <= mobileLayout.clientWidth + 2, 'single-pile mobile layout', `scroll=${mobileLayout.scrollWidth}, client=${mobileLayout.clientWidth}`);
    assert(mobileLayout.tableScrollWidth > mobileLayout.tableClientWidth, 'single-pile mobile table containment', `tableScroll=${mobileLayout.tableScrollWidth}, tableClient=${mobileLayout.tableClientWidth}`);

    await page.setViewportSize({ width: 1280, height: 720 });

    await page.fill('#longTermLoad', '77');
    await page.fill('#diameterMin', '55');
    await page.fill('#depthMin', '13');
    await page.click('#btnPresetB031');
    await page.waitForTimeout(200);
    const b031 = await page.evaluate(() => window.singlePileLast);
    assert(b031 && b031.layers >= 5, 'B-031 preset load', `layers=${b031?.layers}`);
    const retainedLongLoad = await page.locator('#longTermLoad').inputValue();
    assert(retainedLongLoad === '77', 'preset keeps current loads', `longTermLoad=${retainedLongLoad}`);
    const retainedDiameterMin = await page.locator('#diameterMin').inputValue();
    const retainedDepthMin = await page.locator('#depthMin').inputValue();
    assert(retainedDiameterMin === '55', 'preset keeps current search dia', `diameterMin=${retainedDiameterMin}`);
    assert(retainedDepthMin === '13', 'preset keeps current search depth', `depthMin=${retainedDepthMin}`);
    assert(b031 && b031.calcMode === 'code', 'preset keeps current calc mode', `mode=${b031?.calcMode}`);
    const raText = await page.locator('#rRa').textContent();
    assert(typeof raText === 'string' && raText.length > 0, 'B-031 uplift field rendered', `RaField=${raText}`);
    assert(await page.locator('#presetSummary').textContent(), 'preset summary rendered', 'summary text exists after preset switch');

    await page.click('#btnSaveDefaults');
    await page.reload({ waitUntil: 'networkidle' });
    const savedLongLoad = await page.locator('#longTermLoad').inputValue();
    assert(savedLongLoad === '77', 'saved defaults persist across reload', `longTermLoad=${savedLongLoad}`);

    await page.selectOption('#calcMode', 'regulation');
    await page.selectOption('#regulationMethod', 'nvalue');
    await page.waitForTimeout(200);
    const regulationSnapshot = await page.evaluate(() => window.singlePileLast);
    assert(regulationSnapshot && regulationSnapshot.calcMode === 'regulation', 'regulation mode snapshot', `mode=${regulationSnapshot?.calcMode}`);
    assert(regulationSnapshot && regulationSnapshot.regulationMethod === 'nvalue', 'regulation method snapshot', `method=${regulationSnapshot?.regulationMethod}`);
    const longFsDisabled = await page.locator('#safetyFactorLong').isDisabled();
    const shortFsDisabled = await page.locator('#safetyFactorShort').isDisabled();
    const regulationMethodEnabled = await page.locator('#regulationMethod').isEnabled();
    assert(longFsDisabled, 'regulation mode disables long-term total FS input', 'safetyFactorLong disabled');
    assert(shortFsDisabled, 'regulation mode disables short-term total FS input', 'safetyFactorShort disabled');
    assert(regulationMethodEnabled, 'regulation mode enables method selector', 'regulationMethod enabled');

    console.log('\nAll single-pile regression checks passed.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
