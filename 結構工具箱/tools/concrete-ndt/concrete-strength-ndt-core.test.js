'use strict';
const assert = require('node:assert/strict');
const ConcreteStrengthNdtCore = require('./concrete-strength-ndt-core.js');
const goldenCases = require('./concrete-strength-ndt-golden-cases.js');
const Spec = require('./concrete-strength-ndt-spec.js');
function approx(actual, expected, label) {
  assert.equal(typeof actual, 'number', label + ' is numeric');
  assert.ok(Number.isFinite(actual), label + ' is finite');
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), label + ' expected ' + expected + '; received ' + actual);
}
const core = (id, zone, load, diameterMm, lengthMm, factorOverrides) => ({
  id, zone, diameterMm: diameterMm || 100, lengthMm: lengthMm || 200, failureLoadKn: load,
  moistureState: 'dry', samplingDirection: 'perpendicular', drillingDamage: 'typical',
  factorOverrides: factorOverrides || {}
});
const repeated = (value, count) => Array(count || 10).fill(value);
const empty = { project: { name: 'Fixture', number: 'FIX-01' }, designStrengthMpa: 25, rebound: [], ultrasonic: [], core: [] };

assert.ok(goldenCases.length >= 6);
for (const item of goldenCases) {
  assert.deepEqual(ConcreteStrengthNdtCore.validateInput(item.input), [], item.id + ' input validation');
  const result = ConcreteStrengthNdtCore.calculate(item.input);
  assert.equal(result.ok, true, item.id + ' calculation');
  assert.equal(result.formalAttachmentEligible, false, item.id + ' never grants formal status');
  if (item.id === 'rebound-only-three-zones') {
    const s = result.methods.rebound.stats;
    assert.equal(s.n, item.expected.n); approx(s.meanMpa, item.expected.meanMpa, 'rebound mean');
    approx(s.sampleSdMpa, item.expected.sampleSdMpa, 'rebound sample SD');
    approx(s.characteristicStrengthMpa, item.expected.characteristicStrengthMpa, 'rebound characteristic');
    approx(s.minimumSingleMpa, item.expected.minimumSingleMpa, 'rebound minimum');
  } else if (item.id === 'ultrasonic-only-three-zones') {
    const s = result.methods.ultrasonic.stats;
    assert.equal(s.n, item.expected.n); approx(s.meanMpa, item.expected.meanMpa, 'UPV mean');
    approx(s.sampleSdMpa, item.expected.sampleSdMpa, 'UPV sample SD');
    approx(s.characteristicStrengthMpa, item.expected.characteristicStrengthMpa, 'UPV characteristic');
    approx(s.minimumSingleMpa, item.expected.minimumSingleMpa, 'UPV minimum');
  } else if (item.id === 'core-only-three-zones') {
    const s = result.methods.core.stats;
    assert.equal(s.n, item.expected.n); approx(s.meanMpa, item.expected.meanMpa, 'core mean');
    approx(s.sampleSdMpa, item.expected.sampleSdMpa, 'core sample SD');
    approx(s.characteristicStrengthMpa, item.expected.characteristicStrengthMpa, 'core characteristic');
    approx(s.minimumSingleMpa, item.expected.minimumSingleMpa, 'core minimum');
  } else if (item.id === 'all-three-methods-three-matched-zones') {
    for (const method of ['rebound', 'ultrasonic', 'core']) {
      assert.equal(result.methods[method].stats.n, item.expected[method].n);
      approx(result.methods[method].stats.meanMpa, item.expected[method].meanMpa, method + ' all-method mean');
      approx(result.methods[method].stats.characteristicStrengthMpa, item.expected[method].characteristicStrengthMpa, method + ' all-method characteristic');
    }
    assert.equal(result.crossCheck.length, item.expected.matchedZoneCount);
    assert.equal(result.pooled.n, item.expected.pooled.n);
    assert.equal(result.pooled.label, '數值彙整，非獨立試體母體');
    approx(result.pooled.meanMpa, item.expected.pooled.meanMpa, 'pooled mean');
    approx(result.pooled.sampleSdMpa, item.expected.pooled.sampleSdMpa, 'pooled SD');
    approx(result.pooled.characteristicStrengthMpa, item.expected.pooled.characteristicStrengthMpa, 'pooled characteristic');
  } else if (item.id === 'rebound-outlier-trimmed-after-original-mean') {
    const row = result.methods.rebound.rows[0];
    approx(row.originalMean, item.expected.rawMean, 'raw reading mean');
    assert.deepEqual(row.removedReadings, item.expected.removed);
    assert.equal(row.retainedCount, item.expected.retainedCount);
    approx(row.retainedMean, item.expected.retainedMean, 'trimmed mean');
    approx(row.strengthMpa, item.expected.rowStrengthMpa, 'trimmed rebound strength');
    assert.equal(result.methods.rebound.stats.n, item.expected.stats.n);
    approx(result.methods.rebound.stats.sampleSdMpa, item.expected.stats.sampleSdMpa, 'zero sample SD');
    approx(result.methods.rebound.stats.characteristicStrengthMpa, item.expected.stats.characteristicStrengthMpa, 'mean minus k times zero SD');
  } else if (item.id === 'rebound-nonzero-angle-deltaR-before-linear-curve') {
    const row=result.methods.rebound.rows[0];
    approx(row.adjustedMeanRebound,item.expected.correctedMeanRebound,'angle delta R applied before curve');
    approx(row.angleCorrectionDeltaR,item.expected.angleCorrectionDeltaR,'angle delta R');
    approx(row.strengthMpa,item.expected.rowStrengthMpa,'independent linear angle expected value');
  } else if (item.id === 'core-four-correction-factors-explicit') {
    for (const row of result.methods.core.rows) {
      approx(row.rawStrengthMpa, item.expected.rawStrengthMpa, 'raw core strength');
      assert.deepEqual(row.factors, item.expected.factors);
      approx(row.correctedStrengthMpa, item.expected.correctedStrengthMpa, 'four corrected factors');
    }
    approx(result.methods.core.stats.meanMpa, item.expected.meanMpa, 'corrected core mean');
  }
}

