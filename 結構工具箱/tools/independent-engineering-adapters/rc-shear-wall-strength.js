const path = require('path');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
require(path.resolve(__dirname, '../../core/materials/rebar.js'));
require(path.resolve(__dirname, '../../../鋼筋混凝土/shared/pmsection.js'));
require(path.resolve(__dirname, '../../../鋼筋混凝土/shared/wall.js'));
require(path.resolve(__dirname, '../../../鋼筋混凝土/shared/wall-base.js'));
require(path.resolve(__dirname, '../../../鋼筋混凝土/shared/wall-evaluator.js'));

const { REBAR_TABLE } = globalThis.Rebar;
const Wall = globalThis.Wall;
const WallBase = globalThis.WallBase;
const WallEvaluator = globalThis.WallEvaluator;

function validateInput(input) {
  const issues = [];
  const positive = [
    'fc', 'fy', 'fyt', 'lambda', 'tw', 'lw', 'hw', 'cover', 'coreCover', 'Pu', 'Mu', 'Vu', 'duhw',
    'nBE', 'aBE', 'dbBE', 'lbe', 'aV', 'sV', 'nLayer', 'aH', 'sH', 'aTie', 'sTie',
    'nLegTie', 'hx', 'hu', 'bComp', 'pmSteps'
  ];
  for (const key of positive) {
    if (!Number.isFinite(Number(input?.[key])) || Number(input[key]) <= 0) {
      issues.push(`${key}:positive-finite-required`);
    }
  }
  for (const key of ['dBE', 'dV', 'dH', 'dTie']) {
    if (!REBAR_TABLE[input?.[key]]) issues.push(`${key}:known-rebar-required`);
  }
  const catalogChecks = [
    ['dBE', 'aBE', 'area'], ['dBE', 'dbBE', 'db'], ['dV', 'aV', 'area'],
    ['dH', 'aH', 'area'], ['dTie', 'aTie', 'area']
  ];
  for (const [barKey, inputKey, property] of catalogChecks) {
    const bar = REBAR_TABLE[input?.[barKey]];
    if (bar && Math.abs(bar[property] - Number(input[inputKey])) > 1e-12) {
      issues.push(`${inputKey}:rebar-catalog-mismatch`);
    }
  }
  if (!Number.isInteger(Number(input?.pmSteps)) || Number(input.pmSteps) < 2) issues.push('pmSteps:integer-at-least-two-required');
  if (Number(input?.cover) * 2 >= Number(input?.tw)) issues.push('cover:less-than-half-thickness-required');
  if (Number(input?.coreCover) * 2 >= Number(input?.tw) || Number(input?.coreCover) * 2 >= Number(input?.lbe)) issues.push('coreCover:valid-core-dimensions-required');
  if (Number(input?.lbe) * 2 >= Number(input?.lw)) issues.push('lbe:non-overlap-required');
  if (!['direct', 'amplified'].includes(input?.shearDemandMode)) issues.push('shearDemandMode:known-mode-required');
  return issues;
}

