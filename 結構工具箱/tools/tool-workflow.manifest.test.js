const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const manifest = require('./tool-workflow.manifest.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const homepage = read('結構工具箱/assets/home/home.js');
const match = homepage.match(/const tools = (\[[\s\S]*?\n  \]);/);
assert.ok(match, 'homepage tool inventory is readable');
const tools = vm.runInNewContext(`(${match[1]})`);
const expected = tools.filter(tool => tool.state === 'formal' || tool.href === '/beam-analysis');
assert.equal(expected.length, 41, 'approved scope stays at 40 formal plus continuous beam');
assert.deepEqual(manifest.tools.map(tool => tool.key).sort(), Array.from(expected, tool => tool.href).sort());
assert.equal(new Set(manifest.tools.map(tool => tool.key)).size, 41);
assert.equal(manifest.tools.find(tool => tool.key === '/beam-analysis').state, 'assist', 'workflow never promotes continuous beam to formal');

for (const tool of manifest.tools) {
  const html = read(tool.file);
  assert.equal(tool.pageOnly, true, `${tool.key}: output is operation-page only`);
  assert.ok(['button', 'callback', 'rc-summary', 'steel-explicit', 'native-react'].includes(tool.adapter), `${tool.key}: explicit adapter required`);
  if (tool.calculateButton) {
    const id = tool.calculateButton.slice(1);
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const button = html.match(new RegExp(`<button\\b[^>]*id="${escaped}"[^>]*>[\\s\\S]*?<\\/button>`));
    assert.ok(button, `${tool.key}: calculation button exists`);
    assert.doesNotMatch(button[0], /列印|產生計算書|計算書預覽|匯出計算書/, `${tool.key}: report generation cannot be used as calculation`);
  }
  if (tool.calculateFunction) {
    for (const name of tool.calculateFunction.split(' / ')) {
      assert.match(html, new RegExp(`\\b${name}\\s*\\(`), `${tool.key}: calculation callback exists in source`);
    }
  }
  if (tool.entryFunction) assert.match(html, new RegExp(`function ${tool.entryFunction}\\(`));
  if (tool.sourceFile) assert.ok(fs.existsSync(path.join(root, tool.sourceFile)), `${tool.key}: editable source exists`);
  if (tool.adapter !== 'native-react') {
    for (const id of tool.resultSelector.matchAll(/#([\w-]+)/g)) {
      assert.ok(html.includes(`id="${id[1]}"`), `${tool.key}: result ${id[0]} exists`);
    }
  }
  for (const selector of tool.modalSelectors || []) {
    assert.ok(html.includes(`id="${selector.slice(1)}"`), `${tool.key}: modal ${selector} exists`);
  }
}
assert.equal(manifest.tools.filter(tool => tool.adapter === 'native-react').length, 1);
assert.equal(manifest.tools.filter(tool => tool.adapter === 'steel-explicit').length, 4);
assert.ok(!read(manifest.core).includes('RCCalcVerdictStrip'), 'core workflow has no RC family dependency');
console.log('tool-workflow manifest: all 41 approved routes, calculation entrypoints, result anchors and native sources verified (runtime wiring is browser-tested separately)');
