// 跨工具共用公式一致性：仍保留獨立實作的模組（SRC 核心為可單獨載入的 UMD），
// 必須與 結構工具箱/core 的單一來源逐點一致；型鋼尺寸表不得在頁面內另存副本。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadWindowModule(relativePath, globalName) {
  const context = { window: {}, Math };
  vm.createContext(context);
  vm.runInContext(read(relativePath), context, { filename: relativePath });
  return context.window[globalName];
}

const Concrete = loadWindowModule('結構工具箱/core/materials/concrete.js', 'Concrete');
const Steel = loadWindowModule('結構工具箱/core/materials/steel.js', 'Steel');
const PMSection = require('./鋼筋混凝土/shared/pmsection.js');
const SrcBeamCore = require('./SRC工具/core/src-beam-core.js');
const SrcColumnRcBiaxial = require('./SRC工具/core/src-column-rc-biaxial.js');

// β1（112 規範）逐點一致
const beta1Implementations = {
  'PMSection.beta1Of': PMSection.beta1Of,
  'SrcBeamCore.beta1ForConcrete': SrcBeamCore.beta1ForConcrete,
  'SrcColumnRcBiaxial.beta1Of': SrcColumnRcBiaxial.beta1Of,
};
for (let fc = 140; fc <= 840; fc += 5) {
  const expected = Concrete.calcBeta1(fc);
  for (const [name, fn] of Object.entries(beta1Implementations)) {
    assert.ok(Math.abs(fn(fc) - expected) < 1e-12, `${name}(${fc}) = ${fn(fc)} 與 Concrete.calcBeta1 = ${expected} 不一致`);
  }
}
assert.equal(Concrete.calcBeta1(280), 0.85);
assert.equal(Concrete.calcBeta1(560), 0.65);
assert.ok(Math.abs(Concrete.calcBeta1(350) - 0.80) < 1e-12);

// 已改用 core 的頁面不得再內嵌 β1 / Ec 公式或型鋼尺寸表
const retrofit = read('RC補強斷面性質.html');
assert.ok(retrofit.includes('<script src="結構工具箱/core/materials/concrete.js"></script>'), 'RC補強 須載入 core concrete.js');
assert.ok(retrofit.includes('return Concrete.calcBeta1(fc_ksc);'), 'RC補強 β1 須取自 Concrete.calcBeta1');
assert.ok(retrofit.includes('return Concrete.calcEc(fc_ksc);'), 'RC補強 Ec 須取自 Concrete.calcEc');

for (const page of ['index.html', '合成斷面性質.html']) {
  const source = read(page);
  assert.ok(source.includes('<script src="結構工具箱/core/materials/steel.js"></script>'), `${page} 須載入 core steel.js`);
  assert.ok(!/const hSections = \[/.test(source), `${page} 不得內嵌型鋼尺寸表`);
  assert.ok(source.includes('Steel.H_SECTIONS_MM'), `${page} 型鋼尺寸須取自 Steel.H_SECTIONS_MM`);
}

// 合成斷面採用清單的每一筆都須存在於 core 型鋼表
const coreNames = new Set(Steel.H_SECTIONS_MM.flatMap(group => group.s.map(item => item.n)));
const compositeSource = read('合成斷面性質.html');
const namesBlock = compositeSource.slice(compositeSource.indexOf('COMPOSITE_H_SECTION_NAMES = new Set(['), compositeSource.indexOf(']);', compositeSource.indexOf('COMPOSITE_H_SECTION_NAMES')));
const compositeNames = [...namesBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.equal(compositeNames.length, 44, '合成斷面型鋼清單筆數');
for (const name of compositeNames) assert.ok(coreNames.has(name), `合成斷面型鋼 ${name} 不在 core H_SECTIONS_MM`);

// core 型鋼表基本合理性：軋製 H 型鋼翼板厚不小於腹板厚
for (const group of Steel.H_SECTIONS_MM) {
  for (const item of group.s) {
    assert.ok(item.tf >= item.tw, `${item.n} 翼板厚 tf=${item.tf} 小於腹板厚 tw=${item.tw}`);
    assert.ok(item.H > 2 * item.tf && item.B > item.tw && item.R > 0, `${item.n} 尺寸不合理`);
  }
}

// core 型鋼尺寸／R 角與 Steel.calcProps，須與已查核的官方表列值一致
// （SRC 教材附錄表 1-1，見 SRC工具/core/src-column-h-section-catalog.js；表列取 3 位有效數字，容許 ±0.5%）
const SrcCatalog = require('./SRC工具/core/src-column-h-section-catalog.js');
const coreSections = Steel.H_SECTIONS_MM.flatMap(group => group.s);
const toMm = cm => Math.round(cm * 100) / 10;
for (const official of SrcCatalog.SECTIONS) {
  const d = official.dimensions;
  const match = coreSections.find(item => item.H === toMm(d.depthCm) && item.B === toMm(d.flangeWidthCm)
    && item.tw === toMm(d.webThicknessCm) && item.tf === toMm(d.flangeThicknessCm));
  assert.ok(match, `官方表 ${official.name} 須存在於 core H_SECTIONS_MM`);
  assert.equal(match.R, toMm(d.rootRadiusCm), `${official.name} R 角須與官方表一致`);
  const props = Steel.calcProps(match);
  const t = official.properties;
  for (const [label, computed, tabulated] of [['A', props.A, t.areaCm2], ['Ix', props.Ix, t.ixCm4], ['Iy', props.Iy, t.iyCm4], ['Sx', props.Sx, t.sxCm3], ['Zx', props.Zx, t.zxCm3]]) {
    assert.ok(Math.abs(computed / tabulated - 1) <= 0.005, `${official.name} ${label} 計算 ${computed.toFixed(1)} 與官方表 ${tabulated} 差異超過 0.5%`);
  }
}

console.log(`shared formula parity contract OK (β1 implementations=${Object.keys(beta1Implementations).length + 1}, H sections=${coreNames.size}, composite=${compositeNames.length})`);
