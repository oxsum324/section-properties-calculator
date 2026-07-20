const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const reportPath = path.join(ROOT, 'shared', 'report.js');
const reportSource = fs.readFileSync(reportPath, 'utf8');
const context = { window: {}, console };
vm.runInNewContext(reportSource, context, { filename: reportPath });

const fingerprintApi = context.window.RCReportFingerprint;
assert.ok(fingerprintApi, 'shared report should expose RCReportFingerprint');
assert.strictEqual(typeof fingerprintApi.buildProjectCalculationFingerprint, 'function');
assert.strictEqual(typeof fingerprintApi.withProjectCalculationFingerprint, 'function');

const basePayload = {
  schema: 'rc-beam-project-v1',
  tool: 'rc-beam',
  toolTitle: '梁 Beam 設計／檢核',
  appVersion: 'V3.1',
  savedAt: '2026-07-20T10:00:00.000Z',
  activeTab: 'geom',
  mode: 'check',
  metadata: { projectName: 'A 工程', projectNo: 'A-001', designer: '甲' },
  fields: {
    projName: { kind: 'input', value: 'A 工程' },
    projNo: { kind: 'input', value: 'A-001' },
    projDesigner: { kind: 'input', value: '甲' },
    MuPos: { kind: 'input', value: '88' },
    showSteps: { kind: 'checkbox', checked: true },
  },
  summary: { banner: '主軸彎矩 OK', manualReviewItems: [] },
};
const options = { ignoredKeys: ['activeTab'] };
const base = fingerprintApi.withProjectCalculationFingerprint(basePayload, options);
assert.match(base.calculationFingerprint, /^CF-[A-F0-9]{16}$/);

const identityOnlyChange = {
  ...basePayload,
  schema: 'rc-beam-project-v2',
  toolTitle: '梁工具新版名稱',
  appVersion: 'V9.9',
  savedAt: '2030-01-01T00:00:00.000Z',
  activeTab: 'summary',
  metadata: { projectName: 'B 工程', projectNo: 'B-999', designer: '乙' },
  fields: {
    ...basePayload.fields,
    projName: { kind: 'input', value: 'B 工程' },
    projNo: { kind: 'input', value: 'B-999' },
    projDesigner: { kind: 'input', value: '乙' },
  },
};
assert.strictEqual(
  fingerprintApi.buildProjectCalculationFingerprint(identityOnlyChange, options),
  base.calculationFingerprint,
  'project identity, save time, version and UI-only tab must not change the calculation fingerprint',
);

const inputChange = {
  ...basePayload,
  fields: { ...basePayload.fields, MuPos: { kind: 'input', value: '89' } },
};
assert.notStrictEqual(
  fingerprintApi.buildProjectCalculationFingerprint(inputChange, options),
  base.calculationFingerprint,
  'calculation input changes must change the calculation fingerprint',
);

const resultChange = {
  ...basePayload,
  summary: { ...basePayload.summary, banner: '主軸彎矩 NG' },
};
assert.notStrictEqual(
  fingerprintApi.buildProjectCalculationFingerprint(resultChange, options),
  base.calculationFingerprint,
  'calculation result changes must change the calculation fingerprint',
);

const otherTool = { ...basePayload, tool: 'rc-column' };
assert.notStrictEqual(
  fingerprintApi.buildProjectCalculationFingerprint(otherTool, options),
  base.calculationFingerprint,
  'tool identity must prevent cross-tool source pairing',
);

const foundationPayload = { ...basePayload, tool: 'rc-foundation' };
const foundationIso = fingerprintApi.buildProjectCalculationFingerprint(foundationPayload, {
  ignoredKeys: ['activeTab'],
  calculationContext: { foundationTab: 'iso' },
});
const foundationPile = fingerprintApi.buildProjectCalculationFingerprint(foundationPayload, {
  ignoredKeys: ['activeTab'],
  calculationContext: { foundationTab: 'pile' },
});
assert.notStrictEqual(foundationIso, foundationPile, 'foundation calculation type must change the calculation fingerprint');

const pageContracts = [
  ['beam.html', 'collectBeamProjectData', 'projectSnapshot = collectBeamProjectData()'],
  ['column.html', 'collectColumnProjectData', 'projectSnapshot = collectColumnProjectData()'],
  ['slab.html', 'collectSlabProjectData', 'projectSnapshot = collectSlabProjectData()'],
  ['wall.html', 'collectWallProjectData', 'projectSnapshot = collectWallProjectData()'],
  ['shear-wall.html', 'collectShearWallProjectData', 'projectSnapshot = collectShearWallProjectData()'],
  ['foundation.html', 'collectFoundationProjectData', 'projectSnapshot = collectFoundationProjectData()'],
  ['single-pile-designer.html', 'buildProjectPayload', 'projectSnapshot = buildProjectPayload()'],
];

for (const [file, collector, snapshotCall] of pageContracts) {
  const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
  assert.ok(html.includes('shared/report.js?v=5'), `${file} should load the fingerprint-enabled shared report`);
  assert.ok(html.includes('withProjectCalculationFingerprint(payload'), `${file} should fingerprint its project JSON payload`);
  assert.ok(html.includes(snapshotCall), `${file} report should use a fresh ${collector} snapshot`);
  assert.ok(html.includes('calculationFingerprint: projectSnapshot.calculationFingerprint')
    || html.includes('calculationFingerprint:projectSnapshot.calculationFingerprint'), `${file} report should reuse the project JSON calculation fingerprint`);
}
assert.ok(
  fs.readFileSync(path.join(__dirname, 'single-pile-designer.html'), 'utf8').includes('window.buildProjectPayload = buildProjectPayload'),
  'single pile should expose its project payload for provenance integration checks',
);

const visualTests = [
  'beam-report-visual.test.js',
  'column-report-visual.test.js',
  'slab-report-visual.test.js',
  'wall-report-visual.test.js',
  'shear-wall-report-visual.test.js',
  'foundation-report-visual.test.js',
  'single-pile-report-visual.test.js',
];
for (const file of visualTests) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  assert.ok(source.includes('project JSON matches report calculation fingerprint'), `${file} should verify source/report fingerprint equality`);
}

console.log('RC project/report calculation fingerprint contract OK');
