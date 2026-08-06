const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/wind.js');
const formalPagePath = path.resolve(__dirname, '../風力/wind-object-frame.html');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');

const requiredFormalWiring = [
  'const q = W.calcQz(z, V, terrain, I, Kzt);',
  "const dSqrtQz = memberType === 'circular' ? W.calcDiameterSqrtQz(D, q.qz) : null;",
  'const cfData = W.lookupPorousFrameCf({ solidity: phi, memberType, dSqrtQz });',
  'const gustInfo = W.calcGustRigid(z, Math.max(Math.sqrt(A), 1), terrain);',
  'const force = q.qz * G * cfData.cf * A;',
];
for (const wiring of requiredFormalWiring) {
  if (!formalPageSource.includes(wiring)) throw new Error('wind-object-frame-formal-page-wiring-drift');
}

const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Wind = context.window.Wind;

function validateInput(input) {
  if (!Array.isArray(input?.cases) || input.cases.length !== 3) return ['cases:three-table-routes-required'];
  const issues = [];
  const ids = new Set();
  for (const item of input.cases) {
    const id = item?.id || 'case';
    if (!item?.id || ids.has(item.id)) issues.push('cases:unique-id-required');
    ids.add(item?.id);
    for (const key of ['V', 'I', 'Kzt', 'z', 'A']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${id}.${key}:positive-finite-required`);
    }
    if (!Number.isFinite(Number(item?.phi)) || Number(item.phi) < 0 || Number(item.phi) > 0.7) issues.push(`${id}.phi:zero-to-0.7-required`);
    if (!['A', 'B', 'C'].includes(item?.terrain)) issues.push(`${id}.terrain:A-B-C-required`);
    if (!['circular', 'flat'].includes(item?.memberType)) issues.push(`${id}.memberType:known-required`);
    if (item?.memberType === 'circular' && (!Number.isFinite(Number(item?.D)) || Number(item.D) <= 0)) issues.push(`${id}.D:positive-required`);
  }
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-wind-object-frame-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => {
    const q = Wind.calcQz(item.z, item.V, item.terrain, item.I, item.Kzt);
    const dSqrtQz = item.memberType === 'circular' ? Wind.calcDiameterSqrtQz(item.D, q.qz) : null;
    const cfData = Wind.lookupPorousFrameCf({ solidity:item.phi, memberType:item.memberType, dSqrtQz });
    const equivalentWidth = Math.max(Math.sqrt(item.A), 1);
    const gust = Wind.calcGustRigid(item.z, equivalentWidth, item.terrain);
    const force = q.qz * gust.G * cfData.cf * item.A;
    return [item.id, {
      zUse:Math.max(item.z, Wind.TERRAIN[item.terrain].zmin),
      Kz:q.Kz,
      qz:q.qz,
      equivalentWidth,
      gustZBar:gust.zBar,
      gustIz:gust.Iz,
      gustLz:gust.Lz,
      gustQ2:gust.Q2,
      gustQ:gust.Q,
      G:gust.G,
      dSqrtQz:dSqrtQz == null ? 0 : dSqrtQz,
      circularLowRoute:cfData.key === 'circular_low_qd' ? 1 : 0,
      circularHighRoute:cfData.key === 'circular_high_qd' ? 1 : 0,
      flatRoute:cfData.key === 'flat_member' ? 1 : 0,
      lowBand:cfData.band === '0.00~0.10' ? 1 : 0,
      mediumBand:cfData.band === '0.10~0.29' ? 1 : 0,
      highBand:cfData.band === '0.30~0.70' ? 1 : 0,
      cf:cfData.cf,
      force,
      baseShear:force,
      baseMoment:force * item.z,
      resultantHeight:item.z,
    }];
  }));
}

module.exports = { validateInput, calculate };
