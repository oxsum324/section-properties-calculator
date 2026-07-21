const fs = require('fs');
const path = require('path');

const ANCHOR_ROOT = __dirname;
const REPO_ROOT = path.resolve(ANCHOR_ROOT, '..');
const PACKAGE_ROOT = path.join(ANCHOR_ROOT, 'bolt-review-tool');

let failed = 0;

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function repoFile(relativePath) {
  return path.join(REPO_ROOT, ...relativePath.split('/'));
}

function packageFile(relativePath) {
  return path.join(PACKAGE_ROOT, ...relativePath.split('/'));
}

function assert(pass, label, detail = '') {
  if (!pass) {
    failed += 1;
    console.error(`FAIL | ${label} :: ${detail}`);
  } else {
    console.log(`PASS | ${label} | ${detail}`);
  }
}

function assertString(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, label, value);
}

function assertStringArray(value, label) {
  assert(Array.isArray(value) && value.length > 0, label, Array.isArray(value) ? `count=${value.length}` : typeof value);
  if (!Array.isArray(value)) return;
  value.forEach((item, index) => assertString(item, `${label}[${index}]`));
}

function sameArray(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
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

function arrayIncludesAll(items, required, label) {
  for (const item of required) {
    assert(items.includes(item), `${label} includes ${item}`, item);
  }
}

function findTrace(catalog, traceId) {
  for (const tool of catalog.tools || []) {
    const trace = (tool.traces || []).find(item => item.id === traceId);
    if (trace) return { tool, trace };
  }
  return null;
}

function evidenceExists(relativePath) {
  return fs.existsSync(packageFile(relativePath));
}

const catalogRelativePath = '螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json';
const contractRelativePath = '螺栓檢討/anchor-traceability.contract.test.js';
const reportContractRelativePath = '螺栓檢討/anchor-report.contract.test.js';
const vitestRelativePath = '螺栓檢討/bolt-review-tool/src/anchorTraceabilityCatalog.test.ts';
const catalogPath = repoFile(catalogRelativePath);
const catalogText = readText(catalogPath);
const catalog = JSON.parse(catalogText);
const packageJson = readJson(packageFile('package.json'));
const packageReadme = readText(packageFile('README.md'));
const vitestContract = readText(packageFile('src/anchorTraceabilityCatalog.test.ts'));
const calc = readText(packageFile('src/calc.ts'));
const defaults = readText(packageFile('src/defaults.ts'));
const reportDocument = readText(packageFile('src/ReportDocument.tsx'));
const seismicGuidance = readText(packageFile('src/seismicRouteGuidance.ts'));
const appCss = readText(packageFile('src/App.css'));
const appSource = readText(packageFile('src/App.tsx'));
const backupSource = readText(packageFile('src/backup.ts'));
const projectLibrarySource = readText(packageFile('src/useProjectLibrary.ts'));
const attachmentReadinessPanel = readText(packageFile('src/AttachmentReadinessPanel.tsx'));
const reportSettingsPanel = readText(packageFile('src/ReportSettingsPanel.tsx'));
const caseLibraryPanel = readText(packageFile('src/CaseLibraryPanel.tsx'));
const caseDocumentsPanel = readText(packageFile('src/CaseDocumentsPanel.tsx'));
const preflight = readText(repoFile('preflight-tools.ps1'));
const homeJs = readText(repoFile('結構工具箱/assets/home/home.js'));
const readme = readText(repoFile('README.md'));
const boundaries = readText(repoFile('TOOL_BOUNDARIES.md'));
const staging = readText(repoFile('STAGING_GROUPS.md'));
const reportGuide = readText(repoFile('TOOL_REPORT_GUIDE.md'));
const syncAnchor = readText(repoFile('sync-anchor-deployment.ps1'));
const reportContract = readText(repoFile(reportContractRelativePath));

const expectedTools = [
  'anchor-strength',
  'anchor-product-evaluation',
  'anchor-seismic',
  'base-plate-bearing',
  'anchor-reinforcement',
];

assert(catalog.version === '0.1.0', 'anchor traceability catalog version', catalog.version);
assert(catalog.family === 'anchor-traceability', 'anchor traceability catalog family', catalog.family);
assertString(catalog.description, 'anchor traceability catalog description');
assert(Array.isArray(catalog.tools), 'anchor traceability catalog tools array', `count=${catalog.tools?.length || 0}`);
assert(sameArray((catalog.tools || []).map(tool => tool.key), expectedTools), 'anchor traceability catalog tool order', JSON.stringify((catalog.tools || []).map(tool => tool.key)));

const seenToolKeys = new Set();
const seenTraceIds = new Set();
let traceCount = 0;
let manualReviewCount = 0;

for (const tool of catalog.tools || []) {
  assertString(tool.key, `${tool.key || 'tool'} key`);
  assert(!seenToolKeys.has(tool.key), `${tool.key} unique key`, tool.key);
  seenToolKeys.add(tool.key);
  assertString(tool.label, `${tool.key} label`);
  assertString(tool.scope, `${tool.key} scope`);
  assert(tool.status === 'covered', `${tool.key} status`, tool.status);
  assert(Array.isArray(tool.traces) && tool.traces.length >= 2, `${tool.key} trace count`, `count=${tool.traces?.length || 0}`);

  for (const [index, trace] of (tool.traces || []).entries()) {
    traceCount += 1;
    assertString(trace.id, `${tool.key} trace ${index} id`);
    assert(!seenTraceIds.has(trace.id), `${trace.id} unique trace id`, trace.id);
    seenTraceIds.add(trace.id);
    assertString(trace.clause, `${trace.id} clause`);
    assert(/規範|ACI|AISC|ETA|ICC-ES|章|節/.test(trace.clause), `${trace.id} names formal source`, trace.clause);
    assertString(trace.purpose, `${trace.id} purpose`);
    for (const field of ['inputs', 'calculation', 'report', 'evidence', 'manualReview']) {
      assertStringArray(trace[field], `${trace.id} ${field}`);
    }
    manualReviewCount += Array.isArray(trace.manualReview) ? trace.manualReview.length : 0;
    assert(
      trace.manualReview.some(item => /人工複核|設計者|施工圖|專案|模型|評估報告|外部分析|審查者/.test(item)),
      `${trace.id} manual review wording`,
      (trace.manualReview || []).join(' / ')
    );
    for (const evidence of trace.evidence || []) {
      assert(evidenceExists(evidence), `${trace.id} evidence exists`, evidence);
    }
  }
}

assert(traceCount >= 12, 'anchor traceability catalog trace volume', `traces=${traceCount}`);
assert(manualReviewCount >= 12, 'anchor traceability catalog manual review volume', `manualReview=${manualReviewCount}`);

[
  'anchor-strength-tension-modes',
  'anchor-strength-shear-modes',
  'anchor-strength-interaction-dimensions',
  'anchor-product-qualified-data',
  'anchor-product-evidence-links',
  'anchor-seismic-entry-and-amplification',
  'anchor-seismic-upgraded-routes',
  'base-plate-bearing-22-8-3',
  'base-plate-eccentric-uplift-boundary',
  'base-plate-bending-extension',
  'anchor-reinforcement-breakout-replacement',
  'anchor-reinforcement-visual-report-boundary',
].forEach(id => assert(seenTraceIds.has(id), `anchor catalog keeps high-risk trace ${id}`, id));

const productTrace = findTrace(catalog, 'anchor-product-qualified-data')?.trace;
assert(Boolean(productTrace), 'anchor product qualified-data trace exists', 'anchor-product-qualified-data');
if (productTrace) {
  arrayIncludesAll(productTrace.inputs, ['qualificationStandard', 'anchorCategory', 'minEdgeDistanceMm', 'minSpacingMm', 'minThicknessMm'], 'anchor product evaluation inputs');
  arrayIncludesAll(productTrace.calculation, ['product completeness', 'formal vs screening', 'product minimum dimensions'], 'anchor product evaluation calculations');
  arrayIncludesAll(productTrace.report, ['產品評估標準', '產品資料完整性', '正式規範判定'], 'anchor product evaluation report fields');
  assert(productTrace.clause.includes('ACI 355.2') && productTrace.clause.includes('ACI 355.4'), 'anchor product trace names post-installed qualification standards', productTrace.clause);
}

const seismicTrace = findTrace(catalog, 'anchor-seismic-upgraded-routes')?.trace;
assert(Boolean(seismicTrace), 'anchor upgraded seismic route trace exists', 'anchor-seismic-upgraded-routes');
if (seismicTrace) {
  arrayIncludesAll(seismicTrace.inputs, ['ductileStretchLengthMm', 'attachmentYieldTensionKn', 'attachmentOverstrengthFactor', 'overstrengthFactor', 'seismicQualified'], 'anchor seismic upgraded route inputs');
  arrayIncludesAll(seismicTrace.calculation, ['fu/fy >= 1.3', 'l_du >= 8da', 'Omega attachment', 'Omega o'], 'anchor seismic upgraded route calculations');
  assert(seismicTrace.clause.includes('17.10.5.3') && seismicTrace.clause.includes('17.10.6.3'), 'anchor seismic trace names upgraded route clauses', seismicTrace.clause);
}

const bearingTrace = findTrace(catalog, 'base-plate-bearing-22-8-3')?.trace;
assert(Boolean(bearingTrace), 'base plate bearing trace exists', 'base-plate-bearing-22-8-3');
if (bearingTrace) {
  arrayIncludesAll(bearingTrace.inputs, ['basePlateBearingEnabled', 'basePlateLoadedAreaMm2', 'basePlateSupportAreaMm2', 'basePlateConfinementMode'], 'base plate bearing inputs');
  arrayIncludesAll(bearingTrace.calculation, ['A1', 'A2', '0.85fcA1', 'sqrt(A2/A1)', 'phi = 0.65'], 'base plate bearing calculations');
  arrayIncludesAll(bearingTrace.report, ['基板下混凝土承壓', 'A1', 'A2', '支承圍束放大', '22.8.3.2'], 'base plate bearing report fields');
}

const reinforcementTrace = findTrace(catalog, 'anchor-reinforcement-breakout-replacement')?.trace;
assert(Boolean(reinforcementTrace), 'anchor reinforcement trace exists', 'anchor-reinforcement-breakout-replacement');
if (reinforcementTrace) {
  arrayIncludesAll(reinforcementTrace.inputs, ['anchorReinforcementEnabled', 'anchorReinforcementAreaMm2', 'anchorReinforcementWithinHalfCa1', 'anchorReinforcementIntersectsEachAnchor'], 'anchor reinforcement inputs');
  arrayIncludesAll(reinforcementTrace.calculation, ['phi As fy', 'formal checklist', 'tension breakout replacement', 'shear breakout replacement'], 'anchor reinforcement calculations');
  assert(reinforcementTrace.clause.includes('17.5.2.1(d)') && reinforcementTrace.clause.includes('17.7.2.5.1'), 'anchor reinforcement trace names breakout replacement clauses', reinforcementTrace.clause);
}

[
  "clause: '17.6.1'",
  "clause: '17.7.2'",
  "clause: '17.8'",
  "clause: '17.9'",
  "clause: '17.10'",
  "clause: '22.8.3'",
].forEach(needle => assert(defaults.includes(needle), `anchor defaults keep rule-profile clause ${needle}`, needle));

[
  "id: 'concrete-breakout-tension'",
  "id: 'concrete-breakout-shear'",
  "id: 'interaction'",
  "id: 'seismic'",
  "id: 'concrete-bearing'",
  'anchorReinforcementEnabled',
].forEach(needle => assert(calc.includes(needle), `anchor calc keeps ${needle}`, needle));

[
  '17.10.5.3(a)',
  '17.10.5.3(b)',
  '17.10.5.3(c)',
  '17.10.6.3',
].forEach(needle => assert(seismicGuidance.includes(needle), `anchor seismic guidance keeps ${needle}`, needle));

assert(reportDocument.includes('Taiwan RC Anchor Review Report'), 'anchor report document keeps formal report title', 'ReportDocument.tsx');
assert(packageJson.scripts?.verify === 'npm run typecheck && npm run lint && npm run test && npm run build:bundle', 'anchor package verify keeps full local gate', packageJson.scripts?.verify);
assert(vitestContract.includes("import catalog from './anchor-traceability.catalog.json'"), 'anchor vitest contract imports catalog', vitestRelativePath);
assert(vitestContract.includes('covers the high-risk clause routes surfaced by the source code'), 'anchor vitest contract keeps high-risk route coverage', vitestRelativePath);
assert(attachmentReadinessPanel.includes('頁面輔助') && attachmentReadinessPanel.includes('產報前檢查'), 'anchor attachment readiness stays page-only on the workspace tab', 'AttachmentReadinessPanel.tsx');
assert(reportSettingsPanel.includes('report-settings-panel') && reportSettingsPanel.includes('data-shows="report"'), 'anchor report settings stay on the page-only workspace tab', 'ReportSettingsPanel.tsx');
assert(appSource.includes('resource-back-bar'), 'anchor report workspace keeps a back-bar navigation section', 'resource-back-bar');
assert(appSource.includes('legacy-panel') && appSource.includes('data-shows="report"'), 'anchor report workspace keeps unit preview as a page-only panel', 'legacy-panel data-shows=\"report\"');
assert(caseLibraryPanel.includes('case-actions') && caseLibraryPanel.includes('case-library-toolbar'), 'anchor case library keeps page-only action rows', 'CaseLibraryPanel.tsx');
assert(caseDocumentsPanel.includes('document-upload-row') && caseDocumentsPanel.includes('document-preview-panel'), 'anchor case documents keep page-only upload and preview surfaces', 'CaseDocumentsPanel.tsx');
[
  'WORKSPACE_BACKUP_VERSION = 2',
  'buildWorkspaceCaseReplay',
  'verifyWorkspaceBackupReplay',
  'evaluateProjectBatch',
  '重新計算後指紋不符',
  'legacy-backup-v1-unverified',
].forEach(needle => assert(backupSource.includes(needle), 'anchor backup keeps verified calculation replay', needle));
assert(projectLibrarySource.includes('await verifyWorkspaceBackupReplay(parsed)'), 'anchor import verifies replay before workspace merge', 'verifyWorkspaceBackupReplay');
assert(projectLibrarySource.indexOf('await verifyWorkspaceBackupReplay(parsed)') < projectLibrarySource.indexOf('mergeWorkspaceBackup('), 'anchor import verifies replay before mutating merged workspace', 'verify before merge');
assert(projectLibrarySource.includes('已保留原工作區'), 'anchor import reports rollback boundary', '已保留原工作區');
assertPrintHidesSelectors(
  appCss,
  [
    '.attachment-readiness-panel',
    '.resource-back-bar',
    '.report-settings-panel',
    ".legacy-panel[data-shows~='report']",
    '.case-library-toolbar',
    '.case-actions',
    '.document-upload-row',
    '.document-preview-panel',
    '.document-preview-panel .action-row',
    '.document-card .action-row',
  ],
  'anchor report workspace page-only controls'
);

[
  'anchor-traceability-contract',
  'node 螺栓檢討/anchor-traceability.contract.test.js',
  'Anchor traceability catalog contract',
].forEach(needle => assert(preflight.includes(needle), 'platform preflight runs anchor traceability contract', needle));

[
  'anchor-report-contract',
  'node 螺栓檢討/anchor-report.contract.test.js',
  'Anchor report boundary contract',
].forEach(needle => assert(preflight.includes(needle), 'platform preflight runs anchor report contract', needle));

[
  'src/reportExport.test.ts',
  'src/reportDocx.test.ts',
  'src/reportWorkbook.test.ts',
  'src/attachmentReadiness.test.ts',
  'src/backup.test.ts',
  'tests/reportArtifacts.test.ts',
].forEach(needle => assert(reportContract.includes(needle), 'anchor report contract keeps targeted report suites', needle));

assert(homeJs.includes("'anchor-deployment': {"), 'home governance keeps anchor deployment source', 'anchor-deployment');
assert(homeJs.includes("label: 'Anchor deployment'"), 'home governance keeps anchor deployment label', 'Anchor deployment');
assert(
  homeJs.includes("preflightKeys: ['anchor-traceability-contract', 'anchor-route', 'anchor-report-contract']"),
  'home governance exposes anchor traceability before deploy route keys',
  'anchor-deployment'
);
assert(
  homeJs.includes("fullPreflightKeys: ['anchor-verify']"),
  'home governance keeps anchor verify full gate',
  'anchor-deployment'
);

[
  catalogRelativePath,
  vitestRelativePath,
  contractRelativePath,
  reportContractRelativePath,
].forEach(needle => {
  assert(readme.includes(needle), 'README documents anchor traceability governance', needle);
  assert(boundaries.includes(needle), 'TOOL_BOUNDARIES documents anchor traceability governance', needle);
  assert(staging.includes(needle), 'STAGING_GROUPS stages anchor traceability governance', needle);
});

assert(reportGuide.includes(contractRelativePath), 'TOOL_REPORT_GUIDE documents anchor traceability contract', contractRelativePath);
assert(packageReadme.includes(contractRelativePath), 'anchor README points to platform traceability contract', contractRelativePath);
assert(packageReadme.includes(reportContractRelativePath), 'anchor README points to platform report contract', reportContractRelativePath);
assert(syncAnchor.includes('sourceFingerprint') && syncAnchor.includes('ANCHOR_BASE_PATH'), 'anchor sync script preserves deployment fingerprint workflow', 'sync-anchor-deployment.ps1');

if (failed) {
  console.error(`\n${failed} anchor traceability contract checks failed.`);
  process.exit(1);
}

console.log('\nAll anchor traceability contract checks passed.');
