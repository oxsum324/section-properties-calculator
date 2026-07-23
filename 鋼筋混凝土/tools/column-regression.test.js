const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.RC_TEST_PORT || 8123);
const TOOL_URL = `http://127.0.0.1:${PORT}/%E9%8B%BC%E7%AD%8B%E6%B7%B7%E5%87%9D%E5%9C%9F/tools/column.html`;
const htmlPath = path.join(__dirname, 'column.html');
const commonPath = path.join(__dirname, '..', 'shared', 'common.js');
const casesPath = path.join(__dirname, 'column-regression-cases.json');
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

async function exerciseProjectStorage(page) {
  await page.evaluate(() => {
    const setCheckbox = (id, desired) => {
      const el = document.getElementById(id);
      if (!el || el.checked === !!desired) return;
      el.click();
    };
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    document.querySelector('.mode-btn[data-mode="check"]')?.click();
    setCheckbox('seismicMode', true);
    setCheckbox('showSteps', true);
    setCheckbox('manualLayout', true);
    setCheckbox('tieOverride', true);
    setCheckbox('autoVe', false);
    setValue('projName', '柱專案存讀檔測試');
    setValue('projNo', 'RC-COL-001');
    setValue('projDesigner', 'QA');
    setValue('colType', 'rect');
    setValue('fc', 350);
    setValue('fy', 4200);
    setValue('b', 70);
    setValue('h', 65);
    setValue('lu', 360);
    setValue('Pu', 321);
    setValue('Mux', 45);
    setValue('Muy', 12);
    setValue('Vu', 35);
    setValue('Vuy', 9);
    setValue('Ve', 18);
    setValue('tieS', 9);
    setValue('crossTieS', 9);
    setValue('columnDevTop', 180);
    setValue('columnDevBottom', 190);
    setValue('firstHoopDist', 6);
    document.querySelector('.section-tabs button[data-tab="summary"]')?.click();
    if (typeof window.calcColumn === 'function') window.calcColumn();
  });

  const saved = await page.evaluate(() => window.collectColumnProjectData());
  assert(saved.schema === 'rc-column-project-v1', 'column project schema', saved.schema);
  assert(saved.tool === 'rc-column', 'column project tool id', saved.tool);
  assert(saved.mode === 'check', 'column project stores mode', saved.mode);
  assert(saved.activeTab === 'summary', 'column project stores active tab', saved.activeTab);
  assert(saved.metadata.projectName === '柱專案存讀檔測試', 'column project metadata', saved.metadata.projectName);
  assert(saved.fields.Pu.value === '321', 'column project stores numeric input as editable value', saved.fields.Pu.value);
  assert(saved.fields.seismicMode.checked === true, 'column project stores checkbox state', saved.fields.seismicMode.checked);
  assert(saved.fields.columnProjectFile == null, 'column project excludes file input', 'file input excluded');
  assert(saved.forceImport == null, 'column project has no adopted force import before confirmation', String(saved.forceImport));
  assert(Array.isArray(saved.reviewResolutions) && saved.reviewResolutions.length === 0, 'column project initializes review resolution records', JSON.stringify(saved.reviewResolutions));

  const placeholderSaved = await page.evaluate(() => {
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('projName', '未填');
    setValue('projNo', 'RC-COL-PLACEHOLDER');
    setValue('projDesigner', '未填');
    return window.collectColumnProjectData();
  });
  assert(placeholderSaved.metadata.projectName === '', 'column placeholder project name is scrubbed from metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.metadata.projectNo === 'RC-COL-PLACEHOLDER', 'column placeholder project number remains editable metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.metadata.designer === '', 'column placeholder designer is scrubbed from metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.fields.projName.value === '', 'column placeholder project name is scrubbed from fields payload', JSON.stringify(placeholderSaved.fields.projName));
  assert(placeholderSaved.fields.projDesigner.value === '', 'column placeholder designer is scrubbed from fields payload', JSON.stringify(placeholderSaved.fields.projDesigner));

  const restored = await page.evaluate(payload => {
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    document.querySelector('.mode-btn[data-mode="design"]')?.click();
    setValue('projName', '已清除');
    setValue('Pu', 1);
    setValue('b', 40);
    document.querySelector('.section-tabs button[data-tab="geom"]')?.click();
    const result = window.applyColumnProjectData(payload, { silent: true });
    return {
      applied: result.applied,
      mode: document.querySelector('.mode-btn.active')?.dataset.mode,
      activeTab: document.querySelector('.section-tabs button.active')?.dataset.tab,
      projectName: document.getElementById('projName')?.value,
      projectNo: document.getElementById('projNo')?.value,
      Pu: document.getElementById('Pu')?.value,
      b: document.getElementById('b')?.value,
      seismic: document.getElementById('seismicMode')?.checked,
      autoVe: document.getElementById('autoVe')?.checked,
      banner: document.getElementById('bannerStatus')?.textContent?.replace(/\s+/g, ' ').trim()
    };
  }, saved);
  assert(restored.applied > 40, 'column project restore applies fields', restored.applied);
  assert(restored.mode === 'check', 'column project restore mode', restored.mode);
  assert(restored.activeTab === 'summary', 'column project restore active tab', restored.activeTab);
  assert(restored.projectName === '柱專案存讀檔測試', 'column project restore project name', restored.projectName);
  assert(restored.projectNo === 'RC-COL-001', 'column project restore project number', restored.projectNo);
  assert(restored.Pu === '321', 'column project restore Pu', restored.Pu);
  assert(restored.b === '70', 'column project restore geometry', restored.b);
  assert(restored.seismic === true, 'column project restore seismic checkbox', restored.seismic);
  assert(restored.autoVe === false, 'column project restore autoVe checkbox', restored.autoVe);
  assert(restored.banner && restored.banner.length > 0, 'column project restore recalculates', restored.banner);

  await page.evaluate(() => {
    document.getElementById('projName').value = '檔案匯入前';
    document.getElementById('Pu').value = '2';
  });
  const rejectedColumnProject = JSON.parse(JSON.stringify(saved));
  rejectedColumnProject.appVersion = 'V0.0';
  await page.setInputFiles('#columnProjectFile', {
    name: 'rc-column-project-wrong-version.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(rejectedColumnProject), 'utf8')
  });
  await page.waitForFunction(() => document.getElementById('projectFileStatus')?.textContent?.includes('已保留原輸入'));
  const rejectedImport = await page.evaluate(() => ({
    projectName: document.getElementById('projName')?.value,
    Pu: document.getElementById('Pu')?.value,
    status: document.getElementById('projectFileStatus')?.textContent || ''
  }));
  assert(rejectedImport.projectName === '檔案匯入前' && rejectedImport.Pu === '2', 'column rejects incompatible source without changing inputs', JSON.stringify(rejectedImport));
  assert(rejectedImport.status.includes('工具版本不符'), 'column explains incompatible source rejection', rejectedImport.status);
  await page.setInputFiles('#columnProjectFile', {
    name: 'rc-column-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved), 'utf8')
  });
  await page.waitForFunction(() => document.getElementById('projName')?.value === '柱專案存讀檔測試');
  const imported = await page.evaluate(() => ({
    projectName: document.getElementById('projName')?.value,
    Pu: document.getElementById('Pu')?.value,
    status: document.getElementById('projectFileStatus')?.textContent || ''
  }));
  assert(imported.projectName === '柱專案存讀檔測試', 'column project file input import project name', imported.projectName);
  assert(imported.Pu === '321', 'column project file input import Pu', imported.Pu);
  assert(imported.status.includes('已讀取柱專案檔並重現計算') && imported.status.includes(saved.calculationFingerprint), 'column project file input status', imported.status);

  const draft = await page.evaluate(() => {
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    window.saveColumnProjectDraft();
    setValue('projName', '暫存讀取前');
    setValue('Pu', 3);
    window.loadColumnProjectDraft();
    return {
      projectName: document.getElementById('projName')?.value,
      Pu: document.getElementById('Pu')?.value,
      status: document.getElementById('projectFileStatus')?.textContent || '',
      raw: localStorage.getItem('rc.column.project.draft')
    };
  });
  assert(draft.projectName === '柱專案存讀檔測試', 'column project draft restores project name', draft.projectName);
  assert(draft.Pu === '321', 'column project draft restores Pu', draft.Pu);
  assert(draft.status.includes('已讀取瀏覽器暫存'), 'column project draft status', draft.status);
  assert(draft.raw && draft.raw.includes('rc-column-project-v1'), 'column project draft localStorage payload', 'draft saved');
}

async function exerciseCapacityLoadCombo(page) {
  await page.goto(TOOL_URL, { waitUntil:'networkidle' });
  await page.evaluate(() => {
    document.querySelector('.mode-btn[data-mode="check"]')?.click();
    const setValue = (id, value) => {
      const input = document.getElementById(id);
      if (!input) throw new Error(`missing load-combo input ${id}`);
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles:true }));
      input.dispatchEvent(new Event('change', { bubbles:true }));
    };
    setValue('lcCol_P_D', 200);
    setValue('lcCol_Mx_W', -50);
    setValue('lcCol_My_E', 20);
  });
  await page.waitForFunction(() => window.lastLoadComboSuggestions?.lcCol?.states?.[0]?.details?.status === 'evaluated');

  const before = await page.evaluate(() => {
    const state = window.lastLoadComboSuggestions.lcCol.states[0];
    return {
      score:state.score,
      details:state.details,
      tuple:state.governing,
      criterion:state.criterion,
      scoreText:document.getElementById('lcCol_limit_0_score')?.textContent || '',
    };
  });
  assert(before.criterion === 'custom', 'column load-combo uses capacity scorer', before.criterion);
  assert(before.details.status === 'evaluated' && Number.isFinite(before.details.utilization), 'column capacity tuple has finite utilization', JSON.stringify(before.details));
  assert(before.scoreText === before.details.utilization.toFixed(3), 'column capacity score is readable utilization', before.scoreText);

  // 載重組合面板預設可收合；直接觸發按鈕，驗證選取與套用邏輯不受畫面展開狀態影響。
  await page.evaluate(() => document.getElementById('lcCol_limit_0_select')?.click());
  await page.evaluate(() => document.getElementById('lcCol_btnApply')?.click());
  await page.waitForFunction(() => window.lastLoadCombo?.lcCol?.tuplePreserved === true && window.colLast);
  const applied = await page.evaluate(() => {
    const r = window.colLast;
    const stored = window.lastLoadCombo.lcCol;
    const reportGroup = window.LoadCombo.toReportGroup('lcCol', '採用載重組合');
    return {
      selectedTuple:stored.selectedTuple,
      tuplePreserved:stored.tuplePreserved,
      Pu:r.Pu,
      Mux:r.Mux,
      Muy:r.Muy,
      Mc:r.Mc,
      Mcy:r.Mcy,
      utilization:r.biaxialSurfaceRatio,
      reportGroup,
    };
  });
  assert(applied.tuplePreserved === true, 'column capacity suggestion preserves one complete tuple', JSON.stringify(applied.selectedTuple));
  assert(applied.selectedTuple.name === before.tuple.name, 'column applies the capacity-governing tuple', applied.selectedTuple.name);
  assert(applied.Pu === before.details.Pu && applied.Mux === Math.abs(before.details.Mx) && applied.Muy === Math.abs(before.details.My), 'column target mapping keeps signed source tuple and magnitude demand fields', JSON.stringify(applied));
  assert(nearlyEqual(applied.Mc, before.details.Mc, 1e-9) && nearlyEqual(applied.Mcy, before.details.Mcy, 1e-9), 'column formal result reuses identical Pu-dependent magnification', `${applied.Mc}/${before.details.Mc}, ${applied.Mcy}/${before.details.Mcy}`);
  assert(nearlyEqual(applied.utilization, before.details.utilization, 1e-9), 'column formal result and tuple scorer use identical biaxial capacity ratio', `${applied.utilization}/${before.details.utilization}`);
  assert(JSON.stringify(applied.reportGroup).includes('來源完整有號內力'), 'column report group keeps source signed tuple', JSON.stringify(applied.reportGroup));
  assert(!JSON.stringify(applied.reportGroup).includes('容量利用率'), 'column capacity suggestions remain page-only', JSON.stringify(applied.reportGroup));

  const refreshed = await page.evaluate(async previousScore => {
    const input = document.getElementById('lu');
    input.value = '800';
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const state = window.lastLoadComboSuggestions?.lcCol?.states?.[0];
    return { previousScore, score:state?.score, status:state?.details?.status };
  }, before.score);
  assert(Number.isFinite(refreshed.score) && refreshed.score > refreshed.previousScore, 'column geometry/slenderness change refreshes capacity suggestions', JSON.stringify(refreshed));
}

