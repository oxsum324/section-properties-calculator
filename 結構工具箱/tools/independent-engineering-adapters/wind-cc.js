const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/wind.js');
const formalPagePath = path.resolve(__dirname, '../風力/wind-cc.html');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');
const formalCall = 'Wind.calcCC({ V, terrain, I, Kzt, h, z, zh0, zone: zKey, surface, A, encl })';
if (!formalPageSource.includes(formalCall)) {
  throw new Error('wind-cc-formal-page-wiring-drift');
}

const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Wind = context.window.Wind;

function validateInput(input) {
  if (!Array.isArray(input?.cases) || input.cases.length !== 3) return ['cases:three-control-branches-required'];
  const issues = [];
  const ids = new Set();
  for (const item of input.cases) {
    const id = item?.id || 'case';
    if (!item?.id || ids.has(item.id)) issues.push('cases:unique-id-required');
    ids.add(item?.id);
    for (const key of ['V', 'I', 'Kzt', 'h', 'z', 'zh0', 'A']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${id}.${key}:positive-finite-required`);
    }
    if (!['A', 'B', 'C'].includes(item?.terrain)) issues.push(`${id}.terrain:A-B-C-required`);
    if (!['wall', 'roof'].includes(item?.surface)) issues.push(`${id}.surface:wall-or-roof-required`);
    if (!['enclosed', 'partial'].includes(item?.encl)) issues.push(`${id}.encl:enclosed-or-partial-required`);
    const allowedZones = item?.surface === 'roof' ? ['zone1', 'zone2', 'zone3'] : ['zone4', 'zone5'];
    if (!allowedZones.includes(item?.zone)) issues.push(`${id}.zone:surface-compatible-required`);
  }
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-wind-cc-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => {
    const result = Wind.calcCC(item);
    return [item.id, {
      qh:result.qh,
      qz:result.qz,
      qh0:result.qh0,
      qPos:result.qPos,
      qNeg:result.qNeg,
      qiPos:result.qiPos,
      qiNeg:result.qiNeg,
      zUse:result.zUse,
      zh0Use:result.zh0Use,
      gcpPos:result.GCp.pos,
      gcpNeg:result.GCp.neg,
      gcpi:result.GCpi,
      pPos:result.p_pos,
      pNeg:result.p_neg,
      isLE18:result.isLE18 ? 1 : 0,
      positiveUsesZ:result.qPos === result.qz && result.qz !== result.qh ? 1 : 0,
      partialNegativeUsesZh0:result.qiPos === result.qh0 && result.qh0 !== result.qh ? 1 : 0,
    }];
  }));
}

module.exports = { validateInput, calculate };
