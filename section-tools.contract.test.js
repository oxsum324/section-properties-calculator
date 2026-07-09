const fs = require('fs');
const path = require('path');
const vm = require('vm');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function functionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert(start >= 0, `${functionName} exists`, functionName);
  const next = source.indexOf('\nfunction ', start + 1);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertPrintHidesSelectors(text, selectors, label) {
  selectors.forEach(selector => {
    const pattern = new RegExp(`@media\\s+print[\\s\\S]*${escapeRegex(selector)}[\\s\\S]*display:\\s*none\\s*!important`);
    assert(pattern.test(text), `${label} print hides ${selector}`, selector);
  });
}

function assertFunctionTemplateExcludes(source, functionName, startNeedle, needles, label) {
  const body = functionSource(source, functionName);
  const start = body.indexOf(startNeedle);
  assert(start >= 0, `${label} template exists`, startNeedle);
  const template = body.slice(start);
  for (const needle of needles) {
    assert(!template.includes(needle), `${label} excludes page-only readiness wording`, needle);
  }
}

function assertReportPayloadExcludes(source, functionName, needles) {
  const body = functionSource(source, functionName);
  const reportStart = body.indexOf('openReport({');
  assert(reportStart >= 0, `${functionName} calls openReport`, 'openReport');
  const payload = body.slice(reportStart);
  for (const needle of needles) {
    assert(!payload.includes(needle), `${functionName} keeps page-only status out of report payload`, needle);
  }
}

function assertProjectMetaUsesSharedNormalization(source, label, exportFunctions) {
  assert(source.includes('window.ToolReportUI?.normalizeProjectFieldValue'), `${label} uses shared placeholder normalization when available`, 'ToolReportUI.normalizeProjectFieldValue');
  assert(source.includes('function getProjectFieldValue(id)'), `${label} exposes normalized project field reader`, 'getProjectFieldValue');
  const missingBody = functionSource(source, 'missingProjectFields');
  assert(missingBody.includes("['設計人員', 'projDesigner']"), `${label} readiness requires designer metadata`, missingBody);
  assert(missingBody.includes('!getProjectFieldValue(id)'), `${label} readiness checks normalized project fields`, missingBody);
  for (const functionName of exportFunctions) {
    const body = functionSource(source, functionName);
    assert(/name:\s*getProjectFieldValue\('projName'\)/.test(body), `${label} ${functionName} normalizes project name before report export`, body);
    assert(/no:\s*getProjectFieldValue\('projNo'\)/.test(body), `${label} ${functionName} normalizes project number before report export`, body);
    assert(/designer:\s*getProjectFieldValue\('projDesigner'\)/.test(body), `${label} ${functionName} normalizes designer before report export`, body);
    assert(!/document\.getElementById\('projName'\)\.value\s*\|\|\s*''/.test(body), `${label} ${functionName} no longer exports raw project name`, body);
    assert(!/document\.getElementById\('projDesigner'\)\.value\s*\|\|\s*''/.test(body), `${label} ${functionName} no longer exports raw designer`, body);
  }
}

function renderSharedReportHtml(source, filename, project = {}) {
  return renderSharedReportPayload(source, filename, {
    title: 'QA 計算書',
    subtitle: 'Report Runtime Smoke',
    project,
    inputs: [{ group: '輸入資料', items: [{ label: 'A', value: '1', unit: '' }] }],
    checks: [{ group: '檢核結果', items: [{ label: 'A', formula: 'A', sub: '1', value: '1', unit: '', ok: true }] }],
    summary: { ok: true, text: 'OK' },
    notes: ['正式報告備註'],
  });
}

function renderSharedReportPayload(source, filename, payload) {
  let html = '';
  const context = {
    window: {
      open() {
        return {
          document: {
            open() {},
            write(nextHtml) { html += String(nextHtml || ''); },
            close() {},
          },
        };
      },
    },
    console,
    Date,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename });
  assert(typeof context.openReport === 'function', `${filename} exposes openReport`, 'openReport');
  context.openReport(payload);
  return html;
}

