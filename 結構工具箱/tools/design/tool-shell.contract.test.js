'use strict';
/*
 * 工具頁首屏「五區」共用元件契約（第二輪第 3 包，純靜態，不開瀏覽器）
 * 範圍：鋼筋混凝土/tools/beam.html、結構工具箱/tools/風力/wind-kzt.html、
 *       結構工具箱/tools/cable-tension/cable-tension-frequency.html 與 結構工具箱/core/tool-shell.css
 * - 3 頁以 <link> 載入 tool-shell.css（位於既有共用樣式表之後、頁面內嵌 <style> 之前），全站不得 @import 它
 * - tool-shell.css 只用 colors_and_type.css token、無十六進位色、無 @import；版面規則一律包在 @media screen／print
 * - 舊「← 回主選單」連結已移除（頂欄提供），頁首帶 .tool-shell-header 與次要副標
 * - 主要動作列 .tool-shell-actions 恰好兩顆按鈕：開始計算＋計算書
 * - 案件表頭（計畫名稱／編號／設計人）一列且不收合；收合區只允許存讀檔類 id
 * - 執行期插入點：.mode-bar 位於輸入之後（RC 梁、鋼索），共用表頭列接在收合區內的 .project-storage-bar 後；
 *   Kzt 的 .mode-bar 為列印計畫資訊卡，所在的 .tool-shell-case-zone 由收合鈕控制執行期插入列
 * - 關鍵 id 全數保留：以下清單凍結自 HEAD 6958a2dd 的靜態標記（排除 <script>/<style>/註解），
 *   表單控制項文件順序亦凍結（JSON fields 鍵序與案例回讀依此）；class 只可增不可減（僅移除舊連結 class="back"）
 * 執行：node 結構工具箱/tools/design/tool-shell.contract.test.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const SHELL = '結構工具箱/core/tool-shell.css';
const TOKENS = '結構工具箱/assets/hy/colors_and_type.css';
const FAMILY = '結構工具箱/core/family-theme.css';
const abs = rel => path.join(repoRoot, ...rel.split('/'));
const read = rel => fs.readFileSync(abs(rel), 'utf8').replace(/\r\n/g, '\n');
const words = text => text.trim().split(/\s+/).filter(Boolean);

/* ---------- 凍結資料（HEAD 6958a2dd） ---------- */
const PAGES = [
  {
    file: '鋼筋混凝土/tools/beam.html',
    body: '<body class="rc-formal-output-page" data-family="rc">',
    boundary: '<div class="rc-direct-print-boundary" aria-hidden="true">',
    maxInlineStyleLines: 17,
    loadsWorkflow: true,
    primary: [
      { label: '開始計算', match: node => hasClass(node, 'btn-calc') && hasClass(node, 'mode-bar__report') },
      { label: '計算書', match: node => node.attrs.id === 'btnReport' },
    ],
    firstEngineeringInput: 'seismicMode',
    collapsedIds: ['btnSaveBeamProject', 'btnLoadBeamProject', 'btnSaveBeamDraft', 'btnLoadBeamDraft', 'beamProjectFile', 'beamProjectStatus'],
    ids: `MaNeg MaPos MuNeg MuPos Pu Tu TuWrap Ve VeWrap Vu anchorageLeft anchorageRight autoD autoMa bannerKey bannerStatus barShMin
      beamAttachmentReadiness beamAttachmentReadinessCard beamDevLeftType beamDevRightType beamForceCandidateApply beamForceCandidateCard
      beamForceCandidateConfirm beamForceCandidateDiscard beamForceCandidateList beamForceCandidateSummary beamJointCard beamJointMprFactor
      beamJointSendStatus beamJointTarget beamLapClass beamLapEnd beamLapLength beamLapStart beamPreset beamProjectFile beamProjectStatus
      beamRebarDesignCandidates beamRebarFeasibleRanges bf botBar1N botBar1No botBar2N botBar2No botBar3N botBar3No botLayerCount
      botRebarStack btnAddBotLayer btnAddTopLayer btnApplyPreset btnCopyJson btnLoadBeamDraft btnLoadBeamProject btnPrintReport
      btnPrintReport2 btnRemoveBotLayer btnRemoveTopLayer btnReport btnReport2 btnSaveBeamDraft btnSaveBeamProject btnSendToColumn bw
      c-AsMinBot c-AsMinTop c-barsPerLayer c-bw c-crackSpacing c-devLeft c-devRight c-flexNeg c-flexPos c-hmin c-lapLength
      c-layerSpacing c-ln c-rhoMaxNeg c-rhoMaxPos c-shear c-shearMin c-shearSpacing c-skin c-tor c-torDetail colW conclusionCard
      conclusionScope cover d-Ec d-IcrNeg d-IcrPos d-IeAvg d-IeNeg d-IePos d-Ig d-Mcr d-defAllow d-defImm d-defLong d-defOk d-lambda
      d-n d-stateNeg d-statePos dManual dManualWrap deepBeamNotice deepLoadDistance deflCard deflLimit designSuggestFlex
      designSuggestShear devEpoxyPsi devTopPsi enableDefl enableExactDefl enableTorsion exactDeflInputs fc firstHoopDist flexModeHint
      flexTitle fy fyt h heroAsRatio heroAsReq heroCombo heroStirS heroVsReq hf layerSv lcBeamPanel legs ln loadSummaryCard ls-MuNeg
      ls-MuPos ls-Pu ls-Tu ls-TuItem ls-Ve ls-VeItem ls-Vu mainTabs modeHint nSkin projDesigner projName projNo r-AsBot r-AsMin r-AsTop
      r-Mcr r-Vc r-Vs r-aNeg r-aPos r-dNeg r-dPos r-epsTNeg r-epsTPos r-jointMnb r-jointMpr r-jointTarget r-jointVeCap r-phiMnNeg
      r-phiMnPos r-phiVn r-rhoNeg r-rhoPos rebarHeroFlex rebarHeroShear results s-2bar s-MnQuarter s-MnRatio s-bw s-bwCol s-firstHoop
      s-lapZone s-lo s-midSpacing s-rhoNeg s-rhoPos s-spacing s-vc0 sectionCanvas sectionType seismicMode sensitive shearTitle showSteps
      skinNo smrfMnMin stepsDefl stepsDeflBody stepsFlex stepsFlexBody stepsSeismic stepsSeismicBody stepsShear stepsShearBody
      stepsTorsion stepsTorsionBody stepsVerbosity stepsVerbosityWrap stirS stirrup support tab-defl tab-flex tab-shear tab-torsion
      tl-fields topBar1N topBar1No topBar2N topBar2No topBar3N topBar3No topLayerCount topRebarStack torsionAl torsionAtPerS
      torsionDesignStatus warningCard warningList xiTime`,
    controls: `projName projNo projDesigner beamProjectFile seismicMode sectionType bf hf support fc fy bw h ln deepLoadDistance fyt
      enableTorsion enableDefl showSteps stepsVerbosity beamPreset cover autoD dManual layerSv barShMin devTopPsi devEpoxyPsi
      beamDevLeftType beamDevRightType anchorageLeft anchorageRight beamLapStart beamLapEnd beamLapLength beamLapClass botBar1No
      botBar1N botBar2No botBar2N botBar3No botBar3N topBar1No topBar1N topBar2No topBar2N topBar3No topBar3N skinNo nSkin stirrup legs
      stirS MuPos MuNeg Vu Pu Tu Ve torsionDesignStatus torsionAtPerS torsionAl sensitive enableExactDefl MaPos MaNeg autoMa xiTime
      deflLimit colW smrfMnMin firstHoopDist beamJointTarget beamJointMprFactor beamForceCandidateConfirm`,
    classes: `active badge-seismic banner-key banner-status big btn-calc btn-secondary canvas-wrap card checkbox-row combo container
      deep-beam-notice force-candidate-actions force-candidate-card force-candidate-confirm force-candidate-list force-candidate-summary
      form-group form-row form-row3 hint label lbl line main-layout mode-bar mode-bar__action mode-bar__actions mode-bar__btn
      mode-bar__file mode-bar__group mode-bar__hint mode-bar__label mode-bar__proj mode-bar__project-status mode-bar__report mode-btn
      page-only-case-tools page-only-tool-chrome preset-row rc-direct-print-boundary rc-formal-output-page rebar-hero rebar-layer
      rebar-range-wrap rebar-stack rebar-stack-actions report-readiness-card result-item results-grid scope-badge section-tabs
      steps-body steps-card subpanel tool-chrome-slot unit value w-des w-name w-no`,
  },
  {
    file: '結構工具箱/tools/風力/wind-kzt.html',
    body: '<body data-family="wind">',
    boundary: null,
    maxInlineStyleLines: 8,
    loadsWorkflow: false,
    primary: [
      { label: '計算 Kzt', match: node => node.attrs.id === 'btnCalc' },
      { label: '列印頁面結果', match: node => hasClass(node, 'mode-bar__report') },
    ],
    firstEngineeringInput: 'topoType',
    collapsedIds: [],
    ids: `H Lh adoptTable btnCalc chkDetail kztReportReadiness kztResult pK1 pK2 pK3 projDesigner projName projNo resultPanel steps
      stepsCard terrainGrp topoHint topoSvg topoType x z`,
    controls: 'projName projNo projDesigner topoType terrainGrp H Lh x z chkDetail',
    classes: `badge-v blocked btn-calc btn-print card chk-detail container form-group form-row hint info-pill kzt-result legend
      main-layout mode-bar mode-bar__label mode-bar__proj mode-bar__report note page-only-report-status page-only-tool-chrome print-meta
      report-readiness tool-chrome-slot topo-svg w-des w-name w-no zone`,
  },
  {
    file: '結構工具箱/tools/cable-tension/cable-tension-frequency.html',
    body: '<body class="local-quick-output-page" data-family="local-quick">',
    boundary: '<div class="local-quick-direct-print-boundary" aria-hidden="true">',
    maxInlineStyleLines: 4,
    loadsWorkflow: true,
    primary: [
      { label: '反算鋼索索力', match: node => node.attrs.id === 'btnCalc' },
      { label: '列印計算書', match: node => node.attrs.id === 'btnPrint' },
    ],
    firstEngineeringInput: 'effectiveLengthM',
    collapsedIds: ['btnImportJson', 'btnSaveProject', 'btnSaveDraft', 'btnLoadDraft', 'btnReset', 'jsonFile', 'jsonStatus'],
    ids: `assumptionConfirmed bannerStatus btnAddMeasurement btnCalc btnImportJson btnJson btnLoadDraft btnPrint btnReset btnSaveDraft
      btnSaveProject cableTensionDiagram cableTensionReportReadiness checkList coreVersion effectiveLengthBasis effectiveLengthM
      frequencyBasis harmonicToleranceBasis harmonicTolerancePct jsonFile jsonStatus massBasis massPerLengthKgM measurementRows
      metricGrid projDesigner projName projNo reportMode sensitivityResult sensitivityTitle stepBody targetTensionBasis targetTensionKn
      targetTolerancePct`,
    controls: `projName projNo projDesigner jsonFile effectiveLengthM massPerLengthKgM harmonicTolerancePct harmonicToleranceBasis
      effectiveLengthBasis massBasis frequencyBasis targetTensionKn targetTolerancePct targetTensionBasis assumptionConfirmed reportMode`,
    classes: `banner-status btn btn-danger btn-primary btn-secondary cable-tension-shell card case-actions case-card check-list
      confirm-row diagram-wrap field form-grid formula-list hero hero-meta json-status local-quick-direct-print-boundary
      local-quick-output-page main-layout measure-table metrics muted output-actions page page-only-report-status page-only-tool-chrome
      scope-box section-title span-3 stack table-wrap tag tool-chrome-slot warning-box`,
  },
];
const PROJECT_FIELDS = ['projName', 'projNo', 'projDesigner'];

