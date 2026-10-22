'use strict';
/*
 * 設計系統收斂契約（round1 包 C，純 CSS）
 * - token 單一來源：鋼筋混凝土/shared/style.css 首行 @import colors_and_type.css（頁面與樣式表同深度）
 * - core/style.css、鋼構 styles.css、連續梁／剛架 UI 樣式不得含 @import：axe 預載 CSSOM 會把 @import
 *   的相對路徑當成相對於頁面解析而產生 404；改由每個連結它們的頁面，在其前方依序 link token 與 family-theme
 * - 上述 link 必須解析到唯一的 token 檔與 core/family-theme.css
 * - 兩個 style.css 不得再有硬編十六進位色（白名單：#fff／#000／rgba 陰影）
 * - home.css 兩處分類配色等於指定 token
 * - --family-on-accent 對 --family-accent 的 WCAG 對比 ≥ 4.5（讀 token 實算）
 * 執行：node 結構工具箱/tools/design/design-tokens.contract.test.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const files = {
  tokens: '結構工具箱/assets/hy/colors_and_type.css',
  family: '結構工具箱/core/family-theme.css',
  core: '結構工具箱/core/style.css',
  rc: '鋼筋混凝土/shared/style.css',
  steel: '鋼構工具/styles.css',
  cb: '結構工具箱/assets/hy/continuous-beam-ui.css',
  fa: '結構工具箱/assets/hy/frame-analysis-ui.css',
  home: '結構工具箱/assets/home/home.css',
  readiness: '結構工具箱/core/report-readiness.css',
};
const abs = rel => path.join(repoRoot, ...rel.split('/'));
const read = rel => fs.readFileSync(abs(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

for (const rel of Object.values(files)) assert.ok(fs.existsSync(abs(rel)), `${rel} exists`);
const src = Object.fromEntries(Object.entries(files).map(([k, rel]) => [k, read(rel)]));

/* ---------- helpers ---------- */
function importsOf(css) {
  return [...stripComments(css).matchAll(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;/g)].map(m => m[1]);
}
function leadingImportsOnly(css, label) {
  const body = stripComments(css).trim();
  const firstBrace = body.indexOf('{');
  const prelude = body.slice(0, firstBrace);
  const lastSemi = prelude.lastIndexOf(';');
  const statements = prelude.slice(0, lastSemi + 1).split(';').map(s => s.trim()).filter(Boolean);
  for (const s of statements) assert.match(s, /^@import\s+url\(/, `${label}: only @import may precede the first rule (found "${s.slice(0, 40)}")`);
  assert.ok(statements.length >= 1, `${label}: has at least one leading @import`);
  assert.match(body, /^@import\s+url\(/, `${label}: file starts with @import`);
}
function resolvedImport(fromRel, importUrl) {
  return path.resolve(path.dirname(abs(fromRel)), importUrl);
}
const WHITELIST = /^#(?:fff|ffffff|000|000000)$/i;
function hardcodedHex(css) {
  const text = stripComments(css);
  return [...text.matchAll(/(?<=[:\s,(])#([0-9a-f]{3,8})\b/gi)].map(m => m[0]).filter(hex => !WHITELIST.test(hex));
}

/* ---------- token parsing + WCAG ---------- */
function parseVars(css) {
  const map = new Map();
  for (const m of stripComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) map.set(m[1], m[2].trim());
  return map;
}
const tokenVars = parseVars(src.tokens);
function resolve(value, vars, depth = 0) {
  assert.ok(depth < 20, `var() resolution too deep for ${value}`);
  const v = String(value).trim();
  const m = v.match(/^var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)$/);
  if (m) {
    const target = vars.get(m[1]) ?? tokenVars.get(m[1]);
    if (target === undefined) {
      assert.ok(m[2], `token ${m[1]} is not defined in colors_and_type.css`);
      return resolve(m[2], vars, depth + 1);
    }
    return resolve(target, vars, depth + 1);
  }
  return v;
}
function hexToRgb(hex) {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  assert.ok(m, `not a plain hex colour: ${hex}`);
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/* ---------- 1. token 單一來源 ---------- */
leadingImportsOnly(src.rc, 'rc shared/style.css');
assert.equal(importsOf(src.rc)[0], '../../結構工具箱/assets/hy/colors_and_type.css', 'rc shared/style.css imports tokens first');
assert.equal(path.relative(repoRoot, resolvedImport(files.rc, importsOf(src.rc)[0])).replace(/\\/g, '/'), files.tokens, 'rc: token import resolves to the single token file');
for (const label of ['core', 'steel', 'cb', 'fa']) {
  assert.equal(importsOf(src[label]).length, 0, `${label}: shared stylesheet linked from pages at different depths must not use @import (axe CSSOM preload resolves it against the page)`);
}

/* 每個連結共用樣式表的頁面：在其前方依序 link token → family-theme → 該樣式表 */
const { spawnSync } = require('node:child_process');
const listed = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z', '--', '*.html'], { cwd: repoRoot, encoding: 'utf8' });
assert.equal(listed.status, 0, 'git ls-files *.html');
const sharedSheets = new Map([[files.core, 'core'], [files.steel, 'steel'], [files.cb, 'cb'], [files.fa, 'fa']]);
const linkingPages = [];
for (const page of listed.stdout.split('\0').filter(Boolean)) {
  if (/^(?:_tmp|tmp|output|完成檔)\//.test(page)) continue;
  const html = read(page);
  const hrefs = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(m => ({ href: m[1], target: path.relative(repoRoot, path.resolve(path.dirname(abs(page)), m[1].split('?')[0])).replace(/\\/g, '/') }));
  const sharedIndex = hrefs.findIndex(item => sharedSheets.has(item.target));
  if (sharedIndex < 0) continue;
  linkingPages.push(page);
  const tokenIndex = hrefs.findIndex(item => item.target === files.tokens);
  const familyIndex = hrefs.findIndex(item => item.target === files.family);
  assert.ok(tokenIndex >= 0 && tokenIndex < sharedIndex, `${page}: links ${files.tokens} before ${hrefs[sharedIndex].target}`);
  assert.ok(familyIndex >= 0 && tokenIndex < familyIndex && familyIndex < sharedIndex, `${page}: links ${files.family} after tokens and before ${hrefs[sharedIndex].target}`);
}
assert.equal(linkingPages.length, 39, `pages linking shared stylesheets (found ${linkingPages.length})`);

/* 既有 token 值不得被改（只允許新增） */
const pinned = {
  '--hy-navy': '#002060', '--hy-navy-deep': '#001440', '--hy-navy-700': '#0A2D7A', '--hy-navy-500': '#2E4C94',
  '--hy-navy-100': '#E6EAF3', '--hy-red': '#E00000', '--hy-red-deep': '#B30000', '--hy-ink': '#111316',
  '--hy-slate-700': '#3F4653', '--hy-slate-500': '#6B7280', '--hy-success': '#1F7A4D', '--hy-warning': '#B8860B',
  '--hy-warning-100': '#FBF2DB', '--fg-on-navy': '#FFFFFF',
};
for (const [name, value] of Object.entries(pinned)) assert.equal(tokenVars.get(name), value, `token ${name} keeps its original value`);
for (const name of ['--font-sans', '--font-mono', '--font-serif', '--shadow-focus', '--fg-1', '--fg-2', '--fg-3', '--border-default', '--bg-page', '--bg-surface']) {
  assert.ok(tokenVars.has(name), `token ${name} exists`);
}
/* 新增 token */
for (const name of ['--family-accent', '--family-accent-soft', '--family-on-accent', '--hy-warning-ink',
  '--btn-primary-bg', '--btn-primary-bg-hover', '--btn-primary-fg', '--btn-secondary-bg', '--btn-secondary-fg', '--btn-secondary-border',
  '--btn-danger-bg', '--btn-danger-bg-hover', '--btn-danger-fg', '--chip-bg', '--chip-fg', '--font-mono-tc']) {
  assert.ok(tokenVars.has(name), `new token ${name} is defined in colors_and_type.css`);
}
/* 離線字體：不得引入 webfont 下載或 CDN */
for (const [label, css] of [['tokens', src.tokens], ['family', src.family], ['core', src.core], ['rc', src.rc]]) {
  assert.equal(/https?:\/\//i.test(stripComments(css)), false, `${label}: no remote URL`);
  assert.equal(/@font-face/i.test(css), false, `${label}: no @font-face download`);
}

/* ---------- 2. family-theme.css：RC 樣式表 @import，其餘由頁面 link（見第 1 節） ---------- */
{
  const hit = importsOf(src.rc).find(u => /family-theme\.css$/.test(u));
  assert.ok(hit, 'rc: imports family-theme.css');
  assert.equal(path.relative(repoRoot, resolvedImport(files.rc, hit)).replace(/\\/g, '/'), files.family, 'rc: family-theme import resolves to core/family-theme.css');
}
const importers = { rc: files.rc };
assert.equal(importsOf(src.family).length, 0, 'family-theme.css does not re-import tokens (single source)');

/* 頁首統一規則 */
const familyBody = stripComments(src.family);
for (const needle of [
  'body[data-family] > header', 'body[data-family] > .hero', 'body[data-family] > .page-header',
  'body[data-family] > header.family-banner', 'body[data-family] > main > header.hero',
  'background: var(--hy-navy);', 'border-left: 4px solid var(--family-bar, var(--family-accent));',
  'body[data-family] .btn-calc', 'body[data-family] .btn-primary', 'body[data-family] .btn-secondary', 'body[data-family] .btn-danger',
]) assert.ok(familyBody.includes(needle), `family-theme.css contains ${needle}`);
assert.equal(familyBody.includes('linear-gradient'), false, 'family-theme.css header rule is flat navy, no gradient');
assert.equal(hardcodedHex(src.family).length, 0, 'family-theme.css has no hardcoded hex');

/* 家族對比 */
const familyBlocks = [...familyBody.matchAll(/((?:body\[data-family="[\w-]+"\]\s*,?\s*)+)\{([^}]*)\}/g)];
const familyIds = new Map();
for (const m of familyBlocks) {
  const ids = [...m[1].matchAll(/data-family="([\w-]+)"/g)].map(x => x[1]);
  const vars = parseVars(`x{${m[2]}}`);
  if (!vars.has('--family-accent')) continue;
  for (const id of ids) familyIds.set(id, vars);
}
const expectedFamilies = ['rc', 'steel', 'analysis', 'wind', 'seismic', 'attachments', 'reference', 'local-quick'];
assert.deepEqual([...familyIds.keys()].sort(), [...expectedFamilies].sort(), 'family-theme.css defines accents for every family id');
const expectedAccent = {
  rc: '--hy-navy', steel: '--hy-navy', analysis: '--hy-navy', wind: '--hy-navy-500', seismic: '--hy-warning',
  attachments: '--hy-success', reference: '--hy-slate-500', 'local-quick': '--hy-slate-700',
};
const contrastReport = [];
for (const id of expectedFamilies) {
  const vars = familyIds.get(id);
  assert.equal(vars.get('--family-accent'), `var(${expectedAccent[id]})`, `${id} accent token`);
  assert.ok(vars.has('--family-on-accent'), `${id} defines --family-on-accent`);
  assert.ok(vars.has('--family-accent-soft'), `${id} defines --family-accent-soft`);
  const accent = resolve(vars.get('--family-accent'), vars);
  const on = resolve(vars.get('--family-on-accent'), vars);
  const ratio = contrast(accent, on);
  contrastReport.push(`${id}: ${accent}/${on} = ${ratio.toFixed(2)}`);
  assert.ok(ratio >= 4.5, `${id}: --family-on-accent contrast ${ratio.toFixed(2)} >= 4.5`);
}
/* 預設值（token 檔）與按鈕 token 對比 */
const defaultRatio = contrast(resolve('var(--family-accent)', tokenVars), resolve('var(--family-on-accent)', tokenVars));
assert.ok(defaultRatio >= 4.5, `default family accent contrast ${defaultRatio.toFixed(2)} >= 4.5`);
const btnPrimary = contrast(resolve('var(--btn-primary-bg)', tokenVars), resolve('var(--btn-primary-fg)', tokenVars));
const btnPrimaryHover = contrast(resolve('var(--btn-primary-bg-hover)', tokenVars), resolve('var(--btn-primary-fg)', tokenVars));
const btnSecondary = contrast(resolve('var(--btn-secondary-bg)', tokenVars), resolve('var(--btn-secondary-fg)', tokenVars));
const btnDanger = contrast(resolve('var(--btn-danger-bg)', tokenVars), resolve('var(--btn-danger-fg)', tokenVars));
const warningInk = contrast(resolve('var(--hy-warning-100)', tokenVars), resolve('var(--hy-warning-ink)', tokenVars));
for (const [label, ratio] of [['btn-primary', btnPrimary], ['btn-primary hover', btnPrimaryHover], ['btn-secondary', btnSecondary], ['btn-danger', btnDanger], ['warning ink on warning-100', warningInk]]) {
  assert.ok(ratio >= 4.5, `${label} contrast ${ratio.toFixed(2)} >= 4.5`);
}

/* ---------- 3. 兩個 style.css 不得再有硬編色 ---------- */
const coreHex = hardcodedHex(src.core);
const rcHex = hardcodedHex(src.rc);
assert.deepEqual(coreHex, [], `core/style.css has no hardcoded hex (found ${coreHex.join(', ')})`);
assert.deepEqual(rcHex, [], `rc shared/style.css has no hardcoded hex (found ${rcHex.join(', ')})`);
/* --primary 等自有變數保留名稱但指向 token */
for (const [label, css] of [['core', src.core], ['rc', src.rc]]) {
  const vars = parseVars(css);
  assert.equal(vars.get('--primary'), 'var(--hy-navy)', `${label}: --primary points at --hy-navy`);
  for (const name of ['--primary-dark', '--bg', '--card', '--border', '--text', '--text-light', '--accent', '--warn', '--danger']) {
    assert.match(vars.get(name) || '', /^var\(--/, `${label}: ${name} points at a token`);
  }
  assert.match(stripComments(css), /body\s*\{[^}]*font-family:\s*var\(--font-sans\)/, `${label}: body font uses --font-sans`);
  assert.equal(/font-family:\s*['"]?(Segoe UI|Consolas)/.test(stripComments(css)), false, `${label}: no literal font stacks`);
}
/* 其餘已 token 化的檔只允許白名單 hex；report-readiness 的 hex 只能是 var() fallback */
for (const [label, css] of [['steel', src.steel], ['cb', src.cb], ['fa', src.fa]]) {
  assert.deepEqual(hardcodedHex(css), [], `${label}: no hardcoded hex outside whitelist`);
}
const readinessOutsideFallback = hardcodedHex(stripComments(src.readiness).replace(/var\((?:[^()]|\([^()]*\))*\)/g, ''));
assert.deepEqual(readinessOutsideFallback, [], 'report-readiness.css hex only appears as var() fallbacks');
assert.equal(src.readiness.includes('color-mix('), false, 'report-readiness.css keeps compatibility without color-mix');

/* ---------- 4. home.css 分類配色 ---------- */
assert.ok(src.home.includes('.tool-card--seismic { border-top-color: var(--hy-warning); }'), 'home seismic card uses --hy-warning');
assert.ok(src.home.includes('.tool-card--seismic .tool-card__icon { color: var(--hy-warning); }'), 'home seismic icon uses --hy-warning');
assert.ok(src.home.includes('.tool-card--temporary { border-top-color: var(--hy-slate-700); }'), 'home temporary card uses --hy-slate-700');
assert.ok(src.home.includes('.tool-card--temporary .tool-card__icon { color: var(--hy-slate-700); }'), 'home temporary icon uses --hy-slate-700');
assert.equal(/\.tool-card--seismic[^{]*\{[^}]*--hy-red/.test(src.home), false, 'home seismic no longer uses brand red');

console.log('design-tokens.contract.test.js passed');
console.log(`  family-theme via rc @import + ${linkingPages.length} linking pages; hardcoded hex core=${coreHex.length} rc=${rcHex.length}`);
console.log(`  family contrast: ${contrastReport.join('; ')}`);
console.log(`  buttons: primary=${btnPrimary.toFixed(2)} hover=${btnPrimaryHover.toFixed(2)} secondary=${btnSecondary.toFixed(2)} danger=${btnDanger.toFixed(2)}; warning-ink=${warningInk.toFixed(2)}`);
