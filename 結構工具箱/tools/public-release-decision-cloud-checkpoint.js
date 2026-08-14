const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const receipts = require('./public-release-decision-receipt.js');
const backups = require('./public-release-decision-backup.js');
const backupHealth = require('./public-release-decision-backup-health.js');
const drill = require('./public-release-decision-restore-drill.js');

const OBSERVATION_SCHEMA_VERSION = 1;
const OBSERVATION_KIND = 'public-release-decision-cloud-observation';
const CHECKPOINT_SCHEMA_VERSION = 1;
const CHECKPOINT_KIND = 'public-release-decision-cloud-checkpoint';
const VERIFICATION_SCHEMA_VERSION = 1;
const VERIFICATION_KIND = 'public-release-decision-cloud-verification';
const HEALTH_SCHEMA_VERSION = 1;
const HEALTH_KIND = 'public-release-decision-cloud-checkpoint-health';
const ANCHOR_SCHEMA_VERSION = 1;
const ANCHOR_KIND = 'public-release-decision-cloud-checkpoint-anchor';
const PROVIDER = 'google-drive';
const DEFAULT_CLOUD_DIRECTORY = 'cloud-checkpoints';
const DEFAULT_STAGING_DIRECTORY = 'output/audit/public-release-decision-cloud-checkpoint-staging';
const DEFAULT_VERIFICATION_DIRECTORY = 'output/audit/public-release-decision-cloud-verifications';
const DEFAULT_STATUS_FILE = 'output/audit/public-release-decision-cloud-checkpoint-health.json';
const DEFAULT_ANCHOR_FILE = 'output/audit/public-release-decision-cloud-checkpoint-anchor.json';
const DEFAULT_MAXIMUM_AGE_DAYS = 8;
const DEFAULT_MAXIMUM_OBSERVATION_AGE_HOURS = 24;
const CHECKPOINT_FILE_PATTERN = /^public-release-decision-cloud-checkpoint-(\d{8}-\d{6})-(\d{6})-(PDC-[0-9A-F]{24})\.json$/;
const VERIFICATION_FILE_PATTERN = /^public-release-decision-cloud-verification-(\d{8}-\d{6})-(PCV-[0-9A-F]{24})\.json$/;
const ISSUE_CODES = new Set([
  'external-cloud-directory-not-configured',
  'external-cloud-directory-unavailable',
  'cloud-checkpoint-source-invalid',
  'cloud-checkpoint-history-missing',
  'cloud-checkpoint-history-invalid',
  'current-cloud-checkpoint-missing',
  'cloud-checkpoint-provider-confirmation-missing',
  'cloud-checkpoint-provider-confirmation-invalid',
  'cloud-checkpoint-overdue',
  'cloud-checkpoint-timestamp-in-future',
  'cloud-checkpoint-anchor-missing',
  'cloud-checkpoint-anchor-mismatch',
  'cloud-checkpoint-anchor-behind',
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

function fileDigest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function digestText(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function timestampToken(value) {
  return value.replace(/[-:TZ.]/g, '').slice(0, 14).replace(/^(\d{8})(\d{6})/, '$1-$2');
}

function observationCore(value) {
  const { observationId: ignored, ...core } = value;
  return core;
}

function validateObservation(value) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(value, ['schemaVersion', 'kind', 'provider', 'observedAt', 'backup', 'drill', 'observationId']), 'observation.shape');
  add(value?.schemaVersion === OBSERVATION_SCHEMA_VERSION && value?.kind === OBSERVATION_KIND, 'observation.identity');
  add(value?.provider === PROVIDER, 'observation.provider');
  add(Number.isFinite(Date.parse(String(value?.observedAt || ''))), 'observation.observedAt');
  const validateRemoteFile = (remote, label, pattern) => {
    add(hasExactKeys(remote, ['fileName', 'byteLength', 'providerFileId', 'createdAt', 'modifiedAt']), `${label}.shape`);
    add(pattern.test(String(remote?.fileName || '')), `${label}.fileName`);
    add(Number.isInteger(remote?.byteLength) && remote.byteLength > 0, `${label}.byteLength`);
    add(/^[A-Za-z0-9_-]{10,200}$/.test(String(remote?.providerFileId || '')), `${label}.providerFileId`);
    add(Number.isFinite(Date.parse(String(remote?.createdAt || ''))), `${label}.createdAt`);
    add(Number.isFinite(Date.parse(String(remote?.modifiedAt || ''))), `${label}.modifiedAt`);
  };
  validateRemoteFile(value?.backup, 'observation.backup', backupHealth.BACKUP_FILE_PATTERN);
  validateRemoteFile(value?.drill, 'observation.drill', drill.DRILL_FILE_PATTERN);
  const expectedId = `PCO-${receipts.digestObject(observationCore(value || {})).slice(0, 24).toUpperCase()}`;
  add(/^PCO-[0-9A-F]{24}$/.test(String(value?.observationId || '')) && value?.observationId === expectedId, 'observation.observationId');
  return { pass: errors.length === 0, errors };
}

function loadObservation(filePath) {
  const target = path.resolve(filePath);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('cloud observation must be a regular file');
  const observation = JSON.parse(fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, ''));
  const validation = validateObservation(observation);
  if (!validation.pass) throw new Error(`cloud observation is invalid: ${validation.errors.join(', ')}`);
  return observation;
}

