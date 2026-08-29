const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateCatalog, runBenchmarks } = require('./independent-engineering-benchmarks.js');

const toolsRoot = __dirname;
const catalogPath = path.join(toolsRoot, 'independent-engineering-benchmarks.catalog.json');
const runnerPath = path.join(toolsRoot, 'independent-engineering-benchmarks.js');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8').replace(/^\uFEFF/, ''));
const homeSource = fs.readFileSync(path.join(toolsRoot, '..', 'assets', 'home', 'home.js'), 'utf8');

function homepageState(route) {
  const escaped = String(route).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return homeSource.match(new RegExp(`href:\\s*['"]${escaped}['"][\\s\\S]{0,300}?state:\\s*['"]([^'"]+)`))?.[1] || '';
}

assert.deepEqual(validateCatalog(catalog), [], 'independent engineering benchmark catalog is valid');
for (const item of [...catalog.benchmarks, ...catalog.priorityTargets]) {
  assert.equal(homepageState(item.route), 'formal', `${item.route} independent benchmark coverage is limited to formal homepage routes`);
}
assert.equal(homepageState('/seismic-dynamic'), 'report', 'dynamic analysis summary remains supplemental and outside formal attachment coverage');
const rcColumnAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-column-pm.js'), 'utf8');
assert.ok(rcColumnAdapterSource.includes("require('../../../鋼筋混凝土/shared/pmsection.js')"), 'RC column adapter exercises the production P-M engine');
assert.ok(!rcColumnAdapterSource.includes('golden'), 'RC column adapter does not replay a golden-case fixture');
const rcBeamAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-beam-strength.js'), 'utf8');
assert.ok(rcBeamAdapterSource.includes("../../../鋼筋混凝土/shared/flexure.js"), 'RC beam adapter exercises the production flexure core');
assert.ok(rcBeamAdapterSource.includes("../../../鋼筋混凝土/shared/beam-evaluator.js"), 'RC beam adapter exercises the production shear evaluator');
assert.ok(rcBeamAdapterSource.includes("../../../鋼筋混凝土/shared/beam-applicability.js"), 'RC beam adapter exercises the production deep-beam applicability core');
assert.ok(!rcBeamAdapterSource.includes('golden'), 'RC beam adapter does not replay a golden-case fixture');
const rcStmAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-stm-strength.js'), 'utf8');
assert.ok(rcStmAdapterSource.includes("../../../鋼筋混凝土/shared/deep-beam-stm.js"), 'RC STM adapter exercises the production deep-beam core');
assert.ok(rcStmAdapterSource.includes("../../../鋼筋混凝土/shared/foundation-deep-beam-stm.js"), 'RC STM adapter exercises the production foundation 2D STM core');
assert.ok(rcStmAdapterSource.includes("../../../鋼筋混凝土/shared/pile-cap-3d-stm.js"), 'RC STM adapter exercises the production pile-cap 3D STM core');
assert.ok(rcStmAdapterSource.includes('angleOk:pass(result.checks.angleOk)'), 'RC STM adapter exposes the production 25-degree rejection branch');
assert.ok(rcStmAdapterSource.includes('angleMarginDeg'), 'RC STM adapter exposes the signed 25-degree boundary margin');
assert.ok(rcStmAdapterSource.includes('shear2344Margin'), 'RC STM adapter exposes the signed 23.4.4 shear-capacity margin');
assert.ok(rcStmAdapterSource.includes('tieLayerOffsetMargin'), 'RC STM adapter exposes the signed X/Y tie-layer offset margin');
assert.ok(!rcStmAdapterSource.includes('golden'), 'RC STM adapter does not replay a golden-case fixture');
const rcShearWallAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-shear-wall-strength.js'), 'utf8');
assert.ok(rcShearWallAdapterSource.includes("../../../鋼筋混凝土/shared/pmsection.js"), 'RC shear-wall adapter exercises the production P-M engine');
assert.ok(rcShearWallAdapterSource.includes("../../../鋼筋混凝土/shared/wall-base.js"), 'RC shear-wall adapter exercises the production wall base assembly');
assert.ok(rcShearWallAdapterSource.includes("../../../鋼筋混凝土/shared/wall-evaluator.js"), 'RC shear-wall adapter exercises the production load-case evaluator');
assert.ok(!rcShearWallAdapterSource.includes('golden'), 'RC shear-wall adapter does not replay a golden-case fixture');
const rcWallAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-wall-strength.js'), 'utf8');
assert.ok(rcWallAdapterSource.includes("../../../鋼筋混凝土/shared/pmsection.js"), 'RC wall adapter exercises the production P-M engine');
assert.ok(rcWallAdapterSource.includes("../../../鋼筋混凝土/shared/wall-inplane-evaluator.js"), 'RC wall adapter exercises the production in-plane evaluator');
assert.ok(rcWallAdapterSource.includes("../../../鋼筋混凝土/tools/wall.html"), 'RC wall adapter guards the formal page calculation wiring');
assert.ok(rcWallAdapterSource.includes('const Mu_bw = 1.6 * (M_tri + M_uni + M_w);'), 'RC wall adapter locks the basement lateral-moment composition');
assert.ok(!rcWallAdapterSource.includes('golden'), 'RC wall adapter does not replay a golden-case fixture');
const rcRetrofitAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-retrofit-section.js'), 'utf8');
assert.ok(rcRetrofitAdapterSource.includes("../../../RC補強斷面性質.html"), 'RC retrofit adapter reads the formal beam and column page');
assert.ok(rcRetrofitAdapterSource.includes('formalPageSource.slice(coreStart, coreEnd)'), 'RC retrofit adapter executes the production functions extracted from the formal page');
assert.ok(rcRetrofitAdapterSource.includes('solveBeamMn, uncrackedTransSection, crackedTransSection'), 'RC retrofit adapter exercises production flexural and transformed-section functions');
assert.ok(rcRetrofitAdapterSource.includes('pmCurvePoints, findMnAtP'), 'RC retrofit adapter exercises the production column P-M functions');
assert.ok(!rcRetrofitAdapterSource.includes('golden'), 'RC retrofit adapter does not replay a golden-case fixture');
const rcFoundationAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-foundation.js'), 'utf8');
assert.ok(rcFoundationAdapterSource.includes("require('../../../鋼筋混凝土/shared/foundation-isolated.js')"), 'RC foundation adapter exercises the production isolated-footing strength core');
assert.ok(!rcFoundationAdapterSource.includes('golden'), 'RC foundation adapter does not replay a golden-case fixture');
const rcPileAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-pile.js'), 'utf8');
assert.ok(rcPileAdapterSource.includes("require('../../../鋼筋混凝土/shared/foundation-pile.js')"), 'RC pile adapter exercises the production pile axial, group and pile-cap core');
assert.ok(!rcPileAdapterSource.includes('golden'), 'RC pile adapter does not replay a golden-case fixture');
const steelBeamAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'steel-beam-asd.js'), 'utf8');
assert.ok(steelBeamAdapterSource.includes("../../../鋼構工具/core/materials/steel.js"), 'steel beam adapter exercises the production steel member core');
assert.ok(!steelBeamAdapterSource.includes('golden'), 'steel beam adapter does not replay a golden-case fixture');
const steelColumnAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'steel-column-asd.js'), 'utf8');
assert.ok(steelColumnAdapterSource.includes("../../../鋼構工具/core/materials/steel.js"), 'steel column adapter exercises the production steel member core');
assert.ok(!steelColumnAdapterSource.includes('golden'), 'steel column adapter does not replay a golden-case fixture');
const steelPlateAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'steel-plate-connection.js'), 'utf8');
assert.ok(steelPlateAdapterSource.includes("../../../鋼構工具/calculator.js"), 'steel plate adapter exercises the production connection calculator');
assert.ok(steelPlateAdapterSource.includes("../../../鋼構工具/plate-check.html"), 'steel plate adapter guards the formal standalone page wiring');
assert.ok(!steelPlateAdapterSource.includes('golden'), 'steel plate adapter does not replay a golden-case fixture');
const steelFormalAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'steel-formal.js'), 'utf8');
assert.ok(steelFormalAdapterSource.includes("../../../鋼構工具"), 'steel formal adapter resolves the production steel tool');
assert.ok(steelFormalAdapterSource.includes("require(productionCorePath)"), 'steel formal adapter exercises the production connection calculator');
assert.ok(steelFormalAdapterSource.includes("<option value=\"plate_check\">"), 'steel formal adapter locks the main-page connection-plate route');
assert.ok(steelFormalAdapterSource.includes("<option value=\"tension_member\">"), 'steel formal adapter locks the main-page tension-member route');
assert.ok(steelFormalAdapterSource.includes("buildConnectionReportConfig(result)"), 'steel formal adapter locks the production result-to-report route');
assert.ok(!steelFormalAdapterSource.includes('golden'), 'steel formal adapter does not replay a golden-case fixture');
const deckingAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'decking.js'), 'utf8');
assert.ok(deckingAdapterSource.includes("../../../覆工板"), 'decking adapter resolves the production formal tool');
assert.ok(deckingAdapterSource.includes("productionPageSource.slice(calculationStart, calculationEnd)"), 'decking adapter executes the production calculation functions extracted from the formal page');
assert.ok(deckingAdapterSource.includes('function calcDeck()') && deckingAdapterSource.includes('function calcPile()'), 'decking adapter locks the complete formal-page load path');
assert.ok(deckingAdapterSource.includes("shared', 'h-section-table.js"), 'decking adapter exercises the production section table');
assert.ok(!deckingAdapterSource.includes('golden'), 'decking adapter does not replay a golden-case fixture');
const stoneFixingAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'stone-fixing.js'), 'utf8');
assert.ok(stoneFixingAdapterSource.includes("../../../石材固定"), 'stone-fixing adapter resolves the production formal tool');
assert.ok(stoneFixingAdapterSource.includes("'js', 'constants.spec.js'"), 'stone-fixing adapter executes the production constants catalog');
assert.ok(stoneFixingAdapterSource.includes("'js', 'calculator.spec.js'"), 'stone-fixing adapter executes the production calculation core');
assert.ok(stoneFixingAdapterSource.includes('calculator.calcCase(item.caseData, item.global)'), 'stone-fixing adapter locks the formal case calculation path');
assert.ok(!stoneFixingAdapterSource.includes('golden'), 'stone-fixing adapter does not replay a golden-case fixture');
const rcSlabAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-slab-strength.js'), 'utf8');
assert.ok(rcSlabAdapterSource.includes("../../../鋼筋混凝土/shared/slab-evaluator.js"), 'RC slab adapter exercises the production slab calculation core');
assert.ok(rcSlabAdapterSource.includes("../../../鋼筋混凝土/shared/flexure.js"), 'RC slab adapter exercises the production flexure core');
assert.ok(rcSlabAdapterSource.includes("../../../鋼筋混凝土/tools/slab.html"), 'RC slab adapter guards the formal page wiring');
assert.ok(!rcSlabAdapterSource.includes('golden'), 'RC slab adapter does not replay a golden-case fixture');
const windForceAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'wind-force-mwfrs.js'), 'utf8');
assert.ok(windForceAdapterSource.includes("../../core/loads/wind.js"), 'wind-force adapter exercises the production MWFRS wind core');
assert.ok(!windForceAdapterSource.includes('golden'), 'wind-force adapter does not replay a golden-case fixture');
const windObjectSolidAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'wind-object-solid-table210.js'), 'utf8');
assert.ok(windObjectSolidAdapterSource.includes("../../core/loads/wind.js"), 'solid-object adapter exercises the production wind core');
assert.ok(windObjectSolidAdapterSource.includes("../風力/wind-object-solid.html"), 'solid-object adapter guards the formal page calculation wiring');
assert.ok(windObjectSolidAdapterSource.includes('W.lookupSignCf({ atGround: true, aspectRatio: nu })'), 'solid-object adapter preserves the nu Table 2.10 route');
assert.ok(windObjectSolidAdapterSource.includes('W.lookupSignCf({ atGround: false, aspectRatio: mnRatio })'), 'solid-object adapter preserves the M/N Table 2.10 route');
assert.ok(!windObjectSolidAdapterSource.includes('golden'), 'solid-object adapter does not replay a golden-case fixture');
const windObjectFrameAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'wind-object-frame.js'), 'utf8');
assert.ok(windObjectFrameAdapterSource.includes("../../core/loads/wind.js"), 'wind-object frame adapter exercises the production wind core');
assert.ok(windObjectFrameAdapterSource.includes("../風力/wind-object-frame.html"), 'wind-object frame adapter guards the formal page calculation wiring');
assert.ok(windObjectFrameAdapterSource.includes('W.lookupPorousFrameCf({ solidity: phi, memberType, dSqrtQz })'), 'wind-object frame adapter locks the formal Table 2.11 route');
assert.ok(windObjectFrameAdapterSource.includes('W.calcGustRigid(z, Math.max(Math.sqrt(A), 1), terrain)'), 'wind-object frame adapter locks the formal equivalent-width gust route');
assert.ok(windObjectFrameAdapterSource.includes('const force = q.qz * G * cfData.cf * A;'), 'wind-object frame adapter locks the formal force equation');
assert.ok(!windObjectFrameAdapterSource.includes('golden'), 'wind-object frame adapter does not replay a golden-case fixture');
const windLatticeTowerAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'wind-lattice-tower.js'), 'utf8');
assert.ok(windLatticeTowerAdapterSource.includes("../../core/loads/wind.js"), 'wind lattice-tower adapter exercises the production wind core');
assert.ok(windLatticeTowerAdapterSource.includes("../風力/wind-lattice-tower.html"), 'wind lattice-tower adapter guards the formal page calculation wiring');
assert.ok(windLatticeTowerAdapterSource.includes('W.calcLatticeTowerWind({ V, terrain, I, zBase, height, faceWidth, solidity: phi, segments, Kzt, towerShape, memberShape, skewWind })'), 'wind lattice-tower adapter locks the formal Table 2.15 core call');
assert.ok(windLatticeTowerAdapterSource.includes('const topRow = raw.body.rows[raw.body.rows.length - 1];'), 'wind lattice-tower adapter locks the formal top-segment selection');
assert.ok(!windLatticeTowerAdapterSource.includes('golden'), 'wind lattice-tower adapter does not replay a golden-case fixture');
const windObjectTowerAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'wind-object-tower.js'), 'utf8');
assert.ok(windObjectTowerAdapterSource.includes("../../core/loads/wind.js"), 'wind object-tower adapter exercises the production wind core');
assert.ok(windObjectTowerAdapterSource.includes("../風力/wind-object-tower.html"), 'wind object-tower adapter guards the formal page calculation wiring');
assert.ok(windObjectTowerAdapterSource.includes('W.calcTowerWind({ V, terrain, I, zBase, height, D, segments, Kzt, sectionType, shapeFactor, topArea, topAreaCf: topCf })'), 'wind object-tower adapter locks the formal Table 2.12 core call');
assert.ok(windObjectTowerAdapterSource.includes('const topRow = raw.body.rows[raw.body.rows.length - 1];'), 'wind object-tower adapter locks the formal top-segment selection');
assert.ok(!windObjectTowerAdapterSource.includes('golden'), 'wind object-tower adapter does not replay a golden-case fixture');
const windFenceSignAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'wind-fence-sign.js'), 'utf8');
assert.ok(windFenceSignAdapterSource.includes("../../core/loads/wind.js"), 'wind fence/sign adapter exercises the production wind core');
assert.ok(windFenceSignAdapterSource.includes("../風力/wind-fence-sign.html"), 'wind fence/sign adapter guards the formal page calculation wiring');
assert.ok(windFenceSignAdapterSource.includes('W.lookupSignCf({ atGround, aspectRatio })'), 'wind fence/sign adapter locks the formal Table 2.10 route');
assert.ok(windFenceSignAdapterSource.includes('W.calcGustRigid(h + s, B, terrain)'), 'wind fence/sign adapter locks the formal gust-factor route');
assert.ok(windFenceSignAdapterSource.includes('const F = qz * G * cfEff * A;'), 'wind fence/sign adapter locks the formal force equation');
assert.ok(!windFenceSignAdapterSource.includes('golden'), 'wind fence/sign adapter does not replay a golden-case fixture');
const windSignPoleAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'wind-sign-pole.js'), 'utf8');
assert.ok(windSignPoleAdapterSource.includes("../../core/loads/wind.js"), 'wind sign-pole adapter exercises the production wind core');
assert.ok(windSignPoleAdapterSource.includes("../風力/wind-sign-pole.html"), 'wind sign-pole adapter guards the formal page calculation wiring');
assert.ok(windSignPoleAdapterSource.includes('W.lookupCableCf({ roughness: pipeRoughness, dSqrtQz })'), 'wind sign-pole adapter locks the pipe Table 2.14 route');
assert.ok(windSignPoleAdapterSource.includes('W.lookupAngularPrismR(h / width)'), 'wind sign-pole adapter locks the angular-prism Table 2.13 slenderness route');
assert.ok(windSignPoleAdapterSource.includes('const totalMoment = panelMoment + support.moment;'), 'wind sign-pole adapter locks the composite base-moment equation');
assert.ok(!windSignPoleAdapterSource.includes('golden'), 'wind sign-pole adapter does not replay a golden-case fixture');
const windCcAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'wind-cc.js'), 'utf8');
assert.ok(windCcAdapterSource.includes("../../core/loads/wind.js"), 'wind C&C adapter exercises the production wind core');
assert.ok(windCcAdapterSource.includes("../風力/wind-cc.html"), 'wind C&C adapter guards the formal page calculation wiring');
assert.ok(windCcAdapterSource.includes('Wind.calcCC({ V, terrain, I, Kzt, h, z, zh0, zone: zKey, surface, A, encl })'), 'wind C&C adapter locks the formal page to the shared calculation core');
assert.ok(!windCcAdapterSource.includes('golden'), 'wind C&C adapter does not replay a golden-case fixture');
const windParapetAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'wind-parapet.js'), 'utf8');
assert.ok(windParapetAdapterSource.includes("../../core/loads/wind.js"), 'wind parapet adapter exercises the production wind core');
assert.ok(windParapetAdapterSource.includes("../風力/wind-parapet.html"), 'wind parapet adapter guards the formal page calculation wiring');
assert.ok(windParapetAdapterSource.includes('W.calcMwfrsParapet({ V, terrain, I, Kzt, h, hp, face })'), 'wind parapet adapter locks the formal MWFRS page route');
assert.ok(windParapetAdapterSource.includes("W.calcSingleRoofParapetCcCases : W.calcParapetCcCases"), 'wind parapet adapter locks both formal C&C page routes');
assert.ok(!windParapetAdapterSource.includes('golden'), 'wind parapet adapter does not replay a golden-case fixture');
const windOpenRoofAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'wind-open-roof.js'), 'utf8');
assert.ok(windOpenRoofAdapterSource.includes("../../core/loads/wind.js"), 'wind open-roof adapter exercises the production wind core');
assert.ok(windOpenRoofAdapterSource.includes("../風力/wind-open-roof.html"), 'wind open-roof adapter guards the formal page calculation wiring');
assert.ok(windOpenRoofAdapterSource.includes('const hUse = theta <= 10 ? hEave : hAvg;'), 'wind open-roof adapter locks the formal height-selection rule');
assert.ok(windOpenRoofAdapterSource.includes('W.calcOpenRoofCC({ V, terrain, I, h: hUse, B, L, Kzt, theta, A, zone, roofType, blockage })'), 'wind open-roof adapter locks the formal core call');
assert.ok(!windOpenRoofAdapterSource.includes('golden'), 'wind open-roof adapter does not replay a golden-case fixture');
const seismicForceAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'seismic-force-static.js'), 'utf8');
assert.ok(seismicForceAdapterSource.includes("../../core/loads/seismic.js"), 'seismic-force adapter exercises the production static seismic core');
assert.ok(!seismicForceAdapterSource.includes('golden'), 'seismic-force adapter does not replay a golden-case fixture');
const seismicAppendageAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'seismic-appendage.js'), 'utf8');
assert.ok(seismicAppendageAdapterSource.includes("../../core/loads/seismic.js"), 'seismic-appendage adapter exercises the production appendage seismic core');
assert.ok(seismicAppendageAdapterSource.includes("../地震力/seismic-appendage.html"), 'seismic-appendage adapter guards the formal page wiring');
assert.ok(seismicAppendageAdapterSource.includes("S.calcFph({") && seismicAppendageAdapterSource.includes("S.calcFpv(r.Fph, isNF)"), 'seismic-appendage adapter locks horizontal and vertical formal-page calls');
assert.ok(!seismicAppendageAdapterSource.includes('golden'), 'seismic-appendage adapter does not replay a golden-case fixture');
const seismicMiscAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'seismic-misc.js'), 'utf8');
assert.ok(seismicMiscAdapterSource.includes("../../core/loads/seismic.js"), 'seismic-misc adapter exercises the production Chapter 5 seismic core');
assert.ok(seismicMiscAdapterSource.includes("../地震力/seismic-misc.html"), 'seismic-misc adapter guards the formal page wiring');
assert.ok(seismicMiscAdapterSource.includes("S.calcMiscSeismic({ ...p, typeIdx: -1 })"), 'seismic-misc adapter locks the formal page to the shared production calculation');
assert.ok(!seismicMiscAdapterSource.includes('golden'), 'seismic-misc adapter does not replay a golden-case fixture');
const anchorAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'anchor-cast-in.js'), 'utf8');
assert.ok(anchorAdapterSource.includes("'螺栓檢討', 'bolt-review-tool', 'src'"), 'anchor adapter resolves the production anchor source tree');
assert.ok(anchorAdapterSource.includes("require(path.join(anchorSourceRoot, 'calc.ts'))"), 'anchor adapter exercises the production Chapter 17 calculation core');
assert.ok(!anchorAdapterSource.includes('golden'), 'anchor adapter does not replay a golden-case fixture');
const anchorBackupSource = fs.readFileSync(path.join(toolsRoot, '..', '..', '螺栓檢討', 'bolt-review-tool', 'src', 'backup.ts'), 'utf8');
assert.ok(anchorBackupSource.includes("import { evaluateProjectBatch } from './calc'"), 'anchor formal workspace replay remains connected to the benchmarked production core');
const srcBeamAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'src-beam.js'), 'utf8');
assert.ok(srcBeamAdapterSource.includes("../../../SRC工具/core/src-beam-core.js"), 'SRC adapter exercises the production SRC beam core');
assert.ok(srcBeamAdapterSource.includes('SrcBeamCore.calculate(item)'), 'SRC adapter locks the production calculation call');
assert.ok(!srcBeamAdapterSource.includes('golden'), 'SRC adapter does not replay the official teaching example answer');
const srcColumnAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'src-column.js'), 'utf8');
assert.ok(srcColumnAdapterSource.includes("../../../SRC工具/core/src-column-core.js"), 'SRC column adapter exercises the production SRC column core');
assert.ok(srcColumnAdapterSource.includes("../../../SRC工具/src-column.html"), 'SRC column adapter guards the public formal page wiring');
assert.ok(srcColumnAdapterSource.includes('SrcColumnCore.calculate(item.input)'), 'SRC column adapter locks the production calculation call');
assert.ok(!srcColumnAdapterSource.includes('golden'), 'SRC column adapter does not replay the official teaching example answer');

