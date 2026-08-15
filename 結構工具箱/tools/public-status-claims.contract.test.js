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
  let valueStart = startIndex + prefix.length;
  if (source.startsWith('Object.freeze(', valueStart)) {
    valueStart += 'Object.freeze('.length;
  }
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

function exportedStringConstant(source, name) {
  const match = source.match(new RegExp(`export\\s+const\\s+${escapeRegExp(name)}\\s*=\\s*(['\"])([^'\"]+)\\1`));
  assert.ok(match, `source missing exported string constant ${name}`);
  return match[2];
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
const steelLauncher = readText('鋼構工具/index.html');
const steelApp = readText('鋼構工具/app.js');
const steelMetadataSource = readText('鋼構工具/tool-metadata.js');
const anchorAppMeta = readText('螺栓檢討/bolt-review-tool/src/appMeta.ts');
const anchorApp = readText('螺栓檢討/bolt-review-tool/src/App.tsx');
const anchorReportDocument = readText('螺栓檢討/bolt-review-tool/src/ReportDocument.tsx');
const anchorReportWorkbook = readText('螺栓檢討/bolt-review-tool/src/reportWorkbook.ts');
const deckingLauncher = readText('覆工板/index.html');
const excavationLauncher = readText('開挖擋土支撐/index.html');
const formalToolMetadataSource = readText('結構工具箱/tools/formal-tool-metadata.js');
const localQuickToolMetadataSource = readText('結構工具箱/tools/local-quick-tool-metadata.js');
const stoneLauncher = readText('石材固定/石材計算書產生器_規範版V2.html');
const stoneVersionSource = readText('石材固定/js/version-sync.js');
const pagesLiveSmoke = readText('結構工具箱/tools/pages-live-smoke.js');
const pagesBrowserSmoke = readText('結構工具箱/tools/pages-live-browser-smoke.js');
const preflightStatus = readJson('結構工具箱/assets/status/preflight-summary.json');
const platformStatus = readJson('結構工具箱/assets/status/platform-status.json');
const reportReadinessStatus = readJson('結構工具箱/assets/status/report-readiness-status.json');
const steelContext = {};
vm.runInNewContext(steelMetadataSource, steelContext, { timeout: 1000, filename: 'steel-tool-metadata' });
const steelMetadata = steelContext.SteelToolMetadata;
const anchorPublicVersion = exportedStringConstant(anchorAppMeta, 'PUBLIC_TOOL_VERSION');
const deckingMetadata = evaluateLiteral(extractConstLiteral(deckingLauncher, 'DECKING_TOOL_METADATA'), 'decking-tool-metadata');
const formalToolMetadataContext = {};
vm.runInNewContext(formalToolMetadataSource, formalToolMetadataContext, { timeout: 1000, filename: 'formal-tool-metadata' });
const formalToolMetadata = formalToolMetadataContext.FormalToolMetadata;
const localQuickToolMetadataContext = {};
vm.runInNewContext(localQuickToolMetadataSource, localQuickToolMetadataContext, { timeout: 1000, filename: 'local-quick-tool-metadata' });
const localQuickToolMetadata = localQuickToolMetadataContext.LocalQuickToolMetadata;
const stoneVersionContext = { window: {} };
vm.runInNewContext(stoneVersionSource, stoneVersionContext, { timeout: 1000, filename: 'stone-public-metadata' });
const stoneMetadata = stoneVersionContext.window.StonePublicMetadata;

assert.equal(homeTools.length, 43, 'canonical homepage tool inventory count');
assert.equal(new Set(homeTools.map(tool => tool.href)).size, homeTools.length, 'canonical homepage routes are unique');
for (const tool of homeTools) {
  assert.ok(tool.title && tool.version && tool.state && tool.output && tool.summary && tool.fit && tool.limit, `canonical public claim complete: ${tool.href}`);
  assert.equal(Array.isArray(tool.capabilities), true, `canonical public capabilities array: ${tool.href}`);
  assert.equal(tool.capabilities.includes('NEW'), false, `canonical public claim avoids expiring NEW badge: ${tool.href}`);
}

function canonicalTool(route) {
  const tool = homeTools.find(item => item.href === route);
  assert.ok(tool, `canonical public claim exists: ${route}`);
  return tool;
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

assert.ok(steelMetadata, 'steel source exposes canonical tool metadata');
for (const [route, metadataKey] of [
  ['/steel-formal', 'connection'],
  ['/steel-plate', 'plate'],
  ['/steel-beam-formal', 'beam'],
  ['/steel-column-formal', 'column'],
]) {
  const tool = canonicalTool(route);
  assert.equal(tool.state, 'formal', `canonical steel claim is formal: ${route}`);
  assert.equal(tool.governance, 'steel-audit', `canonical steel claim uses steel governance: ${route}`);
  assert.equal(steelMetadata[metadataKey].version, tool.version, `steel runtime version matches canonical claim: ${route}`);
}
[
  '../結構工具箱/core/direct-print-boundary.css',
  'steel-formal-output-page',
  '鋼構正式工具主頁列印已封鎖',
  '本頁不得作為附件',
].forEach(needle => assert.ok(steelLauncher.includes(needle), `steel launcher keeps output boundary: ${needle}`));
[
  'new URLSearchParams(window.location.search).get("auditSource") === "local"',
  '../結構工具箱/assets/status/platform-status.json',
  '../結構工具箱/audit-dashboard.html',
  '?auditSource=local',
].forEach(needle => assert.ok(steelApp.includes(needle), `steel audit source keeps explicit boundary: ${needle}`));
assert.equal(steelApp.includes('function isLocalAuditHost'), false, 'steel public launcher does not infer private audit mode from localhost');

const anchorTool = canonicalTool('/anchor');
assert.equal(anchorTool.state, 'formal', 'canonical anchor claim is formal');
assert.equal(anchorTool.governance, 'anchor-deployment', 'canonical anchor claim uses deployment governance');
assert.equal(anchorPublicVersion, anchorTool.version, 'anchor public semantic version matches canonical claim');
assert.ok(anchorAppMeta.includes('CURRENT_CALC_ENGINE_VERSION = __APP_COMMIT_HASH__'), 'anchor keeps build-derived calculation engine provenance');
assert.notEqual(anchorPublicVersion, '__APP_COMMIT_HASH__', 'anchor public version is not the build hash');
assert.ok(anchorApp.includes('錨栓檢討工具 {PUBLIC_TOOL_VERSION}') && anchorApp.includes('工具：<code>{PUBLIC_TOOL_VERSION}</code> · build：'), 'anchor UI separates public tool version from build provenance');
assert.ok(anchorReportDocument.includes('<dt>工具版本</dt>') && anchorReportDocument.includes('{PUBLIC_TOOL_VERSION}'), 'anchor HTML/DOCX report exposes public tool version');
assert.ok(anchorReportDocument.includes('<dt>本案計算引擎</dt>') && anchorReportDocument.includes('<dt>目前計算引擎</dt>'), 'anchor report separately exposes calculation engine provenance');
assert.ok(anchorReportWorkbook.includes("{ 項目: '工具版本', 值: PUBLIC_TOOL_VERSION }") && anchorReportWorkbook.includes("{ 項目: '目前計算引擎', 值: calcEngineVersionStatus.runtimeVersion }"), 'anchor workbook separates public version and calculation engine');

const deckingTool = canonicalTool('/decking');
assert.equal(deckingTool.state, 'formal', 'canonical decking claim is formal');
assert.equal(deckingTool.governance, 'decking-contract', 'canonical decking claim uses report governance');
assert.equal(deckingMetadata.version, deckingTool.version, 'decking runtime version matches canonical claim');
assert.ok(deckingLauncher.includes('pageVersion: DECKING_TOOL_METADATA.version'), 'decking JSON provenance uses canonical runtime metadata');
assert.ok(deckingLauncher.includes('${DECKING_TOOL_METADATA.name} ${DECKING_TOOL_METADATA.version}'), 'decking report provenance uses canonical runtime metadata');
[
  '../結構工具箱/core/direct-print-boundary.css',
  'formal-tool-output-page',
  '覆工板工具主頁列印已封鎖',
  '本頁不得作為附件',
].forEach(needle => assert.ok(deckingLauncher.includes(needle), `decking launcher keeps output boundary: ${needle}`));

assert.equal(Object.keys(formalToolMetadata).length, 17, 'formal public metadata covers every wind and seismic public route');
for (const [toolKey, metadata] of Object.entries(formalToolMetadata)) {
  const tool = canonicalTool(metadata.route);
  const familyFolder = metadata.discipline === 'wind' ? '風力' : '地震力';
  const page = readText(`結構工具箱/tools/${familyFolder}/${toolKey}.html`);
  assert.equal(tool.version, metadata.version, `formal-family public version matches canonical claim: ${metadata.route}`);
  assert.equal(tool.state, metadata.state, `formal-family public state matches canonical claim: ${metadata.route}`);
  if (metadata.governance) {
    assert.equal(tool.governance, metadata.governance, `formal-family governance matches canonical claim: ${metadata.route}`);
    assert.ok(page.includes('../formal-tool-metadata.js'), `formal page loads canonical metadata: ${metadata.route}`);
    assert.ok(page.includes(`const PUBLIC_TOOL_VERSION = window.FormalToolMetadata['${toolKey}'].version`), `formal page binds canonical public version: ${metadata.route}`);
  }
  assert.ok(page.includes(metadata.version), `formal-family page exposes canonical version: ${metadata.route}`);
}

assert.equal(Object.keys(localQuickToolMetadata).length, 3, 'local quick public metadata covers every local quick route');
for (const [toolKey, metadata] of Object.entries(localQuickToolMetadata)) {
  const tool = canonicalTool(metadata.route);
  const folder = toolKey === 'foundation-local' ? 'foundation' : (toolKey === 'equipment-load' ? 'equipment' : 'earth');
  const page = readText(`結構工具箱/tools/${folder}/${toolKey}.html`);
  assert.equal(tool.version, metadata.version, `local-quick public version matches canonical claim: ${metadata.route}`);
  assert.equal(tool.state, metadata.state, `local-quick public state matches canonical claim: ${metadata.route}`);
  assert.equal(tool.governance, metadata.governance, `local-quick governance matches canonical claim: ${metadata.route}`);
  assert.ok(page.includes('../local-quick-tool-metadata.js'), `local-quick page loads canonical metadata: ${metadata.route}`);
  assert.ok(page.includes(`const PUBLIC_TOOL_VERSION = window.LocalQuickToolMetadata['${toolKey}'].version`), `local-quick page binds canonical public version: ${metadata.route}`);
  assert.ok(page.includes('calculationEngine: Core.version'), `local-quick case/report keeps calculation engine: ${metadata.route}`);
  assert.ok(page.includes('計算引擎：${escapeHtml(Core.version)}'), `local-quick report exposes calculation engine: ${metadata.route}`);
}

const stoneTool = canonicalTool('/stone-fixing');
assert.equal(stoneMetadata.version, stoneTool.version, 'stone runtime version matches canonical claim');
assert.equal(stoneMetadata.state, stoneTool.state, 'stone runtime state matches canonical claim');
assert.equal(stoneMetadata.governance, stoneTool.governance, 'stone runtime governance matches canonical claim');
assert.ok(stoneLauncher.includes('const APP_VERSION = window.StonePublicMetadata.version'), 'stone app version derives from canonical metadata');
assert.ok(stoneLauncher.includes('產出工具：${window.StonePublicMetadata.name}') && stoneLauncher.includes('工具版本：${APP_VERSION}') && stoneLauncher.includes('計算引擎：${CALCULATOR_VERSION}') && stoneLauncher.includes('輸出時間：${formatTraceTimestamp(generatedAt)}'), 'stone calculation-book footer separates public version and calculation engine provenance');
assert.equal(stoneLauncher.includes('目前使用版本：V2'), false, 'stone launcher removes stale duplicate V2 claim');
assert.equal(stoneVersionSource.includes('目前使用版本：V2'), false, 'stone version runtime removes stale duplicate V2 claim');

const excavationTool = canonicalTool('/excavation-support');
assert.equal(excavationTool.version, '服務型', 'canonical excavation claim remains service-type rather than a fabricated semantic version');
assert.equal(excavationTool.state, 'service', 'canonical excavation claim is service state');
assert.equal(excavationTool.governance, 'excavation-service', 'canonical excavation claim uses service governance');
[
  '本機受控服務工具',
  '開挖服務入口列印已封鎖',
  '本頁不得作為附件',
  '../結構工具箱/audit-dashboard.html',
  '不在本頁固化可能過期的通過次數',
].forEach(needle => assert.ok(excavationLauncher.includes(needle), `excavation launcher keeps service boundary: ${needle}`));

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
assert.ok(pagesLiveSmoke.includes('auditSource=local') && pagesLiveSmoke.includes('isLocalAuditHost'), 'Pages HTTP smoke protects explicit steel local-audit opt-in and rejects hostname inference');
assert.ok(pagesBrowserSmoke.includes("'/rc'"), 'Pages browser smoke includes RC launcher route');
assert.ok(pagesBrowserSmoke.includes("'/toolbox-classic'"), 'Pages browser smoke includes classic compatibility route');
assert.ok(pagesBrowserSmoke.includes("'/steel-formal'") && pagesBrowserSmoke.includes("'/decking'"), 'Pages browser smoke includes steel and decking print boundaries');
assert.equal(pagesBrowserSmoke.includes('/%E9%8B%BC%E6%A7%8B%E5%B7%A5%E5%85%B7/output/audit/audit-status.json'), false, 'Pages browser smoke no longer ignores steel private-audit 404');
assert.ok(pagesBrowserSmoke.includes('directPrintBoundaries'), 'Pages browser smoke uses shared launcher print-boundary checks');

console.log(`public status claims contract OK (tools=${homeTools.length}, rcCards=${rcCards.length}, release=${preflightStatus.runId})`);
