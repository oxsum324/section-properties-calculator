const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function toolboxFile(relativePath) {
  return path.join(toolboxRoot, ...relativePath.split('/'));
}

function assertFile(relativePath) {
  const fullPath = toolboxFile(relativePath);
  assert.ok(fs.existsSync(fullPath), `missing toolbox file: ${relativePath}`);
  return fullPath;
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} missing: ${needle}`);
}

function assertNoIncludes(text, needle, label) {
  assert.equal(text.includes(needle), false, `${label} should not include: ${needle}`);
}

const manifestPath = assertFile('tools/formal-tools.manifest.json');
const manifestText = readText(manifestPath);
const manifest = JSON.parse(manifestText);
const tools = manifest.tools;

assert.equal(manifest.version, '0.1.0', 'formal tools manifest version');
assert.equal(manifest.family, 'formal-tools', 'formal tools manifest family');
assert.ok(Array.isArray(tools), 'formal tools manifest tools');
assert.equal(tools.length, 14, 'formal tools manifest tool count');
assert.deepEqual(
  manifest.requiredRoutes,
  tools.map(tool => tool.route),
  'formal tools requiredRoutes must match tool order'
);

const repoDocs = {
  readme: readText(repoFile('README.md')),
  boundaries: readText(repoFile('TOOL_BOUNDARIES.md')),
  staging: readText(repoFile('STAGING_GROUPS.md')),
  reportGuide: readText(repoFile('TOOL_REPORT_GUIDE.md')),
  vercel: readText(repoFile('vercel.json')),
  homeJs: readText(toolboxFile('assets/home/home.js')),
  smoke: readText(toolboxFile('tools/formal-browser-smoke.test.js')),
  runner: readText(toolboxFile(manifest.shared.runner)),
  maturity: readText(toolboxFile(manifest.shared.maturityMatrix))
};

[
  'tools/formal-tools.manifest.json',
  'formalTools = formalManifest.tools',
  'requiredFormalRoutes = formalManifest.requiredRoutes',
  'reportExpectations',
  'diagramChecks',
  'roleBoxesNonZero',
  'rolesInsideDiagram',
  'goldenCaseExpression',
  'assertGoldenCaseState'
].forEach(needle => assertIncludes(repoDocs.smoke, needle, 'formal browser smoke manifest contract'));

[
  'formal tools manifest runner OK',
  'manifest.shared.contractTest',
  'manifest.shared.browserSmokeTest',
  'manifest.shared.maturityMatrix',
  'runNode'
].forEach(needle => assertIncludes(repoDocs.runner, needle, 'formal tools runner'));

[
  'tool maturity matrix',
  'formal-tools',
  'local-quick-tools',
  '--write',
  '--check',
  'tool-maturity-matrix.json',
  'tool-maturity-matrix.md',
  'goldenCaseRegression',
  'jsonRoundTrip',
  'referenceTraceability'
].forEach(needle => assertIncludes(repoDocs.maturity, needle, 'tool maturity matrix generator'));

[
  '結構工具箱/tools/formal-tools.manifest.json',
  '結構工具箱/tools/formal-tools.run.js',
  '結構工具箱/tools/formal-tools.contract.test.js',
  '結構工具箱/tools/tool-maturity-matrix.js',
  '工具成熟度矩陣'
].forEach(needle => {
  assertIncludes(repoDocs.readme, needle, 'README formal tools governance');
  assertIncludes(repoDocs.boundaries, needle, 'TOOL_BOUNDARIES formal tools governance');
  assertIncludes(repoDocs.staging, needle, 'STAGING_GROUPS formal tools governance');
});
assertIncludes(repoDocs.reportGuide, 'formal-tools.manifest.json', 'TOOL_REPORT_GUIDE formal manifest');
assertIncludes(repoDocs.reportGuide, '工具成熟度矩陣', 'TOOL_REPORT_GUIDE maturity matrix');

const routeSet = new Set();
const keySet = new Set();
const reportForbidden = manifest.reportForbiddenNeedles || [];

for (const tool of tools) {
  assert.ok(tool.key, 'formal tool key');
  assert.ok(tool.label, `${tool.key} label`);
  assert.ok(tool.route && tool.route.startsWith('/'), `${tool.key} clean route`);
  assert.ok(tool.html && tool.html.endsWith('.html'), `${tool.key} html`);
  assert.ok(!keySet.has(tool.key), `duplicate formal key: ${tool.key}`);
  assert.ok(!routeSet.has(tool.route), `duplicate formal route: ${tool.route}`);
  keySet.add(tool.key);
  routeSet.add(tool.route);

  const htmlPath = assertFile(tool.html);
  const html = readText(htmlPath);
  assertIncludes(html, tool.titleNeedle, `${tool.key} title needle in HTML`);
  assertIncludes(html, tool.familyNeedle, `${tool.key} family needle in HTML`);
  assertIncludes(html, tool.calcButton, `${tool.key} calc button in HTML`);
  if (tool.reportButton) assertIncludes(html, tool.reportButton, `${tool.key} report button in HTML`);
  if (tool.reportButtonSelector) assertIncludes(html, 'btn-print', `${tool.key} print selector fallback in HTML`);
  if (tool.exportButton) assertIncludes(html, tool.exportButton, `${tool.key} export button in HTML`);
  if (tool.importButton) assertIncludes(html, tool.importButton, `${tool.key} import button in HTML`);
  if (tool.reportMode) {
    assertIncludes(html, 'btnReportModeDetail', `${tool.key} report detail mode`);
    assertIncludes(html, 'btnReportModeSimple', `${tool.key} report simple mode`);
  }
  for (const role of tool.diagramRoleNeedles || []) {
    assertIncludes(html, `data-diagram-role="${role}"`, `${tool.key} diagram role`);
  }

  for (const needle of reportForbidden) {
    if (['undefined', 'NaN'].includes(needle)) continue;
    assertNoIncludes(html, needle, `${tool.key} source wording`);
  }

  assertIncludes(repoDocs.homeJs, `href: '${tool.route}'`, `${tool.key} home clean route card`);
  assertIncludes(repoDocs.homeJs, `'${tool.route}': '${tool.html}'`, `${tool.key} home clean route map`);
  assertIncludes(repoDocs.vercel, `"source": "${tool.route}"`, `${tool.key} vercel route`);
  const cleanDestination = `/結構工具箱/${tool.html.replace(/\.html$/i, '')}`;
  assert.ok(
    repoDocs.vercel.includes(`"destination": "/結構工具箱/${tool.html}"`) ||
      repoDocs.vercel.includes(`"destination": "${cleanDestination}"`),
    `${tool.key} vercel destination missing: /結構工具箱/${tool.html} or ${cleanDestination}`
  );

  const caps = tool.capabilities || {};
  assert.equal(caps.cleanRoute, true, `${tool.key} cleanRoute capability`);
  assert.equal(caps.report, true, `${tool.key} report capability`);
  assert.equal(caps.browserSmoke, true, `${tool.key} browser smoke capability`);
  assert.equal(caps.reportRegression, true, `${tool.key} report regression capability`);
  assert.equal(caps.coreRegression, true, `${tool.key} core regression capability`);
  assert.equal(Boolean(caps.reportModes), Boolean(tool.reportMode), `${tool.key} report mode capability`);
  assert.equal(Boolean(caps.jsonExport), Boolean(tool.exportButton), `${tool.key} JSON export capability`);
  assert.equal(Boolean(caps.jsonImport), Boolean(tool.importButton), `${tool.key} JSON import capability`);
  assert.equal(Boolean(caps.diagramGeometry), Boolean(tool.diagramChecks), `${tool.key} diagram geometry capability`);

  if (tool.reportMode) {
    assert.ok(tool.reportExpectations?.simple, `${tool.key} simple report expectations`);
    assert.ok(tool.reportExpectations?.detail, `${tool.key} detail report expectations`);
    assert.ok(tool.reportExpectations.simple.mustInclude.length >= 3, `${tool.key} simple report mustInclude`);
    assert.ok(tool.reportExpectations.detail.mustInclude.length >= 2, `${tool.key} detail report mustInclude`);
    assert.ok(tool.reportExpectations.simple.mustExclude.length >= 2, `${tool.key} simple report mustExclude`);
    assert.ok(tool.reportExpectations.detail.mustExclude.length >= 2, `${tool.key} detail report mustExclude`);
  }

  for (const goldenCase of tool.goldenCases || []) {
    assert.ok(goldenCase.id, `${tool.key} golden case id`);
    assert.ok(goldenCase.description, `${tool.key} golden case description`);
    assert.ok(goldenCase.inputs && typeof goldenCase.inputs === 'object', `${tool.key} golden case inputs`);
    assert.ok(
      Object.keys(goldenCase.expectedSelectors || {}).length > 0 ||
        (goldenCase.expectedTextNeedles || []).length > 0,
      `${tool.key} golden case expected outputs`
    );
  }
}

const goldenToolKeys = tools.filter(tool => (tool.goldenCases || []).length > 0).map(tool => tool.key);
assert.deepEqual(
  goldenToolKeys,
  ['wind-object-solid', 'wind-object-frame', 'wind-lattice-tower', 'wind-object-tower', 'wind-fence-sign', 'wind-sign-pole', 'seismic-appendage', 'seismic-misc', 'seismic-dynamic'],
  'formal golden case pilot tool set'
);

console.log(`formal tools contract OK (${tools.length} tools)`);
