'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const History = require('./attachment-package-upgrade-history.js');
const Compare = require('./attachment-case-governance-portfolio-compare.js');
const Snapshot = require('./attachment-case-governance-portfolio-snapshot.js');

const SNAPSHOT_INDEX_KIND = 'formal-attachment-case-governance-portfolio-snapshot-index.v1';
const SNAPSHOT_INDEX_BOUNDARY_INSTRUCTION = '本索引與最新兩版比較只供內部追蹤多案件附件治理快照；不得放入計算書、主報告或正式附件包，不代表正式附件核可、版本前進或數位簽章，亦不得發布至 Pages。';
const MAX_SNAPSHOT_FILES = 1000;
const STATUS_LEVEL = Object.freeze({ ready: 0, review: 1, blocked: 2 });

function issue(level, code, message, entries = []) {
  return { level, code, message, entries: [...entries].sort() };
}

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function maxStatus(...statuses) {
  return statuses.reduce((result, status) => STATUS_LEVEL[status] > STATUS_LEVEL[result] ? status : result, 'ready');
}

function statIdentity(stat) {
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: String(stat.mode),
    nlink: String(stat.nlink),
    size: String(stat.size),
    mtimeNs: String(stat.mtimeNs),
  };
}

function entryType(stat) {
  if (stat.isSymbolicLink()) return 'link';
  if (stat.isFile()) return 'file';
  if (stat.isDirectory()) return 'directory';
  return 'special';
}

function directorySignature(directory) {
  const resolved = path.resolve(directory);
  const rootStat = fs.lstatSync(resolved, { bigint: true });
  const entries = fs.readdirSync(resolved).sort(compareOrdinal).map(name => {
    const stat = fs.lstatSync(path.join(resolved, name), { bigint: true });
    return { name, type: entryType(stat), ...statIdentity(stat) };
  });
  return { root: statIdentity(rootStat), entries };
}

function indexFingerprint(groups, issues) {
  const payload = {
    groups: groups.map(group => ({
      groupName: group.groupName,
      snapshots: group.snapshots.map(item => ({
        fileName: item.fileName,
        generatedAt: item.generatedAt,
        status: item.status,
        portfolioFingerprint: item.portfolioFingerprint,
        caseCount: item.caseCount,
        sha256: item.sha256,
      })),
    })),
    issues: issues.map(item => ({ level: item.level, code: item.code, entries: item.entries })),
  };
  return `PSI-${crypto.createHash('sha256').update(History.canonicalJson(payload), 'utf8').digest('hex').slice(0, 24).toUpperCase()}`;
}

function buildGroups(records, issues) {
  const grouped = new Map();
  records.forEach(record => {
    const name = record.file.snapshot.discovery.parentName;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(record);
  });
  return [...grouped.entries()].sort(([left], [right]) => compareOrdinal(left, right)).map(([groupName, items]) => {
    items.sort((left, right) => Date.parse(left.file.snapshot.generatedAt) - Date.parse(right.file.snapshot.generatedAt)
      || compareOrdinal(left.public.fileName, right.public.fileName));
    const times = new Map();
    items.forEach(item => {
      const time = item.file.snapshot.generatedAt;
      if (!times.has(time)) times.set(time, []);
      times.get(time).push(item.public.fileName);
    });
    [...times.entries()].filter(([, names]) => names.length > 1).forEach(([time, names]) => {
      issues.push(issue('error', 'duplicate-snapshot-time', `同一案件群組在 ${time} 有多份快照，無法判定先後。`, names));
    });
    const snapshots = items.map(item => item.public);
    const latest = snapshots.at(-1);
    return {
      groupName,
      snapshotCount: snapshots.length,
      earliestGeneratedAt: snapshots[0]?.generatedAt || '',
      latestGeneratedAt: latest?.generatedAt || '',
      latestStatus: latest?.status || 'blocked',
      statusCounts: {
        ready: snapshots.filter(item => item.status === 'ready').length,
        review: snapshots.filter(item => item.status === 'review').length,
        blocked: snapshots.filter(item => item.status === 'blocked').length,
      },
      snapshots,
    };
  });
}