/* ---------- 迷你 HTML 樹（靜態標記；script/style 內容與註解不入樹） ---------- */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function parseAttrs(text) {
  const attrs = {};
  for (const m of text.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return attrs;
}
function parseHtml(html) {
  const source = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2')
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, '$1$2');
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  const stack = [root];
  let order = 0;
  for (const m of source.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g)) {
    const [, closing, rawTag, attrText, selfClosing] = m;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const at = stack.map(node => node.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const node = { tag, attrs: parseAttrs(attrText), children: [], parent: stack.at(-1), order: order++ };
    stack.at(-1).children.push(node);
    if (!VOID.has(tag) && !selfClosing) stack.push(node);
  }
  return root;
}
function* walk(node) { for (const child of node.children) { yield child; yield* walk(child); } }
const classesOf = node => words(node.attrs.class || '');
const hasClass = (node, name) => classesOf(node).includes(name);
const all = (root, predicate) => [...walk(root)].filter(predicate);
const byId = (root, id) => all(root, node => node.attrs.id === id);
const ancestors = node => { const list = []; for (let p = node.parent; p; p = p.parent) list.push(p); return list; };
const within = (node, container) => ancestors(node).includes(container);

/* ---------- 1. tool-shell.css ---------- */
const shell = read(SHELL);
const shellBody = shell.replace(/\/\*[\s\S]*?\*\//g, '');
assert.equal(/@import/i.test(shellBody), false, 'tool-shell.css must not use @import');
assert.deepEqual([...shellBody.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(m => m[0]), [], 'tool-shell.css has no hardcoded hex colours');
assert.equal(/\b(?:rgba?|hsla?)\s*\(/i.test(shellBody), false, 'tool-shell.css has no literal rgb()/hsl() colours');
assert.equal(/https?:\/\//i.test(shellBody), false, 'tool-shell.css has no remote URL');
const tokenNames = new Set([...read(TOKENS).matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
const undefinedTokens = [...new Set([...shellBody.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1]))].filter(name => !tokenNames.has(name));
assert.deepEqual(undefinedTokens, [], 'tool-shell.css only uses tokens defined in colors_and_type.css');
assert.equal(/(^|[;{\s])--[\w-]+\s*:/.test(shellBody), false, 'tool-shell.css defines no new custom properties (single token source)');
{
  // 頂層只允許 @media screen／print 區塊：版面規則不得外溢到列印或計算書。
  let depth = 0;
  let statement = '';
  const topLevel = [];
  for (const char of shellBody) {
    if (char === '{') { if (depth === 0) topLevel.push(statement.trim()); depth += 1; statement = ''; continue; }
    if (char === '}') { depth -= 1; statement = ''; continue; }
    if (depth === 0) statement += char;
  }
  assert.equal(depth, 0, 'tool-shell.css braces are balanced');
  assert.ok(topLevel.length > 0, 'tool-shell.css has rules');
  for (const prelude of topLevel) assert.match(prelude, /^@media\s+(?:screen(?:\s+and\s+\([^)]*\))*|print)$/, `tool-shell.css top-level block must be @media screen/print: ${prelude}`);
  const printBlock = shellBody.match(/@media\s+print\s*\{([\s\S]*?\})\s*\}/);
  assert.ok(printBlock, 'tool-shell.css has a print block');
  assert.match(printBlock[1], /\.tool-shell-case__more/, 'print hides the collapse toggle');
  assert.match(printBlock[1], /\.tool-shell-actions/, 'print hides the primary action bar');
  const outsidePrint = shellBody.replace(printBlock[0], '');
  assert.equal(outsidePrint.includes('!important'), false, 'screen rules do not use !important');
}
const mobileBlock = shellBody.match(/@media\s+screen\s+and\s+\(max-width:\s*768px\)\s*\{([\s\S]*)\}\s*@media\s+print/);
assert.ok(mobileBlock, 'tool-shell.css has the 768px mobile block before the print block');
assert.match(mobileBlock[1], /\.tool-shell-actions\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*0;/, 'mobile primary actions are fixed to the viewport bottom (no runtime insertion, no layout shift)');
assert.match(mobileBlock[1], /header\.tool-shell-header h1\s*\{[^}]*white-space:\s*nowrap;/, 'mobile header title stays on one line');
assert.match(shellBody, /\.tool-shell-case-zone:has\(\.tool-shell-case__more:not\(\[open\]\)\)\s*>\s*:is\(\.project-storage-bar,\s*\.project-meta-profile-bar\)\s*\{\s*display:\s*none;/, 'collapsed case zone hides runtime storage/profile bars');

/* ---------- 2. 全站不得以 @import 載入 tool-shell.css ---------- */
{
  const { spawnSync } = require('node:child_process');
  const listed = spawnSync('git', ['-c', 'core.quotepath=false', 'grep', '-l', '-E', '@import[^;]*tool-shell', '--', '*.css', '*.html'], { cwd: repoRoot, encoding: 'utf8' });
  assert.ok(listed.status === 0 || listed.status === 1, 'git grep for @import of tool-shell.css ran');
  assert.equal(listed.stdout.trim(), '', `tool-shell.css must be linked, never @import-ed: ${listed.stdout.trim()}`);
}

/* ---------- 3. 三頁 ---------- */
for (const page of PAGES) {
  const label = page.file;
  const html = read(page.file);
  const root = parseHtml(html);

  // 3a. <link> 載入：恰一次、在 <head>、為最後一個樣式表、在頁面內嵌 <style> 之前
  const head = html.slice(0, html.indexOf('</head>'));
  const links = [...head.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/g)].map(m => ({
    index: m.index,
    target: path.relative(repoRoot, path.resolve(path.dirname(abs(page.file)), m[1].split('?')[0])).replace(/\\/g, '/'),
  }));
  const shellLinks = links.filter(link => link.target === SHELL);
  assert.equal(shellLinks.length, 1, `${label}: links ${SHELL} exactly once in <head>`);
  assert.equal(html.split('tool-shell.css').length - 1, 1, `${label}: tool-shell.css referenced once`);
  assert.equal(links.at(-1).target, SHELL, `${label}: tool-shell.css is the last stylesheet link (after shared sheets incl. family-theme)`);
  const firstStyle = head.search(/<style\b/i);
  assert.ok(firstStyle < 0 || shellLinks[0].index < firstStyle, `${label}: tool-shell.css precedes the page inline <style> (page keeps the last word)`);
  assert.equal(/@import[^;]*tool-shell/.test(html), false, `${label}: no @import of tool-shell.css`);

  // 3b. 列印邊界、body、頂欄占位、profile 位置不得動
  assert.equal(html.match(/<body\b[^>]*>/)[0], page.body, `${label}: body tag unchanged`);
  if (page.boundary) assert.equal(html.split(page.boundary).length - 1, 1, `${label}: direct-print boundary unchanged`);
  const bodyTag = html.match(/<body\b[^>]*>/);
  assert.match(html.slice(bodyTag.index + bodyTag[0].length), /^\s*<div class="tool-chrome-slot page-only-tool-chrome" data-tool-chrome-slot><\/div>/, `${label}: tool-chrome slot stays the first body child`);
  const bodyEnd = html.lastIndexOf('</body>');
  assert.ok(bodyEnd - html.lastIndexOf('project-meta-profile.js') <= 200, `${label}: project-meta-profile.js stays within 200 chars of </body>`);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m => m[1]);
  assert.match(scripts.at(-1), /project-meta-profile\.js$/, `${label}: project-meta-profile.js stays the last script`);

  // 3c. 頁首壓縮、舊回主選單移除
  const headers = all(root, node => node.tag === 'header');
  assert.equal(headers.length, 1, `${label}: one page header`);
  assert.ok(hasClass(headers[0], 'tool-shell-header'), `${label}: header uses .tool-shell-header`);
  assert.equal(all(headers[0], node => hasClass(node, 'tool-shell-header__sub')).length, 1, `${label}: header has one secondary subtitle`);
  // 直接列印封鎖說明（aria-hidden）內的 h1 不算頁面標題。
  assert.equal(all(root, node => node.tag === 'h1' && !ancestors(node).some(parent => parent.attrs['aria-hidden'] === 'true')).length, 1, `${label}: one page h1`);
  assert.equal(html.includes('回主選單'), false, `${label}: legacy back-to-menu text removed`);
  assert.equal(all(root, node => node.tag === 'a' && hasClass(node, 'back')).length, 0, `${label}: legacy a.back removed`);

  // 3d. 主要動作：恰兩顆主要按鈕
  const bars = all(root, node => hasClass(node, 'tool-shell-actions'));
  assert.equal(bars.length, 1, `${label}: one primary action bar`);
  const buttons = all(bars[0], node => node.tag === 'button');
  assert.equal(buttons.length, 2, `${label}: primary action bar holds exactly two buttons`);
  page.primary.forEach((spec, index) => assert.ok(spec.match(buttons[index]), `${label}: primary button ${index + 1} is ${spec.label}`));
  const calcButtons = all(root, node => node.tag === 'button' && (hasClass(node, 'btn-calc') || node.attrs.id === 'btnCalc'));
  assert.equal(calcButtons[0], buttons[0], `${label}: the first calculate button in document order is the primary one`);
  const firstInput = byId(root, page.firstEngineeringInput)[0];
  assert.ok(firstInput, `${label}: first engineering input exists`);
  assert.ok(buttons[0].order < firstInput.order, `${label}: primary actions precede the first engineering input (desktop: above the form)`);

  // 3e. 案件表頭：三欄一列、不收合；收合區只放存讀檔類 id 且預設關閉
  const caseRows = all(root, node => hasClass(node, 'tool-shell-case'));
  assert.equal(caseRows.length, 1, `${label}: one case row`);
  const fieldsBox = all(caseRows[0], node => hasClass(node, 'tool-shell-case__fields'));
  assert.equal(fieldsBox.length, 1, `${label}: case row has one fields group`);
  const details = all(caseRows[0], node => node.tag === 'details' && hasClass(node, 'tool-shell-case__more'));
  assert.equal(details.length, 1, `${label}: case row has one collapsible details`);
  assert.equal('open' in details[0].attrs, false, `${label}: case details collapsed by default`);
  assert.ok(details[0].children[0]?.tag === 'summary', `${label}: details starts with a summary`);
  for (const id of PROJECT_FIELDS) {
    const field = byId(root, id)[0];
    assert.ok(field && within(field, fieldsBox[0]), `${label}: #${id} sits in the case fields row`);
    assert.equal(ancestors(field).some(node => node.tag === 'details'), false, `${label}: #${id} is never collapsed`);
  }
  assert.ok(caseRows[0].order < firstInput.order, `${label}: case row precedes the inputs`);
  const collapsed = all(details[0], node => node.attrs.id).map(node => node.attrs.id);
  assert.deepEqual(collapsed.filter(id => !page.collapsedIds.includes(id)), [], `${label}: only case-file controls may be collapsed`);
  assert.deepEqual([...page.collapsedIds].sort(), [...collapsed].sort(), `${label}: collapsed case-file controls match the inventory`);

  // 3f. 執行期插入點（project-storage.js／project-meta-profile.js／tool-workflow-adapters.js 只認 class）
  const modeBars = all(root, node => hasClass(node, 'mode-bar'));
  assert.ok(modeBars.length >= 1, `${label}: has a .mode-bar anchor`);
  const storageBars = all(root, node => hasClass(node, 'project-storage-bar'));
  if (page.loadsWorkflow) {
    assert.ok(modeBars[0].order > firstInput.order, `${label}: first .mode-bar sits after the inputs, so runtime panels insert below the first screen`);
    assert.ok(hasClass(modeBars[0], 'tool-shell-dock'), `${label}: .mode-bar anchor is the output dock`);
    assert.equal(storageBars.length, 1, `${label}: one static .project-storage-bar`);
    assert.ok(within(storageBars[0], details[0]), `${label}: shared-header bar anchor sits inside the collapsed case details`);
  } else {
    assert.equal(storageBars.length, 0, `${label}: no static .project-storage-bar (runtime project-storage.js must still bind)`);
    const zone = all(root, node => hasClass(node, 'tool-shell-case-zone'));
    assert.equal(zone.length, 1, `${label}: one case zone`);
    assert.ok(within(modeBars[0], zone[0]) && modeBars[0] === caseRows[0], `${label}: the print-meta .mode-bar card is the case row inside the zone`);
    assert.ok(hasClass(modeBars[0], 'print-meta'), `${label}: print-meta card kept for page printing`);
    assert.equal(zone[0].children.at(-1), modeBars[0], `${label}: runtime bars insert directly after the case card, inside the zone`);
  }

  // 3g. 凍結 id／控制項順序／class
  const staticIds = all(root, node => node.attrs.id).map(node => node.attrs.id);
  assert.equal(new Set(staticIds).size, staticIds.length, `${label}: static ids are unique`);
  assert.deepEqual([...staticIds].sort(), words(page.ids).sort(), `${label}: static ids equal the HEAD 6958a2dd inventory`);
  const controls = all(root, node => ['input', 'select', 'textarea'].includes(node.tag) && node.attrs.id).map(node => node.attrs.id);
  assert.deepEqual(controls, words(page.controls), `${label}: form-control document order unchanged (JSON field order)`);
  const classes = new Set(all(root, node => node.attrs.class).flatMap(classesOf));
  assert.deepEqual(words(page.classes).filter(name => !classes.has(name)), [], `${label}: every HEAD class is still present`);
  const inlineStyleLines = html.split('\n').filter(line => line.includes('style="')).length;
  assert.ok(inlineStyleLines <= page.maxInlineStyleLines, `${label}: inline style lines ${inlineStyleLines} <= ${page.maxInlineStyleLines}`);
}

/* ---------- 4. 頁面專項 ---------- */
{
  const beam = parseHtml(read('鋼筋混凝土/tools/beam.html'));
  const inputbar = all(beam, node => hasClass(node, 'tool-shell-inputbar'));
  assert.equal(inputbar.length, 1, 'beam: one input first row');
  const group = all(beam, node => hasClass(node, 'mode-bar__group'))[0];
  assert.ok(within(group, inputbar[0]), 'beam: design/check switch lives in the input first row');
  assert.equal(ancestors(group).some(node => hasClass(node, 'card')), false, 'beam: design/check switch no longer occupies a card');
  assert.ok(inputbar[0].order < byId(beam, 'mainTabs')[0].order, 'beam: input first row precedes the section tabs');
  assert.ok(hasClass(byId(beam, 'btnPrintReport')[0], 'secondary'), 'beam: direct print demoted to secondary');
}
{
  const kztHtml = read('結構工具箱/tools/風力/wind-kzt.html');
  const kzt = parseHtml(kztHtml);
  for (const id of ['topoType', 'terrainGrp', 'H', 'Lh', 'x', 'z']) {
    assert.equal(all(kzt, node => node.tag === 'label' && node.attrs.for === id).length, 1, `kzt: #${id} has a <label for>`);
  }
  const adopt = byId(kzt, 'adoptTable')[0];
  assert.equal(adopt.attrs.tabindex, '0', 'kzt: scrollable adopt table is keyboard focusable');
  assert.ok(adopt.attrs['aria-label'], 'kzt: scrollable adopt table has an accessible name');
  // axe 對比不足的兩處（版本徽章、逐步計算重點值）改用 token；列印規則另以 !important 覆寫，紙本不變。
  const inlineCss = (kztHtml.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';
  const inlineRules = [...inlineCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selector: m[1].trim(), body: m[2] }));
  for (const selector of ['.badge-v', '.step-body .val.hl']) {
    const rule = inlineRules.find(item => item.selector === selector);
    assert.ok(rule, `kzt: inline rule ${selector} exists`);
    assert.equal(/#[0-9a-f]{3,8}\b/i.test(rule.body), false, `kzt: ${selector} uses tokens instead of inline hex`);
    assert.match(rule.body, /var\(--/, `kzt: ${selector} uses a design token`);
  }
  const printMeta = all(kzt, node => hasClass(node, 'print-meta'))[0];
  assert.ok(all(printMeta, node => hasClass(node, 'mode-bar__label')).length === 1 && all(printMeta, node => hasClass(node, 'mode-bar__proj')).length === 1, 'kzt: print-meta keeps label + project fields');
  const leftColumn = all(kzt, node => hasClass(node, 'main-layout'))[0].children[0];
  assert.ok(within(all(kzt, node => hasClass(node, 'tool-shell-actions'))[0], leftColumn), 'kzt: action bar sits in the print-hidden input column');
  assert.ok(within(byId(kzt, 'kztReportReadiness')[0], leftColumn), 'kzt: page-only readiness moved into the input column');
  assert.ok(hasClass(all(kzt, node => hasClass(node, 'btn-print'))[0], 'tool-shell-secondary'), 'kzt: duplicate print button demoted to secondary');
}
{
  const cable = parseHtml(read('結構工具箱/tools/cable-tension/cable-tension-frequency.html'));
  const stack = all(cable, node => hasClass(node, 'stack'))[0];
  const dock = all(cable, node => hasClass(node, 'tool-shell-dock'))[0];
  assert.equal(stack.children.at(-1), dock, 'cable: output dock (.mode-bar) is the last item of the input stack');
  const readiness = byId(cable, 'cableTensionReportReadiness')[0];
  assert.equal(all(cable, node => hasClass(node, 'page-only-report-status'))[0], readiness, 'cable: readiness stays the first .page-only-report-status');
  assert.ok(within(byId(cable, 'btnJson')[0], dock) && within(byId(cable, 'reportMode')[0], dock), 'cable: JSON export and report mode stay in the output dock');
  // ④ 卡加上 .mode-bar 只為執行期插入點；core/style.css 的 .mode-bar 橫列版面須由頁面樣式還原為區塊。
  assert.ok(read('結構工具箱/tools/cable-tension/cable-tension-frequency.html').includes('.tool-shell-dock.mode-bar{display:block}'), 'cable: output dock keeps block layout despite .mode-bar');
}

console.log(`tool-shell contract OK (${PAGES.length} pages; ${SHELL})`);
