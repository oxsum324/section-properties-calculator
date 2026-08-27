const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { readPdfTextWithPoppler } = require('./report-screenshot-quality');
const PileCapBridge = require('../shared/pile-cap-3d-stm-bridge.js');
const LoadCombo = require('../../結構工具箱/core/loads/loadcombo.js');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_SCREEN = path.join(ROOT, 'output', 'playwright');
const OUT_PDF = path.join(ROOT, 'output', 'pdf');
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function serve(rootDir) {
  const mime = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    const file = path.normalize(path.join(rootDir, pathname === '/' ? 'index.html' : pathname));
    const rel = path.relative(rootDir, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  fs.mkdirSync(OUT_SCREEN, { recursive:true });
  fs.mkdirSync(OUT_PDF, { recursive:true });
  const chromePath = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert.ok(chromePath, 'Chrome or Edge executable is required');
  let browser;
  let server;
  try {
    server = await serve(ROOT);
    const port = server.address().port;
    browser = await chromium.launch({ headless:true, executablePath:chromePath });
    const context = await browser.newContext({ viewport:{ width:1440, height:1100 } });
    const loadComponentPackage = LoadCombo.createComponentPackage({
      generatedAt:'2026-08-26T01:02:03.000Z',
      source:{ tool:'analysis-export', label:'橋接分析模型 A', version:'2026.1', analysisId:'ANA-PC3D-001', caseSet:'ULS 基本工況' },
      forces:{
        P:{ D:300, L:50, W:0, E:0 },
        Mx:{ D:0, L:0, W:100, E:0 },
        My:{ D:0, L:0, W:0, E:100 },
      },
    });
    const pendingForcePayload = {
      meta:{ source:'橋接分析模型 A', caseName:'ULS 基本工況', factored:true, loadBasis:'factored', timestamp:'2026-08-26T01:02:04.000Z' },
      forces:{ P:420, Mx:0, My:0 },
      loadComponents:loadComponentPackage,
      target:'foundation-pile-cap',
    };
    await context.addInitScript(payload => {
      if (location.pathname.endsWith('/foundation.html')) {
        localStorage.setItem('structToolbox.pendingForces', JSON.stringify(payload));
      }
    }, pendingForcePayload);
    const foundation = await context.newPage();
    const errors = [];
    const bindErrors = page => {
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('pageerror', error => errors.push(error.message));
    };
    bindErrors(foundation);
    const foundationUrl = `http://127.0.0.1:${port}/${encodeURIComponent('鋼筋混凝土')}/tools/foundation.html?import=1`;
    const response = await foundation.goto(foundationUrl, { waitUntil:'load', timeout:30000 });
    assert.equal(response.status(), 200);
    await foundation.waitForFunction(() => window.PileCap3DSTMBridge && window.openPileCap3DSTMWithCurrentData && window.ftLast);
    await foundation.click('[data-tab="pile"]');
    const fields = {
      projName:'三維 STM 橋接測試', projNo:'PC3D-BRIDGE-001', c1:'100', c2:'100',
      pileD:'100', pileNL:'2', pileNB:'2', pileSL:'300', pileSB:'300',
      pcB:'600', pcL:'600', pcH:'180', pcCover:'7.5',
      pMx:'0', pMy:'0', pNBar:'20',
    };
    await foundation.waitForFunction(() => !document.querySelector('#btnAdoptPileCapLoadComponents').hidden);
    assert.match(await foundation.locator('#pileCapLoadComponentCandidate').innerText(), /橋接分析模型 A.*ANA-PC3D-001.*Pu \(tf\).*W 100\.00.*E 100\.00/s);
    await foundation.click('#btnAdoptPileCapLoadComponents');
    await foundation.waitForFunction(() => window.inspectPileCapLoadComponentSource?.().valid === true);
    assert.equal(await foundation.inputValue('#pileCap3DSTMCaseMode'), 'auto-lrfd');
    assert.deepEqual(await foundation.evaluate(() => ({
      pPD:document.querySelector('#pPD').value,
      pPL:document.querySelector('#pPL').value,
      muxW:document.querySelector('#pileCapMuxW').value,
      muyE:document.querySelector('#pileCapMuyE').value,
      pending:localStorage.getItem('structToolbox.pendingForces'),
    })), { pPD:'300', pPL:'50', muxW:'100', muyE:'100', pending:null });
    for (const [id, value] of Object.entries(fields)) await foundation.fill(`#${id}`, value);
    await foundation.click('#btnPreviewPileCap3DSTMCombos');
    assert.match(await foundation.locator('#pileCap3DSTMComboPreview').innerText(), /loadcombo-tuples-v2.*10 組/i);
    await foundation.selectOption('#pBarNo', '#9');
    await foundation.waitForFunction(() => window.ftLast?.tab === 'pile' && Math.abs(window.ftLast.Pu_tf - 440) < 1e-9 && window.ftLast.pileReactions?.length === 4);
    const sourcePayload = await foundation.evaluate(() => window.buildPileCap3DSTMBridgePayload());
    assert.equal(sourcePayload.schema, 'rc-foundation-pile-cap-3d-stm.v2');
    assert.match(sourcePayload.source.calculationFingerprint, /^CF-[0-9A-F]{16}$/);
    assert.equal(sourcePayload.model.loadCases.length, 10);
    assert.deepEqual(sourcePayload.model.loadCases.slice(0, 2).map(item => item.combination), ['1.4D','1.2D + 1.6L']);
    assert.equal(sourcePayload.model.loadCombinationSource.mode, 'auto-lrfd');
    assert.equal(sourcePayload.model.loadCombinationSource.loadComboSchema, 'loadcombo-tuples-v2');
    assert.equal(sourcePayload.model.loadCombinationSource.inputForces.Mux.W, 100);
    assert.equal(sourcePayload.model.loadCombinationSource.inputForces.Muy.E, 100);
    assert.equal(sourcePayload.model.loadCombinationSource.inputSource.source.analysisId, 'ANA-PC3D-001');
    assert.equal(sourcePayload.model.loadCombinationSource.inputSource.transport.kind, 'force-picker');
    assert.match(sourcePayload.model.loadCombinationSource.inputSource.transport.contentSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(sourcePayload.model.reactions.map(item => item.reactionTf), [105,105,105,105]);
    assert.ok(sourcePayload.model.loadCases.some(item => item.combination === '1.2D + 1.0L + 1.0W'));
    assert.ok(sourcePayload.model.loadCases.some(item => item.combination === '1.2D + 1.0L - 1.0E'));
    const foundationComboScreenshotPath = path.join(OUT_SCREEN, 'pile-cap-3d-stm-auto-load-combinations.png');
    await foundation.locator('#pileCap3DSTMBridgeBox').screenshot({ path:foundationComboScreenshotPath });
    assert.ok(fs.statSync(foundationComboScreenshotPath).size > 12000);

    await foundation.fill('#pileCapMuxW', '101');
    const staleSourceMessage = await foundation.evaluate(() => {
      try { window.buildPileCap3DSTMBridgePayload(); return null; }
      catch (error) { return error.message; }
    });
    assert.match(staleSourceMessage || '', /來源追溯已失效/);
    await foundation.fill('#pileCapMuxW', '100');
    await foundation.waitForFunction(() => window.inspectPileCapLoadComponentSource().valid === true);

    const popupPromise = foundation.waitForEvent('popup');
    await foundation.click('#btnOpenPileCap3DSTM');
    const target = await popupPromise;
    bindErrors(target);
    await target.waitForLoadState('load');
    await target.waitForFunction(() => window.inspectFoundationPileCapBridge?.().valid === true);
    await target.waitForFunction(() => window.getPileCap3DSTMEnvelope?.()?.caseCount === 10);
    assert.equal(await target.inputValue('#projNo'), 'PC3D-BRIDGE-001');
    assert.equal(await target.inputValue('#capLengthX'), '600');
    assert.equal(await target.inputValue('#h'), '180');
    assert.equal(await target.inputValue('#xTieBar'), '#9');
    assert.equal(await target.inputValue('#xTieCount'), '20');
    assert.equal(await target.locator('#foundationLoadCaseSelect option').count(), 10);
    const selectedCase = await target.inputValue('#foundationLoadCaseSelect');
    assert.ok(/^LC(?:[1-9]|10)$/.test(selectedCase), `selected case is recognized, got ${selectedCase}`);
    const envelopeState = await target.evaluate(() => window.getPileCap3DSTMEnvelope());
    const xTieControl = envelopeState.entries.find(item => item.key === 'xTie');
    const yTieControl = envelopeState.entries.find(item => item.key === 'yTie');
    const pileReactionControl = envelopeState.entries.find(item => item.key === 'pileReaction');
    assert.equal(envelopeState.allStrengthPass, true);
    assert.ok(envelopeState.entries.filter(item => !item.demandOnly).every(item => item.ok === true));
    assert.ok(xTieControl?.combination && yTieControl?.combination);
    assert.match(pileReactionControl.combination, /W|E/);
    assert.ok(pileReactionControl.value > 110);
    assert.match(await target.locator('#foundationPileCapBridgeStatus').innerText(), /已採用.*LoadCombo LRFD.*CF-[0-9A-F]{16}.*10 組/);
    assert.match(await target.locator('#foundationEnvelopeSummary').innerText(), /共 10 組.*整體控制/);
    assert.ok(await target.locator('#foundationEnvelopeRows tr').count() >= 7);
    assert.equal(await target.isChecked('#reactionSourceConfirmed'), false);
    const expectedSelectedReactions = PileCapBridge.toToolFields(sourcePayload, selectedCase).pileReactions;
    assert.equal((await target.inputValue('#pileReactions')).trim(), expectedSelectedReactions);

    const switchCase = selectedCase === 'LC1' ? 'LC2' : 'LC1';
    await target.selectOption('#foundationLoadCaseSelect', switchCase);
    await target.waitForFunction(caseId => document.querySelector('#foundationLoadCaseSelect').value === caseId, switchCase);
    assert.equal(await target.evaluate(() => window.inspectFoundationPileCapBridge().valid), true);
    await target.selectOption('#foundationLoadCaseSelect', selectedCase);

    for (const id of ['reactionSourceConfirmed','threeDimensionalTopologyConfirmed','nodalGeometryConfirmed','anchorageConfirmed','localTieDistributionConfirmed']) {
      await target.check(`#${id}`);
    }
    await target.click('#btnCalc');
    assert.match(await target.locator('#statusBanner').innerText(), /數值檢核與模型採用確認完成/);
    assert.equal(await target.locator('#attachmentReadiness').getAttribute('data-attachment-status'), 'ready');

    const screenshotPath = path.join(OUT_SCREEN, 'pile-cap-3d-stm-bridge-page.png');
    await target.screenshot({ path:screenshotPath, fullPage:true });
    assert.ok(fs.statSync(screenshotPath).size > 15000);

    const reportPromise = target.waitForEvent('popup');
    await target.click('#btnReport');
    const report = await reportPromise;
    bindErrors(report);
    await report.waitForLoadState('load');
    await report.waitForSelector('.rep-paper');
    const reportText = await report.locator('body').innerText();
    for (const needle of [
      'RC 樁帽三維壓拉桿模型檢核計算書',
      '來源追溯',
      '基礎 Foundation 設計／檢核 V3.1',
      'rc-foundation-pile-cap-3d-stm.v2',
      sourcePayload.source.calculationFingerprint,
      '共用 LoadCombo LRFD',
      '基本分量匯入來源',
      '橋接分析模型 A',
      'ANA-PC3D-001',
      '基本載重分量',
      '1.4D',
      '1.2D + 1.0L + 1.0W',
      '1.2D + 1.0L - 1.0E',
      '載重組合清冊',
      '多載重組合控制包絡',
      '工具版本 V0.5',
    ]) assert.ok(reportText.replace(/\s+/g, '').includes(needle.replace(/\s+/g, '')), `report includes ${needle}`);
    for (const forbidden of ['DRAFT','產報前檢查','頁面輔助','匯入版本化 JSON']) assert.ok(!reportText.includes(forbidden));

    const pdfPath = path.join(OUT_PDF, 'pile-cap-3d-stm-bridge-report.pdf');
    await report.pdf({ path:pdfPath, format:'A4', printBackground:true, margin:{ top:'10mm', right:'8mm', bottom:'10mm', left:'8mm' } });
    const pdf = readPdfTextWithPoppler(pdfPath);
    assert.ok(pdf.pages >= 3 && pdf.pages <= 9, `expected 3-9 pages, got ${pdf.pages}`);
    assert.ok(pdf.text.includes('來源追溯'));
    assert.ok(pdf.text.includes('多載重組合控制包絡'));
    assert.ok(pdf.text.includes('共用 LoadCombo LRFD'));
    assert.ok(pdf.text.includes('基本分量匯入來源'));
    assert.ok(pdf.text.includes('橋接分析模型 A'));
    assert.ok(pdf.text.includes('基本載重分量'));
    assert.ok(pdf.text.includes('1.2D + 1.0L + 1.0W') && pdf.text.includes('1.2D + 1.0L - 1.0E'));
    assert.ok(pdf.text.includes(sourcePayload.source.calculationFingerprint));
    assert.ok(!pdf.text.includes('NG'));
    assert.ok(!pdf.text.includes('匯入版本化 JSON'));
    await report.close();

    const fileImport = await context.newPage();
    bindErrors(fileImport);
    await fileImport.goto(`http://127.0.0.1:${port}/${encodeURIComponent('鋼筋混凝土')}/tools/foundation.html`, { waitUntil:'load' });
    await fileImport.click('[data-tab="pile"]');
    assert.equal(await fileImport.inputValue('#pPD'), '200');
    await fileImport.setInputFiles('#pileCapLoadComponentJsonFile', {
      name:'analysis-load-components.json',
      mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(loadComponentPackage), 'utf8'),
    });
    await fileImport.waitForFunction(() => !document.querySelector('#btnAdoptPileCapLoadComponents').hidden);
    assert.equal(await fileImport.inputValue('#pPD'), '200', 'file import remains a candidate until explicit adoption');
    await fileImport.click('#btnAdoptPileCapLoadComponents');
    await fileImport.waitForFunction(() => window.inspectPileCapLoadComponentSource?.().valid === true);
    assert.equal(await fileImport.inputValue('#pPD'), '300');
    assert.equal(await fileImport.evaluate(() => window.inspectPileCapLoadComponentSource().record.transport.kind), 'file');
    assert.match(await fileImport.locator('#pileCapLoadComponentSourceStatus').innerText(), /analysis-load-components\.json.*SHA-256/);
    await fileImport.click('#btnClearPileCapLoadComponentSource');
    assert.equal(await fileImport.evaluate(() => window.inspectPileCapLoadComponentSource().exists), false);
    assert.equal(await fileImport.inputValue('#pPD'), '300', 'clearing provenance preserves adopted numeric fields');

    const jointReactionCsv = [
      'TABLE:  "Joint Reactions"',
      'Story,Point,Unique Name,OutputCase,CaseType,StepType,F1,F2,F3,M1,M2,M3',
      'Base,P1,101,D,Linear Static,,0,0,100,0,0,0',
      'Base,P1,101,L,Linear Static,,0,0,40,0,0,0',
      'Base,P1,101,W,Linear Static,,0,0,0,12,0,0',
      'Base,P1,101,E,Linear Static,,0,0,0,0,-15,0',
    ].join('\r\n');
    await fileImport.click('#jointReactionAdapterPanel summary');
    await fileImport.setInputFiles('#jointReactionTableFile', {
      name:'ETABS-joint-reactions.csv',
      mimeType:'text/csv',
      buffer:Buffer.from(jointReactionCsv, 'utf8'),
    });
    await fileImport.waitForFunction(() => document.querySelector('#btnBuildJointReactionCandidate')?.disabled === false);
    assert.equal(await fileImport.inputValue('#pPD'), '300', 'table reading does not write design fields');
    assert.equal(await fileImport.inputValue('#jointReactionPoint'), 'Base / P1');
    await fileImport.selectOption('#jointReactionCaseD', 'D');
    await fileImport.selectOption('#jointReactionCaseL', 'L');
    await fileImport.selectOption('#jointReactionCaseW', 'W');
    await fileImport.selectOption('#jointReactionCaseE', 'E');
    await fileImport.click('#btnBuildJointReactionCandidate');
    await fileImport.waitForFunction(() => !document.querySelector('#btnAdoptPileCapLoadComponents').hidden);
    assert.equal(await fileImport.inputValue('#pPD'), '300', 'joint reaction conversion remains a candidate until explicit adoption');
    assert.match(await fileImport.locator('#pileCapLoadComponentCandidate').innerText(), /ETABS Joint Reactions 轉接器/);
    await fileImport.click('#btnAdoptPileCapLoadComponents');
    await fileImport.waitForFunction(() => window.inspectPileCapLoadComponentSource?.().valid === true);
    assert.equal(await fileImport.inputValue('#pPD'), '100');
    assert.equal(await fileImport.inputValue('#pPL'), '40');
    assert.equal(await fileImport.inputValue('#pileCapMuxW'), '-12');
    assert.equal(await fileImport.inputValue('#pileCapMuyE'), '15');
    assert.equal(await fileImport.evaluate(() => window.inspectPileCapLoadComponentSource().record.transport.kind), 'file');
    assert.match(await fileImport.locator('#pileCapLoadComponentSourceStatus').innerText(), /ETABS-joint-reactions\.csv.*SHA-256/);
    assert.match(await fileImport.locator('#jointReactionAdapterStatus').innerText(), /已採用.*SHA-256/);
    await fileImport.close();

    const currentMy = Number(await target.inputValue('#My'));
    await target.fill('#My', String(currentMy + 1));
    await target.click('#btnCalc');
    assert.equal(await target.evaluate(() => window.inspectFoundationPileCapBridge().valid), false);
    assert.match(await target.locator('#foundationPileCapBridgeStatus').innerText(), /來源追溯已失效.*My/);
    assert.equal(await target.isChecked('#reactionSourceConfirmed'), false);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ pass:true, foundationComboScreenshotPath, screenshotPath, pdfPath, pages:pdf.pages, fingerprint:sourcePayload.source.calculationFingerprint }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
