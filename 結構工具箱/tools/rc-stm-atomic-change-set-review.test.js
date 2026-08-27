const assert = require('assert');
const childProcess = require('child_process');
const path = require('path');
const atomicChangeSet = require('./rc-stm-atomic-change-set.js');
const reviewer = require('./rc-stm-atomic-change-set-review.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const manifest = atomicChangeSet.loadRcStmAtomicChangeSet(repoRoot);
const clone = value => JSON.parse(JSON.stringify(value));
const calculationPath = manifest.groups.find(group => group.key === 'calculation-core').paths[0];
const governancePath = '結構工具箱/tools/rc-stm-atomic-change-set-review.test.js';
const outsidePath = '鋼筋混凝土/tools/wall.html';

assert.deepEqual(
  reviewer.parseGitStatusPorcelain(` M ${calculationPath}\0?? ${governancePath}\0M  ${outsidePath}\0`),
  [
    { code: ' M', indexStatus: ' ', worktreeStatus: 'M', path: calculationPath, originalPath: '' },
    { code: '??', indexStatus: '?', worktreeStatus: '?', path: governancePath, originalPath: '' },
    { code: 'M ', indexStatus: 'M', worktreeStatus: ' ', path: outsidePath, originalPath: '' },
  ],
  'NUL-delimited Git status preserves staged, unstaged and untracked paths',
);
assert.deepEqual(
  reviewer.parseGitStatusPorcelain('R  new-name.js\0old-name.js\0'),
  [{ code: 'R ', indexStatus: 'R', worktreeStatus: ' ', path: 'new-name.js', originalPath: 'old-name.js' }],
  'rename status preserves both paths',
);
assert.throws(() => reviewer.parseGitStatusPorcelain('R  missing-source.js\0'), /missing its original path/, 'malformed rename fails closed');
assert.equal(reviewer.classifyRole('鋼筋混凝土/tools/deep-beam-stm.html', 'runtime-pages-and-handoffs'), 'page', 'HTML is classified as a page');
assert.equal(reviewer.classifyRole('鋼筋混凝土/shared/deep-beam-stm.test.js', 'calculation-core'), 'test', 'test source is classified before its functional group');
assert.equal(reviewer.classifyRole('鋼筋混凝土/shared/deep-beam-stm.js', 'calculation-core'), 'calculation-source', 'calculation source keeps its engineering role');

const duplicateManifest = clone(manifest);
duplicateManifest.groups[0].paths.push(duplicateManifest.groups[0].paths[0]);
assert.ok(atomicChangeSet.validateRcStmAtomicChangeSet(duplicateManifest, { repoRoot }).includes('duplicate-path'), 'shared validator rejects duplicate ownership');
const unsafeManifest = clone(manifest);
unsafeManifest.groups[0].paths[0] = '../outside.js';
assert.ok(atomicChangeSet.validateRcStmAtomicChangeSet(unsafeManifest, { repoRoot }).includes('unsafe-path:../outside.js'), 'shared validator rejects traversal');
const undeclaredManifest = { ...clone(manifest), undeclared: true };
assert.ok(atomicChangeSet.validateRcStmAtomicChangeSet(undeclaredManifest, { repoRoot }).includes('top-level-schema'), 'shared validator rejects undeclared top-level fields');
const unlistedHandoffManifest = clone(manifest);
unlistedHandoffManifest.handoffs[0].contractPaths.push('鋼筋混凝土/tools/wall.html');
assert.ok(atomicChangeSet.validateRcStmAtomicChangeSet(unlistedHandoffManifest, { repoRoot })
  .some(issue => issue.includes('handoff-path-not-listed:rc-beam-design-to-stm:鋼筋混凝土/tools/wall.html')), 'shared validator rejects a handoff path outside the atomic groups');
const missingAnchorManifest = clone(manifest);
missingAnchorManifest.handoffs.find(item => item.key === 'frame-basic-components-to-pile-cap-stm').sourcePaths = [
  '結構工具箱/core/loads/loadcombo.js',
];
assert.ok(atomicChangeSet.validateRcStmAtomicChangeSet(missingAnchorManifest, { repoRoot })
  .includes('handoff-source-anchor:frame-basic-components-to-pile-cap-stm'), 'shared validator rejects a handoff with its sender anchor removed');

const sampleStatuses = [
  reviewer.decorateStatus({ code: ' M', indexStatus: ' ', worktreeStatus: 'M', path: calculationPath, originalPath: '' }),
  reviewer.decorateStatus({ code: '??', indexStatus: '?', worktreeStatus: '?', path: governancePath, originalPath: '' }),
  reviewer.decorateStatus({ code: ' M', indexStatus: ' ', worktreeStatus: 'M', path: outsidePath, originalPath: '' }),
];
const preview = reviewer.buildReview(repoRoot, manifest, { statusRecords: sampleStatuses });
assert.equal(preview.pass, true, 'read-only preview accepts a complete manifest even when changes are not staged');
assert.equal(preview.manifest.valid, true, 'current manifest passes the shared validator');
assert.equal(preview.manifest.handoffCount, 4, 'review exposes all four governed handoffs');
assert.equal(preview.manifest.declaredPathCount, new Set(manifest.groups.flatMap(group => group.paths)).size, 'review reports the exact declared path count');
assert.equal(preview.worktree.manifestChangedPathCount, 2, 'review separates manifest changes');
assert.equal(preview.worktree.outsideManifestChangedPathCount, 1, 'review separates outside-manifest hot files');
assert.equal(preview.worktree.groups.find(group => group.key === 'calculation-core').changedCount, 1, 'review groups calculation changes');
assert.equal(preview.worktree.groups.find(group => group.key === 'formal-attachment-evidence').changedCount, 1, 'review groups governance changes');
assert.equal(preview.worktree.roleCounts['calculation-source'], 1, 'review summarizes calculation sources by role');
assert.equal(preview.worktree.roleCounts.test, 1, 'review summarizes the governed test role');
assert.equal(preview.worktree.roleCounts.page, 1, 'review classifies an outside HTML hot file as a page');
assert.ok(reviewer.renderMarkdown(preview).includes('## 清冊外熱檔'), 'human review names outside-manifest hot files without calling them unrelated');
assert.ok(reviewer.renderMarkdown(preview).includes('## 變更檔案角色'), 'human review exposes role counts');
assert.ok(reviewer.renderMarkdown(preview).includes('## 跨工具 Handoff'), 'human review exposes cross-tool handoff edges');
assert.ok(reviewer.renderMarkdown(preview).includes(outsidePath), 'human review lists the exact outside-manifest path');

const unstagedClosure = reviewer.buildReview(repoRoot, manifest, { statusRecords: sampleStatuses, requireStagedClosure: true });
assert.equal(unstagedClosure.pass, false, 'staged closure rejects unstaged manifest changes');
assert.ok(unstagedClosure.stagedClosure.issues.includes('no-manifest-changes-staged'), 'staged closure explains an empty manifest stage');

const closedStatuses = [
  reviewer.decorateStatus({ code: 'M ', indexStatus: 'M', worktreeStatus: ' ', path: calculationPath, originalPath: '' }),
  reviewer.decorateStatus({ code: 'A ', indexStatus: 'A', worktreeStatus: ' ', path: governancePath, originalPath: '' }),
  reviewer.decorateStatus({ code: ' M', indexStatus: ' ', worktreeStatus: 'M', path: outsidePath, originalPath: '' }),
];
const closed = reviewer.buildReview(repoRoot, manifest, { statusRecords: closedStatuses, requireStagedClosure: true });
assert.equal(closed.pass, true, 'staged closure permits unrelated unstaged work to remain outside the atomic commit');
assert.deepEqual(closed.stagedClosure.issues, [], 'closed stage has no issues');

const mixedStage = reviewer.buildReview(repoRoot, manifest, {
  statusRecords: closedStatuses.map(record => record.path === outsidePath
    ? reviewer.decorateStatus({ ...record, code: 'M ', indexStatus: 'M', worktreeStatus: ' ' })
    : record),
  requireStagedClosure: true,
});
assert.equal(mixedStage.pass, false, 'staged closure rejects a staged path outside the atomic manifest');
assert.ok(mixedStage.stagedClosure.issues.includes(`staged-path-outside-manifest:${outsidePath}`), 'mixed stage names the exact outside path');

assert.throws(() => reviewer.parseArgs(['--unknown']), /unknown argument/, 'unknown CLI argument fails closed');
assert.throws(() => reviewer.parseArgs(['--output']), /requires a value/, 'missing CLI value fails closed');
assert.throws(() => reviewer.resolveInsideRepo(repoRoot, '../outside.md', 'output path'), /inside the repository/, 'review output cannot escape the repository');

const liveJson = JSON.parse(childProcess.execFileSync(process.execPath, [
  path.join(__dirname, 'rc-stm-atomic-change-set-review.js'),
  '--json',
], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  windowsHide: true,
}));
assert.equal(liveJson.kind, reviewer.REVIEW_KIND, 'live CLI emits the closed review kind');
assert.equal(liveJson.manifest.valid, true, 'live CLI revalidates the current manifest');
assert.equal(liveJson.pass, true, 'live preview remains read-only and passes without requiring a staged commit');

console.log(`RC STM atomic change-set review OK (declared=${liveJson.manifest.declaredPathCount}, changed=${liveJson.worktree.manifestChangedPathCount}, outside=${liveJson.worktree.outsideManifestChangedPathCount})`);
