const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { assertReportPdfTextQuality, assertReportScreenshotQuality } = require('./report-screenshot-quality');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.WALL_REPORT_PORT || 0);
const OUT_DIR = path.resolve(process.env.WALL_REPORT_OUT || (process.env.PREFLIGHT_RUN_DIR
  ? path.join(process.env.PREFLIGHT_RUN_DIR, 'rendered-delivery-evidence', 'rc-formal')
  : path.join(ROOT, 'output', 'playwright')));
const CASE_KEYS = (process.env.WALL_REPORT_CASES || 'shear_seismic,basement_oop,basement_pass_warn')
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
  shear_seismic: {
    title: '牆設計計算書',
    expectedSnapshot: 'NG',
    minCheckGroups: 8,
    fragments: [
      '結構剪力牆',
      "SSW fc' ≤ 350",
      '特殊邊界構材',
      'SBE 沿水平延伸',
      '18.7.4.4',
      '18.7.6.3',
      '牆水平斷面配筋示意',
      'P-M 設計互制圖',
      '兩端附加縱筋',
      '面內剪力',
    ],
  },
  basement_oop: {
    title: '牆設計計算書',
    expectedSnapshot: 'NG',
    minCheckGroups: 7,
    fragments: [
      '地下室外牆',
      '地下室外牆模型',
      '懸臂牆 (底部固定)',
      '地下室外牆土壓概算',
      '面外撓曲',
      'P-Δ 方法',
      '牆水平斷面配筋示意',
      'P-M 設計互制圖',
    ],
  },
  basement_pass_warn: {
    title: '牆設計計算書',
    expectedSnapshot: '待確認',
    minCheckGroups: 8,
    fragments: [
      '地下室外牆',
      '地下室外牆模型',
      '簡支條帶',
      '地下室外牆土壓概算',
      '牆水平斷面配筋示意',
      'P-M 設計互制圖',
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

function assertArtifact(file, expectedSignature, title) {
  const st = fs.statSync(file);
  const header = fs.readFileSync(file).subarray(0, expectedSignature.length);
  assert(st.size > 1024, title, `${path.basename(file)} ${st.size} bytes`);
  assert(header.equals(Buffer.from(expectedSignature)), `${title} signature`, path.basename(file));
}

async function openReportPopup(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  const triggerSelector = options.triggerSelector ?? '#btnReport';
  const knownPages = new Set(page.context().pages());
  await page.click(triggerSelector);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const report = page.context().pages().find(candidate => candidate !== page && !candidate.isClosed() && !knownPages.has(candidate));
    if (report) return report;
    await page.waitForTimeout(100);
  }
  throw new Error(`report popup did not open within ${timeoutMs}ms`);
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



function attachPageGuards(page, bucket, label) {
  page.on('console', msg => {
    if (msg.type() === 'error') bucket.consoleErrors.push({ label, url: page.url(), text: msg.text() });
  });
  page.on('pageerror', err => bucket.pageErrors.push({ label, url: page.url(), text: err.message }));
  page.on('response', res => {
    if (res.status() >= 400) bucket.failedResponses.push({ label, status: res.status(), url: res.url() });
  });
}

async function applyCase(page, key) {
  await page.evaluate(caseKey => {
    const selector = document.getElementById('testCaseSelect');
    if (selector) selector.value = caseKey;
    window.applyWallTestCase(caseKey);
    const showSteps = document.getElementById('showSteps');
    if (showSteps) {
      showSteps.checked = true;
      showSteps.dispatchEvent(new Event('input', { bubbles: true }));
      showSteps.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (typeof window.calcWall === 'function') window.calcWall();
    document.querySelector('.section-tabs button[data-tab="summary"]')?.click();
  }, key);
  await page.waitForFunction(caseKey => window.wallLast && (
    window.wallLast.testCaseKey === caseKey ||
    document.getElementById('testCaseSelect')?.value === caseKey
  ), key, { timeout: 10000 });
}

async function exerciseWallProjectStorage(page) {
  await page.evaluate(() => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if ((el.type || '').toLowerCase() === 'checkbox') el.checked = !!value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    document.querySelector('.mode-btn[data-mode="check"]')?.click();
    setField('projName', '牆專案存讀檔測試');
    setField('projNo', 'RC-WALL-001');
    setField('projDesigner', 'QA');
    setField('showSteps', true);
    setField('showDetailHelp', true);
    setField('showCaseTools', false);
    setField('wallType', 'shear');
    setField('seismicMode', true);
    setField('fc', 350);
    setField('fy', 4200);
    setField('h', 28);
    setField('lw', 520);
    setField('hw', 1600);
    setField('Pu', 180);
    setField('Vu', 145);
    setField('vBar', '#5');
    setField('vSp', 16);
    setField('hBar', '#5');
    setField('hSp', 18);
    const body = document.getElementById('aggBody');
    if (body) body.innerHTML = '';
    if (typeof window.addAggRow === 'function') {
      window.addAggRow({ tag: 'W-save', h: 28, lw: 520, hwlw: 3.1, rhot: 0.0034, Vu: 145 });
    }
    if (typeof window.calcWall === 'function') window.calcWall();
    document.querySelector('.section-tabs button[data-tab="summary"]')?.click();
  });
  await page.waitForTimeout(250);

  const saved = await page.evaluate(() => window.collectWallProjectData());
  assert(saved.schema === 'rc-wall-project-v1', 'wall project schema', saved.schema);
  assert(saved.tool === 'rc-wall', 'wall project tool id', saved.tool);
  assert(saved.mode === 'check', 'wall project stores mode', saved.mode);
  assert(saved.activeTab === 'summary', 'wall project stores active tab', saved.activeTab);
  assert(saved.metadata.projectName === '牆專案存讀檔測試', 'wall project metadata', saved.metadata.projectName);
  assert(saved.fields.fc.value === '350', 'wall project stores numeric input as editable value', saved.fields.fc.value);
  assert(saved.fields.showSteps.checked === true, 'wall project stores checkbox state', saved.fields.showSteps.checked);
  assert(saved.fields.wallProjectFile == null, 'wall project excludes file input', 'file input excluded');
  assert(saved.fields.caseJson == null, 'wall project excludes case JSON textarea', 'case textarea excluded');
  assert(saved.fields.baselineReport == null, 'wall project excludes baseline textarea', 'baseline textarea excluded');
  assert(Array.isArray(saved.aggRows) && saved.aggRows.length === 1 && saved.aggRows[0].tag === 'W-save', 'wall project stores aggregate rows', JSON.stringify(saved.aggRows));

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
    setField('projNo', 'RC-WALL-PLACEHOLDER');
    setField('projDesigner', '未填');
    return window.collectWallProjectData();
  });
  assert(placeholderSaved.metadata.projectName === '', 'wall placeholder project name is scrubbed from metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.metadata.projectNo === 'RC-WALL-PLACEHOLDER', 'wall placeholder project number remains editable metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.metadata.designer === '', 'wall placeholder designer is scrubbed from metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.fields.projName.value === '', 'wall placeholder project name is scrubbed from fields payload', JSON.stringify(placeholderSaved.fields.projName));
  assert(placeholderSaved.fields.projDesigner.value === '', 'wall placeholder designer is scrubbed from fields payload', JSON.stringify(placeholderSaved.fields.projDesigner));

  const restored = await page.evaluate(payload => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if ((el.type || '').toLowerCase() === 'checkbox') el.checked = !!value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setField('projName', '已覆寫');
    setField('fc', 280);
    setField('showSteps', false);
    const body = document.getElementById('aggBody');
    if (body) body.innerHTML = '';
    window.applyWallProjectData(payload, { silent: true });
    window.saveWallProjectDraft();
    setField('projName', '再次覆寫');
    window.loadWallProjectDraft();
    return {
      projectName: document.getElementById('projName')?.value,
      fc: document.getElementById('fc')?.value,
      showSteps: document.getElementById('showSteps')?.checked,
      mode: document.querySelector('.mode-btn.active')?.dataset.mode,
      activeTab: document.querySelector('.section-tabs button.active')?.dataset.tab,
      aggRows: window.collectWallProjectData().aggRows,
      draftRaw: localStorage.getItem('rc.wall.project.draft'),
      wallLastOk: !!window.wallLast,
    };
  }, saved);
  assert(restored.projectName === '牆專案存讀檔測試', 'wall project restores project name', restored.projectName);
  assert(restored.fc === '350', 'wall project restores numeric field', restored.fc);
  assert(restored.showSteps === true, 'wall project restores checkbox', restored.showSteps);
  assert(restored.mode === 'check', 'wall project restores mode', restored.mode);
  assert(restored.activeTab === 'summary', 'wall project restores active tab', restored.activeTab);
  assert(restored.aggRows.length === 1 && restored.aggRows[0].tag === 'W-save', 'wall project restores aggregate rows', JSON.stringify(restored.aggRows));
  assert(!!restored.draftRaw, 'wall project draft saved to localStorage', 'rc.wall.project.draft');
  assert(restored.wallLastOk, 'wall project recalculates after restore', 'wallLast present');
}

