'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function load(relativePaths) {
  const context = { window: {}, console };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  relativePaths.forEach(relativePath => {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'), context, { filename: relativePath });
  });
  return context;
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function fakeSelect(values, initial) {
  return {
    value: initial || '',
    options: values.map(value => ({ value })),
    events: [],
    dispatchEvent(event) { this.events.push(event.type); },
  };
}

const context = load([
  '結構工具箱/core/loads/wind.js',
  '結構工具箱/core/loads/seismic-zones.js',
  '結構工具箱/core/loads/seismic.js',
  '結構工具箱/core/loads/regulatory-locations.js',
  '結構工具箱/core/loads/project-location.js',
]);
const ProjectLocation = context.ProjectLocation;
const deps = {
  wind: context.Wind,
  zones: context.SeismicZones,
  seismic: context.Seismic,
  locations: context.RegulatoryLocations,
};

const taipei = ProjectLocation.buildProfile({
  city: '臺北市',
  district: '中正區',
  siteClass: 2,
  source: { toolId: 'seismic-force', toolVersion: 'V4' },
  savedAt: '2026-08-27T00:00:00.000Z',
}, deps);
assert.equal(taipei.schema, 'structural-project-location.v1');
assert.equal(taipei.version, '1.0.0');
assert.deepEqual(taipei.location, { city: '臺北市', district: '中正區' });
assert.deepEqual(taipei.site, { class: 2 });
assert.equal('regulatory' in taipei, false, '設定檔不得凍結可能過期的規範係數');

const taipeiResolved = ProjectLocation.resolve(taipei, deps);
assert.equal(taipeiResolved.regulatory.seismic.SsD, 0.6);
assert.equal(taipeiResolved.site.Fa, 1.1);
assert.ok(Math.abs(taipeiResolved.site.SDS - 0.66) < 1e-12);
assert.equal(taipeiResolved.regulatory.wind.V10C, 42.5);

const aliasResolved = ProjectLocation.resolve({ city: '雲林縣', district: '二崙鎮', siteClass: 1 }, deps);
assert.equal(aliasResolved.location.district, '二崙鄉');
assert.equal(aliasResolved.regulatory.wind.V10C, 27.5);

const exceptionResolved = ProjectLocation.resolve({ city: '宜蘭縣', district: '釣魚臺列嶼' }, deps);
assert.equal(exceptionResolved.regulatory.wind.key, '');
assert.match(exceptionResolved.regulatory.wind.explicitException, /不得.*代用/);

const storage = memoryStorage();
ProjectLocation.save(taipei, storage, deps);
assert.deepEqual(ProjectLocation.load(storage, deps), taipei);
assert.throws(
  () => ProjectLocation.normalizeProfile({ schema: 'unknown.v1' }, deps),
  /不支援的共用工址格式/,
);

class FakeEvent {
  constructor(type) { this.type = type; }
}
const seismicElements = {
  zoneCity: fakeSelect(['', '臺北市']),
  zoneDist: fakeSelect(['', '中正區']),
  siteClass: fakeSelect(['1', '2', '3']),
};
const seismicDocument = {
  defaultView: { Event: FakeEvent },
  getElementById(id) { return seismicElements[id] || null; },
};
const appliedSeismic = ProjectLocation.applyToDocument(seismicDocument, taipei, deps);
assert.deepEqual(Array.from(appliedSeismic.applied), ['縣市', '鄉鎮市區', '地盤分類']);
assert.equal(seismicElements.zoneCity.value, '臺北市');
assert.equal(seismicElements.zoneDist.value, '中正區');
assert.equal(seismicElements.siteClass.value, '2');
assert.deepEqual(seismicElements.zoneCity.events, ['input', 'change']);

const windElements = { city: fakeSelect(['臺北市', '臺北市－中正區']) };
const windDocument = {
  defaultView: { Event: FakeEvent },
  getElementById(id) { return windElements[id] || null; },
};
const appliedWind = ProjectLocation.applyToDocument(windDocument, taipei, deps);
assert.deepEqual(Array.from(appliedWind.applied), ['耐風地點']);
assert.equal(windElements.city.value, taipeiResolved.regulatory.wind.key);
assert.throws(() => ProjectLocation.captureFromDocument(windDocument, deps), /只能套用共用工址/);

const integrationPages = [
  ['結構工具箱/tools/風力/wind-overview.html', '../../core/loads/project-location.js'],
  ['結構工具箱/tools/地震力/seismic-force.html', '../../core/loads/project-location.js'],
  ['結構工具箱/tools/地震力/seismic-appendage.html', '../../core/loads/project-location.js'],
  ['結構工具箱/tools/地震力/seismic-misc.html', '../../core/loads/project-location.js'],
  ['結構工具箱/tools/地震力/seismic-dynamic.html', '../../core/loads/project-location.js'],
  ['石材固定/石材計算書產生器_規範版V2.html', 'vendor/loads/project-location.js'],
];
integrationPages.forEach(([relativePath, expectedScript]) => {
  const html = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  assert.ok(html.includes(expectedScript), `${relativePath} 必須載入共用工址服務`);
  assert.match(html, /data-location-tool-id=/, `${relativePath} 必須揭露工址來源工具識別`);
});

const stoneHtml = fs.readFileSync(path.join(repoRoot, '石材固定/石材計算書產生器_規範版V2.html'), 'utf8');
assert.ok(stoneHtml.indexOf('vendor/loads/regulatory-locations.js') < stoneHtml.indexOf('vendor/loads/project-location.js'));
assert.ok(stoneHtml.indexOf('vendor/loads/seismic.js') < stoneHtml.indexOf('vendor/loads/project-location.js'));
assert.ok(stoneHtml.indexOf('vendor/loads/wind.js') < stoneHtml.indexOf('vendor/loads/project-location.js'));

process.stdout.write('project-location tests passed: canonical site profile, live regulatory resolution, seismic/wind apply\n');
