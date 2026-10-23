const assert = require('assert');
require('./wall.js');
require('./pmsection.js');
require('./wall-inplane-evaluator.js');

const Evaluator = global.WallInplaneEvaluator;
const base = {
  fc:280, fy:4200, h:25, lw:500, lc:300, k:1, hw:1200,
  e:2, lambda:1, rhot:0.003, phiComp:0.65, phiShear:0.75,
  phiTen:0.90, pnMaxFactor:0.80,
  vBarArea:1.267, vBarDb:1.27, hBarDb:1.27, vSp:20, layers:2, cover:2,
  seismic:false, wallType:'bearing',
};

const capacity = Evaluator.computeCapacity(base);
assert.equal(capacity.status, 'evaluated');
assert.equal(capacity.eOk, true);
assert.ok(capacity.phiPn > 0 && capacity.phiVn > 0);

const pmCapacity = Evaluator.computePMCapacity(base);
assert.equal(pmCapacity.status, 'evaluated');
assert.ok(pmCapacity.pMin < 0 && pmCapacity.pMax > 0);
assert.ok(pmCapacity.barCount >= 2 && pmCapacity.actualSpacing <= base.vSp + 1e-9);
assert.equal(pmCapacity.AstBoundary, 0);

const boundaryBase = {
  ...base,
  boundaryBarArea:5.067,
  boundaryBarDb:2.54,
  boundaryBarCountEach:4,
};
const boundaryCapacity = Evaluator.computePMCapacity(boundaryBase);
assert.equal(boundaryCapacity.status, 'evaluated');
assert.equal(boundaryCapacity.boundaryBarCountTotal, 8);
assert.ok(Math.abs(boundaryCapacity.AstBoundary - 8 * 5.067) < 1e-9);
assert.ok(Math.abs(boundaryCapacity.Ast - pmCapacity.Ast - boundaryCapacity.AstBoundary) < 1e-9);
assert.ok(boundaryCapacity.pMin < pmCapacity.pMin, 'additional end bars increase axial tension capacity');
assert.ok(boundaryCapacity.boundaryEdgeOffset > base.cover);

const coverCapacity = Evaluator.computePMCapacity({ ...base, cover:5 });
assert.equal(coverCapacity.status, 'evaluated');
assert.ok(coverCapacity.edgeOffset > pmCapacity.edgeOffset);

const invalidBoundary = Evaluator.computePMCapacity({ ...base, boundaryBarCountEach:2.5, boundaryBarArea:5.067, boundaryBarDb:2.54 });
assert.equal(invalidBoundary.status, 'capacity-unresolved');
const invalidThickness = Evaluator.computePMCapacity({ ...base, h:10, cover:4 });
assert.equal(invalidThickness.status, 'capacity-unresolved');

const pmCompression = Evaluator.pmScore(base, { P:80, M:30 });
assert.equal(pmCompression.status, 'evaluated');
assert.ok(pmCompression.phiMn > 0 && pmCompression.utilization > 0);

const pmBoundaryCompression = Evaluator.pmScore(boundaryBase, { P:80, M:30 });
assert.equal(pmBoundaryCompression.status, 'evaluated');
assert.ok(pmBoundaryCompression.AstBoundary > 0 && pmBoundaryCompression.design.length > 2);

const pmTension = Evaluator.pmScore(base, { P:-40, M:10 });
assert.equal(pmTension.status, 'evaluated');
assert.ok(Number.isFinite(pmTension.utilization), 'tension demand is evaluated by the P-M envelope');

const derivedMoment = Evaluator.evaluatePMDemand(base, { P:80 });
assert.equal(derivedMoment.M, 1.6);

const pmAxialOut = Evaluator.pmScore(base, { P:pmCapacity.pMin - 50, M:0 });
assert.equal(pmAxialOut.status, 'axial-out-of-range');
assert.equal(pmAxialOut.scoreLabel, '軸力越界');
assert.ok(pmAxialOut.score >= 1e12);

const compression = Evaluator.compressionScore(base, { P:80, V:30 });
assert.equal(compression.status, 'evaluated');
assert.ok(compression.axialUtilization > 0 && compression.score === compression.axialUtilization);

const highCompression = Evaluator.compressionScore(base, { P:160, V:30 });
assert.ok(highCompression.score > compression.score, 'compression utilization follows the complete tuple P');

const tension = Evaluator.tensionScore(base, { P:-40, V:30 });
assert.equal(tension.status, 'tension-capacity-unresolved');
assert.equal(tension.scoreLabel, '拉力容量待確認');
assert.ok(tension.score >= 1e12);