const result = runBenchmarks(catalog);
assert.equal(result.status, 'ready', JSON.stringify(result.issues));
assert.equal(result.schemaVersion, 3, 'outcome-aware independent benchmark result is versioned');
assert.equal(result.summary.eligibleFormalRoutes, 38, 'formal route portfolio is explicit');
assert.equal(result.summary.pilotRequired, 38, 'thirty-eight independent pilot benchmarks required');
assert.equal(result.summary.pilotVerified, 38, 'thirty-eight independent pilot benchmarks verified');
assert.equal(result.summary.independentlyVerifiedRoutes, 38, 'all thirty-eight formal routes independently verified');
assert.equal(result.summary.candidateRequired, 21, 'twenty-one supplemental STM boundary cases require independent benchmarks');
assert.equal(result.summary.candidateVerified, 21, 'twenty-one supplemental STM boundary cases are independently verified');
assert.equal(result.summary.candidatePassRequired, 12, 'twelve supplemental STM passing boundary cases are required');
assert.equal(result.summary.candidatePassVerified, 12, 'twelve supplemental STM passing boundary cases are independently verified');
assert.equal(result.summary.candidateRejectionRequired, 9, 'nine supplemental STM rejection cases are required');
assert.equal(result.summary.candidateRejectionVerified, 9, 'nine supplemental STM rejection cases are independently verified');
assert.equal(result.summary.verifiedCandidateCapabilities, 3, 'three distinct supplemental STM capabilities are covered');
assert.equal(result.summary.priorityTargets, 0, 'no priority route remains in the independent benchmark roadmap');
assert.equal(result.priorityTargets.some(target => target.priority === 'P0'), false, 'no P0 route remains in the independent benchmark roadmap');
assert.equal(result.summary.issueCount, 0, 'independent pilot has no issues');
assert.ok(result.records.every(record => record.status === 'verified'), 'every pilot record is independently verified');
assert.ok(result.records.every(record => record.referenceType === 'closed-form-identity'), 'every pilot uses a closed-form identity');
assert.equal(result.candidateRecords.length, 21, 'three STM capabilities retain supplemental boundary, rejection and EPS cases after formal-route promotion');
const expectedStmFormalAssertions = new Map([
  ['rc-deep-beam-stm-strength', 33],
  ['rc-foundation-2d-stm-strength', 41],
  ['rc-pile-cap-3d-stm-strength', 59],
]);
for (const [id, assertionCount] of expectedStmFormalAssertions) {
  const record = result.records.find(item => item.id === id);
  assert.equal(record?.status, 'verified', `${id} formal-route closed-form benchmark is verified`);
  assert.equal(record?.assertionCount, assertionCount, `${id} formal-route assertion coverage remains explicit`);
}
const expectedStmCandidateAssertions = new Map([
  ['rc-deep-beam-stm-minimum-steel-four-row', 32],
  ['rc-deep-beam-stm-reject-low-angle', 20],
  ['rc-foundation-2d-stm-uniform-soil-2344', 41],
  ['rc-foundation-2d-stm-reject-shear-2344', 28],
  ['rc-pile-cap-3d-stm-six-pile-2344', 59],
  ['rc-pile-cap-3d-stm-reject-tie-layer-offset', 46],
  ['rc-deep-beam-stm-boundary-angle-below', 10],
  ['rc-deep-beam-stm-boundary-angle-equal', 10],
  ['rc-deep-beam-stm-boundary-angle-above', 10],
  ['rc-foundation-2d-stm-boundary-shear-over', 15],
  ['rc-foundation-2d-stm-boundary-shear-equal', 15],
  ['rc-foundation-2d-stm-boundary-shear-under', 15],
  ['rc-pile-cap-3d-stm-boundary-offset-over', 16],
  ['rc-pile-cap-3d-stm-boundary-offset-equal', 16],
  ['rc-pile-cap-3d-stm-boundary-offset-under', 16],
  ['rc-deep-beam-stm-eps-angle-inside', 10],
  ['rc-deep-beam-stm-eps-angle-outside', 10],
  ['rc-foundation-2d-stm-eps-shear-inside', 15],
  ['rc-foundation-2d-stm-eps-shear-outside', 15],
  ['rc-pile-cap-3d-stm-eps-offset-inside', 16],
  ['rc-pile-cap-3d-stm-eps-offset-outside', 16],
]);
for (const [id, assertionCount] of expectedStmCandidateAssertions) {
  const record = result.candidateRecords.find(item => item.id === id);
  assert.equal(record?.status, 'verified', `${id} closed-form benchmark is verified`);
  assert.equal(record?.assertionCount, assertionCount, `${id} assertion coverage remains explicit`);
}
assert.equal(result.candidateRecords.reduce((sum, record) => sum + record.assertionCount, 0), 431, 'twenty-one supplemental STM cases provide 431 independent assertions');
const expectedRejectionIds = catalog.candidateBenchmarks
  .filter(item => item.expectedOutcome === 'strength-reject')
  .map(item => item.id)
  .sort();
