const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const auditPath = path.join(ROOT, 'audit-tool.ps1');
const indexPath = path.join(ROOT, 'index.html');
const readmePath = path.join(ROOT, 'README.md');
const testBeamPath = path.join(ROOT, 'tools', 'test-beam.ps1');
const testColumnPath = path.join(ROOT, 'tools', 'test-column.ps1');
const testSlabPath = path.join(ROOT, 'tools', 'test-slab.ps1');
const testWallPath = path.join(ROOT, 'tools', 'test-wall.ps1');
const testFoundationPath = path.join(ROOT, 'tools', 'test-foundation.ps1');
const testSinglePilePath = path.join(ROOT, 'tools', 'test-single-pile.ps1');
const testRetrofitPath = path.join(ROOT, 'tools', 'test-retrofit-report.ps1');
const testRcIndexPath = path.join(ROOT, 'tools', 'test-rc-index-menu.ps1');
const rcIndexBrowserPath = path.join(ROOT, 'tools', 'rc-index-menu-browser-smoke.test.js');
const testShearWallReportPath = path.join(ROOT, 'tools', 'test-shear-wall-report.ps1');
const ensurePlaywrightDepsPath = path.join(ROOT, 'tools', 'ensure-playwright-deps.ps1');
const sharedReportPath = path.join(ROOT, 'shared', 'report.js');
const directPrintBoundaryPath = path.join(ROOT, 'shared', 'direct-print-boundary.css');
const localQuickDirectPrintBoundaryPath = path.resolve(ROOT, '..', '結構工具箱', 'core', 'direct-print-boundary.css');
const rcTraceCatalogPath = path.join(ROOT, 'tools', 'rc-traceability.catalog.json');
const rcStmIndependentGatePath = path.join(ROOT, 'tools', 'rc-stm-independent-engineering-gate.test.js');

let failed = 0;
function assert(pass, label, detail = '') {
  if (!pass) {
    failed++;
    console.error(`FAIL | ${label} :: ${detail}`);
  } else {
    console.log(`PASS | ${label} | ${detail}`);
  }
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    failed++;
    console.error(`FAIL | ${label} :: missing ${needle}`);
  } else {
    console.log(`PASS | ${label} | ${needle}`);
  }
}

