'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
  CANONICAL_RENDER_EVIDENCE_KIND,
  validatePdfFile,
  writeEvidenceSummary,
} = require('../結構工具箱/tools/rendered-delivery-evidence.js');

const repoRoot = path.resolve(__dirname, '..');
const outDir = path.resolve(process.env.SRC_BEAM_BROWSER_OUT || path.join(repoRoot, 'output', 'playwright', 'src-beam'));
const playwrightCandidates = [
  process.env.PLAYWRIGHT_MODULE,
  path.join(repoRoot, '.github', 'pages-smoke', 'node_modules', 'playwright'),
].filter(Boolean);
const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function loadPlaywright() {
  for (const candidate of playwrightCandidates) {
    try { return require(candidate); } catch {}
  }
  throw new Error('Playwright runtime not found; install the pinned .github/pages-smoke runtime first.');
}

function findBrowser() {
  const candidate = browserCandidates.find(file => fs.existsSync(file));
  if (!candidate) throw new Error('Chrome or Edge executable not found.');
  return candidate;
}

function contentType(file) {
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function createServer() {
  return http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
      const relative = pathname.replace(/^\/+/, '');
      const file = path.resolve(repoRoot, relative || 'index.html');
      const safePrefix = `${repoRoot}${path.sep}`.toLowerCase();
      if (!file.toLowerCase().startsWith(safePrefix) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      res.writeHead(500).end(error.message || String(error));
    }
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { chromium } = loadPlaywright();
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true, executablePath: findBrowser() });
  const context = await browser.newContext({ locale: 'zh-TW' });
  const pageErrors = [];
  const attachErrorCapture = page => {
    page.on('pageerror', error => pageErrors.push(error.message || String(error)));
    page.on('console', message => {
      if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
    });
  };

  try {
    const page = await context.newPage();
    attachErrorCapture(page);
    await page.goto(`http://127.0.0.1:${port}/${encodeURIComponent('SRC工具')}/src-beam.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.lastSrcBeamResult?.status === 'OK');

    const initial = await page.evaluate(() => ({
      status: window.lastSrcBeamResult.status,
      moment: window.lastSrcBeamResult.flexure.designMomentTfM,
      governing: window.lastSrcBeamResult.governingUtilization,
      fingerprint: window.lastSrcBeamCalculationFingerprint,
    }));
    assert.equal(initial.status, 'OK');
    assert.ok(Math.abs(initial.moment - 167.2054) < 0.001);
    assert.ok(Math.abs(initial.governing - 0.9607) < 0.001);
    assert.match(initial.fingerprint, /^CF-[A-F0-9]{16}$/);
    const pageDiagram = page.locator('#sectionDiagramImage');
    await pageDiagram.waitFor({ state: 'visible' });
    assert.equal(await pageDiagram.evaluate(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0), true);
    const pageDiagramSource = await pageDiagram.getAttribute('src');
    assert.match(pageDiagramSource, /^data:image\/svg\+xml;charset=utf-8,/);
    assert.match(await page.locator('#sectionDiagramCaption').innerText(), /非施工配筋詳圖/);
    await page.fill('#bCm', '55');
    await page.waitForFunction(fingerprint => window.lastSrcBeamCalculationFingerprint && window.lastSrcBeamCalculationFingerprint !== fingerprint, initial.fingerprint);
    const changedDiagramSource = await pageDiagram.getAttribute('src');
    assert.notEqual(changedDiagramSource, pageDiagramSource, 'engineering input changes refresh the section diagram');
    assert.ok(decodeURIComponent(changedDiagramSource.split(',').slice(1).join(',')).includes('b = 55.0 cm'));
    await page.fill('#steelDepthCm', '80');
    await page.waitForFunction(() => window.lastSrcBeamResult === null);
    assert.equal(await pageDiagram.isHidden(), true, 'invalid geometry clears the old diagram instead of leaving stale evidence');
    assert.match(await page.locator('#sectionDiagramPlaceholder').innerText(), /未產生計算斷面圖/);
    await page.fill('#steelDepthCm', '51.2');
    await page.fill('#bCm', '50');
    await page.waitForFunction(fingerprint => window.lastSrcBeamCalculationFingerprint === fingerprint, initial.fingerprint);
    assert.equal(await pageDiagram.isVisible(), true);
    assert.equal(await pageDiagram.getAttribute('src'), pageDiagramSource);

    await page.emulateMedia({ media: 'print' });
    const printBoundary = await page.evaluate(() => ({
      boundaryVisible: document.querySelector('.formal-direct-print-boundary').getClientRects().length > 0,
      mainVisible: document.querySelector('main').getClientRects().length > 0,
      boundaryText: document.querySelector('.formal-direct-print-boundary').innerText,
    }));
    assert.equal(printBoundary.boundaryVisible, true);
    assert.equal(printBoundary.mainVisible, false);
    assert.match(printBoundary.boundaryText, /操作頁列印已封鎖/);
    assert.match(printBoundary.boundaryText, /本頁不得作為附件/);
    await page.emulateMedia({ media: 'screen' });

    const casePayload = await page.evaluate(() => window.buildSrcBeamCasePayload());
    const sourcePath = path.join(outDir, 'src-beam-source.json');
    fs.writeFileSync(sourcePath, `${JSON.stringify(casePayload, null, 2)}\n`, 'utf8');
    await page.fill('#muTfM', '70');
    await page.waitForFunction(() => window.lastSrcBeamResult?.flexure?.demandTfM === 70);
    await page.setInputFiles('#caseFile', {
      name: 'src-beam-case.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(casePayload)),
    });
    await page.waitForFunction(() => document.querySelector('#actionStatus')?.textContent.includes('重算指紋一致'));
    assert.equal(await page.inputValue('#muTfM'), '150');
    assert.equal(await page.evaluate(() => window.lastSrcBeamCalculationFingerprint), initial.fingerprint);

    const popupPromise = page.waitForEvent('popup');
    await page.click('#btnReport');
    const report = await popupPromise;
    attachErrorCapture(report);
    await report.waitForLoadState('domcontentloaded');
    await report.waitForSelector('input[aria-label="核可人，選填"]');
    const reportText = await report.locator('body').innerText();
    for (const needle of ['SRC 梁正式規範核算計算書', '規範與構材條件', '100 年修正版', 'SRC 梁計算斷面', '非施工配筋詳圖', '計算過程明細', '檢核結論']) {
      assert.ok(reportText.includes(needle), `report includes ${needle}`);
    }
    const reportDiagram = report.locator('.rep-diagram img[alt="SRC 梁計算斷面"]');
    await reportDiagram.waitFor({ state: 'visible' });
    assert.equal(await reportDiagram.evaluate(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0), true);
    assert.equal(await reportDiagram.getAttribute('src'), pageDiagramSource, 'work page and formal report use the same calculation-section image');
    for (const needle of ['適用範圍與輸出邊界', '產報前閱讀狀態', '本區只顯示於 HTML', 'DRAFT', '非正式附件']) {
      assert.equal(reportText.includes(needle), false, `report excludes ${needle}`);
    }
    assert.equal(reportText.includes('計畫名稱'), false);
    assert.equal(reportText.includes('設計人員'), false);
    assert.match(await report.title(), /內部審閱/);

    const approval = report.getByRole('checkbox', { name: '核可為正式附件' });
    await report.getByLabel('核可人，選填').fill('瀏覽器測試核可人');
    await report.getByLabel('核可依據，選填').fill('SRC 梁重算核對');
    await approval.check();
    assert.match(await report.title(), /正式附件/);
    await report.getByLabel('核可依據，選填').fill('異動後依據');
    assert.equal(await approval.isChecked(), false, 'approval metadata change revokes approval');
    assert.match(await report.title(), /內部審閱/);
    await approval.check();
    assert.match(await report.title(), /正式附件/);

    await report.emulateMedia({ media: 'print' });
    assert.equal(await report.locator('.rep-toolbar').evaluate(node => node.getClientRects().length > 0), false);
    const pdfPath = path.join(outDir, 'src-beam-formal-report.pdf');
    await report.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await report.emulateMedia({ media: 'screen' });
    await report.screenshot({ path: path.join(outDir, 'src-beam-formal-report.png'), fullPage: true });
    await page.screenshot({ path: path.join(outDir, 'src-beam-page.png'), fullPage: true });
    const pdf = fs.readFileSync(pdfPath);
    assert.ok(pdf.length > 10000);
    assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
    const pdfValidation = validatePdfFile(pdfPath, {
      label: 'SRC 梁正式計算書',
      minTextLength: 500,
      titleNeedle: 'SRC 梁正式規範核算計算書',
      requiredNeedles: ['SRC 梁正式規範核算計算書', '規範與構材條件', 'SRC 梁計算斷面', '非施工配筋詳圖', '計算過程明細', '檢核結論', '計算指紋'],
      contentBoundaryProfile: 'traceable-calculation-book',
      continuationContextLabels: ['規範與構材條件', '採用斷面與材料', '設計需求', '計算線圖與示意圖', '寬厚比與撓曲強度', '剪力分擔強度', '計算過程明細', 'RC 撓曲內力平衡', 'SRC 撓曲強度疊加', '鋼骨與 RC 剪力容量', '剪力需求分擔', '檢核結果', '檢核結論'],
    });
    const evidenceName = 'src-beam-render-evidence.json';
    const evidencePath = path.join(outDir, evidenceName);
    const evidence = {
      schemaVersion: 1,
      kind: CANONICAL_RENDER_EVIDENCE_KIND,
      generatedAt: new Date().toISOString(),
      key: 'src-beam',
      artifact: path.basename(pdfPath),
      artifactBytes: pdf.length,
      artifactSha256: crypto.createHash('sha256').update(pdf).digest('hex'),
      sourceArtifact: path.basename(sourcePath),
      sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),
      calculationFingerprint: initial.fingerprint,
      documentState: 'formal-attachment',
      pdf: {
        pageCount: pdfValidation.pageCount,
        textLength: pdfValidation.textLength,
        footerLineCount: pdfValidation.footerLineCount,
        orphanHeadingCount: pdfValidation.orphanHeadingCount,
        uncontextualPageStartCount: pdfValidation.uncontextualPageStartCount,
        contentBoundaryProfile: pdfValidation.contentBoundary.profile,
      },
    };
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    writeEvidenceSummary(outDir, 'src-formal', [{
      key: 'src-beam',
      artifact: path.basename(pdfPath),
      evidence: evidenceName,
      sourceArtifact: path.basename(sourcePath),
      calculationFingerprint: initial.fingerprint,
      documentState: 'formal-attachment',
    }], ['src-beam']);
    assert.deepEqual(pageErrors, []);

    console.log(`SRC beam browser smoke: OK (${initial.fingerprint}; PDF ${pdf.length} bytes)`);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
