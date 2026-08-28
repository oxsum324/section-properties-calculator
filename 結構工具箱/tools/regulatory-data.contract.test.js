'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const toolboxRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function load(relativePath, globalName) {
  const context = { window: {} };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read(relativePath).toString('utf8'), context, { filename: relativePath });
  return context[globalName];
}

const vendorPairs = [
  ['結構工具箱/core/loads/wind.js', '石材固定/vendor/loads/wind.js'],
  ['結構工具箱/core/loads/seismic-zones.js', '石材固定/vendor/loads/seismic-zones.js'],
  ['結構工具箱/core/loads/seismic.js', '石材固定/vendor/loads/seismic.js'],
  ['結構工具箱/core/loads/regulatory-locations.js', '石材固定/vendor/loads/regulatory-locations.js'],
  ['結構工具箱/core/loads/project-location.js', '石材固定/vendor/loads/project-location.js'],
];
vendorPairs.forEach(([source, vendor]) => {
  assert.strictEqual(sha256(read(vendor)), sha256(read(source)), `${vendor} 必須由 ${source} 同步產生`);
});

const Wind = load('結構工具箱/core/loads/wind.js', 'Wind');
const SeismicZones = load('結構工具箱/core/loads/seismic-zones.js', 'SeismicZones');
const Seismic = load('結構工具箱/core/loads/seismic.js', 'Seismic');
const Locations = load('結構工具箱/core/loads/regulatory-locations.js', 'RegulatoryLocations');
const normalizedZones = Locations.normalizeZones(SeismicZones.ZONES);

assert.ok(Seismic.SOURCE.zonalTable === '表 2-1', '震區資料來源必須標示表 2-1');
assert.deepStrictEqual(Array.from(Seismic.SOURCE.siteCoefficientTables), ['表 2-4(a)', '表 2-4(b)']);
assert.strictEqual(normalizedZones['宜蘭縣']['礁溪鄉'][4], 37.5);
assert.strictEqual(normalizedZones['新竹縣']['峨眉鄉'][4], 32.5);
assert.strictEqual(normalizedZones['臺中市']['龍井區'][4], 32.5);
assert.strictEqual(normalizedZones['彰化縣']['員林市'][4], 27.5);
assert.strictEqual(normalizedZones['雲林縣']['二崙鄉'][4], 27.5);

let rows = 0;
let comparable = 0;
const conflicts = [];
const exceptions = [];
Object.entries(normalizedZones).forEach(([city, districts]) => {
  Object.entries(districts).forEach(([district, row]) => {
    rows += 1;
    const resolved = Locations.resolveWindKey(city, district, Wind.CITY_QUICK);
    if (!resolved.key) {
      exceptions.push({ city, district, reason: resolved.explicitException });
      return;
    }
    comparable += 1;
    if (Number(Wind.CITY_QUICK[resolved.key]) !== Number(row[4])) {
      conflicts.push({ city, district, windKey: resolved.key, wind: Wind.CITY_QUICK[resolved.key], joinedV10C: row[4] });
    }
  });
});

assert.strictEqual(rows, 371, '耐震震區行政區總數漂移');
assert.strictEqual(comparable, 370, '耐風可比對行政區應為 370 筆');
assert.deepStrictEqual(conflicts, [], '耐震鄉鎮資料所附 V10C 與耐風主庫衝突');
assert.deepStrictEqual(exceptions, [{
  city: '宜蘭縣',
  district: '釣魚臺列嶼',
  reason: '耐風主庫未列獨立查表鍵；不得由縣市一般值靜默代用。',
}], '所有無法比對的行政區都必須被明確分類');

[1, 2, 3].forEach(siteClass => {
  [0.35, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9, 1.0].forEach(value => {
    assert.ok(Number.isFinite(Seismic.getFa(siteClass, value)), `Fa 必須為有限值：地盤 ${siteClass}, Ss=${value}`);
  });
  [0.2, 0.3, 0.325, 0.35, 0.375, 0.4, 0.425, 0.45, 0.5, 0.55].forEach(value => {
    assert.ok(Number.isFinite(Seismic.getFv(siteClass, value)), `Fv 必須為有限值：地盤 ${siteClass}, S1=${value}`);
  });
});

assert.strictEqual(Seismic.getFa(2, 0.6), 1.1, '表 2-4(a) 地盤第二類基準值');
assert.ok(Math.abs(Seismic.getFa(2, 0.65) - 1.05) < 1e-12, '表 2-4(a) 必須線性內插');
assert.strictEqual(Seismic.getFv(3, 0.4), 1.6, '表 2-4(b) 地盤第三類基準值');
assert.throws(() => Seismic.getFa('', 0.8), /1、2 或 3/, '不得對未指定地盤種類靜默採地盤第一類');
assert.throws(() => Seismic.getFv(4, 0.4), /1、2 或 3/, '不得對未知地盤種類靜默 fallback');

process.stdout.write(`regulatory-data contract passed: ${rows} zones, ${comparable} wind comparisons, ${exceptions.length} explicit exception\n`);
