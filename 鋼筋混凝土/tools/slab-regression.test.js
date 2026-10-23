const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { installReportPopupFixture } = require('../../report-popup-fixture.test.js');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.RC_TEST_PORT || 8123);
const TOOL_URL = `http://127.0.0.1:${PORT}/%E9%8B%BC%E7%AD%8B%E6%B7%B7%E5%87%9D%E5%9C%9F/tools/slab.html`;
const htmlPath = path.join(__dirname, 'slab.html');
const commonPath = path.join(__dirname, '..', 'shared', 'common.js');
const stylePath = path.join(__dirname, '..', 'shared', 'style.css');
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

async function exerciseSlabProjectStorage(page) {
  await page.evaluate(() => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if ((el.type || '').toLowerCase() === 'checkbox') el.checked = !!value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    document.querySelector('.mode-bar__btn[data-mode="check"]')?.click();
    if (typeof window.setLoadMode === 'function') window.setLoadMode('combo');
    setField('projName', '板專案存讀檔測試');
    setField('projNo', 'RC-SLAB-001');
    setField('projDesigner', 'QA');
    setField('showSteps', true);
    setField('showDetailHelp', true);
    setField('showCaseTools', false);
    setField('slabType', 'flat');
    setField('Lx', 620);
    setField('Ly', 690);
    setField('h', 24);
    setField('cover', 2.5);
    setField('fc', 350);
    setField('fy', 4200);
    setField('fyT', 4200);
    setField('supportX', 'bothEnd');
    setField('supportY', 'bothEnd');
    setField('supW', 55);
    setField('autoSelfWt', false);
    setField('wuCombo', 1.42);
    setField('panelPos', 'interior');
    setField('c1', 55);
    setField('c2', 55);
    setField('colPos', 'interior');
    setField('punchMode', 'prelim');
    setField('layerMode', 'thick');
    setField('barNoXBot', '#5');
    setField('barNoYBot', '#5');
    setField('barNoXTop', '#5');
    setField('barNoYTop', '#5');
    setField('barSpXBot', 12);
    setField('barSpYBot', 13);
    if (typeof window.updateSelfWt === 'function') window.updateSelfWt();
    if (typeof window.updatePunchModeHint === 'function') window.updatePunchModeHint();
    if (typeof window.syncVsInputs === 'function') window.syncVsInputs();
    if (typeof window.syncDesignFields === 'function') window.syncDesignFields();
    if (typeof window.calcSlab === 'function') window.calcSlab();
  });
  await wait(250);

  const saved = await page.evaluate(() => window.collectSlabProjectData());
  assert(saved.schema === 'rc-slab-project-v1', 'slab project schema', saved.schema);
  assert(saved.tool === 'rc-slab', 'slab project tool id', saved.tool);
  assert(saved.mode === 'check', 'slab project stores mode', saved.mode);
  assert(saved.loadMode === 'combo', 'slab project stores load mode', saved.loadMode);
  assert(saved.metadata.projectName === '板專案存讀檔測試', 'slab project metadata', saved.metadata.projectName);
  assert(saved.fields.wuCombo.value === '1.42', 'slab project stores numeric input as editable value', saved.fields.wuCombo.value);
  assert(saved.fields.showSteps.checked === true, 'slab project stores checkbox state', saved.fields.showSteps.checked);
  assert(saved.fields.slabProjectFile == null, 'slab project excludes file input', 'file input excluded');
  assert(saved.fields.caseJson == null, 'slab project excludes case JSON textarea', 'case textarea excluded');
  assert(saved.fields.baselineReport == null, 'slab project excludes baseline textarea', 'baseline textarea excluded');

  const placeholderSaved = await page.evaluate(() => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if ((el.type || '').toLowerCase() === 'checkbox') el.checked = !!value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setField('projName', '未填');
    setField('projNo', 'RC-SLAB-PLACEHOLDER');
    setField('projDesigner', '未填');
    return window.collectSlabProjectData();
  });
  assert(placeholderSaved.metadata.projectName === '', 'slab placeholder project name is scrubbed from metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.metadata.projectNo === 'RC-SLAB-PLACEHOLDER', 'slab placeholder project number remains editable metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.metadata.designer === '', 'slab placeholder designer is scrubbed from metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.fields.projName.value === '', 'slab placeholder project name is scrubbed from fields payload', JSON.stringify(placeholderSaved.fields.projName));
  assert(placeholderSaved.fields.projDesigner.value === '', 'slab placeholder designer is scrubbed from fields payload', JSON.stringify(placeholderSaved.fields.projDesigner));

  const restored = await page.evaluate(payload => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if ((el.type || '').toLowerCase() === 'checkbox') el.checked = !!value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    document.querySelector('.mode-bar__btn[data-mode="design"]')?.click();
    if (typeof window.setLoadMode === 'function') window.setLoadMode('simple');
    setField('projName', '已清除');
    setField('Lx', 100);
    setField('wuCombo', 0.1);
    const result = window.applySlabProjectData(payload, { silent: true });
    return {
      applied: result.applied,
      mode: document.querySelector('.mode-bar__btn.active')?.dataset.mode,
      loadMode: document.querySelector('.load-mode-btn.active')?.dataset.load,
      projectName: document.getElementById('projName')?.value,
      projectNo: document.getElementById('projNo')?.value,
      Lx: document.getElementById('Lx')?.value,
      wuCombo: document.getElementById('wuCombo')?.value,
      showSteps: document.getElementById('showSteps')?.checked,
      banner: document.getElementById('bannerStatus')?.textContent?.replace(/\s+/g, ' ').trim()
    };
  }, saved);
  assert(restored.applied > 40, 'slab project restore applies fields', restored.applied);
  assert(restored.mode === 'check', 'slab project restore mode', restored.mode);
  assert(restored.loadMode === 'combo', 'slab project restore load mode', restored.loadMode);
  assert(restored.projectName === '板專案存讀檔測試', 'slab project restore project name', restored.projectName);
  assert(restored.projectNo === 'RC-SLAB-001', 'slab project restore project number', restored.projectNo);
  assert(restored.Lx === '620', 'slab project restore Lx', restored.Lx);
  assert(restored.wuCombo === '1.42', 'slab project restore wuCombo', restored.wuCombo);
  assert(restored.showSteps === true, 'slab project restore showSteps checkbox', restored.showSteps);
  assert(restored.banner && restored.banner.length > 0, 'slab project restore recalculates', restored.banner);

  await page.evaluate(() => {
    document.getElementById('projName').value = '檔案匯入前';
    document.getElementById('Lx').value = '101';
  });
  const rejectedSlabProject = JSON.parse(JSON.stringify(saved));
  rejectedSlabProject.appVersion = 'V0.0';
  await page.setInputFiles('#slabProjectFile', {
    name: 'rc-slab-project-wrong-version.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(rejectedSlabProject), 'utf8')
  });
  await page.waitForFunction(() => document.getElementById('slabProjectStatus')?.textContent?.includes('已保留原輸入'));
  const rejectedImport = await page.evaluate(() => ({
    projectName: document.getElementById('projName')?.value,
    Lx: document.getElementById('Lx')?.value,
    status: document.getElementById('slabProjectStatus')?.textContent || ''
  }));
  assert(rejectedImport.projectName === '檔案匯入前' && rejectedImport.Lx === '101', 'slab rejects incompatible source without changing inputs', JSON.stringify(rejectedImport));
  assert(rejectedImport.status.includes('工具版本不符'), 'slab explains incompatible source rejection', rejectedImport.status);
  const legacySlabProject = JSON.parse(JSON.stringify(saved));
  legacySlabProject.appVersion = 'V3.1';
  await page.setInputFiles('#slabProjectFile', {
    name: 'rc-slab-project-v3.1.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacySlabProject), 'utf8')
  });
  await page.waitForFunction(() => document.getElementById('slabProjectStatus')?.textContent?.includes('原為 V3.1 專案檔，已依 V3.3 重新計算'));
  const legacyImport = await page.evaluate(() => ({
    projectName: document.getElementById('projName')?.value,
    Lx: document.getElementById('Lx')?.value,
    status: document.getElementById('slabProjectStatus')?.textContent || '',
    appVersion: window.collectSlabProjectData()?.appVersion
  }));
  assert(legacyImport.projectName === '板專案存讀檔測試' && legacyImport.Lx === '620', 'slab accepts V3.1 project inputs for recalculation', JSON.stringify(legacyImport));
  assert(legacyImport.appVersion === 'V3.3', 'slab upgrades replayed project provenance to V3.3', JSON.stringify(legacyImport));
  assert(legacyImport.status.includes('請另存 V3.3 專案檔'), 'slab discloses V3.1 calculation migration', legacyImport.status);
  // V3.2（E1 前上線版）舊檔與 V3.1 走同一遷移分支；fixture 由 a2054691 之 V3.2 頁面以上方同一組輸入另存
  await page.setInputFiles('#slabProjectFile', {
    name: 'rc-slab-project-v3.2.json',
    mimeType: 'application/json',
    buffer: fs.readFileSync(path.join(__dirname, 'tests', 'fixtures', 'slab-project-v3.2.json'))
  });
  await page.waitForFunction(() => document.getElementById('slabProjectStatus')?.textContent?.includes('原為 V3.2 專案檔，已依 V3.3 重新計算'));
  const legacyV32Import = await page.evaluate(() => ({
    projectName: document.getElementById('projName')?.value,
    Lx: document.getElementById('Lx')?.value,
    status: document.getElementById('slabProjectStatus')?.textContent || '',
    appVersion: window.collectSlabProjectData()?.appVersion
  }));
  assert(legacyV32Import.projectName === '板專案存讀檔測試' && legacyV32Import.Lx === '620', 'slab accepts V3.2 project inputs for recalculation', JSON.stringify(legacyV32Import));
  assert(legacyV32Import.appVersion === 'V3.3' && legacyV32Import.status.includes('請另存 V3.3 專案檔'), 'slab migrates V3.2 projects like V3.1', legacyV32Import.status);
  assert(!legacyV32Import.status.includes('判定由') && legacyV32Import.status.includes('已讀取板專案檔並重現計算'), 'slab V3.2 project with unchanged result keeps the reproduced-status text', legacyV32Import.status);
  await page.setInputFiles('#slabProjectFile', {
    name: 'rc-slab-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved), 'utf8')
  });
  await page.waitForFunction(() => document.getElementById('projName')?.value === '板專案存讀檔測試');
  const imported = await page.evaluate(() => ({
    projectName: document.getElementById('projName')?.value,
    Lx: document.getElementById('Lx')?.value,
    status: document.getElementById('slabProjectStatus')?.textContent || ''
  }));
  assert(imported.projectName === '板專案存讀檔測試', 'slab project file input import project name', imported.projectName);
  assert(imported.Lx === '620', 'slab project file input import Lx', imported.Lx);
  assert(imported.status.includes('已讀取板專案檔並重現計算') && imported.status.includes(saved.calculationFingerprint), 'slab project file input status', imported.status);

  const draft = await page.evaluate(() => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    window.saveSlabProjectDraft();
    setField('projName', '暫存讀取前');
    setField('Lx', 102);
    window.loadSlabProjectDraft();
    return {
      projectName: document.getElementById('projName')?.value,
      Lx: document.getElementById('Lx')?.value,
      status: document.getElementById('slabProjectStatus')?.textContent || '',
      raw: localStorage.getItem('rc.slab.project.draft')
    };
  });
  assert(draft.projectName === '板專案存讀檔測試', 'slab project draft restores project name', draft.projectName);
  assert(draft.Lx === '620', 'slab project draft restores Lx', draft.Lx);
  assert(draft.status.includes('已讀取瀏覽器暫存'), 'slab project draft status', draft.status);
  assert(draft.raw && draft.raw.includes('rc-slab-project-v1'), 'slab project draft localStorage payload', 'draft saved');
}

