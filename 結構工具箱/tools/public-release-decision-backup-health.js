const fs = require('fs');
const path = require('path');
const receipts = require('./public-release-decision-receipt.js');
const backups = require('./public-release-decision-backup.js');

const HEALTH_SCHEMA_VERSION = 1;
const HEALTH_KIND = 'public-release-decision-backup-health';
const DEFAULT_RETENTION_DAYS = 365;
const DEFAULT_STATUS_FILE = 'output/audit/public-release-decision-backup-health.json';
const BACKUP_FILE_PATTERN = /^public-release-decision-backup-\d{8}-\d{6}-PRB-[0-9A-F]{24}\.json$/;
const ISSUE_CODES = new Set([
  'local-backup-directory-missing',
  'current-local-backup-missing',
  'invalid-local-backup',
  'expired-local-backup-present',
  'external-backup-not-configured',
  'external-backup-matches-local-directory',
  'external-backup-directory-missing',
  'current-external-backup-missing',
  'invalid-external-backup',
  'expired-external-backup-present',
  'current-mirror-pair-missing',
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && wanted.every((key, index) => actual[index] === key);
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function inventory(directory, currentAnchor, currentReceiptCount, nowMs, retentionDays) {
  const result = {
    configured: Boolean(directory),
    exists: false,
    backupCount: 0,
    validCount: 0,
    currentCount: 0,
    invalidCount: 0,
    expiredCount: 0,
  };
  const records = [];
  if (!directory) return { summary: result, records };
  const target = path.resolve(directory);
  if (!fs.existsSync(target)) return { summary: result, records };
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    result.invalidCount = 1;
    return { summary: result, records };
  }
  result.exists = true;
  const files = fs.readdirSync(target).filter(name => BACKUP_FILE_PATTERN.test(name)).sort();
  result.backupCount = files.length;
  files.forEach(name => {
    const filePath = path.join(target, name);
    try {
      const loaded = backups.loadBackup(filePath);
      const exportedAtMs = Date.parse(loaded.backup.exportedAt);
      const current = receipts.stableJson(loaded.backup.chain.anchor) === receipts.stableJson(currentAnchor)
        && loaded.backup.chain.receiptCount === currentReceiptCount;
      const expired = nowMs - exportedAtMs > retentionDays * 86400000;
      result.validCount += 1;
      if (current) result.currentCount += 1;
      if (expired) result.expiredCount += 1;
      records.push({ backupId: loaded.backup.backupId, exportedAtMs, current, expired });
    } catch {
      result.invalidCount += 1;
    }
  });
  return { summary: result, records };
}

function checkBackupHealth(repoRoot, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const retentionDays = Number(options.retentionDays ?? DEFAULT_RETENTION_DAYS);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('retentionDays must be an integer from 1 to 3650');
  const history = receipts.loadDecisionHistory(repoRoot);
  const anchorState = receipts.validateDecisionHistoryAnchor(repoRoot, history);
  if (!history.entries.length) throw new Error('backup health requires at least one private decision receipt');
  const localDirectory = path.join(repoRoot, ...backups.DEFAULT_BACKUP_DIR.split('/'));
  const externalDirectory = options.externalDirectory === undefined
    ? String(process.env.PUBLIC_RELEASE_DECISION_BACKUP_DIR || '')
    : String(options.externalDirectory || '');
  const externalRequired = options.requireExternal === true;
  const local = inventory(localDirectory, anchorState.anchor, history.entries.length, now.getTime(), retentionDays);
  const external = inventory(externalDirectory, anchorState.anchor, history.entries.length, now.getTime(), retentionDays);
  const issueCodes = [];
  if (!local.summary.exists) issueCodes.push('local-backup-directory-missing');
  if (!local.summary.currentCount) issueCodes.push('current-local-backup-missing');
  if (local.summary.invalidCount) issueCodes.push('invalid-local-backup');
  if (local.summary.expiredCount) issueCodes.push('expired-local-backup-present');
  if (!external.summary.configured) {
    if (externalRequired) issueCodes.push('external-backup-not-configured');
  } else {
    if (samePath(localDirectory, externalDirectory)) issueCodes.push('external-backup-matches-local-directory');
    if (!external.summary.exists) issueCodes.push('external-backup-directory-missing');
    if (!external.summary.currentCount) issueCodes.push('current-external-backup-missing');
    if (external.summary.invalidCount) issueCodes.push('invalid-external-backup');
    if (external.summary.expiredCount) issueCodes.push('expired-external-backup-present');
  }
  const localCurrentIds = new Set(local.records.filter(record => record.current).map(record => record.backupId));
  const pairedCurrentBackupCount = external.records.filter(record => record.current && localCurrentIds.has(record.backupId)).length;
  if (external.summary.configured && !pairedCurrentBackupCount) issueCodes.push('current-mirror-pair-missing');
  const status = issueCodes.length
    ? 'attention-required'
    : (external.summary.configured ? 'healthy' : 'local-only');
  const statusResult = {
    schemaVersion: HEALTH_SCHEMA_VERSION,
    kind: HEALTH_KIND,
    checkedAt: now.toISOString(),
    status,
    current: {
      receiptCount: history.entries.length,
      pendingResetCount: history.pendingRunIds.length,
      latestRunId: history.entries.at(-1).decision.runId,
    },
    policy: { retentionDays, externalRequired },
    local: local.summary,
    external: external.summary,
    mirror: { pairedCurrentBackupCount },
    issueCodes,
  };
  const validation = validateHealthStatus(statusResult);
  if (!validation.pass) throw new Error(`generated backup health status is invalid: ${validation.errors.join(', ')}`);
  return statusResult;
}

function validateHealthStatus(status) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(status, ['schemaVersion', 'kind', 'checkedAt', 'status', 'current', 'policy', 'local', 'external', 'mirror', 'issueCodes']), 'status.shape');
  add(status?.schemaVersion === HEALTH_SCHEMA_VERSION, 'status.schemaVersion');
  add(status?.kind === HEALTH_KIND, 'status.kind');
  add(Number.isFinite(Date.parse(String(status?.checkedAt || ''))), 'status.checkedAt');
  add(['healthy', 'local-only', 'attention-required'].includes(status?.status), 'status.status');
  add(hasExactKeys(status?.current, ['receiptCount', 'pendingResetCount', 'latestRunId']), 'status.current.shape');
  add(Number.isInteger(status?.current?.receiptCount) && status.current.receiptCount > 0, 'status.current.receiptCount');
  add(Number.isInteger(status?.current?.pendingResetCount) && status.current.pendingResetCount >= 0 && status.current.pendingResetCount <= 1, 'status.current.pendingResetCount');
  add(/^\d{8}-\d{6}$/.test(String(status?.current?.latestRunId || '')), 'status.current.latestRunId');
  add(hasExactKeys(status?.policy, ['retentionDays', 'externalRequired']), 'status.policy.shape');
  add(Number.isInteger(status?.policy?.retentionDays) && status.policy.retentionDays >= 1 && status.policy.retentionDays <= 3650, 'status.policy.retentionDays');
  add(typeof status?.policy?.externalRequired === 'boolean', 'status.policy.externalRequired');
  const validateInventory = (value, label) => {
    add(hasExactKeys(value, ['configured', 'exists', 'backupCount', 'validCount', 'currentCount', 'invalidCount', 'expiredCount']), `${label}.shape`);
    add(typeof value?.configured === 'boolean' && typeof value?.exists === 'boolean', `${label}.flags`);
    for (const key of ['backupCount', 'validCount', 'currentCount', 'invalidCount', 'expiredCount']) {
      add(Number.isInteger(value?.[key]) && value[key] >= 0, `${label}.${key}`);
    }
    add((value?.currentCount || 0) <= (value?.validCount || 0), `${label}.currentCountRange`);
    add((value?.expiredCount || 0) <= (value?.validCount || 0), `${label}.expiredCountRange`);
  };
  validateInventory(status?.local, 'status.local');
  validateInventory(status?.external, 'status.external');
  add(hasExactKeys(status?.mirror, ['pairedCurrentBackupCount']), 'status.mirror.shape');
  add(Number.isInteger(status?.mirror?.pairedCurrentBackupCount) && status.mirror.pairedCurrentBackupCount >= 0, 'status.mirror.pairedCurrentBackupCount');
  add(Array.isArray(status?.issueCodes) && status.issueCodes.every(code => ISSUE_CODES.has(code)), 'status.issueCodes');
  if (Array.isArray(status?.issueCodes)) add(new Set(status.issueCodes).size === status.issueCodes.length, 'status.issueCodes.unique');
  const expectedStatus = status?.issueCodes?.length
    ? 'attention-required'
    : (status?.external?.configured ? 'healthy' : 'local-only');
  add(status?.status === expectedStatus, 'status.statusSemantics');
  return { pass: errors.length === 0, errors };
}

