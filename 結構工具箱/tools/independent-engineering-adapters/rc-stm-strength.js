'use strict';

const DeepBeamSTM = require('../../../鋼筋混凝土/shared/deep-beam-stm.js');
const FoundationDeepBeamSTM = require('../../../鋼筋混凝土/shared/foundation-deep-beam-stm.js');
const PileCap3DSTM = require('../../../鋼筋混凝土/shared/pile-cap-3d-stm.js');

const MODES = new Set(['deep-beam', 'foundation-2d', 'pile-cap-3d']);

function validateInput(input) {
  const issues = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) issues.push('input-object-required');
  if (!MODES.has(String(input?.mode || ''))) issues.push('mode-must-be-deep-beam-foundation-2d-or-pile-cap-3d');
  if (!input?.case || typeof input.case !== 'object' || Array.isArray(input.case)) issues.push('case-object-required');
  return issues;
}

function pass(value) {
  return value ? 1 : 0;
}

function requireValid(result, mode) {
  if (!result || result.valid !== true) {
    const details = Array.isArray(result?.errors) ? result.errors.join('|') : 'unknown-production-result';
    throw new Error(`${mode}-production-invalid:${details}`);
  }
  return result;
}

function deepBeamResult(input) {
  const result = requireValid(DeepBeamSTM.assess(input), 'deep-beam');
  return {
    a:result.a,
    reaction:result.reaction,
    thetaRad:result.thetaRad,
    thetaDeg:result.thetaDeg,
    angleMarginDeg:result.thetaDeg - 25,
    angleOk:pass(result.checks.angleOk),
    strutDemand:result.strutDemand,
    tieDemand:result.tieDemand,
    tieAsStm:result.tieAsStm,
    tieAsMin:result.tieAsMin,
    tieAsRequired:result.tieAsRequired,
    tieProvidedArea:result.tieLayout.providedArea,
    tieCentroidFromBottom:result.tieLayout.centroidFromBottom,
    tieMinHorizontalClear:result.tieLayout.minHorizontalClear,
    tieBandDepth:result.tieLayout.tieBandDepth,
    tieRows:result.tieLayout.input.rows,
    minimumSteelControls:pass(result.tieAsMin >= result.tieAsStm - 1e-9),
    strutFce:result.strutFce,
    strutDesign:result.strutDesign,
    topNodeDesign:result.topNodeDesign,
    bottomNodeDesign:result.bottomNodeDesign,
    rhoVertical:result.rhoVertical,
    rhoHorizontal:result.rhoHorizontal,
    distributedSpacingLimit:result.distributedSpacingLimit,
    shearDesignLimit99:result.shearDesignLimit99,
    shearDesignLimit2344:result.shearDesignLimit2344,
    shear2344Required:pass(result.check2344Required),
    tieOk:pass(result.checks.tieOk),
    tieLayoutOk:pass(result.checks.tieLayoutOk),
    strutOk:pass(result.checks.strutOk),
    nodesOk:pass(result.checks.topNodeOk && result.checks.bottomNodeOk),
    distributionOk:pass(result.checks.distributionOk),
    shearLimitsOk:pass(result.checks.shearLimit99Ok
      && (!result.check2344Required || result.checks.shearLimit2344Ok)),
    strengthPass:pass(result.strengthPass),
  };
}

function foundation2dResult(input) {
  const result = requireValid(FoundationDeepBeamSTM.assess(input), 'foundation-2d');
  return {
    d:result.d,
    z:result.z,
    reactionModeSoilUniform:pass(result.input.reactionMode === 'soil-uniform'),
    reactionNodeCount:result.nodes.length,
    reactionTotal:result.reactionTotal,
    reactionMoment:result.reactionMoment,
    balanceErrorPct:result.balanceErrorPct,
    momentErrorPct:result.momentErrorPct,
    horizontalResidual:result.horizontalResidual,
    horizontalAction:result.horizontalAction,
    horizontalResidualPct:result.horizontalResidualPct,
    minThetaDeg:result.minThetaDeg,
    angleMarginDeg:result.minThetaDeg - 25,
    angleOk:pass(result.checks.angleOk),
    firstStrutDemand:result.nodes[0].strutDemand,
    maximumStrutDemand:Math.max(...result.nodes.map(node => node.strutDemand)),
    firstTieSegmentDemand:result.tieSegments[0].demand,
    middleTieSegmentDemand:result.tieSegments[Math.floor(result.tieSegments.length / 2)].demand,
    tieDemand:result.tieDemand,
    tieAsStm:result.tieAsStm,
    tieAsRequired:result.tieAsRequired,
    tieProvidedArea:result.tieLayout.providedArea,
    tieCentroidFromBottom:result.tieLayout.centroidFromBottom,
    tieRows:result.tieLayout.input.rows,
    strutFce:result.strutFce,
    strutDesign:result.strutDesign,
    maxStrutDcr:result.maxStrutDcr,
    topNodeDesign:result.topNodeDesign,
    bottomNodeDesign:result.bottomNodeResults[0].design,
    criticalSectionX:result.criticalSectionX,
    shearDemand:result.shearDemand,
    lambdaS:result.lambdaS,
    shearDesignLimit2344:result.shearDesignLimit2344,
    shear2344Margin:result.shearDesignLimit2344 - result.shearDemand,
    shear2344Required:pass(result.check2344Required),
    shear2344Ok:pass(result.checks.shearLimit2344Ok),
    topologyOk:pass(result.checks.topologyOk),
    tieOk:pass(result.checks.tieOk),
    tieLayoutOk:pass(result.checks.tieLayoutOk),
    strutOk:pass(result.checks.strutOk),
    nodesOk:pass(result.checks.topNodeOk && result.checks.bottomNodeOk),
    pileEffectiveDepthOk:pass(result.checks.pileEffectiveDepthOk),
    strengthPass:pass(result.strengthPass),
  };
}

