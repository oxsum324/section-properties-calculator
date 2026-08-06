const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/wind.js');
const formalPagePath = path.resolve(__dirname, '../風力/wind-fence-sign.html');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');

const requiredFormalWiring = [
  'const zr = s + h / 2;',
  'const Kz = W.calcKz(zr, terrain);',
  'const cfData = W.lookupSignCf({ atGround, aspectRatio });',
  'const Gobj = W.calcGustRigid(h + s, B, terrain);',
  'const F = qz * G * cfEff * A;',
  'const Mbase = F * zr;',
];
for (const wiring of requiredFormalWiring) {
  if (!formalPageSource.includes(wiring)) throw new Error('wind-fence-sign-formal-page-wiring-drift');
}

const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Wind = context.window.Wind;

function validateInput(input) {
  if (!Array.isArray(input?.cases) || input.cases.length !== 4) return ['cases:four-routes-required'];
  const issues = [];
  const ids = new Set();
  for (const item of input.cases) {
    const id = item?.id || 'case';
    if (!item?.id || ids.has(item.id)) issues.push('cases:unique-id-required');
    ids.add(item?.id);
    for (const key of ['V', 'I', 'Kzt', 'h', 'B', 'phi']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${id}.${key}:positive-finite-required`);
    }
    if (!Number.isFinite(Number(item?.s)) || Number(item.s) < 0) issues.push(`${id}.s:nonnegative-required`);
    if (!['A', 'B', 'C'].includes(item?.terrain)) issues.push(`${id}.terrain:A-B-C-required`);
    if (!['fence', 'elevated'].includes(item?.type)) issues.push(`${id}.type:fence-or-elevated-required`);
    if (item?.type === 'fence' && Number(item.s) !== 0) issues.push(`${id}.s:fence-zero-required`);
    if (item?.cfOverride != null && (!Number.isFinite(Number(item.cfOverride)) || Number(item.cfOverride) <= 0)) {
      issues.push(`${id}.cfOverride:null-or-positive-required`);
    }
  }
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-wind-fence-sign-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => {
    const zr = item.s + item.h / 2;
    const Kz = Wind.calcKz(zr, item.terrain);
    const qz = 0.06 * Kz * item.Kzt * item.I * item.I * item.V * item.V;
    const aspectRatio = item.B / item.h;
    const atGround = item.type === 'fence';
    const cfData = Wind.lookupSignCf({ atGround, aspectRatio });
    const manualAdoption = item.cfOverride != null;
    const cfBase = manualAdoption ? item.cfOverride : cfData.cf;
    const cfEff = cfBase * item.phi;
    const gust = Wind.calcGustRigid(item.h + item.s, item.B, item.terrain);
    const area = item.h * item.B;
    const force = qz * gust.G * cfEff * area;
    return [item.id, {
      groundRoute:atGround ? 1 : 0,
      elevatedRoute:atGround ? 0 : 1,
      aspectRatio,
      aspectRatioUsed:cfData.aspectRatio,
      clampedLow:aspectRatio < (atGround ? 3 : 6) ? 1 : 0,
      clampedHigh:aspectRatio > (atGround ? 40 : 80) ? 1 : 0,
      lowRatio:cfData.lowRatio,
      highRatio:cfData.highRatio,
      lowCf:cfData.lowCf,
      highCf:cfData.highCf,
      tableCf:cfData.cf,
      manualAdoption:manualAdoption ? 1 : 0,
      cfBase,
      phi:item.phi,
      cfEff,
      zr,
      zUse:Math.max(zr, Wind.TERRAIN[item.terrain].zmin),
      Kz,
      qz,
      gustHeight:item.h + item.s,
      gustWidth:item.B,
      gustZBar:gust.zBar,
      gustIz:gust.Iz,
      gustLz:gust.Lz,
      gustQ2:gust.Q2,
      gustQ:gust.Q,
      G:gust.G,
      area,
      force,
      baseShear:force,
      baseMoment:force * zr,
    }];
  }));
}

module.exports = { validateInput, calculate };
