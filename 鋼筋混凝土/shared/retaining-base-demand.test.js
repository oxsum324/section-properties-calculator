const assert = require('assert');
const Demand = require('./retaining-base-demand.js');

function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: actual must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

const pressure = Demand.pressureFromEquilibrium(12, 18, 3);
near(pressure.resultantX, 1.5, 1e-12, 'centred resultant');
near(pressure.toe, 4, 1e-12, 'centred toe pressure');
near(pressure.heel, 4, 1e-12, 'centred heel pressure');

const result = Demand.evaluate({
  geometry: { toeLength: 1, stemThickness: 0.3, heelLength: 1.5, effectiveDepth: 0.417 },
  loads: {
    deadVertical: 11.91,
    deadMomentAboutToe: 20.6115,
    lateralMoment: 2.6041666666666665,
    baseUnitWeight: 1.2,
    heelSoilUnitWeight: 4.5,
    heelSurchargeUnitWeight: 1
  }
});

assert.equal(result.schema, 'rc-retaining-base-demand.v1');
assert.equal(result.assumptions.favorablePassiveMomentIncluded, false, 'base strength demand omits favorable passive moment');
assert.equal(result.contactOk, true, 'all service and strength combinations remain in full contact');
assert.equal(result.toe.demandFace, 'bottom', 'toe upward reaction demands bottom steel');
assert.equal(result.heel.demandFace, 'top', 'heel downward net load demands top steel');
near(result.servicePressure.toe, 3.2331632653061226, 1e-9, 'service toe pressure');
near(result.servicePressure.heel, 5.273979591836735, 1e-9, 'service heel pressure');
near(result.toe.moment, 1.5557155004859093, 1e-9, 'toe factored moment');
near(result.toe.shear, 1.822269053503098, 1e-9, 'toe factored shear at d');
near(result.heel.moment, 1.6159370444606418, 1e-9, 'heel factored moment');
near(result.heel.shear, 1.607653607416181, 1e-9, 'heel factored shear at d');

assert.throws(
  () => Demand.evaluate({ geometry: { toeLength: 0, stemThickness: 0.3, heelLength: 1.5, effectiveDepth: 0.4 }, loads: {} }),
  /趾版長\s*必須大於 0/,
  'invalid geometry fails closed'
);

console.log('retaining base demand unit tests OK');
