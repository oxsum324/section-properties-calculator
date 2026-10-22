'use strict';
// 共用導覽頂欄（tool-chrome.js ＋ tool-nav.manifest.js）建置與注入契約：
// 清冊與產出逐位元組同步、清冊資料與程式碼分離、靜態占位與兩個 script 的位置規則、列印隱藏規則、
// 首頁日期依賴登錄（只含 chrome 兩檔）、產出大小上限。
// 用法：node 結構工具箱/tools/nav/tool-chrome-build.contract.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../..');
const { PRIVATE_FILES, classifyPublishedPath } = require(path.join(root, '結構工具箱/tools/build-pages-artifact'));
const manifestBuilder = require('./build-tool-nav-manifest');
const chromeBuilder = require('./build-tool-chrome');

const MANIFEST_BUILDER = '結構工具箱/tools/nav/build-tool-nav-manifest.js';
const CHROME_BUILDER = '結構工具箱/tools/nav/build-tool-chrome.js';
const SOURCE = chromeBuilder.SOURCE;
const MANIFEST = manifestBuilder.MANIFEST;
const RUNTIME_MANIFEST = manifestBuilder.RUNTIME_MANIFEST;
const OUTPUT = chromeBuilder.OUTPUT;
const RUNTIME_BYTE_LIMIT = 8192;
const RUNTIME_MANIFEST_BYTE_LIMIT = 12288;
const SLOT_MARKUP = '<div class="tool-chrome-slot page-only-tool-chrome" data-tool-chrome-slot style="min-height:44px"></div>';
// 本輪不注入：PWA、SPA、石材自有列印管線；外部套件依 state 排除。
const EXCLUDED_ROUTES = ['/condition-survey', '/anchor', '/stone-fixing'];
const EXPECTED_TARGET_COUNT = 49;
// 首頁更新日依賴只登錄程式碼兩檔；清冊（json／js）變動不改路由更新日。
const DEPENDENCIES = [OUTPUT, SOURCE];
const FORBIDDEN_DEPENDENCIES = [MANIFEST, RUNTIME_MANIFEST];

function run(relativePath, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, relativePath), ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(result.error, undefined, `${relativePath} should start: ${result.error?.message}`);
  return result;
}