const coverage = ConcreteStrengthNdtCore.calculate({
  ...empty,
  rebound: ['Z1', 'Z2', 'Z3', 'Z4'].map((zone, index) => ({
    id: 'CR' + index, zone, readings: repeated(30), angleDeg: 0
  })),
  ultrasonic: ['Z1', 'Z2', 'Z5', 'Z6'].map((zone, index) => ({
    id: 'CU' + index, zone, velocityKmS: 4
  })),
  core: ['Z1', 'Z3', 'Z5', 'Z7'].map((zone, index) => core('CC' + index, zone, 188.49555921538757))
});
assert.equal(coverage.ok, true);
assert.deepEqual(coverage.crossCheckCoverage, {
  zoneKeyRule: '測區識別字串依既有首尾空白裁切及160字元限制正規化後，完全相同才配對；不合併大小寫、不作其他模糊比對、不補值。',
  methodZoneCounts: { rebound: 4, ultrasonic: 4, core: 4 },
  totalDistinctZones: 7,
  allThree: { count: 1, zones: ['Z1'] },
  exactlyTwo: {
    count: 3,
    combinations: [
      { methods: ['rebound', 'ultrasonic'], count: 1, zones: ['Z2'] },
      { methods: ['rebound', 'core'], count: 1, zones: ['Z3'] },
      { methods: ['ultrasonic', 'core'], count: 1, zones: ['Z5'] }
    ]
  },
  onlyOne: {
    count: 3,
    byMethod: { rebound: ['Z4'], ultrasonic: ['Z6'], core: ['Z7'] }
  },
  note: '測區數為測區識別配對結果，不是獨立試體數或母體樣本數。'
});
assert.equal(
  coverage.crossCheckCoverage.allThree.count + coverage.crossCheckCoverage.exactlyTwo.count + coverage.crossCheckCoverage.onlyOne.count,
  coverage.crossCheckCoverage.totalDistinctZones,
  'coverage groups partition all distinct zones'
);

