const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/wind.js');
const formalPagePath = path.resolve(__dirname, '../風力/wind-lattice-tower.html');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');

const requiredFormalWiring = [
  "const segments = Math.max(1, Math.round(val('lSegments')));",
  'const raw = W.calcLatticeTowerWind({ V, terrain, I, zBase, height, faceWidth, solidity: phi, segments, Kzt, towerShape, memberShape, skewWind });',
  'const topRow = raw.body.rows[raw.body.rows.length - 1];',
  'KzTop: W.calcKz(topRow.zMid, terrain)',
];
for (const wiring of requiredFormalWiring) {
  if (!formalPageSource.includes(wiring)) throw new Error('wind-lattice-tower-formal-page-wiring-drift');
}

const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Wind = context.window.Wind;

function validateInput(input) {
  if (!Array.isArray(input?.cases) || input.cases.length !== 4) return ['cases:four-table-branches-required'];
  const issues = [];
  const ids = new Set();
  for (const item of input.cases) {
    const id = item?.id || 'case';
    if (!item?.id || ids.has(item.id)) issues.push('cases:unique-id-required');
    ids.add(item?.id);
    for (const key of ['V', 'I', 'Kzt', 'height', 'faceWidth', 'solidity', 'segments']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${id}.${key}:positive-finite-required`);
    }
    if (!Number.isFinite(Number(item?.zBase)) || Number(item.zBase) < 0) issues.push(`${id}.zBase:nonnegative-required`);
    if (Number(item?.solidity) > 1) issues.push(`${id}.solidity:at-most-one-required`);
    if (!['A', 'B', 'C'].includes(item?.terrain)) issues.push(`${id}.terrain:A-B-C-required`);
    if (!['square', 'triangular'].includes(item?.towerShape)) issues.push(`${id}.towerShape:known-required`);
    if (!['angle_flat', 'circular'].includes(item?.memberShape)) issues.push(`${id}.memberShape:known-required`);
    if (typeof item?.skewWind !== 'boolean') issues.push(`${id}.skewWind:boolean-required`);
  }
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-wind-lattice-tower-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => {
    const raw = Wind.calcLatticeTowerWind(item);
    const first = raw.body.rows[0];
    const top = raw.body.rows[raw.body.rows.length - 1];
    const cf = raw.cfData;
    return [item.id, {
      baseCf:cf.baseCf,
      memberFactor:cf.memberFactor,
      skewFactor:cf.skewFactor,
      cf:cf.cf,
      lowPhiBaseBranch:item.solidity < 0.025 ? 1 : 0,
      linearBaseBranch:item.solidity >= 0.025 && item.solidity <= 0.44 ? 1 : 0,
      plateauBaseBranch:item.solidity > 0.44 && item.solidity <= 0.69 ? 1 : 0,
      highPhiBaseBranch:item.solidity > 0.69 ? 1 : 0,
      circularConstantBranch:item.memberShape === 'circular' && item.solidity <= 0.29 ? 1 : 0,
      circularInterpolatedBranch:item.memberShape === 'circular' && item.solidity > 0.29 && item.solidity <= 0.79 ? 1 : 0,
      unitMemberBranch:item.memberShape !== 'circular' || item.solidity > 0.79 ? 1 : 0,
      skewApplied:cf.skewFactor !== 1 ? 1 : 0,
      segments:raw.body.segments,
      segmentHeight:raw.body.segmentHeight,
      totalSolidArea:raw.totalSolidArea,
      G:raw.body.G,
      gustZBar:raw.body.gustDetail.zBar,
      gustIz:raw.body.gustDetail.Iz,
      gustLz:raw.body.gustDetail.Lz,
      gustQ2:raw.body.gustDetail.Q2,
      gustQ:raw.body.gustDetail.Q,
      firstZMid:first.zMid,
      firstKz:Wind.calcKz(first.zMid, item.terrain),
      firstQz:first.qz,
      topZMid:top.zMid,
      topKz:Wind.calcKz(top.zMid, item.terrain),
      topQz:top.qz,
      segmentArea:first.area,
      baseShear:raw.baseShear,
      sumForce:raw.body.rows.reduce((sum, row) => sum + row.force, 0),
      baseMoment:raw.baseMoment,
      sumMoment:raw.body.rows.reduce((sum, row) => sum + row.moment, 0),
      resultantHeight:raw.resultantHeight,
    }];
  }));
}

module.exports = { validateInput, calculate };
