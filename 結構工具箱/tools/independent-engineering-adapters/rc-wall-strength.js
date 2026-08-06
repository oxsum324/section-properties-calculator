const fs = require('fs');
const path = require('path');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
require(path.resolve(__dirname, '../../core/materials/rebar.js'));
require(path.resolve(__dirname, '../../../鋼筋混凝土/shared/wall.js'));
require(path.resolve(__dirname, '../../../鋼筋混凝土/shared/pmsection.js'));
require(path.resolve(__dirname, '../../../鋼筋混凝土/shared/wall-inplane-evaluator.js'));

const formalPagePath = path.resolve(__dirname, '../../../鋼筋混凝土/tools/wall.html');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');
const requiredFormalWiring = [
  'const hmin = Wall.hmin(wallType, lc, lw);',
  'const isWallPier = Wall.isWallPier(hw, lw, h);',
  'const inplaneCapacity = WallInplaneEvaluator.computeCapacity(wallInplaneEvaluatorBase);',
  'const pmDemand = WallInplaneEvaluator.evaluatePMDemand(wallInplaneEvaluatorBase, { P:Pu / 1000, M:MuIn });',
  'const needTwoLayer = Wall.needTwoLayer({ Vu, phi: PHI.shear, alpha_c, lambda, fc, Acv, hwlw });',
  'const { rholMin, rhotMin } = Wall.minRho({ seismic, isShearWall, needTwoLayer, hwlw, rhot });',
  'const triCoef = isCantilever ? (1 / 6) : 0.0641;',
  'const uniCoef = isCantilever ? (1 / 2) : (1 / 8);',
  'const Mu_bw = 1.6 * (M_tri + M_uni + M_w);',
  'const spLim = Wall.spacingLimits(h, lw);',
  'const okAxial = okPM;',
  'const okShearChk = phiVn >= Vu;',
];
for (const wiring of requiredFormalWiring) {
  if (!formalPageSource.includes(wiring)) throw new Error('rc-wall-formal-page-wiring-drift');
}

const { REBAR_TABLE } = globalThis.Rebar;
const Wall = globalThis.Wall;
const Evaluator = globalThis.WallInplaneEvaluator;

