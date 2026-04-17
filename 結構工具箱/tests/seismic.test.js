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

  console.log('seismic.js tests passed');
}

run();
