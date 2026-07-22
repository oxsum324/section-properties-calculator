const fs = require('fs');
const path = require('path');
const vm = require('vm');
const calculationBookContentBoundary = require('./結構工具箱/tools/calculation-book-content-boundary.json');

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
    const helperMatch = body.match(/const\s+project\s*=\s*([A-Za-z_$][\w$]*)\(\)\s*;/);
    const projectBody = helperMatch ? functionSource(source, helperMatch[1]) : body;
    assert(/name:\s*getProjectFieldValue\('projName'\)/.test(projectBody), `${label} ${functionName} normalizes project name before report export`, projectBody);
    assert(/no:\s*getProjectFieldValue\('projNo'\)/.test(projectBody), `${label} ${functionName} normalizes project number before report export`, projectBody);
    assert(/designer:\s*getProjectFieldValue\('projDesigner'\)/.test(projectBody), `${label} ${functionName} normalizes designer before report export`, projectBody);
    if (helperMatch) {
      assert(/\bproject\s*,/.test(body), `${label} ${functionName} passes normalized project metadata to the report`, body);
    }
    const normalizationSource = `${body}\n${projectBody}`;
    assert(!/document\.getElementById\('projName'\)\.value\s*\|\|\s*''/.test(normalizationSource), `${label} ${functionName} no longer exports raw project name`, normalizationSource);
    assert(!/document\.getElementById\('projDesigner'\)\.value\s*\|\|\s*''/.test(normalizationSource), `${label} ${functionName} no longer exports raw designer`, normalizationSource);
  }
}