const normalizedZoneCoverage = ConcreteStrengthNdtCore.calculate({
  ...empty,
  core: [
    core('NZ1', 'Z1', 188.49555921538757),
    core('NZ1-space', 'Z1 ', 204.20352248330003),
    core('Nz1', 'z1', 196.34954084936206)
  ]
});
assert.equal(normalizedZoneCoverage.ok, true);
assert.deepEqual(normalizedZoneCoverage.input.core.map(row => row.zone), ['Z1', 'Z1', 'z1']);
assert.deepEqual(normalizedZoneCoverage.methods.core.zoneResults.map(row => [row.zone, row.measurementCount]), [['Z1', 2], ['z1', 1]]);
assert.deepEqual(normalizedZoneCoverage.crossCheckCoverage.methodZoneCounts, { rebound: 0, ultrasonic: 0, core: 2 });
assert.deepEqual(normalizedZoneCoverage.crossCheckCoverage.onlyOne.byMethod.core, ['Z1', 'z1']);
assert.equal(normalizedZoneCoverage.crossCheckCoverage.totalDistinctZones, 2);

assert.deepEqual(ConcreteStrengthNdtCore.summarizeCrossCheckCoverage({ rebound: [], ultrasonic: [], core: [] }), {
  zoneKeyRule: '測區識別字串依既有首尾空白裁切及160字元限制正規化後，完全相同才配對；不合併大小寫、不作其他模糊比對、不補值。',
  methodZoneCounts: { rebound: 0, ultrasonic: 0, core: 0 },
  totalDistinctZones: 0,
  allThree: { count: 0, zones: [] },
  exactlyTwo: { count: 0, combinations: [] },
  onlyOne: { count: 0, byMethod: { rebound: [], ultrasonic: [], core: [] } },
  note: '測區數為測區識別配對結果，不是獨立試體數或母體樣本數。'
});

const equalCore = ConcreteStrengthNdtCore.calculate({
  ...empty,
  core: [
    core('C1', 'Z1', 188.49555921538757),
    core('C2', 'Z2', 188.49555921538757),
    core('C3', 'Z3', 188.49555921538757)
  ]
});
assert.equal(equalCore.ok, true);
assert.equal(equalCore.methods.core.stats.sampleSdMpa, 0);
assert.equal(equalCore.methods.core.stats.characteristicStrengthMpa, equalCore.methods.core.stats.meanMpa);
assert.match(equalCore.methods.core.stats.zeroSdNote, /零離散不表示母體零變異/);

const duplicates = ConcreteStrengthNdtCore.calculate({
  ...empty, core: [core('C1', 'Z1', 188.49555921538757), core('C2', 'Z1', 204.20352248330003)]
});
assert.equal(duplicates.ok, true);
assert.equal(duplicates.methods.core.rows.length, 2);
assert.equal(duplicates.methods.core.zoneResults.length, 1);
assert.equal(duplicates.methods.core.zoneResults[0].measurementCount, 2);
assert.equal(duplicates.methods.core.stats.n, 1, 'two cores at one zone count as n=1');
assert.equal(duplicates.methods.core.stats.characteristicStatus, '待補');
assert.equal(duplicates.methods.core.stats.characteristicStrengthMpa, null);