function validateCheckpoint(value) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(value, ['schemaVersion', 'kind', 'provider', 'generatedAt', 'sequence', 'current', 'backup', 'drill', 'observation', 'previousCheckpoint', 'checkpointId']), 'checkpoint.shape');
  add(value?.schemaVersion === CHECKPOINT_SCHEMA_VERSION && value?.kind === CHECKPOINT_KIND, 'checkpoint.identity');
  add(value?.provider === PROVIDER, 'checkpoint.provider');
  add(Number.isFinite(Date.parse(String(value?.generatedAt || ''))), 'checkpoint.generatedAt');
  add(Number.isInteger(value?.sequence) && value.sequence > 0, 'checkpoint.sequence');
  add(hasExactKeys(value?.current, ['latestRunId', 'receiptCount', 'receiptId', 'receiptSha256']), 'checkpoint.current.shape');
  add(/^\d{8}-\d{6}$/.test(String(value?.current?.latestRunId || '')), 'checkpoint.current.latestRunId');
  add(Number.isInteger(value?.current?.receiptCount) && value.current.receiptCount > 0, 'checkpoint.current.receiptCount');
  add(/^PRD-[0-9A-F]{24}$/.test(String(value?.current?.receiptId || '')), 'checkpoint.current.receiptId');
  add(/^[0-9a-f]{64}$/.test(String(value?.current?.receiptSha256 || '')), 'checkpoint.current.receiptSha256');
  add(hasExactKeys(value?.backup, ['backupId', 'backupSha256', 'fileName', 'byteLength']), 'checkpoint.backup.shape');
  add(/^PRB-[0-9A-F]{24}$/.test(String(value?.backup?.backupId || '')), 'checkpoint.backup.backupId');
  add(/^[0-9a-f]{64}$/.test(String(value?.backup?.backupSha256 || '')), 'checkpoint.backup.backupSha256');
  add(backupHealth.BACKUP_FILE_PATTERN.test(String(value?.backup?.fileName || '')), 'checkpoint.backup.fileName');
  add(Number.isInteger(value?.backup?.byteLength) && value.backup.byteLength > 0, 'checkpoint.backup.byteLength');
  add(hasExactKeys(value?.drill, ['historyReceiptCount', 'receiptId', 'receiptSha256', 'fileName', 'byteLength']), 'checkpoint.drill.shape');
  add(Number.isInteger(value?.drill?.historyReceiptCount) && value.drill.historyReceiptCount > 0, 'checkpoint.drill.historyReceiptCount');
  add(/^PDR-[0-9A-F]{24}$/.test(String(value?.drill?.receiptId || '')), 'checkpoint.drill.receiptId');
  add(/^[0-9a-f]{64}$/.test(String(value?.drill?.receiptSha256 || '')), 'checkpoint.drill.receiptSha256');
  add(drill.DRILL_FILE_PATTERN.test(String(value?.drill?.fileName || '')), 'checkpoint.drill.fileName');
  add(Number.isInteger(value?.drill?.byteLength) && value.drill.byteLength > 0, 'checkpoint.drill.byteLength');
  add(hasExactKeys(value?.observation, ['observationId', 'observedAt', 'backupProviderFileIdSha256', 'drillProviderFileIdSha256']), 'checkpoint.observation.shape');
  add(/^PCO-[0-9A-F]{24}$/.test(String(value?.observation?.observationId || '')), 'checkpoint.observation.observationId');
  add(Number.isFinite(Date.parse(String(value?.observation?.observedAt || ''))), 'checkpoint.observation.observedAt');
  add(/^[0-9a-f]{64}$/.test(String(value?.observation?.backupProviderFileIdSha256 || '')), 'checkpoint.observation.backupProviderFileIdSha256');
  add(/^[0-9a-f]{64}$/.test(String(value?.observation?.drillProviderFileIdSha256 || '')), 'checkpoint.observation.drillProviderFileIdSha256');
  add(hasExactKeys(value?.previousCheckpoint, ['checkpointId', 'checkpointSha256']), 'checkpoint.previousCheckpoint.shape');
  const first = value?.sequence === 1;
  add(first ? value?.previousCheckpoint?.checkpointId === '' : /^PDC-[0-9A-F]{24}$/.test(String(value?.previousCheckpoint?.checkpointId || '')), 'checkpoint.previousCheckpoint.checkpointId');
  add(first ? value?.previousCheckpoint?.checkpointSha256 === '' : /^[0-9a-f]{64}$/.test(String(value?.previousCheckpoint?.checkpointSha256 || '')), 'checkpoint.previousCheckpoint.checkpointSha256');
  const { checkpointId: ignored, ...core } = value || {};
  const expectedId = `PDC-${receipts.digestObject(core).slice(0, 24).toUpperCase()}`;
  add(/^PDC-[0-9A-F]{24}$/.test(String(value?.checkpointId || '')) && value?.checkpointId === expectedId, 'checkpoint.checkpointId');
  return { pass: errors.length === 0, errors };
}

function verificationCore(value) {
  const { verificationId: ignored, ...core } = value;
  return core;
}