async function exerciseWallCapacityLoadCombo(page) {
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => window.wallLast?.designSearch?.candidates?.length > 0, null, { timeout: 10000 });
  const designCandidate = await page.evaluate(() => ({
    candidate:window.wallLast.designSearch.candidates[0],
    rowCount:document.querySelectorAll('#wallRebarDesignCandidates .wall-design-apply').length,
    text:document.getElementById('wallRebarDesignCandidates')?.innerText || '',
  }));
  assert(designCandidate.rowCount >= 1 && designCandidate.text.includes('容量式候選'), 'wall design mode renders ranked capacity-based reinforcement candidates', `rows=${designCandidate.rowCount}`);
  assert(designCandidate.candidate.pmUtilization <= 1 && designCandidate.candidate.shearUtilization <= 1, 'wall design candidate satisfies P-M and shear capacities', JSON.stringify(designCandidate.candidate));
  await page.click('.section-tabs button[data-tab="rebar"]');
  await page.click('#wallRebarDesignCandidates .wall-design-apply');
  await page.waitForFunction(() => document.querySelector('.mode-btn.active')?.dataset.mode === 'check' && !!window.wallLast, null, { timeout:10000 });
  const appliedDesign = await page.evaluate(() => ({
    mode:document.querySelector('.mode-btn.active')?.dataset.mode,
    vBar:document.getElementById('vBar')?.value,
    vSp:Number(document.getElementById('vSp')?.value),
    hBar:document.getElementById('hBar')?.value,
    hSp:Number(document.getElementById('hSp')?.value),
    layers:Number(document.getElementById('layers')?.value),
    boundary:document.getElementById('pmBoundaryRebar')?.checked,
    okPM:window.wallLast?.okPM,
    okShear:window.wallLast?.okShear,
  }));
  assert(appliedDesign.mode === 'check'
    && appliedDesign.vBar === designCandidate.candidate.vBar && appliedDesign.vSp === designCandidate.candidate.vSp
    && appliedDesign.hBar === designCandidate.candidate.hBar && appliedDesign.hSp === designCandidate.candidate.hSp
    && appliedDesign.layers === designCandidate.candidate.layers && appliedDesign.boundary === designCandidate.candidate.boundaryEnabled,
  'wall applies one complete reinforcement candidate and switches to check mode', JSON.stringify(appliedDesign));
  assert(appliedDesign.okPM === true && appliedDesign.okShear === true, 'applied wall design candidate passes formal recalculation', `P-M=${appliedDesign.okPM}, V=${appliedDesign.okShear}`);

  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if ((el.type || '').toLowerCase() === 'checkbox') el.checked = !!value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    document.querySelector('.mode-btn[data-mode="check"]')?.click();
    setField('wallType', 'bearing');
    setField('seismicMode', false);
    setField('fc', 280);
    setField('fy', 4200);
    setField('h', 25);
    setField('lw', 500);
    setField('lc', 300);
    setField('k', 1);
    setField('hw', 1200);
    setField('e', 2);
    setField('MuIn', '');
    setField('hBar', '#4');
    setField('hSp', 18);
    setField('lcWall_P_D', 100);
    setField('lcWall_P_L', 0);
    setField('lcWall_P_W', -180);
    setField('lcWall_P_E', 0);
    setField('lcWall_M_D', 10);
    setField('lcWall_M_L', 0);
    setField('lcWall_M_W', -80);
    setField('lcWall_M_E', 0);
    setField('lcWall_V_D', 10);
    setField('lcWall_V_L', 0);
    setField('lcWall_V_W', -50);
    setField('lcWall_V_E', 0);
    window.calcWall();
    window.LoadCombo.refreshLimitStateSuggestions(window.rcWallLoadComboConfig);
  });
  await page.waitForFunction(() => window.lastLoadComboSuggestions?.lcWall?.states?.length === 2, null, { timeout: 10000 });

  const initial = await page.evaluate(() => ({
    states:window.lastLoadComboSuggestions.lcWall.states,
    phiPn:window.wallLast?.phiPn_kgf / 1000,
    phiVn:window.wallLast?.phiVn_kgf / 1000,
  }));
  const pm = initial.states.find(state => state.key === 'pm-capacity');
  const shear = initial.states.find(state => state.key === 'shear-capacity');
  const tensionEvaluation = pm?.evaluations?.find(item => item.name === '0.9D+1.0W');
  assert(pm?.criterion === 'custom' && pm.details?.status === 'evaluated', 'wall load combo uses P-M capacity scorer', `${pm?.governing?.name}: criterion=${pm?.criterion}`);
  assert(pm?.governing?.values?.P === -90 && pm?.governing?.values?.M === -71 && pm.details?.phiMn > 0, 'wall P-M suggestion preserves the governing tension tuple and formal φMn', `${pm?.governing?.name}: P=${pm?.governing?.values?.P}, M=${pm?.governing?.values?.M}, φMn=${pm?.details?.phiMn}`);
  assert(tensionEvaluation?.details?.status === 'evaluated' && tensionEvaluation?.details?.P === -90, 'wall tension tuple is evaluated by the P-M envelope', `${tensionEvaluation?.name}: utilization=${tensionEvaluation?.details?.utilization}`);
  assert(shear?.details?.status === 'evaluated' && shear.details?.shearCapacity === initial.phiVn, 'wall shear suggestion uses formal φVn', `${shear?.governing?.name}: utilization=${shear?.score}`);
  assert(shear?.governing?.values?.V === 62, 'wall shear suggestion retains signed source tuple', `${shear?.governing?.name}: V=${shear?.governing?.values?.V}`);

  await page.evaluate(() => {
    document.getElementById('lcWall_limit_1_select')?.click();
    document.getElementById('lcWall_btnApply')?.click();
  });
  await page.waitForFunction(() => Math.abs((window.wallLast?.Vu_kgf || 0) - 62000) < 1e-6, null, { timeout: 10000 });
  const applied = await page.evaluate(() => ({
    Pu:document.getElementById('Pu')?.value,
    Mu:document.getElementById('MuIn')?.value,
    Vu:document.getElementById('Vu')?.value,
    selected:window.lastLoadCombo?.lcWall?.selectedTuple,
    preserved:window.lastLoadCombo?.lcWall?.tuplePreserved,
    reportText:window.LoadCombo.toReportGroup('lcWall', '載重組合')?.items?.map(item => `${item.label} ${item.value}`).join(' ') || '',
  }));
  assert(applied.preserved === true && applied.selected?.values?.P === 300 && applied.selected?.values?.M === 92 && applied.selected?.values?.V === 62, 'wall applies one complete governing tuple', JSON.stringify(applied.selected));
  assert(Number(applied.Pu) === 300 && Number(applied.Mu) === 92 && Number(applied.Vu) === 62, 'wall writes signed P and magnitude M/V to formal demand fields', `Pu=${applied.Pu}, Mu=${applied.Mu}, Vu=${applied.Vu}`);
  assert(!/容量利用率|軸力越界|控制候選/.test(applied.reportText), 'wall report records adopted tuple without page-only ranking commentary', applied.reportText);

  const reranked = await page.evaluate(() => {
    const before = window.lastLoadComboSuggestions.lcWall.states.find(state => state.key === 'shear-capacity')?.score;
    const hSp = document.getElementById('hSp');
    hSp.value = '40';
    hSp.dispatchEvent(new Event('input', { bubbles:true }));
    hSp.dispatchEvent(new Event('change', { bubbles:true }));
    const afterState = window.lastLoadComboSuggestions.lcWall.states.find(state => state.key === 'shear-capacity');
    return { before, after:afterState?.score, status:afterState?.details?.status };
  });
  assert(reranked.status === 'evaluated' && reranked.after > reranked.before, 'wall reinforcement change reranks shear utilization', `${reranked.before} -> ${reranked.after}`);

  const boundarySection = await page.evaluate(() => {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if ((el.type || '').toLowerCase() === 'checkbox') el.checked = !!value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles:true }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
    };
    set('cover', 4);
    set('pmBoundaryBar', '#8');
    set('pmBoundaryCountEach', 4);
    set('pmBoundaryRebar', true);
    const result = {
      cover:window.wallLast?.cover,
      enabled:window.wallLast?.pmBoundaryRebar,
      Ast:window.wallLast?.pmAst,
      AstDistributed:window.wallLast?.pmAstDistributed,
      AstBoundary:window.wallLast?.pmAstBoundary,
      boundaryCount:window.wallLast?.pmBoundaryBarCountTotal,
      diagramMarkup:document.getElementById('wallPMDiagram')?.innerHTML || '',
      boundaryPanelDisplay:getComputedStyle(document.getElementById('pmBoundaryRebarInputs')).display,
    };
    set('pmBoundaryRebar', false);
    set('cover', 2);
    return result;
  });
  assert(boundarySection.enabled === true && boundarySection.cover === 4 && boundarySection.boundaryCount === 8, 'wall accepts cover and per-end concentrated reinforcement inputs', JSON.stringify(boundarySection));
  assert(boundarySection.AstBoundary > 0 && boundarySection.Ast > boundarySection.AstDistributed, 'wall end reinforcement enters formal P-M steel area', `Ast=${boundarySection.Ast}, distributed=${boundarySection.AstDistributed}, boundary=${boundarySection.AstBoundary}`);
  assert(boundarySection.diagramMarkup.includes('<polygon') && boundarySection.diagramMarkup.includes('需求'), 'wall page renders P-M envelope and demand point', `markup=${boundarySection.diagramMarkup.length}`);
  assert(boundarySection.boundaryPanelDisplay !== 'none', 'wall shows end reinforcement controls when enabled', boundarySection.boundaryPanelDisplay);

  const derivedLargeE = await page.evaluate(() => {
    const set = (id, value) => {
      const el = document.getElementById(id);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles:true }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
    };
    set('Pu', '80');
    set('MuIn', '');
    set('e', '10');
    return { eOk:window.wallLast?.eOk, okPM:window.wallLast?.okPM, MuIn:window.wallLast?.MuIn, pmStatus:window.wallLast?.pmStatus };
  });
  assert(derivedLargeE.eOk === false && derivedLargeE.okPM === true && derivedLargeE.pmStatus === 'evaluated' && Math.abs(derivedLargeE.MuIn - 8) < 1e-9, 'wall derives Mu=Pu·e and keeps P-M active beyond the simple-formula range', JSON.stringify(derivedLargeE));

  const axialOut = await page.evaluate(() => {
    const p = document.getElementById('lcWall_P_D');
    p.value = '2000';
    p.dispatchEvent(new Event('input', { bubbles:true }));
    return window.lastLoadComboSuggestions.lcWall.states.find(state => state.key === 'pm-capacity');
  });
  assert(axialOut?.details?.status === 'axial-out-of-range' && axialOut?.score >= 1e12 && axialOut?.details?.scoreLabel === '軸力越界', 'wall P-M axial envelope overflow fails closed in browser workflow', `${axialOut?.governing?.name}: ${axialOut?.details?.scoreLabel}`);
}