function validateInput(input) {
  if (!Array.isArray(input?.cases) || input.cases.length !== 6) return ['cases:six-wall-routes-required'];
  const issues = [];
  const ids = new Set();
  for (const item of input.cases) {
    const id = item?.id || 'case';
    if (!item?.id || ids.has(item.id)) issues.push('cases:unique-id-required');
    ids.add(item?.id);
    for (const key of ['fc', 'fy', 'h', 'lw', 'lc', 'k', 'lambda', 'vSp', 'hSp', 'layers', 'cover', 'pmSteps']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${id}.${key}:positive-finite-required`);
    }
    for (const key of ['hw', 'e', 'P', 'V']) {
      if (!Number.isFinite(Number(item?.[key]))) issues.push(`${id}.${key}:finite-required`);
    }
    if (item?.M != null && !Number.isFinite(Number(item.M))) issues.push(`${id}.M:null-or-finite-required`);
    if (!['bearing', 'nonbearing', 'basement', 'shear'].includes(item?.wallType)) issues.push(`${id}.wallType:known-type-required`);
    if (!Number.isInteger(Number(item?.layers))) issues.push(`${id}.layers:integer-required`);
    if (!Number.isInteger(Number(item?.pmSteps)) || Number(item.pmSteps) < 2) issues.push(`${id}.pmSteps:integer-at-least-two-required`);
    for (const prefix of ['v', 'h']) {
      const bar = REBAR_TABLE[item?.[`${prefix}Bar`]];
      if (!bar) issues.push(`${id}.${prefix}Bar:known-rebar-required`);
      if (bar && Math.abs(bar.area - Number(item[`${prefix}BarArea`])) > 1e-12) issues.push(`${id}.${prefix}BarArea:catalog-mismatch`);
      if (bar && Math.abs(bar.db - Number(item[`${prefix}BarDb`])) > 1e-12) issues.push(`${id}.${prefix}BarDb:catalog-mismatch`);
    }
    const boundaryCount = Number(item?.boundaryBarCountEach || 0);
    if (!Number.isInteger(boundaryCount) || boundaryCount < 0) issues.push(`${id}.boundaryBarCountEach:nonnegative-integer-required`);
    if (boundaryCount > 0) {
      const bar = REBAR_TABLE[item?.boundaryBar];
      if (!bar) issues.push(`${id}.boundaryBar:known-rebar-required`);
      if (bar && Math.abs(bar.area - Number(item.boundaryBarArea)) > 1e-12) issues.push(`${id}.boundaryBarArea:catalog-mismatch`);
      if (bar && Math.abs(bar.db - Number(item.boundaryBarDb)) > 1e-12) issues.push(`${id}.boundaryBarDb:catalog-mismatch`);
    }
    if (item?.basement) {
      if (!['cantilever', 'simple'].includes(item.basement.support)) issues.push(`${id}.basement.support:known-model-required`);
      for (const key of ['H', 'gamma', 'Ka', 'surcharge', 'waterHeight', 'gammaWater']) {
        if (!Number.isFinite(Number(item.basement[key])) || Number(item.basement[key]) < 0) issues.push(`${id}.basement.${key}:nonnegative-finite-required`);
      }
    }
  }
  return issues;
}

function bool(value) {
  return value ? 1 : 0;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-rc-wall-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => {
    const vBar = REBAR_TABLE[item.vBar];
    const hBar = REBAR_TABLE[item.hBar];
    const boundaryBar = item.boundaryBarCountEach > 0 ? REBAR_TABLE[item.boundaryBar] : null;
    const isShearWall = Boolean(item.seismic) || item.wallType === 'shear';
    const rhol = item.layers * vBar.area / (item.h * item.vSp);
    const rhot = item.layers * hBar.area / (item.h * item.hSp);
    const base = {
      fc:item.fc, fy:item.fy, h:item.h, lw:item.lw, lc:item.lc, k:item.k, hw:item.hw,
      e:item.e, lambda:item.lambda, rhot, phiComp:0.65, phiTen:0.90, phiShear:0.75,
      pnMaxFactor:0.80, vBarArea:vBar.area, vBarDb:vBar.db, hBarDb:hBar.db,
      vSp:item.vSp, layers:item.layers, cover:item.cover,
      boundaryBarArea:boundaryBar ? boundaryBar.area : 0,
      boundaryBarDb:boundaryBar ? boundaryBar.db : 0,
      boundaryBarCountEach:item.boundaryBarCountEach,
      pmSteps:item.pmSteps, seismic:Boolean(item.seismic), wallType:item.wallType,
    };
    const hmin = Wall.hmin(item.wallType, item.lc, item.lw);
    const isWallPier = Wall.isWallPier(item.hw, item.lw, item.h);
    const capacity = Evaluator.computeCapacity(base);
    const pmCapacity = Evaluator.computePMCapacity(base);
    const moment = item.M == null ? item.P * item.e / 100 : item.M;
    const pm = Evaluator.evaluatePMDemand(base, { P:item.P, M:moment });
    const simple = Evaluator.evaluateDemand(base, { P:item.P, V:item.V });
    const VuKgf = Math.abs(item.V) * 1000;
    const needTwoLayer = Wall.needTwoLayer({
      Vu:VuKgf, phi:0.75, alpha_c:capacity.alpha_c, lambda:item.lambda,
      fc:item.fc, Acv:capacity.Acv, hwlw:capacity.hwlw,
    });
    const minimums = Wall.minRho({ seismic:Boolean(item.seismic), isShearWall, needTwoLayer, hwlw:capacity.hwlw, rhot });
    const spacing = Wall.spacingLimits(item.h, item.lw);

    let basement = { route:0, cantilever:0, simple:0, triCoef:0, uniCoef:0, pa:0, ps:0, pw:0, Mtri:0, Muni:0, Mw:0, Mu:0 };
    if (item.basement) {
      const isCantilever = item.basement.support === 'cantilever';
      const triCoef = isCantilever ? 1 / 6 : 0.0641;
      const uniCoef = isCantilever ? 1 / 2 : 1 / 8;
      const pa = item.basement.Ka * item.basement.gamma * item.basement.H;
      const ps = item.basement.Ka * item.basement.surcharge;
      const pw = item.basement.gammaWater * item.basement.waterHeight;
      const Mtri = triCoef * pa * item.basement.H ** 2;
      const Muni = uniCoef * ps * item.basement.H ** 2;
      const Mw = triCoef * pw * item.basement.waterHeight ** 2;
      basement = { route:1, cantilever:bool(isCantilever), simple:bool(!isCantilever), triCoef, uniCoef, pa, ps, pw, Mtri, Muni, Mw, Mu:1.6 * (Mtri + Muni + Mw) };
    }

    return [item.id, {
      bearingRoute:bool(item.wallType === 'bearing'),
      nonbearingRoute:bool(item.wallType === 'nonbearing'),
      basementRoute:basement.route,
      shearRoute:bool(isShearWall),
      basementCantileverRoute:basement.cantilever,
      basementSimpleRoute:basement.simple,
      hmin,
      thicknessOk:bool(item.h >= hmin),
      hwlwPier:item.hw / item.lw,
      lwbw:item.lw / item.h,
      wallPier:bool(isWallPier),
      fcLimitOk:bool(Wall.checkFcLimit(item.fc, isShearWall)),
      rhol,
      rhot,
      needTwoLayer:bool(needTwoLayer),
      layersOk:bool(!needTwoLayer || item.layers >= 2),
      rholMin:minimums.rholMin,
      rhotMin:minimums.rhotMin,
      rholOk:bool(rhol >= minimums.rholMin),
      rhotOk:bool(rhot >= minimums.rhotMin),
      spacingGeneral:spacing.general,
      spacingVertical:spacing.inplaneVertical,
      spacingHorizontal:spacing.inplaneHorizontal,
      vSpacingOk:bool(item.vSp <= spacing.general && (!isShearWall || item.vSp <= spacing.inplaneVertical)),
      hSpacingOk:bool(item.hSp <= spacing.general && (!isShearWall || item.hSp <= spacing.inplaneHorizontal)),
      eLimit:capacity.eLimit,
      eOk:bool(capacity.eOk),
      Ag:capacity.Ag,
      Pn:capacity.Pn,
      phiPn:capacity.phiPn || 0,
      hwlw:capacity.hwlw,
      alphaC:capacity.alpha_c,
      Vn:capacity.Vn,
      phiVn:capacity.phiVn,
      VnLimit:capacity.VnLimit,
      effectiveShearCapacity:capacity.effectiveShearCapacity,
      simpleEvaluated:bool(simple.status === 'evaluated'),
      simpleTensionFailClosed:bool(simple.status === 'tension-capacity-unresolved'),
      simpleEccentricityFailClosed:bool(simple.status === 'eccentricity-out-of-range'),
      simpleOk:bool(simple.ok),
      axialUtilization:simple.axialUtilization || 0,
      shearUtilization:simple.shearUtilization,
      shearLimitUtilization:simple.shearLimitUtilization,
      shearControlUtilization:simple.shearControlUtilization,
      moment,
      pmEvaluated:bool(pm.status === 'evaluated'),
      pmAxialOut:bool(pm.status === 'axial-out-of-range'),
      pmOk:bool(pm.ok),
      pmPhiMn:pm.phiMn || 0,
      pmUtilization:Number.isFinite(pm.utilization) ? pm.utilization : 0,
      pmPMin:pm.pMin,
      pmPMax:pm.pMax,
      pmPo:pm.Po,
      pmPhiPnMax:pm.phiPnMax,
      pmDistributedRows:pmCapacity.distributedRowCount,
      pmDistributedBars:pmCapacity.distributedBarCount,
      pmBoundaryBars:pmCapacity.boundaryBarCountTotal,
      pmAstDistributed:pmCapacity.AstDistributed,
      pmAstBoundary:pmCapacity.AstBoundary,
      pmAst:pmCapacity.Ast,
      pmEdgeOffset:pmCapacity.edgeOffset,
      pmBoundaryEdgeOffset:pmCapacity.boundaryEdgeOffset || 0,
      pmThroughThicknessOffset:pmCapacity.throughThicknessOffset,
      pmActualSpacing:pmCapacity.actualSpacing,
      basementTriCoef:basement.triCoef,
      basementUniCoef:basement.uniCoef,
      basementPa:basement.pa,
      basementPs:basement.ps,
      basementPw:basement.pw,
      basementMtri:basement.Mtri,
      basementMuni:basement.Muni,
      basementMw:basement.Mw,
      basementMu:basement.Mu,
      coreChecksOk:bool(item.h >= hmin && !isWallPier && pm.ok
        && capacity.phiVn >= VuKgf && rhol >= minimums.rholMin && rhot >= minimums.rhotMin
        && (!needTwoLayer || item.layers >= 2)),
    }];
  }));
}

module.exports = { validateInput, calculate };