function validateProviderVerification(value) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(value, ['schemaVersion', 'kind', 'provider', 'observedAt', 'checkpoint', 'verificationId']), 'verification.shape');
  add(value?.schemaVersion === VERIFICATION_SCHEMA_VERSION && value?.kind === VERIFICATION_KIND, 'verification.identity');
  add(value?.provider === PROVIDER, 'verification.provider');
  add(Number.isFinite(Date.parse(String(value?.observedAt || ''))), 'verification.observedAt');
  add(hasExactKeys(value?.checkpoint, ['fileName', 'byteLength', 'providerFileId', 'createdAt', 'modifiedAt']), 'verification.checkpoint.shape');
  add(CHECKPOINT_FILE_PATTERN.test(String(value?.checkpoint?.fileName || '')), 'verification.checkpoint.fileName');
  add(Number.isInteger(value?.checkpoint?.byteLength) && value.checkpoint.byteLength > 0, 'verification.checkpoint.byteLength');
  add(/^[A-Za-z0-9_-]{10,200}$/.test(String(value?.checkpoint?.providerFileId || '')), 'verification.checkpoint.providerFileId');
  add(Number.isFinite(Date.parse(String(value?.checkpoint?.createdAt || ''))), 'verification.checkpoint.createdAt');
  add(Number.isFinite(Date.parse(String(value?.checkpoint?.modifiedAt || ''))), 'verification.checkpoint.modifiedAt');
  const expectedId = `PCV-${receipts.digestObject(verificationCore(value || {})).slice(0, 24).toUpperCase()}`;
  add(/^PCV-[0-9A-F]{24}$/.test(String(value?.verificationId || '')) && value?.verificationId === expectedId, 'verification.verificationId');
  return { pass: errors.length === 0, errors };
}

function loadProviderVerification(filePath) {
  const target = path.resolve(filePath);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('cloud provider verification must be a regular file');
  const verification = JSON.parse(fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, ''));
  const validation = validateProviderVerification(verification);
  if (!validation.pass) throw new Error(`cloud provider verification is invalid: ${validation.errors.join(', ')}`);
  return verification;
}

function loadProviderVerificationHistory(repoRoot, requestedDirectory = DEFAULT_VERIFICATION_DIRECTORY) {
  const root = path.resolve(repoRoot);
  const directory = path.resolve(root, requestedDirectory);
  const relative = path.relative(root, directory);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('cloud provider verification directory must stay inside the repository');
  if (!fs.existsSync(directory)) return { directory, entries: [] };
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('cloud provider verification directory must be a regular directory');
  const entries = fs.readdirSync(directory)
    .filter(name => VERIFICATION_FILE_PATTERN.test(name))
    .map(name => {
      const filePath = path.join(directory, name);
      const verification = loadProviderVerification(filePath);
      const match = VERIFICATION_FILE_PATTERN.exec(name);
      if (match[1] !== timestampToken(verification.observedAt) || match[2] !== verification.verificationId) {
        throw new Error(`cloud provider verification filename does not match its content: ${name}`);
      }
      return { name, filePath, verification };
    })
    .sort((left, right) => Date.parse(left.verification.observedAt) - Date.parse(right.verification.observedAt)
      || left.name.localeCompare(right.name));
  const ids = new Set();
  entries.forEach(entry => {
    if (ids.has(entry.verification.verificationId)) throw new Error(`duplicate cloud provider verification ID: ${entry.verification.verificationId}`);
    ids.add(entry.verification.verificationId);
  });
  return { directory, entries };
}

function loadCheckpointHistory(directory, options = {}) {
  const target = path.resolve(directory);
  if (!fs.existsSync(target)) {
    if (options.allowMissing) return { directory: target, entries: [] };
    throw new Error('cloud checkpoint directory is missing');
  }
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('cloud checkpoint directory must be a regular directory');
  const entries = fs.readdirSync(target)
    .filter(name => CHECKPOINT_FILE_PATTERN.test(name))
    .map(name => {
      const filePath = path.join(target, name);
      const fileStat = fs.lstatSync(filePath);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error(`cloud checkpoint is not a regular file: ${name}`);
      const checkpoint = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
      const validation = validateCheckpoint(checkpoint);
      if (!validation.pass) throw new Error(`invalid cloud checkpoint ${name}: ${validation.errors.join(', ')}`);
      const match = CHECKPOINT_FILE_PATTERN.exec(name);
      if (match[1] !== timestampToken(checkpoint.generatedAt) || match[2] !== String(checkpoint.sequence).padStart(6, '0') || match[3] !== checkpoint.checkpointId) {
        throw new Error(`cloud checkpoint filename does not match its content: ${name}`);
      }
      return { name, filePath, checkpoint, fileSha256: fileDigest(filePath), byteLength: fileStat.size };
    })
    .sort((left, right) => left.checkpoint.sequence - right.checkpoint.sequence);
  const ids = new Set();
  entries.forEach((entry, index) => {
    const expectedSequence = index + 1;
    if (entry.checkpoint.sequence !== expectedSequence) throw new Error(`cloud checkpoint sequence is not contiguous at ${entry.name}`);
    if (ids.has(entry.checkpoint.checkpointId)) throw new Error(`duplicate cloud checkpoint ID: ${entry.checkpoint.checkpointId}`);
    ids.add(entry.checkpoint.checkpointId);
    if (index) {
      const previous = entries[index - 1];
      if (entry.checkpoint.previousCheckpoint.checkpointId !== previous.checkpoint.checkpointId
        || entry.checkpoint.previousCheckpoint.checkpointSha256 !== receipts.digestObject(previous.checkpoint)) {
        throw new Error(`cloud checkpoint chain link is invalid at ${entry.name}`);
      }
    }
  });
  return { directory: target, entries };
}