// --- 私有／公開分類與 LF ---
for (const relativePath of [MANIFEST_BUILDER, CHROME_BUILDER, SOURCE, MANIFEST]) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} must exist`);
  assert.ok(PRIVATE_FILES.has(relativePath), `${relativePath} must be explicitly private`);
  assert.equal(classifyPublishedPath(relativePath).publish, false, `${relativePath} must not enter Pages`);
}
assert.equal(classifyPublishedPath(OUTPUT).publish, true, 'tool-chrome.js stays public at the repository root');
assert.equal(classifyPublishedPath(RUNTIME_MANIFEST).publish, true, 'tool-nav.manifest.js stays public at the repository root');
assert.equal(classifyPublishedPath('結構工具箱/tools/nav/tool-chrome-build.contract.test.js').publish, false, 'contract test stays private');
const gitattributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
for (const relativePath of [OUTPUT, RUNTIME_MANIFEST, SOURCE, CHROME_BUILDER, MANIFEST_BUILDER, MANIFEST]) {
  assert.ok(gitattributes.includes(`${relativePath} text eol=lf`), `${relativePath} is pinned to LF in .gitattributes`);
  assert.ok(!fs.readFileSync(path.join(root, relativePath)).includes(13), `${relativePath} uses LF`);
}

// --- 清冊與產出同步 ---
const manifestCheck = run(MANIFEST_BUILDER, ['--check']);
assert.equal(manifestCheck.status, 0, `manifest json/js must match home.source.js: ${manifestCheck.stderr}`);
const chromeCheck = run(CHROME_BUILDER, ['--check']);
assert.equal(chromeCheck.status, 0, `generated runtime must match source bytes: ${chromeCheck.stderr}`);

const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8'));
assert.equal(manifest.version, 1, 'manifest version');
assert.equal(manifest.generatedBy, manifestBuilder.GENERATED_BY, 'manifest names its generator');
assert.equal(manifest.home, '結構工具箱/index.html', 'manifest home file');
assert.deepEqual(manifest.families.map(family => family.id), ['rc', 'steel', 'wind', 'seismic', 'local-quick', 'analysis', 'reference', 'attachments'], 'fixed family order');
for (const family of manifest.families) {
  assert.deepEqual(Object.keys(family), ['id', 'label', 'file'], `family ${family.id} keeps fixed keys`);
  const expected = manifestBuilder.FAMILY_PAGES[family.id];
  if (expected) assert.equal(family.file, expected.file, `family ${family.id} links its family page`);
  else assert.equal(family.file, `結構工具箱/index.html?category=${family.id}`, `family ${family.id} deep-links the homepage category`);
}
for (const tool of manifest.tools) {
  assert.deepEqual(Object.keys(tool), ['route', 'file', 'title', 'version', 'state', 'stateLabel', 'family', 'categories', 'memberSystem'], `${tool.route} keeps fixed keys`);
  assert.ok(manifest.families.some(family => family.id === tool.family), `${tool.route} family is registered`);
  assert.ok(!tool.file.startsWith('../') && !tool.file.startsWith('/'), `${tool.route} file is repository relative`);
  assert.ok(fs.existsSync(path.join(root, tool.file)), `${tool.route} file exists: ${tool.file}`);
}
const familyExpectations = {
  '/rc-beam': 'rc', '/rc-column-cover-deviation': 'rc', '/src-beam': 'steel', '/steel-formal': 'steel', '/steel-beam': 'steel',
  '/steel-plate': 'attachments', '/anchor': 'attachments', '/wind-kzt': 'wind', '/seismic-dynamic': 'seismic',
  '/cable-tension-frequency': 'local-quick', '/decking': 'local-quick', '/excavation-support': 'local-quick', '/condition-survey': 'local-quick',
  '/section': 'reference', '/concrete-strength-ndt': 'reference', '/beam-analysis': 'analysis', '/struct-dx': 'analysis',
};
for (const [route, family] of Object.entries(familyExpectations)) {
  assert.equal(manifest.tools.find(tool => tool.route === route)?.family, family, `${route} derives family ${family}`);
}

// --- 執行期清冊 tool-nav.manifest.js：一行、標頭、只掛 window.STRUCT_TOOL_NAV、內容＝清冊投影 ---
const runtimeManifestText = fs.readFileSync(path.join(root, RUNTIME_MANIFEST), 'utf8');
assert.ok(runtimeManifestText.length <= RUNTIME_MANIFEST_BYTE_LIMIT, `tool-nav.manifest.js exceeds ${RUNTIME_MANIFEST_BYTE_LIMIT} bytes: ${Buffer.byteLength(runtimeManifestText)}`);
assert.equal(runtimeManifestText.split('\n').length, 2, 'tool-nav.manifest.js is a single line plus trailing LF');
assert.ok(runtimeManifestText.startsWith(`${manifestBuilder.runtimeHeader} window.${manifestBuilder.RUNTIME_GLOBAL} = {`), 'tool-nav.manifest.js carries the generated header and global assignment');
const runtimeWindow = {};
vm.runInNewContext(runtimeManifestText, { window: runtimeWindow }, { filename: RUNTIME_MANIFEST });
assert.deepEqual(Object.keys(runtimeWindow), [manifestBuilder.RUNTIME_GLOBAL], 'runtime manifest defines only the nav global');
assert.deepEqual(JSON.parse(JSON.stringify(runtimeWindow[manifestBuilder.RUNTIME_GLOBAL])), manifestBuilder.runtimeProjection(manifest), 'runtime manifest equals the projection of the JSON manifest');

// --- 首頁來源：工具卡欄位白名單、清冊工具數、日期依賴登錄、深連結（home.source.js 由整合者維護，此處只讀） ---
const homeSource = fs.readFileSync(path.join(root, manifestBuilder.HOME_SOURCE), 'utf8');
const homeTools = manifestBuilder.extractLiteral(homeSource, 'tools');
assert.equal(manifest.tools.length, homeTools.length, 'manifest covers every homepage tool');
for (const tool of homeTools) {
  const unexpected = Object.keys(tool).filter(key => !manifestBuilder.TOOL_FIELD_WHITELIST.includes(key));
  assert.deepEqual(unexpected, [], `${tool.href} adds no homepage card fields`);
}
assert.ok(homeSource.includes("params.get('category')") && homeSource.includes("params.get('member')"), 'homepage reads ?category= and ?member= deep links');
const dependencies = manifestBuilder.extractLiteral(homeSource, 'HOME_TOOL_UPDATE_DEPENDENCIES').routes;
assert.deepEqual(Array.from(dependencies['/toolbox-home']), ['結構工具箱/assets/home/home.js', '結構工具箱/assets/home/src/home.source.js'], 'homepage route keeps its own dependencies only');
for (const [route, files] of Object.entries(dependencies)) {
  for (const forbidden of FORBIDDEN_DEPENDENCIES) assert.ok(!files.includes(forbidden), `${route} must not register the nav manifest (${forbidden}) as a date dependency`);
}

// --- 注入對象 ---
const targets = manifest.tools.filter(tool => tool.state !== 'external' && !EXCLUDED_ROUTES.includes(tool.route));
assert.equal(targets.length, EXPECTED_TARGET_COUNT, `injection targets derived from the manifest: ${targets.length}`);
const publicRuntime = path.join(root, OUTPUT);
const publicManifest = path.join(root, RUNTIME_MANIFEST);
for (const tool of targets) {
  const htmlPath = path.join(root, tool.file);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const body = html.match(/<body\b[^>]*>/i);
  assert.ok(body, `${tool.route} has a <body> tag`);
  assert.ok(body[0].includes(`data-family="${tool.family}"`), `${tool.route} body carries data-family="${tool.family}": ${body[0]}`);
  // 靜態占位：緊接 <body> 之後（只允許空白），恰一次，固定 44px 最小高度。
  assert.equal(html.split(SLOT_MARKUP).length - 1, 1, `${tool.route} has exactly one tool-chrome slot`);
  assert.match(html.slice(body.index + body[0].length, body.index + body[0].length + SLOT_MARKUP.length + 8), new RegExp(`^\\s*${SLOT_MARKUP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${tool.route} slot is the first body child`);
  assert.equal(html.split('data-tool-chrome-slot').length - 1, 1, `${tool.route} declares the slot attribute once`);
  const scripts = [...html.matchAll(/<script\b([^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*)>/gi)];
  const chromeReferences = scripts.filter(match => /(?:^|\/)tool-chrome\.js(?:\?|$)/.test(match[2]));
  const manifestReferences = scripts.filter(match => /(?:^|\/)tool-nav\.manifest\.js(?:\?|$)/.test(match[2]));
  assert.equal(chromeReferences.length, 1, `${tool.route} loads tool-chrome.js exactly once`);
  assert.equal(manifestReferences.length, 1, `${tool.route} loads tool-nav.manifest.js exactly once`);
  const chrome = chromeReferences[0];
  const navManifest = manifestReferences[0];
  for (const [label, reference, publicPath] of [['tool-chrome.js', chrome, publicRuntime], ['tool-nav.manifest.js', navManifest, publicManifest]]) {
    assert.match(reference[1], /\bdefer\b/, `${tool.route} loads ${label} with defer`);
    assert.equal(path.resolve(path.dirname(htmlPath), reference[2]), publicPath, `${tool.route} resolves ${label} at the repository root`);
    assert.ok(reference.index > body.index, `${tool.route} loads ${label} inside <body>`);
  }
  assert.ok(navManifest.index < chrome.index, `${tool.route} loads tool-nav.manifest.js before tool-chrome.js`);
  assert.equal(scripts.indexOf(chrome), scripts.indexOf(navManifest) + 1, `${tool.route} loads the two nav scripts consecutively`);
  assert.equal(navManifest[2].replace(/tool-nav\.manifest\.js$/, ''), chrome[2].replace(/tool-chrome\.js$/, ''), `${tool.route} uses one relative prefix for both nav scripts`);
  const a11y = scripts.find(match => /(?:^|\/)tool-page-a11y\.js(?:\?|$)/.test(match[2]));
  if (a11y) {
    assert.ok(chrome.index < a11y.index, `${tool.route} keeps tool-chrome.js before tool-page-a11y.js`);
    assert.equal(chrome[2].replace(/tool-chrome\.js$/, ''), a11y[2].replace(/tool-page-a11y\.js$/, ''), `${tool.route} shares the a11y relative prefix`);
  }
  const profile = scripts.find(match => /(?:^|\/)project-meta-profile\.js(?:\?|$)/.test(match[2]));
  if (profile) {
    assert.ok(chrome.index < profile.index, `${tool.route} keeps tool-chrome.js before project-meta-profile.js`);
    const bodyEnd = html.lastIndexOf('</body>');
    assert.ok(bodyEnd - html.lastIndexOf('project-meta-profile.js') <= 200, `${tool.route} keeps profile next to body end`);
    assert.equal(scripts.at(-1), profile, `${tool.route} keeps profile as the last external script`);
    assert.doesNotMatch(html.slice(profile.index + profile[0].length, bodyEnd), /<script\b/i, `${tool.route} appends no script after profile`);
  }
  for (const dependency of DEPENDENCIES) {
    assert.ok(dependencies[tool.route]?.includes(dependency), `${tool.route} registers ${dependency} as a homepage date dependency`);
  }
}
for (const tool of manifest.tools.filter(item => !targets.includes(item))) {
  const html = fs.readFileSync(path.join(root, tool.file), 'utf8');
  assert.ok(!/tool-chrome\.js|tool-nav\.manifest\.js|data-tool-chrome-slot/.test(html), `${tool.route} is excluded from this round and must not load the nav scripts or slot`);
  for (const dependency of DEPENDENCIES) {
    assert.ok(!dependencies[tool.route]?.includes(dependency), `${tool.route} must not register ${dependency}`);
  }
}
assert.equal(Object.values(dependencies).filter(files => files.includes(OUTPUT)).length, EXPECTED_TARGET_COUNT, `exactly ${EXPECTED_TARGET_COUNT} routes register tool-chrome.js`);

// --- 產出 tool-chrome.js：大小、標頭、LF、語法、清冊分離、占位渲染、固定高度、列印隱藏 ---
const runtime = fs.readFileSync(publicRuntime);
assert.ok(runtime.length <= RUNTIME_BYTE_LIMIT, `tool-chrome.js exceeds ${RUNTIME_BYTE_LIMIT} bytes: ${runtime.length}`);
const runtimeText = runtime.toString('utf8');
assert.equal(runtimeText.split('\n')[0], chromeBuilder.header, 'first line identifies the generated source');
assert.ok(!runtime.includes(13), 'generated runtime uses LF');
new vm.Script(runtimeText, { filename: OUTPUT });
assert.ok(runtimeText.includes(`window.${manifestBuilder.RUNTIME_GLOBAL}`), 'runtime reads the manifest global instead of embedding data');
for (const tool of manifest.tools) assert.ok(!runtimeText.includes(JSON.stringify(tool.file)), `runtime must not embed ${tool.route} file path`);
assert.ok(!/fetch\(|XMLHttpRequest/.test(runtimeText), 'runtime never fetches the manifest');
assert.ok(!/position:\s*fixed/.test(runtimeText), 'runtime never uses position: fixed');
assert.ok(runtimeText.includes('[data-tool-chrome-slot]') && runtimeText.includes('replaceChildren'), 'runtime renders into the static slot');
assert.ok(/\.tool-chrome\{[^}]*height:44px/.test(runtimeText) && !/\.tool-chrome\{[^}]*min-height/.test(runtimeText), 'nav keeps a fixed 44px height');
assert.ok(/\.tool-chrome__crumbs\{[^}]*white-space:nowrap;overflow-x:auto;overflow-y:hidden/.test(runtimeText), 'breadcrumb row scrolls horizontally instead of wrapping');
assert.ok(/\.tool-chrome__siblings ul\{position:absolute/.test(runtimeText), 'sibling list overlays instead of growing the nav');
assert.ok(/@media print\{\.page-only-tool-chrome\{display:none !important\}\}/.test(runtimeText), 'runtime style hides the chrome in print');
const sourceText = fs.readFileSync(path.join(root, SOURCE), 'utf8');
assert.ok(!sourceText.includes('__TOOL_NAV_MANIFEST__'), 'readable source no longer carries an embed placeholder');
assert.ok(sourceText.includes("'data-tool-chrome'") && sourceText.includes('page-only-tool-chrome') && sourceText.includes("'工具箱導覽'"), 'source renders the governed nav markup');
assert.ok(sourceText.includes("slot.style.minHeight = ''"), 'source releases the slot height only on the not-found error path');

// --- direct-print-boundary.css：一般與 RC 兩種列印規則都隱藏頂欄（含占位） ---
const printBoundary = fs.readFileSync(path.join(root, '結構工具箱/core/direct-print-boundary.css'), 'utf8');
const printBlocks = [...printBoundary.matchAll(/@media print \{([\s\S]*?)\n\}/g)].map(match => match[1]);
assert.equal(printBlocks.length, 2, 'direct-print-boundary.css keeps its two print blocks');
assert.match(printBlocks[0], /\.page-only-tool-chrome \{\s*display: none !important;\s*\}/, 'shared print block hides the tool chrome');
assert.match(printBlocks[1], /body\.rc-formal-output-page > \.page-only-tool-chrome \{\s*display: none !important;\s*\}/, 'RC print block hides the tool chrome');

console.log(`tool-chrome build contract passed: ${runtime.length} bytes runtime, ${Buffer.byteLength(runtimeManifestText)} bytes manifest js, ${manifest.tools.length} manifest tools, ${targets.length} injected pages, ${manifest.families.length} families`);