async function importSlabProjectThroughFileInput(page, name, payload) {
  await page.evaluate(() => {
    const status = document.getElementById('slabProjectStatus');
    if (status) status.textContent = '';
    window.slabLast = null;
  });
  await page.setInputFiles('#slabProjectFile', {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf8')
  });
  await page.waitForFunction(() => (document.getElementById('slabProjectStatus')?.textContent || '').length > 0);
  return page.evaluate(() => {
    const status = document.getElementById('slabProjectStatus');
    const recalculated = !!window.slabLast;
    const current = window.collectSlabProjectData();
    return {
      status: status?.textContent || '',
      statusTone: status?.dataset.projectStatus || '',
      recalculated,
      summaryText: window.slabLast?.summaryText || '',
      banner: document.getElementById('bannerStatus')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      current
    };
  });
}

function slabFieldMismatches(savedFields, currentFields) {
  return Object.keys(savedFields).filter(id => JSON.stringify(savedFields[id]) !== JSON.stringify(currentFields[id]));
}

// 真實判定翻轉：fixture 由 a2054691（V3.2 上線版）頁面另存，未重簽；V3.3 依規範 6.5.4 端跨剪力係數 1.15/2 重算後剪力 NG
async function exerciseSlabLegacyResultFlip(page) {
  const flipFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'tests', 'fixtures', 'slab-project-v3.2-shear-flip.json'), 'utf8'));
  assert(flipFixture.appVersion === 'V3.2' && flipFixture.summary.banner.startsWith('✓ OK'), 'slab flip fixture is a real V3.2 OK save', flipFixture.summary.banner);

  const accepted = await importSlabProjectThroughFileInput(page, 'rc-slab-project-v3.2-shear-flip.json', flipFixture);
  const newBanner = accepted.current.summary.banner;
  assert(newBanner !== flipFixture.summary.banner && newBanner.startsWith('✗ NG') && newBanner.includes('✗ 剪力'), 'slab V3.3 recalculation flips the V3.2 verdict', newBanner);
  assert(accepted.recalculated && accepted.banner === newBanner && accepted.summaryText.startsWith('✗ NG'), 'slab flip import recalculates under V3.3', JSON.stringify({ banner: accepted.banner, summaryText: accepted.summaryText }));
  const mismatched = slabFieldMismatches(flipFixture.fields, accepted.current.fields);
  assert(mismatched.length === 0 && Object.keys(accepted.current.fields).length === Object.keys(flipFixture.fields).length, 'slab flip import reproduces every saved input field', `fields=${Object.keys(flipFixture.fields).length} mismatched=${JSON.stringify(mismatched)}`);
  assert(accepted.current.mode === flipFixture.mode && accepted.current.loadMode === flipFixture.loadMode, 'slab flip import reproduces mode and load mode', `${accepted.current.mode}/${accepted.current.loadMode}`);
  const expectedDisclosure = `原為 V3.2 專案檔，已依 V3.3 重新計算；判定由「${flipFixture.summary.banner}」改為「${newBanner}」（審查警示 ${flipFixture.summary.reviewWarningCount}→${accepted.current.summary.reviewWarningCount} 項），請另存 V3.3 專案檔`;
  assert(accepted.status.includes(expectedDisclosure), 'slab discloses the V3.2 to V3.3 verdict change and asks for a V3.3 save', accepted.status);
  assert(accepted.status.startsWith('已讀取板專案檔並依 V3.3 重新計算：板判定翻轉測試') && !accepted.status.includes('並重現計算'), 'slab flip status does not claim the saved result was reproduced', accepted.status);
  assert(accepted.status.includes(`計算指紋 ${flipFixture.calculationFingerprint}（V3.2 存檔）→ ${accepted.current.calculationFingerprint}（V3.3 重算）`) && accepted.current.calculationFingerprint !== flipFixture.calculationFingerprint, 'slab flip status traces old and new calculation fingerprints', accepted.status);
  assert(accepted.statusTone === 'warn' && accepted.current.appVersion === 'V3.3', 'slab flip status uses the warning style and V3.3 provenance', `${accepted.statusTone} ${accepted.current.appVersion}`);

  // 版本字串變體：驗證與提示讀同一組欄位、同一正規化
  const pageVersionOnly = JSON.parse(JSON.stringify(flipFixture));
  delete pageVersionOnly.appVersion;
  pageVersionOnly.pageVersion = 'V3.2';
  for (const [label, variant] of [
    ["appVersion '3.2'", { ...flipFixture, appVersion: '3.2' }],
    ["appVersion ' v3.2 '", { ...flipFixture, appVersion: ' v3.2 ' }],
    ['pageVersion only', pageVersionOnly],
  ]) {
    const result = await importSlabProjectThroughFileInput(page, 'rc-slab-project-variant.json', variant);
    assert(result.status === accepted.status && result.statusTone === 'warn', `slab treats ${label} exactly like V3.2`, result.status);
  }

  const markBeforeImport = () => page.evaluate(() => {
    document.getElementById('projName').value = '匯入前';
    document.getElementById('Lx').value = '111';
  });
  const readGuarded = () => page.evaluate(() => ({
    projectName: document.getElementById('projName')?.value,
    Lx: document.getElementById('Lx')?.value
  }));

  const tampered = JSON.parse(JSON.stringify(flipFixture));
  tampered.fields.wuManual.value = '5.0';
  await markBeforeImport();
  const tamperedResult = await importSlabProjectThroughFileInput(page, 'rc-slab-project-tampered.json', tampered);
  const tamperedGuard = await readGuarded();
  assert(tamperedResult.status.includes('已保留原輸入') && tamperedResult.status.includes('來源內容與計算指紋不一致'), 'slab rejects a tampered legacy input that was not re-signed', tamperedResult.status);
  assert(tamperedGuard.projectName === '匯入前' && tamperedGuard.Lx === '111', 'slab keeps current inputs after tampered legacy rejection', JSON.stringify(tamperedGuard));

  for (const [label, mutate, needle] of [
    ['retired field', payload => { payload.fields.retiredSlabInput = { kind: 'input', inputType: 'number', value: '7' }; }, '目前版本無此欄位：retiredSlabInput（存檔 「7」）'],
    ['unavailable option', payload => { payload.fields.barNoXBot.value = '#99'; }, 'barNoXBot（存檔 「#99」，套用後'],
  ]) {
    // 模擬「V3.2 當時就有此輸入」的完整性有效舊檔：以同一指紋演算法簽署（僅測試內合成，不寫入 fixture）
    const unreproducible = JSON.parse(JSON.stringify(flipFixture));
    mutate(unreproducible);
    const signed = await page.evaluate(payload => window.RCReportFingerprint.withProjectCalculationFingerprint(payload), unreproducible);
    await markBeforeImport();
    const result = await importSlabProjectThroughFileInput(page, `rc-slab-project-${label.replace(/\s+/g, '-')}.json`, signed);
    const guard = await readGuarded();
    assert(result.status.includes('已保留原輸入') && result.status.includes('原為 V3.2 專案檔，下列輸入無法於 V3.3 逐欄重現，未載入') && result.status.includes(needle), `slab rejects a legacy project whose ${label} cannot be reproduced and names it`, result.status);
    assert(guard.projectName === '匯入前' && guard.Lx === '111', `slab keeps current inputs after ${label} rejection`, JSON.stringify(guard));
  }

  // 現行版 V3.3 檔維持嚴格比對：結果不符（重簽）仍拒收
  await importSlabProjectThroughFileInput(page, 'rc-slab-project-v3.2-shear-flip.json', flipFixture);
  const currentMismatch = await page.evaluate(() => {
    const payload = window.collectSlabProjectData();
    payload.summary = { ...payload.summary, banner: '✓ OK — 初步檢查通過（竄改）' };
    return window.RCReportFingerprint.withProjectCalculationFingerprint(payload);
  });
  await markBeforeImport();
  const currentResult = await importSlabProjectThroughFileInput(page, 'rc-slab-project-v3.3-mismatch.json', currentMismatch);
  const currentGuard = await readGuarded();
  assert(currentResult.status.includes('已保留原輸入') && currentResult.status.includes('專案 JSON 重現失敗') && currentResult.status.includes('存檔結果與重算結果不同'), 'slab still rejects a V3.3 project whose saved result differs', currentResult.status);
  assert(currentGuard.projectName === '匯入前' && currentGuard.Lx === '111', 'slab keeps current inputs after V3.3 mismatch rejection', JSON.stringify(currentGuard));
}