function writeHealthStatus(repoRoot, status, requestedPath = DEFAULT_STATUS_FILE) {
  const validation = validateHealthStatus(status);
  if (!validation.pass) throw new Error(`backup health status is invalid: ${validation.errors.join(', ')}`);
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, requestedPath);
  const relative = path.relative(root, target);
  if (relative && (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) {
    throw new Error('health status path must stay inside the repository');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
  return target;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write' || token === '--json' || token === '--require-external') options[token.slice(2)] = true;
    else if (token === '--repo-root' || token === '--retention-days' || token === '--status-file') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`${token} requires a value`);
      options[token.slice(2)] = argv[++index];
    } else throw new Error(`unknown argument: ${token}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(options['repo-root'] || path.resolve(__dirname, '..', '..'));
  const status = checkBackupHealth(repoRoot, {
    retentionDays: options['retention-days'] === undefined ? DEFAULT_RETENTION_DAYS : Number(options['retention-days']),
    requireExternal: options['require-external'] === true,
  });
  const target = options.write ? writeHealthStatus(repoRoot, status, options['status-file'] || DEFAULT_STATUS_FILE) : '';
  const output = { ...status, written: Boolean(target) };
  console.log(options.json ? JSON.stringify(output, null, 2) : `release decision backup health: ${status.status} (local=${status.local.currentCount}, external=${status.external.currentCount}, issues=${status.issueCodes.length})`);
  if (status.status === 'attention-required') process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Public release decision backup health blocked: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  HEALTH_SCHEMA_VERSION,
  HEALTH_KIND,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_STATUS_FILE,
  BACKUP_FILE_PATTERN,
  ISSUE_CODES,
  checkBackupHealth,
  validateHealthStatus,
  writeHealthStatus,
  parseArgs,
};
