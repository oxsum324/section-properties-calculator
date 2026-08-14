const fs = require('fs');
const path = require('path');
const receipts = require('./public-release-decision-receipt.js');
const backups = require('./public-release-decision-backup.js');
const drill = require('./public-release-decision-restore-drill.js');

const HEALTH_SCHEMA_VERSION = 1;
const HEALTH_KIND = 'public-release-decision-restore-drill-health';
const DEFAULT_MAXIMUM_AGE_DAYS = 8;
const DEFAULT_STATUS_FILE = 'output/audit/public-release-decision-restore-drill-health.json';
const ISSUE_CODES = new Set([
  'local-drill-history-missing',
  'invalid-local-drill-history',
  'external-drill-not-configured',
  'external-drill-matches-local-directory',
  'external-drill-history-missing',
  'invalid-external-drill-history',
  'drill-history-mismatch',
  'drill-history-rollback',
  'drill-anchor-not-initialized',
  'drill-anchor-mismatch',
  'current-drill-missing',
  'drill-overdue',
  'drill-timestamp-in-future',
  'drill-status-checkpoint-invalid',
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

function inspectHistory(directory, currentRunId) {
  const configured = Boolean(directory);
  const target = configured ? path.resolve(directory) : '';
  const exists = Boolean(target && fs.existsSync(target));
  const empty = {
    configured,
    exists,
    receiptCount: 0,
    legacyReceiptCount: 0,
    chainedReceiptCount: 0,
    currentReceiptCount: 0,
    latestCompletedAt: '',
  };
  if (!configured || !exists) return { summary: empty, history: null, invalid: false };
  try {
    const history = drill.loadReceiptHistory(target);
    const latestCompletedAt = history.entries.at(-1)?.receipt.completedAt || '';
    return {
      summary: {
        configured,
        exists,
        receiptCount: history.entries.length,
        legacyReceiptCount: history.legacyCount,
        chainedReceiptCount: history.currentCount,
        currentReceiptCount: history.entries.filter(entry => entry.receipt.chain.latestRunId === currentRunId).length,
        latestCompletedAt,
      },
      history,
      invalid: false,
    };
  } catch {
    return { summary: empty, history: null, invalid: true };
  }
}

function commonReceiptCount(left, right) {
  if (!left || !right) return 0;
  let count = 0;
  while (count < left.entries.length && count < right.entries.length) {
    const a = left.entries[count];
    const b = right.entries[count];
    if (a.name !== b.name || a.fileSha256 !== b.fileSha256 || receipts.stableJson(a.receipt) !== receipts.stableJson(b.receipt)) break;
    count += 1;
  }
  return count;
}

function checkDrillHealth(repoRoot, options = {}) {
  const root = path.resolve(repoRoot);
  const now = options.now instanceof Date ? options.now : new Date();
  const maximumAgeDays = Number(options.maximumAgeDays ?? DEFAULT_MAXIMUM_AGE_DAYS);
  if (!Number.isInteger(maximumAgeDays) || maximumAgeDays < 1 || maximumAgeDays > 365) throw new Error('maximumAgeDays must be an integer from 1 to 365');
  const decisionHistory = receipts.loadDecisionHistory(root);
  receipts.validateDecisionHistoryAnchor(root, decisionHistory);
  if (!decisionHistory.entries.length) throw new Error('restore drill health requires at least one private decision receipt');
  const currentRunId = decisionHistory.entries.at(-1).decision.runId;
  const localDirectory = path.join(root, ...backups.DEFAULT_BACKUP_DIR.split('/'), drill.DRILL_DIRECTORY);
  const externalRoot = options.externalDirectory === undefined
    ? String(process.env.PUBLIC_RELEASE_DECISION_BACKUP_DIR || '')
    : String(options.externalDirectory || '');
  const externalDirectory = externalRoot ? path.join(externalRoot, drill.DRILL_DIRECTORY) : '';
  const externalRequired = options.requireExternal === true;
  const local = inspectHistory(localDirectory, currentRunId);
  const external = inspectHistory(externalDirectory, currentRunId);
  const issueCodes = [];
  if (!local.summary.exists || (!local.invalid && !local.summary.receiptCount)) issueCodes.push('local-drill-history-missing');
  if (local.invalid) issueCodes.push('invalid-local-drill-history');
  if (!externalRoot) {
    if (externalRequired) issueCodes.push('external-drill-not-configured');
  } else {
    if (samePath(path.join(root, ...backups.DEFAULT_BACKUP_DIR.split('/')), externalRoot)) issueCodes.push('external-drill-matches-local-directory');
    if (!external.summary.exists || (!external.invalid && !external.summary.receiptCount)) issueCodes.push('external-drill-history-missing');
    if (external.invalid) issueCodes.push('invalid-external-drill-history');
  }
  const pairedReceiptCount = commonReceiptCount(local.history, external.history);
  if (externalRoot && local.history && external.history && !drill.historiesMatch(local.history, external.history)) {
    issueCodes.push('drill-history-mismatch');
  }
  let checkpointReceiptCount = 0;
  try {
    checkpointReceiptCount = drill.readStatusCheckpoint(root);
    if (checkpointReceiptCount > local.summary.receiptCount) issueCodes.push('drill-history-rollback');
  } catch {
    issueCodes.push('drill-status-checkpoint-invalid');
  }
  let anchorInitialized = false;
  if (local.history) {
    try {
      const anchorState = drill.loadReceiptAnchor(root, local.history);
      anchorInitialized = anchorState.initialized;
      if (!anchorInitialized) issueCodes.push('drill-anchor-not-initialized');
    } catch {
      issueCodes.push('drill-anchor-mismatch');
    }
  }
  if (!local.summary.currentReceiptCount || (externalRoot && !external.summary.currentReceiptCount)) issueCodes.push('current-drill-missing');
  let latestAgeDays = -1;
  if (local.summary.latestCompletedAt) {
    latestAgeDays = (now.getTime() - Date.parse(local.summary.latestCompletedAt)) / 86400000;
    if (latestAgeDays < -5 / 1440) issueCodes.push('drill-timestamp-in-future');
    else if (latestAgeDays > maximumAgeDays) issueCodes.push('drill-overdue');
  }
  const uniqueIssueCodes = [...new Set(issueCodes)];
  const status = uniqueIssueCodes.length
    ? 'attention-required'
    : (externalRoot ? 'healthy' : 'local-only');
  const result = {
    schemaVersion: HEALTH_SCHEMA_VERSION,
    kind: HEALTH_KIND,
    checkedAt: now.toISOString(),
    status,
    current: {
      decisionReceiptCount: decisionHistory.entries.length,
      pendingResetCount: decisionHistory.pendingRunIds.length,
      latestRunId: currentRunId,
    },
    policy: { maximumAgeDays, externalRequired },
    local: local.summary,
    external: external.summary,
    chain: {
      pairedReceiptCount,
      checkpointReceiptCount,
      anchorInitialized,
      latestAgeDays: latestAgeDays < 0 ? -1 : Number(latestAgeDays.toFixed(3)),
    },
    issueCodes: uniqueIssueCodes,
  };
  const validation = validateHealthStatus(result);
  if (!validation.pass) throw new Error(`generated restore drill health status is invalid: ${validation.errors.join(', ')}`);
  return result;
}

function validateHealthStatus(value) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(value, ['schemaVersion', 'kind', 'checkedAt', 'status', 'current', 'policy', 'local', 'external', 'chain', 'issueCodes']), 'status.shape');
  add(value?.schemaVersion === HEALTH_SCHEMA_VERSION && value?.kind === HEALTH_KIND, 'status.identity');
  add(Number.isFinite(Date.parse(String(value?.checkedAt || ''))), 'status.checkedAt');
  add(['healthy', 'local-only', 'attention-required'].includes(value?.status), 'status.status');
  add(hasExactKeys(value?.current, ['decisionReceiptCount', 'pendingResetCount', 'latestRunId']), 'status.current.shape');
  add(Number.isInteger(value?.current?.decisionReceiptCount) && value.current.decisionReceiptCount > 0, 'status.current.decisionReceiptCount');
  add(Number.isInteger(value?.current?.pendingResetCount) && value.current.pendingResetCount >= 0 && value.current.pendingResetCount <= 1, 'status.current.pendingResetCount');
  add(/^\d{8}-\d{6}$/.test(String(value?.current?.latestRunId || '')), 'status.current.latestRunId');
  add(hasExactKeys(value?.policy, ['maximumAgeDays', 'externalRequired']), 'status.policy.shape');
  add(Number.isInteger(value?.policy?.maximumAgeDays) && value.policy.maximumAgeDays >= 1 && value.policy.maximumAgeDays <= 365, 'status.policy.maximumAgeDays');
  add(typeof value?.policy?.externalRequired === 'boolean', 'status.policy.externalRequired');
  const validateInventory = (inventory, label) => {
    add(hasExactKeys(inventory, ['configured', 'exists', 'receiptCount', 'legacyReceiptCount', 'chainedReceiptCount', 'currentReceiptCount', 'latestCompletedAt']), `${label}.shape`);
    add(typeof inventory?.configured === 'boolean' && typeof inventory?.exists === 'boolean', `${label}.flags`);
    for (const key of ['receiptCount', 'legacyReceiptCount', 'chainedReceiptCount', 'currentReceiptCount']) {
      add(Number.isInteger(inventory?.[key]) && inventory[key] >= 0, `${label}.${key}`);
    }
    add((inventory?.legacyReceiptCount || 0) + (inventory?.chainedReceiptCount || 0) === (inventory?.receiptCount || 0), `${label}.schemaCounts`);
    add((inventory?.currentReceiptCount || 0) <= (inventory?.receiptCount || 0), `${label}.currentReceiptCountRange`);
    add(inventory?.latestCompletedAt === '' || Number.isFinite(Date.parse(String(inventory?.latestCompletedAt))), `${label}.latestCompletedAt`);
  };
  validateInventory(value?.local, 'status.local');
  validateInventory(value?.external, 'status.external');
  add(hasExactKeys(value?.chain, ['pairedReceiptCount', 'checkpointReceiptCount', 'anchorInitialized', 'latestAgeDays']), 'status.chain.shape');
  add(Number.isInteger(value?.chain?.pairedReceiptCount) && value.chain.pairedReceiptCount >= 0, 'status.chain.pairedReceiptCount');
  add(Number.isInteger(value?.chain?.checkpointReceiptCount) && value.chain.checkpointReceiptCount >= 0, 'status.chain.checkpointReceiptCount');
  add(typeof value?.chain?.anchorInitialized === 'boolean', 'status.chain.anchorInitialized');
  add(typeof value?.chain?.latestAgeDays === 'number' && Number.isFinite(value.chain.latestAgeDays) && value.chain.latestAgeDays >= -1, 'status.chain.latestAgeDays');
  add(Array.isArray(value?.issueCodes) && value.issueCodes.every(code => ISSUE_CODES.has(code)) && new Set(value.issueCodes).size === value.issueCodes.length, 'status.issueCodes');
  const expectedStatus = value?.issueCodes?.length ? 'attention-required' : (value?.external?.configured ? 'healthy' : 'local-only');
  add(value?.status === expectedStatus, 'status.statusSemantics');
  return { pass: errors.length === 0, errors };
}