function renderSharedReportHtml(source, filename, project = {}) {
  return renderSharedReportPayload(source, filename, {
    title: 'QA 計算書',
    subtitle: 'Report Runtime Smoke',
    project,
    inputs: [{
      group: '輸入資料',
      items: [
        { label: 'A', value: '1', unit: '' },
        { label: 'B', value: '2', unit: 'tf' },
        { label: 'C', value: '3', unit: 'cm²' },
      ],
    }],
    checks: [{
      group: '檢核結果',
      items: [
        { label: 'A', formula: 'A', sub: '1', value: '1', unit: '', ok: true },
        { label: 'B', formula: 'B / A', sub: '2 / 1', value: '2.00', unit: '', ok: true, note: '控制檢核' },
        { label: 'C', formula: 'A + B', sub: '1 + 2', value: '3.00', unit: 'cm²', ok: true, note: '文字抽檢樣本' },
      ],
    }],
    summaryFacts: [{ label: '控制值', value: 'B / A', tone: 'ok' }],
    summary: { ok: true, text: 'OK' },
    notes: ['正式報告備註', '本樣本用於確認共享報告輸出包含足量可讀文字。'],
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

function assessSharedFormalAttachment(source, filename, state) {
  const context = { window: {}, document: { title: 'QA' }, console, Date };
  vm.createContext(context);
  vm.runInContext(source, context, { filename });
  return context.window.ToolReportUI.assessFormalAttachment(state);
}

function reportHtmlText(reportHtml) {
  return String(reportHtml || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function assertReportHtmlText(reportHtml, label, requiredNeedles, minLength = 260) {
  const text = reportHtmlText(reportHtml);
  assert(text.length >= minLength, `${label} visible report text is substantial`, `chars=${text.length}`);
  requiredNeedles.forEach(needle => {
    assert(text.includes(needle), `${label} visible report text includes required wording`, needle);
  });
  pageOnlyReportStatusNeedles.forEach(needle => {
    assert(!text.includes(needle), `${label} visible report text excludes page-only readiness wording`, needle);
  });
  return text;
}

function captureCompositeReportPayload(source) {
  let payload = null;
  const elements = new Map([
    ['projName', { value: '未填' }],
    ['projNo', { value: 'COMP-QA-001' }],
    ['projDesigner', { value: 'Codex QA' }],
    ['projNote', { value: '' }],
    ['h-select', { value: '', selectedIndex: 0, options: [] }],
    ['h-H', { value: '300' }],
    ['h-B', { value: '150' }],
    ['h-tw', { value: '6.5' }],
    ['h-tf', { value: '9' }],
    ['h-R', { value: '13' }],
    ['secCanvas', { toDataURL() { return 'data:image/png;base64,composite'; } }],
    ['reportStatus', { textContent: '', className: '' }],
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
    setReportStatus(message, tone = 'warn') {
      const el = elements.get('reportStatus');
      if (!el) return;
      el.textContent = message || '';
      el.className = `report-status${message ? ` ${tone}` : ''}`;
    },
    lastData: {
      geom: {
        mode: 'both',
        Hmm: 300,
        Bmm: 150,
        tw: 6.5,
        tf: 9,
        R: 13,
        tspMm: 9,
        hspMm: 260,
        tcpMm: 12,
        wcpMm: 180,
      },
      baseH: {
        A: 46.8,
        Ix: 7200,
        Iy: 508,
        Zx: 540,
        Zy: 104,
        Jopen: 17.6,
        ymax: 15,
        xmax: 7.5,
      },
      total: {
        A: 92.4,
        W: 72.5,
        Ix: 18800,
        Iy: 2740,
        Sx: 1253,
        Sy: 365,
        Zx: 1450,
        Zy: 512,
        rx: 14.27,
        ry: 5.45,
        Jopen: 45.8,
        Jclosed: 8600,
        closedNote: '（測試樣本）',
      },
    },
    console,
    Date,
    Math,
    Number,
    String,
    JSON,
    parseFloat,
    isFinite,
  };
  vm.createContext(context);
  vm.runInContext(sharedReportSource, context, { filename: 'shared-report-runtime' });
  context.openReport = nextPayload => {
    payload = nextPayload;
  };
  ['val', 'fmt', 'normalizeProjectFieldValue', 'getProjectFieldValue', 'currentHName', 'exportReport'].forEach(name => {
    vm.runInContext(functionSource(source, name), context, { filename: `composite-report:${name}` });
  });
  assert(typeof context.exportReport === 'function', 'composite exportReport runtime function exists', 'exportReport');
  context.exportReport();
  assert(payload && typeof payload === 'object', 'composite runtime captures report payload', 'exportReport payload');
  return payload;
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
      RCUI: {
        assessFormalAttachment(state = {}) {
          const failedItems = Array.isArray(state.failedItems) ? state.failedItems.filter(Boolean) : [];
          const reviewItems = Array.isArray(state.reviewItems) ? state.reviewItems.filter(Boolean) : [];
          const project = state.project || {};
          const missingMetadata = ['name', 'no', 'designer'].filter(key => !String(project[key] || '').trim());
          const status = failedItems.length ? 'blocked' : (reviewItems.length ? 'review' : 'ready');
          return {
            status,
            documentClass: { key: 'internal-review', label: '內部審閱' },
            documentState: {
              kind: 'internal-review',
              reason: status,
              label: '內部審閱',
              detail: '本計算內容尚未勾選核可；仍可列印供內部審閱。',
            },
            metadata: { missingItems: missingMetadata },
          };
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
  [
    'fmt',
    'normalizeProjectFieldValue',
    'getProjectFieldValue',
    'getRetrofitProjectInfo',
    functionName === 'exportBeamReport' ? 'assessBeamRetrofitAttachmentReadiness' : 'assessColumnRetrofitAttachmentReadiness',
    functionName,
  ].forEach(name => {
    vm.runInContext(functionSource(source, name), context, { filename: `${functionName}:${name}` });
  });
  assert(typeof context[functionName] === 'function', `${functionName} runtime function exists`, functionName);
  context[functionName]();
  assert(statuses.length === 0, `${functionName} runtime skips fallback status`, JSON.stringify(statuses));
  assert(payload && typeof payload === 'object', `${functionName} runtime captures report payload`, functionName);
  return payload;
}

const pageOnlyReportStatusNeedles = [...new Set(
  Object.values(calculationBookContentBoundary.forbiddenCategories).flat(),
)];

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

const directPrintBoundarySource = read(path.join('結構工具箱', 'core', 'direct-print-boundary.css'));
for (const tool of [
  { label: 'section property picker', path: 'index.html' },
  { label: 'section property standalone', path: '斷面性質計算.html' },
  { label: 'composite section report', path: '合成斷面性質.html' },
]) {
  const html = read(tool.path);
  assert(html.includes('href="結構工具箱/core/direct-print-boundary.css"'), `${tool.label} loads shared direct-print boundary`, tool.path);
  assert(/<body class="formal-tool-output-page">[\s\S]*class="formal-direct-print-boundary"/.test(html), `${tool.label} exposes direct-print boundary`, tool.path);
  for (const needle of ['斷面工具主頁列印已封鎖', '此頁是操作介面，不是計算書', '本頁不得作為附件']) {
    assert(html.includes(needle), `${tool.label} explains blocked direct print`, needle);
  }
}
assert(directPrintBoundarySource.includes('body.formal-tool-output-page > :not(.formal-direct-print-boundary)'), 'shared CSS hides section work pages during direct print', 'formal work-page children hidden');
assert(directPrintBoundarySource.includes('body.formal-tool-output-page > .formal-direct-print-boundary'), 'shared CSS renders section direct-print notice', 'boundary notice rendered');

const compositeHtml = read('合成斷面性質.html');
assertReportPayloadExcludes(compositeHtml, 'exportReport', pageOnlyReportStatusNeedles);
assertProjectMetaUsesSharedNormalization(compositeHtml, 'composite section report', ['exportReport']);

const rcRetrofitHtml = read('RC補強斷面性質.html');
assertReportPayloadExcludes(rcRetrofitHtml, 'exportBeamReport', pageOnlyReportStatusNeedles);
assertReportPayloadExcludes(rcRetrofitHtml, 'exportColReport', pageOnlyReportStatusNeedles);
assertProjectMetaUsesSharedNormalization(rcRetrofitHtml, 'RC retrofit section reports', ['exportBeamReport', 'exportColReport']);

const sharedReportSource = read(path.join('結構工具箱', 'core', 'ui', 'report.js'));
const rcReportSource = read(path.join('鋼筋混凝土', 'shared', 'report.js'));
const sharedReportFilename = path.join(__dirname, '結構工具箱', 'core', 'ui', 'report.js');
const missingMetadataState = assessSharedFormalAttachment(sharedReportSource, sharedReportFilename, {
  project: { name: '', no: 'QA-001', designer: '' },
  calculated: true,
});
assert(missingMetadataState.status === 'ready', 'shared attachment assessment treats blank metadata as inherited', JSON.stringify(missingMetadataState));
assert(missingMetadataState.documentState?.label === '內部審閱', 'shared attachment assessment defaults to internal review', JSON.stringify(missingMetadataState.documentState));
const failedState = assessSharedFormalAttachment(sharedReportSource, sharedReportFilename, {
  project: { name: 'QA', no: 'QA-001', designer: 'Codex QA' },
  calculated: true,
  failedItems: ['檢核不符'],
});
assert(failedState.status === 'blocked', 'shared attachment assessment blocks failed checks', JSON.stringify(failedState));
assert(failedState.documentState?.label === '內部審閱', 'shared attachment assessment keeps NG result printable without DRAFT', JSON.stringify(failedState.documentState));
const readyState = assessSharedFormalAttachment(sharedReportSource, sharedReportFilename, {
  project: { name: 'QA', no: 'QA-001', designer: 'Codex QA' },
  calculated: true,
});
assert(readyState.status === 'ready' && readyState.documentState?.kind === 'internal-review', 'shared attachment assessment awaits explicit approval', JSON.stringify(readyState));
assert(readyState.documentClass?.label === '內部審閱', 'shared attachment assessment exposes internal-review class', JSON.stringify(readyState.documentClass));
const approvedState = assessSharedFormalAttachment(sharedReportSource, sharedReportFilename, {
  project: {}, calculated: true, approved: true,
});
assert(approvedState.documentState === null && approvedState.documentClass?.label === '正式附件', 'shared attachment approval promotes report without project metadata', JSON.stringify(approvedState));
const compositePayload = captureCompositeReportPayload(compositeHtml);
assert(compositePayload.documentState?.label === '內部審閱', 'composite payload treats incomplete metadata as internal review', JSON.stringify(compositePayload.documentState));
const compositeReportHtml = renderSharedReportPayload(
  sharedReportSource,
  path.join(__dirname, '結構工具箱', 'core', 'ui', 'report.js'),
  compositePayload
);
const compositeReportText = assertReportHtmlText(compositeReportHtml, 'composite section runtime report', [
  '合成斷面性質計算書',
  '計畫編號',
  'COMP-QA-001',
  '設計人員',
  'Codex QA',
  '基本輸入',
  '合成斷面總性質',
  '與基礎 H 型鋼比較',
], 520);
assert(!compositeReportHtml.includes('未填'), 'composite runtime report excludes raw placeholder project text', '未填');
assert(compositeReportHtml.includes('repAttachmentApproval'), 'composite runtime report renders approval control', 'repAttachmentApproval');
assert(compositeReportHtml.includes('文件狀態：內部審閱'), 'composite runtime report initializes printable internal-review status', '文件狀態：內部審閱');
assert(!compositeReportText.includes('計畫名稱'), 'composite runtime report omits blank project-name row', compositeReportText);
assert(!compositeReportText.includes('未填'), 'composite runtime visible text excludes raw placeholder project text', '未填');

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
  rcReportSource,
  path.join(__dirname, '鋼筋混凝土', 'shared', 'report.js'),
  retrofitBeamPayload
);
const retrofitBeamText = assertReportHtmlText(retrofitBeamHtml, 'RC retrofit beam runtime report', [
  'RC 梁補強斷面計算書',
  '計畫編號',
  'RETROFIT-QA-001',
  '設計人員',
  'Codex QA',
  '輸入條件',
  '彈性斷面',
  '撓曲強度結果',
  '計算過程明細',
  '補強後 φMn',
], 650);
assert(retrofitBeamHtml.includes('RC 梁補強斷面計算書'), 'RC retrofit beam runtime report title', 'RC 梁補強斷面計算書');
assert(!retrofitBeamText.includes('計畫名稱'), 'RC retrofit beam omits blank project-name row', retrofitBeamText);
assert(retrofitBeamHtml.includes('RETROFIT-QA-001'), 'RC retrofit beam runtime project number', 'RETROFIT-QA-001');
assert(retrofitBeamHtml.includes('Codex QA'), 'RC retrofit beam runtime project designer', 'Codex QA');
assert(retrofitBeamHtml.includes('repAttachmentApproval'), 'RC retrofit beam runtime includes approval control', 'repAttachmentApproval');
assert(!retrofitBeamHtml.includes('未填'), 'RC retrofit beam runtime excludes raw placeholder project text', '未填');
assert(!retrofitBeamText.includes('未填'), 'RC retrofit beam visible text excludes raw placeholder project text', '未填');
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
  rcReportSource,
  path.join(__dirname, '鋼筋混凝土', 'shared', 'report.js'),
  retrofitColumnPayload
);
const retrofitColumnText = assertReportHtmlText(retrofitColumnHtml, 'RC retrofit column runtime report', [
  'RC 柱補強斷面計算書',
  '計畫編號',
  'RETROFIT-QA-001',
  '設計人員',
  'Codex QA',
  '輸入條件',
  '圍束效應',
  '軸壓能力',
  'P-M 需求點檢核',
], 650);
assert(retrofitColumnHtml.includes('RC 柱補強斷面計算書'), 'RC retrofit column runtime report title', 'RC 柱補強斷面計算書');
assert(!retrofitColumnText.includes('計畫名稱'), 'RC retrofit column omits blank project-name row', retrofitColumnText);
assert(retrofitColumnHtml.includes('RETROFIT-QA-001'), 'RC retrofit column runtime project number', 'RETROFIT-QA-001');
assert(retrofitColumnHtml.includes('Codex QA'), 'RC retrofit column runtime project designer', 'Codex QA');
assert(retrofitColumnHtml.includes('repAttachmentApproval'), 'RC retrofit column runtime includes approval control', 'repAttachmentApproval');
assert(!retrofitColumnHtml.includes('未填'), 'RC retrofit column runtime excludes raw placeholder project text', '未填');
assert(!retrofitColumnText.includes('未填'), 'RC retrofit column visible text excludes raw placeholder project text', '未填');
for (const needle of pageOnlyReportStatusNeedles) {
  assert(!retrofitColumnHtml.includes(needle), 'RC retrofit column runtime report excludes page-only readiness wording', needle);
}

const sharedReportHtml = renderSharedReportHtml(
  sharedReportSource,
  path.join(__dirname, '結構工具箱', 'core', 'ui', 'report.js'),
  { name: '未填', no: 'SECTION-VERIFY-001', designer: 'Codex QA' }
);
const sharedReportText = assertReportHtmlText(sharedReportHtml, 'shared section report runtime', [
  'QA 計算書',
  '計畫編號',
  'SECTION-VERIFY-001',
  '設計人員',
  'Codex QA',
  '輸入資料',
  '檢核結果',
], 260);
assert(sharedReportHtml.includes('QA 計算書'), 'shared section report runtime title', 'QA 計算書');
assert(!sharedReportText.includes('計畫名稱'), 'shared section report runtime omits blank project-name row', sharedReportText);
assert(sharedReportHtml.includes('SECTION-VERIFY-001'), 'shared section report runtime project number', 'SECTION-VERIFY-001');
assert(sharedReportHtml.includes('Codex QA'), 'shared section report runtime project designer', 'Codex QA');
assert(sharedReportHtml.includes('data-initial-approved="false"'), 'shared renderer defaults to printable internal review', 'data-initial-approved="false"');
assert(!sharedReportHtml.includes('未填'), 'shared section report runtime excludes raw placeholder project text', '未填');
assert(!sharedReportText.includes('未填'), 'shared section report visible text excludes raw placeholder project text', '未填');
assert(!sharedReportText.includes('正式報告備註'), 'shared section report keeps explanatory notes out of the calculation book', '正式報告備註');
for (const needle of pageOnlyReportStatusNeedles) {
  assert(!sharedReportHtml.includes(needle), 'shared section report runtime excludes page-only readiness wording', needle);
}

const readySharedReportHtml = renderSharedReportHtml(
  sharedReportSource,
  sharedReportFilename,
  { name: 'QA Project', no: 'SECTION-READY-001', designer: 'Codex QA' }
);
assert(!readySharedReportHtml.includes('DRAFT／非正式附件'), 'shared renderer no longer emits DRAFT classification', 'clean attachment output');
assert(readySharedReportHtml.includes('data-initial-approved="false"'), 'shared renderer requires explicit approval even when calculation is ready', 'data-initial-approved="false"');
assert(readySharedReportHtml.includes('本計算內容已完成審閱，核可作為正式附件'), 'shared renderer provides approval checkbox wording', 'approval control');
const readyRcReportHtml = renderSharedReportHtml(
  rcReportSource,
  path.join(__dirname, '鋼筋混凝土', 'shared', 'report.js'),
  { name: 'RC QA Project', no: 'RC-READY-001', designer: 'Codex QA' }
);
assert(readyRcReportHtml.includes('data-initial-approved="false"'), 'RC shared renderer defaults to internal review', 'data-initial-approved="false"');
assert(readyRcReportHtml.includes('本計算內容已完成審閱，核可作為正式附件'), 'RC shared renderer provides approval checkbox wording', 'approval control');
assert(!readyRcReportHtml.includes('DRAFT／非正式附件'), 'RC shared renderer no longer emits DRAFT classification', 'clean attachment output');
const approvedSharedReportHtml = renderSharedReportPayload(sharedReportSource, sharedReportFilename, {
  title: 'QA 核可計算書', project: {}, documentApproval: { approved: true, approvedAt: '2026/07/21 12:00:00' },
  summary: { ok: false, text: '檢核結果不符但已確認內容' },
});
assert(approvedSharedReportHtml.includes('data-initial-approved="true"'), 'approved shared report binds formal state to generated snapshot', 'data-initial-approved="true"');
assert(approvedSharedReportHtml.includes('data-approved-at="2026/07/21 12:00:00"'), 'approved shared report preserves approval time', 'approval timestamp');
const failedSharedReportHtml = renderSharedReportPayload(sharedReportSource, sharedReportFilename, {
  title: 'QA NG 計算書',
  project: { name: 'QA Project', no: 'SECTION-NG-001', designer: 'Codex QA' },
  summary: { ok: false, text: '檢核不符' },
  checks: [{ group: '檢核結果', items: [{ label: '強度比', value: '1.20', ok: false }] }],
});
assert(failedSharedReportHtml.includes('data-initial-approved="false"'), 'shared renderer keeps NG result printable as internal review', 'data-initial-approved="false"');
assert(!failedSharedReportHtml.includes('DRAFT／非正式附件'), 'shared renderer does not turn an NG engineering result into a DRAFT document', 'clean NG attachment');

console.log('\nAll section tools contract checks passed.');
