const assert = require('node:assert/strict');
const Flexure = require('./flexure.js');

const near = (actual, expected, tolerance = 1e-12) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

near(Flexure.yieldStrain(4200), 0.002);
near(Flexure.tensionControlledStrainLimit(4200), 0.005);
near(Flexure.tensionControlledStrainLimit(5600), 5600 / 2.04e6 + 0.003);
assert.equal(Flexure.isTensionControlled(0.005, 4200), true);
assert.equal(Flexure.isTensionControlled(0.005, 5600), false);
near(Flexure.phiFlexure(0.005, 4200), 0.9);
assert.ok(Flexure.phiFlexure(0.005, 5600) < 0.9, 'high-strength steel must use εty+0.003 instead of fixed 0.005');

const asMin5600 = Flexure.asMinFlexure(40, 55, 280, 5600);
const asMin7000 = Flexure.asMinFlexure(40, 55, 280, 7000);
near(asMin5600, 5.5);
near(asMin7000, asMin5600);

console.log('flexure.test.js: PASS');
