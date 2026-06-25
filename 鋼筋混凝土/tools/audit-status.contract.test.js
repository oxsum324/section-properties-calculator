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
const testRcIndexPath = path.join(ROOT, 'tools', 'test-rc-index-menu.ps1');
const testShearWallReportPath = path.join(ROOT, 'tools', 'test-shear-wall-report.ps1');
const ensurePlaywrightDepsPath = path.join(ROOT, 'tools', 'ensure-playwright-deps.ps1');
const sharedReportPath = path.join(ROOT, 'shared', 'report.js');
const rcTraceCatalogPath = path.join(ROOT, 'tools', 'rc-traceability.catalog.json');

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
const testRcIndex = fs.readFileSync(testRcIndexPath, 'utf8');
const testShearWallReport = fs.readFileSync(testShearWallReportPath, 'utf8');
const ensurePlaywrightDeps = fs.readFileSync(ensurePlaywrightDepsPath, 'utf8');
const sharedReport = fs.readFileSync(sharedReportPath, 'utf8');
const rcTraceCatalogText = fs.readFileSync(rcTraceCatalogPath, 'utf8');
const rcTraceCatalog = JSON.parse(rcTraceCatalogText);

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
const auditModules = parseAuditModules(audit);
const indexLabels = parseIndexLabels(index);
const menuCards = parseMenuCards(index);
const fallbackText = expectedLabels.join('、');
const requiredQaArtifacts = [
  'tools/audit-status.contract.test.js',
  'tools/rc-index-menu-browser-smoke.test.js',
  'tools/test-rc-index-menu.ps1',
  'tools/beam-regression.test.js',
  'tools/beam-regression-cases.json',
  'tools/beam-report-visual.test.js',
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
  'tools/test-slab.ps1',
  'tools/wall-report-visual.test.js',
  'tools/test-wall.ps1',
  'tools/rc-traceability.catalog.json',
  'tools/shear-wall-regression.test.js',
  'tools/shear-wall-report-visual.test.js',
  'tools/test-shear-wall.ps1',
  'tools/test-shear-wall-report.ps1',
  'tools/foundation-regression.test.js',
  'tools/foundation-regression-cases.json',
  'tools/foundation-report-visual.test.js',
  'tools/test-foundation.ps1',
  'tools/single-pile-regression.test.js',
  'tools/single-pile-report-visual.test.js',
  'tools/test-single-pile.ps1',
  'shared/common.test.js',
  'shared/loadcases.test.js',
  'shared/wall-base.test.js',
  'shared/wall-evaluator.test.js',
  'shared/pmsection.test.js',
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
  const card = menuCards[position];
  assert(card && card.href === expectedHrefs[position], `menu card href maps ${key}`, card ? card.href : 'missing');
  assert(card && card.title.includes(label), `menu card title mentions ${label}`, card ? card.title : 'missing');
}
assert(menuCards.length >= expectedModules.length, 'index menu exposes all audited modules', `cards=${menuCards.length}`);
assert(menuCards.length === expectedModules.length + 1 && menuCards[expectedModules.length].href === '../RC補強斷面性質.html', 'index menu only has expected non-audited RC strengthening entry', JSON.stringify(menuCards.map((card) => card.href)));
for (const card of menuCards) {
  const target = localHtmlTarget(ROOT, card.href);
  assert(target && fs.existsSync(target), `menu card target exists: ${card.href}`, target || 'non-local');
  if (!target || !fs.existsSync(target)) continue;
  const html = fs.readFileSync(target, 'utf8');
  const pageDir = path.dirname(target);
  assert(html.includes('<link rel="icon" href="data:,">'), `menu target has data favicon: ${card.href}`, path.basename(target));
  for (const resource of parseLocalResources(html, pageDir)) {
    assert(fs.existsSync(resource.target), `${path.basename(target)} ${resource.kind} exists`, resource.href);
  }
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
assertIncludes(audit, 'Shear wall report visual smoke', 'audit runs shear wall report visual smoke');
assertIncludes(audit, 'Beam regression and report visual smoke', 'audit runs beam regression and report visual smoke');
assertIncludes(audit, 'Foundation regression and report visual smoke', 'audit runs foundation regression and report visual smoke');
assertIncludes(audit, 'Column regression and report visual smoke', 'audit runs column regression and report visual smoke');
assertIncludes(audit, 'Wall regression and report visual smoke', 'audit runs wall regression and report visual smoke');
assertIncludes(audit, 'Slab regression and report visual smoke', 'audit runs slab regression and report visual smoke');
assertIncludes(audit, 'Single pile regression and report visual smoke', 'audit runs single pile regression and report visual smoke');
assertIncludes(audit, 'RC index menu browser smoke', 'audit runs index menu browser smoke');
assertIncludes(sharedReport, 'showRcReportIssue', 'shared report exposes inline popup-block status helper');
assertIncludes(sharedReport, 'repWindowStatus', 'shared report exposes inline report-window status helper');
assert(!sharedReport.includes('alert('), 'shared report uses inline status instead of blocking alerts');
validateRcTraceabilityCatalog(rcTraceCatalog, rcTraceCatalogText);
assertIncludes(testBeam, 'Beam report visual smoke', 'test-beam runs beam report visual smoke');
assertIncludes(testBeam, 'beam-report-visual.test.js', 'test-beam wires beam report visual script');
assertIncludes(testSlab, 'Slab report visual smoke', 'test-slab runs slab report visual smoke');
assertIncludes(testSlab, 'slab-report-visual.test.js', 'test-slab wires slab report visual script');
assertIncludes(testWall, 'Wall report visual smoke', 'test-wall runs wall report visual smoke');
assertIncludes(testWall, 'wall-report-visual.test.js', 'test-wall wires wall report visual script');
assertIncludes(testFoundation, 'Foundation report visual smoke', 'test-foundation runs foundation report visual smoke');
assertIncludes(testFoundation, 'foundation-report-visual.test.js', 'test-foundation wires foundation report visual script');
assertIncludes(testSinglePile, 'Single pile report visual smoke', 'test-single-pile runs single pile report visual smoke');
assertIncludes(testSinglePile, 'single-pile-report-visual.test.js', 'test-single-pile wires single pile report visual script');
assertIncludes(index, 'moduleText(payload)', 'index renders module list from audit status metadata');
assertIncludes(index, fallbackText, 'index fallback matches expected module labels');
assertIncludes(readme, '`shared/common.js` helper 單元測試', 'README documents shared common helper unit tests');
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
  '.\\tools\\test-single-pile.ps1',
  '.\\tools\\test-shear-wall.ps1',
  '.\\tools\\test-shear-wall-report.ps1',
  '.\\tools\\test-rc-index-menu.ps1',
  'node .\\shared\\common.test.js',
].forEach(command => assertIncludes(readme, command, `README documents direct command ${command}`));
assertIncludes(readme, '剪力牆報告視覺 smoke', 'README documents shear wall report visual smoke');
assertIncludes(readme, '梁報告視覺 smoke', 'README documents beam report visual smoke');
assertIncludes(readme, '柱報告視覺 smoke', 'README documents column report visual smoke');
assertIncludes(readme, '板報告視覺 smoke', 'README documents slab report visual smoke');
assertIncludes(readme, '牆報告視覺 smoke', 'README documents wall report visual smoke');
assertIncludes(readme, '基礎報告視覺 smoke', 'README documents foundation report visual smoke');
assertIncludes(readme, '單樁報告視覺 smoke', 'README documents single pile report visual smoke');
assertIncludes(readme, '人工複核 / 補充資料需求', 'README documents single pile manual-review report boundary');
assertIncludes(readme, '首頁入口瀏覽器 smoke', 'README documents index menu browser smoke');
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
