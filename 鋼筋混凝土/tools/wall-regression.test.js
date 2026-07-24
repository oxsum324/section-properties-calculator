const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const wallHtmlPath = path.join(__dirname, 'wall.html');
const concretePath = path.join(ROOT, '..', '結構工具箱', 'core', 'materials', 'concrete.js');
const rebarPath = path.join(ROOT, '..', '結構工具箱', 'core', 'materials', 'rebar.js');
const commonPath = path.join(ROOT, 'shared', 'common.js');
const flexurePath = path.join(ROOT, 'shared', 'flexure.js');
const wallPath = path.join(ROOT, 'shared', 'wall.js');
const pmSectionPath = path.join(ROOT, 'shared', 'pmsection.js');
const wallInplaneEvaluatorPath = path.join(ROOT, 'shared', 'wall-inplane-evaluator.js');
const wallRebarDesignerPath = path.join(ROOT, 'shared', 'wall-rebar-designer.js');

function bootLibs() {
  const context = { console, window: {}, Math };
  context.window = context;
  vm.createContext(context);
  for (const file of [concretePath, rebarPath, commonPath, flexurePath, wallPath, pmSectionPath, wallInplaneEvaluatorPath, wallRebarDesignerPath]) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return context;
}

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function section(title) {
  console.log(`\n## ${title}`);
}