function captureRetrofitReportPayload(source, functionName, stateKey, stateValue) {
  let payload = null;
  const statuses = [];
  const elements = new Map([
    ['projName', { value: '未填' }],
    ['projNo', { value: 'RETROFIT-QA-001' }],
    ['projDesigner', { value: 'Codex QA' }],
    ['projNote', { value: '' }],
    ['beamCanvas', { toDataURL() { return 'data:image/png;base64,beam'; } }],
    ['colCanvas', { toDataURL() { return 'data:image/png;base64,column'; } }],
    ['pmCanvas', { toDataURL() { return 'data:image/png;base64,pm'; } }],
    ['b-report-status', { textContent: '', className: '' }],
    ['c-report-status', { textContent: '', className: '' }],
  ]);
  const context = {
    window: {
      ToolReportUI: {
        normalizeProjectFieldValue(value) {
          const text = (value == null ? '' : String(value)).trim();
          return text === '未填' ? '' : text;
        },
      },
    },
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      },
    },
    openReport(nextPayload) {
      payload = nextPayload;
    },
    setReportStatus(id, message, tone = 'warn') {
      statuses.push({ id, message, tone });
      const el = elements.get(id);
      if (!el) return;
      el.textContent = message || '';
      el.className = `report-status${message ? ` ${tone}` : ''}`;
    },
    console,
    Date,
    Math,
    isFinite,
    [stateKey]: stateValue,
  };
  vm.createContext(context);
  ['fmt', 'normalizeProjectFieldValue', 'getProjectFieldValue', functionName].forEach(name => {
    vm.runInContext(functionSource(source, name), context, { filename: `${functionName}:${name}` });
  });
  assert(typeof context[functionName] === 'function', `${functionName} runtime function exists`, functionName);
  context[functionName]();
  assert(statuses.length === 0, `${functionName} runtime skips fallback status`, JSON.stringify(statuses));
  assert(payload && typeof payload === 'object', `${functionName} runtime captures report payload`, functionName);
  return payload;
}

const pageOnlyReportStatusNeedles = [
  '產報前檢查',
  '優先閱讀',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
  '頁面顯示，不進計算書、列印或 PDF',
];

const tools = [
  {
    label: 'section property picker',
    path: 'index.html',
    needles: ['id="exportStatus"', 'function setStatus', 'sendIxToOpener()'],
  },
  {
    label: 'section property standalone',
    path: '斷面性質計算.html',
    needles: ['id="exportStatus"', 'function setStatus'],
  },
  {
    label: 'composite section report',
    path: '合成斷面性質.html',
    needles: ['id="reportStatus"', 'id="reportReadiness"', 'function compositeReportReadinessModel', 'page-only-report-status'],
  },
  {
    label: 'RC retrofit section reports',
    path: 'RC補強斷面性質.html',
    needles: ['id="b-report-status"', 'id="c-report-status"', 'id="b-report-readiness"', 'id="c-report-readiness"', 'function renderReportReadiness', 'page-only-report-status'],
  },
];

for (const tool of tools) {
  const html = read(tool.path);
  assert(!html.includes('alert('), `${tool.label} uses inline feedback`, tool.path);
  for (const needle of tool.needles) {
    assert(html.includes(needle), `${tool.label} keeps feedback contract`, needle);
  }
}

const compositeHtml = read('合成斷面性質.html');
assertReportPayloadExcludes(compositeHtml, 'exportReport', pageOnlyReportStatusNeedles);
assertProjectMetaUsesSharedNormalization(compositeHtml, 'composite section report', ['exportReport']);

const rcRetrofitHtml = read('RC補強斷面性質.html');
assertReportPayloadExcludes(rcRetrofitHtml, 'exportBeamReport', pageOnlyReportStatusNeedles);
assertReportPayloadExcludes(rcRetrofitHtml, 'exportColReport', pageOnlyReportStatusNeedles);
assertProjectMetaUsesSharedNormalization(rcRetrofitHtml, 'RC retrofit section reports', ['exportBeamReport', 'exportColReport']);

const sharedReportSource = read(path.join('結構工具箱', 'core', 'ui', 'report.js'));
const retrofitBeamPayload = captureRetrofitReportPayload(rcRetrofitHtml, 'exportBeamReport', 'lastBeam', {
  geom: {
    b_mm: 30, h_mm: 60, d_mm: 55, dp_mm: 5,
    fc: 280, fy: 4200, As: 12.3, Asp: 6.2,
    mode: 'frp',
    eps_bi: 0.0012,
    frpInfo: {
      Ef_GPa: 230,
      ffu_MPa: 3800,
      efu_pct: 1.67,
      tf_mm: 0.167,
      nLayer: 2,
      CE: 0.85,
      bf_mm: 300,
      frp_uwrap: true,
      slab_mm: 12,
      hsp_f_mm: 48,
      Af_side_cm2: 3.21,
      eps_fd_calc: 0.0046,
    },
  },
  elastic: {
    uncr0: { A: 1800, I: 540000 },
    uncr: { A: 1820, I: 580000 },
    crk0: { ok: true, Icr: 210000 },
    crk: { ok: true, Icr: 260000 },
    Ec: 200000,
  },
  ult: {
    res0: { c: 8.2, Mn: 8.4e6, phi: 0.9 },
    res: { c: 7.8, Mn: 1.12e7, phi: 0.9, es: 0.0061, eps_fe: 0.0038, eps_fd: 0.0046, failMode: 'FRP rupture' },
  },
  shear: {
    Vc: 150000,
    Vs_stir: 90000,
    Vs_plate: 0,
    Vf: 30000,
    frpShearInfo: { Le_mm: 250, kv: 0.62, kv_raw: 0.68, eps_fe_s: 0.0038, eps_fe_aci: 0.0034 },
    Vn_base: 240000,
    Vn: 270000,
    phiVn_base: 180000,
    phiVn: 202500,
    shearRatio: 0.92,
  },
});
const retrofitBeamHtml = renderSharedReportPayload(
  sharedReportSource,
  path.join(__dirname, '結構工具箱', 'core', 'ui', 'report.js'),
  retrofitBeamPayload
);
assert(retrofitBeamHtml.includes('RC 梁補強斷面計算書'), 'RC retrofit beam runtime report title', 'RC 梁補強斷面計算書');
assert(retrofitBeamHtml.includes('計畫名稱</b>—'), 'RC retrofit beam runtime project placeholder', '計畫名稱 —');
assert(retrofitBeamHtml.includes('RETROFIT-QA-001'), 'RC retrofit beam runtime project number', 'RETROFIT-QA-001');
assert(retrofitBeamHtml.includes('Codex QA'), 'RC retrofit beam runtime project designer', 'Codex QA');
assert(!retrofitBeamHtml.includes('未填'), 'RC retrofit beam runtime excludes raw placeholder project text', '未填');
for (const needle of pageOnlyReportStatusNeedles) {
  assert(!retrofitBeamHtml.includes(needle), 'RC retrofit beam runtime report excludes page-only readiness wording', needle);
}

