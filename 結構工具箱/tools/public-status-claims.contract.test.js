const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const publicEvidenceSchema = require('../assets/status/public-evidence-schema.js');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8').replace(/^\uFEFF/, '');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function extractConstLiteral(source, name) {
  const prefix = `const ${name} = `;
  const startIndex = source.indexOf(prefix);
  assert.notEqual(startIndex, -1, `home.js missing const ${name}`);
  const valueStart = startIndex + prefix.length;
  const open = source[valueStart];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  assert.ok(close, `const ${name} must start with an array or object literal`);

  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let index = valueStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      inString = true;
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return source.slice(valueStart, index + 1);
    }
  }
  throw new Error(`unterminated const ${name}`);
}

function evaluateLiteral(literal, label) {
  return vm.runInNewContext(`(${literal})`, {}, { timeout: 1000, filename: label });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function anchorBlock(html, href) {
  const match = html.match(new RegExp(`<a\\s+class="menu-card"\\s+href="${escapeRegExp(href)}"[\\s\\S]*?<\\/a>`));
  assert.ok(match, `RC launcher card exists: ${href}`);
  return match[0];
}

const homeSource = readText('結構工具箱/assets/home/home.js');
const homeTools = evaluateLiteral(extractConstLiteral(homeSource, 'tools'), 'home-tools');
const rcLauncher = readText('鋼筋混凝土/index.html');
const classicLauncher = readText('結構工具箱/index-classic.html');
const pagesLiveSmoke = readText('結構工具箱/tools/pages-live-smoke.js');
const pagesBrowserSmoke = readText('結構工具箱/tools/pages-live-browser-smoke.js');
const preflightStatus = readJson('結構工具箱/assets/status/preflight-summary.json');
const platformStatus = readJson('結構工具箱/assets/status/platform-status.json');
const reportReadinessStatus = readJson('結構工具箱/assets/status/report-readiness-status.json');

assert.equal(homeTools.length, 43, 'canonical homepage tool inventory count');
assert.equal(new Set(homeTools.map(tool => tool.href)).size, homeTools.length, 'canonical homepage routes are unique');
for (const tool of homeTools) {
  assert.ok(tool.title && tool.version && tool.state && tool.output && tool.summary && tool.fit && tool.limit, `canonical public claim complete: ${tool.href}`);
  assert.equal(Array.isArray(tool.capabilities), true, `canonical public capabilities array: ${tool.href}`);
  assert.equal(tool.capabilities.includes('NEW'), false, `canonical public claim avoids expiring NEW badge: ${tool.href}`);
}

assert.equal(preflightStatus.kind, 'preflight-summary', 'tracked public preflight kind');
assert.equal(preflightStatus.pass, true, 'tracked public preflight passes');
assert.equal(preflightStatus.quick, false, 'tracked public preflight is not quick');
assert.equal(preflightStatus.forcePlatformAudit, true, 'tracked public preflight forces platform audit');
assert.equal(preflightStatus.forceSlowChecks, true, 'tracked public preflight forces slow checks');
assert.equal(preflightStatus.sourceDirty, false, 'tracked public preflight source is clean');
assert.equal(preflightStatus.slowReuseCount, 0, 'tracked public preflight reuses no slow checks');
assert.equal(preflightStatus.platformAuditReused, false, 'tracked public preflight reruns platform audit');
assert.equal(preflightStatus.recordsCount, preflightStatus.passedCount, 'tracked public preflight completes all records');
assert.equal(preflightStatus.postCheckCount, preflightStatus.postChecksPassedCount, 'tracked public preflight completes all post checks');
assert.equal(platformStatus.kind, 'platform-status', 'tracked platform status kind');
assert.equal(platformStatus.pass, true, 'tracked platform status passes');
assert.equal(reportReadinessStatus.kind, 'report-readiness-status', 'tracked report readiness kind');
assert.equal(reportReadinessStatus.pass, true, 'tracked report readiness passes');
assert.equal(reportReadinessStatus.runId, preflightStatus.runId, 'tracked report readiness and release status share runId');
const publicEvidenceResult = publicEvidenceSchema.validatePublicEvidenceBundle({ platformStatus, preflightStatus, reportReadinessStatus });
assert.equal(publicEvidenceResult.pass, true, `tracked public evidence bundle follows canonical schema: ${publicEvidenceResult.errors.join(', ')}`);
const releaseFinishedAt = Date.parse(String(preflightStatus.generatedAt).replace(' ', 'T'));
const releaseStartedAt = releaseFinishedAt - (Number(preflightStatus.totalSeconds) * 1000) - 60_000;
const platformGeneratedAt = Date.parse(String(platformStatus.generatedAt).replace(' ', 'T'));
assert.equal(Number.isFinite(releaseFinishedAt) && Number.isFinite(platformGeneratedAt), true, 'tracked release and platform timestamps parse');
assert.ok(platformGeneratedAt >= releaseStartedAt && platformGeneratedAt <= releaseFinishedAt, 'tracked platform audit snapshot was generated inside the formal release window');

const rcCards = [
  ['/rc-beam', 'tools/beam.html'],
  ['/rc-column', 'tools/column.html'],
  ['/rc-slab', 'tools/slab.html'],
  ['/rc-wall', 'tools/wall.html'],
  ['/rc-shear-wall', 'tools/shear-wall.html'],
  ['/rc-foundation', 'tools/foundation.html'],
  ['/rc-pile', 'tools/single-pile-designer.html'],
  ['/rc-retrofit-section', '../RC補強斷面性質.html'],
];
for (const [route, href] of rcCards) {
  const tool = homeTools.find(item => item.href === route);
  assert.ok(tool, `canonical RC claim exists: ${route}`);
  assert.equal(tool.state, 'formal', `canonical RC claim is formal: ${route}`);
  assert.equal(tool.governance, 'rc-audit', `canonical RC claim uses RC governance: ${route}`);
  const block = anchorBlock(rcLauncher, href);
  assert.ok(block.includes(`>${tool.version}</span>`), `RC launcher version matches canonical claim: ${route}`);
  assert.ok(block.includes('class="ver ver-ok"'), `RC launcher formal state matches canonical claim: ${route}`);
}
[
  '../結構工具箱/core/direct-print-boundary.css',
  'formal-tool-output-page',
  'RC 工具箱入口列印已封鎖',
  '本頁不得作為附件',
  '../結構工具箱/audit-dashboard.html',
  '明確核可後可作為正式附件',
].forEach(needle => assert.ok(rcLauncher.includes(needle), `RC launcher keeps governed public claim: ${needle}`));
[
  '最後改版日期',
  'ver-draft',
  'badge-new',
  '>NEW<',
  '僅供初步設計與檢算參考',
  './output/audit/audit-status.json',
].forEach(needle => assert.equal(rcLauncher.includes(needle), false, `RC launcher removes duplicate or stale claim: ${needle}`));

[
  'noindex,follow',
  'core/direct-print-boundary.css',
  'formal-tool-output-page',
  '舊網址相容入口列印已封鎖',
  '本頁不得作為附件',
  '工具清冊、使用邊界與巡檢狀態均以目前工具首頁為唯一公開來源',
  'href="./index.html"',
  'href="./audit-dashboard.html"',
].forEach(needle => assert.ok(classicLauncher.includes(needle), `classic compatibility launcher keeps boundary: ${needle}`));
[
  'class="menu-card"',
  'class="ver ',
  'scope-pill',
  '>NEW<',
  '最後改版日期',
  'output/audit/',
].forEach(needle => assert.equal(classicLauncher.includes(needle), false, `classic compatibility launcher avoids duplicated status claim: ${needle}`));

assert.ok(pagesLiveSmoke.includes('鋼筋混凝土/') && pagesLiveSmoke.includes('RC 工具箱入口列印已封鎖'), 'Pages HTTP smoke protects RC launcher claim');
assert.ok(pagesLiveSmoke.includes('結構工具箱/index-classic.html') && pagesLiveSmoke.includes('舊網址相容入口列印已封鎖'), 'Pages HTTP smoke protects classic compatibility boundary');
assert.ok(pagesBrowserSmoke.includes("'/rc'"), 'Pages browser smoke includes RC launcher route');
assert.ok(pagesBrowserSmoke.includes("'/toolbox-classic'"), 'Pages browser smoke includes classic compatibility route');
assert.ok(pagesBrowserSmoke.includes('directPrintBoundaries'), 'Pages browser smoke uses shared launcher print-boundary checks');

console.log(`public status claims contract OK (tools=${homeTools.length}, rcCards=${rcCards.length}, release=${preflightStatus.runId})`);
