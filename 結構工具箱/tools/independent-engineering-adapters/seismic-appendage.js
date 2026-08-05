const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/seismic.js');
const formalPagePath = path.resolve(__dirname, '../地震力/seismic-appendage.html');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');
if (!formalPageSource.includes('S.calcFph({') || !formalPageSource.includes('S.calcFpv(r.Fph, isNF)')) {
  throw new Error('seismic-appendage-formal-page-wiring-drift');
}

const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Seismic = context.window.Seismic;

function validateInput(input) {
  const issues = [];
  if (!Array.isArray(input?.cases) || input.cases.length !== 3) {
    return ['cases:three-control-branches-required'];
  }
  const ids = new Set();
  for (const item of input.cases) {
    if (!item?.id || ids.has(item.id)) issues.push('cases:unique-id-required');
    ids.add(item?.id);
    for (const key of ['SDS', 'Wp', 'ap', 'Rp', 'Ip', 'hn']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${item?.id || 'case'}.${key}:positive-finite-required`);
    }
    if (!Number.isFinite(Number(item?.hx)) || Number(item.hx) < 0 || Number(item.hx) > Number(item.hn)) {
      issues.push(`${item?.id || 'case'}.hx:zero-to-hn-required`);
    }
    if (typeof item?.isTaipeiBasin !== 'boolean' || typeof item?.isNearFault !== 'boolean') {
      issues.push(`${item?.id || 'case'}:boolean-region-flags-required`);
    }
  }
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-seismic-appendage-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => {
    const horizontal = Seismic.calcFph({
      SDS:Number(item.SDS), Wp:Number(item.Wp), ap:Number(item.ap), Rp:Number(item.Rp),
      Ip:Number(item.Ip), hx:Number(item.hx), hn:Number(item.hn), isTaipeiBasin:item.isTaipeiBasin
    });
    const Fpv = Seismic.calcFpv(horizontal.Fph, item.isNearFault);
    return [item.id, {
      Rpa:horizontal.Rpa,
      CphCalc:horizontal.Cph_calc,
      CphMax:horizontal.Cph_max,
      CphMin:horizontal.Cph_min,
      Cph:horizontal.Cph,
      FphCalc:horizontal.Fph_calc,
      FphMax:horizontal.Fph_max,
      FphMin:horizontal.Fph_min,
      Fph:horizontal.Fph,
      Fpv,
      Cpv:Fpv / Number(item.Wp),
      calcControls:horizontal.controlled === 'calc' ? 1 : 0,
      maxControls:horizontal.controlled === 'max' ? 1 : 0,
      minControls:horizontal.controlled === 'min' ? 1 : 0
    }];
  }));
}

module.exports = { validateInput, calculate };
