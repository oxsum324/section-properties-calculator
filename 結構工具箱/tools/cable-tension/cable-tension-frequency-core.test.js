const assert = require('node:assert/strict');
const CableTensionFrequencyCore = require('./cable-tension-frequency-core.js');
const goldenCases = require('./cable-tension-frequency-golden-cases.js');

function approx(actual, expected, tolerance = 1e-9) {
  if (expected === null) {
    assert.equal(actual, null);
    return;
  }
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} ~= ${expected} within ${tolerance}`
  );
}

function checkStatusMap(result) {
  return Object.fromEntries(result.checks.map((check) => [check.key, check.status]));
}

assert.equal(goldenCases.length, 6);
assert.equal(CableTensionFrequencyCore.version, '0.1.0');
assert.equal(CableTensionFrequencyCore.inputSchemaVersion, 'cable-tension-frequency.input.v0.1');
assert.equal(CableTensionFrequencyCore.resultSchemaVersion, 'cable-tension-frequency.result.v0.1');
assert.ok(CableTensionFrequencyCore.logicSignature.startsWith('cable-tension-frequency-core:v0.1'));
assert.equal(CableTensionFrequencyCore.method.equation, 'f_n = n/(2L) × sqrt(T/m)');

for (const goldenCase of goldenCases) {
  const result = CableTensionFrequencyCore.calculate(goldenCase.input);
  const expected = goldenCase.expected;

  for (const [key, value] of Object.entries(expected.fit)) {
    approx(result.fit[key], value, 1e-9);
  }
  assert.equal(result.measurements.length, expected.measurementTensionKn.length, `${goldenCase.id}.measurement count`);
  expected.measurementTensionKn.forEach((value, index) => {
    approx(result.measurements[index].tensionKn, value, 1e-9);
  });
  expected.measurementFrequencyDeviationPct.forEach((value, index) => {
    approx(result.measurements[index].frequencyDeviationPct, value, 1e-9);
  });
  if (expected.measurementNotes) {
    assert.deepEqual(result.measurements.map((measurement) => measurement.note), expected.measurementNotes);
  }
  for (const [key, value] of Object.entries(expected.target)) {
    if (typeof value === 'number' || value === null) approx(result.target[key], value, 1e-9);
    else assert.equal(result.target[key], value, `${goldenCase.id}.target.${key}`);
  }
  assert.deepEqual(checkStatusMap(result), expected.checkStatuses, `${goldenCase.id}.checks`);
  assert.equal(result.overallOk, expected.overallOk, `${goldenCase.id}.overallOk`);
  assert.equal(result.summary.status, expected.overallOk ? 'pass' : 'fail', `${goldenCase.id}.summary.status`);
  assert.ok(result.summary.headline.length > 10, `${goldenCase.id}.summary.headline`);
  assert.ok(result.summary.primaryMetrics.length >= 3, `${goldenCase.id}.summary.primaryMetrics`);
  assert.ok(result.checks.length >= 3, `${goldenCase.id}.checks.length`);
  assert.equal(result.resultSchemaVersion, CableTensionFrequencyCore.resultSchemaVersion);
  assert.deepEqual(result.provenance, CableTensionFrequencyCore.provenance());
  assert.equal(result.input.effectiveLengthBasis, goldenCase.input.effectiveLengthBasis.trim());
  assert.equal(result.input.massBasis, goldenCase.input.massBasis.trim());
  assert.equal(result.input.frequencyBasis, goldenCase.input.frequencyBasis.trim());
  assert.equal(result.input.harmonicToleranceBasis, goldenCase.input.harmonicToleranceBasis.trim());
  assert.equal(
    result.input.targetTensionBasis,
    goldenCase.input.targetTensionKn === '' || goldenCase.input.targetTensionKn == null
      ? ''
      : goldenCase.input.targetTensionBasis.trim()
  );
}

{
  const result = CableTensionFrequencyCore.calculate(goldenCases.find(
    (item) => item.id === 'inconsistent-harmonics-fail'
  ).input);
  // a = [1(5) + 2(11)] / (1² + 2²) = 27/5 = 5.4 Hz.
  approx(result.fit.fundamentalFrequencyHz, 5.4);
  approx(result.measurements[0].predictedFrequencyHz, 5.4);
  approx(result.measurements[1].predictedFrequencyHz, 10.8);
  approx(result.fit.tensionKn, 4 * 2 * (10 ** 2) * (5.4 ** 2) / 1000);
  assert.equal(result.checks.find((check) => check.key === 'harmonic-consistency').status, 'fail');
  assert.ok(result.summary.headline.includes('諧波一致性'));
}

{
  const source = {
    ...goldenCases[0].input,
    effectiveLengthBasis: '  錨頭中心間自由振動長度  ',
    massBasis: '  供應商型錄  ',
    frequencyBasis: '  加速度計 FFT 峰值  ',
    targetTensionKn: 20,
    targetTolerancePct: '',
    targetTensionBasis: '  張拉計畫 CT-T03：目標 20 kN，容許差 10%  '
  };
  const normalized = CableTensionFrequencyCore.normalizeInput(source);
  assert.equal(normalized.effectiveLengthBasis, '錨頭中心間自由振動長度');
  assert.equal(normalized.massBasis, '供應商型錄');
  assert.equal(normalized.frequencyBasis, '加速度計 FFT 峰值');
  assert.equal(normalized.targetTolerancePct, 10);
  assert.equal(normalized.targetTensionBasis, '張拉計畫 CT-T03：目標 20 kN，容許差 10%');
  assert.equal(source.effectiveLengthBasis, '  錨頭中心間自由振動長度  ', 'normalizeInput does not mutate caller input');
}

{
  const blankTarget = CableTensionFrequencyCore.calculate({
    ...goldenCases[0].input,
    targetTensionKn: '   ',
    targetTolerancePct: 5
  });
  assert.equal(blankTarget.input.targetTensionKn, null);
  assert.equal(blankTarget.input.targetTolerancePct, null);
  assert.equal(blankTarget.target.provided, false);

  const zeroTargetErrors = CableTensionFrequencyCore.validateInput({
    ...goldenCases[0].input,
    targetTensionKn: 0,
    targetTolerancePct: 5
  });
  assert.ok(zeroTargetErrors.some((message) => message.includes('targetTensionKn')));
}

{
  const exampleResult = CableTensionFrequencyCore.calculate({
    ...goldenCases[0].input,
    effectiveLengthBasis: '示例資料（請依專案覆寫）：兩端有效振動固定點間距',
    massBasis: '示例資料（請依專案覆寫）：整體線質量',
    frequencyBasis: '示例資料（請依專案覆寫）：FFT 峰值',
    assumptionConfirmed: true
  });
  const provenanceCheck = exampleResult.checks.find(
    (check) => check.key === 'project-data-provenance'
  );
  assert.equal(provenanceCheck.status, 'fail');
  assert.ok(provenanceCheck.detail.includes('缺乏可追溯專案依據'));
  assert.equal(exampleResult.overallOk, false);
  assert.ok(exampleResult.summary.headline.includes('尚未可追溯'));
}

{
  const errors = CableTensionFrequencyCore.validateInput({
    effectiveLengthM: 0,
    effectiveLengthBasis: ' ',
    massPerLengthKgM: -1,
    massBasis: '',
    frequencyBasis: '',
    measurements: [],
    harmonicTolerancePct: 101
  });
  assert.equal(errors.length, 8);
  assert.ok(errors.some((message) => message.includes('effectiveLengthM')));
  assert.ok(errors.some((message) => message.includes('effectiveLengthBasis')));
  assert.ok(errors.some((message) => message.includes('massPerLengthKgM')));
  assert.ok(errors.some((message) => message.includes('massBasis')));
  assert.ok(errors.some((message) => message.includes('frequencyBasis')));
  assert.ok(errors.some((message) => message.includes('至少需要一筆')));
  assert.ok(errors.some((message) => message.includes('harmonicTolerancePct')));
  assert.ok(errors.some((message) => message.includes('harmonicToleranceBasis')));
}

{
  const errors = CableTensionFrequencyCore.validateInput({
    ...goldenCases[1].input,
    measurements: [
      { mode: 1, frequencyHz: 3, note: '第一次量測' },
      { mode: 1, frequencyHz: 3.1, note: '重複模態' }
    ]
  });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('mode=1 重複'));
  assert.throws(
    () => CableTensionFrequencyCore.calculate({
      ...goldenCases[1].input,
      measurements: [
        { mode: 1, frequencyHz: 3 },
        { mode: 1, frequencyHz: 3.1 }
      ]
    }),
    /每個模態只能輸入一筆代表頻率/
  );
}

{
  const errors = CableTensionFrequencyCore.validateInput({
    ...goldenCases[0].input,
    measurements: [
      { mode: 1.5, frequencyHz: 5 },
      { mode: 2, frequencyHz: 0 }
    ],
    targetTensionKn: -10,
    targetTolerancePct: -1
  });
  assert.equal(errors.length, 5);
  assert.ok(errors.some((message) => message.includes('模態編號')));
  assert.ok(errors.some((message) => message.includes('量測頻率')));
  assert.ok(errors.some((message) => message.includes('targetTensionKn')));
  assert.ok(errors.some((message) => message.includes('targetTolerancePct')));
  assert.ok(errors.some((message) => message.includes('targetTensionBasis')));
}

{
  const result = CableTensionFrequencyCore.calculate({
    ...goldenCases[0].input,
    effectiveLengthM: 20,
    massPerLengthKgM: 3
  });
  // Relative to the 10 m, 2 kg/m baseline, tension scales with mL².
  approx(result.fit.tensionKn, 20 * (3 / 2) * (20 / 10) ** 2);
  approx(result.fit.equivalentTf, result.fit.tensionKn / CableTensionFrequencyCore.standardGravity);
}

{
  assert.throws(
    () => CableTensionFrequencyCore.calculate({
      ...goldenCases[0].input,
      measurements: [{ mode: 0, frequencyHz: 5 }]
    }),
    /模態編號 mode 必須為正安全整數/
  );
}

{
  const invalidNumericCases = [
    ['effective length boolean', { effectiveLengthM: true }, 'effectiveLengthM'],
    ['mass object', { massPerLengthKgM: {} }, 'massPerLengthKgM'],
    ['mode boolean', { measurements: [{ mode: true, frequencyHz: 5 }] }, '模態編號'],
    ['frequency object', { measurements: [{ mode: 1, frequencyHz: {} }] }, '量測頻率'],
    ['mode array', { measurements: [{ mode: [1], frequencyHz: 5 }] }, '模態編號'],
    ['unsafe mode', { measurements: [{ mode: Number.MAX_SAFE_INTEGER + 1, frequencyHz: 5 }] }, '正安全整數'],
  ];
  for (const [label, patch, expectedMessage] of invalidNumericCases) {
    const errors = CableTensionFrequencyCore.validateInput({ ...goldenCases[0].input, ...patch });
    assert.ok(errors.some((message) => message.includes(expectedMessage)), `${label} fails closed: ${errors.join(' | ')}`);
  }
  assert.equal(Number.isNaN(CableTensionFrequencyCore.strictNumber(true)), true);
  assert.equal(Number.isNaN(CableTensionFrequencyCore.strictNumber({})), true);
  assert.equal(Number.isNaN(CableTensionFrequencyCore.strictNumber([1])), true);
  assert.equal(CableTensionFrequencyCore.strictNumber(' 1.25e2 '), 125);
  assert.equal(Number.isNaN(CableTensionFrequencyCore.strictNumber('0x10')), true);
}

{
  assert.throws(
    () => CableTensionFrequencyCore.calculate({
      ...goldenCases[0].input,
      effectiveLengthM: 1e308
    }),
    /反算索力 T\(N\) 必須為有限數值/
  );
  assert.throws(
    () => CableTensionFrequencyCore.calculate({
      ...goldenCases[0].input,
      effectiveLengthM: Number.MIN_VALUE,
      massPerLengthKgM: Number.MIN_VALUE,
      measurements: [{ mode: 1, frequencyHz: Number.MIN_VALUE }]
    }),
    /反算索力 T\(N\) 必須大於 0/
  );
  assert.throws(
    () => CableTensionFrequencyCore.calculate({
      ...goldenCases[0].input,
      measurements: [{ mode: 2, frequencyHz: 1e308 }]
    }),
    /Σ\(n·fₙ\).+必須為有限數值/
  );
}

{
  const invalidBasisCases = [
    ['effectiveLengthBasis', '待確認'],
    ['massBasis', 'N/A'],
    ['frequencyBasis', '不明'],
    ['harmonicToleranceBasis', '無資料'],
    ['effectiveLengthBasis', '短'],
  ];
  for (const [field, value] of invalidBasisCases) {
    const result = CableTensionFrequencyCore.calculate({ ...goldenCases[0].input, [field]: value });
    const check = result.checks.find((item) => item.key === 'project-data-provenance');
    assert.equal(check.status, 'fail', `${field}=${value} provenance fails`);
    assert.equal(result.overallOk, false, `${field}=${value} overall fails`);
    assert.ok(result.summary.headline.includes('尚未可追溯'), `${field}=${value} headline fails closed`);
  }
  ['未確認', '不適用', '無資料', 'NA', 'none', 'TBD', 'unknown', '暫估', 'placeholder', '七字太短'].forEach((value) => {
    assert.equal(CableTensionFrequencyCore.hasTraceableBasis(value), false, `${value} is not traceable basis`);
  });
  assert.equal(CableTensionFrequencyCore.hasTraceableBasis('現場量測紀錄 CT-L01：錨頭中心距'), true);
  const invalidTargetBasisResult = CableTensionFrequencyCore.calculate({
    ...goldenCases.find((item) => item.id === 'target-band-pass').input,
    targetTensionBasis: 'TBD'
  });
  assert.equal(invalidTargetBasisResult.checks.find((item) => item.key === 'project-data-provenance').status, 'fail');
  assert.equal(invalidTargetBasisResult.overallOk, false);
}

{
  const excessiveHarmonicToleranceErrors = CableTensionFrequencyCore.validateInput({
    ...goldenCases[1].input,
    harmonicTolerancePct: 100
  });
  assert.ok(excessiveHarmonicToleranceErrors.some((message) => message.includes('不得以放寬門檻掩蓋')));
  assert.throws(
    () => CableTensionFrequencyCore.calculate({
      ...goldenCases[1].input,
      measurements: [{ mode: 1, frequencyHz: 1 }, { mode: 2, frequencyHz: 100 }],
      harmonicTolerancePct: 100
    }),
    /harmonicTolerancePct/
  );
  const lowToleranceErrors = CableTensionFrequencyCore.validateInput({
    ...goldenCases[1].input,
    harmonicTolerancePct: 0.01
  });
  assert.ok(lowToleranceErrors.some((message) => message.includes('0.1%')));
  const missingHarmonicBasisErrors = CableTensionFrequencyCore.validateInput({
    ...goldenCases[1].input,
    harmonicToleranceBasis: ''
  });
  assert.ok(missingHarmonicBasisErrors.some((message) => message.includes('harmonicToleranceBasis')));
  const placeholderHarmonicBasis = CableTensionFrequencyCore.calculate({
    ...goldenCases[1].input,
    harmonicToleranceBasis: 'placeholder project criterion'
  });
  assert.equal(placeholderHarmonicBasis.overallOk, false);

  const missingTargetBasisErrors = CableTensionFrequencyCore.validateInput({
    ...goldenCases[0].input,
    targetTensionKn: 20,
    targetTolerancePct: 5
  });
  assert.ok(missingTargetBasisErrors.some((message) => message.includes('targetTensionBasis')));
  const excessiveTargetToleranceErrors = CableTensionFrequencyCore.validateInput({
    ...goldenCases[3].input,
    targetTolerancePct: 10.01
  });
  assert.ok(excessiveTargetToleranceErrors.some((message) => message.includes('targetTolerancePct')));
}

console.log('cable tension frequency core regression OK');