async function runColumnForceCandidateReviewCase(page) {
  const payload = {
    target: 'column-rect',
    meta: { source: '構架分析', caseName: 'ULS-01', factored: false, loadBasis: 'unconfirmed' },
    forces: { P: 333, Mx: 71, My: 10, Vx: 31, Vy: 5 }
  };
  await page.goto(TOOL_URL, { waitUntil: 'networkidle' });
  await page.evaluate(candidate => localStorage.setItem('structToolbox.pendingForces', JSON.stringify(candidate)), payload);
  await page.goto(`${TOOL_URL}?import=1`, { waitUntil: 'networkidle' });
  await wait(250);
  const before = await page.evaluate(() => ({
    cardVisible: document.getElementById('columnForceCandidateCard')?.style.display !== 'none',
    summary: document.getElementById('columnForceCandidateSummary')?.textContent || '',
    Pu: document.getElementById('Pu')?.value,
    Mux: document.getElementById('Mux')?.value,
    Muy: document.getElementById('Muy')?.value,
    Vu: document.getElementById('Vu')?.value,
    Vuy: document.getElementById('Vuy')?.value,
    stored: localStorage.getItem('structToolbox.pendingForces')
  }));
  assert(before.cardVisible, 'column candidate card displays before adoption', before.summary);
  assert(before.summary.includes('構架分析') && before.summary.includes('尚未確認資料基準'), 'column candidate shows source and unresolved basis', before.summary);
  assert(before.Pu !== '333' && before.Mux !== '71' && before.Muy !== '10', 'column candidate does not write formal inputs before confirmation', JSON.stringify(before));
  assert(!!before.stored, 'column candidate keeps pending storage before confirmation', before.stored);

  await page.check('#columnForceCandidateConfirm');
  await page.click('#columnForceCandidateApply');
  await wait(250);
  const after = await page.evaluate(() => ({
    cardHidden: document.getElementById('columnForceCandidateCard')?.style.display === 'none',
    Pu: document.getElementById('Pu')?.value,
    Mux: document.getElementById('Mux')?.value,
    Muy: document.getElementById('Muy')?.value,
    Vu: document.getElementById('Vu')?.value,
    Vuy: document.getElementById('Vuy')?.value,
    stored: localStorage.getItem('structToolbox.pendingForces')
  }));
  assert(after.cardHidden, 'column candidate card closes after adoption', JSON.stringify(after));
  assert(after.Pu === '333' && after.Mux === '71' && after.Muy === '10' && after.Vu === '31' && after.Vuy === '5', 'column candidate writes confirmed formal inputs', JSON.stringify(after));
  assert(after.stored == null, 'column candidate clears pending storage only after adoption', String(after.stored));
  const reportHtml = await page.evaluate(() => {
    let html = '';
    const previousOpen = window.open;
    window.open = () => ({ document: { open() {}, write(chunk) { html += String(chunk); }, close() {} }, close() {}, closed: false });
    try { window.buildColumnReport(); } finally { window.open = previousOpen; }
    return html;
  });
  ['上游內力採用記錄', '已確認採用', '構架分析', 'ULS-01'].forEach(fragment => {
    assert(reportHtml.includes(fragment), 'column report records confirmed upstream source', fragment);
  });
  ['上游內力候選值', '需確認', '候選值只在本頁'].forEach(fragment => {
    assert(!reportHtml.includes(fragment), 'column report excludes candidate reading state', fragment);
  });
  const restored = await page.evaluate(() => {
    const saved = window.collectColumnProjectData();
    document.getElementById('Pu').value = '1';
    window.applyColumnProjectData(saved, { silent: true });
    let html = '';
    const previousOpen = window.open;
    window.open = () => ({ document: { open() {}, write(chunk) { html += String(chunk); }, close() {} }, close() {}, closed: false });
    try { window.buildColumnReport(); } finally { window.open = previousOpen; }
    return { forceImport: saved.forceImport, Pu: document.getElementById('Pu').value, html };
  });
  assert(restored.forceImport?.fields?.length === 5, 'column project saves adopted force provenance', JSON.stringify(restored.forceImport));
  assert(restored.Pu === '333', 'column project restores adopted force inputs', restored.Pu);
  assert(restored.html.includes('人工確認作為係數化設計外力'), 'column project restores adopted force decision into report', 'adoption decision preserved');
}

