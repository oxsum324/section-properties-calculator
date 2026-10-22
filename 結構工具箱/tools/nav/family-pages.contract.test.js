'use strict';

// 家族頁契約：5 個家族頁必須由 build-family-pages.js 從 home.source.js 靜態產出，
// 且與工作樹逐位元組一致；成員數、連結目標、相對路徑、RC 巡檢卡與列印邊界、
// 風力固定入口與 vercel.json 家族 redirect 均在此失敗關閉。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const builder = require('./build-family-pages');

const repoRoot = builder.REPO_ROOT;
const generatorPath = path.join(__dirname, 'build-family-pages.js');

// 家族成員釘值：新增或移除工具時，先改 home.source.js，重跑產生器，再更新此處。
const EXPECTED_FAMILY_COUNTS = Object.freeze({ rc: 12, steel: 7, wind: 13, seismic: 4, 'local-quick': 8 });
const HOME_TOOL_COUNT = 53;
const FAMILY_REDIRECTS = Object.freeze([
  ['/family-steel', '/結構工具箱/family/steel'],
  ['/family-wind', '/結構工具箱/family/wind'],
  ['/family-seismic', '/結構工具箱/family/seismic'],
  ['/family-local-quick', '/結構工具箱/family/local-quick']
]);
const PRESERVED_REDIRECTS = Object.freeze([
  ['/rc', '/鋼筋混凝土'],
  ['/wind', '/結構工具箱/'],
  ['/seismic', '/結構工具箱/tools/地震力/seismic-force']
]);