function bool(value) {
  return value ? 1 : 0;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-rc-shear-wall-benchmark-input:${issues.join(',')}`);

  const g = {
    seismic:Boolean(input.seismic),
    scopeSingleWall:Boolean(input.scopeSingleWall),
    scopeNoOpening:Boolean(input.scopeNoOpening),
    scopeAnalysisReady:Boolean(input.scopeAnalysisReady),
    fc:Number(input.fc), fy:Number(input.fy), fyt:Number(input.fyt), lambda:Number(input.lambda),
    tw:Number(input.tw), lw:Number(input.lw), hw:Number(input.hw), cover:Number(input.cover), coreCover:Number(input.coreCover),
    Pu:Number(input.Pu), Mu:Number(input.Mu), Vu:Number(input.Vu), duhw:Number(input.duhw),
    shearDemandMode:input.shearDemandMode,
    Vuns:Number(input.Vuns || 0), VuEh:Number(input.VuEh || 0),
    omegaV:Number(input.omegaV || 1), omegaW:Number(input.omegaW || 1),
    nBE:Number(input.nBE), dBE:input.dBE, lbe:Number(input.lbe),
    dV:input.dV, sV:Number(input.sV), nLayer:Number(input.nLayer),
    dH:input.dH, sH:Number(input.sH),
    hasJoint:Boolean(input.hasJoint), jointSurface:input.jointSurface,
    dTie:input.dTie, sTie:Number(input.sTie), nLegTie:Number(input.nLegTie), hx:Number(input.hx),
    hu:Number(input.hu), bComp:Number(input.bComp)
  };
  const base = WallBase.buildBase(g, { pmSteps:Number(input.pmSteps) });
  Object.assign(base, g, { rholOk:true, rhotOk:true, spVOk:true, spHOk:true });
  const loadCase = {
    name:'獨立基準工況', Pu:g.Pu, Mu:g.Mu, Vu:g.Vu, duhw:g.duhw,
    shearDemandMode:g.shearDemandMode, Vuns:g.Vuns, VuEh:g.VuEh,
    omegaV:g.omegaV, omegaW:g.omegaW
  };
  const preliminary = WallEvaluator.evaluateLoadCase(base, loadCase);
  const minimums = Wall.minRho({ seismic:g.seismic, isShearWall:true, needTwoLayer:preliminary.needTwoLayer, hwlw:base.hwlw, rhot:base.rhot });
  Object.assign(base, minimums, {
    rholOk:base.rhol >= minimums.rholMin - 1e-9,
    rhotOk:base.rhot >= minimums.rhotMin - 1e-9,
    spVOk:g.sV <= base.spVmax + 1e-9,
    spHOk:g.sH <= base.spHmax + 1e-9
  });
  const result = WallEvaluator.evaluateLoadCase(base, loadCase);

  return {
    barRows:base.bars.length,
    webBarRows:base.shearFricNWeb,
    AstTotal:base.AstTotal,
    rhol:base.rhol,
    rhot:base.rhot,
    Po:base.pm.Po,
    phiPnMax:base.pm.phiPnMax,
    pmPMin:result.pmPMin,
    pmPMax:result.pmPMax,
    cAtPu:result.cAtPu,
    phiMn:result.phiMn,
    pmUtil:result.pmUtil,
    pmOk:bool(result.pmOk),
    alphaC:base.alpha_c,
    Vn:base.Vn,
    VnMaxSingle:base.VnMaxSingle,
    Ve:result.Ve,
    MnNomAtPu:result.MnNomAtPu,
    Vmn:result.Vmn_kgf,
    phiShear:result.phiShear,
    phiVn:result.phiVn,
    shearUtil:result.shearUtil,
    flexureControlled:bool(result.flexureControlled),
    shearOk:bool(result.shearOk),
    vnMaxOk:bool(result.vnMaxOk),
    needTwoLayer:bool(result.needTwoLayer),
    twoLayerOk:bool(result.twoLayerOk),
    sigmaFiber:result.sigmaFiber,
    cLimit:result.cLimit,
    sigmaTrig:bool(result.sigmaTrig),
    cTrig:bool(result.cTrig),
    sbeReq:bool(result.sbeReq),
    sbeHoriz:result.sbeHoriz,
    sbeVert:result.sbeVert,
    sbeExtX:result.sbeExtX,
    bWidthMin:result.bWidthMin,
    hxLimit:result.hxLimit,
    sbeLengthOk:bool(result.sbeLengthOk),
    sbeBWidthOk:bool(result.sbeBWidthOk),
    sbeHxOk:bool(result.sbeHxOk),
    sbeSpLimit:base.sbeSpLimit,
    sbeAg:base.sbeAg,
    sbeAch:base.sbeAch,
    sbeAgAchRatio:base.sbeAgAchRatio,
    AshReqEqA:base.AshReqEqA,
    AshReqEqB:base.AshReqEqB,
    AshReq:base.AshReq,
    AshProv:base.AshProv,
    sbeSpOk:bool(result.sbeSpOk),
    sbeAshOk:bool(result.sbeAshOk),
    sbeDesignOk:bool(result.sbeDesignOk),
    shearFricLimit:result.shearFricLim,
    shearFricActive:bool(result.shearFricActive),
    shearFricAvfProv:result.shearFricAvfProv,
    shearFricAvfReq:result.shearFricAvfReq,
    shearFricVn:result.shearFricDesign.Vn,
    shearFricPhiVn:result.shearFricDesign.phiVn,
    shearFricOk:bool(result.shearFricOk),
    rholOk:bool(base.rholOk),
    rhotOk:bool(base.rhotOk),
    spVOk:bool(base.spVOk),
    spHOk:bool(base.spHOk),
    overallOk:bool(result.overallOk)
  };
}

module.exports = { validateInput, calculate };
