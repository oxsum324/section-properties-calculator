const path = require('path');

const Flexure = require(path.resolve(__dirname, '../../../鋼筋混凝土/shared/flexure.js'));
require(path.resolve(__dirname, '../../../鋼筋混凝土/shared/beam-evaluator.js'));
const BeamEvaluator = globalThis.BeamEvaluator;

function validateInput(input) {
  const issues = [];
  const positive = [
    'b', 'h', 'dPositive', 'dNegative', 'asPositive', 'asNegative',
    'fc', 'fy', 'beta1', 'fyt', 'Av', 'stirrupSpacing', 'phiShear',
    'lambda', 'Ve', 'momentDemand', 'shearDemand', 'axialDemand'
  ];
  for (const key of positive) {
    if (!Number.isFinite(Number(input?.[key])) || Number(input[key]) <= 0) {
      issues.push(`${key}:positive-finite-required`);
    }
  }
  if (Number(input?.dPositive) >= Number(input?.h) || Number(input?.dNegative) >= Number(input?.h)) {
    issues.push('effective-depth:less-than-section-depth-required');
  }
  return issues;
}

function flexureResult(input, As, d) {
  const section = Flexure.solveSection({
    shape: { type:'rect', b:Number(input.b) },
    h:Number(input.h),
    layers:[{ y:Number(d), As:Number(As) }],
    fc:Number(input.fc),
    fy:Number(input.fy),
    beta1:Number(input.beta1)
  });
  const phi = Flexure.phiFlexure(section.epsT_max, Number(input.fy));
  return {
    c:section.c,
    a:section.a,
    Cc:section.Cc,
    eqN:section.eqN,
    Mn:section.Mn,
    epsT:section.epsT_max,
    phi,
    phiMn:phi * section.Mn,
    valid:section.valid ? 1 : 0
  };
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-rc-beam-benchmark-input:${issues.join(',')}`);

  const positive = flexureResult(input, input.asPositive, input.dPositive);
  const negative = flexureResult(input, input.asNegative, input.dNegative);
  const shearBase = {
    fc:Number(input.fc),
    fyt:Number(input.fyt),
    bw:Number(input.b),
    h:Number(input.h),
    d:Number(input.dPositive),
    Ag:Number(input.b) * Number(input.h),
    Av:Number(input.Av),
    s:Number(input.stirrupSpacing),
    rhoShear:Number(input.asPositive) / (Number(input.b) * Number(input.dPositive)),
    phiShear:Number(input.phiShear),
    lambda:Number(input.lambda),
    sectionType:'rect',
    seismic:true,
    Ve:Number(input.Ve) * 1000,
    enableTorsion:false
  };
  const shear = BeamEvaluator.computeShearState(shearBase, {
    Pu:Number(input.axialDemand) * 1000,
    Vu:Number(input.shearDemand) * 1000,
    Tu:0
  });
  const demand = BeamEvaluator.evaluateDemand({
    phiMnPos:positive.phiMn / 1e5,
    phiMnNeg:negative.phiMn / 1e5,
    shearBase
  }, {
    M:Number(input.momentDemand),
    V:Number(input.shearDemand),
    P:Number(input.axialDemand),
    T:0
  });

  return {
    positiveC:positive.c,
    positiveA:positive.a,
    positiveCc:positive.Cc,
    positiveEqN:positive.eqN,
    positiveMn:positive.Mn,
    positiveEpsT:positive.epsT,
    positivePhi:positive.phi,
    positivePhiMn:positive.phiMn,
    positiveValid:positive.valid,
    negativeC:negative.c,
    negativeA:negative.a,
    negativeCc:negative.Cc,
    negativeEqN:negative.eqN,
    negativeMn:negative.Mn,
    negativeEpsT:negative.epsT,
    negativePhi:negative.phi,
    negativePhiMn:negative.phiMn,
    negativeValid:negative.valid,
    asMinPositive:Flexure.asMinFlexure(Number(input.b), Number(input.dPositive), Number(input.fc), Number(input.fy)),
    asMinNegative:Flexure.asMinFlexure(Number(input.b), Number(input.dNegative), Number(input.fc), Number(input.fy)),
    AvProvidedPerS:shear.AvProvidedPerS,
    AvMinPerS:shear.AvMinPerS,
    hasMinStir:shear.hasMinStir ? 1 : 0,
    Vc:shear.Vc,
    phiVc:shear.phiVc,
    VsProvided:shear.Vs_provided,
    phiVs:shear.phiVs,
    phiVn:shear.phiVn,
    forceVc0:shear.forceVc0 ? 1 : 0,
    phiVnEffective:shear.phiVn_eff,
    shearDemand:shear.shearDemand,
    veControls:shear.shearDemandSource === 'Ve' ? 1 : 0,
    flexureUtilization:demand.flexureUtilization,
    shearUtilization:demand.shearUtilization,
    governingUtilization:demand.utilization,
    overallPass:demand.ok ? 1 : 0
  };
}

module.exports = { validateInput, calculate };
