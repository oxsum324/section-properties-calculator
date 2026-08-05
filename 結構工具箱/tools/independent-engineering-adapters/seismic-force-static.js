const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/seismic.js');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Seismic = context.window.Seismic;

function validateInput(input) {
  const issues = [];
  for (const key of ['hn', 'I', 'SsD', 'S1D', 'SsM', 'S1M', 'Tdyna', 'CU']) {
    if (!Number.isFinite(Number(input?.[key])) || Number(input[key]) <= 0) issues.push(`${key}:positive-finite-required`);
  }
  if (!Seismic.SYSTEMS[input?.systemKey]) issues.push('systemKey:known-system-required');
  if (![1, 2, 3].includes(Number(input?.siteClass))) issues.push('siteClass:1-2-3-required');
  if (!Array.isArray(input?.floors) || input.floors.length !== 8
    || input.floors.some(floor => !Number.isFinite(Number(floor?.W)) || Number(floor.W) <= 0
      || !Number.isFinite(Number(floor?.dH)) || Number(floor.dH) <= 0)) {
    issues.push('floors:eight-positive-weight-height-rows-required');
  }
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-seismic-force-benchmark-input:${issues.join(',')}`);
  const result = Seismic.calcFullSeismic({
    systemKey:input.systemKey,
    hn:Number(input.hn),
    I:Number(input.I),
    siteClass:Number(input.siteClass),
    SsD:Number(input.SsD),
    S1D:Number(input.S1D),
    SsM:Number(input.SsM),
    S1M:Number(input.S1M),
    Tdyna:Number(input.Tdyna),
    CU:Number(input.CU),
    floors:input.floors.map(floor => ({ W:Number(floor.W), dH:Number(floor.dH) })),
    isTaipeiBasin:false
  });
  const output = {
    R:result.R,
    alphaY:result.alphaY,
    FaD:result.site.FaD,
    FvD:result.site.FvD,
    FaM:result.site.FaM,
    FvM:result.site.FvM,
    SDS:result.site.SDS,
    SD1:result.site.SD1,
    SMS:result.site.SMS,
    SM1:result.site.SM1,
    ToD:result.ToD,
    ToM:result.ToM,
    Tcode:result.Tcode,
    Tdesign:result.Tdesign,
    dynamicPeriodControls:result.Tdesign === Number(input.Tdyna) ? 1 : 0,
    Ra:result.Ra,
    Fu:result.Fu,
    FuM:result.FuM,
    SaD:result.SaD,
    SaM:result.SaM,
    W:result.W,
    VD:result.VD,
    VD_ratio:result.VD_ratio,
    VD_ratio_m:result.VD_ratio_m,
    VD_coeff:result.VD_coeff,
    Vstar:result.Vstar,
    Vs_ratio:result.Vs_ratio,
    Vs_ratio_m:result.Vs_ratio_m,
    Vs_coeff:result.Vs_coeff,
    VM:result.VM,
    VM_ratio:result.VM_ratio,
    VM_ratio_m:result.VM_ratio_m,
    VM_coeff:result.VM_coeff,
    Vdesign:result.Vdesign,
    V_coeff:result.V_coeff,
    controlledByVstar:result.controlledBy === 'V*' ? 1 : 0,
    controlledByVM:result.controlledBy === 'VM' ? 1 : 0,
    Ft:result.Ft,
    sumWh:result.dist.sumWh,
    OTM:result.dist.OTM,
    forceSum:result.dist.floors.reduce((sum, floor) => sum + floor.Fi, 0)
  };
  result.dist.floors.forEach((floor, index) => {
    const n = index + 1;
    output[`h${n}`] = floor.h;
    output[`Wh${n}`] = floor.Wh;
    output[`Fi${n}`] = floor.Fi;
    output[`Vstory${n}`] = floor.Vstory;
  });
  return output;
}

module.exports = { validateInput, calculate };
