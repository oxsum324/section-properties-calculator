const fs = require('fs');
const path = require('path');

const productionPagePath = path.resolve(__dirname, '../../../鋼筋混凝土/tools/slab.html');
const productionPageSource = fs.readFileSync(productionPagePath, 'utf8');
const SlabEvaluator = require('../../../鋼筋混凝土/shared/slab-evaluator.js');
const Flexure = require('../../../鋼筋混凝土/shared/flexure.js');

for (const token of [
  '<script src="../shared/slab-evaluator.js?v=1"></script>',
  'SlabEvaluator.minimumThickness({',
  'SlabEvaluator.analyzeStripMoments({',
  'SlabEvaluator.temperatureRatio(fyT)',
  'SlabEvaluator.oneWayShearNoReinf({',
  'Flexure.designAsRect({',
  'Flexure.phiMnRect({',
]) {
  if (!productionPageSource.includes(token)) throw new Error(`rc-slab-page-contract-missing:${token}`);
}

function validateInput(input) {
  const issues = [];
  if (!Array.isArray(input?.cases) || input.cases.length !== 2) issues.push('cases:two-required');
  for (const [index, item] of (input?.cases || []).entries()) {
    const prefix = `cases[${index}]`;
    for (const key of ['Lx', 'Ly', 'h', 'cover', 'supW', 'fc', 'fy', 'fyT', 'wu', 'barDiameter', 'barArea', 'barSpacing']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${prefix}.${key}:positive-finite-required`);
    }
    if (!['simple', 'oneEnd', 'bothEnd', 'cantilever'].includes(item?.supportX)) issues.push(`${prefix}.supportX:unsupported`);
    if (!(Number(item?.h) > Number(item?.cover) + Number(item?.barDiameter) / 2)) issues.push(`${prefix}.geometry:nonpositive-effective-depth`);
  }
  return issues;
}

function calculateCase(input) {
  const hmin = SlabEvaluator.minimumThickness({ ...input, stype:'one' });
  const strips = SlabEvaluator.analyzeStripMoments({
    stype:'one', Lx:input.Lx, Ly:input.Ly, wu:input.wu,
    supportX:input.supportX, supportY:'simple',
  });
  const temperature = SlabEvaluator.temperatureRatio(input.fyT);
  const b = 100;
  const d = input.h - input.cover - input.barDiameter / 2;
  const AsProvided = input.barArea * 100 / input.barSpacing;
  const AsMinimum = temperature.rho * b * input.h;
  const designAt = Mu => {
    const design = Flexure.designAsRect({ b, d, Mu_kgcm:Mu * 100000, fc:input.fc, fy:input.fy });
    const AsRequired = Math.max(design.As, AsMinimum);
    const capacity = Flexure.phiMnRect({ b, d, h:input.h, As:AsProvided, fc:input.fc, fy:input.fy });
    const phiMn = capacity.phiMn / 100000;
    return { AsRequired, phiMn, ratio:Mu / phiMn, pass:AsProvided >= AsRequired && phiMn >= Mu ? 1 : 0 };
  };
  const positive = designAt(strips.Xpos);
  const negative = designAt(strips.Xneg);
  const rhoW = AsProvided / (b * d);
  const shear = SlabEvaluator.oneWayShearNoReinf({ fc:input.fc, lambda:1, b, d, rhoW, phi:0.75 });
  const shearRatio = strips.VuX / shear.phiVc;
  const thicknessPass = input.h >= hmin.hmin ? 1 : 0;
  const overallPass = thicknessPass && positive.pass && negative.pass && shear.phiVc >= strips.VuX ? 1 : 0;

  return {
    hmin:hmin.hmin,
    thicknessPass,
    spanM:strips.lnX,
    positiveCoefficient:SlabEvaluator.getCoefficients(input.supportX).pos,
    negativeCoefficient:SlabEvaluator.getCoefficients(input.supportX).neg,
    positiveMoment:strips.Xpos,
    negativeMoment:strips.Xneg,
    shearDemand:strips.VuX,
    temperatureRatio:temperature.rho,
    AsMinimum,
    effectiveDepth:d,
    AsProvided,
    positiveAsRequired:positive.AsRequired,
    negativeAsRequired:negative.AsRequired,
    positivePhiMn:positive.phiMn,
    negativePhiMn:negative.phiMn,
    positiveRatio:positive.ratio,
    negativeRatio:negative.ratio,
    positivePass:positive.pass,
    negativePass:negative.pass,
    rhoW,
    sizeEffect:shear.lambdaS,
    vc:shear.vc,
    Vc:shear.Vc,
    phiVc:shear.phiVc,
    shearRatio,
    shearPass:shear.phiVc >= strips.VuX ? 1 : 0,
    overallPass,
  };
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-rc-slab-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => [item.id, calculateCase(item)]));
}

module.exports = { validateInput, calculate };
