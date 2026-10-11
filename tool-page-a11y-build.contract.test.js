'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { PRIVATE_FILES, classifyPublishedPath } = require('./結構工具箱/tools/build-pages-artifact');
const { runtimes, headerFor } = require('./結構工具箱/tools/build-minified-runtimes');

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
const canonicalPath = '結構工具箱/tools/build-minified-runtimes.js';
const criticalBuilderPath = '結構工具箱/tools/build-home-critical-css.js';
const { buildCriticalCss } = require('./結構工具箱/tools/build-home-critical-css');
assert.ok(PRIVATE_FILES.has(criticalBuilderPath), 'critical CSS builder is explicitly private');
assert.equal(classifyPublishedPath(criticalBuilderPath).publish, false, 'critical CSS builder must not enter Pages');
const criticalCheck = spawnSync(process.execPath, [path.join(root, criticalBuilderPath), '--check'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
});
assert.equal(criticalCheck.error, undefined, `critical CSS check should start: ${criticalCheck.error?.message}`);
assert.equal(criticalCheck.status, 0, `critical CSS must match marked styles: ${criticalCheck.stderr}`);
assert.ok(Buffer.byteLength(buildCriticalCss()) <= 6000, 'homepage critical CSS retains the 6000-byte limit');
const homeIndex = fs.readFileSync(path.join(root, '結構工具箱/index.html'), 'utf8');
const noScriptStyles = homeIndex.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1];
assert.ok(noScriptStyles, 'homepage has a no-JavaScript stylesheet fallback');
for (const href of ['assets/hy/colors_and_type.css?v=20261004', 'assets/home/home.css?v=20261004']) {
  assert.ok(homeIndex.includes(`href="${href}" media="print" onload="this.media='all'"`), `${href} loads without blocking first paint`);
  assert.ok(noScriptStyles.includes(`<link rel="stylesheet" href="${href}">`), `${href} remains complete without JavaScript`);
}
const canonicalCheck = spawnSync(process.execPath, [path.join(root, canonicalPath), '--check'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
});
assert.equal(canonicalCheck.error, undefined, `canonical build check should start: ${canonicalCheck.error?.message}`);
assert.equal(canonicalCheck.status, 0, `all generated runtime bytes must match sources: ${canonicalCheck.stderr}`);
const sourcePaths = new Set(runtimes.map(runtime => runtime.source));
for (const relativePath of [...sourcePaths, canonicalPath, buildPath]) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} must exist`);
  assert.ok(PRIVATE_FILES.has(relativePath), `${relativePath} must be explicitly private`);
  assert.equal(classifyPublishedPath(relativePath).publish, false, `${relativePath} must not enter Pages`);
}
const runtimeByteLimits = { home: 78919, a11y: 10500, profile: 39000, wind: 45000, 'report-docx': 12800, 'tool-workflow': 7548, 'workflow-adapters': 6190, 'toolbox-storage': 16627, 'rc-storage': 4947, 'loadcombo': 30728 };
for (const runtimeDefinition of runtimes) {
  const runtimePath = path.join(root, runtimeDefinition.output);
  assert.equal(classifyPublishedPath(runtimeDefinition.output).publish, true, `${runtimeDefinition.output} stays public`);
  const bytes = fs.readFileSync(runtimePath);
  assert.ok(Number.isSafeInteger(runtimeByteLimits[runtimeDefinition.id]), `${runtimeDefinition.id} has a measured byte limit`);
  assert.ok(bytes.length <= runtimeByteLimits[runtimeDefinition.id], `${runtimeDefinition.output} exceeds ${runtimeByteLimits[runtimeDefinition.id]} bytes: ${bytes.length}`);
  assert.ok(!fs.readFileSync(path.join(root, runtimeDefinition.source)).includes(13), `${runtimeDefinition.source} uses LF`);
  assert.equal(bytes.toString('utf8').split('\n')[0], headerFor(runtimeDefinition),
    `${runtimeDefinition.output} retains its generated marker`);
  assert.ok(!bytes.includes(13), `${runtimeDefinition.output} uses LF`);
  new vm.Script(bytes.toString('utf8'), { filename: runtimeDefinition.output });
}
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
const home = fs.readFileSync(path.join(toolboxRoot, 'assets/home/src/home.source.js'), 'utf8');
const tools = extractLiteral(home, 'tools').filter(tool => tool.state === 'formal');
const routeFileMap = extractLiteral(home, 'routeFileMap');
const dependencies = extractLiteral(home, 'HOME_TOOL_UPDATE_DEPENDENCIES').routes;
const homeRoutes = dependencies;
assert.deepEqual(Array.from(homeRoutes['/toolbox-home']), [
  '結構工具箱/assets/home/home.js', '結構工具箱/assets/home/src/home.source.js',
  '結構工具箱/assets/home/home.css', '結構工具箱/assets/hy/colors_and_type.css',
  '結構工具箱/tools/build-home-critical-css.js',
], 'homepage registers its unchanged runtime and readable source');
for (const runtimeDefinition of runtimes) {
  for (const [route, files] of Object.entries(homeRoutes)) {
    if (files.includes(runtimeDefinition.output)) assert.ok(files.includes(runtimeDefinition.source), `${route} registers readable source for ${runtimeDefinition.id}`);
  }
}
assert.equal(Object.values(homeRoutes).filter(files => files.includes('結構工具箱/tools/project-meta-profile.js')).length, 42,
  'all 42 profile runtime date dependencies stay registered');
assert.equal(Object.values(homeRoutes).filter(files => files.includes('結構工具箱/tools/src/project-meta-profile.source.js')).length, 42,
  'all 42 profile source date dependencies are registered');
assert.equal(Object.values(homeRoutes).filter(files => files.includes('結構工具箱/core/loads/wind.js')).length, 16,
  'all 16 core wind runtime date dependencies stay registered');
assert.equal(Object.values(homeRoutes).filter(files => files.includes('結構工具箱/core/loads/src/wind.source.js')).length, 17,
  'all 16 core wind and the stone vendor source date dependencies are registered');
assert.ok(homeRoutes['/stone-fixing']?.includes('石材固定/vendor/loads/wind.js'),
  'stone page keeps its generated vendor wind dependency');
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

assert.ok(fs.statSync(path.join(root, '結構工具箱/tools/project-meta-profile.js')).size <= 39000,
  'project-meta-profile.js must meet the 39,000-byte target (Terser-only output; no source aliasing)');
assert.ok(fs.statSync(path.join(root, '結構工具箱/core/loads/wind.js')).size <= 45000,
  'wind.js must meet the 45,000-byte target');

console.log(`tool-page-a11y build contract passed: ${runtime.length} bytes, exact generated bytes, private source/build, 40 routes`);