assert.equal(ConcreteStrengthNdtCore.calculate(empty).ok,false,'all methods empty rejects');
for (const fixture of goldenCases) {
  const original = ConcreteStrengthNdtCore.calculate(fixture.input);
  const replayed = ConcreteStrengthNdtCore.calculate(JSON.parse(JSON.stringify(original.input)));
  assert.deepEqual(replayed, original, fixture.id + ' canonical JSON input reproduces every result');
}
const mixedUpvModes = ConcreteStrengthNdtCore.calculate({...empty, ultrasonic:[
  {id:'UV1',zone:'Z1',velocityKmS:4},
  {id:'UV2',zone:'Z2',distanceMm:300,timeMicroseconds:75}
]});
assert.equal(mixedUpvModes.ok,true);
assert.deepEqual(ConcreteStrengthNdtCore.calculate(JSON.parse(JSON.stringify(mixedUpvModes.input))),mixedUpvModes,'direct velocity and distance/time modes survive canonical null fields');
assert.equal(ConcreteStrengthNdtCore.calculate({...empty,ultrasonic:[{id:'UV0',zone:'Z1',velocityKmS:null,distanceMm:null,timeMicroseconds:null}]}).ok,false,'all-null ultrasonic input remains invalid');
const roundTripInput={...empty,designStrengthSource:'設計圖說',core:[core('RT1','Z1',188.49555921538757)]};const roundTrip=ConcreteStrengthNdtCore.calculate(roundTripInput);assert.equal(roundTrip.ok,true);assert.deepEqual(roundTrip.input,{...roundTripInput,project:{...roundTripInput.project,preparer:'',instrumentModel:'',concreteDescription:''},core:[{...roundTripInput.core[0],factorOverrides:{lengthDiameter:null,diameter:null,moisture:null,drillingDamage:null}}]},'result input preserves fields in canonical JSON-safe form');
const tooFewRetained = ConcreteStrengthNdtCore.calculate({
  ...empty,
  rebound: [
    { id: 'R1', zone: 'Z1', readings: repeated(30, 9).concat(40), angleDeg: 0 },
    { id: 'R2', zone: 'Z2', readings: repeated(30), angleDeg: 0 },
    { id: 'R3', zone: 'Z3', readings: repeated(30), angleDeg: 0 }
  ]
});
assert.equal(tooFewRetained.ok, false, 'trimming to nine valid readings fails closed');
assert.match(tooFewRetained.errors.join(' '), /至少須有10筆有效讀值/);

const invalidCases = [
  { name: 'L/D below one', input: { ...empty, core: [core('C1', 'Z1', 100, 100, 99)] } },
  { name: 'negative rebound', input: { ...empty, rebound: [{ id: 'R1', zone: 'Z1', readings: repeated(30, 9).concat(-1), angleDeg: 0 }] } },
  { name: 'missing angle source', input: { ...empty, rebound: [{ id: 'R1', zone: 'Z1', readings: repeated(30), angleDeg: 45 }] } },
  { name: 'blank is not zero', input: { ...empty, ultrasonic: [{ id: 'U1', zone: 'Z1', velocityKmS: '' }] } }
];
for (const item of invalidCases) {
  const result = ConcreteStrengthNdtCore.calculate(item.input);
  assert.equal(result.ok, false, item.name);
  assert.equal(result.formalAttachmentEligible, false, item.name);
}
const overflow = ConcreteStrengthNdtCore.calculate({
  ...empty, ultrasonic: [{ id: 'U1', zone: 'Z1', velocityKmS: 4, curveType: 'exponential', curveCoefficients: { a: 1, b: 1e9 } }]
});
assert.equal(overflow.ok, false, 'non-finite intermediate output is rejected');