async function exerciseSlabReportOutputActions(page) {
  await page.evaluate(installReportPopupFixture);
  const state = await page.evaluate(async () => {
    window.calcSlab();
    const fixture = window.__t23ReportPopupFixture;
    try {
      const returnedPopup = window.buildSlabReport({ autoPrint:true });
      await fixture.waitForLoads();
      const popup = fixture.windows[0];
      const html = fixture.lastHtml;
      return {
        focusCalls: fixture.focusCalls,
        printCalls: fixture.printCalls,
        returnsPopup:returnedPopup === popup,
        textExportEnabled:html.includes('data-text-export-enabled="true"'),
        hasTextDownloadLabel:html.includes('下載文字計算書 TXT'),
        hasPrintButton:Boolean(document.getElementById('btnPrintReport')),
        navigatedToBlob:fixture.navigatedToBlob,
        loadEventFired:fixture.loadEventFired,
        documentParsed:fixture.documentParsed,
        blobType:fixture.lastBlobType,
      };
    } finally {
      fixture.restore();
    }
  });
  assert(state.focusCalls === 1 && state.printCalls === 1 && state.returnsPopup, 'slab direct-print action prints the generated report window once', JSON.stringify(state));
  assert(state.navigatedToBlob && state.loadEventFired && state.documentParsed && state.blobType === 'text/html;charset=utf-8', 'slab direct-print waits for parsed Blob report load', JSON.stringify(state));
  assert(state.textExportEnabled && state.hasTextDownloadLabel, 'slab report enables governed TXT download', JSON.stringify(state));
  assert(state.hasPrintButton, 'slab page exposes direct-print calculation-book control', JSON.stringify(state));
}

