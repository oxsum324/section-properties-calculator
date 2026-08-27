const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const atomicChangeSet = require('./rc-stm-atomic-change-set.js');

const REVIEW_SCHEMA_VERSION = 1;
const REVIEW_KIND = 'rc-stm-atomic-change-set-review';

function normalizeSlash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function parseGitStatusPorcelain(raw) {
  const fields = String(raw || '').split('\0');
  const records = [];
  for (let index = 0; index < fields.length;) {
    const field = fields[index++];
    if (!field) continue;
    if (field.length < 4 || field[2] !== ' ') throw new Error(`unsupported git status record: ${JSON.stringify(field)}`);
    const code = field.slice(0, 2);
    const record = {
      code,
      indexStatus: code[0],
      worktreeStatus: code[1],
      path: normalizeSlash(field.slice(3)),
      originalPath: '',
    };
    if (/[RC]/.test(code)) {
      if (index >= fields.length || !fields[index]) throw new Error(`rename/copy status is missing its original path: ${record.path}`);
      record.originalPath = normalizeSlash(fields[index++]);
    }
    records.push(record);
  }
  return records;
}

function statusKind(record) {
  if (record.code === '??') return 'untracked';
  if (record.code.includes('U') || ['AA', 'DD'].includes(record.code)) return 'conflicted';
  if (record.code.includes('D')) return 'deleted';
  if (record.code.includes('R')) return 'renamed';
  if (record.code.includes('C')) return 'copied';
  if (record.code.includes('A')) return 'added';
  return 'modified';
}

function decorateStatus(record) {
  return {
    ...record,
    kind: statusKind(record),
    staged: record.code !== '??' && record.indexStatus !== ' ',
    unstaged: record.code === '??' || record.worktreeStatus !== ' ',
  };
}

function classifyRole(relativePath, groupKey = '') {
  const value = String(relativePath || '');
  const base = path.posix.basename(value);
  if (/(?:^|[.-])test\.[cm]?[jt]sx?$/i.test(base) || /-regression\.test\.js$/i.test(base)) return 'test';
  if (/\.ps1$/i.test(value)) return 'runner';
  if (/\.html?$/i.test(value)) return 'page';
  if (/\.md$/i.test(value)) return 'documentation';
  if (value.includes('/fixtures/') || /\.(?:csv|tsv|txt)$/i.test(value)) return 'fixture';
  if (/\.(?:manifest|catalog)\.json$/i.test(value) || /inventory\.json$/i.test(value)) return 'governance-data';
  if (/\.css$/i.test(value)) return 'style';
  if (groupKey === 'calculation-core') return 'calculation-source';
  if (groupKey === 'formal-attachment-evidence') return 'release-governance';
  if (groupKey === 'observed-format-governance') return 'format-governance';
  if (groupKey === 'rc-integration-and-regression') return 'integration';
  if (groupKey === 'runtime-baseline-dependencies') return 'runtime-dependency';
  if (groupKey === 'runtime-pages-and-handoffs') return 'runtime-source';
  if (/\.json$/i.test(value)) return 'data';
  if (/\.[cm]?[jt]sx?$/i.test(value)) return 'source';
  return 'other';
}

