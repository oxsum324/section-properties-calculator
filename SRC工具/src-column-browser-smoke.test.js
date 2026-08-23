'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { validatePdfFile } = require('../結構工具箱/tools/rendered-delivery-evidence.js');

const repoRoot = path.resolve(__dirname, '..');
const outDir = path.resolve(process.env.SRC_COLUMN_BROWSER_OUT || path.join(repoRoot, 'output', 'pdf', 'src-column-research'));
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
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
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
    await page.goto(`http://127.0.0.1:${port}/${encodeURIComponent('SRC工具')}/src-column.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.lastSrcColumnResult?.checks?.engineeringStrength === true);

    const initial = await page.evaluate(() => ({
      status: window.lastSrcColumnResult.status,
      compressionStrength: window.lastSrcColumnResult.seismicAxial.compression.designStrengthTf,
      compressionDemand: window.lastSrcColumnResult.seismicAxial.compression.adoptedDemandTf,
      compressionUtilization: window.lastSrcColumnResult.seismicAxial.compression.utilization,
      tensionApplicable: window.lastSrcColumnResult.seismicAxial.tension.applicable,
      shearOk: window.lastSrcColumnResult.shear?.ok,
      jointRatioOk: window.lastSrcColumnResult.jointFlexuralStrengthRatio?.ok,
      strongColumnOk: window.lastSrcColumnResult.strongColumnWeakBeam?.ok,
      confinementOk: window.lastSrcColumnResult.confinement?.ok,
      fingerprint: window.lastSrcColumnCalculationFingerprint,
    }));
    assert.equal(initial.status, 'REVIEW');
    assert.ok(Math.abs(initial.compressionStrength - 1299.8858266) < 0.0001);
    assert.equal(initial.compressionDemand, 860);
    assert.ok(Math.abs(initial.compressionUtilization - 0.6615966) < 1e-6);
    assert.equal(initial.tensionApplicable, false);
    assert.equal(initial.shearOk, true);
    assert.equal(initial.jointRatioOk, true);
    assert.equal(initial.strongColumnOk, true);
    assert.equal(initial.confinementOk, true);
    assert.match(initial.fingerprint, /^CF-[A-F0-9]{16}$/);

    const pageDiagram = page.locator('#sectionDiagramImage');
    await pageDiagram.waitFor({ state: 'visible' });
    assert.equal(await pageDiagram.evaluate(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0), true);
    const pageDiagramSource = await pageDiagram.getAttribute('src');
    assert.match(pageDiagramSource, /^data:image\/svg\+xml;charset=utf-8,/);
    assert.match(await page.locator('#sectionDiagramCaption').innerText(), /非施工配筋詳圖/);

    await page.selectOption('#seismicAxis', 'y');
    await page.waitForFunction(() => window.lastSrcColumnResult?.seismicAxis === 'y' && window.lastSrcColumnResult?.checks?.engineeringStrength === true);
    const weakAxis = await page.evaluate(() => ({
      fingerprint: window.lastSrcColumnCalculationFingerprint,
      rcAxis: window.lastSrcColumnResult.rc.uniaxialAxis,
      strengthSource: window.lastSrcColumnResult.shear.strengthSource,
      steelNominalMomentTfM: window.lastSrcColumnResult.shear.probableMoments.steelNominalMomentTfM,
      highlyConfinedAxialTf: window.lastSrcColumnResult.confinement.axialTerms.highlyConfinedAxialTf,
    }));
    assert.notEqual(weakAxis.fingerprint, initial.fingerprint, 'selected direction participates in the calculation fingerprint');
    assert.equal(weakAxis.rcAxis, 'y');
    assert.equal(weakAxis.strengthSource, 'project-confirmed-weak-axis');
    assert.ok(Math.abs(weakAxis.steelNominalMomentTfM - 39.9) < 1e-10);
    assert.equal(weakAxis.highlyConfinedAxialTf, 0);
    assert.equal(await page.locator('[data-y-shear]').first().isVisible(), true);
    assert.equal(await page.locator('[data-x-shear]').first().isHidden(), true);
    assert.equal(await page.locator('#highlyConfinedAreaCm2').isEditable(), false, 'weak-axis Ahcc is visibly locked at zero');
    const weakAxisReference = page.locator('#weakAxisSteelReference');
    await weakAxisReference.waitFor({ state: 'visible' });
    const weakAxisReferenceText = await weakAxisReference.innerText();
    assert.match(weakAxisReferenceText, /AISC 360 G6 鋼骨弱軸對照/);
    assert.match(weakAxisReferenceText, /參考 Vns = 306\.432 tf/);
    assert.match(weakAxisReferenceText, /目前計算仍採你輸入並確認的 Vns = 100\.000 tf/);
    assert.match(weakAxisReferenceText, /不進計算書、列印、PDF 或計算指紋/);
    assert.equal(
      await weakAxisReference.locator('a').getAttribute('href'),
      'https://www.aisc.org/globalassets/aisc/university-programs/teaching-aids/first-semester-design-examples---v16.0.pdf',
      'weak-axis comparison links to the official AISC example',
    );
    await page.uncheck('#weakAxisStrengthsConfirmed');
    await page.waitForFunction(() => window.lastSrcColumnResult === null);
    assert.equal(await weakAxisReference.innerText(), '', 'invalid Y-axis input clears the stale external comparison');
    await page.check('#weakAxisStrengthsConfirmed');
    await page.waitForFunction(() => window.lastSrcColumnResult?.seismicAxis === 'y' && window.lastSrcColumnResult?.checks?.engineeringStrength === true);
    assert.match(await weakAxisReference.innerText(), /參考 Vns = 306\.432 tf/, 'valid Y-axis input restores the external comparison');
    const weakAxisDiagramSource = await pageDiagram.getAttribute('src');
    assert.ok(decodeURIComponent(weakAxisDiagramSource).includes('L1: x=7.0 cm, As=20.28 cm²'));
    await page.selectOption('#seismicAxis', 'x');
    await page.waitForFunction(fingerprint => window.lastSrcColumnCalculationFingerprint === fingerprint, initial.fingerprint);
    assert.equal(await page.locator('[data-y-shear]').first().isHidden(), true);
    assert.equal(await page.locator('[data-x-shear]').first().isVisible(), true);
    assert.equal(await weakAxisReference.isHidden(), true, 'external comparison is direction-scoped to the weak axis');

    await page.selectOption('#jointConnectionType', 'steel-beam-src-column');
    await page.waitForFunction(() => window.lastSrcColumnResult?.jointFlexuralStrengthRatio?.connectionType === 'steel-beam-src-column');
    assert.equal(await page.locator('[data-joint-rc]').first().isHidden(), true, 'steel-beam mode hides inapplicable RC-beam component inputs');
    assert.equal(await page.locator('#useVerifiedSmoothTransferAlternative').isDisabled(), false);
    assert.equal(await page.evaluate(() => window.lastSrcColumnResult.jointFlexuralStrengthRatio.requiredRatios.steel), 1.0, 'steel-beam mode defaults to equation 8.4-3');
    await page.check('#useVerifiedSmoothTransferAlternative');
    await page.waitForFunction(() => window.lastSrcColumnResult === null);
    await page.check('#smoothStressTransferAnalysisConfirmed');
    await page.waitForFunction(() => window.lastSrcColumnResult?.jointFlexuralStrengthRatio?.requiredRatios?.steel === 0.7);
    await page.selectOption('#jointConnectionType', 'src-beam-src-column');
    await page.waitForFunction(fingerprint => window.lastSrcColumnCalculationFingerprint === fingerprint, initial.fingerprint);
    assert.equal(await page.locator('#useVerifiedSmoothTransferAlternative').isChecked(), false, 'switching back to SRC-beam mode clears the inapplicable alternative');

    await page.uncheck('#enableShearSubcheck');
    await page.waitForFunction(() => window.lastSrcColumnResult?.shear === null && window.lastSrcColumnResult?.confinement === null);
    assert.equal(await page.locator('#enableConfinementSubcheck').isDisabled(), true, 'confinement toggle depends on the shear subcheck');
    assert.equal(await page.locator('#enableConfinementSubcheck').isChecked(), false, 'disabling shear clears the dependent confinement subcheck');
    await page.check('#enableShearSubcheck');
    await page.waitForFunction(() => window.lastSrcColumnResult?.shear?.ok === true && window.lastSrcColumnResult?.confinement === null);
    await page.check('#enableConfinementSubcheck');
    await page.waitForFunction(fingerprint => window.lastSrcColumnCalculationFingerprint === fingerprint, initial.fingerprint);

    await page.uncheck('#fuConfirmed');
    await page.waitForFunction(() => window.lastSrcColumnResult === null);
    assert.equal(await pageDiagram.isHidden(), true, 'invalid confirmation clears stale diagram and result');
    await page.check('#fuConfirmed');
    await page.waitForFunction(fingerprint => window.lastSrcColumnCalculationFingerprint === fingerprint, initial.fingerprint);

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

    const casePayload = await page.evaluate(() => window.buildSrcColumnCasePayload());
    const sourcePath = path.join(outDir, 'src-column-research-source.json');
    fs.writeFileSync(sourcePath, `${JSON.stringify(casePayload, null, 2)}\n`, 'utf8');
    await page.fill('#pdTf', '450');
    await page.waitForFunction(fingerprint => window.lastSrcColumnCalculationFingerprint && window.lastSrcColumnCalculationFingerprint !== fingerprint, initial.fingerprint);
    await page.setInputFiles('#caseFile', {
      name: 'src-column-research-case.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(casePayload)),
    });
    await page.waitForFunction(() => document.querySelector('#actionStatus')?.textContent.includes('重算指紋一致'));
    assert.equal(await page.inputValue('#pdTf'), '400');
    assert.equal(await page.evaluate(() => window.lastSrcColumnCalculationFingerprint), initial.fingerprint);

    const legacyPayload = JSON.parse(JSON.stringify(casePayload));
    legacyPayload.schema = 'src-column-research.case.v2';
    legacyPayload.tool.name = 'SRC 柱強軸耐震研究核算';
    legacyPayload.tool.version = 'v0.3';
    legacyPayload.tool.calculationEngine = 'src-column.core.v0.9.0-research';
    legacyPayload.input.schema = 'src-column.input.v8';
    delete legacyPayload.input.seismicAxis;
    delete legacyPayload.input.reinforcement.xLayers;
    for (const key of ['shear', 'jointFlexuralStrengthRatio', 'strongColumnWeakBeam', 'confinement']) delete legacyPayload.input[key].axis;
    await page.setInputFiles('#caseFile', {
      name: 'src-column-research-v03-case.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacyPayload)),
    });
    await page.waitForFunction(() => document.querySelector('#actionStatus')?.textContent.includes('已升級 v0.3 X 向案件'));
    assert.equal(await page.inputValue('#seismicAxis'), 'x');
    assert.match(await page.locator('#actionStatus').innerText(), /新計算指紋 CF-[A-F0-9]{16}/);

    const popupPromise = page.waitForEvent('popup');
    await page.click('#btnReport');
    const report = await popupPromise;
    attachErrorCapture(report);
    await report.waitForLoadState('domcontentloaded');
    const approval = report.getByRole('checkbox', { name: '核可為正式附件' });
    await approval.waitFor({ state: 'attached' });
    assert.equal(await approval.isDisabled(), true, 'research report cannot be promoted by checkbox');
    assert.equal(await report.locator('#repAttachmentApprovedBy').count(), 0, 'research report omits formal approval metadata controls');
    assert.match(await report.locator('.rep-approval-control').innerText(), /正式附件核可尚未開放/);
    assert.match(await report.title(), /內部審閱/);
    await report.evaluate(() => {
      const checkbox = document.getElementById('repAttachmentApproval');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.equal(await approval.isChecked(), false, 'approval policy also rejects scripted checkbox changes');
    assert.match(await report.title(), /內部審閱/);

    const reportText = await report.locator('body').innerText();
    for (const needle of [
      'SRC 柱 X 向（鋼骨強軸）耐震研究核算計算書', '規範、構材與分析條件', '採用斷面與材料',
      '第 9.3 節採用地震軸力資料', '第 9.6.2 節採用柱剪力資料',
      '第 8.4.2 節採用接頭面分量彎矩', '第 9.6.1 節採用接頭面名義彎矩', '第 9.6.3 節採用圍束資料',
      '第 8.4.2 節接頭撓曲強度比', '第 9.6 節X 向（鋼骨強軸）耐震子檢核', 'SRC 柱計算斷面', '計算過程明細', '檢核結論',
    ]) assert.ok(reportText.includes(needle), `report includes ${needle}`);
    for (const needle of ['適用範圍與輸出邊界', '產報前閱讀狀態', '本區只顯示於 HTML', 'DRAFT', '非正式附件', '接頭區剪力與接合細部']) {
      assert.equal(reportText.includes(needle), false, `report excludes ${needle}`);
    }
    const reportDiagram = report.locator('.rep-diagram img[alt="SRC 柱計算斷面"]');
    await reportDiagram.waitFor({ state: 'visible' });
    assert.equal(await reportDiagram.evaluate(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0), true);
    assert.equal(await reportDiagram.getAttribute('src'), pageDiagramSource, 'page and report use the same calculation-section image');

    await report.emulateMedia({ media: 'print' });
    assert.equal(await report.locator('.rep-toolbar').evaluate(node => node.getClientRects().length > 0), false);
    const pdfPath = path.join(outDir, 'src-column-research-report.pdf');
    await report.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await report.emulateMedia({ media: 'screen' });
    await report.screenshot({ path: path.join(outDir, 'src-column-research-report.png'), fullPage: true });
    await page.screenshot({ path: path.join(outDir, 'src-column-research-page.png'), fullPage: true });
    const pdf = fs.readFileSync(pdfPath);
    assert.ok(pdf.length > 10000);
    assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
    const pdfValidation = validatePdfFile(pdfPath, {
      label: 'SRC 柱 X 向耐震研究計算書',
      minTextLength: 600,
      titleNeedle: 'SRC 柱 X 向（鋼骨強軸）耐震研究核算計算書',
      requiredNeedles: [
        'SRC 柱 X 向（鋼骨強軸）耐震研究核算計算書', '規範、構材與分析條件', '採用斷面與材料',
        '第 9.3 節採用地震軸力資料', '第 9.6.2 節採用柱剪力資料',
        '第 8.4.2 節採用接頭面分量彎矩', '第 9.6.1 節採用接頭面名義彎矩', '第 9.6.3 節採用圍束資料',
        '第 8.4.2 節接頭撓曲強度比', '第 9.6 節X 向（鋼骨強軸）耐震子檢核', 'SRC 柱計算斷面', '計算過程明細', '檢核結論', '計算指紋',
      ],
      contentBoundaryProfile: 'traceable-calculation-book',
      continuationContextLabels: [
        '規範、構材與分析條件', '採用斷面與材料', '第 9.3 節採用地震軸力資料',
        '第 9.6.2 節採用柱剪力資料', '第 9.6.1 節採用接頭面名義彎矩', '第 9.6.3 節採用圍束資料',
        '第 8.4.2 節採用接頭面分量彎矩', '計算線圖與示意圖', '構材斷面與軸彎互制', '第 9.3 節耐震軸向強度',
        '第 8.4.2 節接頭撓曲強度比',
        '第 9.6 節X 向（鋼骨強軸）耐震子檢核',
        '計算過程明細', '鋼骨與 RC 剛度分配', '第 6.4 節鋼骨受壓與 SRC 受壓強度',
        '式 (9.3-1) 受壓組合', '式 (9.3-2) 受拉組合', '第 9.6.2 節X 向（鋼骨強軸）柱剪力',
        '式 (9.6-1) 強柱弱梁', '式 (9.6-6)～(9.6-10) 矩形柱圍束', '控制結果', '檢核結論',
      ],
    });
    await page.selectOption('#seismicAxis', 'y');
    await page.fill('#muyTfM', '60');
    await page.waitForFunction(() => window.lastSrcColumnResult?.seismicAxis === 'y'
      && window.lastSrcColumnInput?.demands?.muyTfM === 60
      && window.lastSrcColumnResult?.checks?.engineeringStrength === true);
    assert.ok(Math.abs(await page.evaluate(() => window.lastSrcColumnInput.demands.muyTfM) - 60) < 1e-10, 'weak-axis PDF exercises nonzero Muy');
    const weakAxisFingerprint = await page.evaluate(() => window.lastSrcColumnCalculationFingerprint);
    const weakAxisPopupPromise = page.waitForEvent('popup');
    await page.click('#btnReport');
    const weakAxisReport = await weakAxisPopupPromise;
    attachErrorCapture(weakAxisReport);
    await weakAxisReport.waitForLoadState('domcontentloaded');
    const weakAxisReportText = await weakAxisReport.locator('body').innerText();
    for (const needle of [
      'SRC 柱 Y 向（鋼骨弱軸）耐震研究核算計算書',
      '本計算書核算方向', 'Y 向（鋼骨弱軸）', '專案確認 Vns / Vnrc',
      '第 9.6 節Y 向（鋼骨弱軸）耐震子檢核', '第 9.6.2 節Y 向（鋼骨弱軸）柱剪力',
    ]) assert.ok(weakAxisReportText.includes(needle), `weak-axis report includes ${needle}`);
    for (const needle of ['適用範圍與輸出邊界', '產報前閱讀狀態', '本區只顯示於 HTML', 'DRAFT', '非正式附件', 'AISC 360 G6', '306.432']) {
      assert.equal(weakAxisReportText.includes(needle), false, `weak-axis report excludes ${needle}`);
    }
    const weakAxisPdfPath = path.join(outDir, 'src-column-research-y-axis-report.pdf');
    await weakAxisReport.emulateMedia({ media: 'print' });
    await weakAxisReport.pdf({ path: weakAxisPdfPath, format: 'A4', printBackground: true });
    await weakAxisReport.emulateMedia({ media: 'screen' });
    await weakAxisReport.screenshot({ path: path.join(outDir, 'src-column-research-y-axis-report.png'), fullPage: true });
    await page.screenshot({ path: path.join(outDir, 'src-column-research-y-axis-page.png'), fullPage: true });
    const weakAxisPdf = fs.readFileSync(weakAxisPdfPath);
    const weakAxisPdfValidation = validatePdfFile(weakAxisPdfPath, {
      label: 'SRC 柱 Y 向耐震研究計算書',
      minTextLength: 600,
      titleNeedle: 'SRC 柱 Y 向（鋼骨弱軸）耐震研究核算計算書',
      requiredNeedles: [
        'SRC 柱 Y 向（鋼骨弱軸）耐震研究核算計算書', '本計算書核算方向', '專案確認 Vns / Vnrc',
        '第 9.6 節Y 向（鋼骨弱軸）耐震子檢核', '第 9.6.2 節Y 向（鋼骨弱軸）柱剪力',
        'SRC 柱計算斷面', '計算過程明細', '檢核結論', '計算指紋',
      ],
      contentBoundaryProfile: 'traceable-calculation-book',
      continuationContextLabels: [
        '規範、構材與分析條件', '採用斷面與材料', '第 9.3 節採用地震軸力資料',
        '第 9.6.2 節採用柱剪力資料', '第 8.4.2 節採用接頭面分量彎矩',
        '第 9.6 節Y 向（鋼骨弱軸）耐震子檢核', '計算過程明細',
        '第 9.6.2 節Y 向（鋼骨弱軸）柱剪力', '控制結果', '檢核結論',
      ],
    });
    const evidence = {
      schemaVersion: 1,
      kind: 'src-column-research-render-evidence',
      generatedAt: new Date().toISOString(),
      artifact: path.basename(pdfPath),
      artifactBytes: pdf.length,
      artifactSha256: crypto.createHash('sha256').update(pdf).digest('hex'),
      sourceArtifact: path.basename(sourcePath),
      sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),
      calculationFingerprint: initial.fingerprint,
      documentState: 'internal-review',
      formalApprovalAllowed: false,
      pdf: { pageCount: pdfValidation.pageCount, textLength: pdfValidation.textLength },
      companionWeakAxis: {
        artifact: path.basename(weakAxisPdfPath),
        artifactBytes: weakAxisPdf.length,
        artifactSha256: crypto.createHash('sha256').update(weakAxisPdf).digest('hex'),
        calculationFingerprint: weakAxisFingerprint,
        pageCount: weakAxisPdfValidation.pageCount,
        textLength: weakAxisPdfValidation.textLength,
      },
    };
    fs.writeFileSync(path.join(outDir, 'src-column-research-render-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    assert.deepEqual(pageErrors, []);
    console.log(`SRC column browser smoke: OK (X ${initial.fingerprint}/${pdfValidation.pageCount} pages; Y ${weakAxisFingerprint}/${weakAxisPdfValidation.pageCount} pages)`);
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
