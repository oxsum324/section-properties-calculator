const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../../鋼構工具/core/materials/steel.js');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Steel = context.window.Steel;

function validateInput(input) {
  const issues = [];
  for (const key of ['H', 'B', 'tw', 'tf', 'Fy', 'Lb', 'Cb', 'wD', 'wL', 'L', 'limitLive', 'limitTotal']) {
    if (!Number.isFinite(Number(input?.[key])) || Number(input[key]) <= 0) issues.push(`${key}:positive-finite-required`);
  }
  if (!Number.isFinite(Number(input?.R)) || Number(input.R) < 0) issues.push('R:nonnegative-finite-required');
  if (Number(input?.H) <= 2 * Number(input?.tf)) issues.push('section:web-depth-positive-required');
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-steel-beam-asd-benchmark-input:${issues.join(',')}`);
  const sec = Steel.calcProps({
    n:'independent-steel-beam-benchmark',
    H:Number(input.H), B:Number(input.B), tw:Number(input.tw), tf:Number(input.tf), R:Number(input.R)
  });
  const flex = Steel.calcMn(sec, Number(input.Fy), Number(input.Lb), Number(input.Cb));
  const shear = Steel.calcVn(sec, Number(input.Fy));
  const deflection = Steel.calcDeflection(sec, Number(input.wD), Number(input.wL), Number(input.L));
  return {
    A:sec.A, Ix:sec.Ix, Iy:sec.Iy, Sx:sec.Sx, Zx:sec.Zx, ry:sec.ry,
    J:sec.J, Cw:sec.Cw, ho:sec.ho, rts:sec.rts,
    lambdaF:flex.cls.lambdaF, lambdaW:flex.cls.lambdaW,
    lpf:flex.cls.lpf, lrf:flex.cls.lrf, lpw:flex.cls.lpw, lrw:flex.cls.lrw,
    compactFlange:flex.cls.flange === 'compact' ? 1 : 0,
    compactWeb:flex.cls.web === 'compact' ? 1 : 0,
    Lp:flex.Lp, Lr:flex.Lr,
    inelasticLtb:flex.ltbZone === 'inelastic' ? 1 : 0,
    governingLtb:flex.governing === 'LTB' ? 1 : 0,
    Mp:flex.Mp, Mr:flex.Mr, MnYield:flex.Mn_yield, MnLtb:flex.Mn_ltb, MnFlb:flex.Mn_flb, Mn:flex.Mn,
    MnOmegaTfm:flex.MnOmega_tfm,
    Cv1:shear.Cv1,
    compactShearWeb:shear.isCompactWeb ? 1 : 0,
    VnTf:shear.Vn / 1000,
    VnOmegaTf:shear.VnOmega_tf,
    EI:deflection.EI,
    deltaD:deflection.deltaD,
    deltaL:deflection.deltaL,
    deltaT:deflection.deltaT,
    ratioL:deflection.ratioL,
    ratioT:deflection.ratioT,
    allowLive:Number(input.L) / Number(input.limitLive),
    allowTotal:Number(input.L) / Number(input.limitTotal)
  };
}

module.exports = { validateInput, calculate };