function confirmedItem(values) {
  return { confirmed: true, assumed: false, confirmedBy: '技師甲', confirmedAt: '2026-10-14T08:00:00Z', source: '案件檢測計畫第2頁', values };
}
const confirmedFile = {
  schemaVersion: '1.0.0', confirmedAt: '2026-10-14T08:00:00Z', confirmedBy: '技師甲',
  applicability: { projectNumber: 'P-1', concreteDescription: '指定樓層梁混凝土', instrumentModel: 'Model-X', applicableMethod: 'all-methods', projectSource: '案件計畫第2頁' },
  assumptions: {
    reboundTrim: confirmedItem({ threshold: 6, minimumRawReadings: 10, minimumRetainedReadings: 10 }),
    reboundAngleTable: confirmedItem({ entries: { '0': 2, '45': 3, '90': 4 } }),
    reboundCurve: confirmedItem({ curveType: 'linear', coefficients: { a: 0.1, b: 2 } }),
    ultrasonic: confirmedItem({ curveType: 'power', coefficients: { a: 2, b: 1 }, gradeRanges: [{ label: '確認級', minKmS: 0 }] }),
    coreCorrections: confirmedItem({
      lengthDiameterFactors: [{ min: 1, max: 3, factor: 1 }],
      diameterFactors: [{ min: 0, max: 1000, factor: 1 }],
      moistureFactors: { dry: 1, wet: 1, unknown: 1 },
      drillingDamageFactors: { low: 1, typical: 1, high: 1, unknown: 1 }
    }),
    characteristicModel: confirmedItem({ bands: [{ minN: 3, maxNExclusive: 501, k: 2 }] })
  }
};
assert.equal(Spec.validateConfirmedSpec(confirmedFile), true);
for(const alter of [v=>{v.assumptions.coreCorrections.values.lengthDiameterFactors=[{min:1,max:3,factor:1},{min:2,max:4,factor:1}];},v=>{v.assumptions.coreCorrections.values.diameterFactors=[{min:100,max:200,factor:1},{min:0,max:100,factor:1}];}]){const bad=JSON.parse(JSON.stringify(confirmedFile));alter(bad);assert.throws(()=>Spec.validateConfirmedSpec(bad),'overlap or reversed confirmed tables rejected');}
const confirmedModel = Spec.resolveConfirmedModel(confirmedFile);
assert.equal(ConcreteStrengthNdtCore.calculate({...empty,core:[core('F1','Z1',188.49555921538757)]},{model:{...Spec.defaultModel()}}).ok,false,'counterfeit model rejected');
const confirmedResult = ConcreteStrengthNdtCore.calculate({
  ...empty, project: { ...empty.project, number: 'P-1', instrumentModel: 'Model-X', concreteDescription: '指定樓層梁混凝土' },
  rebound: ['Z1', 'Z2', 'Z3'].map((zone, index) => ({ id: 'R' + index, zone, readings: repeated(10), angleDeg: 0 })),
  ultrasonic: ['Z1', 'Z2', 'Z3'].map((zone, index) => ({ id: 'U' + index, zone, velocityKmS: 3 })),
  core: [
    core('C1', 'Z1', 188.49555921538757), core('C2', 'Z2', 188.49555921538757), core('C3', 'Z3', 188.49555921538757)
  ]
}, { model: confirmedModel });
assert.equal(confirmedResult.ok, true);
approx(confirmedResult.methods.rebound.rows[0].strengthMpa, 3.2, 'confirmed rebound curve and delta-R table are used');
approx(confirmedResult.methods.ultrasonic.rows[0].strengthMpa, 6, 'confirmed UPV curve is used');
assert.equal(confirmedResult.methods.ultrasonic.rows[0].qualityGrade, '確認級');
assert.equal(confirmedResult.methods.core.stats.characteristicK, 2, 'confirmed characteristic table is used');
assert.equal(confirmedResult.formalAttachmentEligible, false, 'confirmed settings do not grant formal attachment eligibility');
assert.equal(ConcreteStrengthNdtCore.calculate({...empty,project:{...empty.project,number:'P-wrong',instrumentModel:'Model-X',concreteDescription:'指定樓層梁混凝土'},core:[core('FW','ZW',188.49555921538757)]},{model:confirmedModel}).ok,false,'confirmed model rejects a different project');
assert.equal(ConcreteStrengthNdtCore.calculate({...empty,project:{...empty.project,number:'P-1',instrumentModel:'Wrong-model'},core:[core('FI','ZI',188.49555921538757)]},{model:confirmedModel}).ok,false,'confirmed model rejects a different instrument');
assert.equal(ConcreteStrengthNdtCore.calculate({...empty,project:{...empty.project,number:'P-1',instrumentModel:'Model-X',concreteDescription:'指定樓層梁混凝土'},core:[core('FS','ZS',188.49555921538757)]},{model:{...confirmedModel},spec:{...Spec,isConfirmedModel:()=>true}}).ok,false,'options cannot replace the closed schema authority');
const changedConfirmed=ConcreteStrengthNdtCore.calculate({...empty,project:{...empty.project,number:'P-1',instrumentModel:'Model-X',concreteDescription:'指定樓層梁混凝土'},rebound:[{id:'RO',zone:'ZO',readings:repeated(10),angleDeg:45,angleCorrectionOverrideDeltaR:2,curveType:'linear',curveCoefficients:{a:2,b:-10}}],ultrasonic:[],core:[core('CO','ZO',188.49555921538757,100,200,{lengthDiameter:1.2,diameter:0.9,moisture:1.1,drillingDamage:0.8})]},{model:confirmedModel});
assert.equal(changedConfirmed.ok,true);for(const row of changedConfirmed.methods.rebound.rows){assert.equal(row.assumed,true);assert.match(row.source,/user row override/);}for(const row of changedConfirmed.methods.core.rows){assert.equal(row.assumed,true);assert.match(row.source,/user factor override/);}
assert.ok(changedConfirmed.assumptions.some(item=>item.assumed&&item.label.includes('覆寫')),'confirmed-model row overrides enter pending assumption inventory');
assert.ok(changedConfirmed.statusGroups.pending.some(item=>item.includes('覆寫')),'confirmed-model row overrides are listed as pending');
assert.ok(confirmedResult.statusGroups.confirmed.length > 0);
const canonical=ConcreteStrengthNdtCore.calculate({...empty,designStrengthSource:undefined,core:[core('CAN','CAN-Z',188.49555921538757)]});
assert.equal(canonical.ok,true);assert.equal(canonical.input.designStrengthSource,'');assert.equal(JSON.stringify(canonical.input).includes('undefined'),false,'result input is JSON-safe');
assert.equal(ConcreteStrengthNdtCore.calculate({...empty,designStrengthMpa:undefined,core:[core('UN','UN-Z',188.49555921538757)]}).ok,false,'undefined required number is rejected');
assert.equal(ConcreteStrengthNdtCore.calculate({...empty,designStrengthMpa:[25],core:[core('ARR','ARR-Z',188.49555921538757)]}).ok,false,'array numeric coercion is rejected');
assert.equal(ConcreteStrengthNdtCore.calculate({...empty,designStrengthMpa:{value:25},core:[core('OBJ','OBJ-Z',188.49555921538757)]}).ok,false,'object numeric coercion is rejected');
for (const mutate of [
  value => { value.unexpected = true; },
  value => { value.assumptions.reboundCurve.assumed = true; },
  value => { delete value.assumptions.coreCorrections.values.moistureFactors; },
  value => { value.assumptions.ultrasonic.source = ''; }
]) {
  const invalid = JSON.parse(JSON.stringify(confirmedFile));
  mutate(invalid);
  assert.throws(() => Spec.validateConfirmedSpec(invalid));
}