async function main() {
  const slabHtml = fs.readFileSync(htmlPath, 'utf8');
  const common = fs.readFileSync(commonPath, 'utf8');
  const style = fs.readFileSync(stylePath, 'utf8');
  const pack = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const tolerance = pack.tolerance ?? toleranceDefault;

  assert(slabHtml.includes('id="testCaseSelect"'), 'slab.html has test case selector', 'built-in regression cases are wired in UI');
  assert(slabHtml.includes('id="caseJson"'), 'slab.html has case JSON textarea', 'JSON import/export UI exists');
  assert(slabHtml.includes('id="caseCompareResult"'), 'slab.html has compare panel', 'case compare output exists');
  assert(slabHtml.includes('id="baselineReport"'), 'slab.html has baseline report area', 'baseline report output exists');
  assert(slabHtml.includes('SLAB_PROJECT_SCHEMA'), 'slab.html has project file schema', 'versioned slab project file exists');
  assert(slabHtml.includes('btnSaveSlabProject'), 'slab.html has save project button', 'local JSON export control exists');
  assert(slabHtml.includes('btnLoadSlabProject'), 'slab.html has load project button', 'local JSON import control exists');
  assert(slabHtml.includes('rc.slab.project.draft'), 'slab.html has browser draft storage key', 'browser-local draft storage exists');
  assert(slabHtml.includes('../shared/slab-evaluator.js?v=2'), 'slab.html loads shared slab evaluator', 'formal page and independent benchmark share the production slab core');
  assert(slabHtml.includes('SlabEvaluator.minimumThickness({'), 'slab.html delegates thickness calculation', 'minimum thickness uses production slab core');
  assert(slabHtml.includes('SlabEvaluator.analyzeStripMoments({'), 'slab.html delegates strip actions', 'strip moments and shear demand use production slab core');
  assert(slabHtml.includes('SlabEvaluator.temperatureRatio(fyT)'), 'slab.html delegates temperature ratio', 'temperature reinforcement minimum uses production slab core');
  assert(slabHtml.includes('caseJson') && slabHtml.includes('SLAB_PROJECT_EXCLUDED_IDS'), 'slab.html excludes case-tool textareas from project files', 'case-tool scratch text is not project data');
  assert(common.includes('window.RCUI.buildReviewCheckGroup'), 'shared/common.js exposes review check group builder', 'review report rows have shared helper');
  assert(common.includes('window.RCUI.renderAttachmentReadiness'), 'shared/common.js exposes attachment readiness renderer', 'page-only attachment status has shared helper');
  assert(common.includes('window.RCUI.getAttachmentReadinessPriority'), 'shared/common.js exposes attachment priority helper', 'page readiness has prioritized reading cue');
  assert(common.includes('window.RCUI.normalizeProjectFieldValue'), 'shared/common.js exposes project metadata normalizer', 'placeholder project text can be scrubbed once');
  assert(slabHtml.includes('id="slabAttachmentReadiness"'), 'slab.html has page-only attachment readiness target', 'pre-export status stays on tool page');
  assert(slabHtml.includes('attachmentFailures'), 'slab.html stores attachment failure summary', 'page status can distinguish blocked attachment cases');
  assert(style.includes('.report-readiness-card') && style.includes('@media print'), 'shared/style.css hides readiness card from print', 'page-only readiness is print-hidden');
  assert(style.includes('.report-readiness-priority'), 'shared/style.css styles prioritized readiness cue', 'page-only priority cue has stable layout');
  assert(slabHtml.includes('summary:false'), 'slab report hides top status banner', 'page-only review status stays out of the report');
  assert(slabHtml.includes('id="btnPrintReport"'), 'slab.html has direct-print calculation-book control', 'top action is available');
  assert(slabHtml.includes('textExport:true') && slabHtml.includes('autoPrint:options && options.autoPrint === true'), 'slab report enables TXT and direct-print options', 'shared report options are explicit');
  const buildReportSrc = slabHtml.slice(slabHtml.indexOf('function buildSlabReport'), slabHtml.indexOf('function svgToDataURL'));
  assert(!buildReportSrc.includes("label:'內建案例'"), 'slab report excludes built-in case provenance', 'test case stays on tool page');
  assert(!buildReportSrc.includes('未來擴充：') && !buildReportSrc.includes('實際設計仍應由執業技師簽證'), 'slab report excludes page governance notes', 'future work and generic sign-off stay page-only');
  assert(slabHtml.includes("projectName: window.RCUI.normalizeProjectFieldValue($('projName')?.value)"), 'slab project payload normalizes placeholder project name', 'project storage metadata uses shared normalizer');
  assert(!slabHtml.includes("$('projName').value.trim()"), 'slab report/project metadata no longer uses raw trim on project name', 'shared normalizer handles placeholder cleanup');
  assert(!slabHtml.includes('RCUI.buildReviewCheckGroup'), 'slab report omits formal-analysis warning group', 'review warnings remain page-only');

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
    await exerciseSlabReportOutputActions(page);
    await exerciseSlabProjectStorage(page);
    await exerciseSlabLegacyResultFlip(page);
    assert(pageErrors.length === 0, 'slab project storage workflow', 'no page errors during project save/load checks');
    await page.goto(TOOL_URL, { waitUntil: 'networkidle' });
    await wait(250);

    const captured = [];
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
        punchBo: window.slabLast?.punchData?.bo ?? null,
        punchAreaCm2: window.slabLast?.punchData?.punchArea != null ? window.slabLast.punchData.punchArea * 1e4 : null,
        punchGeometryFormula: window.slabLast?.punchData?.punchGeometry?.formula ?? '',
        methodLabel: window.slabLast?.methodLabel,
        numericalOk: window.slabLast?.numericalOk,
        summaryOk: window.slabLast?.summaryOk,
        summaryText: window.slabLast?.summaryText,
        reviewWarningCount: window.slabLast?.reviewWarnings?.length ?? 0,
        allOk: window.slabLast?.allOk
      }));
      ['wu', 'hmin', 'VuX', 'VuY', 'phiVc1', 'phiVc1Y', 'punchVu', 'punchPhiVc', 'punchAmp', 'punchBo', 'punchAreaCm2'].forEach(key => {
        actual[key] = sanitizeMetric(actual[key]);
      });
      captured.push({ key: tc.key, actual });

      if (process.env.SLAB_PRINT_ACTUAL === '1') continue;

      Object.entries(tc.expected).forEach(([key, expected]) => {
        const pass = nearlyEqual(actual[key], expected, tolerance);
        assert(pass, `${tc.key} :: ${key}`, `expected=${expected} actual=${actual[key]}`);
      });
    }

    if (process.env.SLAB_PRINT_ACTUAL === '1') {
      console.log(JSON.stringify(captured, null, 2));
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
