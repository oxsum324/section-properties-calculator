const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const seismicCode = fs.readFileSync(path.join(__dirname, '..', 'core', 'loads', 'seismic.js'), 'utf8');
const seismicZonesCode = fs.readFileSync(path.join(__dirname, '..', 'core', 'loads', 'seismic-zones.js'), 'utf8');

const context = {
  window: {},
  console,
  Math,
};
vm.createContext(context);
vm.runInContext(seismicCode, context);
vm.runInContext(seismicZonesCode, context);

const S = context.window.Seismic;
const Z = context.window.SeismicZones;

function approx(actual, expected, tol = 1e-6, msg = '') {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg} expected ${expected}, got ${actual}`);
}

function basinDirectSite(city, dist, village) {
  const basin = Z.BASIN[city]?.[dist]?.[village];
  assert.ok(basin, `Missing basin data for ${city} ${dist} ${village}`);
  const [, T0] = basin;
  return {
    zone: basin[0],
    T0,
    SDS: 0.6,
    SD1: +(0.6 * T0).toFixed(3),
    SMS: 0.8,
    SM1: +(0.8 * T0).toFixed(3),
  };
}

function calcFromDirectSite(site, isTaipeiBasin, hn = 17.5) {
  const floors = Array.from({ length: 5 }, () => ({ W: 500, dH: 3.5 }));
  const Tcode = S.calcPeriod('SMRF_RC', hn);
  const Tdesign = S.calcTdesign(Tcode, null, 1.4);
  const { ToD, ToM } = S.calcTo(site.SDS, site.SD1, site.SMS, site.SM1);
  const Ra = S.calcRa(4.8, isTaipeiBasin);
  const Fu = S.calcFu(Ra, Tdesign, ToD);
  const FuM = S.calcFuM(4.8, Tdesign, ToM);
  const SaD = S.calcSa(Tdesign, site.SDS, site.SD1);
  const SaM = S.calcSa(Tdesign, site.SMS, site.SM1);
  const W = floors.reduce((sum, floor) => sum + floor.W, 0);
  const vd = S.calcVD(1.0, 1.0, SaD, Fu, W);
  const vs = S.calcVstar(1.0, 1.0, Fu, SaD, W, isTaipeiBasin);
  const vm = S.calcVM(1.0, 1.0, SaM, FuM, W);
  return {
    Tdesign,
    ToD,
    ToM,
    Ra,
    Fu,
    FuM,
    SaD,
    SaM,
    Vdesign: Math.max(vd.VD, vs.Vstar, vm.VM),
  };
}

function run() {
  const generalSite = S.calcSiteCoeff(2, 0.6, 0.35, 0.8, 0.5);
  approx(generalSite.SDS, 0.66, 1e-9, 'general site SDS');
  approx(generalSite.SD1, 0.49, 1e-9, 'general site SD1');
  approx(generalSite.SMS, 0.8, 1e-9, 'general site SMS');
  approx(generalSite.SM1, 0.55, 1e-9, 'general site SM1');

  approx(S.calcRa(4.8, false), 1 + (4.8 - 1) / 1.5, 1e-9, 'general Ra');
  approx(S.calcRa(4.8, true), 1 + (4.8 - 1) / 2.0, 1e-9, 'Taipei basin Ra');

  const taipeiZone1 = basinDirectSite('臺北市', '大安區', '德安里');
  const taipeiZone3 = basinDirectSite('臺北市', '大安區', '黎元里');
  const newTaipeiZone1 = basinDirectSite('新北市', '三重區', '所有里');

  assert.strictEqual(taipeiZone1.zone, 1, 'Taipei zone 1 village classification');
  assert.strictEqual(taipeiZone3.zone, 3, 'Taipei zone 3 village classification');
  assert.strictEqual(newTaipeiZone1.zone, 1, 'New Taipei zone 1 village classification');
  approx(taipeiZone1.T0, 1.6, 1e-9, 'Taipei zone 1 T0');
  approx(taipeiZone3.T0, 1.05, 1e-9, 'Taipei zone 3 T0');
  approx(taipeiZone1.SD1, 0.96, 1e-9, 'Taipei zone 1 SD1 from T0');
  approx(taipeiZone1.SM1, 1.28, 1e-9, 'Taipei zone 1 SM1 from T0');
  approx(taipeiZone3.SD1, 0.63, 1e-9, 'Taipei zone 3 SD1 from T0');
  approx(taipeiZone3.SM1, 0.84, 1e-9, 'Taipei zone 3 SM1 from T0');

  const normalBuilding = calcFromDirectSite(generalSite, false);
  const basinBuilding = calcFromDirectSite(taipeiZone1, true);
  assert.ok(
    basinBuilding.Vdesign > normalBuilding.Vdesign,
    `Taipei basin design force should exceed comparable general site. normal=${normalBuilding.Vdesign}, basin=${basinBuilding.Vdesign}`
  );

  const longPeriodT = 1.3;
  const zone1Sa = S.calcSa(longPeriodT, taipeiZone1.SDS, taipeiZone1.SD1);
  const zone3Sa = S.calcSa(longPeriodT, taipeiZone3.SDS, taipeiZone3.SD1);
  assert.ok(zone1Sa > zone3Sa, `Long-period Taipei zone 1 spectrum should exceed zone 3. zone1=${zone1Sa}, zone3=${zone3Sa}`);

  const zone1To = S.calcTo(taipeiZone1.SDS, taipeiZone1.SD1, taipeiZone1.SMS, taipeiZone1.SM1);
  const zone3To = S.calcTo(taipeiZone3.SDS, taipeiZone3.SD1, taipeiZone3.SMS, taipeiZone3.SM1);
  approx(zone1To.ToD, 1.6, 1e-9, 'Taipei zone 1 ToD');
  approx(zone3To.ToD, 1.05, 1e-9, 'Taipei zone 3 ToD');

  assert.strictEqual(S.TABLE_5_1[0].name, '鋼造儲物架', 'table 5-1 first item');
  approx(S.TABLE_5_1[0].R, 2.4, 1e-9, 'table 5-1 steel storage rack R');
  assert.strictEqual(S.TABLE_5_1[2].hLimit, '未達 10 m', 'ordinary steel braced frame low-height range');
  approx(S.TABLE_5_1[2].R, 2.0, 1e-9, 'ordinary steel braced frame under 10m R');
  assert.strictEqual(S.TABLE_5_1[3].hLimit, '10 m（含）至 50 m 以下', 'ordinary steel braced frame higher range');
  approx(S.TABLE_5_1[3].R, 1.5, 1e-9, 'ordinary steel braced frame 10m to 50m R');

  const tower = S.TABLE_5_2.find(item => item.name.startsWith('桁架式高塔'));
  assert.ok(tower, 'table 5-2 trussed tower exists');
  approx(tower.R, 1.8, 1e-9, 'table 5-2 trussed tower R');
  assert.strictEqual(tower.hLimit, '不限', 'table 5-2 trussed tower height limit');

  const sign = S.TABLE_5_2.find(item => item.name === '招牌及廣告版');
  assert.ok(sign, 'table 5-2 signboard exists');
  approx(sign.R, 2.0, 1e-9, 'table 5-2 signboard R');

  const other = S.TABLE_5_2.find(item => item.name === '前述以外之其它自己承擔載重之結構物');
  assert.ok(other, 'table 5-2 other self-supporting structures exists');
  approx(other.R, 1.6, 1e-9, 'table 5-2 other self-supporting structures R');
  assert.strictEqual(other.hLimit, '15 m', 'table 5-2 other self-supporting structures height limit');

  const appendage = S.calcFph({
    SDS: generalSite.SDS,
    Wp: 2.5,
    ap: 1.0,
    Rp: 2.5,
    Ip: 1.0,
    hx: 10,
    hn: 20,
    isTaipeiBasin: false,
  });
  approx(appendage.Rpa, 2.0, 1e-9, 'appendage Rpa');
  approx(appendage.Cph_calc, 0.4 * generalSite.SDS * (1.0 / appendage.Rpa) * (1 + 2 * 10 / 20), 1e-9, 'appendage calculated coefficient');
  approx(appendage.Cph_max, 1.6 * generalSite.SDS, 1e-9, 'appendage maximum coefficient');
  approx(appendage.Cph_min, 0.3 * generalSite.SDS, 1e-9, 'appendage minimum coefficient');
  approx(appendage.Cph, appendage.Fph / appendage.Wp, 1e-9, 'appendage adopted horizontal coefficient');
  approx(appendage.Fph_calc, appendage.Cph_calc * appendage.Wp, 1e-9, 'appendage calculated force from coefficient');
  approx(S.calcFpv(appendage.Fph, false) / appendage.Wp, 0.5 * appendage.Cph, 1e-9, 'appendage general vertical coefficient');
  approx(S.calcFpv(appendage.Fph, true) / appendage.Wp, (2 / 3) * appendage.Cph, 1e-9, 'appendage near-fault vertical coefficient');

  const signIdx = S.TABLE_5_2.findIndex(item => item.name === '招牌及廣告版');
  const signRigid = S.calcMiscSeismic({
    mode: 'nonsimilar',
    typeIdx: signIdx,
    siteClass: 2,
    SsD: 0.6,
    S1D: 0.35,
    SsM: 0.8,
    S1M: 0.5,
    I: 1.0,
    W: 10,
    hn: 5,
    T_user: 0,
  });
  assert.strictEqual(signRigid.formulaUsed, '式(5-1)', 'rigid non-similar misc formula');
  approx(signRigid.R, 2.0, 1e-9, 'signboard calculation uses table 5-2 R');
  approx(signRigid.Vh, 0.66 * 10 / 3, 1e-9, 'rigid signboard Vh');
  approx(signRigid.Vv, signRigid.Vh / 2, 1e-9, 'rigid signboard Vv');
  approx(signRigid.VhCoeff, signRigid.Vh / signRigid.W, 1e-9, 'rigid signboard Vh coefficient');
  approx(signRigid.VvCoeff, signRigid.Vv / signRigid.W, 1e-9, 'rigid signboard Vv coefficient');

  const similarLong = S.calcMiscSeismic({
    mode: 'similar',
    typeIdx: 5,
    siteClass: 2,
    SsD: 0.6,
    S1D: 0.35,
    SsM: 0.8,
    S1M: 0.5,
    I: 1.0,
    W: 100,
    hn: 20,
    T_user: 2.0,
  });
  const similarExpectedRatio = S.calcSa(2.0, similarLong.site.SDS, similarLong.site.SD1) / similarLong.Fu;
  const similarExpected = S.calcSaFuM(similarExpectedRatio) * 100 / 1.4;
  approx(similarLong.Vh, similarExpected, 1e-9, 'similar misc uses equation 2-3 directly');
  approx(similarLong.VhCoeff, similarLong.Vh / similarLong.W, 1e-9, 'similar misc Vh coefficient');
  approx(similarLong.VvCoeff, similarLong.Vv / similarLong.W, 1e-9, 'similar misc Vv coefficient');
  assert.ok(
    similarLong.Vh < 0.4 * similarLong.site.SDS * 100 / 1.4,
    'similar misc should not apply a separate 0.4 SDS force clamp beyond equation 2-3'
  );

  const towerIdx = S.TABLE_5_2.findIndex(item => item.name.startsWith('桁架式高塔'));
  const towerFlexible = S.calcMiscSeismic({
    mode: 'nonsimilar',
    typeIdx: towerIdx,
    siteClass: 2,
    SsD: 0.6,
    S1D: 0.35,
    SsM: 0.8,
    S1M: 0.5,
    I: 1.0,
    W: 80,
    hn: 30,
    T_user: 0.8,
  });
  const towerExpectedRatio = S.calcSa(0.8, towerFlexible.site.SDS, towerFlexible.site.SD1) / towerFlexible.Fu;
  const towerExpected = S.calcSaFuM(towerExpectedRatio) * 80 / 1.2;
  assert.strictEqual(towerFlexible.formulaUsed, '式(5-2)', 'flexible non-similar misc formula');
  approx(towerFlexible.Vh, towerExpected, 1e-9, 'non-similar misc uses equation 5-2 directly');
  approx(towerFlexible.VhCoeff, towerFlexible.Vh / towerFlexible.W, 1e-9, 'non-similar misc Vh coefficient');
  approx(towerFlexible.VvCoeff, towerFlexible.Vv / towerFlexible.W, 1e-9, 'non-similar misc Vv coefficient');

  const dynamicSite = S.resolveSpectrumSite('zone', 2, 0.6, 0.35, 0.8, 0.5);
  approx(dynamicSite.SDS, 0.66, 1e-12, 'dynamic spectrum site SDS');
  assert.strictEqual(dynamicSite.modeLabel, '震區係數經 Fa / Fv 放大', 'dynamic spectrum site label');
  const directSpectrumSite = S.resolveSpectrumSite('direct', 2, 0.6, 0.35, 0.8, 0.5);
  approx(directSpectrumSite.SDS, 0.6, 1e-12, 'direct dynamic spectrum site SDS');
  approx(directSpectrumSite.FaD, 1, 1e-12, 'direct dynamic spectrum site FaD');

  const dynamicSpectrum = S.buildCodeResponseSpectrum({
    siteInputMode: 'zone',
    I: 1,
    site: dynamicSite,
    lowerSite: dynamicSite,
    R: 2,
    Ra: 1.6667,
    alphaY: 1.5,
    T1: 0.51,
    damping: 5,
    BS: 1,
    B1: 1,
    Tx: 0.75,
    Ty: 0.65,
    range: { plotMode: 'auto', exportTmax: 4 }
  });
  approx(dynamicSpectrum.basis.ToD, 0.7424242424242423, 1e-12, 'dynamic spectrum ToD');
  approx(dynamicSpectrum.summary.t1.designAccel, 0.173481854197383, 1e-12, 'dynamic spectrum T1 adopted design input spectrum');
  approx(dynamicSpectrum.summary.lowerControlShare, 0, 1e-12, 'dynamic spectrum lower control share');
  approx(dynamicSpectrum.ranges.plotTmax, 2, 1e-12, 'dynamic spectrum auto plot range');
  approx(dynamicSpectrum.ranges.exportTmax, 4, 1e-12, 'dynamic spectrum export range');
  assert.ok(dynamicSpectrum.previewRows.length > 5, 'dynamic spectrum preview rows');
  assert.ok(dynamicSpectrum.chartRows.length > 50, 'dynamic spectrum chart rows');
  assert.ok(dynamicSpectrum.exportRows.length > dynamicSpectrum.chartRows.length - 1, 'dynamic spectrum export rows');

  const dynamicStaticX = S.calcDynamicStaticReference({
    systemKey: 'SMRF_RC',
    hn: 17.2,
    W: 2500,
    siteClass: 2,
    SsD: 0.6,
    S1D: 0.35,
    SsM: 0.8,
    S1M: 0.5,
    I: 1,
    Tdyna: 0.75,
    siteInputMode: 'zone'
  });
  const dynamicStaticY = S.calcDynamicStaticReference({
    systemKey: 'SMRF_RC',
    hn: 17.2,
    W: 2500,
    siteClass: 2,
    SsD: 0.6,
    S1D: 0.35,
    SsM: 0.8,
    S1M: 0.5,
    I: 1,
    Tdyna: 0.65,
    siteInputMode: 'zone'
  });
  approx(dynamicStaticX.Vdesign, 388.88888888888874, 1e-9, 'dynamic static X reference');
  approx(dynamicStaticY.Vdesign, 392.85714285714283, 1e-9, 'dynamic static Y reference');
  assert.strictEqual(dynamicStaticX.controlledBy, 'V*', 'dynamic static X control');
  assert.strictEqual(dynamicStaticY.controlledBy, 'V*', 'dynamic static Y control');

  const directionX = S.buildDynamicDirectionResult('X', 180, NaN, dynamicStaticX, null, 1, '第 3.3 節');
  const directionY = S.buildDynamicDirectionResult('Y', 170, NaN, dynamicStaticY, null, 1, '第 3.3 節');
  approx(directionX.ratio, 0.462857142857143, 1e-12, 'dynamic X ratio');
  approx(directionY.ratio, 0.43272727272727274, 1e-12, 'dynamic Y ratio');
  assert.strictEqual(directionX.status, '動力小於總橫力調整要求', 'dynamic X direction status');
  const designActions = S.buildDynamicDesignActions({
    x: { ...directionX, staticRef: directionX.adoptedStatic },
    y: { ...directionY, staticRef: directionY.adoptedStatic }
  });
  approx(designActions[0].requiredScale, 2.160493827160493, 1e-12, 'dynamic X required scale');
  approx(designActions[1].requiredScale, 2.310924369747899, 1e-12, 'dynamic Y required scale');
  assert.equal(designActions[0].hasAdopted, false, 'dynamic design action without adopted shear');

  console.log('seismic.js tests passed');
}

run();
