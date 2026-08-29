const assert = require('node:assert/strict');
const RcColumnCoverDeviationCore = require('./column-cover-deviation-core.js');
const goldenCases = require('./column-cover-deviation-golden-cases.js');

function approx(actual, expected, tolerance = 1e-8) {
  assert.ok(Number.isFinite(actual), `actual value must be finite: ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} ~= ${expected} within ${tolerance}`);
}

assert.equal(goldenCases.length, 5);
assert.equal(RcColumnCoverDeviationCore.version, '0.1.0');

for (const goldenCase of goldenCases) {
  assert.deepEqual(RcColumnCoverDeviationCore.validateInput(goldenCase.input), [], `${goldenCase.id} validation`);
  const result = RcColumnCoverDeviationCore.calculate(goldenCase.input);
  approx(result.minimumRetentionRatio, goldenCase.expected.values.minimumRetentionRatio);
  approx(result.maximumMeasuredUtilization, goldenCase.expected.values.maximumMeasuredUtilization);
  approx(result.barLayout.totalBars, goldenCase.expected.values.totalBars);
  approx(result.barLayout.steelRatio, goldenCase.expected.values.steelRatio);
  approx(result.measurement.conversionOffsetMm, goldenCase.expected.values.conversionOffsetMm);
  Object.entries(goldenCase.expected.flags).forEach(([key, expected]) => assert.equal(result[key], expected, `${goldenCase.id}.${key}`));
  assert.equal(result.criticalRetentionDirection, goldenCase.expected.criticalRetentionDirection);
  assert.equal(result.governingDemandDirection, goldenCase.expected.governingDemandDirection);
  Object.entries(goldenCase.expected.measuredPhiMn).forEach(([key, expected]) => {
    approx(result.directions.find(direction => direction.key === key).measured.phiMnTfm, expected);
  });
  assert.equal(result.barLayout.cornerBarsCountedOnce, true);
  assert.equal(result.calculationPolicy.enhancedExistingStructurePhiApplied, false);
  assert.equal(result.calculationPolicy.coverComplianceEvaluated, false);
  assert.deepEqual(result.provenance, RcColumnCoverDeviationCore.provenance());
}

{
  const direct = RcColumnCoverDeviationCore.calculate(goldenCases[0].input);
  const converted = RcColumnCoverDeviationCore.calculate(goldenCases[1].input);
  ['top', 'bottom', 'left', 'right'].forEach(face => {
    approx(converted.measurement.measuredCentersMm[face], direct.measurement.measuredCentersMm[face], 1e-12);
  });
  approx(converted.measurement.conversionOffsetMm, 10 + 25.4 / 2, 1e-12);
  assert.equal(converted.measurement.conversionFormula, 'c_center = c_clear + d_tie + d_bar/2');
}

{
  const cornerCase = RcColumnCoverDeviationCore.calculate(goldenCases[4].input);
  assert.equal(cornerCase.barLayout.totalBars, 2 * 3 + 2 * 0);
  assert.equal(cornerCase.layouts.design.bars.filter(bar => /^T|^B/.test(bar.id)).length, 6);
  assert.equal(cornerCase.layouts.design.bars.filter(bar => /^L|^R/.test(bar.id)).length, 0);
  approx(cornerCase.barLayout.totalSteelAreaCm2, 6 * 3.871, 1e-12);
}

{
  const invalid = { ...goldenCases[0].input, measurementMode: 'unknown', measurementBasis: '量測基準不明' };
  const errors = RcColumnCoverDeviationCore.validateInput(invalid);
  assert.ok(errors.some(message => message.includes('量測基準必須明確選擇')));
  assert.ok(errors.some(message => message.includes('鋼筋位置量測依據不足')));
  assert.throws(() => RcColumnCoverDeviationCore.calculate(invalid), /量測基準/);
}

{
  const explicitBadNumber = { ...goldenCases[0].input, fcKgfCm2: '不是數字', barsPerTopBottomFace: '四支' };
  const normalized = RcColumnCoverDeviationCore.normalizeInput(explicitBadNumber);
  assert.equal(Number.isNaN(normalized.fcKgfCm2), true, 'explicit nonnumeric fc must not fall back');
  assert.equal(Number.isNaN(normalized.barsPerTopBottomFace), true, 'explicit nonnumeric count must not fall back');
  const errors = RcColumnCoverDeviationCore.validateInput(explicitBadNumber);
  assert.ok(errors.some(message => message.includes("fc'")));
  assert.ok(errors.some(message => message.includes('每面主筋支數')));
}