assert.deepEqual(
  result.candidateRecords.filter(record => record.expectedOutcome === 'strength-reject').map(record => record.id).sort(),
  expectedRejectionIds,
  'rejection cases remain explicitly distinguished from benchmark execution failures'
);
const stmAdapter = require('./independent-engineering-adapters/rc-stm-strength.js');
const candidateInput = id => catalog.candidateBenchmarks.find(item => item.id === id).input;
const lowAngleRejection = stmAdapter.calculate(candidateInput('rc-deep-beam-stm-reject-low-angle'));
assert.deepEqual(
  {
    angleOk:lowAngleRejection.angleOk,
    tieOk:lowAngleRejection.tieOk,
    tieLayoutOk:lowAngleRejection.tieLayoutOk,
    strutOk:lowAngleRejection.strutOk,
    nodesOk:lowAngleRejection.nodesOk,
    distributionOk:lowAngleRejection.distributionOk,
    shearLimitsOk:lowAngleRejection.shearLimitsOk,
    strengthPass:lowAngleRejection.strengthPass,
  },
  { angleOk:0, tieOk:1, tieLayoutOk:1, strutOk:1, nodesOk:1, distributionOk:1, shearLimitsOk:1, strengthPass:0 },
  'low-angle deep beam is rejected by the angle branch alone'
);
const shearRejection = stmAdapter.calculate(candidateInput('rc-foundation-2d-stm-reject-shear-2344'));
assert.deepEqual(
  {
    angleOk:shearRejection.angleOk,
    shear2344Required:shearRejection.shear2344Required,
    shear2344Ok:shearRejection.shear2344Ok,
    topologyOk:shearRejection.topologyOk,
    tieOk:shearRejection.tieOk,
    tieLayoutOk:shearRejection.tieLayoutOk,
    strutOk:shearRejection.strutOk,
    nodesOk:shearRejection.nodesOk,
    pileEffectiveDepthOk:shearRejection.pileEffectiveDepthOk,
    strengthPass:shearRejection.strengthPass,
  },
  { angleOk:1, shear2344Required:1, shear2344Ok:0, topologyOk:1, tieOk:1, tieLayoutOk:1, strutOk:1, nodesOk:1, pileEffectiveDepthOk:1, strengthPass:0 },
  'foundation STM is rejected by the required 23.4.4 shear branch alone'
);
const tieLayerRejection = stmAdapter.calculate(candidateInput('rc-pile-cap-3d-stm-reject-tie-layer-offset'));
assert.deepEqual(
  {
    angleOk:tieLayerRejection.angleOk,
    shearLimitsOk:tieLayerRejection.shearLimitsOk,
    topologyOk:tieLayerRejection.topologyOk,
    tiesOk:tieLayerRejection.tiesOk,
    tieLayerOffsetOk:tieLayerRejection.tieLayerOffsetOk,
    strutOk:tieLayerRejection.strutOk,
    nodesOk:tieLayerRejection.nodesOk,
    pileEffectiveDepthOk:tieLayerRejection.pileEffectiveDepthOk,
    strengthPass:tieLayerRejection.strengthPass,
  },
  { angleOk:1, shearLimitsOk:1, topologyOk:1, tiesOk:1, tieLayerOffsetOk:0, strutOk:1, nodesOk:1, pileEffectiveDepthOk:1, strengthPass:0 },
  'pile-cap STM is rejected by the X/Y tie-layer compatibility branch alone'
);

