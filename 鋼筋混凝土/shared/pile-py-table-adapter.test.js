const assert = require('node:assert/strict');
const Adapter = require('./pile-py-table-adapter.js');

const model = {
  pileNL: 3,
  pileNB: 3,
  spacingLCm: 180,
  spacingBCm: 180,
  pileDiameterCm: 60,
  pileLengthM: 18,
  horizontalXTf: 90,
  horizontalYTf: 45,
  representativeXTf: 16,
  representativeYTf: 8
};

const siX = `depth_m,deflection_mm,shear_kN,moment_kN_m
0,8.2,149.06,-182.40
3,5.1,-132.00,165.00
9,-1.2,41.00,-80.00`;
const siY = `moment_kN_m;depth_m;shear_kN;deflection_mm
-92.18;0;76.49;4.1
81.00;3;-65.00;2.4
-30.00;9;20.00;-0.8`;

const parsedX = Adapter.parseTable(siX, 'si-kn-m-mm', 'X');
assert.equal(parsedX.rowCount, 3);
assert.ok(Math.abs(parsedX.headDisplacementCm - 0.82) < 1e-12);
assert.ok(Math.abs(parsedX.maxShearTf - 149.06 / 9.80665) < 1e-12);
assert.ok(Math.abs(parsedX.maxMomentTfm - 182.4 / 9.80665) < 1e-12);

const payload = Adapter.buildPayload({
  model,
  unitProfile: 'si-kn-m-mm',
  analysisScope: 'representative-pile',
  analysisId: 'LP-ADAPTER-001',
  software: 'LPile',
  version: '2026',
  caseName: 'SERVICE-X-Y',
  analyst: '',
  capacityBasis: '專案核定樁身斷面容量',
  allowableHeadDisplacementCm: 2.5,
  shearCapacityTf: 28,
  momentCapacityTfm: 31,
  generatedAt: '2026-08-04T00:00:00.000Z',
  tables: { x: siX, y: siY },
  tableSha256: { x: 'a'.repeat(64), y: 'b'.repeat(64) },
  tableSourceFilename: { x: 'lpile-x.csv', y: 'lpile-y.tsv' }
});
assert.equal(payload.schema, 'rc-pile-py-result.v1');
assert.equal(payload.source.analysisScope, 'representative-pile');
assert.equal(payload.source.analysisHorizontalXTf, 16);
assert.equal(payload.source.analysisHorizontalYTf, 8);
assert.equal(payload.adapterEvidence.x.rowCount, 3);
assert.equal(payload.adapterEvidence.y.tableSha256, 'b'.repeat(64));
assert.equal(payload.adapterEvidence.x.sourceFilename, 'lpile-x.csv');
assert.equal(payload.adapterEvidence.y.sourceFilename, 'lpile-y.tsv');

const us = `depth_ft,deflection_in,shear_kip,moment_kip_ft
0,0.25,-20,-80
10,-0.10,12,60`;
const parsedUs = Adapter.parseTable(us, 'us-kip-ft-in', 'X');
assert.ok(Math.abs(parsedUs.headDisplacementCm - 0.635) < 1e-12);
assert.ok(Math.abs(parsedUs.maxShearTf - 9.0718474) < 1e-9);
assert.ok(Math.abs(parsedUs.maxMomentTfm - 11.06039635008) < 1e-10);

assert.throws(
  () => Adapter.parseTable('depth_m,deflection_mm,shear_kN,moment_kN_m\n1,2,3,4\n2,3,4,5', 'si-kn-m-mm', 'X'),
  /缺少深度 0 m/
);
assert.throws(
  () => Adapter.parseTable('depth_ft,deflection_in,shear_kip,moment_kip_ft\n0,1,2,3\n1,2,3,4', 'si-kn-m-mm', 'X'),
  /缺少欄位 depth_m/
);
assert.throws(
  () => Adapter.parseTable('depth_m,deflection_mm,shear_kN,moment_kN_m\n0,1,bad,3\n1,2,3,4', 'si-kn-m-mm', 'X'),
  /必須是有限數值/
);
assert.throws(
  () => Adapter.buildPayload({
    model: { ...model, representativeXTf: null },
    unitProfile: 'si-kn-m-mm', analysisScope: 'representative-pile'
  }),
  /須先完成支援範圍內的 p-multiplier/
);
assert.throws(
  () => Adapter.buildPayload({
    model,
    unitProfile: 'si-kn-m-mm', analysisScope: 'representative-pile',
    analysisId: 'BAD-FILE', software: 'LPile', version: '2026', caseName: 'SERVICE', capacityBasis: '核定容量',
    allowableHeadDisplacementCm: 2.5, shearCapacityTf: 28, momentCapacityTfm: 31,
    tables: { x: siX, y: siY },
    tableSha256: { x: 'a'.repeat(64), y: 'b'.repeat(64) },
    tableSourceFilename: { x: '../lpile-x.csv', y: 'lpile-y.csv' }
  }),
  /來源檔名 格式錯誤/
);

console.log('pile p-y table adapter unit tests OK');
