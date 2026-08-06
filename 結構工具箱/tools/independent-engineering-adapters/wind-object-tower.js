const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/wind.js');
const formalPagePath = path.resolve(__dirname, '../風力/wind-object-tower.html');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');

const requiredFormalWiring = [
  "const segments = Math.max(1, Math.round(val('segments')));",
  'const raw = W.calcTowerWind({ V, terrain, I, zBase, height, D, segments, Kzt, sectionType, shapeFactor, topArea, topAreaCf: topCf });',
  'const topRow = raw.body.rows[raw.body.rows.length - 1];',
  'KzTop: W.calcKz(zBase + height, terrain)',
];
for (const wiring of requiredFormalWiring) {
  if (!formalPageSource.includes(wiring)) throw new Error('wind-object-tower-formal-page-wiring-drift');
}

const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Wind = context.window.Wind;

const SECTION_TYPES = new Set([
  'square_face', 'square_diagonal', 'hex_oct', 'circular_auto',
  'circular_moderate', 'circular_rough', 'circular_very_rough',
]);

function validateInput(input) {
  if (!Array.isArray(input?.cases) || input.cases.length !== 6) return ['cases:six-table-routes-required'];
  const issues = [];
  const ids = new Set();
  for (const item of input.cases) {
    const id = item?.id || 'case';
    if (!item?.id || ids.has(item.id)) issues.push('cases:unique-id-required');
    ids.add(item?.id);
    for (const key of ['V', 'I', 'Kzt', 'height', 'D', 'segments', 'shapeFactor']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${id}.${key}:positive-finite-required`);
    }
    if (!Number.isFinite(Number(item?.zBase)) || Number(item.zBase) < 0) issues.push(`${id}.zBase:nonnegative-required`);
    if (!Number.isFinite(Number(item?.topArea)) || Number(item.topArea) < 0) issues.push(`${id}.topArea:nonnegative-required`);
    if (item?.topAreaCf != null && (!Number.isFinite(Number(item.topAreaCf)) || Number(item.topAreaCf) <= 0)) {
      issues.push(`${id}.topAreaCf:null-or-positive-required`);
    }
    if (!['A', 'B', 'C'].includes(item?.terrain)) issues.push(`${id}.terrain:A-B-C-required`);
    if (!SECTION_TYPES.has(item?.sectionType)) issues.push(`${id}.sectionType:known-required`);
  }
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-wind-object-tower-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => {
    const raw = Wind.calcTowerWind(item);
    const first = raw.body.rows[0];
    const topRow = raw.body.rows[raw.body.rows.length - 1];
    const resolved = raw.cfData.sectionType;
    return [item.id, {
      squareFaceRoute:resolved === 'square_face' ? 1 : 0,
      squareDiagonalRoute:resolved === 'square_diagonal' ? 1 : 0,
      hexOctRoute:resolved === 'hex_oct' ? 1 : 0,
      circularAutoLowRoute:item.sectionType === 'circular_auto' && resolved === 'circular_low_qd' ? 1 : 0,
      circularAutoHighRoute:item.sectionType === 'circular_auto' && resolved === 'circular_moderate' ? 1 : 0,
      explicitCircularRoute:item.sectionType.startsWith('circular_') && item.sectionType !== 'circular_auto' ? 1 : 0,
      hOverDActual:item.height / item.D,
      hOverDUsed:raw.cfData.hOverD,
      clampedLowRatio:item.height / item.D < 1 ? 1 : 0,
      clampedHighRatio:item.height / item.D > 25 ? 1 : 0,
      lowRatio:raw.cfData.lowRatio,
      highRatio:raw.cfData.highRatio,
      baseCf:raw.cfData.cf,
      shapeFactor:raw.shapeFactor,
      CfEff:raw.body.CfEff,
      qTop:raw.qTop,
      dSqrtQz:raw.dSqrtQz,
      segments:raw.body.segments,
      segmentHeight:raw.body.segmentHeight,
      totalArea:raw.body.totalArea,
      G:raw.body.G,
      gustZBar:raw.body.gustDetail.zBar,
      gustIz:raw.body.gustDetail.Iz,
      gustLz:raw.body.gustDetail.Lz,
      gustQ2:raw.body.gustDetail.Q2,
      gustQ:raw.body.gustDetail.Q,
      firstZMid:first.zMid,
      firstKz:Wind.calcKz(first.zMid, item.terrain),
      firstQz:first.qz,
      firstArea:first.area,
      firstForce:first.force,
      topZMid:topRow.zMid,
      topKz:Wind.calcKz(topRow.zMid, item.terrain),
      topQz:topRow.qz,
      topSegmentForce:topRow.force,
      bodyBaseShear:raw.body.baseShear,
      sumBodyForce:raw.body.rows.reduce((sum, row) => sum + row.force, 0),
      bodyBaseMoment:raw.body.baseMoment,
      sumBodyMoment:raw.body.rows.reduce((sum, row) => sum + row.moment, 0),
      topPresent:raw.top ? 1 : 0,
      topInheritedCf:raw.top && item.topAreaCf == null ? 1 : 0,
      topSpecifiedCf:raw.top && item.topAreaCf != null ? 1 : 0,
      topBaseCf:raw.top?.baseCf || 0,
      topCfEff:raw.top?.CfEff || 0,
      topForce:raw.top?.force || 0,
      topMoment:raw.top?.moment || 0,
      baseShear:raw.baseShear,
      baseMoment:raw.baseMoment,
      resultantHeight:raw.resultantHeight,
    }];
  }));
}

module.exports = { validateInput, calculate };