const angleBoundary = [
  stmAdapter.calculate(candidateInput('rc-deep-beam-stm-boundary-angle-below')),
  stmAdapter.calculate(candidateInput('rc-deep-beam-stm-boundary-angle-equal')),
  stmAdapter.calculate(candidateInput('rc-deep-beam-stm-boundary-angle-above')),
];
assert.ok(angleBoundary[0].angleMarginDeg < -1e-9, 'angle just below 25 degrees has a negative signed margin outside EPS');
assert.ok(Math.abs(angleBoundary[1].angleMarginDeg) <= 1e-9, 'angle exactly at 25 degrees has a zero signed margin within EPS');
assert.ok(angleBoundary[2].angleMarginDeg > 1e-9, 'angle just above 25 degrees has a positive signed margin outside EPS');
assert.deepEqual(angleBoundary.map(item => item.angleOk), [0, 1, 1], '25-degree boundary is inclusive at equality');
assert.deepEqual(angleBoundary.map(item => item.strengthPass), [0, 1, 1], 'angle boundary alone controls the final strength outcome');
assert.ok(angleBoundary.every(item => item.tieOk && item.tieLayoutOk && item.strutOk && item.nodesOk && item.distributionOk && item.shearLimitsOk), 'all non-angle deep-beam branches remain passing across the boundary triplet');