function main() {
  const wallHtml = fs.readFileSync(wallHtmlPath, 'utf8');
  const libs = bootLibs();
  const { Wall, WallInplaneEvaluator, WallRebarDesigner, Flexure, Concrete, Rebar } = libs;
  const { calcBeta1 } = Concrete;
  const { REBAR_TABLE } = Rebar;

  section('Source Guards');
  assert(wallHtml.includes('id="methodAuditCard"'), 'wall.html has method audit card', 'summary page exposes method grading');
  assert(wallHtml.includes('id="testCaseSelect"'), 'wall.html has test case selector', 'built-in wall cases can be applied from UI');
  assert(wallHtml.includes('const WALL_TEST_CASES = {'), 'wall.html defines built-in wall cases', 'test case catalog exists in source');
  assert(wallHtml.includes('function applyWallTestCase(caseKey)'), 'wall.html has applyWallTestCase helper', 'case apply helper exists');
  assert(wallHtml.includes('id="caseJson"'), 'wall.html has case JSON textarea', 'wall cases can be exported/imported');
  assert(wallHtml.includes('id="baselineReport"'), 'wall.html has baseline report area', 'wall baseline text can be exported');
  assert(wallHtml.includes('id="compareCaseJson"'), 'wall.html has compare JSON textarea', 'advanced compare area exists');
  assert(wallHtml.includes('id="caseCompareResult"'), 'wall.html has compare result area', 'compare output can be shown inline');
  assert(wallHtml.includes('const WALL_PROJECT_SCHEMA = \'rc-wall-project-v1\''), 'wall.html has project save schema', 'rc-wall-project-v1');
  assert(wallHtml.includes('id="btnSaveWallProject"') && wallHtml.includes('id="btnLoadWallProject"'), 'wall.html has project file controls', 'save/load buttons present');
  assert(wallHtml.includes('id="btnSaveWallDraft"') && wallHtml.includes('id="btnLoadWallDraft"'), 'wall.html has browser draft controls', 'draft buttons present');
  assert(wallHtml.includes('rc.wall.project.draft'), 'wall.html has localStorage draft key', 'wall draft key present');
  assert(wallHtml.includes("sourceVersion === 'V3.1' ? 'V3.1' : 'V3.2'"), 'wall.html accepts verified V3.1 projects', 'legacy projects replay under the V3.2 page');
  assert(wallHtml.includes('已依 V3.2 重新計算，請另存 V3.2 專案檔'), 'wall.html discloses V3.1 project migration', 'legacy replay prompts a V3.2 save');
  assert(wallHtml.includes('function collectWallProjectData()'), 'wall.html can collect wall project payload', 'project collect helper exists');
  assert(wallHtml.includes('function applyWallProjectData(raw'), 'wall.html can apply wall project payload', 'project apply helper exists');
  assert(wallHtml.includes('WALL_PROJECT_EXCLUDED_IDS') && wallHtml.includes('caseJson') && wallHtml.includes('baselineReport'), 'wall project excludes case-tool textareas', 'case JSON / baseline are not project inputs');
  assert(wallHtml.includes('function collectWallCasePayload()'), 'wall.html can collect case payload', 'export payload helper exists');
  assert(wallHtml.includes('function collectWallReviewWarnings(r)'), 'wall.html collects review warnings', 'manual-review boundary is centralized');
  assert(wallHtml.includes('function summarizeWallResult(r'), 'wall.html centralizes summary status', 'OK / NG / pending-review summary uses one helper');
  assert(wallHtml.includes('function updateWallAttachmentReadiness'), 'wall.html renders page-only attachment readiness', 'readiness summary stays on tool page');
  assert(wallHtml.includes('id="wallAttachmentReadiness"'), 'wall.html has attachment readiness target', 'page-only readiness card exists');
  assert(wallHtml.includes('RCUI.renderAttachmentReadiness'), 'wall.html uses shared attachment readiness renderer', 'readiness helper present');
  assert(wallHtml.includes('summary:false'), 'wall report disables top status summary', 'attachment status is not printed');
  const buildReportSrc = wallHtml.slice(wallHtml.indexOf('function buildWallReport'), wallHtml.indexOf('function svgToDataURL'));
  assert(!buildReportSrc.includes('RCUI.buildReviewCheckGroup'), 'wall report excludes review overview helper', 'formal-analysis overview stays page-only');
  assert(!buildReportSrc.includes('待確認 / 正式分析需求'), 'wall report excludes formal-analysis overview group', 'report has no page-only review group');
  assert(wallHtml.includes('basement_pass_warn'), 'wall.html has pass-warning basement case', 'numeric pass with rough model is regression-covered');
  assert(wallHtml.includes('bearing_tension'), 'wall.html has axial-tension report case', 'negative Pu and end reinforcement are attachment-covered');
  assert(wallHtml.includes('Pu (tf；壓＋／拉－)') && wallHtml.includes('Pu（壓＋／拉－）'), 'wall.html discloses Pu sign convention', 'page and report identify compression-positive / tension-negative');
  assert(wallHtml.includes('function importWallCaseFromJson()'), 'wall.html can import wall case JSON', 'import helper exists');
  assert(wallHtml.includes('function buildWallBaselineReport()'), 'wall.html can build baseline report', 'baseline export helper exists');
  assert(wallHtml.includes('function compareWallCaseJson()'), 'wall.html can compare wall case JSON', 'compare helper exists');
  assert(wallHtml.includes('id="bwSupport"'), 'wall.html has basement support selector', 'basement wall model is selectable');
  assert(wallHtml.includes('簡式不適用，P-M 仍照常檢核'), 'wall.html keeps P-M active when the simple formula is out of range', 'eccentricity no longer blocks the formal P-M check');
  assert(wallHtml.includes('../shared/pmsection.js?v=2'), 'wall.html loads the shared P-M engine', 'general wall uses the same strain-compatibility core');
  assert(wallHtml.includes('../shared/wall-inplane-evaluator.js?v=2'), 'wall.html loads the in-plane capacity evaluator', 'formal calculation and load combinations share one evaluator');
  assert(wallHtml.includes('WallInplaneEvaluator.computeCapacity(wallInplaneEvaluatorBase)'), 'wall.html formal calculation uses the shared evaluator', 'displayed capacities and tuple ranking cannot drift apart');
  assert(wallHtml.includes('WallInplaneEvaluator.evaluatePMDemand(wallInplaneEvaluatorBase'), 'wall.html formal calculation evaluates the P-M envelope', 'axial tension and eccentric compression use the formal section model');
  assert(wallHtml.includes('id="cover"') && wallHtml.includes('id="pmBoundaryRebar"') && wallHtml.includes('id="pmBoundaryCountEach"'), 'wall.html exposes actual cover and optional end reinforcement', 'P-M section assumptions are user inputs');
  assert(wallHtml.includes('id="wallPMDiagram"') && wallHtml.includes("title:'P-M 設計互制圖'"), 'wall.html renders and reports the P-M interaction diagram', 'formal report includes capacity envelope and demand point');
  assert(wallHtml.includes('../shared/wall-rebar-designer.js?v=1'), 'wall.html loads the capacity-based reinforcement designer', 'design suggestions share the formal evaluators');
  assert(wallHtml.includes('id="wallRebarDesignCandidates"') && wallHtml.includes('applyWallRebarCandidate'), 'wall.html exposes ranked reinforcement candidates and apply action', 'a selected candidate returns to formal check mode');
  assert(wallHtml.includes("key:'pm-capacity'") && wallHtml.includes("key:'shear-capacity'"), 'wall load combinations expose capacity-based limit states', 'P-M and shear are separated');
  assert(wallHtml.includes("{ key:'M', label:'彎矩 Mu'"), 'wall load combinations include signed in-plane moment', 'complete P-M-V tuple is preserved');
  assert(wallHtml.includes('refreshLimitStateSuggestions(window.rcWallLoadComboConfig)'), 'wall capacity suggestions refresh after section recalculation', 'section changes immediately rerank tuples');
  assert(!wallHtml.includes("key:'pv-vector'") && !wallHtml.includes("criterion:'normalized-srss'"), 'wall load combinations remove artificial P-V vector ranking', 'no dimensionless demand-vector proxy remains');
  assert(wallHtml.includes("const triCoef = isCantilever ? (1 / 6) : 0.0641"), 'wall.html has basement triangular moment coefficients', 'cantilever/simple model switch exists');
  assert(wallHtml.includes("const uniCoef = isCantilever ? (1 / 2) : (1 / 8)"), 'wall.html has basement uniform moment coefficients', 'cantilever/simple surcharge model switch exists');
  assert(!wallHtml.includes('18.10'), 'wall.html no stale 18.10 wall references', 'uses 112 18.7 special structural wall clauses');
  assert(
    wallHtml.includes('18.7.2.4') && wallHtml.includes('18.7.4.4') && wallHtml.includes('18.7.6.3'),
    'wall.html uses 112 18.7 wall clause refs',
    '18.7.2.4 / 18.7.4.4 / 18.7.6.3 present'
  );

  section('Wall Helper Formulas');
  const shearHmin = Wall.hmin('shear', 300, 500);
  assert(Math.abs(shearHmin - 20) < 1e-9, '剪力牆 hmin 取較大需求', `hmin=${shearHmin.toFixed(2)} cm for lc=300, lw=500`);

  const rhoNonSeismic = Wall.minRho({ seismic: false, isShearWall: false, needTwoLayer: false, hwlw: 3, rhot: 0.003 });
  assert(rhoNonSeismic.rholMin === 0.0012 && rhoNonSeismic.rhotMin === 0.0020,
    '非耐震牆最小配筋比為固定條文值',
    `rholMin=${rhoNonSeismic.rholMin}, rhotMin=${rhoNonSeismic.rhotMin}`);

  const rhoTwoLayer = Wall.minRho({ seismic: false, isShearWall: false, needTwoLayer: true, hwlw: 1.8, rhot: 0.0042 });
  assert(rhoTwoLayer.rholMin === 0.0012 && rhoTwoLayer.rhotMin === 0.0025,
    '雙層牆僅提高 ρt,min，不再自訂提高 ρℓ,min',
    `rholMin=${rhoTwoLayer.rholMin}, rhotMin=${rhoTwoLayer.rhotMin}`);

  const sbeLinear = Wall.sbeExtension({ method: 'linear', fc: 280, sigmaMax: 80, lw: 500, points: null });
  assert(Math.abs(sbeLinear.sigmaStop - 42) < 1e-9 && Math.abs(sbeLinear.x - 237.5) < 1e-9,
    'SBE 線性延伸可回到 0.15fc\' 交點',
    `sigmaStop=${sbeLinear.sigmaStop.toFixed(1)}, x=${sbeLinear.x.toFixed(1)} cm`);

  const inplaneBase = {
    fc:280, fy:4200, h:25, lw:500, lc:300, k:1, hw:1200,
    e:2, lambda:1, rhot:0.003, phiComp:0.65, phiTen:0.90, phiShear:0.75, pnMaxFactor:0.80,
    vBarArea:1.267, vBarDb:1.27, hBarDb:1.27, vSp:20, layers:2, cover:2,
    seismic:false, wallType:'bearing',
  };
  const pmCapacity = WallInplaneEvaluator.computePMCapacity(inplaneBase);
  assert(pmCapacity.valid && pmCapacity.pMin < 0 && pmCapacity.pMax > 0,
    '一般牆建立含軸拉與軸壓的 P-M 設計封包',
    `P=${pmCapacity.pMin.toFixed(1)}~${pmCapacity.pMax.toFixed(1)} tf`);
  const compression = WallInplaneEvaluator.pmScore(inplaneBase, { P:120, M:30, V:30 });
  assert(compression.status === 'evaluated' && compression.score === compression.utilization,
    '牆壓彎組合依 φMn@Pu 容量評分',
    `utilization=${compression.score.toFixed(3)}`);
  const tension = WallInplaneEvaluator.pmScore(inplaneBase, { P:-40, M:10, V:30 });
  assert(tension.status === 'evaluated' && Number.isFinite(tension.utilization),
    '牆拉彎組合納入 P-M 設計封包',
    `utilization=${tension.score.toFixed(3)}`);
  const axialOut = WallInplaneEvaluator.pmScore(inplaneBase, { P:pmCapacity.pMin - 50, M:0, V:0 });
  assert(axialOut.status === 'axial-out-of-range' && axialOut.score >= 1e12,
    '牆 P-M 軸力越界失敗關閉',
    `${axialOut.scoreLabel}, score=${axialOut.score}`);
  const boundaryCapacity = WallInplaneEvaluator.computePMCapacity({
    ...inplaneBase,
    boundaryBarArea:REBAR_TABLE['#8'].area,
    boundaryBarDb:REBAR_TABLE['#8'].db,
    boundaryBarCountEach:4,
  });
  assert(boundaryCapacity.valid && boundaryCapacity.AstBoundary > 0 && boundaryCapacity.pMin < pmCapacity.pMin,
    '一般牆端部附加筋進入同一 P-M 斷面模型',
    `Ast,b=${boundaryCapacity.AstBoundary.toFixed(2)} cm², Pmin=${boundaryCapacity.pMin.toFixed(1)} tf`);
  const designed = WallRebarDesigner.search({
    base:inplaneBase,
    demand:{ P:120, M:300, V:50 },
    barTable:REBAR_TABLE,
    verticalBars:['#4', '#5'], horizontalBars:['#4', '#5'],
    boundaryBars:['#8'], boundaryCounts:[4], spacings:[15, 20, 25], limit:3,
  });
  assert(designed.status === 'evaluated' && designed.candidates.every(item => item.pmUtilization <= 1 && item.shearUtilization <= 1),
    '一般牆容量式配筋搜尋同時通過 P-M 與剪力',
    `candidates=${designed.candidates.length}`);

  section('Out-of-Plane Flexure Modeling');
  const fc = 280;
  const fy = 4200;
  const h = 20;
  const b = 100;
  const beta1 = calcBeta1(fc);
  const dbV = REBAR_TABLE['#4'].db;
  const dbH = REBAR_TABLE['#4'].db;
  const cover = 2;
  const faceOff = cover + dbH + dbV / 2;
  const AsPerM = 2 * REBAR_TABLE['#4'].area * 100 / 20; // 雙層 #4@20
  const singleMid = Flexure.solveSection({
    shape: { type: 'rect', b },
    h,
    layers: [{ y: h / 2, As: AsPerM }],
    fc, fy, beta1
  });
  const doubleFace = Flexure.solveSection({
    shape: { type: 'rect', b },
    h,
    layers: [
      { y: faceOff, As: AsPerM / 2 },
      { y: h - faceOff, As: AsPerM / 2 },
    ],
    fc, fy, beta1
  });
  assert(doubleFace.valid && singleMid.valid, '面外斷面求解可收斂', `singleValid=${singleMid.valid}, doubleValid=${doubleFace.valid}`);
  assert(Math.abs(doubleFace.Mn - singleMid.Mn) > 0.05e5,
    '雙層靠外鋼筋模型與中線近似結果有可辨識差異',
    `Mn(face)=${(doubleFace.Mn / 1e5).toFixed(2)} tf·m/m, Mn(mid)=${(singleMid.Mn / 1e5).toFixed(2)} tf·m/m`);

  console.log('\nAll wall regression checks passed.');
}

main();
