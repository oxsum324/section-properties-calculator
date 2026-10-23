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

  // ── 規範 2.6 節：未輸入結構力學週期時取經驗公式週期 T = Ta（1.4 倍僅為力學週期上限）──
  // 手算：Ta = 0.070 × 17.5^0.75 = 0.59893 s；第二類地盤 SsD=0.6/S1D=0.35 → SDS=0.66, SD1=0.49, T0D=0.7424
  // 0.2T0D < Ta ≤ T0D → SaD = SDS；Fu > 1 且 SaD/Fu < 0.3 → V* = I·SaD/(4.2αy)·W = 0.66/4.2×2500 = 392.857 tf 控制
  approx(S.calcTdesign(0.6, null, 1.4), 0.6, 1e-12, 'Tdesign without mechanics period equals empirical period');
  approx(S.calcTdesign(0.6, 1.0, 1.4), 0.84, 1e-12, 'Tdesign capped at 1.4 Ta when mechanics period is longer');
  approx(S.calcTdesign(0.6, 0.5, 1.4), 0.5, 1e-12, 'Tdesign uses shorter mechanics period');
  const caseNoDyn = S.calcFullSeismic({
    systemKey: 'SMRF_RC', hn: 17.5, I: 1, siteClass: 2, SsD: 0.6, S1D: 0.35, SsM: 0.8, S1M: 0.5,
    floors: Array.from({ length: 5 }, () => ({ W: 500, dH: 3.5 })),
  });
  approx(caseNoDyn.Tdesign, 0.070 * Math.pow(17.5, 0.75), 1e-12, 'full static Tdesign without Tdyna');
  approx(caseNoDyn.Vdesign, 0.66 / 4.2 * 2500, 1e-9, 'full static Vdesign without Tdyna (hand calc 392.857 tf)');

  // ── 2.4/2.5 節：表 2-3 為近斷層「震區」係數，須再經 Fa/Fv（式 2-4）──
  // 新竹縣竹北市（表 2-1：0.8/0.45/1.0/0.55）、新城斷層 r = 1 km（表 2-3：0.88/0.52/1.20/0.74）、第三類地盤
  // 手算：Fa(0.88)=1.0, Fv(0.52)=1.4, Fa(1.20)=1.0, Fv(0.74)=1.4 → SDS=0.88, SD1=0.728, SMS=1.20, SM1=1.036
  const nf = S.calcNearFaultSiteCoeff(3, [0.8, 0.45, 1.0, 0.55], [[0.88, 0.52, 1.2, 0.74]]);
  approx(nf.SDS, 0.88, 1e-12, 'near-fault SDS = Fa x SsD(table 2-3)');
  approx(nf.SD1, 0.728, 1e-12, 'near-fault SD1 = Fv x S1D(table 2-3)');
  approx(nf.SMS, 1.2, 1e-12, 'near-fault SMS');
  approx(nf.SM1, 1.036, 1e-12, 'near-fault SM1');
  // 斷層值小於表 2-1 時取表 2-1（獅潭斷層 13 km 列 0.70，頭份市表 2-1 為 0.80）；第二類地盤 Fa(0.8)=1.0, Fv(0.45)=1.2
  const nfFar = S.calcNearFaultSiteCoeff(2, [0.8, 0.45, 1.0, 0.55], [[0.7, 0.4, 0.9, 0.5]]);
  approx(nfFar.SDS, 0.8, 1e-12, 'near-fault keeps table 2-1 when larger (SDS)');
  approx(nfFar.SD1, 0.54, 1e-12, 'near-fault keeps table 2-1 when larger (SD1)');

  // ── 2.18 節解說：垂直向暫訂 R = 3.0 → Ra = 1 + 2/1.5 = 2.3333（臺北盆地 2.0）──
  // 手算：SDS=0.66, SD1=0.49, T=0.30 s, T0D=0.74242；0.2T0D ≤ T < 0.6T0D → Fuv = √(2Ra−1) = √(11/3) = 1.914854
  // SaD,V = 0.5×0.66 = 0.33；比值 0.172337 → 0.52×0.172337 + 0.072 = 0.161615；VZ = 0.161615/1.4×100 = 11.5439 tf
  const vert = S.calcVerticalSeismic({ SDS: 0.66, SD1: 0.49, I: 1, alphaY: 1, T: 0.3, ToD: 0.49 / 0.66, isNearFault: false, isTaipeiBasin: false, W_slab: 100 });
  approx(vert.Ra_V, 1 + 2 / 1.5, 1e-12, 'vertical Ra from R=3.0');
  approx(vert.Fuv, Math.sqrt(11 / 3), 1e-12, 'vertical Fuv');
  approx(vert.VZ, (0.52 * (0.33 / Math.sqrt(11 / 3)) + 0.072) / 1.4 * 100, 1e-9, 'vertical VZ hand calc');
  const vertTB = S.calcVerticalSeismic({ SDS: 0.6, SD1: 0.96, I: 1, alphaY: 1, T: 0.5, ToD: 1.6, isNearFault: false, isTaipeiBasin: true, W_slab: 1 });
  approx(vertTB.Ra_V, 2.0, 1e-12, 'vertical Ra Taipei basin');
  approx(S.calcSaFuM_V(0.3, true), 0.52 * 0.3 + 0.096, 1e-12, 'near-fault vertical (C2-11b) constant 0.096');
  approx(S.calcVerticalSeismic({ SDS: 0.66, SD1: 0.49, I: 1, alphaY: 1.5, T: 0.3, ToD: 0.742, isNearFault: false, W_slab: 1 }).col_coeff,
    0.40 * 0.66 / (2 * 1.5), 1e-12, 'column vertical coefficient 0.40 SDS I / (2 alphaY)');

  // ── 表 3-2：阻尼修正之較短週期段 SaD = SDS[0.4 + (1/BS − 0.4)T/(0.2T0)]，T=0 → 0.4SDS ──
  approx(S.calcResponseSpectrumSa(0, 0.66, 0.49, 1.33, 1.25), 0.4 * 0.66, 1e-12, 'damped spectrum at T=0 equals 0.4 SDS');
  const T0damped = 0.49 * 1.33 / (0.66 * 1.25);
  approx(S.calcResponseSpectrumSa(0.2 * T0damped, 0.66, 0.49, 1.33, 1.25), 0.66 / 1.33, 1e-12, 'damped spectrum at 0.2T0 equals SDS/BS');
  approx(S.calcResponseSpectrumSa(0.1 * T0damped, 0.66, 0.49, 1.33, 1.25), 0.66 * (0.4 + (1 / 1.33 - 0.4) * 0.5), 1e-12, 'damped spectrum mid short branch');

  console.log('seismic.js tests passed');
}

run();
