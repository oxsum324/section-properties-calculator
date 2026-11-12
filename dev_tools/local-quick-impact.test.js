'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { inventory, classify, compare, validCache } = require('./local-quick-impact');

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
const full = { sourceCommitSha: sha, sourceDirty: false, quick: false, ci: false, pass: true, failureCount: 0,
  recordsCount: 2, passedCount: 2, postCheckCount: 1, postChecksPassedCount: 1, postChecks: [{ pass: true }],
  records: ['local-quick-tools-static', 'local-quick-tools-runner'].map(key => ({ key, pass: true, reused: false, exitCode: 0 })) };
assert.ok(compare(pilot, full).sameHeadFullPass);
for (const change of [{ quick: true }, { sourceDirty: true }, { sourceCommitSha: 'b'.repeat(40) },
  { records: [] }, { postChecks: [] }, { postChecks: [{ pass: false }] }, { failureCount: 1 },
  { records: [full.records[0], { ...full.records[1], reused: true }] }]) {
  assert.equal(compare(pilot, { ...full, ...change }).sameHeadFullPass, false);
}
assert.equal(compare({ ...pilot, clean: false }, full).sameHeadFullPass, false);
assert.equal(compare({ ...pilot, records: [] }, full).sameHeadFullPass, false);
console.log('局部快算影響範圍、快取完整性、全量比對測試通過');