const shearBoundary = [
  stmAdapter.calculate(candidateInput('rc-foundation-2d-stm-boundary-shear-over')),
  stmAdapter.calculate(candidateInput('rc-foundation-2d-stm-boundary-shear-equal')),
  stmAdapter.calculate(candidateInput('rc-foundation-2d-stm-boundary-shear-under')),
];
assert.ok(shearBoundary[0].shear2344Margin < -1e-9, '23.4.4 demand just over capacity has a negative signed margin outside EPS');
assert.ok(Math.abs(shearBoundary[1].shear2344Margin) <= 1e-9, '23.4.4 demand exactly at capacity has a zero signed margin within EPS');
assert.ok(shearBoundary[2].shear2344Margin > 1e-9, '23.4.4 demand just under capacity has a positive signed margin outside EPS');
assert.deepEqual(shearBoundary.map(item => item.shear2344Ok), [0, 1, 1], '23.4.4 shear boundary is inclusive at equality');
assert.deepEqual(shearBoundary.map(item => item.strengthPass), [0, 1, 1], '23.4.4 shear boundary alone controls the final strength outcome');
assert.ok(shearBoundary.every(item => item.angleOk && item.topologyOk && item.tieOk && item.tieLayoutOk && item.strutOk && item.nodesOk && item.pileEffectiveDepthOk), 'all non-shear foundation branches remain passing across the boundary triplet');

