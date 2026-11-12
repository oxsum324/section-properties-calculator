'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { inventory, classify, compare, declaredChecks, validCache } = require('./local-quick-impact');

const registry = inventory();
const [tool, second] = registry.routes;
assert.equal(registry.routes.length, 7);
const plan = (...files) => classify(files, registry);
assert.deepEqual(plan(tool.page, second.test).routes, [tool.route, second.route]);
assert.deepEqual(plan().routes, []);
const other = registry.catalogue.find(entry => !registry.routes.some(item => item.route === entry.route));
assert.deepEqual(plan(other.file).routes, []);
for (const file of [tool.core, tool.golden, '結構工具箱/core/ui/report.js', '新資料夾/未登錄.js',
  '結構工具箱/tools/nav/build-family-pages.js', '結構工具箱/tools/independent-engineering-benchmarks.js']) {
  const selection = plan(tool.page, file);
  assert.equal(selection.fullFamily, true, file);
  assert.equal(selection.routes.length, registry.routes.length, file);
}
const records = [{ script: tool.test, stdout: 'OK', exit: 0, error: null }];
const digest = crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
const cache = { records, key: 'key', digest };
assert.ok(validCache(cache, 'key', [tool.test]));
for (const copy of [{ ...cache, key: 'old' }, { ...cache, records: [] },
  { ...cache, records: [{ ...records[0], stdout: '' }] }]) {
  assert.equal(validCache(copy, 'key', [tool.test]), false);
}
const sha = 'a'.repeat(40);
const pilot = { sha, clean: true, pass: true, plan: { routes: [tool.route] },
  records: [...records, { script: '結構工具箱/tools/sync-home-update-dates.js', args: ['--check', '--dates-only'], exit: 0, error: null }],
  navigation: Array.from({ length: 3 }, () => ({ exit: 0, error: null })) };
const expected = declaredChecks(fs.readFileSync(path.join(__dirname, '../preflight-tools.ps1'), 'utf8').replace(/\r\n/g, '\n'));
const full = { sourceCommitSha: sha, sourceDirty: false, quick: false, ci: false, pass: true, failureCount: 0,
  recordsCount: expected.records.length, passedCount: expected.records.length, postCheckCount: expected.post.length,
  postChecksPassedCount: expected.post.length, postChecks: expected.post.map(key => ({ key, pass: true })),
  records: expected.records.map(key => ({ key, pass: true, reused: false, exitCode: 0 })) };
assert.ok(compare(pilot, full, expected).sameHeadFullPass);
const withoutIndependent = full.records.filter(r => r.key !== 'independent-engineering-benchmarks');
for (const change of [{ quick: true }, { sourceDirty: true }, { sourceCommitSha: 'b'.repeat(40) },
  { records: [] }, { postChecks: [] }, { postChecks: [{ pass: false }] }, { failureCount: 1 },
  { records: withoutIndependent, recordsCount: withoutIndependent.length, passedCount: withoutIndependent.length },
  { records: full.records.map(r => r.key === 'local-quick-tools-runner' ? { ...r, reused: true } : r) }]) {
  assert.equal(compare(pilot, { ...full, ...change }, expected).sameHeadFullPass, false);
}
assert.equal(compare({ ...pilot, clean: false }, full, expected).sameHeadFullPass, false);
assert.equal(compare({ ...pilot, records: [] }, full, expected).sameHeadFullPass, false);
console.log('局部快算影響範圍、快取完整性、全量比對測試通過');