function selectCurrentBackup(externalDirectory, currentAnchor, currentReceiptCount) {
  const matches = fs.readdirSync(externalDirectory)
    .filter(name => backupHealth.BACKUP_FILE_PATTERN.test(name))
    .map(name => backups.loadBackup(path.join(externalDirectory, name)))
    .filter(loaded => receipts.stableJson(loaded.backup.chain.anchor) === receipts.stableJson(currentAnchor)
      && loaded.backup.chain.receiptCount === currentReceiptCount);
  if (matches.length !== 1) throw new Error(`expected exactly one current external backup, found ${matches.length}`);
  return matches[0];
}

function currentState(repoRoot, externalDirectory) {
  const root = path.resolve(repoRoot);
  const external = path.resolve(externalDirectory);
  const localDirectory = path.join(root, ...backups.DEFAULT_BACKUP_DIR.split('/'));
  if (samePath(localDirectory, external)) throw new Error('external cloud directory cannot match the local backup directory');
  if (!fs.existsSync(external) || !fs.lstatSync(external).isDirectory()) throw new Error('external cloud directory is unavailable');
  const history = receipts.loadDecisionHistory(root);
  const anchorState = receipts.validateDecisionHistoryAnchor(root, history);
  if (!history.entries.length) throw new Error('cloud checkpoint requires at least one private decision receipt');
  const decision = history.entries.at(-1).decision;
  const loadedBackup = selectCurrentBackup(external, anchorState.anchor, history.entries.length);
  const backupStat = fs.statSync(loadedBackup.target);
  const localDrill = drill.loadReceiptHistory(path.join(localDirectory, drill.DRILL_DIRECTORY));
  const externalDrill = drill.loadReceiptHistory(path.join(external, drill.DRILL_DIRECTORY));
  if (!drill.historiesMatch(localDrill, externalDrill)) throw new Error('local and external drill histories differ');
  drill.loadReceiptAnchor(root, localDrill);
  const drillTip = externalDrill.entries.at(-1);
  if (!drillTip || drillTip.receipt.chain.latestRunId !== decision.runId) throw new Error('current release has no matching restore drill tip');
  return {
    history,
    decision,
    current: {
      latestRunId: decision.runId,
      receiptCount: history.entries.length,
      receiptId: decision.receiptId,
      receiptSha256: receipts.digestObject(decision),
    },
    backup: {
      backupId: loadedBackup.backup.backupId,
      backupSha256: fileDigest(loadedBackup.target),
      fileName: path.basename(loadedBackup.target),
      byteLength: backupStat.size,
    },
    drill: {
      historyReceiptCount: externalDrill.entries.length,
      receiptId: drillTip.receipt.receiptId,
      receiptSha256: receipts.digestObject(drillTip.receipt),
      fileName: drillTip.name,
      byteLength: fs.statSync(drillTip.filePath).size,
    },
    drillHistory: externalDrill,
  };
}

function validateObservationAgainstState(observation, state, now, maximumAgeHours) {
  const errors = [];
  if (observation.backup.fileName !== state.backup.fileName || observation.backup.byteLength !== state.backup.byteLength) errors.push('backup metadata mismatch');
  if (observation.drill.fileName !== state.drill.fileName || observation.drill.byteLength !== state.drill.byteLength) errors.push('drill metadata mismatch');
  const observedMs = Date.parse(observation.observedAt);
  const nowMs = now.getTime();
  if (observedMs > nowMs + 5 * 60000) errors.push('observation timestamp is in the future');
  if (nowMs - observedMs > maximumAgeHours * 3600000) errors.push('observation is too old');
  for (const remote of [observation.backup, observation.drill]) {
    if (Date.parse(remote.createdAt) > observedMs + 5 * 60000 || Date.parse(remote.modifiedAt) > observedMs + 5 * 60000) errors.push('remote file timestamp is after the observation');
  }
  if (errors.length) throw new Error(`cloud observation does not prove the current source: ${errors.join(', ')}`);
}

