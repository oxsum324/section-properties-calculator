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
  assert(imported.status.includes('已讀取柱專案檔'), 'column project file input status', imported.status);

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
  assert(html.includes('pmCore.curve'), 'column.html calls shared PM section engine', 'rectangular column P-M uses shared core');
  assert(html.includes('reportCoverage'), 'column.html builds report coverage matrix', 'code-clause coverage matrix exists');
  assert(html.includes('summary:false'), 'column report hides top summary banner', 'operator-only reminders stay out of the report');
  assert(!html.includes('coverageSummary: reportCoverageSummary'), 'column report omits coverage summary cards', 'gap summaries stay on the page, not in the report');
  assert(html.includes('lastColumnReportConfig'), 'column.html exposes last report config', 'report coverage can be regression tested');
  assert(html.includes('function collectColumnManualReviewItems'), 'column.html centralizes manual-review items', 'banner and report share pending-review boundaries');
  assert(html.includes('COLUMN_PROJECT_SCHEMA'), 'column.html has project file schema', 'versioned column project file exists');
  assert(html.includes('btnSaveProject'), 'column.html has save project button', 'local JSON export control exists');
  assert(html.includes('btnLoadProject'), 'column.html has load project button', 'local JSON import control exists');
  assert(html.includes('rc.column.project.draft'), 'column.html has browser draft storage key', 'browser-local draft storage exists');
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
            coverage: (window.lastColumnReportConfig && window.lastColumnReportConfig.coverage) || [],
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
