const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/wind.js');
const productionPagePath = path.resolve(__dirname, '../風力/wind-object-solid.html');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const productionPageSource = fs.readFileSync(productionPagePath, 'utf8');
const pageContract = [
  "W.lookupSignCf({ atGround: true, aspectRatio: nu })",
  "W.lookupSignCf({ atGround: false, aspectRatio: mnRatio })",
  "Math.max(cfByNu.cf, cfByMN.cf)",
  "0.3 * windWidth"
];
for (const token of pageContract) {
  if (!productionPageSource.includes(token)) throw new Error(`wind-object-solid-page-contract-missing:${token}`);
}

const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Wind = context.window.Wind;

function validateInput(input) {
  const issues = [];
  for (const key of ['V', 'I', 'Kzt']) {
    if (!Number.isFinite(Number(input?.[key])) || Number(input[key]) <= 0) issues.push(`${key}:positive-finite-required`);
  }
  if (!['A', 'B', 'C'].includes(input?.terrain)) issues.push('terrain:A-B-C-required');
  if (!Array.isArray(input?.cases) || input.cases.length !== 2) {
    issues.push('cases:two-cases-required');
    return issues;
  }
  const ids = new Set();
  for (const [index, item] of input.cases.entries()) {
    const label = `cases[${index}]`;
    if (!['mnControl', 'nuControl'].includes(item?.id) || ids.has(item.id)) issues.push(`${label}.id:unique-known-id-required`);
    ids.add(item?.id);
    for (const key of ['objectHeight', 'sectionMajor', 'sectionMinor', 'windWidth', 'openingRatio']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) < 0 || (key !== 'openingRatio' && Number(item[key]) <= 0)) {
        issues.push(`${label}.${key}:valid-number-required`);
      }
    }
    if (!Number.isFinite(Number(item?.bottomClearance)) || Number(item.bottomClearance) < 0) issues.push(`${label}.bottomClearance:nonnegative-required`);
    if (Number(item?.openingRatio) >= 0.3) issues.push(`${label}.openingRatio:less-than-0.3-required`);
    if (!['code', 'project'].includes(item?.cfSource)) issues.push(`${label}.cfSource:code-or-project-required`);
    if (item?.cfSource === 'project' && (!Number.isFinite(Number(item?.adoptedCf)) || Number(item.adoptedCf) <= 0)) {
      issues.push(`${label}.adoptedCf:positive-required`);
    }
  }
  return issues;
}

function calculateCase(input, item) {
  const objectHeight = Number(item.objectHeight);
  const bigM = Math.max(Number(item.sectionMajor), Number(item.sectionMinor));
  const smallN = Math.min(Number(item.sectionMajor), Number(item.sectionMinor));
  const windWidth = Number(item.windWidth);
  const bottomClearance = Number(item.bottomClearance);
  const nu = objectHeight / windWidth;
  const mnRatio = bigM / smallN;
  const groundLimit = 0.25 * objectHeight;
  const atGround = bottomClearance < groundLimit;
  const cfByNu = Wind.lookupSignCf({ atGround:true, aspectRatio:nu });
  const cfByMN = Wind.lookupSignCf({ atGround:false, aspectRatio:mnRatio });
  const controlNu = cfByNu.cf >= cfByMN.cf;
  const codeCf = Math.max(cfByNu.cf, cfByMN.cf);
  const manualAdoption = item.cfSource !== 'code';
  const baseCf = manualAdoption ? Number(item.adoptedCf) : codeCf;
  const zr = bottomClearance + objectHeight / 2;
  const topElevation = bottomClearance + objectHeight;
  const pressure = Wind.calcQz(zr, Number(input.V), input.terrain, Number(input.I), Number(input.Kzt));
  const gust = Wind.calcGustRigid(Math.max(zr, 0.1), Math.max(windWidth, 1), input.terrain);
  const area = objectHeight * windWidth;
  const force = pressure.qz * gust.G * baseCf * area;
  const eccentricity = 0.3 * windWidth;

  return {
    objectHeight, bigM, smallN, windWidth, nu, mnRatio, groundLimit,
    atGround:atGround ? 1 : 0,
    cfNuRatio:cfByNu.aspectRatio,
    cfNuLowRatio:cfByNu.lowRatio,
    cfNuHighRatio:cfByNu.highRatio,
    cfNuLow:cfByNu.lowCf,
    cfNuHigh:cfByNu.highCf,
    cfNu:cfByNu.cf,
    cfMnRatio:cfByMN.aspectRatio,
    cfMnLowRatio:cfByMN.lowRatio,
    cfMnHighRatio:cfByMN.highRatio,
    cfMnLow:cfByMN.lowCf,
    cfMnHigh:cfByMN.highCf,
    cfMn:cfByMN.cf,
    controlNu:controlNu ? 1 : 0,
    controlMn:controlNu ? 0 : 1,
    codeCf,
    baseCf,
    manualAdoption:manualAdoption ? 1 : 0,
    zr,
    topElevation,
    Kz:pressure.Kz,
    qz:pressure.qz,
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
    eccentricity,
    torsion:force * eccentricity
  };
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-wind-object-solid-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => [item.id, calculateCase(input, item)]));
}

module.exports = { validateInput, calculate };