function buildCheckpoint(repoRoot, options = {}) {
  const root = path.resolve(repoRoot);
  const externalDirectory = String(options.externalDirectory === undefined ? process.env.PUBLIC_RELEASE_DECISION_BACKUP_DIR || '' : options.externalDirectory || '');
  if (!externalDirectory) throw new Error('external cloud directory is not configured');
  if (!options.observationFile) throw new Error('observationFile is required');
  const now = options.now instanceof Date ? options.now : new Date();
  const maximumAgeHours = Number(options.maximumObservationAgeHours ?? DEFAULT_MAXIMUM_OBSERVATION_AGE_HOURS);
  if (!Number.isInteger(maximumAgeHours) || maximumAgeHours < 1 || maximumAgeHours > 168) throw new Error('maximumObservationAgeHours must be an integer from 1 to 168');
  const observation = loadObservation(options.observationFile);
  const state = currentState(root, externalDirectory);
  validateObservationAgainstState(observation, state, now, maximumAgeHours);
  const cloudDirectory = path.join(externalDirectory, DEFAULT_CLOUD_DIRECTORY);
  const checkpointHistory = loadCheckpointHistory(cloudDirectory, { allowMissing: true });
  const previous = checkpointHistory.entries.at(-1)?.checkpoint || null;
  const core = {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    kind: CHECKPOINT_KIND,
    provider: PROVIDER,
    generatedAt: now.toISOString(),
    sequence: checkpointHistory.entries.length + 1,
    current: state.current,
    backup: state.backup,
    drill: state.drill,
    observation: {
      observationId: observation.observationId,
      observedAt: observation.observedAt,
      backupProviderFileIdSha256: digestText(observation.backup.providerFileId),
      drillProviderFileIdSha256: digestText(observation.drill.providerFileId),
    },
    previousCheckpoint: previous
      ? { checkpointId: previous.checkpointId, checkpointSha256: receipts.digestObject(previous) }
      : { checkpointId: '', checkpointSha256: '' },
  };
  const checkpoint = { ...core, checkpointId: `PDC-${receipts.digestObject(core).slice(0, 24).toUpperCase()}` };
  const validation = validateCheckpoint(checkpoint);
  if (!validation.pass) throw new Error(`generated cloud checkpoint is invalid: ${validation.errors.join(', ')}`);
  const stagingDirectory = path.resolve(root, options.stagingDirectory || DEFAULT_STAGING_DIRECTORY);
  const relative = path.relative(root, stagingDirectory);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('cloud checkpoint staging directory must stay inside the repository');
  fs.mkdirSync(stagingDirectory, { recursive: true });
  const fileName = `public-release-decision-cloud-checkpoint-${timestampToken(checkpoint.generatedAt)}-${String(checkpoint.sequence).padStart(6, '0')}-${checkpoint.checkpointId}.json`;
  const target = path.join(stagingDirectory, fileName);
  if (fs.existsSync(target)) throw new Error('cloud checkpoint staging file already exists');
  fs.writeFileSync(target, `${JSON.stringify(checkpoint, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { checkpoint, target, fileName, byteLength: fs.statSync(target).size };
}

function recordProviderVerification(repoRoot, options = {}) {
  const root = path.resolve(repoRoot);
  const externalDirectory = String(options.externalDirectory === undefined ? process.env.PUBLIC_RELEASE_DECISION_BACKUP_DIR || '' : options.externalDirectory || '');
  if (!externalDirectory) throw new Error('external cloud directory is not configured');
  if (!options.verificationFile) throw new Error('verificationFile is required');
  const now = options.now instanceof Date ? options.now : new Date();
  const maximumAgeHours = Number(options.maximumObservationAgeHours ?? DEFAULT_MAXIMUM_OBSERVATION_AGE_HOURS);
  if (!Number.isInteger(maximumAgeHours) || maximumAgeHours < 1 || maximumAgeHours > 168) throw new Error('maximumObservationAgeHours must be an integer from 1 to 168');
  const verification = loadProviderVerification(options.verificationFile);
  const observedMs = Date.parse(verification.observedAt);
  const nowMs = now.getTime();
  const errors = [];
  if (observedMs > nowMs + 5 * 60000) errors.push('verification timestamp is in the future');
  if (nowMs - observedMs > maximumAgeHours * 3600000) errors.push('verification is too old');
  if (Date.parse(verification.checkpoint.createdAt) > observedMs + 5 * 60000
    || Date.parse(verification.checkpoint.modifiedAt) > observedMs + 5 * 60000) errors.push('remote checkpoint timestamp is after the verification');
  let history;
  try { history = loadCheckpointHistory(path.join(path.resolve(externalDirectory), DEFAULT_CLOUD_DIRECTORY)); }
  catch (error) { throw new Error(`cloud checkpoint provider verification source is invalid: ${error.message}`); }
  const matches = history.entries.filter(entry => entry.name === verification.checkpoint.fileName
    && entry.byteLength === verification.checkpoint.byteLength);
  if (matches.length !== 1) errors.push(`expected one matching cloud checkpoint, found ${matches.length}`);
  if (errors.length) throw new Error(`cloud provider verification does not prove the mounted checkpoint: ${errors.join(', ')}`);
  const verificationHistory = loadProviderVerificationHistory(root, options.verificationDirectory || DEFAULT_VERIFICATION_DIRECTORY);
  const existing = verificationHistory.entries.find(entry => entry.verification.verificationId === verification.verificationId);
  if (existing) {
    if (receipts.stableJson(existing.verification) !== receipts.stableJson(verification)) throw new Error('existing cloud provider verification content differs');
    return { verification, target: existing.filePath, fileName: existing.name, checkpoint: matches[0], reused: true };
  }
  fs.mkdirSync(verificationHistory.directory, { recursive: true });
  const fileName = `public-release-decision-cloud-verification-${timestampToken(verification.observedAt)}-${verification.verificationId}.json`;
  const target = path.join(verificationHistory.directory, fileName);
  fs.writeFileSync(target, `${JSON.stringify(verification, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { verification, target, fileName, checkpoint: matches[0], reused: false };
}

function anchorForHistory(history) {
  const tip = history.entries.at(-1);
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    kind: ANCHOR_KIND,
    checkpointCount: history.entries.length,
    checkpointId: tip?.checkpoint.checkpointId || '',
    checkpointSha256: tip ? receipts.digestObject(tip.checkpoint) : '',
  };
}

function validateAnchor(value) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(value, ['schemaVersion', 'kind', 'checkpointCount', 'checkpointId', 'checkpointSha256']), 'anchor.shape');
  add(value?.schemaVersion === ANCHOR_SCHEMA_VERSION && value?.kind === ANCHOR_KIND, 'anchor.identity');
  add(Number.isInteger(value?.checkpointCount) && value.checkpointCount >= 0, 'anchor.checkpointCount');
  const empty = value?.checkpointCount === 0;
  add(empty ? value?.checkpointId === '' : /^PDC-[0-9A-F]{24}$/.test(String(value?.checkpointId || '')), 'anchor.checkpointId');
  add(empty ? value?.checkpointSha256 === '' : /^[0-9a-f]{64}$/.test(String(value?.checkpointSha256 || '')), 'anchor.checkpointSha256');
  return { pass: errors.length === 0, errors };
}

