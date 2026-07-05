const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'core', 'loads', 'wind.js'), 'utf8');
const context = {
  window: {},
  console,
  Math,
};
vm.createContext(context);
vm.runInContext(code, context);
const W = context.window.Wind;

function approx(actual, expected, tol = 1e-6, msg = '') {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg} expected ${expected}, got ${actual}`);
}

function run() {
  const cc = W.calcCC({
    V: 42.5, terrain: 'C', I: 1.0, Kzt: 1.0,
    h: 30, z: 10, zone: 'zone4', surface: 'wall', A: 2, encl: 'enclosed'
  });
  approx(cc.qPos, W.calcQz(10, 42.5, 'C', 1.0, 1.0).qz, 1e-9, 'calcCC qPos should use q(z) for tall windward wall');
  approx(cc.p_pos, cc.qPos * cc.GCp.pos + cc.qiNeg * cc.GCpi, 1e-9, 'calcCC positive pressure');
  approx(cc.p_neg, cc.qNeg * cc.GCp.neg - cc.qiPos * cc.GCpi, 1e-9, 'calcCC negative pressure');

  const ccPartial = W.calcCC({
    V: 42.5, terrain: 'C', I: 1.0, Kzt: 1.0,
    h: 30, z: 10, zh0: 24, zone: 'zone4', surface: 'wall', A: 2, encl: 'partial'
  });
  approx(ccPartial.qiPos, W.calcQz(24, 42.5, 'C', 1.0, 1.0).qz, 1e-9, 'calcCC partial positive internal pressure should use q(zh0)');
  approx(ccPartial.qiNeg, ccPartial.qh, 1e-9, 'calcCC negative internal pressure should use q(h)');

  assert.throws(() => W.calcCC({
    V: 42.5, terrain: 'C', I: 1.0, Kzt: 1.0,
    h: 10, z: 10, zone: 'zone1', surface: 'roof', A: 2, encl: 'open'
  }), /Open buildings/, 'calcCC should reject open building path');

  const parapet = W.calcParapet({
    V: 42.5, terrain: 'C', I: 1.0, Kzt: 1.0,
    h: 20, hp: 1.5, A: 2, face: 'windward', edge: 'edge', encl: 'enclosed'
  });
  approx(parapet.frontGCp, W.lookupGCp(W.GCP_WALL_GT18.zone4, 2).pos, 1e-9, 'parapet front GCp');
  approx(parapet.backGCp, W.lookupGCp(W.GCP_ROOF_GT18.zone2, 2).neg, 1e-9, 'parapet back GCp');
  assert.strictEqual(parapet.frontInternalSign, '+', 'windward parapet front should use positive internal sign');
  assert.strictEqual(parapet.backInternalSign, '-', 'windward parapet back should use negative internal sign');

  const parapetOverride = W.calcParapet({
    V: 42.5, terrain: 'C', I: 1.0, Kzt: 1.0,
    h: 20, hp: 1.5, A: 2, face: 'leeward', edge: 'corner', encl: 'open', GCpiOverride: 0.6
  });
  approx(parapetOverride.GCpi, 0.6, 1e-12, 'parapet GCpi override should take precedence');
  assert.strictEqual(parapetOverride.frontInternalSign, '-', 'leeward parapet front should use negative internal sign');
  assert.strictEqual(parapetOverride.backInternalSign, '+', 'leeward parapet back should use positive internal sign');

  const parapetCases = W.calcParapetCcCases({
    V: 42.5, terrain: 'C', I: 1.0, Kzt: 1.0,
    h: 20, hp: 1.5, A: 2, encl: 'enclosed'
  });
  assert.strictEqual(parapetCases.length, 4, 'parapet C&C should enumerate four figure-3.4 cases');
  assert.strictEqual(
    parapetCases.map(item => item.key).join('|'),
    'windward_edge|windward_corner|leeward_edge|leeward_corner',
    'parapet case order'
  );
  approx(parapetCases[0].data.frontGCp, W.lookupGCp(W.GCP_WALL_GT18.zone4, 2).pos, 1e-9, 'windward edge front GCp');
  approx(parapetCases[1].data.backGCp, W.lookupGCp(W.GCP_ROOF_GT18.zone3, 2).neg, 1e-9, 'windward corner back GCp');
  approx(parapetCases[2].data.frontGCp, W.lookupGCp(W.GCP_WALL_GT18.zone4, 2).neg, 1e-9, 'leeward edge front GCp');
  approx(parapetCases[3].data.backGCp, W.lookupGCp(W.GCP_WALL_GT18.zone5, 2).pos, 1e-9, 'leeward corner back GCp');

  const singleRoofCases = W.calcSingleRoofParapetCcCases({
    V: 42.5, terrain: 'C', I: 1.0, Kzt: 1.0,
    h: 20, hp: 1.5, A: 2, encl: 'enclosed'
  });
  assert.strictEqual(singleRoofCases.length, 4, 'single-roof parapet should enumerate four figure-3.5 cases');
  assert.strictEqual(
    singleRoofCases.map(item => item.key).join('|'),
    'edge_left|edge_right|corner_left|corner_right',
    'single-roof parapet case order'
  );
  approx(singleRoofCases[0].data.frontGCp, W.lookupGCp(W.GCP_WALL_GT18.zone4, 2).pos, 1e-9, 'single roof edge left front GCp');
  approx(singleRoofCases[0].data.backGCp, W.lookupGCp(W.GCP_WALL_GT18.zone4, 2).neg, 1e-9, 'single roof edge left back GCp');
  approx(singleRoofCases[1].data.frontGCp, W.lookupGCp(W.GCP_WALL_GT18.zone4, 2).neg, 1e-9, 'single roof edge right front GCp');
  approx(singleRoofCases[3].data.backGCp, W.lookupGCp(W.GCP_WALL_GT18.zone5, 2).pos, 1e-9, 'single roof corner right back GCp');

  const mwfrsParapet = W.calcMwfrsParapet({
    V: 42.5, terrain: 'C', I: 1.0, Kzt: 1.0,
    h: 20, hp: 1.5, face: 'windward'
  });
  approx(mwfrsParapet.GCpn, 1.8, 1e-9, 'mwfrs parapet windward GCpn');
  approx(mwfrsParapet.p, mwfrsParapet.qp * 1.8, 1e-9, 'mwfrs parapet pressure');

  const openExact = W.lookupOpenRoofCpn('monoslope', 'unblocked', 7.5, 'zone3', 1.0, 12);
  approx(openExact.pos, 3.2, 1e-9, 'open roof exact pos');
  approx(openExact.neg, -4.2, 1e-9, 'open roof exact neg');

  const openInterp = W.lookupOpenRoofCpn('monoslope', 'unblocked', 11.25, 'zone3', 1.0, 12);
  approx(openInterp.pos, 3.4, 1e-9, 'open roof interpolated pos');
  approx(openInterp.neg, -4.0, 1e-9, 'open roof interpolated neg');

  const openMonoBlocked = W.lookupOpenRoofCpn('monoslope', 'blocked', 30, 'zone2', 1.0, 12);
  approx(openMonoBlocked.pos, 2.4, 1e-9, 'open roof fig 3.3(a) blocked zone2 pos');
  approx(openMonoBlocked.neg, -3.5, 1e-9, 'open roof fig 3.3(a) blocked zone2 neg');

  const openGableUnblocked = W.lookupOpenRoofCpn('gable', 'unblocked', 30, 'zone1', 1.0, 12);
  approx(openGableUnblocked.pos, 1.3, 1e-9, 'open roof fig 3.3(b) unblocked zone1 pos');
  approx(openGableUnblocked.neg, -0.9, 1e-9, 'open roof fig 3.3(b) unblocked zone1 neg');

  const openGableBlocked = W.lookupOpenRoofCpn('gable', 'blocked', 15, 'zone3', 1.0, 12);
  approx(openGableBlocked.pos, 1.0, 1e-9, 'open roof fig 3.3(b) blocked zone3 pos');
  approx(openGableBlocked.neg, -3.2, 1e-9, 'open roof fig 3.3(b) blocked zone3 neg');

  const openCalc = W.calcOpenRoofCC({
    V: 42.5, terrain: 'C', I: 1.0, h: 8, B: 12, L: 18, Kzt: 1.0,
    theta: 7.5, A: 1.0, zone: 'zone3', roofType: 'monoslope', blockage: 'blocked'
  });
  approx(openCalc.p_pos, openCalc.qh * openCalc.G * openCalc.Cpn.pos, 1e-9, 'open roof positive pressure');
  approx(openCalc.p_neg, openCalc.qh * openCalc.G * openCalc.Cpn.neg, 1e-9, 'open roof negative pressure');

  const mwfrs = W.calcBuildingWind({
    V: 42.5, terrain: 'C', I: 1.0, B: 20, L: 30, storyH: [3.5, 3.5, 3.5], Kzt: 1.0,
    encl: 'enclosed', roofSlope: 0, roofType: 'flat', windToRidge: 'perpendicular', eaveHeight: 9
  });
  assert.ok(mwfrs.Vb > 0, 'MWFRS base shear should be positive');
  assert.strictEqual(mwfrs.stories.length, 3, 'MWFRS story count');
  approx(mwfrs.stories[0].wallCases.windward.casePos, mwfrs.stories[0].pw - mwfrs.qH * mwfrs.GCpi, 1e-9, 'MWFRS windward case with positive internal pressure');
  approx(mwfrs.stories[0].wallCases.windward.caseNeg, mwfrs.stories[0].pw + mwfrs.qH * mwfrs.GCpi, 1e-9, 'MWFRS windward case with negative internal pressure');
  assert.ok(mwfrs.roof.supported, 'Flat roof MWFRS path should be supported');
  approx(mwfrs.roof.roofRefH, 9, 1e-9, 'MWFRS roof should use eave height when theta<10');
  approx(mwfrs.roof.xDir.windward.pMax, mwfrs.roof.qRoof * mwfrs.G * mwfrs.roof.xDir.windward.cpMax + mwfrs.roof.qRoof * mwfrs.GCpi, 1e-9, 'MWFRS flat roof max pressure');

  const mwfrsSteep = W.calcBuildingWind({
    V: 42.5, terrain: 'C', I: 1.0, B: 20, L: 30, storyH: [3.5, 3.5, 3.5], Kzt: 1.0,
    encl: 'partial', roofSlope: 15, roofType: 'gable', windToRidge: 'perpendicular'
  });
  assert.ok(mwfrsSteep.roof.supported, 'Gable roof should now be supported');
  assert.ok(mwfrsSteep.roof.yDir.center.pMax < 0, 'Gable center roof should remain suction under current case');

  const roofPerp = W.lookupMwfrsRoofCp({ roofType: 'monoslope', windToRidge: 'perpendicular', theta: 30, h: 15, L: 30, B: 20 });
  approx(roofPerp.windward.maxCp, 0.3, 1e-9, 'Table 2.5 perpendicular 30deg row h/L=0.5');
  approx(roofPerp.windward.minCp, -0.2, 1e-9, 'Table 2.5 perpendicular 30deg min');
  approx(roofPerp.leeward.maxCp, -0.7, 1e-9, 'Table 2.5 leeward');

  const roofParallel = W.lookupMwfrsRoofCp({ roofType: 'monoslope', windToRidge: 'parallel', theta: 20, h: 12, L: 30, B: 20 });
  approx(roofParallel.windward.maxCp, -0.7, 1e-9, 'Table 2.5 parallel low ratio');

  const flatSlender = W.lookupMwfrsRoofCp({ roofType: 'flat', windToRidge: 'perpendicular', theta: 0, h: 60, L: 20, B: 20 });
  approx(flatSlender.windward.minCp, -0.8, 1e-9, 'flat roof should include parallel-row suction for slender case');

  const archRoof = W.lookupMwfrsArchRoofCp({ archMode: 'with_walls', riseRatio: 0.25 });
  approx(archRoof.windward.maxCp, 0.075, 1e-9, 'Table 2.6 arched roof windward');
  approx(archRoof.center.maxCp, -0.95, 1e-9, 'Table 2.6 arched roof center');

  const sawRoof = W.lookupMwfrsSawtoothRoofCp({ theta: 20, h: 15, L: 30, B: 20, faceCode: 'E"' });
  approx(sawRoof.faceCp.maxCp, -0.4, 1e-9, 'Table 2.8 sawtooth fixed face');

  const mwfrsArch = W.calcBuildingWind({
    V: 42.5, terrain: 'C', I: 1.0, B: 20, L: 30, storyH: [3.5, 3.5, 3.5], Kzt: 1.0,
    encl: 'enclosed', roofType: 'arched', archMode: 'springline', archRiseRatio: 0.3
  });
  assert.ok(mwfrsArch.roof.xDir.center.pMin < 0, 'arched roof center suction');

  const mwfrsResonant = W.calcBuildingWind({
    V: 42.5, terrain: 'C', I: 1.0, B: 20, L: 20, storyH: Array(20).fill(5), Kzt: 1.0,
    encl: 'enclosed', roofSlope: 0, roofType: 'flat', windToRidge: 'perpendicular', eaveHeight: 100,
    fa: 0.35, ft: 0.45
  });
  assert.strictEqual(mwfrsResonant.lateralMeta.regime, 'resonant', 'should enter resonant lateral-force regime');
  assert.strictEqual(mwfrsResonant.crossWind[0].method, 'Eq 2.22', 'crosswind should use Eq 2.22');
  assert.strictEqual(mwfrsResonant.torsion[0].method, 'Eq 2.24', 'torsion should use Eq 2.24');
  assert.ok(mwfrsResonant.lateralMeta.cross.RLR > 0, 'crosswind resonance factor should be positive');
  assert.ok(mwfrsResonant.lateralMeta.torsion.RTR > 0, 'torsion resonance factor should be positive');

  assert.throws(() => W.calcBuildingWind({
    V: 42.5, terrain: 'C', I: 1.0, B: 20, L: 30, storyH: [3.5, 3.5, 3.5], Kzt: 1.0,
    encl: 'open'
  }), /Open buildings/, 'MWFRS page should reject open-building route');

  const accel = W.calcCornerPeakAcceleration({
    fn: 0.3, fa: 0.25, ft: 0.39,
    Dstar: 0.01, Lstar: 0.015, thetaStar: 0.0002,
    B: 20, L: 30,
  });
  approx(accel.AD, Math.pow(2 * Math.PI * 0.3, 2) * 0.01, 1e-12, 'AD from C4.1');
  approx(accel.AL, Math.pow(2 * Math.PI * 0.25, 2) * 0.015, 1e-12, 'AL from C4.1');
  approx(accel.AT, Math.pow(2 * Math.PI * 0.39, 2) * 0.0002, 1e-12, 'AT from C4.1');
  approx(
    accel.Apeak,
    Math.sqrt(accel.AD ** 2 + accel.AL ** 2 + accel.AT ** 2 * ((20 ** 2 + 30 ** 2) / 4) + 30 * accel.AL * accel.AT),
    1e-12,
    'corner peak acceleration formula'
  );

  const simp = W.calcSimplifiedAccelEstimate({
    totalMassKg: 1000000,
    widthB: 20,
    lengthL: 30,
    WD: 5000,
    WL: 4000,
    WT: 100000,
  });
  approx(simp.AD, 5000 * W.G_ACCEL / 1000000, 1e-12, 'simplified AD');
  approx(simp.AL, 4000 * W.G_ACCEL / 1000000, 1e-12, 'simplified AL');
  approx(simp.Itheta, 1000000 * (20 ** 2 + 30 ** 2) / 12, 1e-9, 'simplified inertia');
  assert.ok(simp.Apeak > 0, 'simplified peak acceleration should be positive');

  const solid = W.calcSolidObjectWind({
    V: 42.5, terrain: 'C', I: 1.0, z: 12, A: 6, charWidth: 2.5,
    Kzt: 1.0, shapeType: 'box', shapeFactor: 1.1
  });
  approx(solid.baseCf, 1.3, 1e-12, 'solid object base Cf');
  approx(solid.CfEff, 1.43, 1e-12, 'solid object corrected Cf');
  approx(solid.F, solid.qz * solid.G * solid.CfEff * solid.A, 1e-9, 'solid object force');
  approx(solid.baseMoment, solid.F * solid.z, 1e-9, 'solid object base moment');
  assert.ok(solid.gustDetail, 'solid object should expose gust factor detail');
  approx(solid.gustDetail.G, solid.G, 1e-12, 'solid object gust detail G');
  approx(solid.gustDetail.Q, Math.sqrt(solid.gustDetail.Q2), 1e-12, 'solid object gust detail Q');
  assert.strictEqual(solid.gustDetail.gQ, 3.4, 'solid object gust peak factor gQ');
  assert.strictEqual(solid.gustDetail.gV, 3.4, 'solid object gust peak factor gV');

  const verticalSolid = W.calcVerticalSolidObjectWind({
    V: 42.5, terrain: 'C', I: 1.0, zBase: 0, height: 12, width: 1.5,
    segments: 4, Kzt: 1.0, shapeType: 'circular_cylinder', Cf: 0.8, shapeFactor: 1.05
  });
  assert.strictEqual(verticalSolid.rows.length, 4, 'vertical solid segment count');
  approx(verticalSolid.CfEff, 0.84, 1e-12, 'vertical solid corrected Cf');
  approx(verticalSolid.baseShear, verticalSolid.rows.reduce((s, row) => s + row.force, 0), 1e-9, 'vertical solid total shear');
  approx(verticalSolid.baseMoment, verticalSolid.rows.reduce((s, row) => s + row.moment, 0), 1e-9, 'vertical solid total moment');
  approx(verticalSolid.resultantHeight, verticalSolid.baseMoment / verticalSolid.baseShear, 1e-9, 'vertical solid resultant height');
  assert.ok(verticalSolid.gustDetail, 'vertical solid should expose gust factor detail');
  approx(verticalSolid.gustDetail.G, verticalSolid.G, 1e-12, 'vertical solid gust detail G');

  const verticalSolidWithCharWidth = W.calcVerticalSolidObjectWind({
    V: 42.5, terrain: 'C', I: 1.0, zBase: 0, height: 12, width: 0.6, charWidth: 3.0,
    segments: 4, Kzt: 1.0, shapeType: 'flat_panel', Cf: 1.2
  });
  approx(verticalSolidWithCharWidth.gustDetail.B, 3.0, 1e-12, 'vertical solid gust should use characteristic width when provided');

  const towerCf = W.lookupTowerCf({ sectionType: 'square_face', hOverD: 10 });
  approx(towerCf.cf, 1.5, 1e-12, 'tower cf linear interpolation for square face');

  approx(W.calcDiameterSqrtQz(2, 9), 6, 1e-12, 'D sqrt(qz) classifier');

  // Coefficient lookups are owned by the formal wind workflows. Keep the
  // shared table functions deterministic so each page can rely on its own Cf
  // confirmation path instead of a separate coefficient guide tool.
  approx(W.lookupSignCf({ atGround: true, aspectRatio: 3 }).cf, 1.2, 1e-12, 'table 2.10 ground sign lower anchor');
  approx(W.lookupSignCf({ atGround: true, aspectRatio: 40 }).cf, 2.0, 1e-12, 'table 2.10 ground sign upper anchor');
  approx(W.lookupSignCf({ atGround: false, aspectRatio: 80 }).cf, 2.0, 1e-12, 'table 2.10 elevated sign upper anchor');

  approx(W.lookupTowerCf({ sectionType: 'hex_oct', hOverD: 25 }).cf, 1.4, 1e-12, 'table 2.12 hex/oct upper anchor');
  approx(W.lookupTowerCf({ sectionType: 'circular_rough', hOverD: 7, dSqrtQz: 2.0 }).cf, 0.8, 1e-12, 'table 2.12 rough circular anchor');

  approx(W.lookupPorousFrameCf({ solidity: 0.05, memberType: 'circular', dSqrtQz: 1.2 }).cf, 2.0, 1e-12, 'table 2.11 circular low D sqrt(qz) low solidity');
  approx(W.lookupPorousFrameCf({ solidity: 0.35, memberType: 'circular', dSqrtQz: 2.0 }).cf, 1.5, 1e-12, 'table 2.11 circular high D sqrt(qz) medium solidity');
  approx(W.lookupPorousFrameCf({ solidity: 0.35, memberType: 'flat', dSqrtQz: 2.0 }).cf, 1.1, 1e-12, 'table 2.11 flat member medium solidity');

  approx(W.lookupLatticeTowerCf({ solidity: 0.5, towerShape: 'square', memberShape: 'angle_flat', skewWind: false }).cf, 1.8, 1e-12, 'table 2.15 square lattice plateau');
  approx(W.lookupAngularPrismCf('rect_long').cf, 2.2, 1e-12, 'table 2.13 rectangular prism long face');
  approx(W.lookupAngularPrismR(40).r, 1.0, 1e-12, 'table 2.13 slenderness correction upper band');
  approx(W.lookupCableCf({ roughness: 'smooth', dSqrtQz: 2.0 }).cf, 0.5, 1e-12, 'table 2.14 smooth cable high D sqrt(qz)');
  approx(W.lookupCableCf({ roughness: 'rough_cable', dSqrtQz: 1.7 }).cf, 1.3, 1e-12, 'table 2.14 rough cable threshold low branch');

  const towerCfCircular = W.lookupTowerCf({ sectionType: 'circular_auto', hOverD: 7, dSqrtQz: 1.5 });
  approx(towerCfCircular.cf, 0.8, 1e-12, 'tower cf circular low D sqrt(qz)');

  const towerCfCircularHigh = W.lookupTowerCf({ sectionType: 'circular_auto', hOverD: 7, dSqrtQz: 2.0 });
  approx(towerCfCircularHigh.cf, 0.6, 1e-12, 'tower cf circular high D sqrt(qz moderate default)');

  const cylinderCfLow = W.lookupCircularCylinderCf({ diameter: 2, height: 14, dSqrtQz: 1.69, roughness: 'moderate' });
  const cylinderCfLowOtherHeight = W.lookupCircularCylinderCf({ diameter: 2, height: 40, dSqrtQz: 1.69, roughness: 'moderate' });
  approx(cylinderCfLow.cf, 1.2, 1e-12, 'circular cylinder table 2.14 low D sqrt(qz)');
  approx(cylinderCfLowOtherHeight.cf, cylinderCfLow.cf, 1e-12, 'circular cylinder table 2.14 does not use h/D');

  const cylinderCfHigh = W.lookupCircularCylinderCf({ diameter: 2, dSqrtQz: 2.0, roughness: 'moderate' });
  approx(cylinderCfHigh.cf, 0.7, 1e-12, 'circular cylinder table 2.14 high D sqrt(qz)');

  const tower = W.calcTowerWind({
    V: 42.5, terrain: 'C', I: 1.0, zBase: 0, height: 30, D: 2.0,
    segments: 6, Kzt: 1.0, sectionType: 'square_face', shapeFactor: 1.1,
    topArea: 4.0
  });
  assert.strictEqual(tower.body.rows.length, 6, 'tower segments');
  assert.ok(tower.cfData.cf > 0, 'tower cf should be positive');
  assert.ok(tower.top.force > 0, 'tower top attachment force should be positive');
  approx(tower.baseShear, tower.body.baseShear + tower.top.force, 1e-9, 'tower total base shear');
  approx(tower.baseMoment, tower.body.baseMoment + tower.top.moment, 1e-9, 'tower total base moment');

  const porous = W.lookupPorousFrameCf({ solidity: 0.2, memberType: 'flat' });
  approx(porous.cf, 0.9, 1e-12, 'porous frame flat-member cf');

  const latticeCf = W.lookupLatticeTowerCf({ solidity: 0.2, towerShape: 'square', memberShape: 'circular', skewWind: true });
  approx(latticeCf.baseCf, 4.1 - 5.2 * 0.2, 1e-12, 'lattice tower base cf');
  approx(latticeCf.memberFactor, 0.67, 1e-12, 'lattice tower circular member factor');
  approx(latticeCf.skewFactor, 1.0 + 0.75 * 0.2, 1e-12, 'lattice tower skew factor');

  const lattice = W.calcLatticeTowerWind({
    V: 42.5, terrain: 'C', I: 1.0, zBase: 0, height: 24, faceWidth: 3.0, solidity: 0.2,
    segments: 4, Kzt: 1.0, towerShape: 'triangular', memberShape: 'angle_flat', skewWind: false
  });
  assert.strictEqual(lattice.body.rows.length, 4, 'lattice tower segments');
  approx(lattice.totalSolidArea, 24 * 3 * 0.2, 1e-12, 'lattice tower solid area');
  approx(lattice.baseShear, lattice.body.baseShear, 1e-12, 'lattice tower base shear passthrough');
  approx(lattice.body.gustDetail.B, 3.0, 1e-12, 'lattice tower gust should use full face width');

  const signGround = W.lookupSignCf({ atGround: true, aspectRatio: 15 });
  approx(signGround.cf, 1.625, 1e-12, 'ground sign Cf interpolation');
  const signAbove = W.lookupSignCf({ atGround: false, aspectRatio: 30 });
  approx(signAbove.cf, 1.625, 1e-12, 'elevated sign M/N Cf interpolation');

  const prism = W.lookupAngularPrismCf('tri_face');
  approx(prism.cf, 2.0, 1e-12, 'angular prism base cf');
  const prismR = W.lookupAngularPrismR(6);
  approx(prismR.r, 0.7, 1e-12, 'angular prism slenderness correction');

  const cable = W.lookupCableCf({ roughness: 'rough_cable', dSqrtQz: 2.0 });
  approx(cable.cf, 1.1, 1e-12, 'cable Cf high D sqrt(qz)');

  // ── CITY_QUICK 基本設計風速：依 §2.4 逐鄉鎮市區，不得使用簡化沿海/內陸/北區/南區分類 ──
  assert.strictEqual(W.BASIC_WIND_SPEED, undefined, 'legacy mislabeled BASIC_WIND_SPEED table must be removed');
  assert.strictEqual(Object.keys(W.CITY_QUICK).length, 308, 'CITY_QUICK entry count must match §2.4 township tally');
  {
    const keys = Object.keys(W.CITY_QUICK);
    const seen = new Set();
    keys.forEach(k => {
      assert.ok(!seen.has(k), `CITY_QUICK duplicate key: ${k}`);
      seen.add(k);
    });
  }
  // 關鍵回歸點：使用者原始回報的錯誤——彰化縣沿海鄉鎮(鹿港/芳苑/大城)實為 27.5，
  // 與彰化市同組，並非簡化標籤所暗示的 32.5（沿海）。
  approx(W.CITY_QUICK['彰化縣－鹿港鎮'], 27.5, 1e-9, '彰化縣鹿港鎮 (沿海但屬27.5區，非32.5)');
  approx(W.CITY_QUICK['彰化縣－芳苑鄉'], 27.5, 1e-9, '彰化縣芳苑鄉');
  approx(W.CITY_QUICK['彰化縣－大城鄉'], 27.5, 1e-9, '彰化縣大城鄉');
  approx(W.CITY_QUICK['彰化縣－彰化市'], 27.5, 1e-9, '彰化縣彰化市 (與沿海鄉鎮同組)');
  approx(W.CITY_QUICK['彰化縣－伸港鄉'], 32.5, 1e-9, '彰化縣伸港鄉 (北彰化，32.5)');
  approx(W.CITY_QUICK['雲林縣－麥寮鄉'], 27.5, 1e-9, '雲林縣麥寮鄉 (沿海但屬27.5區，非32.5)');
  approx(W.CITY_QUICK['雲林縣－口湖鄉'], 32.5, 1e-9, '雲林縣口湖鄉 (32.5)');
  approx(W.CITY_QUICK['臺南市－佳里區'], 32.5, 1e-9, '臺南市佳里區 (沿海但屬32.5區，非37.5)');
  approx(W.CITY_QUICK['臺南市－安平區'], 37.5, 1e-9, '臺南市安平區 (37.5)');
  // 新北市：東北角/山區 42.5，西南都會區 37.5
  approx(W.CITY_QUICK['新北市－淡水區'], 42.5, 1e-9, '新北市淡水區');
  approx(W.CITY_QUICK['新北市－板橋區'], 37.5, 1e-9, '新北市板橋區');
  // 南投縣跨四個風速區
  approx(W.CITY_QUICK['南投縣－信義鄉'], 37.5, 1e-9, '南投縣信義鄉');
  approx(W.CITY_QUICK['南投縣－仁愛鄉'], 32.5, 1e-9, '南投縣仁愛鄉');
  approx(W.CITY_QUICK['南投縣－南投市'], 27.5, 1e-9, '南投縣南投市');
  approx(W.CITY_QUICK['南投縣－竹山鎮'], 22.5, 1e-9, '南投縣竹山鎮');
  // 桃園（原桃園縣「各鄉鎮市」）現制桃園市，全市單一值
  approx(W.CITY_QUICK['桃園市'], 37.5, 1e-9, '桃園市 (原桃園縣全縣單一值)');
  // 外島：蘭嶼/綠島/琉球雖行政隸屬臺東/屏東，規範獨立列於外島地區
  approx(W.CITY_QUICK['蘭嶼'], 65.0, 1e-9, '蘭嶼 (外島獨立列出，不與臺東縣本島同列)');
  approx(W.CITY_QUICK['綠島'], 65.0, 1e-9, '綠島');
  approx(W.CITY_QUICK['琉球'], 40.0, 1e-9, '琉球 (小琉球，不與屏東縣本島同列)');
  assert.ok(!('屏東縣－琉球鄉' in W.CITY_QUICK), '琉球鄉屬外島地區，不應重複列入屏東縣本島清單');
  assert.ok(!('臺東縣－綠島鄉' in W.CITY_QUICK), '綠島鄉屬外島地區，不應重複列入臺東縣本島清單');
  assert.ok(!('臺東縣－蘭嶼鄉' in W.CITY_QUICK), '蘭嶼鄉屬外島地區，不應重複列入臺東縣本島清單');

  // ── 地點選單依縣市分組 (groupCityQuickByCounty / populateCityQuickSelect) ──
  {
    const groups = W.groupCityQuickByCounty();
    const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
    assert.strictEqual(totalItems, 308, '分組後總筆數須與 CITY_QUICK 一致');

    const countyNames = groups.map(g => g.county);
    assert.strictEqual(new Set(countyNames).size, countyNames.length, '縣市分組名稱不得重複');
    assert.strictEqual(countyNames.length, 20, '應為 20 組（19 本島縣市 + 外島地區；澎湖縣併入外島地區不另立組）');
    assert.strictEqual(countyNames[0], '臺北市', '分組順序：直轄市優先，臺北市在前');
    assert.strictEqual(countyNames[countyNames.length - 1], '外島地區', '外島地區固定排在最後');
    assert.ok(!countyNames.includes('澎湖縣'), '澎湖縣併入外島地區，不應另立獨立分組');

    const byCounty = Object.fromEntries(groups.map(g => [g.county, g.items]));

    // 每個 item 的 key 必須能還原查回 CITY_QUICK 的原值
    groups.forEach(g => g.items.forEach(({ key, v }) => {
      assert.strictEqual(W.CITY_QUICK[key], v, `${key} 分組後的值須與 CITY_QUICK 一致`);
    }));

    // 無「－」的全縣單一值（非外島）：獨立一組、label 為「全區」
    assert.strictEqual(byCounty['臺北市'].length, 1, '臺北市全市單一值，僅一筆');
    assert.strictEqual(byCounty['臺北市'][0].label, '全區', '全縣單一值 label 應為「全區」');
    assert.strictEqual(byCounty['臺北市'][0].key, '臺北市');

    // 縣市轄下鄉鎮市區數與實際行政區數一致（迴歸點：確認分組沒有漏鄉鎮）
    assert.strictEqual(byCounty['新北市'].length, 29, '新北市應有29區');
    assert.strictEqual(byCounty['高雄市'].length, 38, '高雄市應有38區');
    assert.strictEqual(byCounty['彰化縣'].length, 26, '彰化縣應有26鄉鎮市');

    // 外島地區彙整 8 筆，且 label 為地名本身（非「全區」）
    assert.strictEqual(byCounty['外島地區'].length, 8, '外島地區應有8筆');
    const islandLabels = byCounty['外島地區'].map(i => i.label).sort().join(',');
    assert.strictEqual(islandLabels, ['東吉島', '澎湖縣', '琉球', '綠島', '蘭嶼', '金門', '彭佳嶼', '馬祖'].sort().join(','), '外島地區地名須完整');

    // 鹿港鎮分組後 label 只留鄉鎮名（縣市名已是 optgroup 標籤，不重複顯示）
    const lukang = byCounty['彰化縣'].find(i => i.key === '彰化縣－鹿港鎮');
    assert.ok(lukang, '彰化縣分組須含鹿港鎮');
    assert.strictEqual(lukang.label, '鹿港鎮');
    assert.strictEqual(lukang.v, 27.5);
  }
  assert.strictEqual(typeof W.populateCityQuickSelect, 'function', 'populateCityQuickSelect 須匯出供頁面呼叫');

  console.log('wind.js tests passed');
}

run();
