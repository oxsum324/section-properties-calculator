const assert = require('node:assert/strict');
global.window = global;
require('../../結構工具箱/core/materials/rebar.js');
require('./column-transverse-designer.js');

const table = global.Rebar.REBAR_TABLE;
const common = {
  b:60, h:60, cover:4, Ag:3600, fc:280, fy:4200, Pu:250,
  mainDb:table['#8'].db, bundle:1, nSide:3, dX:52, dY:52,
  designVx:25, designVy:20, forceVc0X:false, forceVc0Y:false,
  tieFy:2800, crossTieFy:2800, phiShear:0.75, barTable:table,
};

const normal = global.ColumnTransverseDesigner.search({ ...common, seismic:false, limit:3 });
assert.equal(normal.status, 'evaluated');
assert.equal(normal.candidates.length, 3);
assert.ok(normal.candidates.every(item => item.ok && item.shearStrengthOk && item.avMinOk && item.shearSizeOk && item.spacingOk && item.lateralSupportOk));
assert.ok(normal.candidates[0].transverseSteel <= normal.candidates[1].transverseSteel + 1e-9);

const seismic = global.ColumnTransverseDesigner.search({ ...common, seismic:true, forceVc0X:true, forceVc0Y:true, limit:2 });
assert.equal(seismic.status, 'evaluated');
assert.equal(seismic.candidates.length, 2);
assert.ok(seismic.candidates.every(item => item.confinementOk && item.spacingOk && item.phiVnX >= common.designVx * 1000));

const impossible = global.ColumnTransverseDesigner.search({ ...common, designVx:500, designVy:500, seismic:true });
assert.equal(impossible.status, 'no-solution');

const invalid = global.ColumnTransverseDesigner.evaluate({ b:60 });
assert.equal(invalid.status, 'invalid-input');

const circularCommon = {
  D:60, cover:4, Ag:Math.PI * 60 * 60 / 4, fc:280, fy:4200, Pu:250,
  mainDb:table['#8'].db, nBar:12, dX:52, dY:52,
  designVx:20, designVy:18, forceVc0X:false, forceVc0Y:false,
  hoopFy:2800, phiShear:0.75, barTable:table,
};
const circularNormal = global.ColumnTransverseDesigner.searchCircular({ ...circularCommon, seismic:false, limit:2 });
assert.equal(circularNormal.status, 'evaluated');
assert.equal(circularNormal.candidates.length, 2);
assert.ok(circularNormal.candidates.every(item => item.circularLayoutOk && item.shearStrengthOk && item.avMinOk && item.shearSizeOk && item.spacingOk));

const circularSeismic = global.ColumnTransverseDesigner.searchCircular({ ...circularCommon, seismic:true, forceVc0X:true, forceVc0Y:true, limit:2 });
assert.equal(circularSeismic.status, 'evaluated');
assert.ok(circularSeismic.candidates.every(item => item.confinementOk && item.rhoS >= item.rhoSReq - 1e-9));

const circularImpossible = global.ColumnTransverseDesigner.searchCircular({ ...circularCommon, designVx:500, designVy:500, seismic:true });
assert.equal(circularImpossible.status, 'no-solution');

const circularInvalid = global.ColumnTransverseDesigner.evaluateCircular({ D:60 });
assert.equal(circularInvalid.status, 'invalid-input');

console.log('column transverse designer unit: PASS', {
  normal:normal.candidates[0],
  seismic:seismic.candidates[0],
  circular:circularSeismic.candidates[0],
});
