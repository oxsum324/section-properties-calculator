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

assert.equal(goldenCases.length, 6);

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
  const r = EquipmentLoadCore.calculate(goldenCases.find(item => item.id === 'eccentric-four-support-pass').input);
  assert.deepEqual(r.supportReactions.map(item => item.id), ['R1', 'R2', 'R3', 'R4']);
  r.supportReactions.forEach(item => assert.ok(item.value > 0));
  approx(r.reactionSum, r.designWeight);
  approx(r.reactionEquilibriumMomentX, r.reactionMomentX);
  approx(r.reactionEquilibriumMomentY, r.reactionMomentY);
  assert.equal(r.maximumReactionSupportId, 'R3');
  assert.equal(r.minimumReactionSupportId, 'R1');
  assert.equal(r.pointLoad, r.maximumReaction);
  assert.equal(r.checks[0].key, 'support-reaction');
}

{
  const r = EquipmentLoadCore.calculate(goldenCases.find(item => item.id === 'eccentric-four-support-uplift').input);
  assert.ok(r.minimumReaction < 0);
  assert.equal(r.minimumReactionSupportId, 'R4');
  assert.equal(r.reactionOk, false);
  assert.equal(r.overallOk, false);
  assert.equal(r.governingCheck.key, 'support-reaction');
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
  assert.ok(errors.some(msg => msg.includes('容許支承反力上限')));
}

{
  const errors = EquipmentLoadCore.validateInput({
    ...goldenCases[0].input,
    reactionMode: 'eccentric-rectangular-4',
    supportCount: 6,
    supportSpacingX: 0,
    supportSpacingY: 1
  });
  assert.ok(errors.some(msg => msg.includes('支承點數必須為 4')));
  assert.ok(errors.some(msg => msg.includes('支點間距')));
}

{
  const unknownModeErrors = EquipmentLoadCore.validateInput({
    ...goldenCases[0].input,
    reactionMode: 'future-unsupported-mode'
  });
  assert.ok(unknownModeErrors.some(msg => msg.includes('不支援的垂直反力模式')));

  const geometryErrors = EquipmentLoadCore.validateInput({
    ...goldenCases[0].input,
    reactionMode: 'eccentric-rectangular-4',
    supportCount: 4,
    supportSpacingX: 2.5,
    supportSpacingY: 1.3,
    contactB: 0.25,
    contactL: 0.25,
    planB: 2.4,
    planL: 1.2
  });
  assert.ok(geometryErrors.some(msg => msg.includes('X 向支點間距 Sx')));
  assert.ok(geometryErrors.some(msg => msg.includes('Y 向支點間距 Sy')));
}

console.log('equipment load core regression OK');