async function reportMetrics(report) {
  return report.evaluate(() => {
    const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
    const paper = document.querySelector('.rep-paper');
    const paperRect = paper?.getBoundingClientRect();
    const calculationPaper = paper?.cloneNode(true);
    calculationPaper?.querySelector('.rep-document-status-line')?.remove();
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
      calculationFingerprint: clean(document.querySelector('.rep-meta')?.innerText).match(/計算指紋\s*(CF-[A-F0-9]{16})/)?.[1] || '',
      summary: clean(document.querySelector('.rep-summary')?.textContent),
      summaryClass: document.querySelector('.rep-summary')?.className || '',
      hasReportSummary: Boolean(document.querySelector('.rep-summary')),
      documentState: document.querySelector('.rep-document-status-line')?.dataset.documentClass || '',
      documentApproved: document.querySelector('.rep-document-status-line')?.dataset.approved || '',
      documentStateText: clean(document.querySelector('.rep-document-status-line')?.textContent),
      bodyText: clean(document.body.innerText),
      calculationText: clean(calculationPaper?.innerText),
      checkGroupCount: document.querySelectorAll('.rep-check').length,
      methodRowCount: document.querySelectorAll('.rep-method tbody tr').length,
      stepCount: document.querySelectorAll('.rep-step').length,
      diagramCount: document.querySelectorAll('.rep-diagram img').length,
      imageNaturalSizes: [...document.querySelectorAll('.rep-diagram img')].map(img => ({
        alt: img.getAttribute('alt') || '',
        width: img.naturalWidth,
        height: img.naturalHeight,
      })),
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      paperWidth: paperRect ? Math.round(paperRect.width) : null,
      overflowSample: overflowing,
    };
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wallHtml = fs.readFileSync(path.join(ROOT, '鋼筋混凝土', 'tools', 'wall.html'), 'utf8');
  const sharedCommon = fs.readFileSync(path.join(ROOT, '鋼筋混凝土', 'shared', 'common.js'), 'utf8');
  assert(sharedCommon.includes('window.RCUI.normalizeProjectFieldValue'), 'shared/common.js exposes project metadata normalizer', 'placeholder project text can be scrubbed once');
  assert(wallHtml.includes("projectName: window.RCUI.normalizeProjectFieldValue($('projName')?.value)"), 'wall project payload normalizes placeholder project name', 'project storage metadata uses shared normalizer');
  assert(!wallHtml.includes("$('projName').value.trim()"), 'wall report/project metadata no longer uses raw trim on project name', 'shared normalizer handles placeholder cleanup');
  const chromePath = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert(!!chromePath, 'browser executable', chromePath || 'not found');
  if (!chromePath) process.exit(1);

  const server = await serveStatic(ROOT, PORT);
  const actualPort = server.address().port;
  const toolUrl = `http://127.0.0.1:${actualPort}${encodedUrlPath('/鋼筋混凝土/tools/wall.html')}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--disable-popup-blocking'],
  });

  const guard = { consoleErrors: [], pageErrors: [], failedResponses: [] };
  const results = [];

  try {
    const storagePage = await browser.newPage({ viewport: { width: 1320, height: 980 }, deviceScaleFactor: 1 });
    attachPageGuards(storagePage, guard, 'project-storage:tool');
    const storageResponse = await storagePage.goto(toolUrl, { waitUntil: 'networkidle', timeout: 30000 });
    assert(storageResponse && storageResponse.status() === 200, 'wall project storage page loads', `status=${storageResponse && storageResponse.status()}`);
    await exerciseWallProjectStorage(storagePage);
    await exerciseWallCapacityLoadCombo(storagePage);
    await storagePage.close();

    for (const key of CASE_KEYS) {
      const expected = EXPECTED[key];
      assert(!!expected, `${key} expected contract exists`, 'wall report visual case');
      const page = await browser.newPage({ viewport: { width: 1320, height: 980 }, deviceScaleFactor: 1 });
      attachPageGuards(page, guard, `${key}:tool`);

      const response = await page.goto(toolUrl, { waitUntil: 'networkidle', timeout: 30000 });
      assert(response && response.status() === 200, `${key} tool page loads`, `status=${response && response.status()}`);
      await page.fill('#projName', 'RC 牆正式附件測試');
      await page.fill('#projNo', 'RC-WALL-001');
      await page.fill('#projDesigner', 'QA');
      await applyCase(page, key);
      await page.waitForTimeout(350);

      const state = await page.evaluate(() => ({
        banner: document.getElementById('bannerStatus')?.innerText?.replace(/\s+/g, ' ').trim() || '',
        wallLastOk: !!window.wallLast,
        wallType: window.wallLast?.wallType,
        seismic: window.wallLast?.seismic,
        bwModelLabel: window.wallLast?.bwModelLabel,
        summaryOk: window.wallLast?.summaryOk,
        summaryText: window.wallLast?.summaryText,
        reviewWarningCount: window.wallLast?.reviewWarnings?.length || 0,
        methodRows: window.getWallMethodAuditRows ? window.getWallMethodAuditRows(window.wallLast).length : 0,
        readinessText: document.getElementById('wallAttachmentReadinessCard')?.innerText?.replace(/\s+/g, ' ').trim() || '',
        readinessStatus: document.getElementById('wallAttachmentReadiness')?.dataset.attachmentStatus || '',
      }));
      assert(state.wallLastOk, `${key} calculation state exists`, state.banner);
      assert(state.methodRows >= 6, `${key} method audit rows`, `rows=${state.methodRows}`);
      assert(state.readinessText.includes('產報前檢查'), `${key} page attachment readiness card`, state.readinessText);
      assert(state.readinessText.includes('不會寫入計算書或列印 PDF'), `${key} page attachment readiness boundary`, state.readinessText);
      assert(state.readinessText.includes('優先閱讀'), `${key} page attachment readiness priority`, state.readinessText);
      assert(state.readinessText.includes('案件識別資料') && state.readinessText.includes('已填'), `${key} page metadata completeness`, state.readinessText);
      if (expected.expectedSnapshot === 'NG' || expected.expectedSnapshot === '待確認') {
        assert(!state.banner.includes('OK — 符合規範'), `${key} no misleading summary banner`, state.banner);
      }
      if (expected.expectedSnapshot === '待確認') {
        assert(state.summaryOk === null, `${key} summary is manual review`, `summaryOk=${state.summaryOk}, text=${state.summaryText}`);
        assert(state.reviewWarningCount >= 1, `${key} review warnings captured`, `count=${state.reviewWarningCount}`);
        assert(state.readinessText.includes('待人工複核'), `${key} page readiness flags review`, state.readinessText);
      }
      const sourceFingerprint = await page.evaluate(() => window.collectWallProjectData().calculationFingerprint);
      const report = await openReportPopup(page);
      attachPageGuards(report, guard, `${key}:report`);
      await report.waitForSelector('.rep-paper', { timeout: 10000 });
      await report.setViewportSize({ width: 980, height: 1300 });
      await report.waitForTimeout(500);

      const screenshotPath = path.join(OUT_DIR, `wall-report-${key}.png`);
      const pdfPath = path.join(OUT_DIR, `wall-report-${key}.pdf`);
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
      const screenshotQuality = assertReportScreenshotQuality(screenshotPath, `${key} report`, { assert });
      const pdfTextQuality = assertReportPdfTextQuality(pdfPath, `${key} report`, {
        assert,
        include: ['牆設計計算書', '計算書', '文件狀態：內部審閱'],
        exclude: ['DRAFT／非正式附件'],
      });
      results.push({ key, screenshotPath, pdfPath, state, metrics, printMetrics, screenshotQuality, pdfTextQuality });

      assert(metrics.title === expected.title, `${key} report title`, metrics.title);
      assert(/^CF-[A-F0-9]{16}$/.test(sourceFingerprint), `${key} project JSON calculation fingerprint`, sourceFingerprint);
      assert(metrics.calculationFingerprint === sourceFingerprint, `${key} project JSON matches report calculation fingerprint`, `${sourceFingerprint} -> ${metrics.calculationFingerprint}`);
      assert(!metrics.hasReportSummary, `${key} report status banner hidden`, 'no .rep-summary');
      assert(metrics.documentState === 'internal-review' && metrics.documentApproved === 'false', `${key} report defaults to printable internal review independent of engineering readiness`, `${state.readinessStatus} -> ${metrics.documentState}`);
      assert(metrics.documentStateText.includes('文件狀態：內部審閱'), `${key} report carries concise document status`, metrics.documentStateText);
      assert(metrics.checkGroupCount >= expected.minCheckGroups, `${key} report check groups`, `count=${metrics.checkGroupCount}`);
      assert(metrics.methodRowCount === 0, `${key} report excludes method audit table`, `count=${metrics.methodRowCount}`);
      assert(metrics.stepCount >= 4, `${key} report detailed steps`, `count=${metrics.stepCount}`);
      assert(metrics.diagramCount >= 2, `${key} report diagrams`, `count=${metrics.diagramCount}`);
      for (const img of metrics.imageNaturalSizes) {
        assert(img.width > 0 && img.height > 0, `${key} diagram rendered: ${img.alt || '(image)'}`, `${img.width}x${img.height}`);
      }
      for (const fragment of expected.fragments || []) {
        assert(metrics.bodyText.includes(fragment), `${key} report includes`, fragment);
      }
      for (const forbidden of [
        '產報前檢查',
        '優先閱讀',
        '待人工複核',
        '可作附件，需人工複核',
        '暫勿作附件',
        '不會寫入計算書或列印 PDF',
        '待確認 / 正式分析需求',
        '待確認事項 1',
        '不列為 OK 結論',
        '需正式分析確認',
        '計算方法與適用邊界',
        '條文對照 ＆ 方法分級',
        '規範覆蓋矩陣',
      ]) {
        assert(!metrics.calculationText.includes(forbidden), `${key} report excludes page-only status`, forbidden);
      }
      assert(!/NaN|Infinity|undefined|null|∞/.test(metrics.bodyText), `${key} report has no raw invalid tokens`, 'no NaN/Infinity/undefined/null/∞');
      assert(!metrics.bodyText.includes('18.10'), `${key} report has no stale 18.10 clause refs`, 'uses 112 18.7 wall clauses');
      assert(metrics.overflowSample.length === 0, `${key} report element overflow`, metrics.overflowSample.map(o => `${o.tag}.${o.cls}`).join(', ') || 'none');
      assert(metrics.documentScrollWidth <= metrics.viewportWidth + 2, `${key} report horizontal overflow`, `scroll=${metrics.documentScrollWidth}, viewport=${metrics.viewportWidth}`);
      assert(printMetrics.toolbarDisplay === 'none', `${key} print toolbar hidden`, `display=${printMetrics.toolbarDisplay}`);
      assertArtifact(screenshotPath, [0x89, 0x50, 0x4e, 0x47], `${key} screenshot written`);
      assertArtifact(pdfPath, [0x25, 0x50, 0x44, 0x46], `${key} pdf written`);

      await report.close();
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  const auditPath = path.join(OUT_DIR, 'wall-report-visual-audit.json');
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
  assert(fs.existsSync(auditPath), 'wall report visual audit written', auditPath);

  if (failed) {
    console.error(`\n${failed} wall report visual checks failed.`);
    process.exit(1);
  }
  console.log(`\nWall report visual smoke OK (${CASE_KEYS.length} reports).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