function pileCap3dResult(input) {
  const result = requireValid(PileCap3DSTM.assess(input), 'pile-cap-3d');
  return {
    loadX:result.loadX,
    loadY:result.loadY,
    pileNodeCount:result.nodes.length,
    gridXCount:result.grid.xCoordinates.length,
    gridYCount:result.grid.yCoordinates.length,
    z:result.z,
    dX:result.dX,
    dY:result.dY,
    reactionTotal:result.reactionTotal,
    reactionMomentX:result.reactionMomentX,
    reactionMomentY:result.reactionMomentY,
    targetMomentX:result.targetMomentX,
    targetMomentY:result.targetMomentY,
    forceErrorPct:result.forceErrorPct,
    momentXErrorPct:result.momentXErrorPct,
    momentYErrorPct:result.momentYErrorPct,
    horizontalResidualX:result.horizontalResidualX,
    horizontalResidualY:result.horizontalResidualY,
    horizontalResidualXPct:result.horizontalResidualXPct,
    horizontalResidualYPct:result.horizontalResidualYPct,
    minThetaDeg:result.minThetaDeg,
    minThetaXDeg:result.minThetaXDeg,
    minThetaYDeg:result.minThetaYDeg,
    angleMarginDeg:result.minThetaDeg - 25,
    angleOk:pass(result.checks.angleOk),
    xTieDemand:result.xTieDemand,
    yTieDemand:result.yTieDemand,
    xTieAsStm:result.xTieAsStm,
    yTieAsStm:result.yTieAsStm,
    xTieAsRequired:result.xTieAsRequired,
    yTieAsRequired:result.yTieAsRequired,
    xTieProvidedArea:result.xTieLayout.providedArea,
    yTieProvidedArea:result.yTieLayout.providedArea,
    xTieCentroidFromBottom:result.xTieLayout.centroidFromBottom,
    yTieCentroidFromBottom:result.yTieLayout.centroidFromBottom,
    xTieRows:result.xTieLayout.input.rows,
    yTieRows:result.yTieLayout.input.rows,
    tieLayerOffset:result.tieLayerOffset,
    tieLayerOffsetLimit:Math.max(input.xTie.barDiameter, input.yTie.barDiameter),
    tieLayerOffsetMargin:Math.max(input.xTie.barDiameter, input.yTie.barDiameter) - result.tieLayerOffset,
    strutFce:result.strutFce,
    strutDesign:result.strutDesign,
    maxStrutDcr:result.maxStrutDcr,
    topNodeDesign:result.topNodeDesign,
    bottomNodeDesign:result.bottomNodeDesign,
    criticalSectionX:result.criticalSectionX,
    criticalSectionY:result.criticalSectionY,
    shearX:result.shearX.demand,
    shearY:result.shearY.demand,
    lambdaSX:result.lambdaSX,
    lambdaSY:result.lambdaSY,
    shearDesignLimitX:result.shearDesignLimitX,
    shearDesignLimitY:result.shearDesignLimitY,
    shear2344Required:pass(result.check2344Required),
    shearLimitsOk:pass(result.checks.shearLimitXOk && result.checks.shearLimitYOk),
    topologyOk:pass(result.checks.topologyOk),
    tiesOk:pass(result.checks.xTieOk && result.checks.yTieOk && result.checks.tieLayoutOk),
    tieLayerOffsetOk:pass(result.checks.tieLayerOffsetOk),
    strutOk:pass(result.checks.strutOk),
    nodesOk:pass(result.checks.topNodeOk && result.checks.bottomNodeOk),
    pileEffectiveDepthOk:pass(result.checks.pileEffectiveDepthOk),
    strengthPass:pass(result.strengthPass),
  };
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new Error(issues.join('|'));
  if (input.mode === 'deep-beam') return deepBeamResult(input.case);
  if (input.mode === 'foundation-2d') return foundation2dResult(input.case);
  return pileCap3dResult(input.case);
}

module.exports = { validateInput, calculate };