function prepareSnapshotIndex(directory, options = {}) {
  const resolved = path.resolve(directory || '');
  if (!directory || !fs.existsSync(resolved)) throw new Error(`治理快照資料夾不存在：${path.basename(resolved) || '(未指定)'}`);
  Snapshot.validatePhysicalDirectory(resolved, '治理快照資料夾');
  const signatureBefore = directorySignature(resolved);
  const issues = [];
  const records = [];
  const entries = fs.readdirSync(resolved).sort(compareOrdinal);
  if (!entries.length) issues.push(issue('error', 'snapshot-directory-empty', '治理快照資料夾內沒有快照。'));
  if (entries.length > MAX_SNAPSHOT_FILES) issues.push(issue('error', 'snapshot-file-limit-exceeded', `治理快照資料夾超過 ${MAX_SNAPSHOT_FILES} 個項目。`));
  entries.slice(0, MAX_SNAPSHOT_FILES).forEach(name => {
    const filePath = path.join(resolved, name);
    let stat;
    try { stat = fs.lstatSync(filePath, { bigint: true }); }
    catch (error) {
      issues.push(issue('error', 'snapshot-entry-unreadable', '治理快照項目無法安全讀取。', [name]));
      return;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      issues.push(issue('error', 'unsafe-snapshot-entry', '治理快照資料夾只能包含實體 JSON 快照檔。', [name]));
      return;
    }
    if (String(stat.nlink) !== '1') {
      issues.push(issue('error', 'hardlinked-snapshot-entry', '治理快照檔不得有其他硬連結別名。', [name]));
      return;
    }
    if (path.extname(name).toLowerCase() !== '.json') {
      issues.push(issue('error', 'unexpected-snapshot-entry', '治理快照資料夾含非 JSON 項目。', [name]));
      return;
    }
    try {
      const file = Compare.readSnapshotFile(filePath, `治理快照 ${name}`);
      const expectedName = Snapshot.snapshotFileName(file.snapshot);
      if (name !== expectedName) {
        issues.push(issue('error', 'snapshot-filename-mismatch', '快照檔名與內容時間或 POR 指紋不一致。', [name]));
        return;
      }
      records.push({
        file,
        public: {
          fileName: name,
          generatedAt: file.snapshot.generatedAt,
          status: file.snapshot.status,
          portfolioFingerprint: file.snapshot.portfolioFingerprint,
          caseCount: file.snapshot.discovery.caseCount,
          sha256: file.rawHash,
        },
      });
    } catch (error) {
      issues.push(issue('error', 'invalid-snapshot-file', `治理快照無法通過封閉驗證：${error.message || error}`, [name]));
    }
  });
  const groups = buildGroups(records, issues);
  if (groups.length > 1) issues.push(issue('warn', 'multiple-portfolio-groups', '快照資料夾含多個案件上層群組；最新兩版比較必須先分至各自專用資料夾。', groups.map(group => group.groupName)));
  groups.filter(group => group.snapshotCount < 2).forEach(group => {
    issues.push(issue('warn', 'insufficient-snapshots', '案件群組少於兩份快照，尚無法比較最新兩版。', [group.groupName]));
  });
  if (options.compareLatest && groups.length > 1) {
    issues.push(issue('error', 'latest-comparison-requires-single-group', '為避免挑錯案件，最新兩版比較只接受單一案件群組的專用資料夾。', groups.map(group => group.groupName)));
  }
  if (typeof options.beforeFinalize === 'function') options.beforeFinalize({ resolved, records, groups, issues });
  let stable = false;
  let signatureAfter = null;
  try {
    signatureAfter = directorySignature(resolved);
    stable = History.canonicalJson(signatureBefore) === History.canonicalJson(signatureAfter)
      && Compare.sourcesUnchanged(records.map(item => item.file));
  } catch (error) { stable = false; }
  if (!stable) issues.push(issue('error', 'snapshot-directory-changed-during-read', '治理快照資料夾在建立索引期間發生變更。'));

  const integrityStatus = issues.some(item => item.level === 'error') ? 'blocked' : issues.length ? 'review' : 'ready';
  const latestHealth = groups.reduce((status, group) => maxStatus(status, group.latestStatus), 'ready');
  const status = maxStatus(integrityStatus, latestHealth);
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立治理快照索引時間。');
  const result = {
    schemaVersion: 1,
    kind: SNAPSHOT_INDEX_KIND,
    generatedAt: generatedAt.toISOString(),
    status,
    integrityStatus,
    indexFingerprint: '',
    boundary: {
      classification: 'internal-governance-snapshot-index-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      modifiesSnapshots: false,
      pagesPublication: false,
      instruction: SNAPSHOT_INDEX_BOUNDARY_INSTRUCTION,
    },
    directoryName: path.basename(resolved),
    summary: {
      totalEntries: entries.length,
      validSnapshots: records.length,
      invalidEntries: entries.length - records.length,
      groupCount: groups.length,
      comparableGroups: groups.filter(group => group.snapshotCount >= 2).length,
      errors: issues.filter(item => item.level === 'error').length,
      warnings: issues.filter(item => item.level === 'warn').length,
    },
    groups,
    issues,
    nextActions: [],
    latestComparison: null,
  };
  if (issues.some(item => item.level === 'error')) result.nextActions.push({ code: 'repair-snapshot-directory', message: '修復或移出異常項目後重新建立唯讀索引。' });
  if (groups.length > 1) result.nextActions.push({ code: 'separate-portfolio-groups', message: '將不同案件上層的快照分至各自專用資料夾。' });
  if (groups.some(group => group.snapshotCount < 2)) result.nextActions.push({ code: 'capture-another-snapshot', message: '同一案件上層至少保存兩份有效快照後再比較。' });
  if (!result.nextActions.length) result.nextActions.push({ code: 'compare-latest-snapshots', message: '可安全比較此群組最新兩份完整快照。' });
  result.indexFingerprint = indexFingerprint(groups, issues);
  return { result, records, recordsByName: new Map(records.map(item => [item.public.fileName, item])), resolved, signature: signatureAfter };
}

function inspectSnapshotDirectory(directory, options = {}) {
  return prepareSnapshotIndex(directory, options).result;
}

