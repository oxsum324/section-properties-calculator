const assert = require('node:assert/strict');
const EquipmentLoadCore = require('./equipment-load-core.js');

const baseInput = {
  equipmentWeight: 12,
  fluidWeight: 2,
  accessoryWeight: 1,
  dynamicFactor: 1.1,
  supportCount: 4,
  contactB: 0.25,
  contactL: 0.25,
  spreadDepth: 0.15,
  planB: 2.4,
  planL: 1.2,
  allowableContact: 100,
  allowableSpread: 20,
  allowablePoint: 5,
  horizontalCoeff: 0.2
};

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} ~= ${expected} within ${tolerance}`
  );
}

{
  const r = EquipmentLoadCore.calculate(baseInput);
  approx(r.serviceWeight, 15);
  approx(r.designWeight, 16.5);
  approx(r.pointLoad, 4.125);
  approx(r.qContact, 66);
  approx(r.spreadB, 0.55);
  approx(r.spreadAreaEach, 0.30250000000000005);
  approx(r.qSpread, 13.636363636363633);
  approx(r.qEquivalent, 5.729166666666667);
  approx(r.horizontalTotal, 3.3000000000000003);
  approx(r.horizontalPerSupport, 0.8250000000000001);
  assert.equal(r.contactOk, true);
  assert.equal(r.spreadOk, true);
  assert.equal(r.pointOk, true);
  assert.equal(r.overallOk, true);
}

{
  const r = EquipmentLoadCore.calculate({
    ...baseInput,
    contactB: 0.1,
    contactL: 0.1,
    spreadDepth: 0,
    allowableContact: 50,
    allowableSpread: 20
  });
  approx(r.qContact, 412.49999999999994);
  approx(r.qSpread, 412.49999999999994);
  assert.equal(r.contactOk, false);
  assert.equal(r.spreadOk, false);
  assert.equal(r.overallOk, false);
}

{
  const r = EquipmentLoadCore.calculate({
    ...baseInput,
    allowablePoint: 0
  });
  assert.equal(r.pointOk, null);
  assert.equal(r.pointUtil, null);
  assert.equal(r.overallOk, true);
}

{
  const errors = EquipmentLoadCore.validateInput({
    ...baseInput,
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