const offsetBoundary = [
  stmAdapter.calculate(candidateInput('rc-pile-cap-3d-stm-boundary-offset-over')),
  stmAdapter.calculate(candidateInput('rc-pile-cap-3d-stm-boundary-offset-equal')),
  stmAdapter.calculate(candidateInput('rc-pile-cap-3d-stm-boundary-offset-under')),
];
assert.ok(offsetBoundary[0].tieLayerOffsetMargin < -1e-9, 'tie-layer offset just over the bar-diameter limit has a negative signed margin outside EPS');
assert.ok(Math.abs(offsetBoundary[1].tieLayerOffsetMargin) <= 1e-9, 'tie-layer offset exactly at the bar-diameter limit has a zero signed margin within EPS');
assert.ok(offsetBoundary[2].tieLayerOffsetMargin > 1e-9, 'tie-layer offset just under the bar-diameter limit has a positive signed margin outside EPS');
assert.deepEqual(offsetBoundary.map(item => item.tieLayerOffsetOk), [0, 1, 1], 'tie-layer offset boundary is inclusive at equality');
assert.deepEqual(offsetBoundary.map(item => item.strengthPass), [0, 1, 1], 'tie-layer offset boundary alone controls the final strength outcome');
assert.ok(offsetBoundary.every(item => item.angleOk && item.shearLimitsOk && item.topologyOk && item.tiesOk && item.strutOk && item.nodesOk && item.pileEffectiveDepthOk), 'all non-offset pile-cap branches remain passing across the boundary triplet');

const angleEpsPair = [
  stmAdapter.calculate(candidateInput('rc-deep-beam-stm-eps-angle-inside')),
  stmAdapter.calculate(candidateInput('rc-deep-beam-stm-eps-angle-outside')),
];
assert.ok(angleEpsPair[0].angleMarginDeg < 0 && angleEpsPair[0].angleMarginDeg >= -1e-9, 'negative angle margin inside EPS remains on the accepted side');
assert.ok(angleEpsPair[1].angleMarginDeg < -1e-9, 'negative angle margin outside EPS remains on the rejected side');
assert.deepEqual(angleEpsPair.map(item => item.angleOk), [1, 0], 'angle EPS pair distinguishes tolerance from mathematical equality');
assert.deepEqual(angleEpsPair.map(item => item.strengthPass), [1, 0], 'angle EPS pair alone controls the final strength outcome');
assert.ok(angleEpsPair.every(item => item.tieOk && item.tieLayoutOk && item.strutOk && item.nodesOk && item.distributionOk && item.shearLimitsOk), 'all non-angle deep-beam branches remain passing across the EPS pair');

const shearEpsPair = [
  stmAdapter.calculate(candidateInput('rc-foundation-2d-stm-eps-shear-inside')),
  stmAdapter.calculate(candidateInput('rc-foundation-2d-stm-eps-shear-outside')),
];
assert.ok(shearEpsPair[0].shear2344Margin < 0 && shearEpsPair[0].shear2344Margin >= -1e-9, 'negative 23.4.4 shear margin inside EPS remains on the accepted side');
assert.ok(shearEpsPair[1].shear2344Margin < -1e-9, 'negative 23.4.4 shear margin outside EPS remains on the rejected side');
assert.deepEqual(shearEpsPair.map(item => item.shear2344Ok), [1, 0], '23.4.4 shear EPS pair distinguishes tolerance from mathematical equality');
assert.deepEqual(shearEpsPair.map(item => item.strengthPass), [1, 0], '23.4.4 shear EPS pair alone controls the final strength outcome');
assert.ok(shearEpsPair.every(item => item.angleOk && item.topologyOk && item.tieOk && item.tieLayoutOk && item.strutOk && item.nodesOk && item.pileEffectiveDepthOk), 'all non-shear foundation branches remain passing across the EPS pair');

const offsetEpsPair = [
  stmAdapter.calculate(candidateInput('rc-pile-cap-3d-stm-eps-offset-inside')),
  stmAdapter.calculate(candidateInput('rc-pile-cap-3d-stm-eps-offset-outside')),
];
assert.ok(offsetEpsPair[0].tieLayerOffsetMargin < 0 && offsetEpsPair[0].tieLayerOffsetMargin >= -1e-9, 'negative tie-layer offset margin inside EPS remains on the accepted side');
assert.ok(offsetEpsPair[1].tieLayerOffsetMargin < -1e-9, 'negative tie-layer offset margin outside EPS remains on the rejected side');
assert.deepEqual(offsetEpsPair.map(item => item.tieLayerOffsetOk), [1, 0], 'tie-layer offset EPS pair distinguishes tolerance from mathematical equality');
assert.deepEqual(offsetEpsPair.map(item => item.strengthPass), [1, 0], 'tie-layer offset EPS pair alone controls the final strength outcome');
assert.ok(offsetEpsPair.every(item => item.angleOk && item.shearLimitsOk && item.topologyOk && item.tiesOk && item.strutOk && item.nodesOk && item.pileEffectiveDepthOk), 'all non-offset pile-cap branches remain passing across the EPS pair');
const srcBeamRecord = result.records.find(record => record.route === '/src-beam');
assert.equal(srcBeamRecord.status, 'verified', 'SRC formal closed-form benchmark is verified');
assert.equal(srcBeamRecord.assertionCount, 41, 'SRC formal benchmark covers flexure, compactness, shear allocation and cap control');
const srcColumnRecord = result.records.find(record => record.route === '/src-column');
assert.equal(srcColumnRecord.status, 'verified', 'SRC column formal closed-form benchmark is verified');
assert.equal(srcColumnRecord.assertionCount, 38, 'SRC column formal benchmark covers geometry, compactness, stiffness allocation, compression and interaction');
const rcColumnCoverDeviationRecord = result.records.find(record => record.route === '/rc-column-cover-deviation');
assert.equal(rcColumnCoverDeviationRecord.status, 'verified', 'RC column cover-deviation four-direction benchmark is verified');
assert.equal(rcColumnCoverDeviationRecord.assertionCount, 43, 'RC column cover-deviation benchmark covers four-face geometry, four-direction capacity, retention, utilization, phi and axial cap');

