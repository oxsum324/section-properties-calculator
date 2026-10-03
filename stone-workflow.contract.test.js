'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createController } = require('./結構工具箱/core/ui/tool-workflow.js');
const { createOptions } = require('./結構工具箱/tools/tool-workflow-adapters.js');
const html = fs.readFileSync(path.join(__dirname, '石材固定/石材計算書產生器_規範版V2.html'), 'utf8');
const marker = html.indexOf('/* ═════════ V2 快捷鍵 ═════════ */');
const start = html.indexOf("document.addEventListener('keydown', e=>{", marker);
const end = html.indexOf('\n});', start) + 4;
assert.ok(marker >= 0 && start > marker && end > start, 'exact stone shortcut source exists');
let legacy, calculations = 0, exportCalls = 0, prints = 0, navigations = 0;
const context = {
  document: { addEventListener(type, callback) { assert.equal(type, 'keydown'); legacy = callback; } },
  render() { calculations++; }, exportJSON() { exportCalls++; }, previewPrint() { prints++; }
};
vm.createContext(context); vm.runInContext(html.slice(start, end), context);
const controller = createController({ calculate() { calculations++; }, showResults() { navigations++; } });
function event(flags = {}) {
  return { key: 'Enter', target: { tagName: 'INPUT' }, ctrlKey: true, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...flags };
}
function dispatch(flags) { const e = event(flags); controller.handleKeyDown(e); if (!e.stopped) legacy(e); return e; }
const excluded = [
  { ctrlKey: false }, { altKey: true }, { shiftKey: true }, { repeat: true },
  { isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }
];
for (const flags of excluded) {
  const before = calculations;
  dispatch(flags);
  assert.equal(calculations, before, `shared capture plus real legacy handler ignores ${JSON.stringify(flags)}`);
  legacy(event(flags));
  assert.equal(calculations, before, 'legacy handler also remains safe before the shared core installs');
}
dispatch({}); assert.deepEqual([calculations, navigations], [1, 1], 'shared shortcut calculates and navigates exactly once');
legacy(event()); assert.equal(calculations, 2, 'standalone legacy Ctrl+Enter remains available');
dispatch({ ctrlKey: false, metaKey: true }); assert.deepEqual([calculations, navigations], [3, 2], 'Mac shortcut calculates once');
dispatch({ key: 's' }); dispatch({ key: 'p' });
assert.deepEqual([exportCalls, prints], [1, 1], 'existing save and print shortcuts are preserved');
const originalState = { textContent: 'C 先修正', classList: { contains(name) { return name === 'ng'; } } };
const summary = createOptions({ key: '/stone-fixing', resultSelector: '#review-dashboard' }, {
  document: { querySelector(selector) { return selector === '#review-dashboard .dash-state' ? originalState : null; } }
});
assert.deepEqual(summary.readSummary(), { text: 'C 先修正', tone: 'fail' }, 'stone summary mirrors the original dashboard verdict instead of report cover/table-of-contents text');
assert.equal(summary.summarySelector, '#review-dashboard', 'observer follows the stable parent when render replaces the verdict child');
console.log('stone workflow: real legacy handler excludes Alt/Shift/IME/repeat/prevented Enter; shared and standalone calculation are single-call; save/print preserved');
