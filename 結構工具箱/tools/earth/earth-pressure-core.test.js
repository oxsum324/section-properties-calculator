const assert = require('node:assert/strict');
const EarthPressureCore = require('./earth-pressure-core.js');
const goldenCases = require('./earth-pressure-golden-cases.js');

function approx(actual, expected, tolerance = 1e-9) {
  if (!Number.isFinite(expected)) {
    assert.equal(actual, expected);
    return;
  }
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} ~= ${expected} within ${tolerance}`
  );
}

assert.equal(goldenCases.length, 4);

for (const goldenCase of goldenCases) {
  const r = EarthPressureCore.calculate(goldenCase.input);

  for (const [key, expected] of Object.entries(goldenCase.expected.values)) {
    approx(r[key], expected);
  }

  for (const [key, expected] of Object.entries(goldenCase.expected.flags)) {
    assert.equal(r[key], expected, `${goldenCase.id}.${key}`);
  }
}

{
  const r = EarthPressureCore.calculate(goldenCases[0].input);
  assert.equal(r.modeLabel, '主動土壓 Ka');
  approx(r.Ka, 0.33333333333333337);
  approx(r.K0, 0.5);
}

{
  const r = EarthPressureCore.calculate(goldenCases[1].input);
  assert.equal(r.modeLabel, '靜止土壓 K0');
  approx(r.K, 0.5);
}

{
  const errors = EarthPressureCore.validateInput({
    ...goldenCases[0].input,
    H: 0,
    phiDeg: 60,
    waterDepth: 3,
    verticalLoad: 0,
    fsSlideReq: 0
  });
  assert.equal(errors.length, 5);
  assert.ok(errors.some(msg => msg.includes('高度')));
  assert.ok(errors.some(msg => msg.includes('內摩擦角')));
  assert.ok(errors.some(msg => msg.includes('地下水')));
  assert.ok(errors.some(msg => msg.includes('垂直穩定重量')));
  assert.ok(errors.some(msg => msg.includes('安全係數')));
}

console.log('earth pressure core regression OK');
