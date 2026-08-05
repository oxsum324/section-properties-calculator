const PMSection = require('../../../鋼筋混凝土/shared/pmsection.js');

function validateInput(input) {
  const issues = [];
  if (!(Number(input?.b) > 0) || !(Number(input?.h) > 0)) issues.push('矩形柱 b、h 必須大於 0。');
  if (!(Number(input?.fc) > 0) || !(Number(input?.fy) > 0) || !(Number(input?.Es) > 0)) issues.push('材料強度與 Es 必須大於 0。');
  if (!(Number(input?.c) > 0) || !(Number(input?.beta1) > 0) || !(Number(input?.beta1) <= 1)) issues.push('中性軸 c 必須大於 0，beta1 必須介於 0 與 1。');
  if (!(Number(input?.phiComp) > 0) || !(Number(input?.phiComp) <= Number(input?.phiTen)) || !(Number(input?.phiTen) <= 1)) issues.push('強度折減係數必須滿足 0 < phiComp <= phiTen <= 1。');
  if (!(Number(input?.PnMaxFactor) > 0) || !(Number(input?.PnMaxFactor) <= 1)) issues.push('軸壓上限係數必須介於 0 與 1。');
  if (!Array.isArray(input?.bars) || input.bars.length < 2) issues.push('至少需要兩層縱向鋼筋。');
  for (const bar of input?.bars || []) {
    if (!(Number(bar.y) >= 0) || !(Number(bar.y) <= Number(input.h)) || !(Number(bar.As) > 0)) issues.push('鋼筋位置與面積不合法。');
  }
  return issues;
}

function calculate(input) {
  const sec = {
    b: Number(input.b),
    h: Number(input.h),
    bars: input.bars.map(bar => ({ y: Number(bar.y), As: Number(bar.As) }))
  };
  const mat = {
    fc: Number(input.fc),
    fy: Number(input.fy),
    Es: Number(input.Es),
    beta1: Number(input.beta1),
    phiComp: Number(input.phiComp),
    phiTen: Number(input.phiTen),
    PnMaxFactor: Number(input.PnMaxFactor)
  };
  const c = Number(input.c);
  const point = PMSection.point(c, sec, mat);
  const dt = Math.max(...sec.bars.map(bar => bar.y));
  const epsT = PMSection.EPS_CU * (dt - c) / c;
  const phi = PMSection.phiOf(epsT, mat.phiComp, mat.phiTen);
  const curve = PMSection.curve(sec, mat, { cRatios: [c / sec.h] });
  const Pn = point.Pn / 1000;
  const Mn = Math.abs(point.Mn) / 1e5;
  const phiPn = phi * Pn;
  const phiMn = phi * Mn;
  return {
    Pn,
    Mn,
    epsT,
    phi,
    phiPn,
    phiMn,
    Po: curve.Po,
    phiPnMax: curve.phiPnMax,
    designP: Pn > 0 ? Math.min(phiPn, curve.phiPnMax) : phiPn,
    designM: phiMn
  };
}

module.exports = {
  validateInput,
  calculate
};
