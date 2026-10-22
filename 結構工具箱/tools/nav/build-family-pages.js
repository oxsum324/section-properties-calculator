#!/usr/bin/env node
'use strict';

/*
 * build-family-pages.js — 由首頁單一資料源（home.source.js）靜態產出家族頁。
 *
 * 用法（在 repo 根目錄）：
 *   node 結構工具箱/tools/nav/build-family-pages.js            產出（覆寫）5 個家族頁
 *   node 結構工具箱/tools/nav/build-family-pages.js --check    逐位元組比對現有檔，不一致退出碼 1
 *   node 結構工具箱/tools/nav/build-family-pages.js --list     列出各家族成員與輸出路徑
 *
 * 規則：
 *   - 只讀 home.source.js 的 categories / categoryIcons / memberSystems / toolStates /
 *     governanceSources / tools / routeFileMap 字面（與 toolbox-entrypoints.contract.test.js 同法）。
 *   - 工具卡欄位只讀 TOOL_FIELD_WHITELIST 內的既有欄位；新增工具只改 home.source.js。
 *   - 連結一律相對路徑：GitHub Pages 部署在子目錄，絕對路徑與 clean route 會 404。
 *   - 輸出固定 LF、固定屬性順序，確保可重現；產出不得含 undefined / NaN。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TOOLBOX_DIR = '結構工具箱';
const HOME_SOURCE_RELATIVE = `${TOOLBOX_DIR}/assets/home/src/home.source.js`;
const GENERATED_MARKER = '<!-- generated-by: build-family-pages.js; source: home.source.js -->';
const TOOL_FIELD_WHITELIST = Object.freeze([
  'aliases', 'capabilities', 'categories', 'fit', 'governance', 'href', 'limit',
  'memberSystem', 'output', 'state', 'summary', 'title', 'version'
]);
const USAGE_BOUNDARY_TEXT = '各工具僅得於頁面標示之適用範圍內使用；最終設計仍應由執業技師簽證。';
const BACK_LINK_TEXT = '← 回結構工具箱';

function field(tool, name) {
  if (!TOOL_FIELD_WHITELIST.includes(name)) {
    throw new Error(`build-family-pages: 工具卡欄位 ${name} 不在白名單內`);
  }
  return tool[name];
}

const FAMILIES = Object.freeze([
  Object.freeze({
    id: 'rc',
    label: 'RC 構件',
    layout: 'rc',
    title: '鋼筋混凝土構件設計工具箱',
    lead: '依 112 年「混凝土結構設計規範」與「耐震特別規定」 ｜ 單位：cm, kgf ｜ 各工具版本以工具卡與輸出文件為準',
    output: '鋼筋混凝土/index.html',
    rule: 'memberSystem 為 rc',
    match: tool => field(tool, 'memberSystem') === 'rc'
  }),
  Object.freeze({
    id: 'steel',
    label: '鋼構／SRC 構件',
    layout: 'home',
    title: '鋼構／SRC 構件｜結構工具箱',
    lead: '鋼梁、鋼柱與鋼構正式規範入口，以及包覆型 SRC 梁、柱檢核；舊案延續頁只供既有案件查核，新案正式附件由正式頁產出。',
    output: `${TOOLBOX_DIR}/family/steel.html`,
    rule: 'memberSystem 為 steel 或 src',
    match: tool => ['steel', 'src'].includes(field(tool, 'memberSystem'))
  }),
  Object.freeze({
    id: 'wind',
    label: '風力規範外力',
    layout: 'home',
    title: '風力規範外力｜結構工具箱',
    lead: '依建築物耐風設計規範取得設計風壓、風力與相關係數；先以案件總覽統一參數，再進入各子工具。',
    output: `${TOOLBOX_DIR}/family/wind.html`,
    rule: 'categories 含 wind',
    match: tool => (field(tool, 'categories') || []).includes('wind'),
    entry: Object.freeze({
      href: '/wind-overview',
      heading: '案件參數與總覽',
      note: '先在總覽頁輸入一次案件參數，統一摘要後再進入各耐風子工具；總覽頁仍保留在下方工具清單內。'
    })
  }),
  Object.freeze({
    id: 'seismic',
    label: '地震力規範外力',
    layout: 'home',
    title: '地震力規範外力｜結構工具箱',
    lead: '依建築物耐震設計規範取得等值靜力、動力分析摘要、附屬構造物與雜項工作物地震力。',
    output: `${TOOLBOX_DIR}/family/seismic.html`,
    rule: 'categories 含 seismic',
    match: tool => (field(tool, 'categories') || []).includes('seismic')
  }),
  Object.freeze({
    id: 'local-quick',
    label: '施工臨設與局部快算',
    layout: 'home',
    title: '施工臨設與局部快算｜結構工具箱',
    lead: '覆工板、開挖擋土支撐、局部基礎、設備荷重、擋土土壓、地坪承載與現場紀錄；標示初估或簡化者，結果需回正式模型、配筋或構件檢核複核。',
    output: `${TOOLBOX_DIR}/family/local-quick.html`,
    rule: 'categories 含 temporary',
    match: tool => (field(tool, 'categories') || []).includes('temporary')
  })
]);

// ---------------------------------------------------------------------------
// 讀取 home.source.js 字面
// ---------------------------------------------------------------------------
function extractConstLiteral(source, name) {
  const prefix = `const ${name} = `;
  const startIndex = source.indexOf(prefix);
  if (startIndex === -1) throw new Error(`home.source.js 缺少 const ${name}`);
  const valueStart = startIndex + prefix.length;
  const open = source[valueStart];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) throw new Error(`const ${name} 必須是陣列或物件字面`);

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
  throw new Error(`const ${name} 未結束`);
}

function evaluateLiteral(literal, label) {
  // 以 JSON 往返複製到主 realm：避免 vm 陣列原型不同造成 deepStrictEqual 差異，且只保留純資料。
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${literal})`, {}, { timeout: 1000, filename: label })));
}

function loadHomeSource(repoRoot = REPO_ROOT) {
  const sourcePath = path.join(repoRoot, ...HOME_SOURCE_RELATIVE.split('/'));
  const source = fs.readFileSync(sourcePath, 'utf8');
  const read = name => evaluateLiteral(extractConstLiteral(source, name), `home.source.js:${name}`);
  const data = {
    categories: read('categories'),
    categoryIcons: read('categoryIcons'),
    memberSystems: read('memberSystems'),
    toolStates: read('toolStates'),
    governanceSources: read('governanceSources'),
    tools: read('tools'),
    routeFileMap: read('routeFileMap')
  };
  data.categoryMap = new Map(data.categories.map(category => [category.id, category]));
  data.memberSystemMap = new Map(data.memberSystems.map(system => [system.id, system]));
  return data;
}

function familyTools(family, tools) {
  return tools.filter(tool => Boolean(family.match(tool)));
}

// ---------------------------------------------------------------------------
// 路徑與跳脫
// ---------------------------------------------------------------------------
function toPosix(value) {
  return String(value).replace(/\\/g, '/');
}

// routeFileMap 的值相對於 結構工具箱/；換算成相對於 repo 根目錄的 POSIX 路徑。
function repoPathFromToolbox(fileHref) {
  return path.posix.normalize(path.posix.join(TOOLBOX_DIR, toPosix(fileHref)));
}

// 由家族頁所在目錄到目標檔的相對路徑（永遠相對，不得以 / 開頭）。
function relativeHref(pageRepoPath, targetRepoPath) {
  const fromDir = path.posix.dirname(toPosix(pageRepoPath));
  const relative = path.posix.relative(fromDir, toPosix(targetRepoPath));
  if (!relative || relative.startsWith('/')) throw new Error(`無法產生相對路徑：${pageRepoPath} -> ${targetRepoPath}`);
  return relative;
}

function resolveToolFileHref(routeHref, routeFileMap) {
  const mapped = routeFileMap[routeHref];
  if (!mapped) throw new Error(`routeFileMap 缺少 ${routeHref}`);
  return repoPathFromToolbox(mapped);
}

function text(value, label) {
  if (value === undefined || value === null) throw new Error(`家族頁欄位缺值：${label}`);
  const stringValue = String(value);
  if (/\b(undefined|NaN)\b/.test(stringValue)) throw new Error(`家族頁欄位含 undefined/NaN：${label}`);
  return stringValue;
}

function esc(value, label) {
  return text(value, label)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// 共用片段
// ---------------------------------------------------------------------------
function toolState(tool, data) {
  const stateId = field(tool, 'state');
  return data.toolStates[stateId] || { label: '未分類', tone: 'unknown', summary: '' };
}

function toolGovernance(tool, data) {
  const governanceId = field(tool, 'governance');
  return governanceId ? (data.governanceSources[governanceId] || null) : null;
}

function uniqueChips(items) {
  const seen = new Set();
  const chips = [];
  for (const item of items) {
    const label = String(item.label || '').trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    chips.push(item.html);
  }
  return chips;
}

function renderToolMeta(tool, data, indent) {
  const state = toolState(tool, data);
  const categories = field(tool, 'categories') || [];
  const primary = categories[0] || 'reference';
  const category = data.categoryMap.get(primary);
  const governance = toolGovernance(tool, data);
  const memberSystem = field(tool, 'memberSystem');
  const title = field(tool, 'title');
  const items = [
    {
      label: state.label,
      html: `<span class="tool-state tool-state--${esc(state.tone, `${title}.state.tone`)}" title="${esc(state.summary || '', `${title}.state.summary`)}">${esc(state.label, `${title}.state.label`)}</span>`
    },
    {
      label: category ? category.label : primary,
      html: `<span class="tool-chip tool-chip--${esc(primary, `${title}.category`)}">${esc(category ? category.label : primary, `${title}.category.label`)}</span>`
    }
  ];
  if (memberSystem && categories.includes('member')) {
    const system = data.memberSystemMap.get(memberSystem);
    const label = system ? system.label : memberSystem;
    items.push({ label, html: `<span class="tool-chip tool-chip--system">${esc(label, `${title}.memberSystem`)}</span>` });
  }
  if (governance && governance.cardTag) {
    items.push({ label: governance.cardTag, html: `<span class="tool-chip tool-chip--governance">${esc(governance.cardTag, `${title}.governance`)}</span>` });
  }
  for (const capability of (field(tool, 'capabilities') || []).slice(0, 3)) {
    items.push({ label: capability, html: `<span class="tool-chip">${esc(capability, `${title}.capability`)}</span>` });
  }
  return uniqueChips(items).map(html => `${indent}${html}`);
}

// home.css 版工具卡：與 home.source.js renderToolCard 同構，但不含釘選、最近使用與更新日。
function renderHomeToolCard(tool, data, pageRepoPath) {
  const title = field(tool, 'title');
  const categories = field(tool, 'categories') || [];
  const primary = categories[0] || 'reference';
  const category = data.categoryMap.get(primary);
  const iconKey = category && category.icon ? category.icon : primary;
  const state = toolState(tool, data);
  const routeHref = field(tool, 'href');
  const href = relativeHref(pageRepoPath, resolveToolFileHref(routeHref, data.routeFileMap));
  const lines = [];
  lines.push(`      <a class="tool-card tool-card--${esc(primary, `${title}.category`)} tool-card--state-${esc(state.tone, `${title}.state`)}" href="${esc(href, `${title}.href`)}" data-route-href="${esc(routeHref, `${title}.route`)}" data-category="${esc(primary, `${title}.category`)}" data-state="${esc(field(tool, 'state'), `${title}.state`)}" data-title="${esc(title, `${title}.title`)}">`);
  lines.push('        <div class="tool-card__head">');
  lines.push('          <div class="tool-title-row">');
  lines.push(`            <span class="tool-card__icon category-icon--${esc(iconKey, `${title}.icon`)}" aria-hidden="true">${text(data.categoryIcons[iconKey] || '', `${title}.iconSvg`)}<span class="icon-mark">${esc(category && category.mark ? category.mark : '', `${title}.mark`)}</span></span>`);
  lines.push(`            <h3>${esc(title, `${title}.title`)}</h3>`);
  lines.push('          </div>');
  lines.push(`          <div class="tool-card__badges"><span class="tool-version">${esc(field(tool, 'version'), `${title}.version`)}</span></div>`);
  lines.push('        </div>');
  lines.push('        <div class="tool-profile">');
  lines.push(`          <div class="tool-profile__item"><span>定位</span><p>${esc(field(tool, 'summary'), `${title}.summary`)}</p></div>`);
  lines.push(`          <div class="tool-profile__item"><span>適用</span><p>${esc(field(tool, 'fit'), `${title}.fit`)}</p></div>`);
  lines.push('        </div>');
  lines.push('        <div class="tool-meta">');
  lines.push(...renderToolMeta(tool, data, '          '));
  lines.push('        </div>');
  lines.push('      </a>');
  return lines;
}

// RC 家族頁沿用既有 .menu-card 版面（public-status-claims 與 pages-live-smoke 以此結構讀取版本宣告）。
function renderRcMenuCard(tool, data, pageRepoPath) {
  const title = field(tool, 'title');
  const state = toolState(tool, data);
  const routeHref = field(tool, 'href');
  const href = relativeHref(pageRepoPath, resolveToolFileHref(routeHref, data.routeFileMap));
  const verClass = state.tone === 'formal' ? 'ver ver-ok' : `ver ver-${esc(state.tone, `${title}.state`)}`;
  const lines = [];
  lines.push(`      <a class="menu-card" href="${esc(href, `${title}.href`)}">`);
  lines.push(`        <h3>${esc(title, `${title}.title`)} <span class="${verClass}">${esc(field(tool, 'version'), `${title}.version`)}</span></h3>`);
  lines.push(`        <p class="menu-card__state" data-route-href="${esc(routeHref, `${title}.route`)}" data-state="${esc(field(tool, 'state'), `${title}.state`)}" data-title="${esc(title, `${title}.title`)}"><span class="menu-card__state-label" title="${esc(state.summary || '', `${title}.state.summary`)}">${esc(state.label, `${title}.state.label`)}</span></p>`);
  lines.push(`        <p>${esc(field(tool, 'summary'), `${title}.summary`)}</p>`);
  lines.push(`        <p class="menu-card__fit">適用：${esc(field(tool, 'fit'), `${title}.fit`)}</p>`);
  lines.push('      </a>');
  return lines;
}

function renderPrintBoundary(headingText, bodyText) {
  return [
    '<aside class="formal-direct-print-boundary" aria-hidden="true">',
    `  <strong>${esc(headingText, 'printBoundary.heading')}</strong>`,
    `  <span>${esc(bodyText, 'printBoundary.body')}</span>`,
    '</aside>'
  ];
}

function renderWindEntry(family, data, pageRepoPath, members) {
  const entry = family.entry;
  const tool = members.find(item => field(item, 'href') === entry.href);
  if (!tool) throw new Error(`家族 ${family.id} 的入口工具 ${entry.href} 不在成員內`);
  const title = field(tool, 'title');
  const state = toolState(tool, data);
  const href = relativeHref(pageRepoPath, resolveToolFileHref(entry.href, data.routeFileMap));
  return [
    '    <section class="family-entry" aria-labelledby="familyEntryTitle" data-family-entry>',
    '      <div class="section-head">',
    '        <div>',
    '          <p class="home-kicker">Entry</p>',
    `          <h2 id="familyEntryTitle">${esc(entry.heading, 'entry.heading')}</h2>`,
    '        </div>',
    `        <p>${esc(entry.note, 'entry.note')}</p>`,
    '      </div>',
    `      <a class="family-entry__card" href="${esc(href, `${title}.href`)}" data-route-href="${esc(entry.href, `${title}.route`)}">`,
    `        <span class="family-entry__title">${esc(title, `${title}.title`)} <span class="tool-version">${esc(field(tool, 'version'), `${title}.version`)}</span></span>`,
    `        <p class="family-entry__summary">${esc(field(tool, 'summary'), `${title}.summary`)}</p>`,
    `        <span class="family-entry__meta"><span class="tool-state tool-state--${esc(state.tone, `${title}.state`)}">${esc(state.label, `${title}.state.label`)}</span><span class="family-entry__cta">進入總覽 →</span></span>`,
    '      </a>',
    '    </section>'
  ];
}

// ---------------------------------------------------------------------------
// home.css 版家族頁
// ---------------------------------------------------------------------------
function renderHomeLayoutPage(family, data, members) {
  const pageRepoPath = family.output;
  const assetHref = target => relativeHref(pageRepoPath, target);
  const count = members.length;
  const lines = [];
  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="zh-TW">');
  lines.push('<head>');
  lines.push('<meta charset="UTF-8">');
  lines.push(GENERATED_MARKER);
  lines.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`<title>${esc(family.title, `${family.id}.title`)}</title>`);
  lines.push('<link rel="icon" href="data:,">');
  lines.push(`<link rel="stylesheet" href="${assetHref(`${TOOLBOX_DIR}/assets/hy/colors_and_type.css`)}">`);
  lines.push(`<link rel="stylesheet" href="${assetHref(`${TOOLBOX_DIR}/assets/home/home.css`)}">`);
  lines.push(`<link rel="stylesheet" href="${assetHref(`${TOOLBOX_DIR}/core/direct-print-boundary.css`)}">`);
  lines.push(`<link rel="stylesheet" href="${assetHref(`${TOOLBOX_DIR}/family/family.css`)}">`);
  lines.push('</head>');
  lines.push(`<body class="home-page family-page formal-tool-output-page" data-family="${esc(family.id, 'family.id')}">`);
  lines.push(...renderPrintBoundary(
    `${family.label}家族頁列印已封鎖`,
    '此頁是工具導覽入口，不是計算書。請關閉列印視窗，進入個別工具後產生可列印的內部審閱文件，或在核可後產生正式附件；本頁不得作為附件。'
  ));
  lines.push('<header class="home-header family-header">');
  lines.push('  <div class="home-header__inner">');
  lines.push('    <div class="home-header__lead">');
  lines.push('      <p class="home-kicker">結構工具箱 ｜ 家族頁</p>');
  lines.push('      <hr class="home-rule">');
  lines.push(`      <h1>${esc(family.label, 'family.label')} <span>${count} 項工具</span></h1>`);
  lines.push(`      <p class="home-header__summary">${esc(family.lead, 'family.lead')}</p>`);
  lines.push('    </div>');
  lines.push('    <div class="home-header__status">');
  lines.push('      <span>工具入口</span>');
  lines.push(`      <a class="family-header__back" href="${assetHref(`${TOOLBOX_DIR}/index.html`)}">${BACK_LINK_TEXT}</a>`);
  lines.push('    </div>');
  lines.push('  </div>');
  lines.push('</header>');
  lines.push('');
  lines.push('<main class="home-shell family-shell">');
  if (family.entry) {
    lines.push(...renderWindEntry(family, data, pageRepoPath, members));
    lines.push('');
  }
  lines.push('  <section class="tool-panel family-tool-panel" aria-labelledby="familyToolsTitle">');
  lines.push('    <div class="section-head section-head--tools">');
  lines.push('      <div>');
  lines.push('        <p class="home-kicker">Tools</p>');
  lines.push('        <h2 id="familyToolsTitle">工具清單</h2>');
  lines.push('      </div>');
  lines.push('      <div class="tool-panel__controls">');
  lines.push(`        <p class="result-count" data-family-count="${count}">${count} 項工具</p>`);
  lines.push('      </div>');
  lines.push('    </div>');
  lines.push('    <div class="tool-grid family-tool-grid" data-family-tools>');
  for (const tool of members) lines.push(...renderHomeToolCard(tool, data, pageRepoPath));
  lines.push('    </div>');
  lines.push('  </section>');
  lines.push('');
  lines.push('  <section class="note-panel" aria-label="使用責任提醒">');
  lines.push('    <strong>使用邊界</strong>');
  lines.push(`    <p>${esc(USAGE_BOUNDARY_TEXT, 'usageBoundary')}</p>`);
  lines.push('  </section>');
  lines.push('</main>');
  lines.push('');
  lines.push('<footer class="home-footer">弘一工程顧問有限公司　內部工程工具平台</footer>');
  lines.push('</body>');
  lines.push('</html>');
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// RC 家族頁（保留巡檢狀態卡、關於本工具箱與列印邊界）
// ---------------------------------------------------------------------------
const RC_PAGE_STYLE = `<style>
  .ver { display:inline-block; margin-left:6px; padding:1px 7px; border-radius:10px;
         font-size:0.62em; font-weight:700; vertical-align:middle; letter-spacing:0.5px; }
  .ver-ok    { background:#dcfce7; color:#15803d; border:1px solid #86efac; }
  .ver-legacy, .ver-estimate, .ver-service, .ver-external { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }
  .ver-assist, .ver-reference, .ver-report, .ver-workflow, .ver-unknown { background:#e2e8f0; color:#334155; border:1px solid #cbd5e1; }
  .menu-card__state { margin: 0 0 6px; }
  .menu-card__state-label { display:inline-block; padding:2px 8px; border-radius:4px; font-size:0.72em; font-weight:700;
                            letter-spacing:0.5px; background:#e8f1f7; color:#29506d; }
  .menu-card__fit { margin-top:6px; font-size:0.8em; color:var(--text-light); }
  .audit-status-card {
    display:grid; gap:8px; padding:16px 18px; border:1px solid #d7e3ef; border-radius:12px;
    background:linear-gradient(180deg,#f8fbff 0%,#f3f8fc 100%);
  }
  .audit-status-card__head { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
  .audit-status-card__title { font-size:0.96em; font-weight:800; color:var(--primary); }
  .audit-status-card__badge { display:inline-flex; align-items:center; justify-content:center; min-height:28px; padding:4px 10px; border-radius:999px; font-size:0.74em; font-weight:800; }
  .audit-status-card__badge.ok { background:#dcfce7; color:#166534; }
  .audit-status-card__badge.warn { background:#fef3c7; color:#92400e; }
  .audit-status-card__badge.fail { background:#fee2e2; color:#991b1b; }
  .audit-status-card__summary { color:var(--text); font-size:0.84em; line-height:1.6; }
  .audit-status-card__meta { display:flex; flex-wrap:wrap; gap:8px; }
  .audit-status-card__meta span { display:inline-flex; align-items:center; min-height:26px; padding:4px 10px; border-radius:999px; background:#e8f1f7; color:#29506d; font-size:0.74em; font-weight:700; }
  .audit-status-card__links { display:flex; flex-wrap:wrap; gap:8px; }
  .audit-status-card__links a { color:var(--primary); font-size:0.78em; font-weight:700; text-decoration:none; }
  .audit-status-card__links a:hover { text-decoration:underline; }
  .usage-boundary { margin-top:18px; padding:12px 14px; border-left:3px solid var(--primary); background:var(--bg-page); font-size:0.86em; color:var(--text); }
/* 分區 banner（T11，純裝飾；列印隱藏） */
header.family-banner { position: relative; overflow: hidden; isolation: isolate; }
header.family-banner::after { content: ''; position: absolute; inset: 0 0 0 auto; width: min(55%, 760px); background: url('shared/banner-art.webp?v=20261004') right center / cover no-repeat; opacity: 0.9; z-index: -1; pointer-events: none; -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 35%); mask-image: linear-gradient(90deg, transparent 0%, #000 35%); }
@media (max-width: 720px) { header.family-banner::after { width: 100%; opacity: 0.3; -webkit-mask-image: none; mask-image: none; } }
@media print { header.family-banner::after { display: none; } }
</style>`;

// RC 自動巡檢狀態卡 script：讀公開平台狀態快照；直接開檔模式顯示提示。
function rcAuditScript(statusJsonHref, dashboardHref) {
  return `<script>
  (function () {
    const card = document.getElementById('rcAuditStatusCard');
    if (!card) return;

    const MODULE_LABELS = {
      beam: '梁',
      column: '柱',
      slab: '板',
      'shear-wall': '剪力牆',
      wall: '牆',
      foundation: '基礎',
      'single-pile': '單樁',
    };

    function moduleText(payload) {
      const modules = Array.isArray(payload?.modules) ? payload.modules : [];
      const labels = modules.map((key) => MODULE_LABELS[key] || key).filter(Boolean);
      return labels.length ? labels.join('、') : '梁、柱、板、牆、剪力牆、基礎、單樁';
    }

    function renderStatus(payload, summaryUrl, sourceKind = 'local') {
      if (!/^https?:$/i.test(window.location.protocol) && !payload) {
        card.innerHTML = \`
          <div class="audit-status-card__head">
            <span class="audit-status-card__title">RC 自動巡檢</span>
            <span class="audit-status-card__badge warn">未讀取</span>
          </div>
          <div class="audit-status-card__summary">目前以直接開檔模式執行，未讀取最新巡檢狀態；若改以本機伺服器開啟，會顯示最近一輪 RC 巡檢結果。</div>
        \`;
        return;
      }

      const isPublic = sourceKind === 'public' || payload?.kind === 'platform-status';
      const tone = payload && payload.pass ? 'ok' : (payload ? 'fail' : 'warn');
      const badge = payload
        ? (payload.pass ? (isPublic ? '平台最近巡檢通過' : '最新巡檢通過') : \`\${isPublic ? '平台最近巡檢異常' : '最新巡檢異常'} \${payload.failureCount || 0} 項\`)
        : (isPublic ? '公開狀態未載入' : '未讀取');
      const meta = payload ? [
        payload.runId ? \`runId｜\${payload.runId}\` : '',
        isPublic ? '來源｜正式放行公開快照' : (payload.loop ? '模式｜循環' : '模式｜單次'),
        \`結果｜\${payload.failureCount || 0} 項異常\`
      ].filter(Boolean) : [];

      card.innerHTML = \`
        <div class="audit-status-card__head">
          <span class="audit-status-card__title">\${isPublic ? '平台公開巡檢狀態' : 'RC 自動巡檢'}</span>
          <span class="audit-status-card__badge \${tone}">\${badge}</span>
        </div>
        <div class="audit-status-card__summary">\${payload ? (isPublic ? \`公開平台最近一輪巡檢 \${payload.pass ? '已通過' : '發現異常'}；RC 詳細巡檢僅供本機工作環境讀取。\` : \`最近一輪 RC 巡檢 \${payload.pass ? '已通過' : '發現異常'}，可作為\${moduleText(payload)}工具的健康度參考。\`) : (isPublic ? '尚未取得公開平台巡檢狀態。' : '尚未取得最新 RC 巡檢狀態。')}</div>
        \${meta.length ? \`<div class="audit-status-card__meta">\${meta.map((item) => \`<span>\${item}</span>\`).join('')}</div>\` : ''}
        \${summaryUrl ? \`<div class="audit-status-card__links"><a href="\${summaryUrl}" target="_blank" rel="noreferrer">\${isPublic ? '開啟工具箱狀態總覽' : '開啟 RC 巡檢摘要'}</a></div>\` : ''}
      \`;
    }

    if (!/^https?:$/i.test(window.location.protocol)) {
      renderStatus(null, './output/audit/audit-summary.md');
      return;
    }

    const source = {
      kind: 'public',
      url: '${statusJsonHref}',
      summaryUrl: '${dashboardHref}'
    };

    fetch(\`\${source.url}?ts=\${Date.now()}\`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
        return response.json();
      })
      .then((payload) => renderStatus(payload, source.summaryUrl, source.kind))
      .catch(() => renderStatus(null, '', source.kind));
  })();
</script>`;
}

function renderRcLayoutPage(family, data, members) {
  const pageRepoPath = family.output;
  const assetHref = target => relativeHref(pageRepoPath, target);
  const statusJsonHref = assetHref(`${TOOLBOX_DIR}/assets/status/platform-status.json`);
  const dashboardHref = assetHref(`${TOOLBOX_DIR}/audit-dashboard.html`);
  if (statusJsonHref.includes("'") || dashboardHref.includes("'")) throw new Error('RC 狀態路徑不得含單引號');
  const lines = [];
  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="zh-TW">');
  lines.push('<head>');
  lines.push('<meta charset="UTF-8">');
  lines.push(GENERATED_MARKER);
  lines.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`<title>${esc(family.title, 'rc.title')}</title>`);
  lines.push('<link rel="icon" href="data:,">');
  lines.push('<link rel="stylesheet" href="shared/style.css">');
  lines.push(`<link rel="stylesheet" href="${assetHref(`${TOOLBOX_DIR}/core/direct-print-boundary.css`)}">`);
  lines.push(RC_PAGE_STYLE);
  lines.push('</head>');
  lines.push(`<body class="formal-tool-output-page" data-family="${esc(family.id, 'family.id')}">`);
  lines.push(...renderPrintBoundary(
    'RC 工具箱入口列印已封鎖',
    '此頁是構件選擇與巡檢狀態入口，不是計算書。請關閉列印視窗，進入個別 RC 工具後產生可列印的內部審閱文件，或在核可後產生正式附件；本頁不得作為附件。'
  ));
  lines.push('<header class="family-banner">');
  lines.push(`  <p><a class="back" href="${assetHref(`${TOOLBOX_DIR}/index.html`)}">${BACK_LINK_TEXT}</a></p>`);
  lines.push(`  <h1>${esc(family.title, 'rc.title')}</h1>`);
  lines.push(`  <p>${esc(family.lead, 'rc.lead')}</p>`);
  lines.push('</header>');
  lines.push('');
  // main 地標：讓 axe landmark-one-main / region 不再回報，.container 版面規則不變。
  lines.push('<main class="container">');
  lines.push('');
  lines.push('  <div class="card">');
  lines.push('    <h2>工具健康狀態</h2>');
  lines.push('    <div class="audit-status-card" id="rcAuditStatusCard">');
  lines.push('      <div class="audit-status-card__head">');
  lines.push('        <span class="audit-status-card__title">RC 自動巡檢</span>');
  lines.push('        <span class="audit-status-card__badge warn">讀取中</span>');
  lines.push('      </div>');
  lines.push('      <div class="audit-status-card__summary">讀取最新 RC 巡檢狀態中。</div>');
  lines.push('    </div>');
  lines.push('  </div>');
  lines.push('');
  lines.push('  <div class="card">');
  lines.push(`    <h2>選擇構件 <span class="menu-card__state-label" data-family-count="${members.length}">${members.length} 項工具</span></h2>`);
  lines.push('    <div class="menu-grid" data-family-tools>');
  for (const tool of members) lines.push(...renderRcMenuCard(tool, data, pageRepoPath));
  lines.push('    </div>');
  lines.push('  </div>');
  lines.push('');
  lines.push('  <div class="card">');
  lines.push('    <h2>關於本工具箱</h2>');
  lines.push('    <p style="font-size:0.88em; color:var(--text-light); line-height:1.8;">');
  lines.push('      本工具箱以 112 年「混凝土結構設計規範」為依據，依構件分頁設計。每個構件工具皆內建');
  lines.push('      <span style="color:var(--seismic); font-weight:600;">「特殊抗彎矩構架／特殊結構牆」</span>');
  lines.push('      勾選框，啟用後會自動套用耐震特別規定 (含尺寸限制、鋼筋比、橫向鋼筋、塑鉸區、強柱弱梁等)。');
  lines.push('    </p>');
  lines.push('    <div class="note">');
  lines.push('      各構件工具的計算書可作為可列印的內部審閱文件，明確核可後可作為正式附件；文件身分不取代設計者對分析模型、載重組合、適用條文、構造細節與簽證責任的確認。');
  lines.push('    </div>');
  lines.push(`    <p class="usage-boundary">${esc(USAGE_BOUNDARY_TEXT, 'usageBoundary')}</p>`);
  lines.push('  </div>');
  lines.push('');
  lines.push('  <footer style="margin-top:24px; padding:14px 0; text-align:center; font-size:0.82em; color:var(--text-light); border-top:1px solid #e2e8f0;">');
  lines.push('    © 弘一工程顧問有限公司　版權所有');
  lines.push('  </footer>');
  lines.push('</main>');
  lines.push(rcAuditScript(statusJsonHref, dashboardHref));
  lines.push('</body>');
  lines.push('</html>');
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// 組裝
// ---------------------------------------------------------------------------
function renderFamilyPage(family, data) {
  const members = familyTools(family, data.tools);
  if (!members.length) throw new Error(`家族 ${family.id} 沒有成員`);
  const html = family.layout === 'rc'
    ? renderRcLayoutPage(family, data, members)
    : renderHomeLayoutPage(family, data, members);
  if (html.includes('\r')) throw new Error(`家族頁 ${family.id} 含 CR`);
  if (/\b(undefined|NaN)\b/.test(html)) throw new Error(`家族頁 ${family.id} 含 undefined/NaN`);
  return { family, members, html };
}

function buildAll(repoRoot = REPO_ROOT) {
  const data = loadHomeSource(repoRoot);
  return FAMILIES.map(family => renderFamilyPage(family, data));
}

function outputPath(repoRoot, family) {
  return path.join(repoRoot, ...family.output.split('/'));
}

function writeAll(repoRoot = REPO_ROOT) {
  const pages = buildAll(repoRoot);
  for (const page of pages) {
    const target = outputPath(repoRoot, page.family);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, page.html, 'utf8');
  }
  return pages;
}

function checkAll(repoRoot = REPO_ROOT) {
  const pages = buildAll(repoRoot);
  const problems = [];
  for (const page of pages) {
    const target = outputPath(repoRoot, page.family);
    if (!fs.existsSync(target)) {
      problems.push(`${page.family.output}: 檔案不存在`);
      continue;
    }
    const actual = fs.readFileSync(target);
    const expected = Buffer.from(page.html, 'utf8');
    if (!actual.equals(expected)) {
      const eolOnly = actual.toString('utf8').replace(/\r\n/g, '\n') === page.html;
      problems.push(`${page.family.output}: 與產生器輸出不一致${eolOnly ? '（僅換行符差異：工作樹為 CRLF，需於 .gitattributes 登錄 text eol=lf）' : ''}`);
    }
  }
  return { pages, problems };
}

function main(argv) {
  const args = new Set(argv);
  if (args.has('--list')) {
    const data = loadHomeSource();
    for (const family of FAMILIES) {
      const members = familyTools(family, data.tools);
      console.log(`${family.id}\t${members.length}\t${family.output}\t(${family.rule})`);
      for (const tool of members) console.log(`  ${field(tool, 'href')}\t${field(tool, 'title')}\t${field(tool, 'version')}`);
    }
    return 0;
  }
  if (args.has('--check')) {
    const { pages, problems } = checkAll();
    for (const page of pages) console.log(`${page.family.id}: ${page.members.length} 項工具 -> ${page.family.output}`);
    if (problems.length) {
      for (const problem of problems) console.error(`FAIL | ${problem}`);
      console.error(`family pages check failed: ${problems.length} 項不一致；請執行 node 結構工具箱/tools/nav/build-family-pages.js 重新產出`);
      return 1;
    }
    console.log('family pages check OK');
    return 0;
  }
  const pages = writeAll();
  for (const page of pages) console.log(`wrote ${page.family.output} (${page.members.length} 項工具)`);
  return 0;
}

module.exports = {
  REPO_ROOT,
  TOOLBOX_DIR,
  HOME_SOURCE_RELATIVE,
  GENERATED_MARKER,
  TOOL_FIELD_WHITELIST,
  USAGE_BOUNDARY_TEXT,
  FAMILIES,
  extractConstLiteral,
  evaluateLiteral,
  loadHomeSource,
  familyTools,
  relativeHref,
  repoPathFromToolbox,
  resolveToolFileHref,
  renderFamilyPage,
  buildAll,
  writeAll,
  checkAll,
  outputPath
};

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  }
}