const retrofitColumnPayload = captureRetrofitReportPayload(rcRetrofitHtml, 'exportColReport', 'lastCol', {
  geom: {
    b_mm: 40, h_mm: 80, fc: 350, fy: 4200, Ast: 25.6,
    rebarMode: 'detail',
    mode: 'jacket',
    rebarLayers: [
      { A: 6.43, y: 5.0, label: '頂排 4-D29' },
      { A: 6.43, y: 75.0, label: '底排 4-D29' },
    ],
    jacketInfo: { tj_mm: 9, fyj: 2800, ke: 0.85 },
  },
  confine: { f_l: 45, f_cc: 420 },
  axial: { Po_base: 2.5e6, Po_conf: 3.2e6, Pn_max_base: 2.0e6, Pn_max_conf: 2.56e6 },
  flex: { Mn_base: 1.2e7, Mn_conf: 1.8e7, c_base: 12, c_conf: 10 },
  pm: {
    Nu_kgf: 900000,
    Mu_kgfcm: 1.1e7,
    demandAtPu_base: { phiMn: 8.0e6 },
    demandAtPu_conf: { phiMn: 1.3e7 },
    checkRatio_conf: 0.84,
  },
  shear: { Vc: 180000, Vs_used: 95000, Vj: 40000, Vn_base: 275000, Vn: 315000, phiVn_base: 206250, phiVn: 236250 },
});
const retrofitColumnHtml = renderSharedReportPayload(
  sharedReportSource,
  path.join(__dirname, '結構工具箱', 'core', 'ui', 'report.js'),
  retrofitColumnPayload
);
assert(retrofitColumnHtml.includes('RC 柱補強斷面計算書'), 'RC retrofit column runtime report title', 'RC 柱補強斷面計算書');
assert(retrofitColumnHtml.includes('計畫名稱</b>—'), 'RC retrofit column runtime project placeholder', '計畫名稱 —');
assert(retrofitColumnHtml.includes('RETROFIT-QA-001'), 'RC retrofit column runtime project number', 'RETROFIT-QA-001');
assert(retrofitColumnHtml.includes('Codex QA'), 'RC retrofit column runtime project designer', 'Codex QA');
assert(!retrofitColumnHtml.includes('未填'), 'RC retrofit column runtime excludes raw placeholder project text', '未填');
for (const needle of pageOnlyReportStatusNeedles) {
  assert(!retrofitColumnHtml.includes(needle), 'RC retrofit column runtime report excludes page-only readiness wording', needle);
}

const sharedReportHtml = renderSharedReportHtml(
  sharedReportSource,
  path.join(__dirname, '結構工具箱', 'core', 'ui', 'report.js'),
  { name: '未填', no: 'SECTION-VERIFY-001', designer: 'Codex QA' }
);
assert(sharedReportHtml.includes('QA 計算書'), 'shared section report runtime title', 'QA 計算書');
assert(sharedReportHtml.includes('計畫名稱</b>—'), 'shared section report runtime placeholder project fallback', '計畫名稱 —');
assert(sharedReportHtml.includes('SECTION-VERIFY-001'), 'shared section report runtime project number', 'SECTION-VERIFY-001');
assert(sharedReportHtml.includes('Codex QA'), 'shared section report runtime project designer', 'Codex QA');
assert(!sharedReportHtml.includes('未填'), 'shared section report runtime excludes raw placeholder project text', '未填');
for (const needle of pageOnlyReportStatusNeedles) {
  assert(!sharedReportHtml.includes(needle), 'shared section report runtime excludes page-only readiness wording', needle);
}

console.log('\nAll section tools contract checks passed.');
