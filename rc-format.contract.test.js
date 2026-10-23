const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.REPORT_TEST_ROOT || __dirname;
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, '鋼筋混凝土/shared/common.js'), 'utf8'), context);
const { formatFinite, formatOneDecimal } = context.window.RCUI;

// 固定預期值獨立於實作：三種格式的型別政策與預設位數不能混為一談。
for (const [value, coerce, finite, one] of [
  [1.25, '1.25', '1.25', '1.3'], [-1.25, '-1.25', '-1.25', '-1.3'],
  ['1.25', '1.25', '—', '1.3'], [0, '0.00', '0.00', '0.0'], [-0, '0.00', '0.00', '0.0'],
  ['', '0.00', '—', '0.0'], [' ', '0.00', '—', '0.0'],
  [false, '0.00', '—', '0.0'], [true, '1.00', '—', '1.0'],
  [Infinity, 'Infinity', '—', 'Infinity'], [-Infinity, '-Infinity', '—', '-Infinity'],
  ['Infinity', 'Infinity', '—', 'Infinity'], [null, '—', '—', '—'],
  [undefined, '—', '—', '—'], [NaN, '—', '—', '—'], ['invalid', '—', '—', '—'],
]) {
  assert.equal(context.fmt(value), coerce);
  assert.equal(formatFinite(value), finite);
  assert.equal(formatOneDecimal(value), one);
}
for (const fn of [context.fmt, formatFinite, formatOneDecimal]) {
  assert.equal(fn(1.23456, 4), '1.2346');
  assert.equal(fn(1.25, 0), '1');
  assert.throws(() => fn(1, 101), error => error.name === 'RangeError');
  assert.throws(() => fn(1, -1), error => error.name === 'RangeError');
}
assert.equal(formatFinite(NaN, 2, null), null);
assert.equal(formatFinite(Infinity, 2, 0), 0);
assert.equal(formatFinite(null, 2, '待填'), '待填');
assert.equal(formatFinite(null, 101), '—', '不適用數值先回 fallback，不執行 toFixed');
assert.equal(formatFinite(Symbol('value')), '—');
assert.equal(formatFinite(1n), '—');
for (const value of [Symbol('value'), 1n]) assert.throws(() => context.fmt(value), error => error.name === 'TypeError');
let coerced = 0;
assert.equal(context.fmt({ valueOf() { coerced++; return 1.25; } }), '1.25');
assert.equal(coerced, 2, '保留 isNaN 與 Number 兩次轉型的原順序');

const expectedProfiles = {
  beam: ['RCUI.formatFinite'], column: [], 'deep-beam-stm': ['RCUI.formatFinite'],
  'foundation-deep-beam-stm': ['RCUI.formatFinite'], 'shear-wall': ['RCUI.formatOneDecimal'],
  'single-pile-designer': ['RCUI.formatFinite'], wall: ['RCUI.formatOneDecimal'],
};
// 柱頁主程式已外移至 column.app.js：column 改讀還原到原內嵌位置的頁面全文（單一來源 column-app-source.test.js），
// 否則只讀 column.html 會讓本檢查對主程式完全失效。
const columnPage = require('./鋼筋混凝土/tools/column-app-source.test.js');
const LOCAL_FMT = /(?:const|let|var)\s+fmt\s*=|function\s+fmt\s*\(/;
const readRcToolSource = file => columnPage.readPageSource(`鋼筋混凝土/tools/${file}.html`, { root });
for (const [file, profiles] of Object.entries(expectedProfiles)) {
  const source = readRcToolSource(file);
  assert.doesNotMatch(source, LOCAL_FMT, `${file} 不得保留局部 fmt 實作`);
  for (const profile of profiles) assert.ok(source.includes(profile + '('), `${file} 應採既有型別與位數政策`);
}
// 變異守門：檢查對象必須是柱頁真正的主程式（含共用 fmt 呼叫），且在 column.app.js 內加入局部 fmt 時必被偵測。
{
  const columnSource = readRcToolSource('column');
  assert.ok((columnSource.match(/\bfmt\(/g) || []).length > 0, 'column 檢查對象含主程式的共用 fmt 呼叫（不是只有標記的 column.html）');
  const html = fs.readFileSync(path.join(root, ...columnPage.COLUMN_HTML_RELATIVE.split('/')), 'utf8');
  const app = fs.readFileSync(path.join(root, ...columnPage.COLUMN_APP_RELATIVE.split('/')), 'utf8');
  assert.match(columnPage.restoreColumnPageSource(html, app + '\nfunction fmt(value) { return String(value); }\n'), LOCAL_FMT,
    'column.app.js 內的局部 fmt 實作必被本檢查偵測');
}
console.log('rc-format.contract.test.js passed (9 local implementations removed; coercion/digits/fallback/errors preserved)');