const runnerText = fs.readFileSync(runnerPath, 'utf8');
assert.ok(!runnerText.includes('golden-cases.js'), 'independent runner does not import golden case answers');
assert.ok(!runnerText.includes('pmsection.js'), 'independent runner does not import the production P-M engine');
assert.ok(!/require\([^\n]*column-cover-deviation-core\.js/.test(runnerText), 'cover-deviation oracle does not import the production cover-deviation core');
const coverDeviationBenchmark = catalog.benchmarks.find(item => item.route === '/rc-column-cover-deviation');
assert.equal(coverDeviationBenchmark.productionModule, 'rc/column-cover-deviation-core.js', 'cover-deviation benchmark exercises the production core directly without an oracle adapter');
const coverDeviationAssertionPaths = new Set(coverDeviationBenchmark.assertions.map(assertion => assertion.path));
[
  'calculationPolicy.phiComp',
  'calculationPolicy.phiTen',
  'calculationPolicy.pnMaxFactor',
  'directions.0.design.pMaxTf',
  'directions.0.measured.pMaxTf',
  'directions.0.design.phiMnTfm',
  'directions.0.measured.phiMnTfm',
  'directions.1.design.phiMnTfm',
  'directions.1.measured.phiMnTfm',
  'directions.2.design.phiMnTfm',
  'directions.2.measured.phiMnTfm',
  'directions.3.design.phiMnTfm',
  'directions.3.measured.phiMnTfm',
  'minimumRetentionRatio',
  'maximumMeasuredUtilization',
].forEach(assertionPath => assert.ok(coverDeviationAssertionPaths.has(assertionPath), `cover-deviation benchmark locks ${assertionPath}`));
assert.deepEqual(
  {
    top:coverDeviationBenchmark.input.measuredTopMm - coverDeviationBenchmark.input.designCenterTopMm,
    bottom:coverDeviationBenchmark.input.measuredBottomMm - coverDeviationBenchmark.input.designCenterBottomMm,
    left:coverDeviationBenchmark.input.measuredLeftMm - coverDeviationBenchmark.input.designCenterLeftMm,
    right:coverDeviationBenchmark.input.measuredRightMm - coverDeviationBenchmark.input.designCenterRightMm,
  },
  { top:26, bottom:-13, left:17, right:-9 },
  'cover-deviation benchmark has deliberately asymmetric four-face bar-position offsets'
);

const falsePositiveResult = runBenchmarks(catalog, {
  loadProduction(relativePath) {
    const realModule = require(path.join(toolsRoot, relativePath));
    return {
      validateInput: realModule.validateInput,
      calculate(input) {
        const production = realModule.calculate(input);
        if (relativePath === 'equipment/equipment-load-core.js') production.pointLoad += 0.25;
        if (relativePath === 'independent-engineering-adapters/rc-column-pm.js') production.designM += 0.5;
        if (relativePath === 'rc/column-cover-deviation-core.js') production.directions[0].measured.phiMnTfm += 5;
        if (relativePath === 'independent-engineering-adapters/rc-beam-strength.js') production.phiVnEffective += 500;
        if (relativePath === 'independent-engineering-adapters/rc-stm-strength.js' && input.mode === 'deep-beam') production.tieDemand += 0.5;
        if (relativePath === 'independent-engineering-adapters/rc-stm-strength.js' && input.mode === 'foundation-2d') production.reactionTotal += 0.5;
        if (relativePath === 'independent-engineering-adapters/rc-stm-strength.js' && input.mode === 'pile-cap-3d') production.xTieDemand += 0.5;
        if (relativePath === 'independent-engineering-adapters/rc-shear-wall-strength.js') production.sbeHoriz += 5;
        if (relativePath === 'independent-engineering-adapters/rc-wall-strength.js') production.bearingTensionBoundary.pmPhiMn += 5;
        if (relativePath === 'independent-engineering-adapters/rc-retrofit-section.js') production.columnFrpWrap.pmPhiMnConf += 5;
        if (relativePath === 'independent-engineering-adapters/rc-foundation.js') production.phiVc2Tf += 0.5;
        if (relativePath === 'independent-engineering-adapters/rc-pile.js') production.rMax += 0.5;
        if (relativePath === 'independent-engineering-adapters/steel-beam-asd.js') production.MnOmegaTfm += 0.5;
        if (relativePath === 'independent-engineering-adapters/steel-column-asd.js') production.IR1 += 0.2;
        if (relativePath === 'independent-engineering-adapters/steel-plate-connection.js') production.manualAsd.blockAvailable += 5;
        if (relativePath === 'independent-engineering-adapters/steel-formal.js') production.boltedLrfd.bearingAvailable += 5;
        if (relativePath === 'independent-engineering-adapters/decking.js') production.longUnbracedHeavy.girder.PuMax += 5;
        if (relativePath === 'independent-engineering-adapters/stone-fixing.js') production.backAnchorWindCone.panel.localStress += 5;
        if (relativePath === 'independent-engineering-adapters/rc-slab-strength.js') production.endSpan.phiVc += 0.5;
        if (relativePath === 'independent-engineering-adapters/wind-force-mwfrs.js') production.xVb += 250;
        if (relativePath === 'independent-engineering-adapters/wind-object-solid-table210.js') production.nuControl.torsion += 5;
        if (relativePath === 'independent-engineering-adapters/wind-object-frame.js') production.circularHighBand.force += 5;
        if (relativePath === 'independent-engineering-adapters/wind-lattice-tower.js') production.squareLinearCircularSkew.baseMoment += 5;
        if (relativePath === 'independent-engineering-adapters/wind-object-tower.js') production.circularAutoHighSpecifiedTop.baseMoment += 5;
        if (relativePath === 'independent-engineering-adapters/wind-fence-sign.js') production.elevatedInterpolated.baseMoment += 5;
        if (relativePath === 'independent-engineering-adapters/wind-sign-pole.js') production.pipeThresholdSplit.totalMoment += 5;
        if (relativePath === 'independent-engineering-adapters/wind-cc.js') production.highPartialWall.pNeg += 5;
        if (relativePath === 'independent-engineering-adapters/wind-parapet.js') production.buildingCc.windward_corner.pDiff += 5;
        if (relativePath === 'independent-engineering-adapters/wind-open-roof.js') production.monoUnblockedSmallInterp.zone3.pNeg += 5;
        if (relativePath === 'independent-engineering-adapters/seismic-force-static.js') production.Vdesign += 25;
        if (relativePath === 'independent-engineering-adapters/seismic-appendage.js') production.maximum.Fpv += 0.25;
        if (relativePath === 'independent-engineering-adapters/seismic-misc.js') production.flexible.Vh += 0.25;
        if (relativePath === 'independent-engineering-adapters/anchor-cast-in.js') production.interactionDcr += 0.1;
        if (relativePath === 'independent-engineering-adapters/src-beam.js') production.doubleReinforced490.mnRcTfM += 0.5;
        if (relativePath === 'independent-engineering-adapters/src-column.js') production.officialGuideExample8.grossAreaCm2 += 1;
        return production;
      }
    };
  }
});
assert.equal(falsePositiveResult.status, 'blocked', 'independent benchmark detects production drift');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:pointLoad')), 'production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:designM')), 'RC column P-M production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('rc-column-cover-deviation-four-direction:benchmark-value-mismatch:directions.0.measured.phiMnTfm')), 'RC column cover-deviation production drift identifies the mismatched directional capacity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:phiVnEffective')), 'RC beam seismic shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('rc-deep-beam-stm-strength:benchmark-value-mismatch:tieDemand')), 'deep-beam STM tie-force drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('rc-deep-beam-stm-minimum-steel-four-row:benchmark-value-mismatch:tieDemand')), 'four-row deep-beam STM tie-force drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('rc-deep-beam-stm-reject-low-angle:benchmark-value-mismatch:tieDemand')), 'low-angle deep-beam rejection case still detects tie-force drift');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('rc-foundation-2d-stm-strength:benchmark-value-mismatch:reactionTotal')), 'foundation 2D STM equilibrium drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('rc-foundation-2d-stm-uniform-soil-2344:benchmark-value-mismatch:reactionTotal')), 'uniform-soil foundation STM equilibrium drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('rc-foundation-2d-stm-reject-shear-2344:benchmark-value-mismatch:reactionTotal')), 'shear-rejection foundation STM case still detects equilibrium drift');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('rc-pile-cap-3d-stm-strength:benchmark-value-mismatch:xTieDemand')), 'pile-cap 3D STM tie-force drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('rc-pile-cap-3d-stm-six-pile-2344:benchmark-value-mismatch:xTieDemand')), 'six-pile 3D STM tie-force drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('rc-pile-cap-3d-stm-reject-tie-layer-offset:benchmark-value-mismatch:xTieDemand')), 'tie-layer rejection pile-cap case still detects tie-force drift');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:sbeHoriz')), 'RC shear-wall boundary-element drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:bearingTensionBoundary.pmPhiMn')), 'RC wall tension-bending capacity drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:columnFrpWrap.pmPhiMnConf')), 'RC retrofit column P-M drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:phiVc2Tf')), 'RC foundation punching production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:rMax')), 'RC pile group-reaction production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:MnOmegaTfm')), 'steel beam ASD production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:IR1')), 'steel column ASD interaction drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:manualAsd.blockAvailable')), 'steel plate ASD block-shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:boltedLrfd.bearingAvailable')), 'steel formal bolt-bearing drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:longUnbracedHeavy.girder.PuMax')), 'decking load-path drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:backAnchorWindCone.panel.localStress')), 'stone-fixing panel and connector load-path drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:endSpan.phiVc')), 'RC slab one-way shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:xVb')), 'wind-force base-shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:nuControl.torsion')), 'solid-object skew-wind torsion drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:circularHighBand.force')), 'porous-frame high-D√q(z) force drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:squareLinearCircularSkew.baseMoment')), 'lattice-tower segmented base-moment drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:elevatedInterpolated.baseMoment')), 'fence/sign elevated base-moment drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:pipeThresholdSplit.totalMoment')), 'sign-pole composite base-moment drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:highPartialWall.pNeg')), 'wind C&C partial-enclosure negative-pressure drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:buildingCc.windward_corner.pDiff')), 'wind parapet corner pressure-difference drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:monoUnblockedSmallInterp.zone3.pNeg')), 'wind open-roof interpolated suction drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:Vdesign')), 'seismic-force design base-shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:maximum.Fpv')), 'seismic-appendage near-fault vertical-force drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:flexible.Vh')), 'seismic-misc flexible Chapter 5 force drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:interactionDcr')), 'anchor tension-shear interaction drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:doubleReinforced490.mnRcTfM')), 'SRC formal flexural drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:officialGuideExample8.grossAreaCm2')), 'SRC column gross-area drift identifies the mismatched quantity');