function parseAuditModules(source) {
  const match = source.match(/modules\s*=\s*@\(([^)]*)\)/);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function parseIndexLabels(source) {
  const match = source.match(/const MODULE_LABELS\s*=\s*\{([\s\S]*?)\};/);
  if (!match) return new Map();
  return new Map([...match[1].matchAll(/['"]?([a-z-]+)['"]?\s*:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
}

function parseStatusSource(source) {
  const match = source.match(/const source\s*=\s*\{([\s\S]*?)\};/);
  if (!match) return {};
  return Object.fromEntries(
    [...match[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(['"])(.*?)\2/g)]
      .map((property) => [property[1], property[3]])
  );
}

function parseMenuCards(source) {
  const cards = [];
  const pattern = /<a class="menu-card" href="([^"]+)">([\s\S]*?)<\/a>/g;
  for (const match of source.matchAll(pattern)) {
    const h3 = (match[2].match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || '';
    cards.push({
      href: match[1],
      title: h3.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
  }
  return cards;
}

function localHtmlTarget(fromDir, href) {
  if (!href || /^(?:https?:|mailto:|data:|#)/i.test(href)) return null;
  return path.resolve(fromDir, href.split('#')[0].split('?')[0]);
}

function parseLocalResources(source, fromDir) {
  const resources = [];
  for (const match of source.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/gi)) {
    const target = localHtmlTarget(fromDir, match[1]);
    if (target) resources.push({ kind: 'stylesheet', href: match[1], target });
  }
  for (const match of source.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) {
    const target = localHtmlTarget(fromDir, match[1]);
    if (target) resources.push({ kind: 'script', href: match[1], target });
  }
  return resources;
}

function sameArray(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function assertString(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, label, value);
}

function assertStringArray(value, label) {
  assert(Array.isArray(value) && value.length > 0, label, Array.isArray(value) ? `count=${value.length}` : typeof value);
  if (!Array.isArray(value)) return;
  value.forEach((item, index) => assertString(item, `${label}[${index}]`));
}

function validateRcTraceabilityCatalog(catalog, sourceText) {
  assert(catalog.version === '0.1.0', 'RC traceability catalog version', catalog.version);
  assert(catalog.family === 'rc-traceability', 'RC traceability catalog family', catalog.family);
  assertString(catalog.description, 'RC traceability catalog description');
  assert(!sourceText.includes('18.10'), 'RC traceability catalog has no stale 18.10 references', 'uses current RC clause refs');

  const tools = Array.isArray(catalog.tools) ? catalog.tools : [];
  assert(sameArray(tools.map(tool => tool.key), expectedModules), 'RC traceability catalog tool order', JSON.stringify(tools.map(tool => tool.key)));

  for (const tool of tools) {
    assertString(tool.label, `${tool.key} traceability label`);
    assertString(tool.scope, `${tool.key} traceability scope`);
    assert(tool.status === 'covered', `${tool.key} traceability status`, tool.status);
    assert(Array.isArray(tool.traces) && tool.traces.length >= 3, `${tool.key} traceability trace count`, `count=${tool.traces?.length || 0}`);

    const seenTraceIds = new Set();
    for (const [index, trace] of tool.traces.entries()) {
      assertString(trace.id, `${tool.key} trace ${index} id`);
      assert(!seenTraceIds.has(trace.id), `${tool.key} trace id unique`, trace.id);
      seenTraceIds.add(trace.id);
      assertString(trace.clause, `${tool.key} trace ${trace.id} clause`);
      assert(/規範|章|節|式/.test(trace.clause), `${tool.key} trace ${trace.id} names formal source`, trace.clause);
      assertString(trace.purpose, `${tool.key} trace ${trace.id} purpose`);
      for (const field of ['inputs', 'calculation', 'report', 'evidence', 'manualReview']) {
        assertStringArray(trace[field], `${tool.key} trace ${trace.id} ${field}`);
      }
      assert(trace.manualReview.some(item => /人工複核|正式分析|施工圖|設計者|專案|模型|圖說/.test(item)), `${tool.key} trace ${trace.id} manual review wording`, trace.manualReview.join(' / '));
      for (const evidence of trace.evidence) {
        const evidencePath = path.join(ROOT, ...evidence.split('/'));
        assert(fs.existsSync(evidencePath), `${tool.key} trace ${trace.id} evidence exists`, evidence);
      }
    }
  }
}

const audit = fs.readFileSync(auditPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');
const readme = fs.readFileSync(readmePath, 'utf8');
const testBeam = fs.readFileSync(testBeamPath, 'utf8');
const testColumn = fs.readFileSync(testColumnPath, 'utf8');
const testSlab = fs.readFileSync(testSlabPath, 'utf8');
const testWall = fs.readFileSync(testWallPath, 'utf8');
const testFoundation = fs.readFileSync(testFoundationPath, 'utf8');
const testSinglePile = fs.readFileSync(testSinglePilePath, 'utf8');
const testRetrofit = fs.readFileSync(testRetrofitPath, 'utf8');
const testRcIndex = fs.readFileSync(testRcIndexPath, 'utf8');
const rcIndexBrowser = fs.readFileSync(rcIndexBrowserPath, 'utf8');
const testShearWallReport = fs.readFileSync(testShearWallReportPath, 'utf8');
const ensurePlaywrightDeps = fs.readFileSync(ensurePlaywrightDepsPath, 'utf8');
const sharedReport = fs.readFileSync(sharedReportPath, 'utf8');
const directPrintBoundary = fs.readFileSync(directPrintBoundaryPath, 'utf8');
const rcTraceCatalogText = fs.readFileSync(rcTraceCatalogPath, 'utf8');
const rcTraceCatalog = JSON.parse(rcTraceCatalogText);
const rcStmIndependentGate = fs.readFileSync(rcStmIndependentGatePath, 'utf8');

const expectedModules = ['beam', 'column', 'slab', 'wall', 'shear-wall', 'foundation', 'single-pile'];
const expectedLabels = ['梁', '柱', '板', '牆', '剪力牆', '基礎', '單樁'];
const expectedHrefs = [
  'tools/beam.html',
  'tools/column.html',
  'tools/slab.html',
  'tools/wall.html',
  'tools/shear-wall.html',
  'tools/foundation.html',
  'tools/single-pile-designer.html',
];
const columnCoverDeviationHref = '../結構工具箱/tools/rc/column-cover-deviation.html';
const expectedAuxiliaryCards = [
  { href: 'tools/deep-beam-stm.html', title: '深梁 STM' },
  { href: 'tools/foundation-deep-beam-stm.html', title: '基礎深梁 STM' },
  { href: 'tools/pile-cap-3d-stm.html', title: '樁帽三維 STM' },
  { href: '../RC補強斷面性質.html', title: 'RC 補強斷面' },
  { href: columnCoverDeviationHref, title: '柱保護層偏差強度評估' },
];
const auditModules = parseAuditModules(audit);
const indexLabels = parseIndexLabels(index);
const menuCards = parseMenuCards(index);
const statusSource = parseStatusSource(index);
const fallbackText = expectedLabels.join('、');
const requiredQaArtifacts = [
  'tools/audit-status.contract.test.js',
  'tools/rc-traceability.contract.test.js',
  'tools/rc-project-fingerprint.contract.test.js',
  'tools/rc-index-menu-browser-smoke.test.js',
  'tools/test-rc-index-menu.ps1',
  'shared/direct-print-boundary.css',
  'tools/beam-regression.test.js',
  'tools/beam-regression-cases.json',
  'tools/beam-report-visual.test.js',
  'tools/beam-report-visual.contract.test.js',
  'tools/test-beam.ps1',
  'tools/ensure-playwright-deps.ps1',
  'tools/column-regression.test.js',
  'tools/column-regression-cases.json',
  'tools/column-report-visual.test.js',
  'tools/column-report-visual.contract.test.js',
  'tools/test-column.ps1',
  'tools/slab-regression.test.js',
  'tools/slab-regression-cases.json',
  'tools/slab-report-visual.test.js',
  'tools/slab-report-visual.contract.test.js',
  'tools/test-slab.ps1',
  'tools/wall-report-visual.test.js',
  'tools/wall-report-visual.contract.test.js',
  'tools/test-wall.ps1',
  'tools/rc-traceability.catalog.json',
  'tools/shear-wall-regression.test.js',
  'tools/shear-wall-report-visual.test.js',
  'tools/shear-wall-report-visual.contract.test.js',
  'tools/test-shear-wall.ps1',
  'tools/test-shear-wall-report.ps1',
  'tools/foundation-regression.test.js',
  'tools/foundation-regression-cases.json',
  'tools/foundation-report-visual.test.js',
  'tools/foundation-report-visual.contract.test.js',
  'tools/test-foundation.ps1',
  'tools/foundation-deep-beam-stm.html',
  'tools/foundation-deep-beam-stm-regression.test.js',
  'tools/test-foundation-deep-beam-stm.ps1',
  'shared/foundation-deep-beam-stm.js',
  'shared/foundation-deep-beam-stm.test.js',
  'tools/pile-cap-3d-stm.html',
  'tools/pile-cap-3d-stm-regression.test.js',
  'tools/pile-cap-3d-stm-bridge-regression.test.js',
  'tools/test-pile-cap-3d-stm.ps1',
  'shared/pile-cap-3d-stm.js',
  'shared/pile-cap-3d-stm.test.js',
  'shared/pile-cap-3d-stm-bridge.js',
  'shared/pile-cap-3d-stm-bridge.test.js',
  'shared/pile-cap-load-combinations.js',
  'shared/pile-cap-load-combinations.test.js',
  'shared/pile-cap-3d-stm-envelope.js',
  'shared/pile-cap-3d-stm-envelope.test.js',
  'shared/joint-reaction-load-adapter-fixtures.test.js',
  'shared/joint-reaction-fixture-sanitizer.js',
  'shared/joint-reaction-fixture-sanitizer.test.js',
  'shared/joint-reaction-fixture-promotion-gate.js',
  'shared/joint-reaction-fixture-promotion-gate.test.js',
  'shared/joint-reaction-observed-intake.js',
  'shared/joint-reaction-observed-intake.test.js',
  'shared/joint-reaction-observed-review.template.json',
  'shared/fixtures/joint-reactions/manifest.json',
  'shared/fixtures/joint-reactions/observed-manifest.json',
  'shared/retaining-base-demand.js',
  'shared/retaining-base-demand.test.js',
  'shared/pile-py-result-bridge.js',
  'shared/pile-py-result-bridge.test.js',
  'shared/pile-py-table-adapter.js',
  'shared/pile-py-table-adapter.test.js',
  'tools/single-pile-regression.test.js',
  'tools/single-pile-report-visual.test.js',
  'tools/single-pile-report-visual.contract.test.js',
  'tools/test-single-pile.ps1',
  'tools/retrofit-report-visual.test.js',
  'tools/retrofit-report-visual.contract.test.js',
  'tools/test-retrofit-report.ps1',
  'tools/report-portable-html-check.js',
  'shared/common.test.js',
  'shared/project-storage.js',
  'shared/project-storage.test.js',
  'shared/loadcases.test.js',
  'shared/wall-base.test.js',
  'shared/wall-evaluator.test.js',
  'shared/pmsection.test.js',
  'tools/rc-stm-independent-engineering-gate.test.js',
];
const browserSuiteScripts = [
  ['test-beam.ps1', testBeam, '.beam-testdeps'],
  ['test-column.ps1', testColumn, '.column-testdeps'],
  ['test-slab.ps1', testSlab, '.slab-testdeps'],
  ['test-wall.ps1', testWall, '.wall-testdeps'],
  ['test-foundation.ps1', testFoundation, '.foundation-testdeps'],
  ['test-single-pile.ps1', testSinglePile, '.single-pile-testdeps'],
  ['test-rc-index-menu.ps1', testRcIndex, '.rc-index-testdeps'],
  ['test-shear-wall-report.ps1', testShearWallReport, '.shear-wall-report-testdeps'],
  ['test-retrofit-report.ps1', testRetrofit, '.beam-testdeps'],
];
const localDependencyDirs = [
  'tools/.beam-testdeps/',
  'tools/.column-testdeps/',
  'tools/.wall-testdeps/',
  'tools/.foundation-testdeps/',
  'tools/.slab-testdeps/',
  'tools/.single-pile-testdeps/',
  'tools/.rc-index-testdeps/',
  'tools/.shear-wall-report-testdeps/',
];

assert(sameArray(auditModules, expectedModules), 'audit status modules match RC tool modules', JSON.stringify(auditModules));
for (const [position, key] of expectedModules.entries()) {
  const label = expectedLabels[position];
  assert(indexLabels.get(key) === label, `index label maps ${key}`, indexLabels.get(key));
  assertIncludes(readme, label, `README mentions ${label}`);
  const card = menuCards.find((item) => item.href === expectedHrefs[position]);
  assert(card && card.href === expectedHrefs[position], `menu card href maps ${key}`, card ? card.href : 'missing');
  assert(card && card.title.includes(label), `menu card title mentions ${label}`, card ? card.title : 'missing');
}
assert(menuCards.length >= expectedModules.length, 'index menu exposes all audited modules', `cards=${menuCards.length}`);
const auditedHrefs = new Set(expectedHrefs);
const auxiliaryCards = menuCards.filter((card) => !auditedHrefs.has(card.href));
assert(
  sameArray(
    auxiliaryCards.map((card) => card.href).sort(),
    expectedAuxiliaryCards.map((card) => card.href).sort(),
  ),
  'index menu only has governed auxiliary RC entries',
  JSON.stringify(auxiliaryCards.map((card) => card.href)),
);
for (const expected of expectedAuxiliaryCards) {
  const card = auxiliaryCards.find((item) => item.href === expected.href);
  assert(card && card.title.includes(expected.title), `auxiliary card title maps ${expected.href}`, card ? card.title : 'missing');
}
assert(statusSource.kind === 'public', 'RC status source is the public release snapshot', statusSource.kind || 'missing');
assert(statusSource.url === '../結構工具箱/assets/status/platform-status.json', 'RC public page reads published platform status', statusSource.url || 'missing');
assert(statusSource.summaryUrl === '../結構工具箱/audit-dashboard.html', 'RC public status links to the platform dashboard', statusSource.summaryUrl || 'missing');
assert(!/^\.\/output\/audit\//.test(statusSource.url || ''), 'RC public page does not fetch private local audit detail', statusSource.url || 'missing');
assertIncludes(index, '平台公開巡檢狀態', 'RC public status is labeled as platform-wide');
assertIncludes(index, 'RC 詳細巡檢僅供本機工作環境讀取', 'RC public status explains local detail boundary');
for (const card of menuCards) {
  const target = localHtmlTarget(ROOT, card.href);
  assert(target && fs.existsSync(target), `menu card target exists: ${card.href}`, target || 'non-local');
  if (!target || !fs.existsSync(target)) continue;
  const html = fs.readFileSync(target, 'utf8');
  const pageDir = path.dirname(target);
  assert(html.includes('<link rel="icon" href="data:,">'), `menu target has data favicon: ${card.href}`, path.basename(target));
  const resources = parseLocalResources(html, pageDir);
  for (const resource of resources) {
    assert(fs.existsSync(resource.target), `${path.basename(target)} ${resource.kind} exists`, resource.href);
  }
  const printProfile = card.href === columnCoverDeviationHref
    ? {
        bodyClass: 'local-quick-output-page',
        boundaryClass: 'local-quick-direct-print-boundary',
        notice: '局部快算主頁列印已封鎖',
        stylesheetPath: localQuickDirectPrintBoundaryPath,
      }
    : {
        bodyClass: 'rc-formal-output-page',
        boundaryClass: 'rc-direct-print-boundary',
        notice: 'RC 工具主頁列印已封鎖',
        stylesheetPath: directPrintBoundaryPath,
      };
  const bodyClassPattern = new RegExp(`<body\\b[^>]*\\bclass="[^"]*\\b${printProfile.bodyClass}\\b`);
  assert(bodyClassPattern.test(html), `menu target blocks direct work-page print: ${card.href}`, path.basename(target));
  assert(html.includes(`class="${printProfile.boundaryClass}"`), `menu target has direct-print boundary: ${card.href}`, path.basename(target));
  assert(html.includes(printProfile.notice) && html.includes('本頁不得作為附件'), `menu target explains blocked direct print: ${card.href}`, path.basename(target));
  assert(resources.some(resource => path.resolve(resource.target) === path.resolve(printProfile.stylesheetPath)), `menu target loads shared direct-print boundary: ${card.href}`, path.basename(target));
}

for (const rel of requiredQaArtifacts) {
  const target = path.join(ROOT, rel);
  assert(fs.existsSync(target), `required QA artifact exists: ${rel}`, target);
  const checkIgnore = spawnSync('git', ['check-ignore', '-q', path.relative(path.resolve(ROOT, '..'), target)], {
    cwd: path.resolve(ROOT, '..'),
    stdio: 'ignore',
    shell: false,
  });
  assert(checkIgnore.status === 1, `required QA artifact is not git-ignored: ${rel}`, `status=${checkIgnore.status}`);
}
for (const [scriptName, source, preferredDir] of browserSuiteScripts) {
  assertIncludes(source, 'ensure-playwright-deps.ps1', `${scriptName} uses shared Playwright dependency helper`);
  assertIncludes(source, `-PreferredDirName '${preferredDir}'`, `${scriptName} declares preferred Playwright deps`);
  assert(!source.includes('$fallbackDeps = @('), `${scriptName} does not duplicate Playwright fallback list`);
}
assertIncludes(ensurePlaywrightDeps, '$dependencyDirNames = @(', 'Playwright helper owns fallback dependency list');
assert(ensurePlaywrightDeps.trimStart().startsWith('param('), 'Playwright helper keeps param block first');
assertIncludes(ensurePlaywrightDeps, 'Using Playwright deps:', 'Playwright helper reports selected dependency root');
assertIncludes(directPrintBoundary, 'body.rc-formal-output-page > :not(.rc-direct-print-boundary)', 'direct-print boundary hides every work-page child');
assertIncludes(directPrintBoundary, 'body.rc-formal-output-page > .rc-direct-print-boundary', 'direct-print boundary renders only the blocked-print notice');
assertIncludes(directPrintBoundary, 'content: none !important', 'direct-print boundary removes draft-report pseudo content');
assert(!directPrintBoundary.includes('content: "DRAFT"'), 'direct-print boundary does not emit a draft calculation-book watermark', 'shared/direct-print-boundary.css');
for (const rel of localDependencyDirs) {
  const dirName = rel.match(/tools\/([^/]+)\//)[1];
  assertIncludes(ensurePlaywrightDeps, `'${dirName}'`, `Playwright helper lists local dependency dir ${dirName}`);
}
for (const rel of localDependencyDirs) {
  const checkIgnore = spawnSync('git', ['check-ignore', '-q', path.join('鋼筋混凝土', rel).replace(/\\/g, '/')], {
    cwd: path.resolve(ROOT, '..'),
    stdio: 'ignore',
    shell: false,
  });
  assert(checkIgnore.status === 0, `local dependency dir is git-ignored: ${rel}`, `status=${checkIgnore.status}`);
}

assertIncludes(audit, 'Shear wall suite', 'audit runs shear wall suite');
assertIncludes(audit, 'Shared common helper unit tests', 'audit runs shared common helper unit tests');
assertIncludes(audit, 'Shared project storage unit tests', 'audit runs shared project storage unit tests');
assertIncludes(audit, 'Get-AvailableTcpPort', 'audit allocates isolated local ports for browser suites');
assertIncludes(audit, '[System.Net.Sockets.TcpListener]::new', 'audit asks the operating system for an available loopback port');
assert(!/RC_TEST_PORT='813[1-4]'/.test(audit), 'audit does not reuse fixed cross-worktree browser ports', 'dynamic ports');
assertIncludes(audit, 'Retaining base demand unit tests', 'audit runs retaining base demand unit tests');
assertIncludes(audit, 'RC traceability catalog contract', 'audit runs RC traceability catalog contract');
assertIncludes(audit, 'RC STM independent engineering benchmarks', 'audit runs the RC STM independent engineering benchmark gate');
assertIncludes(audit, '.\\rc-stm-independent-engineering-gate.test.js', 'audit runs the RC-scoped independent benchmark gate');
assertIncludes(audit, 'recordCount = $auditRecords.Count', 'audit status records the exact completed gate count');
assertIncludes(audit, 'TimeoutSeconds = 120', 'audit gives the RC STM independent benchmark a bounded timeout');
assert((audit.split('if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }').length - 1) >= 1, 'audit fails closed when the RC STM independent benchmark exits nonzero');
assertIncludes(audit, "node '.\\audit-status.contract.test.js'; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }", 'audit fails closed when the audit metadata contract exits nonzero');
const auditCommandLabels = [...audit.matchAll(/@\{\s*Label\s*=\s*"([^"]+)"/g)].map(match => match[1]);
assert(auditCommandLabels.length === 25, 'audit retains exactly twenty-five governed commands', JSON.stringify(auditCommandLabels));
assert(auditCommandLabels[6] === 'RC STM independent engineering benchmarks', 'STM independent benchmark gate runs after metadata contract and before browser suites', JSON.stringify(auditCommandLabels.slice(4, 9)));
assertIncludes(rcStmIndependentGate, 'independent-engineering-benchmarks.catalog.json', 'RC STM gate reads the shared private benchmark catalog');
assertIncludes(rcStmIndependentGate, 'independent-engineering-benchmarks.js', 'RC STM gate reuses the shared independent oracles and catalog validator');
assertIncludes(rcStmIndependentGate, 'independent-engineering-adapters', 'RC STM gate resolves the production adapter directory');
assertIncludes(rcStmIndependentGate, 'rc-stm-strength.js', 'RC STM gate loads only the RC STM production adapter');
assertIncludes(rcStmIndependentGate, "'rc-deep-beam-stm'", 'RC STM gate covers deep-beam STM');
assertIncludes(rcStmIndependentGate, "'rc-foundation-2d-stm'", 'RC STM gate covers foundation two-dimensional STM');
assertIncludes(rcStmIndependentGate, "'rc-pile-cap-3d-stm'", 'RC STM gate covers pile-cap three-dimensional STM');
assertIncludes(rcStmIndependentGate, 'EXPECTED_CASES = 24', 'RC STM gate fixes the candidate case count');
assertIncludes(rcStmIndependentGate, 'EXPECTED_PASS_CASES = 15', 'RC STM gate fixes the candidate pass count');
assertIncludes(rcStmIndependentGate, 'EXPECTED_REJECTION_CASES = 9', 'RC STM gate fixes the candidate rejection count');
assertIncludes(rcStmIndependentGate, 'EXPECTED_ASSERTIONS = 564', 'RC STM gate fixes the independent assertion count');
assertIncludes(rcStmIndependentGate, 'falseAcceptance=blocked', 'RC STM gate reports false-acceptance failure closure');
assertIncludes(rcStmIndependentGate, 'falseRejection=blocked', 'RC STM gate reports false-rejection failure closure');
assert(!rcStmIndependentGate.includes('steel-strength.js') && !rcStmIndependentGate.includes('wind-force.js'), 'RC STM gate does not load non-RC production adapters');
assertIncludes(audit, 'Beam report visual smoke contract', 'audit runs beam report visual smoke contract');
assertIncludes(audit, 'Slab report visual smoke contract', 'audit runs slab report visual smoke contract');
assertIncludes(audit, 'Wall report visual smoke contract', 'audit runs wall report visual smoke contract');
assertIncludes(audit, 'Shear wall report visual smoke contract', 'audit runs shear wall report visual smoke contract');
assertIncludes(audit, 'Shear wall report visual smoke', 'audit runs shear wall report visual smoke');
assertIncludes(audit, 'Foundation report visual smoke contract', 'audit runs foundation report visual smoke contract');
assertIncludes(audit, 'Single pile report visual smoke contract', 'audit runs single pile report visual smoke contract');
assertIncludes(audit, 'RC Retrofit report visual smoke contract', 'audit runs RC retrofit report visual smoke contract');
assertIncludes(audit, 'RC Retrofit report visual smoke', 'audit runs RC retrofit report visual smoke');
assertIncludes(audit, 'Beam regression and report visual smoke', 'audit runs beam regression and report visual smoke');
assertIncludes(audit, 'Foundation regression and report visual smoke', 'audit runs foundation regression and report visual smoke');
assertIncludes(audit, 'Column regression and report visual smoke', 'audit runs column regression and report visual smoke');
assertIncludes(audit, 'Wall regression and report visual smoke', 'audit runs wall regression and report visual smoke');
assertIncludes(audit, "-match 'net::ERR_NO_BUFFER_SPACE'", 'audit retries only the known browser buffer exhaustion signal');
assertIncludes(audit, '$transientRetryCount -lt 1', 'audit bounds browser buffer exhaustion retry to one attempt');
assertIncludes(audit, 'Start-Sleep -Seconds 60', 'audit cools down before the bounded browser retry');
assertIncludes(audit, '.transient-attempt-', 'audit preserves the first transient failure log');
assertIncludes(audit, 'Slab regression and report visual smoke', 'audit runs slab regression and report visual smoke');
assertIncludes(audit, 'Single pile regression and report visual smoke', 'audit runs single pile regression and report visual smoke');
assertIncludes(audit, 'RC index menu browser smoke', 'audit runs index menu browser smoke');
[
  'FORMAL_PRINT_KEYS',
  'rc-direct-print-block-${printKey}.pdf',
  'getClientRects().length',
  'direct print hides complete work page',
  'blocked-print PDF is one page',
  'readPdfTextWithPoppler',
  'RC 工具主頁列印已封鎖',
].forEach(needle => assertIncludes(rcIndexBrowser, needle, 'RC index smoke enforces direct-print block'));
assertIncludes(sharedReport, 'showRcReportIssue', 'shared report exposes inline popup-block status helper');
assertIncludes(sharedReport, 'repWindowStatus', 'shared report exposes inline report-window status helper');
assertIncludes(sharedReport, 'window.RCReportFingerprint', 'shared report exposes project calculation fingerprint API');
assertIncludes(audit, 'RC project/report calculation fingerprint contract', 'RC audit wires project/report calculation fingerprint contract');
assertIncludes(audit, 'Column regression and report visual smoke', 'RC audit keeps the column browser/PDF suite');
assertIncludes(audit, 'TimeoutSeconds = 600', 'RC audit gives the expanded column browser/PDF suite a dedicated ten-minute ceiling');
assertIncludes(audit, '-TimeoutSeconds $timeoutSeconds', 'RC audit forwards per-check timeout ceilings without widening every check');
assert(!sharedReport.includes('alert('), 'shared report uses inline status instead of blocking alerts');
validateRcTraceabilityCatalog(rcTraceCatalog, rcTraceCatalogText);
assertIncludes(testBeam, 'Beam report visual smoke', 'test-beam runs beam report visual smoke');
assertIncludes(testBeam, 'beam-report-visual.test.js', 'test-beam wires beam report visual script');
assertIncludes(testSlab, 'Slab report visual smoke', 'test-slab runs slab report visual smoke');
assertIncludes(testSlab, 'slab-report-visual.test.js', 'test-slab wires slab report visual script');
assertIncludes(testWall, 'Wall report visual smoke', 'test-wall runs wall report visual smoke');
assertIncludes(testWall, 'wall-report-visual.test.js', 'test-wall wires wall report visual script');
assertIncludes(testFoundation, 'Foundation report visual smoke', 'test-foundation runs foundation report visual smoke');
assertIncludes(testFoundation, 'Retaining wall base demand unit tests', 'test-foundation runs retaining base demand unit tests');
assertIncludes(testFoundation, 'Pile p-y result bridge unit tests', 'test-foundation runs pile p-y result bridge unit tests');
assertIncludes(testFoundation, 'Pile p-y table adapter unit tests', 'test-foundation runs pile p-y table adapter unit tests');
assertIncludes(testFoundation, 'Pile-cap 3D STM unit tests', 'test-foundation runs pile-cap 3D STM unit tests');
assertIncludes(testFoundation, 'Foundation to pile-cap 3D STM bridge unit tests', 'test-foundation runs pile-cap 3D STM bridge unit tests');
assertIncludes(testFoundation, 'Pile-cap LRFD load-component adapter unit tests', 'test-foundation runs pile-cap LRFD load-component adapter unit tests');
assertIncludes(testFoundation, 'Pile-cap 3D STM multi-load envelope unit tests', 'test-foundation runs pile-cap 3D STM envelope unit tests');
assertIncludes(testFoundation, 'joint reaction compatibility fixture tests', 'test-foundation runs Joint Reactions compatibility fixtures');
assertIncludes(testFoundation, 'fixture sanitizer privacy tests', 'test-foundation runs Joint Reactions fixture sanitizer privacy tests');
assertIncludes(testFoundation, 'observed fixture promotion gate tests', 'test-foundation runs Joint Reactions observed fixture promotion gate tests');
assertIncludes(testFoundation, 'observed intake workflow tests', 'test-foundation runs Joint Reactions observed intake workflow tests');
assertIncludes(testFoundation, 'pile-cap-3d-stm-regression.test.js', 'test-foundation wires pile-cap 3D STM browser and PDF regression');
assertIncludes(testFoundation, 'pile-cap-3d-stm-bridge-regression.test.js', 'test-foundation wires foundation to pile-cap 3D STM one-click bridge regression');
assertIncludes(testFoundation, 'foundation-report-visual.test.js', 'test-foundation wires foundation report visual script');
assertIncludes(testSinglePile, 'Single pile report visual smoke', 'test-single-pile runs single pile report visual smoke');
assertIncludes(testSinglePile, 'single-pile-report-visual.test.js', 'test-single-pile wires single pile report visual script');
assertIncludes(testRetrofit, 'retrofit-report-visual.test.js', 'test-retrofit-report wires RC retrofit visual script');
assertIncludes(index, 'moduleText(payload)', 'index renders module list from audit status metadata');
assertIncludes(index, fallbackText, 'index fallback matches expected module labels');
assertIncludes(readme, '`shared/common.js` helper 單元測試', 'README documents shared common helper unit tests');
assertIncludes(readme, 'RC 專案 JSON／計算書指紋一致性 contract', 'README documents project/report calculation fingerprint contract');
assertIncludes(readme, '剪力牆完整 suite', 'README documents shear wall suite');
assertIncludes(readme, '梁回歸測試與報告視覺 smoke', 'README documents beam suite label');
assertIncludes(readme, '柱回歸測試與報告視覺 smoke', 'README documents column suite label');
assertIncludes(readme, '板回歸測試與報告視覺 smoke', 'README documents slab suite label');
assertIncludes(readme, '牆回歸測試與報告視覺 smoke', 'README documents wall suite label');
assertIncludes(readme, 'RC 條文語意追蹤 catalog', 'README documents RC traceability catalog');
assertIncludes(readme, 'tools/rc-traceability.catalog.json', 'README documents RC traceability catalog path');
assertIncludes(readme, '基礎回歸測試與報告視覺 smoke', 'README documents foundation suite label');
assertIncludes(readme, '單樁回歸測試與報告視覺 smoke', 'README documents single pile suite label');
[
  '.\\tools\\test-beam.ps1',
  '.\\tools\\test-column.ps1',
  '.\\tools\\test-slab.ps1',
  '.\\tools\\test-wall.ps1',
  '.\\tools\\test-foundation.ps1',
  '.\\tools\\test-pile-cap-3d-stm.ps1',
  '.\\tools\\test-single-pile.ps1',
  '.\\tools\\test-shear-wall.ps1',
  '.\\tools\\test-shear-wall-report.ps1',
  '.\\tools\\test-rc-index-menu.ps1',
  '.\\tools\\test-retrofit-report.ps1',
  'node .\\tools\\rc-project-fingerprint.contract.test.js',
  'node .\\shared\\common.test.js',
  'node .\\shared\\project-storage.test.js',
].forEach(command => assertIncludes(readme, command, `README documents direct command ${command}`));
assertIncludes(readme, '剪力牆報告視覺 smoke', 'README documents shear wall report visual smoke');
assertIncludes(readme, '剪力牆報告視覺 smoke contract', 'README documents shear wall report visual smoke contract');
assertIncludes(readme, '梁報告視覺 smoke', 'README documents beam report visual smoke');
assertIncludes(readme, '梁報告視覺 smoke contract', 'README documents beam report visual smoke contract');
assertIncludes(readme, '柱報告視覺 smoke', 'README documents column report visual smoke');
assertIncludes(readme, '板報告視覺 smoke contract', 'README documents slab report visual smoke contract');
assertIncludes(readme, '板報告視覺 smoke', 'README documents slab report visual smoke');
assertIncludes(readme, '牆報告視覺 smoke contract', 'README documents wall report visual smoke contract');
assertIncludes(readme, '牆報告視覺 smoke', 'README documents wall report visual smoke');
assertIncludes(readme, '基礎報告視覺 smoke contract', 'README documents foundation report visual smoke contract');
assertIncludes(readme, '基礎報告視覺 smoke', 'README documents foundation report visual smoke');
assertIncludes(readme, '單樁報告視覺 smoke contract', 'README documents single pile report visual smoke contract');
assertIncludes(readme, '單樁報告視覺 smoke', 'README documents single pile report visual smoke');
assertIncludes(readme, 'RC 補強報告視覺 smoke contract', 'README documents RC retrofit report visual smoke contract');
assertIncludes(readme, 'RC 補強報告視覺 smoke', 'README documents RC retrofit report visual smoke');
assertIncludes(readme, '人工複核 / 補充資料需求', 'README documents single pile manual-review report boundary');
assertIncludes(readme, '首頁入口瀏覽器 smoke', 'README documents index menu browser smoke');
assertIncludes(readme, 'RC STM 獨立工程基準', 'README documents the local RC STM independent benchmark gate');
assertIncludes(readme, '24 / 24', 'README documents the local STM candidate case count');
assertIncludes(readme, '564', 'README documents the local STM independent assertion count');
assertIncludes(readme, 'rc-stm-independent-engineering-benchmarks.txt', 'README documents the local STM benchmark audit log');
assertIncludes(readme, '維護品質門檻', 'README documents maintenance quality gates');
[
  '鋼筋混凝土/output/audit/audit-summary.md',
  '鋼筋混凝土/output/audit/audit-summary.json',
  '鋼筋混凝土/output/audit/audit-status.json',
  '鋼筋混凝土/output/audit/history/<runId>/...',
  'output/playwright/*-report-*.png',
  'output/playwright/*-report-*.pdf',
  'output/playwright/*-visual-audit.json',
  'output/preflight/preflight-summary.md',
].forEach(outputPath => assertIncludes(readme, outputPath, `README documents output location ${outputPath}`));

if (failed) {
  console.error(`\n${failed} audit status contract checks failed.`);
  process.exit(1);
}

console.log('\nAll audit status contract checks passed.');