assert.equal(ConcreteStrengthNdtCore.calculate({...empty,project:{...empty.project,number:'P-1',instrumentModel:'Model-X',concreteDescription:'不同樓層柱混凝土'},core:[core('FC','ZC',188.49555921538757)]},{model:confirmedModel}).ok,false,'confirmed model rejects a different concrete reference');


// T47：舊 JSON 與報告計算指紋相容性固定案例。
{
  const compatFs = require('node:fs');
  const compatPath = require('node:path');
  const compatVm = require('node:vm');
  const compatRoot = compatPath.resolve(__dirname, '../..');
  const compatUtilsSource = compatFs.readFileSync(compatPath.join(compatRoot, 'core/ui/report-utils.js'), 'utf8');
  const compatReportSource = compatFs.readFileSync(compatPath.join(compatRoot, 'core/ui/report.js'), 'utf8');
  const compatHtml = compatFs.readFileSync(compatPath.join(__dirname, 'concrete-strength-ndt.html'), 'utf8');
  const compatReport = compatVm.createContext({ console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Set, Map, URL, URLSearchParams });
  compatReport.window = compatReport;
  compatReport.globalThis = compatReport;
  compatVm.runInContext(compatUtilsSource, compatReport, { filename: 'report-utils.js' });
  compatVm.runInContext(compatReportSource, compatReport, { filename: 'report.js' });
  const compatUI = compatReport.ToolReportUI;
  assert.ok(compatUI && typeof compatUI.buildReportTrace === 'function');

  function compatFunction(name, nextName) {
    const start = compatHtml.indexOf(`    function ${name}(`);
    const end = compatHtml.indexOf(`\n    function ${nextName}(`, start);
    assert.ok(start >= 0 && end > start, `NDT page function ${name} exists`);
    return compatHtml.slice(start, end).trim();
  }
  const compatFns = [
    compatFunction('fingerprintResult', 'buildMethodDetails'),
    compatFunction('caseFingerprint', 'captureCaseUi')
  ];
  const compatPage = compatVm.createContext({ ReportUI: compatUI, Core: ConcreteStrengthNdtCore, Object, String, Date, JSON, Array, Math });
  compatVm.runInContext(`${compatFns.join('\n')}\nthis.fingerprintResult=fingerprintResult;this.caseFingerprint=caseFingerprint;`, compatPage);

  const expected = {
    'rebound-only-three-zones': ['CF-73368035CCDB5611', 'CF-BD7744A8F53FE22C', 'CF-913F5B7CAEEA8F40'],
    'ultrasonic-only-three-zones': ['CF-BF8E30F48F5041D0', 'CF-E591DB2C3C5E8408', 'CF-28882358BF4C7CB4'],
    'core-only-three-zones': ['CF-311848A4A034DC50', 'CF-1FE6C481EF582595', 'CF-BCA88C0528C62349'],
    'all-three-methods-three-matched-zones': ['CF-D1C663B291C35FCE', 'CF-10169F3A419CD6E6', 'CF-9E8787F689A6BE62'],
    'rebound-outlier-trimmed-after-original-mean': ['CF-EA4857F1C9417455', 'CF-375571375BDE062B', 'CF-B5714CBBD0A8CB1F'],
    'core-four-correction-factors-explicit': ['CF-43F6AA993B0CD1DD', 'CF-3225D1F91A17422D', 'CF-8DE3A67DDD7CCFE1'],
    'rebound-nonzero-angle-deltaR-before-linear-curve': ['CF-E8DF66E9067CBB85', 'CF-C72638B3FCEF968F', 'CF-BE29BB9F5163D26B']
  };
  assert.equal(goldenCases.length, 7, 'historical golden count is unchanged');
  const expectedOldKeys = ['appliedModel','assumptions','checks','crossCheck','designStrengthMpa','designStrengthSource','designStrengthSourceStatus','formalAttachmentEligible','formulaSources','input','methods','ok','overallOk','pooled','project','provenance','reportDisposition','resultSchemaVersion','scope','state','statusGroups','summary','units','version','warnings'].sort();
  assert.match(compatHtml, /snapshot:\{mode,pageVersion: PUBLIC_TOOL_VERSION,calculationEngine: Core\.version,result:fingerprintResult\(result\)\}/,
    'report trace snapshot uses the NDT page-local legacy result projection');
  assert.match(compatHtml, /Object\.assign\(fingerprintResult\(result\),\{project,input:engineeringInput\}\)/,
    'case fingerprint uses the NDT page-local legacy result projection');

  for (const fixture of goldenCases) {
    const result = ConcreteStrengthNdtCore.calculate(fixture.input);
    assert.equal(result.ok, true, `${fixture.id} calculates`);
    assert.deepStrictEqual(Object.keys(result).sort(), [...expectedOldKeys, 'crossCheckCoverage'].sort(),
      `${fixture.id} adds only crossCheckCoverage at result top level`);
    assert.equal(result.resultSchemaVersion, 'concrete-strength-ndt.result.v0.1',
      `${fixture.id} keeps the existing result schema version`);
    assert.equal(Object.hasOwn(compatPage.fingerprintResult(result), 'crossCheckCoverage'), false,
      `${fixture.id} projection omits only the derived coverage key`);
    assert.equal(Object.keys(compatPage.fingerprintResult(result)).length, Object.keys(result).length - 1,
      `${fixture.id} projection preserves every other result field`);

    const [caseFingerprint, summaryTrace, detailedTrace] = expected[fixture.id];
    assert.ok(caseFingerprint, `${fixture.id} historical fingerprint fixture exists`);
    assert.equal(compatPage.caseFingerprint(result.input, result), caseFingerprint,
      `${fixture.id} old caseFingerprint remains stable`);
    for (const [mode, expectedFingerprint] of [['summary', summaryTrace], ['detailed', detailedTrace]]) {
      const reportTrace = compatUI.buildReportTrace({
        title: '混凝土強度非破壞檢測推估',
        outputSource: { tool: '混凝土強度非破壞檢測推估', version: 'V0.1' },
        snapshot: { mode, pageVersion: 'V0.1', calculationEngine: ConcreteStrengthNdtCore.version,
          result: compatPage.fingerprintResult(result) }
      });
      assert.equal(reportTrace.calculationFingerprint, expectedFingerprint,
        `${fixture.id} ${mode} report trace remains stable`);
    }
  }
}



console.log('concrete-strength-ndt-core.test.js: all assertions passed.');