const eccentric = Evaluator.compressionScore({ ...base, e:5 }, { P:80, V:30 });
assert.equal(eccentric.status, 'eccentricity-out-of-range');
assert.equal(eccentric.scoreLabel, '偏心超界');
assert.ok(eccentric.score >= 1e12);

const ordinaryShear = Evaluator.shearScore(base, { P:80, V:-50 });
assert.equal(ordinaryShear.status, 'evaluated');
assert.equal(ordinaryShear.shearDemand, 50);
assert.equal(ordinaryShear.shearControlUtilization, ordinaryShear.shearUtilization);

const specialShear = Evaluator.shearScore({ ...base, seismic:true, wallType:'shear', rhot:0.02 }, { P:80, V:400 });
assert.equal(specialShear.status, 'evaluated');
assert.ok(specialShear.shearLimitUtilization > 0);
assert.equal(specialShear.shearControlUtilization, Math.max(specialShear.shearUtilization, specialShear.shearLimitUtilization));

const invalid = Evaluator.shearScore({ ...base, phiShear:0 }, { P:80, V:30 });
assert.equal(invalid.status, 'capacity-unresolved');
assert.equal(invalid.scoreLabel, '容量待確認');

// ── E1 審查新增：面內剪力 Vn 上限 2.12λ√fc'·Acv（ACI 318-19 11.5.4.2 / 18.10.4.4，等同舊式 2.65√fc'·h·d、d=0.8ℓw）──
{
  const fc = 280, h = 20, lw = 300, rhot = 0.01, fy = 4200;
  const Acv = h * lw;
  const alphaC = 0.53;                                   // hw/ℓw = 2.0
  const VnFormula = Acv * (alphaC * Math.sqrt(fc) + rhot * fy);   // 305,215 kgf
  const VnCap = 2.12 * Math.sqrt(fc) * Acv;                        // 212,844 kgf
  assert.ok(VnFormula > VnCap);
  for (const variant of [{ seismic:false, wallType:'bearing' }, { seismic:true, wallType:'shear' }]) {
    const cap = Evaluator.computeCapacity({ ...base, ...variant, h, lw, hw:600, rhot, fy, fc });
    assert.ok(Math.abs(cap.phiVn - 0.75 * VnCap) < 1e-6, `${variant.wallType}: φVn ${cap.phiVn} != ${0.75 * VnCap}`);
    const over = Evaluator.evaluateDemand({ ...base, ...variant, h, lw, hw:600, rhot, fy, fc }, { P:0, V:200 });
    assert.equal(over.ok, false, `${variant.wallType}: Vu=200 tf > φ·2.12√fc'Acv=159.6 tf must fail`);
  }
}
// ── E1 審查新增：表 11.6.1 / 11.6.2 最小鋼筋比依鋼筋號數、fy 與剪力水準 ──
{
  const Wall = global.Wall;
  const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-12, `${label}: ${a} != ${b}`);
  const low = { seismic:false, isShearWall:false, needTwoLayer:false, highShear:false, hwlw:1.0, rhot:0.003 };
  let m = Wall.minRho({ ...low, fy:4200, dbV:1.27, dbH:1.27 });          // ≤ #5、fy ≥ 4200
  near(m.rholMin, 0.0012, '#4 fy4200 ρl'); near(m.rhotMin, 0.0020, '#4 fy4200 ρt');
  m = Wall.minRho({ ...low, fy:4200, dbV:1.905, dbH:1.905 });             // #6：其他竹節筋
  near(m.rholMin, 0.0015, '#6 ρl'); near(m.rhotMin, 0.0025, '#6 ρt');
  m = Wall.minRho({ ...low, fy:2800, dbV:1.27, dbH:1.27 });               // fy < 4200
  near(m.rholMin, 0.0015, 'fy2800 ρl'); near(m.rhotMin, 0.0025, 'fy2800 ρt');
  // 11.6.2：Vu > 0.5φVc → ρt ≥ 0.0025，ρl ≥ 0.0025 + 0.5(2.5 − hw/ℓw)(ρt − 0.0025)
  m = Wall.minRho({ ...low, highShear:true, needTwoLayer:true, hwlw:1.0, rhot:0.004, fy:4200, dbV:1.27, dbH:1.27 });
  near(m.rhotMin, 0.0025, 'high shear ρt'); near(m.rholMin, 0.0025 + 0.5 * 1.5 * 0.0015, 'high shear ρl');
  // 11.6.2(a) 但書：ρl 不必超過強度所需 ρt
  m = Wall.minRho({ ...low, highShear:true, hwlw:0.5, rhot:0.010, rhotRequired:0.003, fy:4200, dbV:1.27, dbH:1.27 });
  near(m.rholMin, 0.003, 'high shear ρl capped by required ρt');
}
console.log('wall-inplane-evaluator.test.js: PASS');