function writeHealthStatus(repoRoot, status, requestedPath = DEFAULT_STATUS_FILE) {
  const validation = validateHealthStatus(status);
  if (!validation.pass) throw new Error(`restore drill health status is invalid: ${validation.errors.join(', ')}`);
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, requestedPath);
  const relative = path.relative(root, target);
  if (relative && (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) {
    throw new Error('restore drill health status path must stay inside the repository');
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
    else if (token === '--repo-root' || token === '--status-file' || token === '--maximum-age-days') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`${token} requires a value`);
      options[token.slice(2)] = argv[++index];
    } else throw new Error(`unknown argument: ${token}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(options['repo-root'] || path.resolve(__dirname, '..', '..'));
  const status = checkDrillHealth(repoRoot, {
    maximumAgeDays: options['maximum-age-days'] === undefined ? DEFAULT_MAXIMUM_AGE_DAYS : Number(options['maximum-age-days']),
    requireExternal: options['require-external'] === true,
  });
  const target = options.write ? writeHealthStatus(repoRoot, status, options['status-file'] || DEFAULT_STATUS_FILE) : '';
  const output = { ...status, written: Boolean(target) };
  console.log(options.json ? JSON.stringify(output, null, 2) : `release decision restore drill health: ${status.status} (receipts=${status.local.receiptCount}, paired=${status.chain.pairedReceiptCount}, issues=${status.issueCodes.length})`);
  if (status.status === 'attention-required') process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Public release decision restore drill health blocked: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  HEALTH_SCHEMA_VERSION,
  HEALTH_KIND,
  DEFAULT_MAXIMUM_AGE_DAYS,
  DEFAULT_STATUS_FILE,
  ISSUE_CODES,
  checkDrillHealth,
  validateHealthStatus,
  writeHealthStatus,
  parseArgs,
};