function readAnchor(repoRoot) {
  const target = path.join(repoRoot, ...DEFAULT_ANCHOR_FILE.split('/'));
  if (!fs.existsSync(target)) return { exists: false, target, anchor: null };
  const anchor = JSON.parse(fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, ''));
  const validation = validateAnchor(anchor);
  if (!validation.pass) throw new Error(`cloud checkpoint anchor is invalid: ${validation.errors.join(', ')}`);
  return { exists: true, target, anchor };
}

function replaceJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const suffix = `${process.pid}.${Date.now()}`;
  const temporary = `${target}.${suffix}.tmp`;
  const displaced = `${target}.${suffix}.bak`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  let displacedExisting = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, displaced);
      displacedExisting = true;
    }
    fs.renameSync(temporary, target);
    if (displacedExisting) {
      try { fs.rmSync(displaced, { force: true }); }
      catch { /* the committed checkpoint state remains authoritative */ }
    }
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    if (displacedExisting && !fs.existsSync(target)) fs.renameSync(displaced, target);
    else fs.rmSync(displaced, { force: true });
    throw error;
  }
}

function checkpointMatchesState(checkpoint, state) {
  const provedDrillEntry = state.drillHistory.entries[checkpoint.drill.historyReceiptCount - 1];
  const provedDrill = provedDrillEntry ? {
    historyReceiptCount: checkpoint.drill.historyReceiptCount,
    receiptId: provedDrillEntry.receipt.receiptId,
    receiptSha256: receipts.digestObject(provedDrillEntry.receipt),
    fileName: provedDrillEntry.name,
    byteLength: fs.statSync(provedDrillEntry.filePath).size,
  } : null;
  return receipts.stableJson(checkpoint.current) === receipts.stableJson(state.current)
    && receipts.stableJson(checkpoint.backup) === receipts.stableJson(state.backup)
    && provedDrill !== null
    && receipts.stableJson(checkpoint.drill) === receipts.stableJson(provedDrill);
}