function compareLatestSnapshots(directory, options = {}) {
  const prepared = prepareSnapshotIndex(directory, { ...options, compareLatest: true });
  const result = prepared.result;
  if (result.integrityStatus === 'blocked' || result.groups.length !== 1 || result.groups[0].snapshotCount < 2) return result;
  const snapshots = result.groups[0].snapshots;
  const previous = prepared.recordsByName.get(snapshots.at(-2).fileName);
  const current = prepared.recordsByName.get(snapshots.at(-1).fileName);
  if (typeof options.beforeLatestCompare === 'function') options.beforeLatestCompare({ prepared, previous, current });
  const fullComparison = Compare.compareFiles(previous.file.path, current.file.path, { now: options.now });
  result.latestComparison = Compare.buildFilteredView(fullComparison, options);
  result.status = maxStatus(result.status, fullComparison.status);
  result.nextActions = fullComparison.nextActions.map(item => ({ code: item.code, message: item.message }));
  if (typeof options.afterLatestCompare === 'function') options.afterLatestCompare({ prepared, previous, current, fullComparison });
  let directoryStable = false;
  try {
    directoryStable = History.canonicalJson(prepared.signature) === History.canonicalJson(directorySignature(prepared.resolved))
      && Compare.sourcesUnchanged(prepared.records.map(item => item.file));
  } catch (error) { directoryStable = false; }
  if (!directoryStable) {
    result.issues.push(issue('error', 'snapshot-directory-changed-during-latest-comparison', '治理快照資料夾在選取或比較最新兩版期間發生變更。'));
    result.integrityStatus = 'blocked';
    result.status = 'blocked';
    result.summary.errors += 1;
    result.nextActions = [{ code: 'rerun-after-snapshot-directory-stable', message: '固定治理快照資料夾後重新建立索引並比較。' }];
    result.indexFingerprint = indexFingerprint(result.groups, result.issues);
  }
  return result;
}

function formatSummary(result) {
  const lines = [
    '多案件附件治理快照資料夾唯讀索引',
    `狀態：${result.status}；索引完整性：${result.integrityStatus}`,
    `資料夾：${result.directoryName}`,
    `快照：有效 ${result.summary.validSnapshots}/${result.summary.totalEntries}；群組 ${result.summary.groupCount}；可比較 ${result.summary.comparableGroups}`,
    `索引指紋：${result.indexFingerprint}`,
  ];
  result.groups.forEach(group => lines.push(`- ${group.groupName}：${group.snapshotCount} 份；最新 ${group.latestGeneratedAt}；${group.latestStatus}`));
  result.issues.forEach(item => lines.push(`- ${item.level === 'error' ? '阻擋' : '提醒'} [${item.code}] ${item.message}`));
  if (result.latestComparison) {
    lines.push('--- 最新兩版比較 ---');
    lines.push(Compare.formatSummary(result.latestComparison));
  } else result.nextActions.forEach(item => lines.push(`- 下一步：${item.message}`));
  lines.push(SNAPSHOT_INDEX_BOUNDARY_INSTRUCTION);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { json: false, compareLatest: false, onlyBlocking: false, changeTypes: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--directory') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('參數 --directory 缺少路徑值。');
      options.directory = value;
      index += 1;
    } else if (arg === '--compare-latest') options.compareLatest = true;
    else if (arg === '--only-blocking') options.onlyBlocking = true;
    else if (arg === '--change') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('參數 --change 缺少差異類型。');
      options.changeTypes.push(value);
      index += 1;
    } else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  const filters = Compare.normalizeViewFilters(options);
  if (!options.compareLatest && (filters.onlyBlocking || filters.changeTypes.length)) throw new Error('--only-blocking 與 --change 只能搭配 --compare-latest。');
  return { ...options, ...filters };
}

function usage() {
  return [
    '用法：node attachment-case-governance-portfolio-snapshot-index.js --directory <內部治理快照資料夾> [--compare-latest [--only-blocking | --change <類型> ...]] [--json]',
    '資料夾逐檔封閉驗證並依案件上層名稱分組；最新兩版比較只接受單一群組且至少兩份快照。',
    '索引與比較固定唯讀；不修改快照、不核可、不前進版本。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(usage()); return Checker.PACKAGE_STATUS_EXIT_CODES.ready; }
  if (!options.directory) { console.error(usage()); return Checker.CLI_ERROR_EXIT_CODE; }
  const result = options.compareLatest ? compareLatestSnapshots(options.directory, options) : inspectSnapshotDirectory(options.directory, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return Checker.exitCodeForStatus(result.status);
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(error.message || error);
    process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  SNAPSHOT_INDEX_KIND,
  SNAPSHOT_INDEX_BOUNDARY_INSTRUCTION,
  MAX_SNAPSHOT_FILES,
  issue,
  compareOrdinal,
  maxStatus,
  statIdentity,
  entryType,
  directorySignature,
  indexFingerprint,
  buildGroups,
  prepareSnapshotIndex,
  inspectSnapshotDirectory,
  compareLatestSnapshots,
  formatSummary,
  parseArgs,
  usage,
  main,
};