{
  const negativeMoment = { ...goldenCases[0].input, muXNegativeTfm: -22 };
  assert.equal(RcColumnCoverDeviationCore.normalizeInput(negativeMoment).muXNegativeTfm, -22, 'negative moment magnitude must not be silently normalized');
  assert.ok(RcColumnCoverDeviationCore.validateInput(negativeMoment).some(message => message.includes('muXNegativeTfm 必須為非負有限數值')));
  assert.throws(() => RcColumnCoverDeviationCore.calculate(negativeMoment), /muXNegativeTfm 必須為非負有限數值/);

  const infiniteElasticModulus = { ...goldenCases[0].input, esKgfCm2: Infinity };
  assert.ok(RcColumnCoverDeviationCore.validateInput(infiniteElasticModulus).some(message => message.includes('Es 本版依規範 20.2.2.2 固定採')));
  assert.throws(() => RcColumnCoverDeviationCore.calculate(infiniteElasticModulus), /Es 本版依規範 20.2.2.2 固定採/);

  const factorTenElasticModulus = { ...goldenCases[0].input, esKgfCm2: 204000 };
  assert.ok(RcColumnCoverDeviationCore.validateInput(factorTenElasticModulus).some(message => message.includes('2,040,000')));
  assert.throws(() => RcColumnCoverDeviationCore.calculate(factorTenElasticModulus), /2,040,000/);

  const factorTenYieldStrength = { ...goldenCases[0].input, fyKgfCm2: 420 };
  assert.ok(RcColumnCoverDeviationCore.validateInput(factorTenYieldStrength).some(message => message.includes('2,000～5,600')));
  assert.throws(() => RcColumnCoverDeviationCore.calculate(factorTenYieldStrength), /2,000～5,600/);
}

{
  const centersInsideBarRadius = { ...goldenCases[0].input, measuredTopMm: 10 };
  assert.ok(RcColumnCoverDeviationCore.validateInput(centersInsideBarRadius).some(message => message.includes('不得小於主筋半徑')));
  const crowdedBars = { ...goldenCases[0].input, sectionWidthMm: 200, designCenterLeftMm: 20, designCenterRightMm: 20, measuredLeftMm: 20, measuredRightMm: 20, barsPerTopBottomFace: 30 };
  assert.ok(RcColumnCoverDeviationCore.validateInput(crowdedBars).some(message => message.includes('沿面相鄰主筋中心距')));
  const excessiveSteel = { ...goldenCases[0].input, sectionWidthMm: 200, sectionDepthMm: 200, designCenterTopMm: 20, designCenterBottomMm: 20, designCenterLeftMm: 20, designCenterRightMm: 20, measuredTopMm: 20, measuredBottomMm: 20, measuredLeftMm: 20, measuredRightMm: 20, barAreaCm2: 25, barsPerTopBottomFace: 8, intermediateBarsPerSide: 0, mainBarDiameterMm: 10 };
  assert.ok(RcColumnCoverDeviationCore.validateInput(excessiveSteel).some(message => message.includes('Ast=')));

  const negativeRawClearCover = { ...goldenCases[0].input, measurementMode: 'clear-cover', measuredTopMm: -1 };
  assert.ok(RcColumnCoverDeviationCore.validateInput(negativeRawClearCover).some(message => message.includes('原始輸入必須為大於 0')));
  assert.throws(() => RcColumnCoverDeviationCore.calculate(negativeRawClearCover), /原始輸入必須為大於 0/);

  const pairedFactorTenBarTypo = { ...goldenCases[0].input, mainBarDiameterMm: 2.54, barAreaCm2: 0.05067 };
  assert.ok(RcColumnCoverDeviationCore.validateInput(pairedFactorTenBarTypo).some(message => message.includes('db 必須為 6～80')));
  assert.throws(() => RcColumnCoverDeviationCore.calculate(pairedFactorTenBarTypo), /db 必須為 6～80/);

  const factorTenTieTypo = { ...goldenCases[0].input, stirrupDiameterMm: 1 };
  assert.ok(RcColumnCoverDeviationCore.validateInput(factorTenTieTypo).some(message => message.includes('dtie 必須為 4～40')));
  assert.throws(() => RcColumnCoverDeviationCore.calculate(factorTenTieTypo), /dtie 必須為 4～40/);
}

{
  const mismatchedBar = { ...goldenCases[0].input, mainBarDiameterMm: 16, barAreaCm2: 5.067 };
  const errors = RcColumnCoverDeviationCore.validateInput(mismatchedBar);
  assert.ok(errors.some(message => message.includes('主筋面積與直徑不一致')));
  assert.ok(errors.some(message => message.includes('超過 5%')));
  assert.throws(() => RcColumnCoverDeviationCore.calculate(mismatchedBar), /主筋面積與直徑不一致/);
}

{
  const missingEvidence = RcColumnCoverDeviationCore.normalizeInput({});
  const errors = RcColumnCoverDeviationCore.validateInput(missingEvidence);
  ['臨界斷面尺寸量測依據不足', '材料強度依據不足', '鋼筋位置量測依據不足', '需求內力來源依據不足'].forEach(needle => {
    assert.ok(errors.some(message => message.includes(needle)), `validation includes ${needle}`);
  });
}

{
  const mirroredInput = { ...goldenCases[0].input, measuredTopMm: 65, measuredBottomMm: 80, measuredLeftMm: 65, measuredRightMm: 70 };
  const original = RcColumnCoverDeviationCore.calculate(goldenCases[0].input);
  const mirrored = RcColumnCoverDeviationCore.calculate(mirroredInput);
  approx(mirrored.directions.find(item => item.key === 'mxNegative').measured.phiMnTfm, original.directions.find(item => item.key === 'mxPositive').measured.phiMnTfm, 1e-8);
  approx(mirrored.directions.find(item => item.key === 'myNegative').measured.phiMnTfm, original.directions.find(item => item.key === 'myPositive').measured.phiMnTfm, 1e-8);
}

console.log('RC column cover deviation core regression OK');