function gitStatus(repoRoot) {
  const output = childProcess.execFileSync('git', [
    '-c', 'core.quotepath=false',
    'status', '--porcelain=v1', '-z', '--untracked-files=all',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return parseGitStatusPorcelain(output).map(decorateStatus);
}

function countBy(records, field) {
  return Object.fromEntries(Array.from(records.reduce((counts, record) => {
    const key = record[field];
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map())).sort(([left], [right]) => left.localeCompare(right)));
}

function buildReview(repoRoot, manifest, options = {}) {
  const root = path.resolve(repoRoot);
  const manifestPath = options.manifestPath || atomicChangeSet.MANIFEST_PATH;
  const validationIssues = atomicChangeSet.validateRcStmAtomicChangeSet(manifest, { repoRoot: root });
  const statuses = (options.statusRecords || gitStatus(root)).map(record => record.kind ? record : decorateStatus(record));
  const pathToGroup = new Map();
  for (const group of Array.isArray(manifest?.groups) ? manifest.groups : []) {
    for (const relativePath of Array.isArray(group?.paths) ? group.paths : []) pathToGroup.set(relativePath, group.key);
  }

  const inManifest = [];
  const outsideManifest = [];
  for (const record of statuses) {
    const groupKey = pathToGroup.get(record.path);
    if (groupKey) inManifest.push({ ...record, groupKey, role: classifyRole(record.path, groupKey) });
    else outsideManifest.push({ ...record, role: classifyRole(record.path) });
  }

  const groupSummaries = (manifest?.groups || []).map(group => {
    const changes = inManifest.filter(record => record.groupKey === group.key);
    const missingPaths = group.paths.filter(relativePath => !fs.existsSync(path.join(root, ...relativePath.split('/'))));
    return {
      key: group.key,
      purpose: group.purpose,
      declaredCount: group.paths.length,
      changedCount: changes.length,
      cleanCount: group.paths.length - changes.length - missingPaths.filter(item => !changes.some(change => change.path === item)).length,
      stagedCount: changes.filter(change => change.staged).length,
      unstagedCount: changes.filter(change => change.unstaged).length,
      missingCount: missingPaths.length,
      changes,
      missingPaths,
    };
  });

  const stagedManifestChanges = inManifest.filter(record => record.staged);
  const unstagedManifestChanges = inManifest.filter(record => record.unstaged);
  const stagedOutsideManifest = outsideManifest.filter(record => record.staged);
  const conflicted = statuses.filter(record => record.kind === 'conflicted');
  const closureIssues = [];
  if (options.requireStagedClosure) {
    if (inManifest.length > 0 && stagedManifestChanges.length === 0) closureIssues.push('no-manifest-changes-staged');
    for (const record of unstagedManifestChanges) closureIssues.push(`manifest-change-not-fully-staged:${record.path}`);
    for (const record of stagedOutsideManifest) closureIssues.push(`staged-path-outside-manifest:${record.path}`);
    for (const record of conflicted) closureIssues.push(`conflicted-path:${record.path}`);
  }

  const review = {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    kind: REVIEW_KIND,
    generatedAt: new Date().toISOString(),
    manifestPath,
    manifest: {
      valid: validationIssues.length === 0,
      validationIssues,
      groupCount: groupSummaries.length,
      handoffCount: Array.isArray(manifest?.handoffs) ? manifest.handoffs.length : 0,
      handoffs: (manifest?.handoffs || []).map(handoff => ({
        key: handoff.key,
        summary: handoff.summary,
        sourceCount: handoff.sourcePaths.length,
        targetCount: handoff.targetPaths.length,
        contractCount: handoff.contractPaths.length,
      })),
      declaredPathCount: pathToGroup.size,
      existingPathCount: groupSummaries.reduce((sum, group) => sum + group.declaredCount - group.missingCount, 0),
      missingPathCount: groupSummaries.reduce((sum, group) => sum + group.missingCount, 0),
    },
    worktree: {
      changedPathCount: statuses.length,
      manifestChangedPathCount: inManifest.length,
      outsideManifestChangedPathCount: outsideManifest.length,
      stagedPathCount: statuses.filter(record => record.staged).length,
      manifestStagedPathCount: stagedManifestChanges.length,
      manifestUnstagedPathCount: unstagedManifestChanges.length,
      stateCounts: countBy(statuses, 'kind'),
      roleCounts: countBy([...inManifest, ...outsideManifest], 'role'),
      groups: groupSummaries,
      outsideManifestChanges: outsideManifest,
    },
    stagedClosure: {
      required: Boolean(options.requireStagedClosure),
      pass: options.requireStagedClosure ? closureIssues.length === 0 && validationIssues.length === 0 : null,
      issues: closureIssues,
    },
    pass: validationIssues.length === 0 && (!options.requireStagedClosure || closureIssues.length === 0),
  };
  return review;
}

function markdownEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

function statusLabel(record) {
  const flags = [record.staged ? '已暫存' : '', record.unstaged ? '未暫存' : ''].filter(Boolean).join('／');
  return `${record.code} ${record.kind}${flags ? `（${flags}）` : ''}`;
}

function renderMarkdown(review) {
  const lines = [
    '# RC STM 原子變更集審查',
    '',
    `- 產生時間：${review.generatedAt}`,
    `- 清冊：\`${review.manifestPath}\``,
    `- 清冊完整性：${review.manifest.valid ? '通過' : '失敗'}`,
    `- 宣告範圍：${review.manifest.groupCount} 組／${review.manifest.handoffCount} 條跨工具 handoff／${review.manifest.declaredPathCount} 檔`,
    `- 工作樹變更：${review.worktree.changedPathCount} 檔（清冊內 ${review.worktree.manifestChangedPathCount}／清冊外 ${review.worktree.outsideManifestChangedPathCount}）`,
    `- 變更狀態：${Object.entries(review.worktree.stateCounts).map(([key, count]) => `${key} ${count}`).join('／') || '無'}`,
    `- 暫存狀態：全部 ${review.worktree.stagedPathCount} 檔／清冊內 ${review.worktree.manifestStagedPathCount} 檔／清冊內未完全暫存 ${review.worktree.manifestUnstagedPathCount} 檔`,
    `- 暫存閉合檢查：${review.stagedClosure.required ? (review.stagedClosure.pass ? '通過' : '失敗') : '未啟用（預覽模式）'}`,
    '',
    '## 分組摘要',
    '',
    '| 分組 | 宣告 | 變更 | 已暫存 | 未暫存 | 缺檔 | 用途 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const group of review.worktree.groups) {
    lines.push(`| ${markdownEscape(group.key)} | ${group.declaredCount} | ${group.changedCount} | ${group.stagedCount} | ${group.unstagedCount} | ${group.missingCount} | ${markdownEscape(group.purpose)} |`);
  }

  lines.push('', '## 跨工具 Handoff', '', '| Handoff | 來源 | 接收 | 契約 | 目的 |', '| --- | ---: | ---: | ---: | --- |');
  for (const handoff of review.manifest.handoffs) {
    lines.push(`| ${markdownEscape(handoff.key)} | ${handoff.sourceCount} | ${handoff.targetCount} | ${handoff.contractCount} | ${markdownEscape(handoff.summary)} |`);
  }

  lines.push('', '## 變更檔案角色', '', '| 角色 | 檔數 |', '| --- | ---: |');
  for (const [role, count] of Object.entries(review.worktree.roleCounts)) lines.push(`| ${markdownEscape(role)} | ${count} |`);

  lines.push('', '## 清冊內變更', '');
  if (review.worktree.manifestChangedPathCount === 0) lines.push('- 無。');
  for (const group of review.worktree.groups.filter(item => item.changes.length > 0)) {
    lines.push(`### ${group.key}`, '');
    for (const record of group.changes) {
      const rename = record.originalPath ? ` ← \`${record.originalPath}\`` : '';
      lines.push(`- \`${statusLabel(record)}\` \`${record.role}\` \`${record.path}\`${rename}`);
    }
    lines.push('');
  }

  lines.push('## 清冊外熱檔', '');
  lines.push('這些檔案不會自動判定為無關；提交前應另行分組，不得無意混入 RC STM 原子變更集。', '');
  if (review.worktree.outsideManifestChanges.length === 0) lines.push('- 無。');
  for (const record of review.worktree.outsideManifestChanges) {
    const rename = record.originalPath ? ` ← \`${record.originalPath}\`` : '';
    lines.push(`- \`${statusLabel(record)}\` \`${record.role}\` \`${record.path}\`${rename}`);
  }

  lines.push('', '## 封閉式問題', '');
  const issues = [...review.manifest.validationIssues, ...review.stagedClosure.issues];
  if (issues.length === 0) lines.push('- 無。');
  else for (const issue of issues) lines.push(`- \`${issue}\``);
  lines.push('');
  return lines.join('\n');
}

function resolveInsideRepo(repoRoot, requestedPath, label) {
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, requestedPath);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the repository`);
  }
  return target;
}

function parseArgs(argv) {
  const options = { repoRoot: path.join(__dirname, '..', '..'), manifestPath: atomicChangeSet.MANIFEST_PATH, json: false, output: '', requireStagedClosure: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--require-staged-closure') options.requireStagedClosure = true;
    else if (['--repo-root', '--manifest', '--output'].includes(arg)) {
      if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) throw new Error(`${arg} requires a value`);
      const value = argv[++index];
      if (arg === '--repo-root') options.repoRoot = value;
      if (arg === '--manifest') options.manifestPath = normalizeSlash(value);
      if (arg === '--output') options.output = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const repoRoot = path.resolve(options.repoRoot);
  const manifest = atomicChangeSet.loadRcStmAtomicChangeSet(repoRoot, options.manifestPath);
  const review = buildReview(repoRoot, manifest, options);
  const output = options.json ? `${JSON.stringify(review, null, 2)}\n` : renderMarkdown(review);
  if (options.output) {
    const target = resolveInsideRepo(repoRoot, options.output, 'output path');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, output, 'utf8');
    process.stdout.write(`${normalizeSlash(path.relative(repoRoot, target))}\n`);
  } else process.stdout.write(output);
  if (!review.pass) process.exitCode = 1;
  return review;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}

module.exports = {
  REVIEW_SCHEMA_VERSION,
  REVIEW_KIND,
  parseGitStatusPorcelain,
  statusKind,
  decorateStatus,
  classifyRole,
  gitStatus,
  buildReview,
  renderMarkdown,
  resolveInsideRepo,
  parseArgs,
  main,
};
