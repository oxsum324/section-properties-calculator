const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/seismic.js');
const formalPagePath = path.resolve(__dirname, '../地震力/seismic-misc.html');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');
if (!formalPageSource.includes('S.calcMiscSeismic({ ...p, typeIdx: -1 })')) {
  throw new Error('seismic-misc-formal-page-wiring-drift');
}

const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Seismic = context.window.Seismic;

function validateInput(input) {
  const issues = [];
  if (!Array.isArray(input?.cases) || input.cases.length !== 3) return ['cases:three-formula-paths-required'];
  const ids = new Set();
  for (const item of input.cases) {
    if (!item?.id || ids.has(item.id)) issues.push('cases:unique-id-required');
    ids.add(item?.id);
    if (!['similar', 'nonsimilar'].includes(item?.mode)) issues.push(`${item?.id || 'case'}.mode:known-required`);
    for (const key of ['R', 'alphaY', 'I', 'W', 'hn', 'SsD', 'S1D', 'SsM', 'S1M']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${item?.id || 'case'}.${key}:positive-finite-required`);
    }
    if (![1, 2, 3].includes(Number(item?.siteClass))) issues.push(`${item?.id || 'case'}.siteClass:1-2-3-required`);
    if (!Number.isFinite(Number(item?.T_user)) || Number(item.T_user) < 0) issues.push(`${item?.id || 'case'}.T_user:nonnegative-required`);
    if (typeof item?.isTaipeiBasin !== 'boolean' || typeof item?.isNearFault !== 'boolean') issues.push(`${item?.id || 'case'}:boolean-region-flags-required`);
  }
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-seismic-misc-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => {
    const result = Seismic.calcMiscSeismic({ ...item, typeIdx:-1 });
    return [item.id, {
      FaD:result.site.FaD, FvD:result.site.FvD, SDS:result.site.SDS, SD1:result.site.SD1,
      ToD:result.ToD, T:result.T, Ra:result.Ra, Fu:result.Fu, SaD:result.SaD,
      ratio:result.ratio, ratioM:result.ratioM, ratioModified:result.ratio_m,
      denom:result.denom, Vh:result.Vh, VhCoeff:result.VhCoeff, Vv:result.Vv, VvCoeff:result.VvCoeff,
      similarPath:result.formulaUsed === '式(2-3)' ? 1 : 0,
      rigidPath:result.formulaUsed === '式(5-1)' ? 1 : 0,
      flexiblePath:result.formulaUsed === '式(5-2)' ? 1 : 0,
      verticalSa:result.vvRes?.SaD_V ?? 0,
      verticalFu:result.vvRes?.Fuv ?? 0,
      verticalRatioModified:result.vvRes?.ratio_m ?? 0
    }];
  }));
}

module.exports = { validateInput, calculate };
