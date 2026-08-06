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
assert.ok(!rcBeamAdapterSource.includes('golden'), 'RC beam adapter does not replay a golden-case fixture');
const rcShearWallAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-shear-wall-strength.js'), 'utf8');
assert.ok(rcShearWallAdapterSource.includes("../../../鋼筋混凝土/shared/pmsection.js"), 'RC shear-wall adapter exercises the production P-M engine');
assert.ok(rcShearWallAdapterSource.includes("../../../鋼筋混凝土/shared/wall-base.js"), 'RC shear-wall adapter exercises the production wall base assembly');
assert.ok(rcShearWallAdapterSource.includes("../../../鋼筋混凝土/shared/wall-evaluator.js"), 'RC shear-wall adapter exercises the production load-case evaluator');
assert.ok(!rcShearWallAdapterSource.includes('golden'), 'RC shear-wall adapter does not replay a golden-case fixture');
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

const result = runBenchmarks(catalog);
assert.equal(result.status, 'ready', JSON.stringify(result.issues));
assert.equal(result.summary.eligibleFormalRoutes, 31, 'formal route portfolio is explicit');
assert.equal(result.summary.pilotRequired, 22, 'twenty-two independent pilot benchmarks required');
assert.equal(result.summary.pilotVerified, 22, 'twenty-two independent pilot benchmarks verified');
assert.equal(result.summary.independentlyVerifiedRoutes, 22, 'twenty-two distinct routes independently verified');
assert.equal(result.summary.priorityTargets, 0, 'no priority route remains in the independent benchmark roadmap');
assert.equal(result.priorityTargets.some(target => target.priority === 'P0'), false, 'no P0 route remains in the independent benchmark roadmap');
assert.equal(result.summary.issueCount, 0, 'independent pilot has no issues');
assert.ok(result.records.every(record => record.status === 'verified'), 'every pilot record is independently verified');
assert.ok(result.records.every(record => record.referenceType === 'closed-form-identity'), 'every pilot uses a closed-form identity');

const runnerText = fs.readFileSync(runnerPath, 'utf8');
assert.ok(!runnerText.includes('golden-cases.js'), 'independent runner does not import golden case answers');

const falsePositiveResult = runBenchmarks(catalog, {
  loadProduction(relativePath) {
    const realModule = require(path.join(toolsRoot, relativePath));
    return {
      validateInput: realModule.validateInput,
      calculate(input) {
        const production = realModule.calculate(input);
        if (relativePath === 'equipment/equipment-load-core.js') production.pointLoad += 0.25;
        if (relativePath === 'independent-engineering-adapters/rc-column-pm.js') production.designM += 0.5;
        if (relativePath === 'independent-engineering-adapters/rc-beam-strength.js') production.phiVnEffective += 500;
        if (relativePath === 'independent-engineering-adapters/rc-shear-wall-strength.js') production.sbeHoriz += 5;
        if (relativePath === 'independent-engineering-adapters/rc-foundation.js') production.phiVc2Tf += 0.5;
        if (relativePath === 'independent-engineering-adapters/rc-pile.js') production.rMax += 0.5;
        if (relativePath === 'independent-engineering-adapters/steel-beam-asd.js') production.MnOmegaTfm += 0.5;
        if (relativePath === 'independent-engineering-adapters/steel-column-asd.js') production.IR1 += 0.2;
        if (relativePath === 'independent-engineering-adapters/steel-plate-connection.js') production.manualAsd.blockAvailable += 5;
        if (relativePath === 'independent-engineering-adapters/rc-slab-strength.js') production.endSpan.phiVc += 0.5;
        if (relativePath === 'independent-engineering-adapters/wind-force-mwfrs.js') production.xVb += 250;
        if (relativePath === 'independent-engineering-adapters/wind-object-solid-table210.js') production.nuControl.torsion += 5;
        if (relativePath === 'independent-engineering-adapters/wind-object-frame.js') production.circularHighBand.force += 5;
        if (relativePath === 'independent-engineering-adapters/wind-cc.js') production.highPartialWall.pNeg += 5;
        if (relativePath === 'independent-engineering-adapters/wind-parapet.js') production.buildingCc.windward_corner.pDiff += 5;
        if (relativePath === 'independent-engineering-adapters/wind-open-roof.js') production.monoUnblockedSmallInterp.zone3.pNeg += 5;
        if (relativePath === 'independent-engineering-adapters/seismic-force-static.js') production.Vdesign += 25;
        if (relativePath === 'independent-engineering-adapters/seismic-appendage.js') production.maximum.Fpv += 0.25;
        if (relativePath === 'independent-engineering-adapters/seismic-misc.js') production.flexible.Vh += 0.25;
        if (relativePath === 'independent-engineering-adapters/anchor-cast-in.js') production.interactionDcr += 0.1;
        return production;
      }
    };
  }
});
assert.equal(falsePositiveResult.status, 'blocked', 'independent benchmark detects production drift');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:pointLoad')), 'production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:designM')), 'RC column P-M production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:phiVnEffective')), 'RC beam seismic shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:sbeHoriz')), 'RC shear-wall boundary-element drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:phiVc2Tf')), 'RC foundation punching production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:rMax')), 'RC pile group-reaction production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:MnOmegaTfm')), 'steel beam ASD production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:IR1')), 'steel column ASD interaction drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:manualAsd.blockAvailable')), 'steel plate ASD block-shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:endSpan.phiVc')), 'RC slab one-way shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:xVb')), 'wind-force base-shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:nuControl.torsion')), 'solid-object skew-wind torsion drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:circularHighBand.force')), 'porous-frame high-D√q(z) force drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:highPartialWall.pNeg')), 'wind C&C partial-enclosure negative-pressure drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:buildingCc.windward_corner.pDiff')), 'wind parapet corner pressure-difference drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:monoUnblockedSmallInterp.zone3.pNeg')), 'wind open-roof interpolated suction drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:Vdesign')), 'seismic-force design base-shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:maximum.Fpv')), 'seismic-appendage near-fault vertical-force drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:flexible.Vh')), 'seismic-misc flexible Chapter 5 force drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:interactionDcr')), 'anchor tension-shear interaction drift identifies the mismatched quantity');

const duplicateCatalog = JSON.parse(JSON.stringify(catalog));
duplicateCatalog.benchmarks[1].route = duplicateCatalog.benchmarks[0].route;
assert.ok(validateCatalog(duplicateCatalog).some(issue => issue.includes('unique-route')), 'duplicate benchmark routes are rejected');

const unknownFieldCatalog = JSON.parse(JSON.stringify(catalog));
unknownFieldCatalog.benchmarks[0].expected = 123;
assert.ok(validateCatalog(unknownFieldCatalog).some(issue => issue.includes(':keys:')), 'unknown expected-answer fields are rejected');

console.log('Independent engineering benchmarks tests passed.');
