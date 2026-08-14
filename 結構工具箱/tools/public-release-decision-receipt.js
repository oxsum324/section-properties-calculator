const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const schema = require('../assets/status/public-evidence-schema.js');

const DECISION_SCHEMA_VERSION = 1;
const DECISION_KIND = 'public-release-decision-receipt';
const RESET_SCHEMA_VERSION = 1;
const RESET_KIND = 'public-release-authorization-reset-receipt';
const DECISION_FILE = 'public-release-decision-receipt.json';
const RESET_FILE = 'public-release-authorization-reset-receipt.json';
const AUTHORIZATION_FILE = '.github/public-release-reduction-authorization.json';
const ANCHOR_FILE = '.github/public-release-decision-anchor.json';
const PREFLIGHT_FILE = 'output/preflight/preflight-summary.json';
const PLATFORM_STATUS_FILE = '結構工具箱/assets/status/platform-status.json';
const PUBLIC_PREFLIGHT_FILE = '結構工具箱/assets/status/preflight-summary.json';
const READINESS_STATUS_FILE = '結構工具箱/assets/status/report-readiness-status.json';
const HISTORY_DIR = 'output/preflight/history';
const RENDERED_EVIDENCE_NAME = 'rendered-delivery-evidence-summary.json';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && wanted.every((key, index) => actual[index] === key);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function digestObject(value) {
  return sha256Text(stableJson(value));
}

function digestFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`${label} is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function resolveInsideRepo(repoRoot, requestedPath, label) {
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, requestedPath);
  const relative = path.relative(root, target);
  if (relative && (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) {
    throw new Error(`${label} must stay inside the repository`);
  }
  return target;
}

function atomicWriteJson(filePath, value) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw new Error(`receipt directory is missing: ${parent}`);
  if (fs.existsSync(filePath)) throw new Error(`append-only receipt already exists: ${filePath}`);
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(temporary, filePath);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function statusBundle(repoRoot) {
  return {
    platformStatus: readJson(path.join(repoRoot, ...PLATFORM_STATUS_FILE.split('/')), 'tracked platform status'),
    preflightStatus: readJson(path.join(repoRoot, ...PUBLIC_PREFLIGHT_FILE.split('/')), 'tracked public preflight status'),
    reportReadinessStatus: readJson(path.join(repoRoot, ...READINESS_STATUS_FILE.split('/')), 'tracked report readiness status'),
  };
}

function inactiveAuthorization() {
  return {
    schemaVersion: schema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
    kind: schema.REDUCTION_AUTHORIZATION_KIND,
    active: false,
  };
}

function inactiveAnchor() {
  return {
    schemaVersion: 1,
    kind: 'public-release-decision-anchor',
    active: false,
  };
}

function anchorForDecision(decision) {
  return {
    schemaVersion: 1,
    kind: 'public-release-decision-anchor',
    active: true,
    runId: decision.runId,
    receiptId: decision.receiptId,
    receiptSha256: digestObject(decision),
  };
}

function authorizationCore(authorization) {
  return {
    previousRunId: authorization.previousRunId,
    reasonCode: authorization.reasonCode,
    reason: authorization.reason,
    reductions: authorization.reductions,
  };
}

function receiptId(prefix, core) {
  return `${prefix}-${sha256Text(stableJson(core)).slice(0, 24).toUpperCase()}`;
}

function decisionCore(input) {
  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    kind: DECISION_KIND,
    generatedAt: input.generatedAt,
    runId: input.runId,
    sourceCommitSha: input.sourceCommitSha,
    sourceBranch: input.sourceBranch,
    sourceDirty: input.sourceDirty,
    preflight: input.preflight,
    change: input.change,
    authorization: input.authorization,
    reset: input.reset,
    evidence: input.evidence,
    previousReceipt: input.previousReceipt,
  };
}

function validateChange(change) {
  if (!hasExactKeys(change, ['baselineRunId', 'classification', 'increases', 'reductions'])) return false;
  if (change.baselineRunId !== '' && !/^\d{8}-\d{6}$/.test(change.baselineRunId)) return false;
  if (!schema.CHANGE_CLASSIFICATIONS.includes(change.classification)) return false;
  if (!Array.isArray(change.increases) || !Array.isArray(change.reductions)) return false;
  const validDelta = item => hasExactKeys(item, ['id', 'from', 'to'])
    && schema.COUNTER_IDS.includes(item.id)
    && Number.isInteger(item.from) && item.from > 0
    && Number.isInteger(item.to) && item.to > 0;
  return change.increases.every(item => validDelta(item) && item.to > item.from)
    && change.reductions.every(item => validDelta(item) && item.to < item.from);
}

function validateDecisionReceipt(receipt) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(receipt, ['schemaVersion', 'kind', 'receiptId', 'generatedAt', 'runId', 'sourceCommitSha', 'sourceBranch', 'sourceDirty', 'preflight', 'change', 'authorization', 'reset', 'evidence', 'previousReceipt']), 'receipt.shape');
  add(receipt?.schemaVersion === DECISION_SCHEMA_VERSION, 'receipt.schemaVersion');
  add(receipt?.kind === DECISION_KIND, 'receipt.kind');
  add(/^\d{8}-\d{6}$/.test(String(receipt?.runId || '')), 'receipt.runId');
  add(Number.isFinite(Date.parse(String(receipt?.generatedAt || '').replace(' ', 'T'))), 'receipt.generatedAt');
  add(/^[0-9a-f]{40}$/i.test(String(receipt?.sourceCommitSha || '')), 'receipt.sourceCommitSha');
  add(typeof receipt?.sourceBranch === 'string' && receipt.sourceBranch.length > 0, 'receipt.sourceBranch');
  add(receipt?.sourceDirty === false, 'receipt.sourceDirty');
  const preflight = receipt?.preflight;
  add(hasExactKeys(preflight, ['recordsPassed', 'recordsRequired', 'postChecksPassed', 'postChecksRequired']), 'receipt.preflight.shape');
  add(Number.isInteger(preflight?.recordsPassed) && preflight.recordsPassed > 0 && preflight.recordsPassed === preflight.recordsRequired, 'receipt.preflight.records');
  add(Number.isInteger(preflight?.postChecksPassed) && preflight.postChecksPassed > 0 && preflight.postChecksPassed === preflight.postChecksRequired, 'receipt.preflight.postChecks');
  add(validateChange(receipt?.change), 'receipt.change');
  const authorization = receipt?.authorization;
  if (authorization?.state === 'not-required') {
    add(hasExactKeys(authorization, ['state']), 'receipt.authorization.notRequiredShape');
    add(receipt?.change?.reductions?.length === 0, 'receipt.authorization.notRequiredReduction');
    add(hasExactKeys(receipt?.reset, ['state']) && receipt.reset.state === 'not-applicable', 'receipt.reset.notApplicable');
  } else if (authorization?.state === 'used') {
    add(hasExactKeys(authorization, ['state', 'previousRunId', 'reasonCode', 'reason', 'reductions']), 'receipt.authorization.usedShape');
    const active = {
      schemaVersion: schema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
      kind: schema.REDUCTION_AUTHORIZATION_KIND,
      active: true,
      previousRunId: authorization.previousRunId,
      reasonCode: authorization.reasonCode,
      reason: authorization.reason,
      reductions: authorization.reductions,
    };
    const validation = schema.validateReductionAuthorization(active, { reductions: receipt?.change?.reductions || [] }, receipt?.change?.baselineRunId || '');
    add(validation.pass, 'receipt.authorization.used');
    add(hasExactKeys(receipt?.reset, ['state']) && receipt.reset.state === 'pending', 'receipt.reset.pending');
  } else {
    add(false, 'receipt.authorization.state');
  }
  add(hasExactKeys(receipt?.evidence, ['publicBundleSha256', 'preflightSummarySha256', 'renderedEvidenceSha256']), 'receipt.evidence.shape');
  for (const key of ['publicBundleSha256', 'preflightSummarySha256', 'renderedEvidenceSha256']) {
    add(/^[0-9a-f]{64}$/i.test(String(receipt?.evidence?.[key] || '')), `receipt.evidence.${key}`);
  }
  add(hasExactKeys(receipt?.previousReceipt, ['receiptId', 'receiptSha256']), 'receipt.previousReceipt.shape');
  const emptyPrevious = receipt?.previousReceipt?.receiptId === '' && receipt?.previousReceipt?.receiptSha256 === '';
  const linkedPrevious = /^PRD-[0-9A-F]{24}$/.test(String(receipt?.previousReceipt?.receiptId || ''))
    && /^[0-9a-f]{64}$/i.test(String(receipt?.previousReceipt?.receiptSha256 || ''));
  add(emptyPrevious || linkedPrevious, 'receipt.previousReceipt');
  if (isObject(receipt)) {
    const { receiptId: ignored, ...core } = receipt;
    add(receipt.receiptId === receiptId('PRD', core), 'receipt.receiptId');
  }
  return { pass: errors.length === 0, errors };
}

function validateResetReceipt(receipt, decision) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(receipt, ['schemaVersion', 'kind', 'receiptId', 'generatedAt', 'runId', 'decisionReceiptId', 'decisionReceiptSha256', 'authorization', 'configBeforeSha256', 'configAfterSha256', 'result']), 'reset.shape');
  add(receipt?.schemaVersion === RESET_SCHEMA_VERSION, 'reset.schemaVersion');
  add(receipt?.kind === RESET_KIND, 'reset.kind');
  add(receipt?.runId === decision?.runId, 'reset.runId');
  add(Number.isFinite(Date.parse(String(receipt?.generatedAt || ''))), 'reset.generatedAt');
  add(receipt?.decisionReceiptId === decision?.receiptId, 'reset.decisionReceiptId');
  add(receipt?.decisionReceiptSha256 === digestObject(decision), 'reset.decisionReceiptSha256');
  add(hasExactKeys(receipt?.authorization, ['previousRunId', 'reasonCode', 'reason', 'reductions']), 'reset.authorization.shape');
  add(stableJson(receipt?.authorization) === stableJson({
    previousRunId: decision?.authorization?.previousRunId,
    reasonCode: decision?.authorization?.reasonCode,
    reason: decision?.authorization?.reason,
    reductions: decision?.authorization?.reductions,
  }), 'reset.authorization');
  const active = {
    schemaVersion: schema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
    kind: schema.REDUCTION_AUTHORIZATION_KIND,
    active: true,
    ...receipt?.authorization,
  };
  add(receipt?.configBeforeSha256 === digestObject(active), 'reset.configBeforeSha256');
  add(receipt?.configAfterSha256 === digestObject(inactiveAuthorization()), 'reset.configAfterSha256');
  add(receipt?.result === 'inactive', 'reset.result');
  if (isObject(receipt)) {
    const { receiptId: ignored, ...core } = receipt;
    add(receipt.receiptId === receiptId('PRA', core), 'reset.receiptId');
  }
  return { pass: errors.length === 0, errors };
}

function decisionPath(repoRoot, runId) {
  return path.join(repoRoot, ...HISTORY_DIR.split('/'), runId, DECISION_FILE);
}

function resetPath(repoRoot, runId) {
  return path.join(repoRoot, ...HISTORY_DIR.split('/'), runId, RESET_FILE);
}

function validateDecisionHistoryEntries(entries) {
  if (!Array.isArray(entries)) throw new Error('release decision history entries must be an array');
  entries.forEach((entry, index) => {
    if (!isObject(entry) || !isObject(entry.decision) || (entry.reset !== null && !isObject(entry.reset))) {
      throw new Error(`invalid release decision history entry at index ${index}`);
    }
    const decision = entry.decision;
    const validation = validateDecisionReceipt(decision);
    if (!validation.pass) throw new Error(`invalid release decision receipt ${decision.runId || index}: ${validation.errors.join(', ')}`);
    if (entry.reset !== null) {
      const resetValidation = validateResetReceipt(entry.reset, decision);
      if (!resetValidation.pass) throw new Error(`invalid authorization reset receipt ${decision.runId}: ${resetValidation.errors.join(', ')}`);
      if (decision.authorization.state !== 'used') throw new Error(`unexpected authorization reset receipt for ${decision.runId}`);
    }
    const previous = index > 0 ? entries[index - 1].decision : null;
    if (previous && decision.runId <= previous.runId) throw new Error(`release decision receipt order mismatch: ${decision.runId}`);
    const expected = previous
      ? { receiptId: previous.receiptId, receiptSha256: digestObject(previous) }
      : { receiptId: '', receiptSha256: '' };
    if (stableJson(decision.previousReceipt) !== stableJson(expected)) {
      throw new Error(`release decision receipt chain mismatch: ${decision.runId}`);
    }
  });
  const pendingRunIds = entries
    .filter(entry => entry.decision.authorization.state === 'used' && !entry.reset)
    .map(entry => entry.decision.runId);
  if (pendingRunIds.length > 1 || (pendingRunIds.length === 1 && entries.at(-1)?.decision.runId !== pendingRunIds[0])) {
    throw new Error(`unresolved authorization reset before a later decision receipt: ${pendingRunIds.join(', ')}`);
  }
  return { entries, pendingRunIds };
}

function loadDecisionHistory(repoRoot) {
  const historyRoot = path.join(repoRoot, ...HISTORY_DIR.split('/'));
  if (!fs.existsSync(historyRoot)) return { entries: [], pendingRunIds: [] };
  const entries = [];
  for (const name of fs.readdirSync(historyRoot).sort()) {
    if (!/^\d{8}-\d{6}$/.test(name)) continue;
    const filePath = decisionPath(repoRoot, name);
    if (!fs.existsSync(filePath)) continue;
    const decision = readJson(filePath, 'release decision receipt');
    const validation = validateDecisionReceipt(decision);
    if (!validation.pass) throw new Error(`invalid release decision receipt ${name}: ${validation.errors.join(', ')}`);
    if (decision.runId !== name) throw new Error(`release decision receipt directory mismatch: ${name}`);
    const resetFile = resetPath(repoRoot, name);
    let reset = null;
    if (fs.existsSync(resetFile)) {
      reset = readJson(resetFile, 'authorization reset receipt');
      const resetValidation = validateResetReceipt(reset, decision);
      if (!resetValidation.pass) throw new Error(`invalid authorization reset receipt ${name}: ${resetValidation.errors.join(', ')}`);
      if (decision.authorization.state !== 'used') throw new Error(`unexpected authorization reset receipt for ${name}`);
    }
    entries.push({ decision, reset, filePath, resetFile });
  }
  return validateDecisionHistoryEntries(entries);
}

function validateDecisionHistoryAnchor(repoRoot, history = loadDecisionHistory(repoRoot)) {
  const anchorPath = path.join(repoRoot, ...ANCHOR_FILE.split('/'));
  const anchor = readJson(anchorPath, 'tracked release decision anchor');
  const expected = history.entries.length
    ? anchorForDecision(history.entries.at(-1).decision)
    : inactiveAnchor();
  if (stableJson(anchor) !== stableJson(expected)) {
    throw new Error('tracked release decision anchor does not match the private receipt chain tip');
  }
  return { anchor, anchorPath, expected };
}

function replaceAnchor(anchorPath, next) {
  const stat = fs.lstatSync(anchorPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('tracked release decision anchor must be a regular file');
  const temporary = `${anchorPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(temporary, anchorPath);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function isFormalPreflightForRelease(preflight, release) {
  return preflight?.quick === false
    && preflight.forcePlatformAudit === true
    && preflight.forceSlowChecks === true
    && preflight.pass === true
    && preflight.failureCount === 0
    && preflight.sourceDirty === false
    && preflight.runId === release?.runId
    && preflight.sourceCommitSha === release?.sourceCommitSha
    && preflight.recordsCount === release?.records?.required
    && preflight.passedCount === release?.records?.required
    && preflight.postCheckCount === release?.postChecks?.required
    && preflight.postChecksPassedCount === release?.postChecks?.required;
}

function buildDecisionReceipt(repoRoot) {
  const bundle = statusBundle(repoRoot);
  const bundleValidation = schema.validatePublicEvidenceBundle(bundle);
  if (!bundleValidation.pass) throw new Error(`tracked public evidence is invalid: ${bundleValidation.errors.join(', ')}`);
  const latest = bundleValidation.releaseHistory.entries.at(-1);
  const previous = bundleValidation.releaseHistory.entries.at(-2) || null;
  const preflightPath = path.join(repoRoot, ...PREFLIGHT_FILE.split('/'));
  const preflight = readJson(preflightPath, 'formal preflight summary');
  const formal = isFormalPreflightForRelease(preflight, latest);
  if (!formal) throw new Error('decision receipt requires the same complete clean formal preflight represented by tracked public evidence');
  const renderedPath = path.join(repoRoot, ...HISTORY_DIR.split('/'), latest.runId, 'rendered-delivery-evidence', RENDERED_EVIDENCE_NAME);
  const rendered = readJson(renderedPath, 'rendered delivery evidence');
  if (rendered.runId !== latest.runId || rendered.pass !== true) throw new Error('rendered delivery evidence does not belong to the complete formal release');
  const authorizationPath = path.join(repoRoot, ...AUTHORIZATION_FILE.split('/'));
  const authorizationConfig = readJson(authorizationPath, 'reduction authorization config');
  let authorization;
  let reset;
  if (latest.change.reductions.length) {
    const validation = schema.validateReductionAuthorization(authorizationConfig, latest.change, previous?.runId || '');
    if (!validation.pass) throw new Error(`decision receipt authorization is invalid: ${validation.errors.join(', ')}`);
    if (latest.change.reasonCode !== authorizationConfig.reasonCode || latest.change.reason !== authorizationConfig.reason) {
      throw new Error('decision receipt authorization reason does not match public release history');
    }
    authorization = { state: 'used', ...authorizationCore(authorizationConfig) };
    reset = { state: 'pending' };
  } else {
    if (stableJson(authorizationConfig) !== stableJson(inactiveAuthorization())) throw new Error('unused or malformed authorization cannot enter a release decision receipt');
    authorization = { state: 'not-required' };
    reset = { state: 'not-applicable' };
  }
  const history = loadDecisionHistory(repoRoot);
  validateDecisionHistoryAnchor(repoRoot, history);
  const earlierEntries = history.entries.filter(entry => entry.decision.runId < latest.runId);
  const laterEntries = history.entries.filter(entry => entry.decision.runId > latest.runId);
  if (laterEntries.length) throw new Error('cannot create an older decision receipt after a newer receipt');
  const unresolvedEarlier = earlierEntries.filter(entry => entry.decision.authorization.state === 'used' && !entry.reset);
  if (unresolvedEarlier.length) throw new Error(`previous release authorization reset is still pending: ${unresolvedEarlier.at(-1).decision.runId}`);
  const previousReceipt = earlierEntries.length
    ? { receiptId: earlierEntries.at(-1).decision.receiptId, receiptSha256: digestObject(earlierEntries.at(-1).decision) }
    : { receiptId: '', receiptSha256: '' };
  const core = decisionCore({
    generatedAt: preflight.generatedAt,
    runId: latest.runId,
    sourceCommitSha: preflight.sourceCommitSha,
    sourceBranch: preflight.sourceBranch,
    sourceDirty: preflight.sourceDirty,
    preflight: {
      recordsPassed: preflight.passedCount,
      recordsRequired: preflight.recordsCount,
      postChecksPassed: preflight.postChecksPassedCount,
      postChecksRequired: preflight.postCheckCount,
    },
    change: {
      baselineRunId: previous?.runId || '',
      classification: latest.change.classification,
      increases: latest.change.increases,
      reductions: latest.change.reductions,
    },
    authorization,
    reset,
    evidence: {
      publicBundleSha256: digestObject(bundle),
      preflightSummarySha256: digestFile(preflightPath),
      renderedEvidenceSha256: digestFile(renderedPath),
    },
    previousReceipt,
  });
  const receipt = { ...core, receiptId: receiptId('PRD', core) };
  const validation = validateDecisionReceipt(receipt);
  if (!validation.pass) throw new Error(`generated decision receipt is invalid: ${validation.errors.join(', ')}`);
  return receipt;
}

function writeDecisionReceipt(repoRoot) {
  const receipt = buildDecisionReceipt(repoRoot);
  const target = decisionPath(repoRoot, receipt.runId);
  if (fs.existsSync(target)) {
    const existing = readJson(target, 'existing release decision receipt');
    const validation = validateDecisionReceipt(existing);
    if (!validation.pass || stableJson(existing) !== stableJson(receipt)) throw new Error('existing append-only decision receipt does not match current release evidence');
    return { changed: false, target, receipt: existing };
  }
  const historyBefore = loadDecisionHistory(repoRoot);
  const anchorState = validateDecisionHistoryAnchor(repoRoot, historyBefore);
  const previousAnchorContents = fs.readFileSync(anchorState.anchorPath, 'utf8');
  atomicWriteJson(target, receipt);
  try {
    replaceAnchor(anchorState.anchorPath, anchorForDecision(receipt));
    const history = loadDecisionHistory(repoRoot);
    validateDecisionHistoryAnchor(repoRoot, history);
    if (history.entries.at(-1)?.decision.receiptId !== receipt.receiptId) throw new Error('written decision receipt did not become the validated chain tip');
  } catch (error) {
    fs.writeFileSync(anchorState.anchorPath, previousAnchorContents, 'utf8');
    fs.rmSync(target, { force: true });
    throw error;
  }
  return { changed: true, target, receipt };
}

function prepareAuthorizationResetReceipt(repoRoot, authorizationFile = AUTHORIZATION_FILE) {
  const target = resolveInsideRepo(repoRoot, authorizationFile, 'authorization file');
  const current = readJson(target, 'current reduction authorization');
  const history = loadDecisionHistory(repoRoot);
  validateDecisionHistoryAnchor(repoRoot, history);
  if (stableJson(current) === stableJson(inactiveAuthorization())) return null;
  const latest = history.entries.at(-1);
  if (!latest || latest.decision.authorization.state !== 'used' || latest.reset) {
    throw new Error('active authorization has no pending validated release decision receipt');
  }
  const expectedAuthorization = {
    schemaVersion: schema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
    kind: schema.REDUCTION_AUTHORIZATION_KIND,
    active: true,
    previousRunId: latest.decision.authorization.previousRunId,
    reasonCode: latest.decision.authorization.reasonCode,
    reason: latest.decision.authorization.reason,
    reductions: latest.decision.authorization.reductions,
  };
  if (stableJson(current) !== stableJson(expectedAuthorization)) throw new Error('active authorization does not match the pending release decision receipt');
  const core = {
    schemaVersion: RESET_SCHEMA_VERSION,
    kind: RESET_KIND,
    generatedAt: new Date().toISOString(),
    runId: latest.decision.runId,
    decisionReceiptId: latest.decision.receiptId,
    decisionReceiptSha256: digestObject(latest.decision),
    authorization: authorizationCore(current),
    configBeforeSha256: digestObject(current),
    configAfterSha256: digestObject(inactiveAuthorization()),
    result: 'inactive',
  };
  const receipt = { ...core, receiptId: receiptId('PRA', core) };
  const validation = validateResetReceipt(receipt, latest.decision);
  if (!validation.pass) throw new Error(`generated reset receipt is invalid: ${validation.errors.join(', ')}`);
  return { receipt, target: latest.resetFile };
}

function writePreparedResetReceipt(repoRoot, prepared) {
  if (!prepared) return null;
  const target = resolveInsideRepo(repoRoot, prepared.target, 'reset receipt');
  atomicWriteJson(target, prepared.receipt);
  try {
    const history = loadDecisionHistory(repoRoot);
    const latest = history.entries.at(-1);
    if (!latest?.reset || latest.reset.receiptId !== prepared.receipt.receiptId) throw new Error('written reset receipt did not complete the validated decision chain');
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw error;
  }
  return { changed: true, target, receipt: prepared.receipt };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write' || token === '--json' || token === '--check-history') options[token.slice(2)] = true;
    else if (token === '--repo-root') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('--repo-root requires a value');
      options['repo-root'] = argv[++index];
    } else throw new Error(`unknown argument: ${token}`);
  }
  if (options.write && options['check-history']) throw new Error('--write and --check-history are mutually exclusive');
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(options['repo-root'] || path.resolve(__dirname, '..', '..'));
  if (options['check-history']) {
    const history = loadDecisionHistory(repoRoot);
    validateDecisionHistoryAnchor(repoRoot, history);
    const result = {
      schemaVersion: 1,
      kind: 'public-release-decision-history-check',
      receiptCount: history.entries.length,
      pendingResetCount: history.pendingRunIds.length,
      latestRunId: history.entries.at(-1)?.decision.runId || '',
    };
    console.log(options.json ? JSON.stringify(result, null, 2) : `release decision history OK (receipts=${result.receiptCount}, pendingReset=${result.pendingResetCount}, latest=${result.latestRunId || '-'})`);
    return;
  }
  const preview = options.write ? null : buildDecisionReceipt(repoRoot);
  const result = options.write
    ? writeDecisionReceipt(repoRoot)
    : { changed: false, target: decisionPath(repoRoot, preview.runId), receipt: preview };
  const output = {
    schemaVersion: 1,
    kind: 'public-release-decision-receipt-result',
    changed: result.changed,
    runId: result.receipt.runId,
    receiptId: result.receipt.receiptId,
    classification: result.receipt.change.classification,
    authorizationState: result.receipt.authorization.state,
    resetState: result.receipt.reset.state,
    target: path.relative(repoRoot, result.target).replace(/\\/g, '/'),
  };
  console.log(options.json ? JSON.stringify(output, null, 2) : `release decision receipt ${result.changed ? 'written' : 'previewed'}: ${output.receiptId} (${output.classification}, ${output.authorizationState})`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Public release decision receipt blocked: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  DECISION_SCHEMA_VERSION,
  DECISION_KIND,
  RESET_SCHEMA_VERSION,
  RESET_KIND,
  DECISION_FILE,
  RESET_FILE,
  ANCHOR_FILE,
  stableJson,
  digestObject,
  inactiveAuthorization,
  inactiveAnchor,
  anchorForDecision,
  validateDecisionReceipt,
  validateResetReceipt,
  validateDecisionHistoryEntries,
  loadDecisionHistory,
  validateDecisionHistoryAnchor,
  isFormalPreflightForRelease,
  buildDecisionReceipt,
  writeDecisionReceipt,
  prepareAuthorizationResetReceipt,
  writePreparedResetReceipt,
  parseArgs,
};
