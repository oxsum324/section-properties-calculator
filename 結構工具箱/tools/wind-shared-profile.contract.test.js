'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WindSharedProfile = require('./風力/wind-shared-profile.js');

class FakeEvent {
  constructor(type) {
    this.type = type;
  }
}

class FakeElement {
  constructor(tagName, value = '', options = []) {
    this.tagName = tagName.toUpperCase();
    this.type = this.tagName === 'INPUT' ? 'text' : '';
    this.value = value;
    this.options = options.map(option => ({ value: option }));
    this.events = [];
  }

  dispatchEvent(event) {
    this.events.push(event.type);
  }
}

function fakeDocument(elements) {
  return {
    defaultView: { Event: FakeEvent },
    getElementById(id) {
      return elements[id] || null;
    },
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

const legacy = {
  city: '臺北市',
  terrain: 'B',
  impClass: 'IV',
  Kzt: 1.1,
  H: 42,
  floors: 12,
  Bx: 18,
  By: 36,
  projName: '共用耐風案',
  projNo: 'WIND-001',
  projDesigner: '設計人',
  savedAt: '2026-07-16T00:00:00.000Z',
};

const profile = WindSharedProfile.buildProfile(legacy);
assert.equal(profile.schema, 'wind-shared-profile.v1');
assert.equal(profile.project.name, '共用耐風案');
assert.equal(profile.site.importanceClass, 'IV');
assert.equal(profile.building.height, 42);
assert.deepEqual(WindSharedProfile.toOverviewParams(profile), legacy);

const storage = memoryStorage();
WindSharedProfile.save(profile, storage);
assert.deepEqual(WindSharedProfile.load(storage), profile);

const forceMapping = Object.fromEntries(
  WindSharedProfile.resolveMapping(profile, 'wind-force').map(item => [item.target, item.value])
);
assert.equal(forceMapping.B, 18);
assert.equal(forceMapping.L, 36);
assert.equal(forceMapping.N, 12);
assert.equal(forceMapping.h, 3.5);

const profileWithoutHeight = WindSharedProfile.buildProfile({ floors: 12 });
const mappingWithoutHeight = Object.fromEntries(
  WindSharedProfile.resolveMapping(profileWithoutHeight, 'wind-force').map(item => [item.target, item.value])
);
assert.equal(mappingWithoutHeight.h, null, '缺少總高時不得把樓高誤填為 0');
for (const invalidFloors of [0, -2, 2.7, '']) {
  assert.equal(WindSharedProfile.buildProfile({ floors: invalidFloors }).building.floors, null, `無效樓層數不得派送：${invalidFloors}`);
}
for (const invalidKzt of [0, -1, '']) {
  assert.equal(WindSharedProfile.buildProfile({ Kzt: invalidKzt }).site.Kzt, null, `無效 Kzt 不得派送：${invalidKzt}`);
}
for (const [field, key] of [['H', 'height'], ['Bx', 'widthX'], ['By', 'widthY']]) {
  assert.equal(WindSharedProfile.buildProfile({ [field]: -1 }).building[key], null, `無效 ${field} 不得派送`);
}

const elements = {
  projName: new FakeElement('input'),
  projNo: new FakeElement('input'),
  projDesigner: new FakeElement('input'),
  city: new FakeElement('select', '', ['臺北市', '高雄市']),
  terrain: new FakeElement('select', '', ['A', 'B', 'C']),
  impClass: new FakeElement('select', '', ['I', 'II', 'III', 'IV', 'V']),
  Kzt: new FakeElement('input'),
  B: new FakeElement('input'),
  L: new FakeElement('input'),
  N: new FakeElement('input'),
  h: new FakeElement('input'),
};
const applied = WindSharedProfile.applyToDocument(fakeDocument(elements), profile, 'wind-force');
assert.equal(applied.applied.length, 11);
assert.equal(elements.projName.value, '共用耐風案');
assert.equal(elements.city.value, '臺北市');
assert.equal(elements.B.value, '18');
assert.equal(elements.h.value, '3.5');
assert.deepEqual(elements.h.events, ['input', 'change']);

const fenceMappingTargets = WindSharedProfile.mappingForTool('wind-fence-sign').map(item => item.target);
assert.equal(fenceMappingTargets.includes('h'), false, '標示物高度不得由建築物總高誤填');
for (const roofToolId of ['wind-cc', 'wind-parapet', 'wind-open-roof']) {
  const targets = WindSharedProfile.mappingForTool(roofToolId).map(item => item.target);
  assert.equal(targets.includes('h'), false, `${roofToolId} 的屋頂專用高度不得由建築物總高代填`);
  assert.equal(targets.includes('B'), false, `${roofToolId} 的風向專用寬度不得由固定 X 向尺寸代填`);
  assert.equal(targets.includes('L'), false, `${roofToolId} 的風向專用深度不得由固定 Y 向尺寸代填`);
}

const blankElements = {
  projName: new FakeElement('input', '子工具既有案名'),
  projNo: new FakeElement('input', 'EXISTING-001'),
  projDesigner: new FakeElement('input', '既有設計人'),
};
const blankApplied = WindSharedProfile.applyToDocument(
  fakeDocument(blankElements),
  WindSharedProfile.buildProfile({}),
  'wind-object-solid'
);
assert.equal(blankApplied.applied.length, 0, '空白共用欄位不得算成已預填');
assert.equal(blankElements.projName.value, '子工具既有案名', '空白共用案名不得覆蓋子工具既有值');
assert.equal(blankElements.projNo.value, 'EXISTING-001', '空白共用案號不得覆蓋子工具既有值');
assert.equal(blankElements.projDesigner.value, '既有設計人', '空白共用設計人不得覆蓋子工具既有值');

const kztElements = {
  projName: new FakeElement('input'),
  projNo: new FakeElement('input'),
  projDesigner: new FakeElement('input'),
  terrainGrp: new FakeElement('select', '', ['AB', 'C']),
};
const kztApplied = WindSharedProfile.applyToDocument(fakeDocument(kztElements), profile, 'wind-kzt');
assert.equal(kztElements.terrainGrp.value, 'AB');
assert.ok(kztApplied.applied.some(item => item.target === 'terrainGrp'));
assert.deepEqual(
  WindSharedProfile.mappingForTool('wind-kzt').map(item => item.target),
  ['projName', 'projNo', 'projDesigner', 'terrainGrp'],
  'Kzt 入口只宣告頁面實際存在且可安全預填的欄位'
);
assert.equal(kztApplied.applied.length, 4, 'Kzt 預填筆數不得包含頁面不存在的共用欄位');

assert.equal(WindSharedProfile.buildDispatchUrl('wind-force.html'), 'wind-force.html?windProfile=latest');
assert.equal(WindSharedProfile.buildDispatchUrl('wind-force.html?foo=1'), 'wind-force.html?foo=1&windProfile=latest');
assert.equal(WindSharedProfile.buildDispatchUrl('wind-force.html?windProfile=old'), 'wind-force.html?windProfile=latest');

const windDir = path.join(__dirname, '風力');
for (const toolId of WindSharedProfile.SUPPORTED_TOOL_IDS) {
  const html = fs.readFileSync(path.join(windDir, `${toolId}.html`), 'utf8');
  assert.match(html, new RegExp(`wind-shared-profile\\.js["'][^>]*data-wind-tool-id=["']${toolId}["']`), `${toolId} 載入共用案件預填模組`);
  for (const mapping of WindSharedProfile.mappingForTool(toolId)) {
    assert.match(html, new RegExp(`\\bid=["']${mapping.target}["']`), `${toolId} 具備映射欄位 ${mapping.target}`);
  }
}

const overviewHtml = fs.readFileSync(path.join(windDir, 'wind-overview.html'), 'utf8');
assert.match(overviewHtml, /wind-shared-profile\.js/);
assert.match(overviewHtml, /decorateDispatchLinks/);
assert.match(overviewHtml, /wind-shared-profile\.v1/);
assert.doesNotMatch(overviewHtml, /未來版本將支援自動派送/);

console.log('wind shared profile contract tests passed');