function readRepo(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertRelativeTargetExists(pageFile, href, label) {
  assert.equal(href.startsWith('/'), false, `${label} 不得使用絕對路徑: ${href}`);
  assert.equal(/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('data:'), false, `${label} 不得使用外部網址: ${href}`);
  if (href.startsWith('data:') || href.startsWith('#')) return;
  if (href.includes('${')) return; // RC 巡檢卡 script 內的樣板字串，實際路徑另由巡檢來源檢查涵蓋
  const target = path.resolve(path.dirname(pageFile), href.split('?')[0].split('#')[0]);
  assert.ok(fs.existsSync(target), `${label} 連結目標不存在: ${href} -> ${target}`);
}

// 1. 產生器只讀白名單欄位，不新增工具卡欄位。
const generatorSource = readRepo('結構工具箱/tools/nav/build-family-pages.js');
const directReads = [...new Set([...generatorSource.matchAll(/\btool\.([A-Za-z_$][\w$]*)/g)].map(match => match[1]))];
assert.deepEqual(directReads.filter(name => !builder.TOOL_FIELD_WHITELIST.includes(name)), [], '產生器直接讀取了白名單外的工具卡欄位');
const fieldReads = [...new Set([...generatorSource.matchAll(/field\(\w+, '([A-Za-z]+)'\)/g)].map(match => match[1]))];
assert.ok(fieldReads.length >= 8, '產生器應透過 field() 讀取工具卡欄位');
for (const name of fieldReads) assert.ok(builder.TOOL_FIELD_WHITELIST.includes(name), `field() 讀取了白名單外的欄位: ${name}`);
assert.deepEqual(
  [...builder.TOOL_FIELD_WHITELIST],
  ['aliases', 'capabilities', 'categories', 'fit', 'governance', 'href', 'limit', 'memberSystem', 'output', 'state', 'summary', 'title', 'version'],
  '工具卡欄位白名單固定'
);

// 2. --check 必須通過（逐位元組一致）。
const check = spawnSync(process.execPath, [generatorPath, '--check'], { cwd: repoRoot, encoding: 'utf8' });
assert.equal(check.status, 0, `build-family-pages.js --check 失敗:\n${check.stdout}\n${check.stderr}`);
assert.ok(check.stdout.includes('family pages check OK'), '--check 需回報通過');

// 3. 資料源與家族定義。
const data = builder.loadHomeSource(repoRoot);
assert.equal(data.tools.length, HOME_TOOL_COUNT, '首頁工具卡數維持 53，家族頁不是工具卡');
assert.deepEqual(builder.FAMILIES.map(family => family.id), ['rc', 'steel', 'wind', 'seismic', 'local-quick'], '家族順序固定');
assert.equal(new Set(builder.FAMILIES.map(family => family.output)).size, builder.FAMILIES.length, '家族輸出路徑不得重複');
assert.equal(builder.FAMILIES.find(family => family.id === 'rc').output, '鋼筋混凝土/index.html', 'RC 家族頁路徑不變');
for (const family of builder.FAMILIES) {
  if (family.id !== 'rc') assert.equal(family.output, `結構工具箱/family/${family.id}.html`, `${family.id} 家族頁輸出路徑`);
}
const familyCssPath = path.join(repoRoot, '結構工具箱', 'family', 'family.css');
assert.ok(fs.existsSync(familyCssPath), '家族頁專用樣式 family.css 存在');

const pages = builder.buildAll(repoRoot);
assert.equal(pages.length, 5, '產出 5 個家族頁');
const pageById = new Map(pages.map(page => [page.family.id, page]));
const memberHrefs = new Map();

for (const page of pages) {
  const { family, members, html } = page;
  const outputFile = builder.outputPath(repoRoot, family);
  const label = `家族頁 ${family.id}`;

  assert.equal(members.length, EXPECTED_FAMILY_COUNTS[family.id], `${label} 成員數釘值 ${EXPECTED_FAMILY_COUNTS[family.id]}（規則：${family.rule}）`);
  assert.equal(fs.readFileSync(outputFile).toString('utf8'), html, `${label} 工作樹內容需與產生器輸出一致`);
  assert.equal(html.includes('\r'), false, `${label} 必須為 LF`);
  assert.ok(html.startsWith('<!DOCTYPE html>\n<html lang="zh-TW">\n'), `${label} 需宣告 zh-TW`);
  const markerIndex = html.indexOf(builder.GENERATED_MARKER);
  assert.ok(markerIndex > -1 && markerIndex < html.indexOf('</head>'), `${label} head 內需有 generated-by 標記`);
  assert.match(html, new RegExp(`<body[^>]*\\sdata-family="${escapeRegExp(family.id)}"`), `${label} body 需標示 data-family`);
  assert.equal(/tool-chrome/.test(html), false, `${label} 不得掛 tool-chrome.js（家族頁本身是導覽層）`);
  assert.equal(/\b(undefined|NaN)\b/.test(html), false, `${label} 不得含 undefined / NaN`);
  assert.ok(html.includes(builder.USAGE_BOUNDARY_TEXT), `${label} 頁尾需有使用邊界聲明`);
  assert.ok(html.includes('← 回結構工具箱'), `${label} 需有回結構工具箱連結`);
  assert.ok(html.includes(`data-family-count="${members.length}"`), `${label} 需標示工具數`);
  assert.ok(html.includes('<aside class="formal-direct-print-boundary" aria-hidden="true">'), `${label} 需有列印邊界 aside`);
  assert.match(html, /<body[^>]*\bformal-tool-output-page\b/, `${label} body 需宣告 formal-tool-output-page`);
  assert.ok(html.includes('direct-print-boundary.css'), `${label} 需載入 direct-print-boundary.css`);

  const gridMatch = html.match(/data-family-tools>([\s\S]*?)\n {4}<\/div>/);
  assert.ok(gridMatch, `${label} 需有 data-family-tools 工具清單`);
  const gridRoutes = [...gridMatch[1].matchAll(/data-route-href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(gridRoutes, members.map(tool => tool.href), `${label} 工具卡順序與成員規則一致`);
  for (const tool of members) {
    assert.ok(gridMatch[1].includes(`data-title="${tool.title.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`), `${label} 工具卡 ${tool.href} 需標示 title`);
    assert.ok(gridMatch[1].includes(`>${tool.version}</span>`), `${label} 工具卡 ${tool.href} 需顯示版本 ${tool.version}`);
    const stateLabel = data.toolStates[tool.state]?.label;
    assert.ok(stateLabel && gridMatch[1].includes(`>${stateLabel}</span>`), `${label} 工具卡 ${tool.href} 需顯示狀態標籤`);
    memberHrefs.set(tool.href, (memberHrefs.get(tool.href) || []).concat(family.id));
  }

  // data-route-href 是首頁 clean route 身分標記，不是連結；真正的連結只看 href / src。
  const attributeHrefs = [...html.matchAll(/(?<![\w-])(?:href|src)="([^"]*)"/g)].map(match => match[1]);
  assert.ok(attributeHrefs.length >= members.length + 2, `${label} 連結數量異常`);
  for (const href of attributeHrefs) assertRelativeTargetExists(outputFile, href, label);
  for (const match of html.matchAll(/url\('([^']+)'\)/g)) assertRelativeTargetExists(outputFile, match[1], `${label} CSS url`);
  for (const match of html.matchAll(/(?:url|summaryUrl): '([^']+)'/g)) assertRelativeTargetExists(outputFile, match[1], `${label} 巡檢來源`);
}

// 4. RC 家族頁：保留巡檢卡、關於本工具箱、列印邊界與 menu-card 版本宣告結構。
const rcPage = pageById.get('rc');
const rcHtml = rcPage.html;
for (const needle of [
  '<title>鋼筋混凝土構件設計工具箱</title>',
  '<body class="formal-tool-output-page" data-family="rc">',
  'RC 工具箱入口列印已封鎖',
  '本頁不得作為附件',
  'id="rcAuditStatusCard"',
  'RC 自動巡檢',
  "url: '../結構工具箱/assets/status/platform-status.json'",
  "summaryUrl: '../結構工具箱/audit-dashboard.html'",
  '目前以直接開檔模式執行，未讀取最新巡檢狀態',
  '<h2>關於本工具箱</h2>',
  '明確核可後可作為正式附件',
  '../結構工具箱/core/direct-print-boundary.css',
  '<link rel="stylesheet" href="shared/style.css">'
]) assert.ok(rcHtml.includes(needle), `RC 家族頁需保留: ${needle}`);
for (const needle of ['最後改版日期', 'ver-draft', 'badge-new', '>NEW<', '僅供初步設計與檢算參考', './output/audit/audit-status.json']) {
  assert.equal(rcHtml.includes(needle), false, `RC 家族頁不得含過時宣告: ${needle}`);
}
for (const tool of rcPage.members) {
  const fileHref = builder.relativeHref(rcPage.family.output, builder.resolveToolFileHref(tool.href, data.routeFileMap));
  const block = rcHtml.match(new RegExp(`<a\\s+class="menu-card"\\s+href="${escapeRegExp(fileHref)}"[\\s\\S]*?<\\/a>`));
  assert.ok(block, `RC 家族頁 menu-card 結構需保留: ${fileHref}`);
  assert.ok(block[0].includes(`>${tool.version}</span>`), `RC menu-card 版本: ${tool.href}`);
  if (tool.state === 'formal') assert.ok(block[0].includes('class="ver ver-ok"'), `RC menu-card 正式狀態徽章: ${tool.href}`);
}
assert.ok(rcHtml.indexOf('id="rcAuditStatusCard"') < rcHtml.indexOf('data-family-tools'), 'RC 巡檢狀態卡位於工具清單之前');

// 5. 風力家族頁：wind-overview 維持工具身分，另於清單上方給固定入口。
const windPage = pageById.get('wind');
const windHtml = windPage.html;
const entryIndex = windHtml.indexOf('data-family-entry');
assert.ok(entryIndex > -1, '風力家族頁需有固定入口區塊');
assert.ok(entryIndex < windHtml.indexOf('data-family-tools'), '風力固定入口必須在工具清單上方');
assert.ok(windHtml.includes('<h2 id="familyEntryTitle">案件參數與總覽</h2>'), '風力固定入口標題');
assert.match(windHtml, /<a class="family-entry__card" href="\.\.\/tools\/風力\/wind-overview\.html" data-route-href="\/wind-overview">/, '風力固定入口連到 wind-overview');
assert.ok(windPage.members.some(tool => tool.href === '/wind-overview'), 'wind-overview 仍是風力家族工具卡');
for (const page of pages) {
  if (page.family.id === 'wind') continue;
  assert.equal(page.html.includes('data-family-entry'), false, `${page.family.id} 家族頁不應有固定入口區塊`);
}

// 6. home.css 版家族頁：載入設計系統與家族專用樣式。
for (const page of pages) {
  if (page.family.id === 'rc') continue;
  const html = page.html;
  for (const needle of [
    '<link rel="stylesheet" href="../assets/hy/colors_and_type.css">',
    '<link rel="stylesheet" href="../assets/home/home.css">',
    '<link rel="stylesheet" href="../core/direct-print-boundary.css">',
    '<link rel="stylesheet" href="family.css">',
    '<header class="home-header family-header">',
    '<a class="family-header__back" href="../index.html">← 回結構工具箱</a>',
    `<h1>${page.family.label} <span>${page.members.length} 項工具</span></h1>`,
    '<div class="tool-grid family-tool-grid" data-family-tools>'
  ]) assert.ok(html.includes(needle), `${page.family.id} 家族頁需含: ${needle}`);
  assert.equal((html.match(/<a class="tool-card /g) || []).length, page.members.length, `${page.family.id} 家族頁 tool-card 數`);
  assert.equal(/tool-pin|tool-updated|tool-card__more/.test(html), false, `${page.family.id} 家族頁不含釘選／最近使用／詳情切換`);
}

// 7. 成員規則：rc 與 steel 互斥；wind／seismic／local-quick 以 categories 判定。
for (const [href, families] of memberHrefs) {
  assert.equal(families.length, 1, `${href} 不得同時屬於多個家族: ${families.join(', ')}`);
}
assert.deepEqual(pageById.get('rc').members.map(tool => tool.memberSystem), Array(12).fill('rc'), 'RC 家族成員全為 memberSystem rc');
assert.ok(pageById.get('steel').members.every(tool => ['steel', 'src'].includes(tool.memberSystem)), '鋼構家族成員為 steel 或 src');
assert.ok(pageById.get('wind').members.every(tool => tool.categories.includes('wind')), '風力家族成員 categories 含 wind');
assert.ok(pageById.get('seismic').members.every(tool => tool.categories.includes('seismic')), '地震力家族成員 categories 含 seismic');
assert.ok(pageById.get('local-quick').members.every(tool => tool.categories.includes('temporary')), '施工臨設家族成員 categories 含 temporary');

// 8. vercel.json：新增 4 條家族 redirect，既有 /rc、/wind、/seismic 導向不動。
const vercel = JSON.parse(readRepo('vercel.json'));
const redirectMap = new Map(vercel.redirects.map(route => [route.source, route]));
assert.equal(redirectMap.size, vercel.redirects.length, 'vercel redirects source 不得重複');
for (const [source, destination] of FAMILY_REDIRECTS) {
  assert.deepEqual(redirectMap.get(source), { source, destination, permanent: true }, `vercel.json 家族 redirect: ${source}`);
  const destinationFile = path.join(repoRoot, ...`${destination.replace(/^\/+/, '')}.html`.split('/'));
  assert.ok(fs.existsSync(destinationFile), `${source} 目的頁存在: ${destinationFile}`);
}
for (const [source, destination] of PRESERVED_REDIRECTS) {
  assert.deepEqual(redirectMap.get(source), { source, destination, permanent: true }, `vercel.json 既有導向不動: ${source}`);
}

console.log(`family pages contract OK (${pages.map(page => `${page.family.id}=${page.members.length}`).join(', ')}; home tools=${data.tools.length})`);
