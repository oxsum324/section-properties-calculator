'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { PRIVATE_FILES, classifyPublishedPath } = require('./結構工具箱/tools/build-pages-artifact');

const root = __dirname;
const sourcePath = '結構工具箱/tools/a11y/tool-page-a11y.source.js';
const buildPath = '結構工具箱/tools/build-tool-page-a11y.js';
const publicPath = path.join(root, 'tool-page-a11y.js');
const header = `/* generated from ${sourcePath} by build-tool-page-a11y.js; do not edit */`;
for (const relativePath of [sourcePath, buildPath]) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} must exist`);
  assert.ok(PRIVATE_FILES.has(relativePath), `${relativePath} must be explicitly private`);
  assert.equal(classifyPublishedPath(relativePath).publish, false, `${relativePath} must not enter Pages`);
}
assert.equal(classifyPublishedPath('tool-page-a11y.js').publish, true, 'the existing runtime path stays public');
const check = spawnSync(process.execPath, [path.join(root, buildPath), '--check'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
});
assert.equal(check.error, undefined, `build check should start: ${check.error?.message}`);
assert.equal(check.status, 0, `generated runtime must match source bytes: ${check.stderr}`);
const runtime = fs.readFileSync(publicPath);
assert.ok(runtime.length <= 10500, `runtime exceeds 10,500 bytes: ${runtime.length}`);
assert.equal(runtime.toString('utf8').split('\n')[0], header, 'the first line must identify the generated source');
assert.ok(!runtime.includes(13), 'generated runtime uses LF on every checkout');
new vm.Script(runtime.toString('utf8'), { filename: 'tool-page-a11y.js' });

function extractLiteral(source, name) {
  const prefix = `const ${name} = `;
  const start = source.indexOf(prefix);
  assert.ok(start >= 0, `home.js must define ${name}`);
  const valueStart = start + prefix.length;
  const open = source[valueStart], close = open === '[' ? ']' : '}';
  let depth = 0, quote = null;
  for (let index = valueStart; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index++;
      else if (character === quote) quote = null;
    } else if (["'", '"', '`'].includes(character)) quote = character;
    else if (character === open) depth++;
    else if (character === close && --depth === 0) {
      return vm.runInNewContext(`(${source.slice(valueStart, index + 1)})`, {}, { timeout: 1000 });
    }
  }
  throw new Error(`Unterminated ${name}`);
}

const toolboxRoot = path.join(root, '結構工具箱');
const home = fs.readFileSync(path.join(toolboxRoot, 'assets/home/home.js'), 'utf8');
const tools = extractLiteral(home, 'tools').filter(tool => tool.state === 'formal');
const routeFileMap = extractLiteral(home, 'routeFileMap');
const dependencies = extractLiteral(home, 'HOME_TOOL_UPDATE_DEPENDENCIES').routes;
assert.equal(tools.length, 40, 'all 40 formal homepage tools must retain the runtime');
assert.equal(Object.values(dependencies).filter(files => files.includes(sourcePath)).length, 40,
  'readable source must update the same 40 homepage dates');
for (const tool of tools) {
  assert.ok(routeFileMap[tool.href], `formal route must map to HTML: ${tool.href}`);
  const htmlPath = path.resolve(toolboxRoot, routeFileMap[tool.href]);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*)>/gi)];
  const references = scripts.filter(match => /(?:^|\/)tool-page-a11y\.js$/.test(match[2]));
  assert.equal(references.length, 1, `${tool.href} loads the unchanged runtime exactly once`);
  const reference = references[0];
  assert.equal(path.resolve(path.dirname(htmlPath), reference[2]), publicPath, `${tool.href} preserves its relative runtime path`);
  assert.match(reference[1], /\bdefer\b/, `${tool.href} retains defer`);
  const profile = scripts.find(match => /(?:^|\/)project-meta-profile\.js$/.test(match[2]));
  if (profile) {
    assert.ok(reference.index < profile.index, `${tool.href} keeps a11y before project-meta-profile.js`);
    const bodyEnd = html.lastIndexOf('</body>');
    const profilePosition = html.lastIndexOf('project-meta-profile.js');
    assert.ok(bodyEnd > profilePosition && bodyEnd - profilePosition <= 200, `${tool.href} keeps profile next to body end`);
    assert.equal(scripts.at(-1), profile, `${tool.href} keeps profile as the last external script`);
    assert.doesNotMatch(html.slice(profile.index + profile[0].length, bodyEnd), /<script\b/i,
      `${tool.href} must not append inline scripts after profile`);
  }
  assert.ok(dependencies[tool.href]?.includes('tool-page-a11y.js'), `${tool.href} keeps the public runtime date dependency`);
  assert.ok(dependencies[tool.href]?.includes(sourcePath), `${tool.href} adds the readable source date dependency`);
}

console.log(`tool-page-a11y build contract passed: ${runtime.length} bytes, exact generated bytes, private source/build, 40 routes`);
