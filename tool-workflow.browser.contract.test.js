'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sourceProbe, probeSourceFile } = require('./tool-workflow.browser.test.js');
const manifest = require('./結構工具箱/tools/tool-workflow.manifest.json');

let verified = 0;
for (const tool of manifest.tools.filter(tool => tool.adapter !== 'native-react')) {
  const file = probeSourceFile(tool);
  const original = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const transformed = sourceProbe(tool, file, original);
  assert.ok(transformed.edits.length > 0, `${tool.key}: real calculation function is instrumented`);
  if (file.endsWith('.js')) new vm.Script(transformed.source, { filename: file });
  else for (const match of transformed.source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (match[2].trim() && !/\b(?:module|application\/json)\b/.test(match[1])) new vm.Script(match[2], { filename: file });
  }
  assert.equal(fs.readFileSync(path.join(__dirname, file), 'utf8'), original, 'probe never changes working files');
  verified++;
}
assert.equal(verified, 40);
const beam = manifest.tools.find(tool => tool.key === '/rc-beam');
assert.throws(() => sourceProbe(beam, beam.file, '<script>/* missing */</script>'), /探針應唯一/);
assert.throws(() => sourceProbe(beam, beam.file, 'function calcBeam() { }\nfunction calcBeam() { }'), /探針應唯一/);
const fixture = sourceProbe(beam, beam.file, 'function calcBeam() { return 7; }').source;
const names = [], context = { __hyWorkflowBrowserProbe: { hit: name => names.push(name) } };
vm.createContext(context); vm.runInContext(fixture, context);
assert.equal(context.calcBeam(), 7); context.calcBeam();
assert.deepEqual(names, ['calcBeam', 'calcBeam'], 'probe catches duplicate actual calls, not merely keyboard events');
const anchor = manifest.tools.find(tool => tool.key === '/anchor');
const native = sourceProbe(anchor, 'anchor/assets/qa.js', 'const deps={calculateAndShowResults:()=>{return 7}};globalThis.run=deps.calculateAndShowResults;');
assert.deepEqual(native.edits, ['calculateAndShowResults']);
vm.runInContext(native.source, context); assert.equal(context.run(), 7);
assert.equal(names.at(-1), 'calculateAndShowResults');
const nativeHtml = fs.readFileSync(path.join(__dirname, anchor.file), 'utf8');
const nativeScripts = Array.from(nativeHtml.matchAll(/<script\b[^>]*src="([^\"]+\.js)"/g), match => path.posix.join(path.posix.dirname(anchor.file), match[1]));
let nativeEntries = 0;
for (const file of nativeScripts) {
  const built = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const probed = sourceProbe(anchor, file, built);
  nativeEntries += probed.edits.length;
  if (probed.edits.length) execFileSync(process.execPath, ['--input-type=module', '--check'], { input: probed.source, stdio: ['pipe', 'pipe', 'pipe'] });
}
assert.equal(nativeEntries, 1, 'currently deployed anchor build contains exactly one real calculation action probe');
console.log('workflow browser harness: 40 real-source probes and the current native build compile, duplicate calls are counted, missing probes fail closed; browser not started');
