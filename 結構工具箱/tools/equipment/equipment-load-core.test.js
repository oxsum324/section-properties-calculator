const assert = require('node:assert/strict');
const EquipmentLoadCore = require('./equipment-load-core.js');
const goldenCases = require('./equipment-load-golden-cases.js');

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

assert.equal(goldenCases.length, 4);

for (const goldenCase of goldenCases) {
  const r = EquipmentLoadCore.calculate(goldenCase.input);

  for (const [key, expected] of Object.entries(goldenCase.expected.values)) {
    approx(r[key], expected);
  }

  for (const [key, expected] of Object.entries(goldenCase.expected.flags)) {
    assert.equal(r[key], expected, `${goldenCase.id}.${key}`);
  }
}

{
  const r = EquipmentLoadCore.calculate({
    ...goldenCases[0].input,
    concreteFc: 280,
    concreteThickness: 0.2,
    effectiveDepth: 0.16,
    bearingSupportB: 0.8,
    bearingSupportL: 0.8,
    concretePhiBearing: 0.65,
    concretePhiShear: 0.75,
    punchingPosition: 'interior',
    steelPlateB: 0.45,
    steelPlateL: 0.45,
    steelPlateThickness: 0.012,
    steelFy: 2450,
    steelPhiFlexure: 0.9
  });
  assert.equal(r.concreteBearingOk, true);
  assert.equal(r.punchingOk, true);
  assert.equal(r.steelPlateOk, true);
  approx(r.concreteBearingDesign, 193.375);
  assert.ok(r.punchingDesignShear > r.pointLoad);
  assert.ok(r.steelPlateRequiredThickness > 0.005);
  assert.ok(r.steelPlateRequiredThickness < 0.006);
  assert.equal(r.governingCheck.key, 'point-load');
}

{
  const errors = EquipmentLoadCore.validateInput({
    ...goldenCases[0].input,
    equipmentWeight: 0,
    fluidWeight: 0,
    accessoryWeight: 0,
    supportCount: 2.5,
    contactB: 0,
    allowablePoint: -1
  });
  assert.equal(errors.length, 4);
  assert.ok(errors.some(msg => msg.includes('設備總重量')));
  assert.ok(errors.some(msg => msg.includes('支承點數')));
  assert.ok(errors.some(msg => msg.includes('接觸尺寸')));
  assert.ok(errors.some(msg => msg.includes('容許單點反力')));
}

console.log('equipment load core regression OK');
