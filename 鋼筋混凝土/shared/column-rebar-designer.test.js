const assert = require('node:assert/strict');
global.window = global;
require('../../結構工具箱/core/materials/rebar.js');
require('./column-rebar-designer.js');

const table = global.Rebar.REBAR_TABLE;
const result = global.ColumnRebarDesigner.search({
  b:60, h:60, cover:4, tieDb:table['#4'].db, barTable:table, limit:5,
  evaluateCandidate:candidate => ({
    ok:candidate.Ast >= 45,
    utilization:45 / candidate.Ast,
    phiMnX:120,
    phiMnY:120,
  }),
});
assert.equal(result.status, 'evaluated');
assert.equal(result.candidates.length, 5);
assert.ok(result.candidates.every(candidate => candidate.Ast >= 45 && candidate.rhog >= 0.01 && candidate.rhog <= 0.08));
for (let index = 1; index < result.candidates.length; index += 1) {
  assert.ok(result.candidates[index].Ast + 1e-9 >= result.candidates[index - 1].Ast);
}

const noSolution = global.ColumnRebarDesigner.search({
  b:25, h:25, cover:8, tieDb:table['#4'].db, barTable:table,
  evaluateCandidate:() => ({ ok:true, utilization:0.5 }),
});
assert.equal(noSolution.status, 'no-solution');

const invalid = global.ColumnRebarDesigner.search({ b:60, h:60, cover:4, tieDb:1.27 });
assert.equal(invalid.status, 'invalid-input');

console.log('column rebar designer unit: PASS', { candidates:result.candidates.length, evaluated:result.evaluatedCount });