const falseAcceptanceResult = runBenchmarks(catalog, {
  loadProduction(relativePath, benchmark) {
    const realModule = require(path.join(toolsRoot, relativePath));
    return {
      validateInput: realModule.validateInput,
      calculate(input) {
        const production = realModule.calculate(input);
        if (benchmark.expectedOutcome === 'strength-reject') production.strengthPass = 1;
        return production;
      }
    };
  }
});
assert.equal(falseAcceptanceResult.status, 'blocked', 'independent benchmark blocks production that falsely accepts an expected rejection case');
for (const id of expectedRejectionIds) {
  assert.ok(
    falseAcceptanceResult.issues.some(issue => issue.includes(`${id}:expected-outcome-mismatch:production:actual=1:expected=0`)),
    `${id} false acceptance is reported as an outcome mismatch`
  );
}

const falseRejectionResult = runBenchmarks(catalog, {
  loadProduction(relativePath, benchmark) {
    const realModule = require(path.join(toolsRoot, relativePath));
    return {
      validateInput: realModule.validateInput,
      calculate(input) {
        const production = realModule.calculate(input);
        if (benchmark.expectedOutcome === 'strength-pass') production.strengthPass = 0;
        return production;
      }
    };
  }
});
assert.equal(falseRejectionResult.status, 'blocked', 'independent benchmark blocks production that falsely rejects an expected passing case');
for (const id of catalog.candidateBenchmarks.filter(item => item.expectedOutcome === 'strength-pass').map(item => item.id)) {
  assert.ok(
    falseRejectionResult.issues.some(issue => issue.includes(`${id}:expected-outcome-mismatch:production:actual=0:expected=1`)),
    `${id} false rejection is reported as an outcome mismatch`
  );
}

const duplicateCatalog = JSON.parse(JSON.stringify(catalog));
duplicateCatalog.benchmarks[1].route = duplicateCatalog.benchmarks[0].route;
assert.ok(validateCatalog(duplicateCatalog).some(issue => issue.includes('unique-route')), 'duplicate benchmark routes are rejected');

const unknownFieldCatalog = JSON.parse(JSON.stringify(catalog));
unknownFieldCatalog.benchmarks[0].expected = 123;
assert.ok(validateCatalog(unknownFieldCatalog).some(issue => issue.includes(':keys:')), 'unknown expected-answer fields are rejected');

const missingOutcomeCatalog = JSON.parse(JSON.stringify(catalog));
delete missingOutcomeCatalog.candidateBenchmarks[0].expectedOutcome;
assert.ok(validateCatalog(missingOutcomeCatalog).some(issue => issue.includes('expected-outcome')), 'candidate benchmark outcome intent is required');

const missingStrengthPassAssertionCatalog = JSON.parse(JSON.stringify(catalog));
missingStrengthPassAssertionCatalog.candidateBenchmarks[0].assertions = missingStrengthPassAssertionCatalog.candidateBenchmarks[0].assertions
  .filter(assertion => assertion.path !== 'strengthPass');
assert.ok(validateCatalog(missingStrengthPassAssertionCatalog).some(issue => issue.includes('strength-pass-assertion-required')), 'candidate benchmarks must assert the final strength outcome');

assert.deepEqual(
  [...new Set(catalog.candidateBenchmarks.map(item => item.capability))].sort(),
  ['rc-deep-beam-stm', 'rc-foundation-2d-stm', 'rc-pile-cap-3d-stm'],
  'supplemental STM boundary capabilities remain explicitly identified after formal-route promotion'
);
for (const capability of ['rc-deep-beam-stm', 'rc-foundation-2d-stm', 'rc-pile-cap-3d-stm']) {
  assert.equal(catalog.candidateBenchmarks.filter(item => item.capability === capability).length, 7, `${capability} retains supplemental passing, rejection, numerical-boundary and EPS cases`);
  assert.equal(catalog.candidateBenchmarks.filter(item => item.capability === capability && item.expectedOutcome === 'strength-pass').length, 4, `${capability} retains four supplemental passing cases`);
  assert.equal(catalog.candidateBenchmarks.filter(item => item.capability === capability && item.expectedOutcome === 'strength-reject').length, 3, `${capability} retains three explicit rejection cases`);
}

console.log('Independent engineering benchmarks tests passed.');
