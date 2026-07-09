/* shear-wall.html 回歸測試 (輕量 node, 無 playwright)。
 * 載入共用模組 (concrete/rebar/common/wall/pmsection) 至 vm，
 * 做：① 源碼結構守衛 ② PMSection/Wall 數值黃金案例。
 * 執行：node 鋼筋混凝土/tools/shear-wall-regression.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const swHtmlPath = path.join(__dirname, 'shear-wall.html');
const concretePath = path.join(ROOT, '..', '結構工具箱', 'core', 'materials', 'concrete.js');
const rebarPath = path.join(ROOT, '..', '結構工具箱', 'core', 'materials', 'rebar.js');
const commonPath = path.join(ROOT, 'shared', 'common.js');
const wallPath = path.join(ROOT, 'shared', 'wall.js');
const loadCasesPath = path.join(ROOT, 'shared', 'loadcases.js');
const wallBasePath = path.join(ROOT, 'shared', 'wall-base.js');
const wallEvaluatorPath = path.join(ROOT, 'shared', 'wall-evaluator.js');
const pmPath = path.join(ROOT, 'shared', 'pmsection.js');

function bootLibs() {
  const context = { console, Math };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [concretePath, rebarPath, commonPath, wallPath, pmPath, wallBasePath]) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return context;
}

let failed = 0;
function assert(pass, title, detail) {
  if (!pass) { failed++; console.error(`FAIL | ${title} :: ${detail}`); }
  else console.log(`PASS | ${title} | ${detail}`);
}
function near(a, b, rel, title) {
  const tol = Math.abs(b) * (rel == null ? 0.02 : rel) + 1e-6;
  assert(Math.abs(a - b) <= tol, title, `got=${a} expect=${b} tol=${tol.toFixed(3)}`);
}
function section(t) { console.log(`\n## ${t}`); }

// 與 shear-wall.html buildWallBars 對齊之縱筋分布
function buildWallBars(g, REBAR_TABLE) {
  const bars = [];
  const aBE = REBAR_TABLE[g.dBE].area, aV = REBAR_TABLE[g.dV].area;
  const rowsBE = Math.max(1, Math.round(g.nBE / 2));
  const AsRowBE = (g.nBE * aBE) / rowsBE;
  const y0 = g.cover, y1 = Math.max(g.cover + 0.1, g.lbe - g.cover);
  for (let k = 0; k < rowsBE; k++) {
    const yy = rowsBE === 1 ? (y0 + y1) / 2 : y0 + (y1 - y0) * k / (rowsBE - 1);
    bars.push({ y: yy, As: AsRowBE }); bars.push({ y: g.lw - yy, As: AsRowBE });
  }
  const webStart = g.lbe, webEnd = g.lw - g.lbe, AsRowWeb = g.nLayer * aV;
  if (webEnd > webStart && g.sV > 0) {
    const nWeb = Math.max(0, Math.round((webEnd - webStart) / g.sV));
    for (let i = 0; i < nWeb; i++) bars.push({ y: webStart + (i + 0.5) * (webEnd - webStart) / nWeb, As: AsRowWeb });
  }
  return bars;
}

function main() {
  const html = fs.readFileSync(swHtmlPath, 'utf8');
  const wallSrc = fs.readFileSync(wallPath, 'utf8');
  const loadCasesSrc = fs.readFileSync(loadCasesPath, 'utf8');
  const wallBaseSrc = fs.readFileSync(wallBasePath, 'utf8');
  const wallEvaluatorSrc = fs.readFileSync(wallEvaluatorPath, 'utf8');
  const libs = bootLibs();
  const { Wall, PMSection, Concrete, Rebar, WallBase } = libs;
  const { REBAR_TABLE } = Rebar;

  section('源碼結構守衛');
  // GitHub Pages 相對路徑 (絕對路徑會 404 — 見 feedback-github-pages-relative-paths)
  assert(html.includes('src="../shared/pmsection.js'), '載入共用 P-M 模組 (相對路徑)', 'pmsection.js relative');
  assert(html.includes('src="../shared/wall.js'), '載入共用牆模組 (相對路徑)', 'wall.js relative');
  assert(html.includes('src="../shared/loadcases.js'), '載入共用多工況模組 (相對路徑)', 'loadcases.js relative');
  assert(html.includes('src="../shared/wall-base.js'), '載入共用剪力牆 base 組裝模組 (相對路徑)', 'wall-base.js relative');
  assert(html.includes('src="../shared/wall-evaluator.js'), '載入共用剪力牆工況檢核模組 (相對路徑)', 'wall-evaluator.js relative');
  assert(html.includes('src="../../結構工具箱/core/materials/concrete.js"'), '載入材料模組 (相對路徑)', 'concrete.js relative');
  assert(!/src="\/結構工具箱|src="\/鋼筋混凝土/.test(html), '無絕對路徑腳本', 'no absolute /結構工具箱 or /鋼筋混凝土 src');
  assert(html.includes('href="../index.html"'), '返回連結為相對路徑', 'back link relative');
  // 分頁與關鍵 id
  ['data-tab="pm"', 'data-tab="shear"', 'data-tab="detail"'].forEach(t =>
    assert(html.includes(t), `具分頁 ${t}`, 'tab present'));
  ['id="pmSvg"', 'id="sectionSvg"', 'id="r-phiMn"', 'id="c-shear"', 'id="s-sbeReq"', 'id="r-rhol"', 'id="caseJson"',
   'id="r-phiShear"', 'id="r-Ve"', 'id="r-scope"', 'id="r-geomModel"', 'id="c-sbeLength"', 'id="c-sbeBWidth"', 'id="c-sbeHx"', 'id="c-sbeAsh"', 'id="c-sbeSp"', 'id="dTie"',
   'id="jointSurface"', 'id="d-shearFricMu"', 'id="d-shearFricAvfReq"', 'id="d-shearFricAvfProv"', 'id="d-shearFricVnMax"', 'id="loadCasesText"', 'id="loadCaseSummary"'].forEach(id =>
    assert(html.includes(id), `具結果節點 ${id}`, 'id present'));
  ['id="loadCaseEditor"', 'id="btnSyncLoadCaseEditor"', 'id="btnAddCurrentLoadCase"', 'id="btnClearLoadCases"'].forEach(id =>
    assert(html.includes(id), `具多工況表格編輯節點 ${id}`, 'load case editor id present'));
  assert(html.includes('21.2.4.1'), '剪力 φ 引用 21.2.4.1', 'shear phi clause');
  assert(html.includes('18.7.3.1'), '設計剪力引用 18.7.3.1', 'design shear clause');
  assert(html.includes('18.7.6.4'), 'SBE 圍束筋引用 18.7.6.4', 'SBE confinement clause');
  assert(wallSrc.includes('Wall.designShear'), '共用牆模組提供 18.7.3 設計剪力函式', 'Wall.designShear present');
  assert(wallSrc.includes('Wall.shearFrictionDesign') && wallSrc.includes('Wall.shearFrictionVnMax'), '共用牆模組提供 22.9 剪摩擦初估函式', 'Wall.shearFrictionDesign present');
  assert(loadCasesSrc.includes('LoadCases.parseText') && loadCasesSrc.includes('LoadCases.pickControls') && loadCasesSrc.includes('LoadCases.result'), '共用多工況模組提供解析與控制工況函式', 'LoadCases shared present');
  assert(wallBaseSrc.includes('WallBase.buildBase') && wallBaseSrc.includes('WallBase.buildBars') && wallBaseSrc.includes('WallBase.geometry'), '共用剪力牆 base 模組提供幾何、配筋與容量組裝', 'WallBase shared present');
  assert(wallEvaluatorSrc.includes('WallEvaluator.evaluateLoadCase') && wallEvaluatorSrc.includes('WallEvaluator.nominalMomentAtPu') && wallEvaluatorSrc.includes('WallEvaluator.reviewWarnings'), '共用剪力牆工況檢核模組提供工況判定、Mn 內插與待確認事項', 'WallEvaluator shared present');
  assert(!/18\.10\s*章|18\.10\.6/.test(`${html}\n${wallSrc}`), '剪力牆頁面與共用模組不再誤用基礎章作為牆章', 'no stale foundation clause');
  assert(html.includes('reviewWarnings'), '待確認事項納入整體結論', 'reviewWarnings present');
  assert(html.includes('function updateShearWallAttachmentReadiness'), '剪力牆頁面列出附件 readiness', 'page-only readiness helper present');
  assert(html.includes('id="shearWallAttachmentReadiness"'), '剪力牆具附件 readiness 目標', 'readiness target present');
  assert(html.includes('RCUI.renderAttachmentReadiness'), '剪力牆使用共用 readiness renderer', 'shared readiness helper present');
  assert(html.includes('window.RCUI.normalizeProjectFieldValue'), '剪力牆使用共用專案欄位正規化 helper', 'shared project normalizer present');
  const buildReportSrc = html.slice(html.indexOf('function buildReport'), html.indexOf('function svgToDataURL'));
  assert(buildReportSrc.includes('summary:false'), '剪力牆計算書關閉頂部狀態 summary', 'report summary false');
  assert(html.includes("projectName: window.RCUI.normalizeProjectFieldValue($('projName')?.value)"), '剪力牆專案 payload 會清除 placeholder 案名', 'project storage metadata normalized');
  assert(!buildReportSrc.includes("$('projName').value.trim()"), '剪力牆計算書不直接輸出 placeholder 專案欄位', 'report project header normalized');
  assert(!buildReportSrc.includes('RCUI.buildReviewCheckGroup'), '剪力牆計算書不輸出待確認總覽群組', 'review overview stays page-only');
  assert(!buildReportSrc.includes('不列為 OK 結論'), '剪力牆計算書排除總覽判定文案', 'no page-only verdict wording in report');
  assert(html.includes('const SHEAR_WALL_PROJECT_SCHEMA = \'rc-shear-wall-project-v1\''), '剪力牆專案存檔 schema 存在', 'rc-shear-wall-project-v1');
  assert(html.includes('id="btnSaveShearWallProject"') && html.includes('id="btnLoadShearWallProject"'), '剪力牆具專案檔案存讀按鈕', 'save/load buttons present');
  assert(html.includes('id="btnSaveShearWallDraft"') && html.includes('id="btnLoadShearWallDraft"'), '剪力牆具瀏覽器暫存按鈕', 'draft buttons present');
  assert(html.includes('rc.shearWall.project.draft'), '剪力牆具 localStorage 暫存 key', 'draft key present');
  assert(html.includes('function collectShearWallProjectData()'), '剪力牆可收集專案 payload', 'collect helper exists');
  assert(html.includes('function applyShearWallProjectData(raw'), '剪力牆可套用專案 payload', 'apply helper exists');
  assert(html.includes('SHEAR_WALL_PROJECT_EXCLUDED_IDS') && html.includes('caseJson'), '剪力牆專案排除案例 JSON 工作區', 'case textarea excluded');
  assert(html.includes('待確認 — ${reviewWarnings.length} 項需補充設計或圖說確認'), '摘要 banner 顯示待確認數量', 'summary banner pending-review count present');
  assert(html.includes('id="summaryWarnings"') && html.includes('function updateSummaryPanel') && html.includes('待確認事項 ${index + 1}'), '摘要頁直接列出待確認事項明細', 'summary warning details present');
  assert(html.includes('scopeSingleWall') && html.includes('scopeNoOpening') && html.includes('scopeAnalysisReady'), '適用範圍假設可輸入與匯出', 'scope assumptions present');
  assert(html.includes('適用範圍與模型邊界'), '計算書列出適用範圍與模型邊界', 'scope report group present');
  assert(html.includes('開口牆') && html.includes('連肢牆'), '超出單片實牆範圍之限制明確揭露', 'scope limitations present');
  assert(html.includes('geomModelOk') && wallBaseSrc.includes('2ℓbe 需小於 ℓw') && wallBaseSrc.includes('cover 需小於 tw/2'), '幾何模型退化納入共用 base 硬檢核', 'geometry consistency guard present');
  assert(html.includes('shearPhiMode') && wallEvaluatorSrc.includes('Vmn=Ve·Mn/Mu 不適用') && wallEvaluatorSrc.includes('Mu≤0 或 Mn@Pu≤0'), '零彎矩剪力 φ 判定不輸出 Mn/0 假公式', 'zero moment shear phi guard present');
  assert(html.includes('pmAxialOk') && html.includes('Pu超出軸力封包') && html.includes('Pu 超出 P-M 封包，c@Pu 不採用'), 'P-M 軸力越界不得採用 φMn/c@Pu', 'pm axial range guard present');
  assert(html.includes('c@Pu 不採用，需求長度須另行確認') && html.includes('c@Pu 不採用，b≥30 觸發條件須另行確認'), 'P-M 軸力越界時 SBE 長度與深中性軸限制改列待確認', 'sbe c unusable guard present');
  assert(html.includes('Math.abs(Number(demand.M)') && html.includes('Pu超出軸力範圍') && html.includes('data-role="pm-demand"'), 'P-M 圖以 |Mu| 標示且區分軸力越界', 'pm diagram demand guard present');
  assert(html.includes('φPn,max 上限') && html.includes('標記=需求點 (|Mu|, Pu)'), 'P-M 報表揭露 φPn,max 上限與 |Mu| 圖說', 'pm report cap guard present');
  assert(html.includes("value: isFinite(r.pmUtil)?r.pmUtil.toFixed(2):'不適用'"), 'P-M 報表非有限利用率列為不適用', 'no infinity in report utilization');
  assert(html.includes('designSuggestionReady') && html.includes('暫不輸出可採用間距') && html.includes('設計建議可列性'), '設計建議模式不在模型越界時輸出可採用配筋建議', 'design suggestion boundary guard present');
  assert(html.includes('需先處理：${issueText}') && html.includes('需先處理阻斷條件'), '設計建議阻斷時列出具體待處理條件', 'design suggestion blocker wording present');
  assert(html.includes('rhotShearReq') && html.includes('剪力需求控制') && html.includes('ρt,req=max(ρt,min'), '設計建議橫筋納入實際剪力需求', 'demand-based horizontal suggestion present');
  assert(html.includes('suggestFlexuralBoundary') && html.includes('P-M 初估調整方向') && html.includes('候選搜尋：增加邊界縱筋號數'), 'P-M 彎矩不足時列出邊界配筋初估方向', 'flexural suggestion guard present');
  assert(html.includes('附帶檢核') && html.includes('blockerCount') && html.includes('SBE水平ℓbe'), 'P-M 候選列出 SBE 與細部附帶檢核', 'flexural suggestion follow-up guard present');
  assert(html.includes('btnApplyFlexSuggestion') && html.includes('applyFlexSuggestion') && html.includes("setFieldValue('nBE'"), 'P-M 候選可一鍵回填並重新檢核', 'flexural suggestion apply guard present');
  assert(html.includes('inlineShearFricSugg') && html.includes('shearFricAvfReq') && html.includes('fy_sf'), '施工縫剪摩擦初估列入 UI 與計算書', 'shear friction design guidance present');
  assert(html.includes('LoadCases.parseText') && html.includes('evaluateLoadCase') && html.includes('多組載重工況控制'), '多組載重工況可逐組檢核並輸出控制摘要', 'multi load case control present');
  assert(html.includes('renderLoadCaseEditor') && html.includes('syncLoadCasesFromEditor') && html.includes('LoadCases.toText'), '多組載重工況具表格化編輯與清單同步', 'load case table editor present');
  assert(!html.includes('function parseLoadCasesText') && !html.includes('function loadCasesToText'), '多工況純資料處理已移出頁面', 'no duplicate load case parser in html');
  assert(html.includes('WallBase.buildBase'), '頁面使用共用剪力牆 base 組裝核心', 'page uses shared base builder');
  assert(!/function\s+(?:barArea|barDia|buildWallBars|webVerticalBarCount)\s*\(/.test(html), '頁面不再內嵌鋼筋分布 helper', 'no duplicate bar helpers in html');
  assert(html.includes('const candBase = WallBase.buildBase(cg, { pmSteps: 90 })'), 'P-M 邊界建議候選使用共用 base builder', 'flexural suggestion uses WallBase');
  assert(!html.includes('sbeSpLimitCand') && !html.includes('AshReqCand') && !html.includes('AshProvCand') && !html.includes('PMSection.curve({ b: cg'), 'P-M 邊界建議不重算 P-M/SBE/Ash 基礎量', 'no duplicate flexural candidate base formulas');
  assert(html.includes("WallEvaluator.evaluateLoadCase(r, currentLoadCaseFromInputs('主工況'))") && html.includes('WallEvaluator.evaluateLoadCase(base, c)'), '頁面主工況與多工況皆使用共用剪力牆工況檢核核心', 'page uses shared evaluator');
  assert(!/function\s+evaluateLoadCase\s*\(/.test(html) && !/function\s+nominalMomentAtPu\s*\(/.test(html) && !html.includes('WallEvaluator.nominalMomentAtPu'), '頁面不再內嵌或直接呼叫工況檢核與 Mn 內插核心', 'no duplicate wall evaluator in html');
  assert(!html.includes('Wall.designShear({') && !html.includes('Wall.shearFrictionDesign({') && !html.includes('Wall.needTwoLayer({'), '頁面不再重算主工況剪力與剪摩擦核心公式', 'no duplicate primary demand formulas');
  assert(!html.includes('reviewWarnings.push') && html.includes('primary.reviewWarnings'), '頁面不再組裝待確認事項，改用共用 evaluator 結果', 'warnings from shared evaluator');
  assert(html.includes('Vmn=Ve·Mn/|Mu|') && html.includes('σ=Pu/Ag+|Mu|/S'), '帶號彎矩以 |Mu| 用於 P-M、剪力 φ 與 SBE 應力文字', 'absolute moment wording present');
  ['scopeSingleWall:true', 'scopeNoOpening:true', 'scopeAnalysisReady:true', 'hasConstrJoint:true', "jointSurface:'roughened'", "loadCasesText:''"].forEach(flag =>
    assert(html.includes(flag), `內建案例重置 ${flag}`, 'built-in cases reset checkbox state'));
  // SVG 需 xmlns (計算書內嵌不空白 — 見 feedback-svg-popup-xmlns)
  assert((html.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g) || []).length >= 2, 'SVG 皆含 xmlns', 'pm+section svg xmlns');
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  inlineScripts.forEach((script, index) => {
    try {
      new Function(script);
      assert(true, `內嵌 script #${index + 1} 語法可解析`, 'new Function OK');
    } catch (err) {
      assert(false, `內嵌 script #${index + 1} 語法可解析`, err.message);
    }
  });
  // 關鍵函式與案例
  ['const SW_TEST_CASES', 'function calcShearWall', 'function buildReport', 'function drawPMDiagram'].forEach(fn =>
    assert(html.includes(fn), `具函式 ${fn}`, 'function present'));
  assert(html.includes('rc-pending'), '採 rc-pending 隱藏未觸及項目', 'rc-pending used');

  section('面內撓曲 P-M (黃金案例：細長結構牆)');
  const g = { seismic:true, scopeSingleWall:true, scopeNoOpening:true, scopeAnalysisReady:true,
    fc:280, fy:4200, fyt:4200, lambda:1.0, tw:30, lw:500, hw:1500, cover:5,
    Pu:150, Mu:650, Vu:160, duhw:0.010, nBE:12, dBE:'#7', lbe:75, dV:'#4', sV:20, nLayer:2, dH:'#4', sH:20,
    hasJoint:true, jointSurface:'roughened', dTie:'#4', sTie:10, nLegTie:4, hx:15, hu:300, bComp:30 };
  const base = WallBase.buildBase(g, { pmSteps: 140 });
  const { pm, cAtPu, dem, Ag, Acv, hwlw, alpha_c, Vn } = base;
  near(pm.Po, 4119.56, 0.01, 'Po 標稱軸壓');
  near(pm.phiPnMax, 0.65 * 0.80 * 4119.56, 0.01, 'φPn,max = φc·0.80·Po');
  near(cAtPu, 69.2, 0.05, '@Pu 中性軸 c');
  near(dem.phiMn, 1466.9, 0.02, 'φMn @Pu');
  assert(dem.ok === true && dem.util < 1, '需求 Mu 落於封包內', `util=${dem.util.toFixed(3)}`);

  section('面內剪力 (Wall.*)');
  const aH = REBAR_TABLE[g.dH].area;
  const rhot = (g.nLayer * aH) / (g.tw * g.sH);
  near(alpha_c, 0.53, 1e-9, 'αc (hw/ℓw=3 → 0.53)');
  near(Vn / 1000, 399.1, 0.01, 'Vn');
  const VeDirect = Wall.designShear({ mode: 'direct', Vu: g.Vu });
  const VeAmplified = Wall.designShear({ mode: 'amplified', Vuns: 20, VuEh: 100, omegaV: 1.5, omegaW: 1.2 });
  near(VeDirect, g.Vu, 1e-12, '18.7.3 direct: Vu 已為 Ve');
  near(VeAmplified, 200, 1e-12, '18.7.3.1 amplified: Ve=Vuns+Ωv·ωv·VuEh');
  assert(0.75 * Vn / 1000 >= VeDirect, 'φVn ≥ Ve', `φVn=${(0.75*Vn/1000).toFixed(1)} ≥ ${VeDirect}`);

  section('施工縫剪摩擦 (22.9)');
  const roughSurface = Wall.shearFrictionSurface('roughened', 1.0);
  const plainSurface = Wall.shearFrictionSurface('not_roughened', 1.0);
  near(roughSurface.mu, 1.0, 1e-12, '粗糙已硬化混凝土面 μ=1.0λ');
  near(plainSurface.mu, 0.6, 1e-12, '未特別粗糙已硬化混凝土面 μ=0.6λ');
  const sfNWeb = Math.max(0, Math.round((g.lw - 2 * 75) / g.sV));
  const sfAvf = 2 * 18 * REBAR_TABLE['#7'].area + sfNWeb * 2 * REBAR_TABLE['#4'].area;
  const sf = Wall.shearFrictionDesign({
    Vu: 320000,
    phi: 0.75,
    mu: roughSurface.mu,
    fy: 5000,
    Avf: sfAvf,
    fc: 280,
    Ac: Ag,
    surface: 'roughened',
  });
  near(sf.fyDesign, 4200, 1e-12, '剪摩擦 fy 設計值上限 4200');
  near(sf.AvfReq, 320000 / (0.75 * 1.0 * 4200), 1e-9, 'Avf,req=Vu/(φμfy)');
  near(sf.VnMax / 1000, 840, 0.01, '粗糙施工縫 Vn 上限');
  assert(sf.strengthOk && sf.capOk, '既有垂直穿縫筋滿足剪摩擦初估', `Avf=${sfAvf.toFixed(1)} req=${sf.AvfReq.toFixed(1)} cm²`);

  section('特殊邊界構材 (18.7.6)');
  const S = g.tw * g.lw * g.lw / 6;
  const sigma = g.Pu * 1000 / Ag + g.Mu * 1e5 / S;
  near(sigma, 62, 1e-6, '邊緣應力 σ=Pu/Ag+Mu/S');
  assert(sigma > 0.2 * g.fc, '應力法觸發 SBE (σ>0.2fc\')', `σ=${sigma} > ${0.2*g.fc}`);
  const cLimit = Wall.beStrainTrigger(g.lw, Math.max(0.005, g.duhw));
  near(cLimit, 55.56, 0.01, 'c 上限 ℓw/[600·1.5·δu/hw]');
  assert(cAtPu >= cLimit, '應變法觸發 SBE (c≥c上限)', `c=${cAtPu.toFixed(1)} ≥ ${cLimit.toFixed(1)}`);

  section('剪力 φ (規範 21.2.4.1) ＆ 圍束筋 (18.7.6.4)');
  // 標稱撓曲 Mn@Pu (內插標稱曲線，對應因數化軸力)
  let MnNom = null;
  for (let i = 0; i < pm.nominal.length - 1; i++) {
    const A = pm.nominal[i], B = pm.nominal[i + 1];
    if ((A.P - g.Pu) * (B.P - g.Pu) <= 0 && A.P !== B.P) {
      const t = (g.Pu - A.P) / (B.P - A.P), M = A.M + t * (B.M - A.M);
      if (MnNom == null || M > MnNom) MnNom = M;
    }
  }
  const Vmn = g.Vu * (MnNom / g.Mu);   // 撓曲強度發展對應之剪力 (tf)
  const phiFor = (dH, sH) => {
    const rt = (g.nLayer * REBAR_TABLE[dH].area) / (g.tw * sH);
    const vn = Wall.vn({ Acv: Ag, alpha_c, lambda: g.lambda, fc: g.fc, rhot: rt, fy: g.fyt }) / 1000;
    return { vn, phi: vn < Vmn ? 0.60 : 0.75 };
  };
  // 低橫筋 → Vn≪Vmn → 撓曲控制 → φ=0.60
  const lowRt = phiFor('#3', 40);
  assert(lowRt.phi === 0.60, '低橫筋牆 φ=0.60 (Vn<Vmn, 防脆性剪力)', `Vn=${lowRt.vn.toFixed(0)} < Vmn=${Vmn.toFixed(0)} tf`);
  // 高橫筋 → Vn≫Vmn → 剪力充裕 → φ=0.75
  const highRt = phiFor('#5', 10);
  assert(highRt.phi === 0.75, '高橫筋牆 φ=0.75 (Vn≥Vmn)', `Vn=${highRt.vn.toFixed(0)} ≥ Vmn=${Vmn.toFixed(0)} tf`);
  // 圍束筋 Ash
  const bc = g.tw - 2 * g.cover, hx = 15;
  const so = Math.min(15, Math.max(10, 10 + (35 - hx) / 3));
  const sbeSpLimit = Math.min(Math.min(g.tw, g.lbe) / 3, 6 * REBAR_TABLE[g.dBE].db, so);
  near(sbeSpLimit, 10, 1e-6, '圍束筋間距上限 min(d/3,6db,so)');
  const AshReq = (0.09 * g.fc / g.fyt) * 10 * bc;   // sTie=10
  const AshProv = 4 * REBAR_TABLE['#4'].area;        // 4 肢 #4
  assert(AshProv >= AshReq, 'Ash 提供 ≥ 需求 (0.09·s·bc·fc/fyt)', `${AshProv.toFixed(2)} ≥ ${AshReq.toFixed(2)} cm²`);

  section('矮牆 αc (剪力控制)');
  near(Wall.alphaC(1.0), 0.80, 1e-9, 'αc (hw/ℓw=1 → 0.80)');

  if (failed) { console.error(`\n✗ ${failed} 項失敗`); process.exit(1); }
  console.log('\nAll shear-wall regression checks passed.');
}

main();
