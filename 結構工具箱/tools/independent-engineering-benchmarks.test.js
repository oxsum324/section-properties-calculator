const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateCatalog, runBenchmarks } = require('./independent-engineering-benchmarks.js');

const toolsRoot = __dirname;
const catalogPath = path.join(toolsRoot, 'independent-engineering-benchmarks.catalog.json');
const runnerPath = path.join(toolsRoot, 'independent-engineering-benchmarks.js');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8').replace(/^\uFEFF/, ''));

assert.deepEqual(validateCatalog(catalog), [], 'independent engineering benchmark catalog is valid');
const rcColumnAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-column-pm.js'), 'utf8');
assert.ok(rcColumnAdapterSource.includes("require('../../../鋼筋混凝土/shared/pmsection.js')"), 'RC column adapter exercises the production P-M engine');
assert.ok(!rcColumnAdapterSource.includes('golden'), 'RC column adapter does not replay a golden-case fixture');
const rcFoundationAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-foundation.js'), 'utf8');
assert.ok(rcFoundationAdapterSource.includes("require('../../../鋼筋混凝土/shared/foundation-isolated.js')"), 'RC foundation adapter exercises the production isolated-footing strength core');
assert.ok(!rcFoundationAdapterSource.includes('golden'), 'RC foundation adapter does not replay a golden-case fixture');
const rcPileAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'rc-pile.js'), 'utf8');
assert.ok(rcPileAdapterSource.includes("require('../../../鋼筋混凝土/shared/foundation-pile.js')"), 'RC pile adapter exercises the production pile axial, group and pile-cap core');
assert.ok(!rcPileAdapterSource.includes('golden'), 'RC pile adapter does not replay a golden-case fixture');
const steelBeamAdapterSource = fs.readFileSync(path.join(toolsRoot, 'independent-engineering-adapters', 'steel-beam-asd.js'), 'utf8');
assert.ok(steelBeamAdapterSource.includes("../../../鋼構工具/core/materials/steel.js"), 'steel beam adapter exercises the production steel member core');
assert.ok(!steelBeamAdapterSource.includes('golden'), 'steel beam adapter does not replay a golden-case fixture');

const result = runBenchmarks(catalog);
assert.equal(result.status, 'ready', JSON.stringify(result.issues));
assert.equal(result.summary.eligibleFormalRoutes, 31, 'formal route portfolio is explicit');
assert.equal(result.summary.pilotRequired, 7, 'seven independent pilot benchmarks required');
assert.equal(result.summary.pilotVerified, 7, 'seven independent pilot benchmarks verified');
assert.equal(result.summary.independentlyVerifiedRoutes, 7, 'seven distinct routes independently verified');
assert.equal(result.summary.priorityTargets, 4, 'four high-risk routes remain in priority roadmap');
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
        if (relativePath === 'independent-engineering-adapters/rc-foundation.js') production.phiVc2Tf += 0.5;
        if (relativePath === 'independent-engineering-adapters/rc-pile.js') production.rMax += 0.5;
        if (relativePath === 'independent-engineering-adapters/steel-beam-asd.js') production.MnOmegaTfm += 0.5;
        return production;
      }
    };
  }
});
assert.equal(falsePositiveResult.status, 'blocked', 'independent benchmark detects production drift');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:pointLoad')), 'production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:designM')), 'RC column P-M production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:phiVc2Tf')), 'RC foundation punching production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:rMax')), 'RC pile group-reaction production drift identifies the mismatched quantity');
assert.ok(falsePositiveResult.issues.some(issue => issue.includes('benchmark-value-mismatch:MnOmegaTfm')), 'steel beam ASD production drift identifies the mismatched quantity');

const duplicateCatalog = JSON.parse(JSON.stringify(catalog));
duplicateCatalog.benchmarks[1].route = duplicateCatalog.benchmarks[0].route;
assert.ok(validateCatalog(duplicateCatalog).some(issue => issue.includes('unique-route')), 'duplicate benchmark routes are rejected');

const unknownFieldCatalog = JSON.parse(JSON.stringify(catalog));
unknownFieldCatalog.benchmarks[0].expected = 123;
assert.ok(validateCatalog(unknownFieldCatalog).some(issue => issue.includes(':keys:')), 'unknown expected-answer fields are rejected');

console.log('Independent engineering benchmarks tests passed.');
