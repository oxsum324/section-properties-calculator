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
const windForceAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'wind-force-mwfrs.js'), 'utf8');
assert.ok(windForceAdapterSource.includes("../../core/loads/wind.js"), 'wind-force adapter exercises the production MWFRS wind core');
assert.ok(!windForceAdapterSource.includes('golden'), 'wind-force adapter does not replay a golden-case fixture');
const seismicForceAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'seismic-force-static.js'), 'utf8');
assert.ok(seismicForceAdapterSource.includes("../../core/loads/seismic.js"), 'seismic-force adapter exercises the production static seismic core');
assert.ok(!seismicForceAdapterSource.includes('golden'), 'seismic-force adapter does not replay a golden-case fixture');
const anchorAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'anchor-cast-in.js'), 'utf8');
assert.ok(anchorAdapterSource.includes("'螺栓檢討', 'bolt-review-tool', 'src'"), 'anchor adapter resolves the production anchor source tree');
assert.ok(anchorAdapterSource.includes("require(path.join(anchorSourceRoot, 'calc.ts'))"), 'anchor adapter exercises the production Chapter 17 calculation core');
assert.ok(!anchorAdapterSource.includes('golden'), 'anchor adapter does not replay a golden-case fixture');
const anchorBackupSource = fs.readFileSync(path.join(toolsRoot, '..', '..', '螺栓檢討', 'bolt-review-tool', 'src', 'backup.ts'), 'utf8');
assert.ok(anchorBackupSource.includes("import { evaluateProjectBatch } from './calc'"), 'anchor formal workspace replay remains connected to the benchmarked production core');

const result = runBenchmarks(catalog);
assert.equal(result.status, 'ready', JSON.stringify(result.issues));
assert.equal(result.summary.eligibleFormalRoutes, 31, 'formal route portfolio is explicit');
assert.equal(result.summary.pilotRequired, 12, 'twelve independent pilot benchmarks required');
assert.equal(result.summary.pilotVerified, 12, 'twelve independent pilot benchmarks verified');
assert.equal(result.summary.independentlyVerifiedRoutes, 12, 'twelve distinct routes independently verified');
assert.equal(result.summary.priorityTargets, 4, 'four P1 routes remain in the independent benchmark roadmap');
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
        if (relativePath === 'independent-engineering-adapters/rc-foundation.js') production.phiVc2Tf += 0.5;
        if (relativePath === 'independent-engineering-adapters/rc-pile.js') production.rMax += 0.5;
        if (relativePath === 'independent-engineering-adapters/steel-beam-asd.js') production.MnOmegaTfm += 0.5;
        if (relativePath === 'independent-engineering-adapters/steel-column-asd.js') production.IR1 += 0.2;
        if (relativePath === 'independent-engineering-adapters/wind-force-mwfrs.js') production.xVb += 250;
        if (relativePath === 'independent-engineering-adapters/seismic-force-static.js') production.Vdesign += 25;
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
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:phiVc2Tf')), 'RC foundation punching production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:rMax')), 'RC pile group-reaction production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:MnOmegaTfm')), 'steel beam ASD production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:IR1')), 'steel column ASD interaction drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:xVb')), 'wind-force base-shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:Vdesign')), 'seismic-force design base-shear drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:interactionDcr')), 'anchor tension-shear interaction drift identifies the mismatched quantity');

const duplicateCatalog = JSON.parse(JSON.stringify(catalog));
duplicateCatalog.benchmarks[1].route = duplicateCatalog.benchmarks[0].route;
assert.ok(validateCatalog(duplicateCatalog).some(issue => issue.includes('unique-route')), 'duplicate benchmark routes are rejected');

const unknownFieldCatalog = JSON.parse(JSON.stringify(catalog));
unknownFieldCatalog.benchmarks[0].expected = 123;
assert.ok(validateCatalog(unknownFieldCatalog).some(issue => issue.includes(':keys:')), 'unknown expected-answer fields are rejected');

console.log('Independent engineering benchmarks tests passed.');