function checkHealth(repoRoot, options = {}) {
  const root = path.resolve(repoRoot);
  const now = options.now instanceof Date ? options.now : new Date();
  const maximumAgeDays = Number(options.maximumAgeDays ?? DEFAULT_MAXIMUM_AGE_DAYS);
  if (!Number.isInteger(maximumAgeDays) || maximumAgeDays < 1 || maximumAgeDays > 365) throw new Error('maximumAgeDays must be an integer from 1 to 365');
  const decisionHistory = receipts.loadDecisionHistory(root);
  receipts.validateDecisionHistoryAnchor(root, decisionHistory);
  if (!decisionHistory.entries.length) throw new Error('cloud checkpoint health requires at least one private decision receipt');
  const externalDirectory = String(options.externalDirectory === undefined ? process.env.PUBLIC_RELEASE_DECISION_BACKUP_DIR || '' : options.externalDirectory || '');
  const externalRequired = options.requireExternal === true;
  const issueCodes = [];
  let state = null;
  let checkpointHistory = { entries: [] };
  let verificationHistory = { entries: [] };
  let externalExists = false;
  if (!externalDirectory) {
    if (externalRequired) issueCodes.push('external-cloud-directory-not-configured');
  } else if (!fs.existsSync(externalDirectory) || !fs.lstatSync(externalDirectory).isDirectory()) {
    issueCodes.push('external-cloud-directory-unavailable');
  } else {
    externalExists = true;
    try { state = currentState(root, externalDirectory); }
    catch { issueCodes.push('cloud-checkpoint-source-invalid'); }
    try {
      checkpointHistory = loadCheckpointHistory(path.join(externalDirectory, DEFAULT_CLOUD_DIRECTORY), { allowMissing: true });
      if (!checkpointHistory.entries.length) issueCodes.push('cloud-checkpoint-history-missing');
    } catch {
      checkpointHistory = { entries: [] };
      issueCodes.push('cloud-checkpoint-history-invalid');
    }
    try { verificationHistory = loadProviderVerificationHistory(root); }
    catch {
      verificationHistory = { entries: [] };
      issueCodes.push('cloud-checkpoint-provider-confirmation-invalid');
    }
  }
  const currentEntries = state ? checkpointHistory.entries.filter(entry => checkpointMatchesState(entry.checkpoint, state)) : [];
  if (state && !currentEntries.length) issueCodes.push('current-cloud-checkpoint-missing');
  const latestCurrent = currentEntries.at(-1) || null;
  const currentVerifications = latestCurrent ? verificationHistory.entries.filter(entry => entry.verification.checkpoint.fileName === latestCurrent.name
    && entry.verification.checkpoint.byteLength === latestCurrent.byteLength) : [];
  const latestVerification = currentVerifications.at(-1) || null;
  if (latestCurrent && !latestVerification) issueCodes.push('cloud-checkpoint-provider-confirmation-missing');
  let latestObservationAgeDays = -1;
  if (latestVerification) {
    latestObservationAgeDays = (now.getTime() - Date.parse(latestVerification.verification.observedAt)) / 86400000;
    if (latestObservationAgeDays < -5 / 1440) issueCodes.push('cloud-checkpoint-timestamp-in-future');
    else if (latestObservationAgeDays > maximumAgeDays) issueCodes.push('cloud-checkpoint-overdue');
  }
  let anchorAccepted = false;
  if (externalExists) {
    let anchorState;
    try {
      anchorState = readAnchor(root);
      if (!anchorState.exists) {
        if (checkpointHistory.entries.length && options.acceptNewTip && latestCurrent && latestVerification) {
          replaceJson(anchorState.target, anchorForHistory(checkpointHistory));
          anchorAccepted = true;
        } else if (checkpointHistory.entries.length) issueCodes.push('cloud-checkpoint-anchor-missing');
      } else {
        const count = anchorState.anchor.checkpointCount;
        const anchoredEntry = count > 0 ? checkpointHistory.entries[count - 1] : null;
        const prefixMatches = count <= checkpointHistory.entries.length
          && (count === 0 || (anchoredEntry
            && anchoredEntry.checkpoint.checkpointId === anchorState.anchor.checkpointId
            && receipts.digestObject(anchoredEntry.checkpoint) === anchorState.anchor.checkpointSha256));
        if (!prefixMatches) issueCodes.push('cloud-checkpoint-anchor-mismatch');
        else if (count < checkpointHistory.entries.length) {
          if (options.acceptNewTip && latestCurrent && latestVerification) {
            replaceJson(anchorState.target, anchorForHistory(checkpointHistory));
            anchorAccepted = true;
          } else issueCodes.push('cloud-checkpoint-anchor-behind');
        }
      }
    } catch {
      issueCodes.push('cloud-checkpoint-anchor-mismatch');
    }
  }
  const uniqueIssueCodes = [...new Set(issueCodes)];
  const status = uniqueIssueCodes.length ? 'attention-required' : (externalDirectory ? 'healthy' : 'local-only');
  const result = {
    schemaVersion: HEALTH_SCHEMA_VERSION,
    kind: HEALTH_KIND,
    checkedAt: now.toISOString(),
    status,
    current: {
      decisionReceiptCount: decisionHistory.entries.length,
      pendingResetCount: decisionHistory.pendingRunIds.length,
      latestRunId: decisionHistory.entries.at(-1).decision.runId,
    },
    policy: { maximumAgeDays, externalRequired },
    external: {
      configured: Boolean(externalDirectory),
      exists: externalExists,
      checkpointCount: checkpointHistory.entries.length,
      currentCheckpointCount: currentEntries.length,
    },
    provider: {
      name: PROVIDER,
      roundTripValidated: Boolean(latestCurrent && latestVerification),
      anchorAccepted,
      latestObservationAgeDays: latestObservationAgeDays < 0 ? -1 : Number(latestObservationAgeDays.toFixed(3)),
    },
    issueCodes: uniqueIssueCodes,
  };
  const validation = validateHealthStatus(result);
  if (!validation.pass) throw new Error(`generated cloud checkpoint health status is invalid: ${validation.errors.join(', ')}`);
  return result;
}

function validateHealthStatus(value) {
  const errors = [];
  const add = (pass, label) => { if (!pass) errors.push(label); };
  add(hasExactKeys(value, ['schemaVersion', 'kind', 'checkedAt', 'status', 'current', 'policy', 'external', 'provider', 'issueCodes']), 'status.shape');
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
  add(hasExactKeys(value?.external, ['configured', 'exists', 'checkpointCount', 'currentCheckpointCount']), 'status.external.shape');
  add(typeof value?.external?.configured === 'boolean' && typeof value?.external?.exists === 'boolean', 'status.external.flags');
  add(Number.isInteger(value?.external?.checkpointCount) && value.external.checkpointCount >= 0, 'status.external.checkpointCount');
  add(Number.isInteger(value?.external?.currentCheckpointCount) && value.external.currentCheckpointCount >= 0 && value.external.currentCheckpointCount <= value.external.checkpointCount, 'status.external.currentCheckpointCount');
  add(hasExactKeys(value?.provider, ['name', 'roundTripValidated', 'anchorAccepted', 'latestObservationAgeDays']), 'status.provider.shape');
  add(value?.provider?.name === PROVIDER, 'status.provider.name');
  add(typeof value?.provider?.roundTripValidated === 'boolean' && typeof value?.provider?.anchorAccepted === 'boolean', 'status.provider.flags');
  add(typeof value?.provider?.latestObservationAgeDays === 'number' && Number.isFinite(value.provider.latestObservationAgeDays) && value.provider.latestObservationAgeDays >= -1, 'status.provider.latestObservationAgeDays');
  add(Array.isArray(value?.issueCodes) && value.issueCodes.every(code => ISSUE_CODES.has(code)) && new Set(value.issueCodes).size === value.issueCodes.length, 'status.issueCodes');
  const expected = value?.issueCodes?.length ? 'attention-required' : (value?.external?.configured ? 'healthy' : 'local-only');
  add(value?.status === expected, 'status.statusSemantics');
  return { pass: errors.length === 0, errors };
}

