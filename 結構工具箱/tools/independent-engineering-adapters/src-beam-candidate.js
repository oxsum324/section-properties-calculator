const path = require('path');

const productionCorePath = path.resolve(__dirname, '../../../SRC工具/core/src-beam-core.js');
const SrcBeamCore = require(productionCorePath);

function validateInput(input) {
  const issues = [];
  if (!input || !Array.isArray(input.cases) || input.cases.length < 1) return ['cases:nonempty-array-required'];
  const ids = new Set();
  for (const [index, item] of input.cases.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push(`cases[${index}]:object-required`);
      continue;
    }
    if (!item.id || ids.has(item.id)) issues.push(`cases[${index}].id:unique-required`);
    ids.add(item.id);
    const validation = SrcBeamCore.validateInput(item);
    for (const blocked of validation.blocked) issues.push(`cases[${index}]:${blocked.code}`);
  }
  return issues;
}

function mapResult(result) {
  return {
    neutralAxisCm: result.flexure.neutralAxisCm,
    stressBlockDepthCm: result.flexure.stressBlockDepthCm,
    compressionSteelStress: result.flexure.compressionSteel.stress,
    mnRcTfM: result.flexure.mnRcTfM,
    mnSteelTfM: result.flexure.mnSteelTfM,
    nominalMomentTfM: result.flexure.nominalMomentTfM,
    designMomentTfM: result.flexure.designMomentTfM,
    flexuralUtilization: result.flexure.utilization,
    flangeRatio: result.compactness.flangeRatio,
    flangeLimit: result.compactness.flangeLimit,
    webRatio: result.compactness.webRatio,
    webLimit: result.compactness.webLimit,
    vnSteelTf: result.shear.vnSteelTf,
    stirrupRawTf: result.shear.stirrupRawTf,
    stirrupCapTf: result.shear.stirrupCapTf,
    vnrTf: result.shear.vnrTf,
    vncTf: result.shear.vncTf,
    vnRcGeneralTf: result.shear.vnRcGeneralTf,
    frictionStirrupRawTf: result.shear.frictionStirrupRawTf,
    frictionStirrupCapTf: result.shear.frictionStirrupCapTf,
    vnrFrictionTf: result.shear.vnrFrictionTf,
    netConcreteWidthCm: result.shear.netConcreteWidthCm,
    vncFrictionTf: result.shear.vncFrictionTf,
    vnRcFrictionTf: result.shear.vnRcFrictionTf,
    vnRcTf: result.shear.vnRcTf,
    steelDemandShare: result.shear.steelDemandShare,
    rcDemandShare: result.shear.rcDemandShare,
    steelUtilization: result.shear.steelUtilization,
    rcUtilization: result.shear.rcUtilization,
    governingUtilization: result.governingUtilization,
    flangeCompactnessPass: result.checks.flangeCompactness ? 1 : 0,
    webCompactnessPass: result.checks.webCompactness ? 1 : 0,
    flexurePass: result.checks.flexure ? 1 : 0,
    steelShearSharePass: result.checks.steelShearShare ? 1 : 0,
    rcShearSharePass: result.checks.rcShearShare ? 1 : 0,
    overallOk: result.status === 'OK' ? 1 : 0,
  };
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-src-beam-candidate-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => [item.id, mapResult(SrcBeamCore.calculate(item))]));
}

module.exports = { validateInput, calculate };
