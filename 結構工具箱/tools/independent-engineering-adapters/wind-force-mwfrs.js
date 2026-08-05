const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/wind.js');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Wind = context.window.Wind;

function validateInput(input) {
  const issues = [];
  for (const key of ['V', 'I', 'Kzt', 'B', 'L', 'eaveHeight', 'fa', 'ft']) {
    if (!Number.isFinite(Number(input?.[key])) || Number(input[key]) <= 0) issues.push(`${key}:positive-finite-required`);
  }
  if (!['A', 'B', 'C'].includes(input?.terrain)) issues.push('terrain:A-B-C-required');
  if (input?.encl !== 'enclosed') issues.push('encl:enclosed-required');
  if (!Array.isArray(input?.storyH) || input.storyH.length !== 3
    || input.storyH.some(value => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
    issues.push('storyH:three-positive-heights-required');
  }
  return issues;
}

function directionInput(input, B, L) {
  return {
    V:Number(input.V), terrain:input.terrain, I:Number(input.I), Kzt:Number(input.Kzt),
    B, L, storyH:input.storyH.map(Number), isFlexible:false,
    encl:'enclosed', roofSlope:0, roofType:'flat', windToRidge:'perpendicular',
    eaveHeight:Number(input.eaveHeight), fa:Number(input.fa), ft:Number(input.ft)
  };
}

function flattenDirection(prefix, result) {
  const rows = result.stories;
  return {
    [`${prefix}G`]:result.G,
    [`${prefix}Iz`]:result.gustInfo.Iz,
    [`${prefix}Lz`]:result.gustInfo.Lz,
    [`${prefix}Q2`]:result.gustInfo.Q2,
    [`${prefix}Q`]:result.gustInfo.Q,
    [`${prefix}Cpl`]:result.Cpl,
    [`${prefix}SimpleRegime`]:result.lateralMeta.regime === 'simple' ? 1 : 0,
    [`${prefix}Vb`]:result.Vb,
    [`${prefix}OTM`]:result.OTM,
    [`${prefix}F1`]:rows[0].F,
    [`${prefix}F2`]:rows[1].F,
    [`${prefix}F3`]:rows[2].F,
    [`${prefix}Pnet1`]:rows[0].pNet,
    [`${prefix}Pnet3`]:rows[2].pNet,
    [`${prefix}WL1`]:result.crossWind[0].WL,
    [`${prefix}WL3`]:result.crossWind[2].WL,
    [`${prefix}MT1`]:result.torsion[0].MT,
    [`${prefix}MT3`]:result.torsion[2].MT,
    [`${prefix}CrossTotal`]:result.crossWind.reduce((sum, row) => sum + row.WL, 0),
    [`${prefix}TorsionTotal`]:result.torsion.reduce((sum, row) => sum + row.MT, 0),
    [`${prefix}WallCasePos1`]:rows[0].wallCases.windward.casePos,
    [`${prefix}WallCaseNeg1`]:rows[0].wallCases.windward.caseNeg,
    [`${prefix}RoofCpMax`]:result.roof.xDir.windward.cpMax,
    [`${prefix}RoofCpMin`]:result.roof.xDir.windward.cpMin,
    [`${prefix}RoofPMax`]:result.roof.xDir.windward.pMax,
    [`${prefix}RoofPMin`]:result.roof.xDir.windward.pMin
  };
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-wind-force-benchmark-input:${issues.join(',')}`);
  const x = Wind.calcBuildingWind(directionInput(input, Number(input.B), Number(input.L)));
  const y = Wind.calcBuildingWind(directionInput(input, Number(input.L), Number(input.B)));
  return {
    totalH:x.totalH,
    zBar:x.gustInfo.zBar,
    KzH:x.KzH,
    qH:x.qH,
    Vh:x.Vh,
    zMid1:x.stories[0].zMid,
    zMid2:x.stories[1].zMid,
    zMid3:x.stories[2].zMid,
    Kz1:x.stories[0].Kz,
    Kz2:x.stories[1].Kz,
    Kz3:x.stories[2].Kz,
    qz1:x.stories[0].qz,
    qz2:x.stories[1].qz,
    qz3:x.stories[2].qz,
    ...flattenDirection('x', x),
    ...flattenDirection('y', y)
  };
}

module.exports = { validateInput, calculate };