async function captureColumnReportHtml(page) {
  return page.evaluate(() => {
    let html = '';
    const previousOpen = window.open;
    window.open = () => ({
      document: { open() {}, write(chunk) { html += String(chunk); }, close() {} },
      close() {},
      closed: false
    });
    try { window.buildColumnReport(); } finally { window.open = previousOpen; }
    return html;
  });
}

async function exerciseColumnAttachmentBoundary(page, pack) {
  const byKey = new Map(pack.cases.map(tc => [tc.key, tc]));
  const metadata = { name: '附件門檻測試工程', no: 'RC-COL-GATE', designer: 'QA' };
  const loadScenario = async (key, project, overrides = {}) => {
    const tc = byKey.get(key);
    assert(!!tc, `column attachment case ${key}`, 'case exists');
    await page.goto(TOOL_URL, { waitUntil: 'networkidle' });
    await page.evaluate(({ tcCase, projectInfo, fieldOverrides }) => {
      const setCheckbox = (id, desired) => {
        const el = document.getElementById(id);
        if (!el || el.checked === !!desired) return;
        el.click();
      };
      const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = String(value ?? '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      document.querySelector(`.mode-btn[data-mode="${tcCase.mode}"]`)?.click();
      Object.entries(tcCase.checkboxes || {}).forEach(([id, desired]) => setCheckbox(id, desired));
      Object.entries(tcCase.selects || {}).forEach(([id, value]) => setValue(id, value));
      Object.entries(tcCase.values || {}).forEach(([id, value]) => setValue(id, value));
      Object.entries(fieldOverrides || {}).forEach(([id, value]) => setValue(id, value));
      setValue('projName', projectInfo?.name || '');
      setValue('projNo', projectInfo?.no || '');
      setValue('projDesigner', projectInfo?.designer || '');
      window.calcColumn();
    }, { tcCase: tc, projectInfo: project || {}, fieldOverrides: overrides });
    await wait(250);
    return page.evaluate(() => {
      const target = document.getElementById('columnAttachmentReadiness');
      return {
        status: target?.dataset.attachmentStatus || '',
        text: target?.innerText?.replace(/\s+/g, ' ').trim() || '',
        assessment: window.lastColumnAttachmentReadiness
      };
    });
  };

  const readyInputs = { columnDevTop: 500, columnDevBottom: 500 };
  const missingMetadata = await loadScenario('default_rect_design', {}, readyInputs);
  assert(missingMetadata.status === 'ready', 'column empty metadata can be inherited from the main report', missingMetadata.text);
  assert(missingMetadata.assessment?.metadata?.missingItems?.length === 3, 'column empty metadata lists all required fields', JSON.stringify(missingMetadata.assessment?.metadata));
  assert(missingMetadata.text.includes('由主文承接') && missingMetadata.text.includes('未填 3 項'), 'column page explains inherited metadata', missingMetadata.text);
  const screenPrintNotice = await page.evaluate(() => getComputedStyle(document.querySelector('.rc-direct-print-boundary')).display);
  assert(screenPrintNotice === 'none', 'column direct-print boundary stays hidden on screen', screenPrintNotice);
  await page.emulateMedia({ media: 'print' });
  const directPrintState = await page.evaluate(() => ({
    noticeRects: document.querySelector('.rc-direct-print-boundary')?.getClientRects().length || 0,
    noticeText: document.querySelector('.rc-direct-print-boundary')?.textContent || '',
    visiblePageChildren: Array.from(document.body.children)
      .filter(el => !el.classList.contains('rc-direct-print-boundary') && el.getClientRects().length > 0)
      .map(el => el.id || el.className || el.tagName),
    watermark: getComputedStyle(document.body, '::after').content
  }));
  await page.emulateMedia({ media: 'screen' });
  assert(directPrintState.noticeRects > 0, 'column direct print exposes blocked-print boundary', JSON.stringify(directPrintState));
  assert(directPrintState.noticeText.includes('RC 工具主頁列印已封鎖') && directPrintState.noticeText.includes('本頁不得作為附件'), 'column direct print cannot bypass calculation-book output', directPrintState.noticeText);
  assert(directPrintState.visiblePageChildren.length === 0, 'column direct print hides the complete work page', JSON.stringify(directPrintState.visiblePageChildren));
  assert(!directPrintState.watermark.includes('DRAFT'), 'column blocked-print page is not a draft calculation book', directPrintState.watermark);

  const ready = await loadScenario('default_rect_design', metadata, readyInputs);
  assert(ready.status === 'ready', 'column complete clean case is ready', ready.text);
  assert(ready.assessment?.formalOutputAllowed === true, 'column ready case allows formal output', JSON.stringify(ready.assessment));
  const readyReport = await captureColumnReportHtml(page);
  assert(!readyReport.includes('DRAFT／非正式附件'), 'column ready report has no draft state', 'formal report');
  assert(!readyReport.includes('data-document-state="draft"'), 'column ready report has no draft marker', 'formal report');
  assert(readyReport.includes('data-initial-approved="false"') && readyReport.includes('本計算內容已完成審閱，核可作為正式附件'), 'column report defaults to printable internal review with explicit approval control', 'approval model');
  await page.evaluate(() => { document.getElementById('projNo').value = ''; });
  const currentMissingReport = await captureColumnReportHtml(page);
  assert(!currentMissingReport.includes('<b>計畫編號</b>') && !currentMissingReport.includes('DRAFT／非正式附件'), 'column report omits blank optional project number without downgrading the attachment', 'project number cleared after calculation');
  await page.evaluate(project => {
    document.getElementById('projName').value = project.name;
    document.getElementById('projNo').value = project.no;
    document.getElementById('projDesigner').value = project.designer;
  }, metadata);
  const currentCompleteReport = await captureColumnReportHtml(page);
  assert(!currentCompleteReport.includes('DRAFT／非正式附件'), 'column report clears stale draft after metadata completion', 'current project fields used');

  const review = await loadScenario('development_anchor_manual_review', metadata);
  assert(review.status === 'review', 'column manual-review case stays review', review.text);
  assert(review.text.includes('待人工複核') && review.text.includes('仍可列印'), 'column review page keeps engineering review separate from printability', review.text);
  const reviewReport = await captureColumnReportHtml(page);
  assert(!reviewReport.includes('DRAFT／非正式附件') && reviewReport.includes('data-initial-approved="false"'), 'column review result remains a printable internal-review calculation book', 'review document state');

  await page.click('.section-tabs button[data-tab="summary"]');
  const reviewPanel = await page.evaluate(() => ({
    hidden: document.getElementById('columnReviewResolutionPanel')?.hidden,
    text: document.getElementById('columnReviewResolutionPanel')?.innerText?.replace(/\s+/g, ' ').trim() || '',
    hasCheckbox: !!document.querySelector('#columnReviewResolutionPanel input[type="checkbox"]')
  }));
  assert(reviewPanel.hidden === false, 'column manual-review resolution panel is visible', reviewPanel.text);
  assert(reviewPanel.text.includes('複核依據') && reviewPanel.text.includes('依據編號 / 圖號') && reviewPanel.text.includes('複核人') && reviewPanel.text.includes('複核時間'), 'column review requires traceable fields', reviewPanel.text);
  assert(reviewPanel.hasCheckbox === false, 'column review is not an arbitrary approval checkbox', String(reviewPanel.hasCheckbox));

  await page.selectOption('[data-review-item="column-anchorage"] [data-review-field="basis"]', 'drawing');
  await page.fill('[data-review-item="column-anchorage"] [data-review-field="reference"]', 'S-302');
  await page.fill('[data-review-item="column-anchorage"] [data-review-field="reviewer"]', 'QA-01');
  await page.fill('[data-review-item="column-anchorage"] [data-review-field="reviewedAt"]', '2026-07-17T14:30');
  await page.click('[data-review-item="column-anchorage"] [data-review-action="confirm"]');
  await wait(250);
  const resolved = await page.evaluate(() => ({
    status: document.getElementById('columnAttachmentReadiness')?.dataset.attachmentStatus,
    text: document.getElementById('columnAttachmentReadinessCard')?.innerText?.replace(/\s+/g, ' ').trim() || '',
    banner: document.getElementById('bannerStatus')?.innerText?.replace(/\s+/g, ' ').trim() || '',
    assessment: window.lastColumnAttachmentReadiness,
    saved: window.collectColumnProjectData()
  }));
  assert(resolved.status === 'ready', 'traceable column review reaches ready-to-sign', resolved.text);
  assert(resolved.text.includes('可核可') && resolved.text.includes('已完成 1 項'), 'column page identifies approval availability and completed review', resolved.text);
  assert(resolved.banner.includes('複核完成 — 可核可') && !resolved.banner.includes('需人工複核'), 'column summary banner agrees with approval availability', resolved.banner);
  assert(resolved.assessment?.approvalRequired === true && resolved.assessment?.readyToSign === false && resolved.assessment?.unresolvedReviewItems?.length === 0, 'column resolved engineering review still awaits explicit document approval', JSON.stringify(resolved.assessment));
  assert(resolved.saved.reviewResolutions?.length === 1 && resolved.saved.reviewResolutions[0].reference === 'S-302', 'column project persists review record', JSON.stringify(resolved.saved.reviewResolutions));
  const resolvedReport = await captureColumnReportHtml(page);
  assert(!resolvedReport.includes('DRAFT／非正式附件'), 'resolved column review removes draft state', 'ready-to-sign report');
  ['人工複核採用記錄', '已完成可追溯複核', '已複核', '柱端錨定—依據', '配筋圖／S-302', 'QA-01'].forEach(fragment => {
    assert(resolvedReport.includes(fragment), 'column report carries traceable review record', fragment);
  });
  ['未輸入時不作通過判定', '人工複核項，不納入自動 OK 判定', '報告不作通過判定'].forEach(fragment => {
    assert(!resolvedReport.includes(fragment), 'resolved column report has no stale pending-review conclusion', fragment);
  });
  ['不是勾選放行', '相關計算條件變更後', '記錄複核完成'].forEach(fragment => {
    assert(!resolvedReport.includes(fragment), 'column report excludes page-only review instructions', fragment);
  });

  const restoredReview = await page.evaluate(payload => {
    window.reopenColumnReviewResolution('column-anchorage');
    const result = window.applyColumnProjectData(payload, { silent: true });
    return {
      applied: result.applied,
      status: document.getElementById('columnAttachmentReadiness')?.dataset.attachmentStatus,
      resolutions: window.serializeColumnReviewResolutions()
    };
  }, resolved.saved);
  assert(restoredReview.status === 'ready' && restoredReview.resolutions.length === 1, 'column project restores valid review gate state', JSON.stringify(restoredReview));

  await page.click('.section-tabs button[data-tab="rebar"]');
  await page.selectOption('#columnDevTopType', 'other');
  await wait(250);
  const staleReview = await page.evaluate(() => ({
    status: document.getElementById('columnAttachmentReadiness')?.dataset.attachmentStatus,
    text: document.getElementById('columnReviewResolutionPanel')?.innerText?.replace(/\s+/g, ' ').trim() || '',
    assessment: window.lastColumnAttachmentReadiness
  }));
  assert(staleReview.status === 'review', 'changed anchorage condition invalidates prior review', staleReview.text);
  assert(staleReview.text.includes('條件已變更') && staleReview.text.includes('不能沿用'), 'column page explains stale review record', staleReview.text);
  assert(staleReview.assessment?.unresolvedReviews?.[0]?.validation?.contextMatches === false, 'column stale review exposes context mismatch', JSON.stringify(staleReview.assessment));
  const staleReport = await captureColumnReportHtml(page);
  assert(!staleReport.includes('DRAFT／非正式附件') && staleReport.includes('data-initial-approved="false"'), 'stale column engineering review keeps document in internal-review state', 'changed review context');

  const blocked = await loadScenario('ng_heavy_check', metadata);
  assert(blocked.status === 'blocked', 'column failed case is blocked', blocked.text);
  const blockedReport = await captureColumnReportHtml(page);
  assert(!blockedReport.includes('DRAFT／非正式附件') && blockedReport.includes('data-initial-approved="false"'), 'column NG result stays printable and defaults to internal review', 'blocked document state');
  ['產報前檢查', '優先閱讀', '可作附件，需人工複核', '暫勿作附件', '不會寫入計算書或列印 PDF'].forEach(fragment => {
    assert(!blockedReport.includes(fragment), 'column draft report excludes page-only readiness wording', fragment);
  });
}

async function main() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const common = fs.readFileSync(commonPath, 'utf8');
  const pack = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const tolerance = pack.tolerance ?? toleranceDefault;

  assert(html.includes('id="bannerStatus"'), 'column.html has banner', 'summary banner exists');
  assert(html.includes('window.colLast'), 'column.html exports colLast', 'result snapshot exists for regression capture');
  assert(html.includes('data-tab="summary"'), 'column.html has summary tab', 'summary banner can be stabilized for regression checks');
  assert(html.includes('rc.pendingBeamColumnJoint'), 'column.html has beam-column joint storage key', 'handoff storage key exists');
  assert(html.includes('function applyBeamColumnJointImport'), 'column.html has beam-column joint importer', 'column import helper exists');
  assert(html.includes('beamJointImport: window.lastBeamColumnJointImport'), 'column.html stores imported beam joint payload', 'colLast keeps import source');
  assert(html.includes('../shared/pmsection.js'), 'column.html loads shared PM section engine', 'single-axis P-M core is shared and testable');
  assert(html.includes('../shared/column-evaluator.js'), 'column.html loads shared column demand evaluator', 'Pu-dependent magnification is shared and testable');
  assert(html.includes('ColumnEvaluator.magnifyAxis') && html.includes('ColumnEvaluator.limitStateScore'), 'column formal calculation and load-combo scorer share one magnification core', 'shared evaluator wiring');
  assert(html.includes("key:'pm-capacity'") && html.includes('scorer:scoreColumnTuple'), 'column load-combo first state is true capacity utilization', 'capacity scorer present');
  assert(html.includes('refreshLimitStateSuggestions(window.rcColumnLoadComboConfig)'), 'column section changes refresh capacity suggestions', 'reactive capacity refresh');
  assert(!html.includes('(swayMode && isFinite(deltaS)) ? deltaS : 1'), 'column no longer falls back to deltaS=1 when sway magnification is unstable', 'fail-closed sway magnification');
  assert(html.includes('pmCore.curve'), 'column.html calls shared PM section engine', 'rectangular column P-M uses shared core');
  assert(html.includes('reportCoverage'), 'column.html builds report coverage matrix', 'code-clause coverage matrix exists');
  assert(html.includes('id="columnMethodBoundaryCard"'), 'column.html keeps method boundaries on work page', 'method explanations remain page-only');
  assert(html.includes('本區僅供操作與判讀，不會寫入計算書或列印 PDF'), 'column.html labels report boundary', 'page explains what the calculation book excludes');
  assert(html.includes('lastColumnReportDiagnostics'), 'column.html exposes page diagnostics', 'coverage remains regression-testable without entering the report');
  assert(!html.includes('inputs, checks, steps: stepsArr, diagrams, methods: reportMethods, coverage: reportCoverage'), 'column report excludes method and coverage matrices', 'generic governance stays on the work page');
  assert(html.includes('summary:false'), 'column report hides top summary banner', 'operator-only reminders stay out of the report');
  assert(!html.includes('coverageSummary: reportCoverageSummary'), 'column report omits coverage summary cards', 'gap summaries stay on the page, not in the report');
  assert(html.includes('lastColumnReportConfig'), 'column.html exposes last report config', 'report coverage can be regression tested');
  assert(html.includes('function collectColumnManualReviewItems'), 'column.html centralizes manual-review items', 'banner and report share pending-review boundaries');
  assert(html.includes('function collectColumnManualReviewRequirements'), 'column.html builds context-bound review requirements', 'review records invalidate after relevant input changes');
  assert(html.includes('人工複核採用記錄'), 'column report records completed manual review provenance', 'ready-to-sign output is traceable');
  assert(html.includes('reviewResolutions: serializeColumnReviewResolutions()'), 'column project stores manual review records', 'review decisions survive project reopen');
  assert(html.includes('COLUMN_PROJECT_SCHEMA'), 'column.html has project file schema', 'versioned column project file exists');
  assert(html.includes('btnSaveProject'), 'column.html has save project button', 'local JSON export control exists');
  assert(html.includes('btnLoadProject'), 'column.html has load project button', 'local JSON import control exists');
  assert(html.includes('rc.column.project.draft'), 'column.html has browser draft storage key', 'browser-local draft storage exists');
  assert(html.includes('id="columnForceCandidateCard"'), 'column.html has force candidate review card', 'imported forces require explicit confirmation');
  assert(html.includes('initColumnForceCandidateReview'), 'column.html initializes candidate receiver', 'candidate payload is rendered without automatic adoption');
  assert(html.includes('上游內力採用記錄'), 'column report records adopted force provenance', 'only confirmed imports are traceable in the calculation report');
  assert(html.includes('serializeColumnForceImport'), 'column project file preserves adopted force provenance', 'reopened projects keep confirmed import record');
  assert(common.includes('window.RCUI.normalizeProjectFieldValue'), 'shared/common.js exposes project metadata normalizer', 'placeholder project text can be scrubbed once');
  assert(html.includes("projectName: window.RCUI.normalizeProjectFieldValue($('projName')?.value)"), 'column project payload normalizes placeholder project name', 'project storage metadata uses shared normalizer');
  assert(!html.includes("$('projName').value.trim()"), 'column report/project metadata no longer uses raw trim on project name', 'shared normalizer handles placeholder cleanup');
  assert(common.includes('window.RCUI.buildReviewCheckGroup'), 'shared/common.js exposes review check group builder', 'review report rows have shared helper');
  assert(!html.includes('RCUI.buildReviewCheckGroup'), 'column report omits manual-review summary group', 'manual-review details remain in technical rows');

  const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  assert(!!chromePath, 'browser executable', 'system Chrome/Edge found for column regression test');

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
    await wait(300);
    assert(pageErrors.length === 0, 'column page boot', 'no page errors during initial load');
    assert(failedResponses.length === 0, 'column page resources', 'no missing static resources during initial load');
    await exerciseProjectStorage(page);
    assert(pageErrors.length === 0, 'column project storage workflow', 'no page errors during project save/load checks');
    await exerciseCapacityLoadCombo(page);
    assert(pageErrors.length === 0, 'column capacity load-combo workflow', 'no page errors during capacity tuple checks');

    for (const tc of pack.cases) {
      await page.goto(TOOL_URL, { waitUntil: 'networkidle' });
      await wait(100);
      await page.evaluate(tcCase => {
        const setCheckbox = (id, desired) => {
          const el = document.getElementById(id);
          if (!el || el.checked === !!desired) return;
          el.click();
        };
        const setValue = (id, value) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.value = String(value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        document.querySelector(`.mode-btn[data-mode="${tcCase.mode}"]`)?.click();
        Object.entries(tcCase.checkboxes || {}).forEach(([id, desired]) => setCheckbox(id, desired));
        Object.entries(tcCase.selects || {}).forEach(([id, value]) => setValue(id, value));
        Object.entries(tcCase.values || {}).forEach(([id, value]) => setValue(id, value));

        if (typeof window.calcColumn === 'function') window.calcColumn();
        document.querySelector('.section-tabs button[data-tab="summary"]')?.click();
      }, tc);
      await wait(500);

      const actual = JSON.parse(await page.evaluate(() => JSON.stringify((() => {
        const r = window.colLast || {};
        const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
        const textOf = id => { const el = document.getElementById(id); return clean(el?.innerText || el?.textContent); };
        const classOf = id => clean(document.getElementById(id)?.className);
        return {
          mode: document.querySelector('.mode-btn.active')?.dataset.mode ?? null,
          banner: document.getElementById('bannerStatus')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
          inputRiskText: textOf('inputRiskCard'),
          inputRiskTransverseClass: classOf('i-transverseFy'),
          inputRiskAnchorageClass: classOf('i-anchorageInput'),
          inputRiskDetailClass: classOf('i-seismicDetailInput'),
          inputRiskLapClass: classOf('i-lapInput'),
          colType: r.colType ?? null,
          seismic: r.seismic ?? null,
          Pu: r.Pu ?? null,
          Mux: r.Mux ?? null,
          Muy: r.Muy ?? null,
          Vu_in: r.Vu_in ?? null,
          Vuy_in: r.Vuy_in ?? null,
          tieS: r.tieS ?? null,
          crossTieS: r.crossTieS ?? null,
          spiralS: r.spiralS ?? null,
          sSugg: r.sSugg ?? null,
          sSuggReason: r.sSuggReason ?? null,
          shearSpacingLimitAuto: Number.isFinite(r.shearSpacingLimitAuto) ? r.shearSpacingLimitAuto : null,
          codeTieSpacingLimit: Number.isFinite(r.codeTieSpacingLimit) ? r.codeTieSpacingLimit : null,
          adoptedTieSpacing: r.adoptedTieSpacing ?? null,
          okSeismicTieSpacing: r.okSeismicTieSpacing ?? null,
          seismicHx: Number.isFinite(r.seismicHx) ? r.seismicHx : null,
          seismicSoLimit: Number.isFinite(r.seismicTieSpacing?.so?.limit) ? r.seismicTieSpacing.so.limit : null,
          seismicSoRaw: Number.isFinite(r.seismicTieSpacing?.so?.raw) ? r.seismicTieSpacing.so.raw : null,
          seismicLongBarFactor: r.seismicTieSpacing?.dbLimit?.factor ?? null,
          seismicLongBarLimit: Number.isFinite(r.seismicTieSpacing?.dbLimit?.limit) ? r.seismicTieSpacing.dbLimit.limit : null,
          seismicHighHxTrigger: r.seismicHighHxTrigger ?? null,
          seismicHxLimit: Number.isFinite(r.seismicHxLimit) ? r.seismicHxLimit : null,
          okLateralSupport: r.okLateralSupport ?? null,
          columnDevTop: r.columnDevTop ?? null,
          columnDevBottom: r.columnDevBottom ?? null,
          columnDevTopType: r.columnDevTopType ?? null,
          columnDevBottomType: r.columnDevBottomType ?? null,
          columnDevTopTypeLabel: r.columnDevTopTypeLabel ?? null,
          columnDevBottomTypeLabel: r.columnDevBottomTypeLabel ?? null,
          columnDevTopText: r.columnDevTopText ?? null,
          columnDevBottomText: r.columnDevBottomText ?? null,
          columnLdTension: Number.isFinite(r.columnLdTension) ? r.columnLdTension : null,
          columnLdCompression: Number.isFinite(r.columnLdCompression) ? r.columnLdCompression : null,
          columnDevReq: Number.isFinite(r.columnDevReq) ? r.columnDevReq : null,
          okColumnDevTop: r.okColumnDevTop ?? null,
          okColumnDevBottom: r.okColumnDevBottom ?? null,
          okColumnDevelopment: r.okColumnDevelopment ?? null,
          columnDevelopmentHasInput: r.columnDevelopmentHasInput ?? null,
          columnDevelopmentManual: r.columnDevelopmentManual ?? null,
          lateralSupportDetail: r.lateralSupportDetail ?? null,
          firstHoopDist: r.firstHoopDist ?? null,
          seismicFirstHoopLimit: Number.isFinite(r.seismicFirstHoopLimit) ? r.seismicFirstHoopLimit : null,
          okFirstHoop: r.okFirstHoop ?? null,
          outsideTieS: r.outsideTieS ?? null,
          outsideTieSInput: r.outsideTieSInput ?? null,
          seismicMidSpacingLimit: Number.isFinite(r.seismicMidSpacingLimit) ? r.seismicMidSpacingLimit : null,
          okOutsideTieSpacing: r.okOutsideTieSpacing ?? null,
          lapSpliceStart: r.lapSpliceStart ?? null,
          lapSpliceEnd: r.lapSpliceEnd ?? null,
          lapMiddleStart: Number.isFinite(r.lapMiddleStart) ? r.lapMiddleStart : null,
          lapMiddleEnd: Number.isFinite(r.lapMiddleEnd) ? r.lapMiddleEnd : null,
          okLapZone: r.okLapZone ?? null,
          lapSpliceLength: r.lapSpliceLength ?? null,
          lapSpliceRatio: r.lapSpliceRatio ?? null,
          lapSpliceClassRequested: r.lapSpliceClassRequested ?? null,
          lapSpliceClass: r.lapSpliceClass ?? null,
          lapLdTension: Number.isFinite(r.lapLdTension) ? r.lapLdTension : null,
          lapLengthReqA: Number.isFinite(r.lapLengthReqA) ? r.lapLengthReqA : null,
          lapLengthReqB: Number.isFinite(r.lapLengthReqB) ? r.lapLengthReqB : null,
          lapLengthReq: Number.isFinite(r.lapLengthReq) ? r.lapLengthReq : null,
          okLapLength: r.okLapLength ?? null,
          lapClassAAstRatio: Number.isFinite(r.lapClassAAstRatio) ? r.lapClassAAstRatio : null,
          lapClassAAstOk: r.lapClassAAstOk ?? null,
          lapClassASpliceOk: r.lapClassASpliceOk ?? null,
          okLapClassA: r.okLapClassA ?? null,
          lapClassANote: r.lapClassANote ?? null,
          Ast: r.Ast ?? null,
          rhog: r.rhog ?? null,
          phiPnMax: r.phiPnMax ?? null,
          pmEngine: r.pmEngine ?? null,
          pmEngineY: r.pmEngineY ?? null,
          phiMnAtPu: r.phiMnAtPu ?? null,
          phiMnyAtPu: r.phiMnyAtPu ?? null,
          breslerRatio: r.breslerRatio ?? null,
          breslerMethod: r.breslerMethod ?? null,
          breslerOk: r.breslerOk ?? null,
          biaxialSurfaceRatio: r.biaxialSurfaceRatio ?? null,
          biaxialSurfaceOk: r.biaxialSurfaceOk ?? null,
          phiVn_tf: r.phiVn_kgf != null ? r.phiVn_kgf / 1000 : null,
          phiVnY_tf: r.phiVn_y_kgf != null ? r.phiVn_y_kgf / 1000 : null,
          Ve: r.Ve ?? null,
          autoVeOn: r.autoVeOn ?? null,
          designVxTf: r.designVxTf ?? null,
          designVyTf: r.designVyTf ?? null,
          veAutoX: r.veDemand?.autoX ?? null,
          veAutoY: r.veDemand?.autoY ?? null,
          hasPuRange: r.veDemand?.hasPuRange ?? null,
          PuAtMprX: r.veDemand?.PuAtMprX ?? null,
          PuAtMprY: r.veDemand?.PuAtMprY ?? null,
          forceVc0X: r.forceVc0X ?? null,
          forceVc0Y: r.forceVc0Y ?? null,
          lowAxialCol: r.lowAxialCol ?? null,
          okShearStrength: r.okShearStrength ?? null,
          okShearAvMin: r.okShearAvMin ?? null,
          avMinRequiredX: r.avMinRequiredX ?? null,
          avMinRequiredY: r.avMinRequiredY ?? null,
          avMinProvidedFytPerLenX: r.avMinProvidedFytPerLenX ?? null,
          avMinProvidedFytPerLenY: r.avMinProvidedFytPerLenY ?? null,
          avMinDemandFytPerLenX: r.avMinDemandFytPerLenX ?? null,
          avMinDemandFytPerLenY: r.avMinDemandFytPerLenY ?? null,
          okShearSize: r.okShearSize ?? null,
          shearSectionLimitX_tf: r.shearSectionLimitX != null ? r.shearSectionLimitX / 1000 : null,
          shearSectionLimitY_tf: r.shearSectionLimitY != null ? r.shearSectionLimitY / 1000 : null,
          vcStress: r.vcStress ?? null,
          okRhog: r.okRhog ?? null,
          pmOk: r.pmOk ?? null,
          okShear: r.okShear ?? null,
          confinementOk: r.confinementOk ?? null,
          scwbOk: r.scwb?.ok ?? null,
          okNbar: r.okNbar ?? null,
          isShort: r.isShort ?? null,
          deltaNS: r.deltaNS ?? null,
          AstReq: r.AstReq ?? null
        };
      })())));

      [
        'Pu', 'Mux', 'Muy', 'Vu_in', 'Vuy_in', 'tieS', 'crossTieS', 'spiralS', 'sSugg', 'shearSpacingLimitAuto', 'codeTieSpacingLimit', 'adoptedTieSpacing', 'seismicHx', 'seismicHxLimit', 'columnDevTop', 'columnDevBottom', 'columnLdTension', 'columnLdCompression', 'columnDevReq', 'seismicSoLimit', 'seismicSoRaw', 'seismicLongBarFactor', 'seismicLongBarLimit', 'firstHoopDist', 'seismicFirstHoopLimit', 'outsideTieS', 'outsideTieSInput', 'seismicMidSpacingLimit', 'lapSpliceStart', 'lapSpliceEnd', 'lapMiddleStart', 'lapMiddleEnd', 'lapSpliceLength', 'lapSpliceRatio', 'lapLdTension', 'lapLengthReqA', 'lapLengthReqB', 'lapLengthReq', 'lapClassAAstRatio', 'Ast', 'rhog', 'phiPnMax', 'phiMnAtPu',
        'phiMnyAtPu', 'breslerRatio', 'biaxialSurfaceRatio', 'phiVn_tf', 'phiVnY_tf',
        'Ve', 'designVxTf', 'designVyTf', 'veAutoX', 'veAutoY', 'PuAtMprX', 'PuAtMprY',
        'avMinProvidedFytPerLenX', 'avMinProvidedFytPerLenY',
        'avMinDemandFytPerLenX', 'avMinDemandFytPerLenY',
        'shearSectionLimitX_tf', 'shearSectionLimitY_tf', 'vcStress', 'deltaNS', 'AstReq'
      ].forEach(key => {
        actual[key] = sanitizeMetric(actual[key]);
      });

      Object.entries(tc.expected).forEach(([key, expected]) => {
        const pass = nearlyEqual(actual[key], expected, tolerance);
        assert(pass, `${tc.key} :: ${key}`, `expected=${expected} actual=${actual[key]}`);
      });
      Object.entries(tc.expectedIncludes || {}).forEach(([key, fragments]) => {
        const text = String(actual[key] ?? '');
        const list = Array.isArray(fragments) ? fragments : [fragments];
        list.forEach(fragment => {
          assert(text.includes(fragment), `${tc.key} :: ${key} includes`, `expected fragment=${fragment} actual=${text}`);
        });
      });

      if (tc.reportExpectedIncludes || tc.reportExpectedExcludes || tc.reportCoverageExpected || tc.reportCoverageIncludes) {
        const reportPayload = await page.evaluate(() => {
          let html = '';
          const previousOpen = window.open;
          window.open = () => ({
            document: {
              open() {},
              write(chunk) { html += String(chunk); },
              close() {}
            },
            close() {},
            closed: false
          });
          try {
            window.buildColumnReport();
          } finally {
            window.open = previousOpen;
          }
          return {
            html,
            summary: (window.lastColumnReportConfig && window.lastColumnReportConfig.summary),
            coverage: (window.lastColumnReportDiagnostics && window.lastColumnReportDiagnostics.coverage) || [],
            coverageSummary: (window.lastColumnReportConfig && window.lastColumnReportConfig.coverageSummary) || []
          };
        });
        if (tc.reportExpectedIncludes) {
          const fragments = Array.isArray(tc.reportExpectedIncludes) ? tc.reportExpectedIncludes : [tc.reportExpectedIncludes];
          fragments.forEach(fragment => {
            assert(reportPayload.html.includes(fragment), `${tc.key} :: report includes`, `expected fragment=${fragment}`);
          });
        }
        if (tc.reportExpectedExcludes) {
          assert(reportPayload.summary === false, `${tc.key} :: report summary hidden`, `summary=${reportPayload.summary}`);
          assert(reportPayload.coverageSummary.length === 0, `${tc.key} :: report coverage summary omitted`, `count=${reportPayload.coverageSummary.length}`);
          const fragments = Array.isArray(tc.reportExpectedExcludes) ? tc.reportExpectedExcludes : [tc.reportExpectedExcludes];
          fragments.forEach(fragment => {
            assert(!reportPayload.html.includes(fragment), `${tc.key} :: report excludes`, `unexpected fragment=${fragment}`);
          });
        }
        if (tc.reportCoverageExpected) {
          const byItem = new Map(reportPayload.coverage.map(row => [row.item, row]));
          Object.entries(tc.reportCoverageExpected).forEach(([item, expectedFields]) => {
            const row = byItem.get(item);
            assert(!!row, `${tc.key} :: coverage item exists`, `${item}; available=${reportPayload.coverage.map(r => r.item).join('、')}`);
            Object.entries(expectedFields).forEach(([field, expectedValue]) => {
              const actualValue = row[field];
              assert(nearlyEqual(actualValue, expectedValue, tolerance), `${tc.key} :: coverage ${item}.${field}`, `expected=${expectedValue} actual=${actualValue}`);
            });
          });
        }
        if (tc.reportCoverageIncludes) {
          const byItem = new Map(reportPayload.coverage.map(row => [row.item, row]));
          Object.entries(tc.reportCoverageIncludes).forEach(([item, expectedFields]) => {
            const row = byItem.get(item);
            assert(!!row, `${tc.key} :: coverage item exists`, `${item}; available=${reportPayload.coverage.map(r => r.item).join('、')}`);
            Object.entries(expectedFields).forEach(([field, fragments]) => {
              const actualText = String(row[field] ?? '');
              const list = Array.isArray(fragments) ? fragments : [fragments];
              list.forEach(fragment => {
                assert(actualText.includes(fragment), `${tc.key} :: coverage ${item}.${field} includes`, `expected fragment=${fragment} actual=${actualText}`);
              });
            });
          });
        }
      }
    }

    await exerciseColumnAttachmentBoundary(page, pack);
    await runColumnForceCandidateReviewCase(page);

    console.log('\nAll column regression checks passed.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