function writeHealthStatus(repoRoot, status, requestedPath = DEFAULT_STATUS_FILE) {
  const validation = validateHealthStatus(status);
  if (!validation.pass) throw new Error(`cloud checkpoint health status is invalid: ${validation.errors.join(', ')}`);
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, requestedPath);
  const relative = path.relative(root, target);
  if (relative && (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) throw new Error('cloud checkpoint health status path must stay inside the repository');
  replaceJson(target, status);
  return target;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (['--prepare', '--confirm', '--check', '--write', '--json', '--require-external', '--accept-new-tip'].includes(token)) options[token.slice(2)] = true;
    else if (['--repo-root', '--observation-file', '--verification-file', '--staging-directory', '--verification-directory', '--status-file', '--maximum-age-days', '--maximum-observation-age-hours'].includes(token)) {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`${token} requires a value`);
      options[token.slice(2)] = argv[++index];
    } else throw new Error(`unknown argument: ${token}`);
  }
  if ([options.prepare, options.confirm, options.check].filter(Boolean).length !== 1) throw new Error('choose exactly one of --prepare, --confirm, or --check');
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(options['repo-root'] || path.resolve(__dirname, '..', '..'));
  if (options.prepare) {
    const result = buildCheckpoint(repoRoot, {
      observationFile: options['observation-file'],
      stagingDirectory: options['staging-directory'],
      maximumObservationAgeHours: options['maximum-observation-age-hours'] === undefined ? DEFAULT_MAXIMUM_OBSERVATION_AGE_HOURS : Number(options['maximum-observation-age-hours']),
    });
    const output = {
      schemaVersion: 1,
      kind: 'public-release-decision-cloud-checkpoint-prepare-result',
      checkpointId: result.checkpoint.checkpointId,
      sequence: result.checkpoint.sequence,
      latestRunId: result.checkpoint.current.latestRunId,
      fileName: result.fileName,
      byteLength: result.byteLength,
      target: result.target,
    };
    console.log(options.json ? JSON.stringify(output, null, 2) : `cloud checkpoint prepared: ${output.checkpointId} (sequence=${output.sequence}, run=${output.latestRunId})`);
    return;
  }
  if (options.confirm) {
    const result = recordProviderVerification(repoRoot, {
      verificationFile: options['verification-file'],
      verificationDirectory: options['verification-directory'],
      maximumObservationAgeHours: options['maximum-observation-age-hours'] === undefined ? DEFAULT_MAXIMUM_OBSERVATION_AGE_HOURS : Number(options['maximum-observation-age-hours']),
    });
    const output = {
      schemaVersion: 1,
      kind: 'public-release-decision-cloud-verification-record-result',
      verificationId: result.verification.verificationId,
      checkpointFileName: result.verification.checkpoint.fileName,
      reused: result.reused,
      target: result.target,
    };
    console.log(options.json ? JSON.stringify(output, null, 2) : `cloud checkpoint provider verification recorded: ${output.verificationId}`);
    return;
  }
  const status = checkHealth(repoRoot, {
    maximumAgeDays: options['maximum-age-days'] === undefined ? DEFAULT_MAXIMUM_AGE_DAYS : Number(options['maximum-age-days']),
    requireExternal: options['require-external'] === true,
    acceptNewTip: options['accept-new-tip'] === true,
  });
  const target = options.write ? writeHealthStatus(repoRoot, status, options['status-file'] || DEFAULT_STATUS_FILE) : '';
  const output = { ...status, written: Boolean(target) };
  console.log(options.json ? JSON.stringify(output, null, 2) : `cloud checkpoint health: ${status.status} (checkpoints=${status.external.checkpointCount}, current=${status.external.currentCheckpointCount}, issues=${status.issueCodes.length})`);
  if (status.status === 'attention-required') process.exitCode = 1;
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(`Public release decision cloud checkpoint blocked: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_KIND,
  CHECKPOINT_SCHEMA_VERSION,
  CHECKPOINT_KIND,
  VERIFICATION_SCHEMA_VERSION,
  VERIFICATION_KIND,
  HEALTH_SCHEMA_VERSION,
  HEALTH_KIND,
  ANCHOR_SCHEMA_VERSION,
  ANCHOR_KIND,
  PROVIDER,
  DEFAULT_CLOUD_DIRECTORY,
  DEFAULT_STAGING_DIRECTORY,
  DEFAULT_VERIFICATION_DIRECTORY,
  DEFAULT_STATUS_FILE,
  DEFAULT_ANCHOR_FILE,
  DEFAULT_MAXIMUM_AGE_DAYS,
  DEFAULT_MAXIMUM_OBSERVATION_AGE_HOURS,
  CHECKPOINT_FILE_PATTERN,
  VERIFICATION_FILE_PATTERN,
  ISSUE_CODES,
  observationCore,
  validateObservation,
  loadObservation,
  validateCheckpoint,
  verificationCore,
  validateProviderVerification,
  loadProviderVerification,
  loadProviderVerificationHistory,
  loadCheckpointHistory,
  currentState,
  buildCheckpoint,
  recordProviderVerification,
  anchorForHistory,
  validateAnchor,
  readAnchor,
  checkHealth,
  validateHealthStatus,
  writeHealthStatus,
  parseArgs,
};
