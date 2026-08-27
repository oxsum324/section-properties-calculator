const assert = require('node:assert/strict');
const LoadCombo = require('../../結構工具箱/core/loads/loadcombo.js');
const Adapter = require('./joint-reaction-load-adapter.js');

const csv = [
  'TABLE:  "Joint Reactions"',
  'Story,Point,Unique Name,OutputCase,CaseType,StepType,F1,F2,F3,M1,M2,M3',
  'Base,P1,101,D,Linear Static,,0,0,100,0,0,0',
  'Base,P1,101,L,Linear Static,,0,0,40,0,0,0',
  'Base,P1,101,W,Linear Static,,0,0,0,12,0,0',
  'Base,P1,101,E,Linear Static,,0,0,0,0,-15,0',
].join('\r\n');

const parsed = Adapter.parseTable(csv);
assert.equal(parsed.schema, 'rc-joint-reaction-load-adapter.v1');
assert.equal(parsed.headerLine, 2);
assert.equal(parsed.delimiter, ',');
assert.equal(parsed.headers[parsed.columns.outputCase], 'OutputCase');
assert.equal(parsed.headers[parsed.columns.F3], 'F3');
assert.deepEqual(parsed.points, ['Base / P1']);
assert.deepEqual(parsed.casesByPoint['Base / P1'], ['D', 'E', 'L', 'W']);

const built = Adapter.buildPackage({
  loadCombo:LoadCombo,
  software:'ETABS', filename:'joint-reactions.csv', parsed,
  pointKey:'Base / P1', unitProfile:'tf-m',
  cases:{ D:'D', L:'L', W:'W', E:'E' },
  verticalForce:'F3', mxMoment:'M1', myMoment:'M2',
  generatedAt:'2026-08-26T00:00:00.000Z',
});
assert.equal(built.schemaVersion, 'loadcombo-components-v1');
assert.deepEqual(built.forces.P, { D:100, L:40, W:0, E:0 });
assert.deepEqual(built.forces.Mx, { D:0, L:0, W:-12, E:0 });
assert.deepEqual(built.forces.My, { D:0, L:0, W:0, E:15 });
assert.equal(built.signConvention.P, 'compression-positive');
assert.match(built.source.caseSet, /D=D, L=L, W=W, E=E/);
assert.match(built.source.caseSet, /Mx=-M1×1/);

const knBuilt = Adapter.buildPackage({
  loadCombo:LoadCombo,
  software:'SAP2000', filename:'joint-reactions.tsv', parsed,
  pointKey:'Base / P1', unitProfile:'kn-m',
  cases:{ D:'D' }, verticalForce:'F3', mxMoment:'', myMoment:'', verticalSign:-1,
  generatedAt:'2026-08-26T00:00:00.000Z',
});
assert.equal(knBuilt.forces.P.D, -Math.round((100 / 9.80665) * 1e9) / 1e9);
assert.deepEqual(knBuilt.forces.Mx, { D:0, L:0, W:0, E:0 });

const quoted = Adapter.parseTable([
  '"Joint Label";"Load Case/Combo";"Case Type";"F1";"F2";"F3";"M1";"M2";"M3"',
  '"J,1";"Dead";"Linear Static";"0";"0";"1,234";"0";"0";"0"',
].join('\n'));
assert.deepEqual(quoted.points, ['J,1']);
assert.equal(quoted.rows[0].F3, 1234);

function expectError(fn, pattern) {
  assert.throws(fn, pattern);
}

expectError(() => Adapter.parseTable('Point,OutputCase,F1,F2,F3,M1,M2\nP,D,0,0,1,0,0'), /找不到 Joint Reactions 表頭/);
expectError(() => Adapter.parseTable(csv.replace('100', 'not-a-number')), /F3 必須是有限數值/);
expectError(() => Adapter.buildPackage({ loadCombo:LoadCombo, software:'ETABS', filename:'x.csv', parsed, pointKey:'Base / P1', unitProfile:'bad', cases:{D:'D'} }), /不支援的來源單位/);
expectError(() => Adapter.buildPackage({ loadCombo:LoadCombo, software:'ETABS', filename:'x.csv', parsed, pointKey:'Base / P1', unitProfile:'tf-m', cases:{D:'D',L:'D'} }), /不得重複對應/);
expectError(() => Adapter.buildPackage({ loadCombo:LoadCombo, software:'ETABS', filename:'x.csv', parsed, pointKey:'Base / P1', unitProfile:'tf-m', cases:{D:'D'}, mxMoment:'M1', myMoment:'M1' }), /不得同時取用同一/);

const comboParsed = Adapter.parseTable(csv.replace('D,Linear Static', 'D,Combination'));
expectError(() => Adapter.buildPackage({ loadCombo:LoadCombo, software:'ETABS', filename:'x.csv', parsed:comboParsed, pointKey:'Base / P1', unitProfile:'tf-m', cases:{D:'D'} }), /為載重組合/);

const linStaticParsed = Adapter.parseTable(csv.replace(/Linear Static/g, 'LinStatic'));
const linStaticBuilt = Adapter.buildPackage({ loadCombo:LoadCombo, software:'SAP2000', filename:'x.tsv', parsed:linStaticParsed, pointKey:'Base / P1', unitProfile:'tf-m', cases:{D:'D'} });
assert.equal(linStaticBuilt.source.version, 'V1.1');
assert.equal(linStaticBuilt.forces.P.D, 100);

for (const disallowedCaseType of ['Response Spectrum', 'Time History', 'Nonlinear Static', 'Modal']) {
  const disallowedParsed = Adapter.parseTable(csv.replace('D,Linear Static', `D,${disallowedCaseType}`));
  expectError(
    () => Adapter.buildPackage({ loadCombo:LoadCombo, software:'ETABS', filename:'x.csv', parsed:disallowedParsed, pointKey:'Base / P1', unitProfile:'tf-m', cases:{D:'D'} }),
    /不是可線性疊加的 Linear Static／LinStatic/
  );
}

const noTypeParsed = Adapter.parseTable(csv.replace(/,Linear Static/g, ','));
expectError(() => Adapter.buildPackage({ loadCombo:LoadCombo, software:'ETABS', filename:'x.csv', parsed:noTypeParsed, pointKey:'Base / P1', unitProfile:'tf-m', cases:{D:'D'} }), /缺少 CaseType/);

const duplicateParsed = Adapter.parseTable(`${csv}\nBase,P1,101,D,Linear Static,Last,0,0,101,0,0,0`);
expectError(() => Adapter.buildPackage({ loadCombo:LoadCombo, software:'ETABS', filename:'x.csv', parsed:duplicateParsed, pointKey:'Base / P1', unitProfile:'tf-m', cases:{D:'D'} }), /有 2 列/);

console.log('joint reaction load adapter tests passed');
