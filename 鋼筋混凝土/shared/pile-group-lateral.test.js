const assert = require('assert');
const Lateral = require('./pile-group-lateral.js');

function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: actual must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

near(Lateral.rowMultiplier(3, 1, 3), 0.8, 1e-12, '3D front row');
near(Lateral.rowMultiplier(3, 2, 3), 0.4, 1e-12, '3D second row');
near(Lateral.rowMultiplier(3, 3, 3), 0.3, 1e-12, '3D trailing row');
near(Lateral.rowMultiplier(4, 1, 3), 0.9, 1e-12, '4D front row interpolation');
near(Lateral.rowMultiplier(4, 2, 3), 0.625, 1e-12, '4D second row interpolation');
near(Lateral.rowMultiplier(4, 3, 3), 0.5, 1e-12, '4D trailing row interpolation');
near(Lateral.rowMultiplier(5, 1, 3), 1.0, 1e-12, '5D front row');
near(Lateral.rowMultiplier(5, 2, 3), 0.85, 1e-12, '5D second row');
near(Lateral.rowMultiplier(5, 3, 3), 0.7, 1e-12, '5D trailing row');
near(Lateral.rowMultiplier(2.5, 1, 1), 1, 1e-12, 'single row has no shadowing reduction');

const result = Lateral.evaluate({
  pileNL: 3,
  pileNB: 3,
  spacingL: 180,
  spacingB: 240,
  pileDiameterCm: 60,
  horizontalX: 90,
  horizontalY: 60
});
assert.equal(result.schema, 'rc-pile-group-lateral.v1');
assert.equal(result.required, true);
assert.equal(result.supported, true);
assert.equal(result.responseAnalysisComplete, false, 'load distribution does not claim p-y response completion');
near(result.x.rows.reduce((sum, row) => sum + row.rowLoad, 0), 90, 1e-10, 'X equilibrium');
near(result.y.rows.reduce((sum, row) => sum + row.rowLoad, 0), 60, 1e-10, 'Y equilibrium');
near(result.x.maxPerPile, 90 * 0.8 / (0.8 + 0.4 + 0.3) / 3, 1e-10, 'X maximum per-pile demand');
near(result.y.maxPerPile, 60 * 0.9 / (0.9 + 0.625 + 0.5) / 3, 1e-10, 'Y maximum per-pile demand');
near(result.x.equilibriumError, 0, 1e-10, 'X equilibrium error');
near(result.y.equilibriumError, 0, 1e-10, 'Y equilibrium error');

const unsupported = Lateral.evaluate({
  pileNL: 3,
  pileNB: 2,
  spacingL: 150,
  spacingB: 180,
  pileDiameterCm: 60,
  horizontalX: 20,
  horizontalY: 0
});
assert.equal(unsupported.supported, false, 'spacing below 3D fails closed');
assert.match(unsupported.x.reason, /小於 3D/);

const noLoad = Lateral.evaluate({
  pileNL: 3,
  pileNB: 3,
  spacingL: 180,
  spacingB: 180,
  pileDiameterCm: 60,
  horizontalX: 0,
  horizontalY: 0
});
assert.equal(noLoad.required, false);
assert.equal(noLoad.responseAnalysisComplete, true, 'zero lateral load does not create an analysis gap');

console.log('pile group lateral unit tests OK');
