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
    Kzt: 1.0, shapeType: 'flat_panel', shapeFactor: 1.1
  });
  approx(solid.baseCf, 1.8, 1e-12, 'solid object base Cf');
  approx(solid.CfEff, 1.98, 1e-12, 'solid object corrected Cf');
  approx(solid.F, solid.qz * solid.G * solid.CfEff * solid.A, 1e-9, 'solid object force');
  approx(solid.baseMoment, solid.F * solid.z, 1e-9, 'solid object base moment');

  const verticalSolid = W.calcVerticalSolidObjectWind({
    V: 42.5, terrain: 'C', I: 1.0, zBase: 0, height: 12, width: 1.5,
    segments: 4, Kzt: 1.0, shapeType: 'circular_cylinder', Cf: 0.8, shapeFactor: 1.05
  });
  assert.strictEqual(verticalSolid.rows.length, 4, 'vertical solid segment count');
  approx(verticalSolid.CfEff, 0.84, 1e-12, 'vertical solid corrected Cf');
  approx(verticalSolid.baseShear, verticalSolid.rows.reduce((s, row) => s + row.force, 0), 1e-9, 'vertical solid total shear');
  approx(verticalSolid.baseMoment, verticalSolid.rows.reduce((s, row) => s + row.moment, 0), 1e-9, 'vertical solid total moment');
  approx(verticalSolid.resultantHeight, verticalSolid.baseMoment / verticalSolid.baseShear, 1e-9, 'vertical solid resultant height');

  const towerCf = W.lookupTowerCf({ sectionType: 'square_face', hOverD: 10 });
  approx(towerCf.cf, 1.5, 1e-12, 'tower cf linear interpolation for square face');

  const towerCfCircular = W.lookupTowerCf({ sectionType: 'circular_auto', hOverD: 7, qzD: 1.5 });
  approx(towerCfCircular.cf, 0.8, 1e-12, 'tower cf circular low qD');

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

  const signGround = W.lookupSignCf({ atGround: true, aspectRatio: 15 });
  approx(signGround.cf, 1.625, 1e-12, 'ground sign Cf interpolation');

  const prism = W.lookupAngularPrismCf('tri_face');
  approx(prism.cf, 2.0, 1e-12, 'angular prism base cf');
  const prismR = W.lookupAngularPrismR(6);
  approx(prismR.r, 0.7, 1e-12, 'angular prism slenderness correction');

  const cable = W.lookupCableCf({ roughness: 'rough_cable', qzD: 2.0 });
  approx(cable.cf, 1.1, 1e-12, 'cable Cf high q(z)D');

  console.log('wind.js tests passed');
}

run();
