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
for (const [file, profiles] of Object.entries(expectedProfiles)) {
  const source = fs.readFileSync(path.join(root, `鋼筋混凝土/tools/${file}.html`), 'utf8');
  assert.doesNotMatch(source, /(?:const|let|var)\s+fmt\s*=|function\s+fmt\s*\(/, `${file} 不得保留局部 fmt 實作`);
  for (const profile of profiles) assert.ok(source.includes(profile + '('), `${file} 應採既有型別與位數政策`);
}
console.log('rc-format.contract.test.js passed (9 local implementations removed; coercion/digits/fallback/errors preserved)');
