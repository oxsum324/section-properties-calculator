const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/wind.js');
const formalPagePath = path.resolve(__dirname, '../風力/wind-sign-pole.html');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');

const requiredFormalWiring = [
  'const panelQ = W.calcQz(panelZr, V, terrain, I, Kzt);',
  'const panelCfData = W.lookupSignCf({ atGround, aspectRatio: panelAspect });',
  'const panelGust = W.calcGustRigid(Math.max(panelTop, 0.1), panelWidth, terrain);',
  'const dSqrtQz = W.calcDiameterSqrtQz(pipeDiameter, q.qz);',
  'const cfData = W.lookupCableCf({ roughness: pipeRoughness, dSqrtQz });',
  'const shape = W.lookupAngularPrismCf(prismShape);',
  'const rData = W.lookupAngularPrismR(h / width);',
  'const totalShear = panelForce + support.shear;',
  'const totalMoment = panelMoment + support.moment;',
];
for (const wiring of requiredFormalWiring) {
  if (!formalPageSource.includes(wiring)) throw new Error('wind-sign-pole-formal-page-wiring-drift');
}

const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Wind = context.window.Wind;

function validateInput(input) {
  if (!Array.isArray(input?.cases) || input.cases.length !== 6) return ['cases:six-composite-routes-required'];
  const issues = [];
  const ids = new Set();
  for (const item of input.cases) {
    const id = item?.id || 'case';
    if (!item?.id || ids.has(item.id)) issues.push('cases:unique-id-required');
    ids.add(item?.id);
    for (const key of ['V', 'I', 'Kzt', 'panelWidth', 'panelHeight', 'supportCount', 'supportSegments']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${id}.${key}:positive-finite-required`);
    }
    if (!Number.isFinite(Number(item?.panelBottom)) || Number(item.panelBottom) < 0) issues.push(`${id}.panelBottom:nonnegative-required`);
    if (!Number.isFinite(Number(item?.openingRatio)) || Number(item.openingRatio) < 0 || Number(item.openingRatio) >= 30) issues.push(`${id}.openingRatio:zero-to-below-30-required`);
    if (!['A', 'B', 'C'].includes(item?.terrain)) issues.push(`${id}.terrain:A-B-C-required`);
    if (!['pipe', 'angular'].includes(item?.supportType)) issues.push(`${id}.supportType:pipe-or-angular-required`);
    if (item?.supportType === 'pipe' && (!Number.isFinite(Number(item.pipeDiameter)) || Number(item.pipeDiameter) <= 0)) issues.push(`${id}.pipeDiameter:positive-required`);
    if (item?.supportType === 'pipe' && !['smooth', 'moderate', 'fine_cable', 'rough_cable'].includes(item?.pipeRoughness)) issues.push(`${id}.pipeRoughness:known-table-row-required`);
    if (item?.supportType === 'angular' && (!Number.isFinite(Number(item.prismWidth)) || Number(item.prismWidth) <= 0)) issues.push(`${id}.prismWidth:positive-required`);
    if (item?.supportType === 'angular' && !['rect_long', 'rect_short', 'tri_vertex', 'tri_face', 'right_iso_vertex'].includes(item?.prismShape)) issues.push(`${id}.prismShape:known-table-row-required`);
    if (item?.panelCfOverride != null && (!Number.isFinite(Number(item.panelCfOverride)) || Number(item.panelCfOverride) <= 0)) issues.push(`${id}.panelCfOverride:null-or-positive-required`);
  }
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-wind-sign-pole-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => {
    const panelTop = item.panelBottom + item.panelHeight;
    const panelZr = item.panelBottom + item.panelHeight / 2;
    const panelArea = item.panelWidth * item.panelHeight * (1 - item.openingRatio / 100);
    const panelQ = Wind.calcQz(panelZr, item.V, item.terrain, item.I, item.Kzt);
    const panelAspect = item.panelWidth / item.panelHeight;
    const panelAtGround = item.panelBottom <= 0;
    const panelCfData = Wind.lookupSignCf({ atGround:panelAtGround, aspectRatio:panelAspect });
    const panelManualCf = item.panelCfOverride != null;
    const panelCf = panelManualCf ? item.panelCfOverride : panelCfData.cf;
    const panelGust = Wind.calcGustRigid(Math.max(panelTop, 0.1), item.panelWidth, item.terrain);
    const panelPressure = panelQ.qz * panelGust.G * panelCf;
    const panelForce = panelPressure * panelArea;
    const panelMoment = panelForce * panelZr;

    const supportHeight = item.panelBottom;
    const supportSegments = Math.max(1, Math.min(24, Math.round(item.supportSegments)));
    const supportCount = Math.max(1, Math.round(item.supportCount));
    const supportWidth = item.supportType === 'pipe' ? item.pipeDiameter : item.prismWidth;
    const supportGust = supportHeight > 0 ? Wind.calcGustRigid(Math.max(supportHeight, 0.1), supportWidth, item.terrain) : null;
    const segmentHeight = supportHeight > 0 ? supportHeight / supportSegments : 0;
    const angularShape = item.supportType === 'angular' ? Wind.lookupAngularPrismCf(item.prismShape) : null;
    const angularR = item.supportType === 'angular' ? Wind.lookupAngularPrismR(supportHeight / supportWidth) : null;
    const rows = [];
    for (let index = 0; index < supportSegments && supportHeight > 0; index += 1) {
      const zMid = index * segmentHeight + segmentHeight / 2;
      const q = Wind.calcQz(zMid, item.V, item.terrain, item.I, item.Kzt);
      const dSqrtQz = item.supportType === 'pipe' ? Wind.calcDiameterSqrtQz(item.pipeDiameter, q.qz) : 0;
      const cable = item.supportType === 'pipe' ? Wind.lookupCableCf({ roughness:item.pipeRoughness, dSqrtQz }) : null;
      const cf = cable ? cable.cf : angularShape.cf * angularR.r;
      const area = supportWidth * segmentHeight * supportCount;
      const pressure = q.qz * supportGust.G * cf;
      const force = pressure * area;
      rows.push({ zMid, Kz:q.Kz, qz:q.qz, dSqrtQz, cf, area, pressure, force, moment:force * zMid });
    }
    const supportShear = rows.reduce((sum, row) => sum + row.force, 0);
    const supportMoment = rows.reduce((sum, row) => sum + row.moment, 0);
    const first = rows[0] || {};
    const last = rows[rows.length - 1] || {};
    const totalShear = panelForce + supportShear;
    const totalMoment = panelMoment + supportMoment;
    return [item.id, {
      panelGroundRoute:panelAtGround ? 1 : 0,
      panelElevatedRoute:panelAtGround ? 0 : 1,
      panelAspect,
      panelAspectUsed:panelCfData.aspectRatio,
      panelClampedLow:panelAspect < (panelAtGround ? 3 : 6) ? 1 : 0,
      panelClampedHigh:panelAspect > (panelAtGround ? 40 : 80) ? 1 : 0,
      panelTableCf:panelCfData.cf,
      panelManualCf:panelManualCf ? 1 : 0,
      panelCf,
      panelTop,
      panelZr,
      panelArea,
      panelKz:panelQ.Kz,
      panelQz:panelQ.qz,
      panelG:panelGust.G,
      panelPressure,
      panelForce,
      panelMoment,
      supportPipeRoute:item.supportType === 'pipe' ? 1 : 0,
      supportAngularRoute:item.supportType === 'angular' ? 1 : 0,
      supportZeroHeight:supportHeight === 0 ? 1 : 0,
      supportCount,
      supportSegments,
      supportHeight,
      supportWidth,
      supportG:supportGust ? supportGust.G : 0,
      segmentHeight,
      angularShapeCf:angularShape ? angularShape.cf : 0,
      angularSlenderness:angularR ? angularR.slenderRatio : 0,
      angularR:angularR ? angularR.r : 0,
      angularR06:angularR?.r === 0.6 ? 1 : 0,
      angularR07:angularR?.r === 0.7 ? 1 : 0,
      angularR08:angularR?.r === 0.8 ? 1 : 0,
      angularR10:angularR?.r === 1.0 ? 1 : 0,
      pipeLowRegimeCount:rows.filter(row => row.dSqrtQz <= 1.70).length,
      pipeHighRegimeCount:item.supportType === 'pipe' ? rows.filter(row => row.dSqrtQz > 1.70).length : 0,
      firstZMid:first.zMid || 0,
      firstKz:first.Kz || 0,
      firstQz:first.qz || 0,
      firstDSqrtQz:first.dSqrtQz || 0,
      firstCf:first.cf || 0,
      lastZMid:last.zMid || 0,
      lastKz:last.Kz || 0,
      lastQz:last.qz || 0,
      lastDSqrtQz:last.dSqrtQz || 0,
      lastCf:last.cf || 0,
      supportArea:rows.reduce((sum, row) => sum + row.area, 0),
      supportShear,
      supportMoment,
      supportLineLoad:supportHeight > 0 ? supportShear / supportHeight : 0,
      totalShear,
      totalMoment,
      resultantHeight:totalShear > 0 ? totalMoment / totalShear : 0,
    }];
  }));
}

module.exports = { validateInput, calculate };
