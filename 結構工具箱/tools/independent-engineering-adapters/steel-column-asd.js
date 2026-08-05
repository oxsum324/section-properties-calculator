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
  for (const key of ['H', 'B', 'tw', 'tf', 'Fy', 'Lx', 'Ly', 'Kx', 'Ky', 'Lb', 'Cb', 'Pu', 'Mux', 'Muy', 'Cmx', 'Cmy']) {
    if (!Number.isFinite(Number(input?.[key])) || Number(input[key]) <= 0) issues.push(`${key}:positive-finite-required`);
  }
  if (!Number.isFinite(Number(input?.R)) || Number(input.R) < 0) issues.push('R:nonnegative-finite-required');
  if (Number(input?.H) <= 2 * Number(input?.tf)) issues.push('section:web-depth-positive-required');
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-steel-column-asd-benchmark-input:${issues.join(',')}`);

  const Fy = Number(input.Fy);
  const sec = Steel.calcProps({
    n:'independent-steel-column-benchmark',
    H:Number(input.H), B:Number(input.B), tw:Number(input.tw), tf:Number(input.tf), R:Number(input.R)
  });
  const cls = Steel.classifyCompression(sec, Fy);
  const KLrX = Number(input.Kx) * Number(input.Lx) / sec.rx;
  const KLrY = Number(input.Ky) * Number(input.Ly) / sec.ry;
  const pn = Steel.calcPn(sec, Fy, KLrX, KLrY);
  const flexX = Steel.calcMn(sec, Fy, Number(input.Lb), Number(input.Cb));
  const flexY = Steel.calcMny(sec, Fy);

  const fa = Number(input.Pu) * 1000 / sec.A;
  const fbx = Number(input.Mux) * 1e5 / sec.Sx;
  const fby = Number(input.Muy) * 1e5 / sec.Sy;
  const Fbx = flexX.Mn / (Steel.OMEGA.flexure * sec.Sx);
  const Fby = flexY.Mn / (Steel.OMEGA.flexure * sec.Sy);
  const Fex = 12 * Math.PI ** 2 * Steel.ES / (23 * KLrX ** 2);
  const Fey = 12 * Math.PI ** 2 * Steel.ES / (23 * KLrY ** 2);
  const interaction = Steel.calcInteractionASD(
    fa, pn.Fa, fbx, Fbx, fby, Fby,
    Number(input.Cmx), Number(input.Cmy), Fex, Fey, Fy
  );

  return {
    A:sec.A, Ix:sec.Ix, Iy:sec.Iy, Sx:sec.Sx, Sy:sec.Sy,
    Zx:sec.Zx, Zy:sec.Zy, rx:sec.rx, ry:sec.ry,
    lambdaF:cls.lambdaF, lambdaW:cls.lambdaW,
    lrfComp:cls.lrf_comp, lrwComp:cls.lrw_comp,
    nonSlenderFlange:cls.flangeSlender ? 0 : 1,
    nonSlenderWeb:cls.webSlender ? 0 : 1,
    KLrX, KLrY, KLr:pn.KLr,
    controlY:pn.axis === 'y' ? 1 : 0,
    Fe:pn.Fe, Cc:pn.Cc, limit:pn.limit,
    Q:pn.Q, Qs:pn.qr.Qs, Qa:pn.qr.Qa,
    compressionInelastic:pn.zone === 'inelastic' ? 1 : 0,
    Fcr:pn.Fcr, Pn:pn.Pn, PnOmegaTf:pn.PnOmega_tf,
    Fa:pn.Fa, PaAsdTf:pn.Pa_asd_tf,
    Lp:flexX.Lp, Lr:flexX.Lr,
    majorLtbInelastic:flexX.ltbZone === 'inelastic' ? 1 : 0,
    majorGoverningLtb:flexX.governing === 'LTB' ? 1 : 0,
    Mpx:flexX.Mp, Mrx:flexX.Mr, Mnx:flexX.Mn,
    MnxOmegaTfm:flexX.MnOmega_tfm,
    Mpy:flexY.Mpy, Mny:flexY.Mn, MnyOmegaTfm:flexY.MnyOmega_tfm,
    fa, fbx, fby, Fbx, Fby, Fex, Fey,
    interactionFull:interaction.eqUsed === 'full' ? 1 : 0,
    axialStressRatio:interaction.ratio,
    IR1:interaction.IR1, IR2:interaction.IR2,
    maxIR:Math.max(interaction.IR1, interaction.IR2 || 0),
    interactionOk:interaction.ok ? 1 : 0
  };
}

module.exports = { validateInput, calculate };
