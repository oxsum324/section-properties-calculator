const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/wind.js');
const formalPagePath = path.resolve(__dirname, '../風力/wind-open-roof.html');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');

const requiredFormalWiring = [
  'const hUse = theta <= 10 ? hEave : hAvg;',
  'data: W.calcOpenRoofCC({ V, terrain, I, h: hUse, B, L, Kzt, theta, A, zone, roofType, blockage })',
];
for (const wiring of requiredFormalWiring) {
  if (!formalPageSource.includes(wiring)) throw new Error('wind-open-roof-formal-page-wiring-drift');
}

const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Wind = context.window.Wind;

function validateInput(input) {
  if (!Array.isArray(input?.cases) || input.cases.length !== 4) return ['cases:four-roof-blockage-combinations-required'];
  const issues = [];
  const ids = new Set();
  for (const item of input.cases) {
    const id = item?.id || 'case';
    if (!item?.id || ids.has(item.id)) issues.push('cases:unique-id-required');
    ids.add(item?.id);
    for (const key of ['V', 'I', 'Kzt', 'hAvg', 'hEave', 'B', 'L', 'A']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${id}.${key}:positive-finite-required`);
    }
    if (!Number.isFinite(Number(item?.theta)) || Number(item.theta) < 0 || Number(item.theta) > 45) issues.push(`${id}.theta:zero-to-45-required`);
    if (!['A', 'B', 'C'].includes(item?.terrain)) issues.push(`${id}.terrain:A-B-C-required`);
    if (!['monoslope', 'gable'].includes(item?.roofType)) issues.push(`${id}.roofType:known-required`);
    if (!['unblocked', 'blocked'].includes(item?.blockage)) issues.push(`${id}.blockage:known-required`);
  }
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-wind-open-roof-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => {
    const hUse = item.theta <= 10 ? item.hEave : item.hAvg;
    const zones = ['zone1', 'zone2', 'zone3'].map(zone => ({
      zone,
      data:Wind.calcOpenRoofCC({ ...item, h:hUse, zone }),
    }));
    const maxPos = zones.reduce((best, current) => current.data.p_pos > best.data.p_pos ? current : best, zones[0]);
    const maxNeg = zones.reduce((best, current) => current.data.p_neg < best.data.p_neg ? current : best, zones[0]);
    const maxAbs = zones.reduce((best, current) => {
      const bestAbs = Math.max(Math.abs(best.data.p_pos), Math.abs(best.data.p_neg));
      const currentAbs = Math.max(Math.abs(current.data.p_pos), Math.abs(current.data.p_neg));
      return currentAbs > bestAbs ? current : best;
    }, zones[0]);
    const first = zones[0].data;
    const result = {
      hUse,
      eaveHeightControls:item.theta <= 10 ? 1 : 0,
      qh:first.qh,
      G:first.G,
      minWidth:first.minWidth,
      a:first.a,
      smallBand:first.areaBand === 'small' ? 1 : 0,
      mediumBand:first.areaBand === 'medium' ? 1 : 0,
      largeBand:first.areaBand === 'large' ? 1 : 0,
      thetaUse:first.thetaUse,
      thetaLow:first.thetaLow,
      thetaHigh:first.thetaHigh,
    };
    for (const entry of zones) {
      result[entry.zone] = {
        cpnPos:entry.data.Cpn.pos,
        cpnNeg:entry.data.Cpn.neg,
        pPos:entry.data.p_pos,
        pNeg:entry.data.p_neg,
        maxPos:entry.zone === maxPos.zone ? 1 : 0,
        maxNeg:entry.zone === maxNeg.zone ? 1 : 0,
        maxAbs:entry.zone === maxAbs.zone ? 1 : 0,
      };
    }
    return [item.id, result];
  }));
}

module.exports = { validateInput, calculate };
