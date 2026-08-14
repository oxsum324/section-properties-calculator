const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const publicEvidenceSchema = require('../assets/status/public-evidence-schema.js');
const maturityMatrix = require('./tool-maturity-matrix.js');

const AUTHORIZATION_FILE = '.github/public-release-reduction-authorization.json';
const PREFLIGHT_FILE = 'output/preflight/preflight-summary.json';
const PLATFORM_STATUS_FILE = '結構工具箱/assets/status/platform-status.json';
const PUBLIC_PREFLIGHT_FILE = '結構工具箱/assets/status/preflight-summary.json';
const READINESS_STATUS_FILE = '結構工具箱/assets/status/report-readiness-status.json';
const RENDERED_EVIDENCE_NAME = 'rendered-delivery-evidence-summary.json';
const CANDIDATE_SCHEMA_VERSION = 1;
const PREVIEW_SCHEMA_VERSION = 1;
const METRIC_REQUIRED_FIELDS = Object.freeze({
  steelResult: 'steelResultReconciliationRequired',
  steelContentSeal: 'steelHtmlContentSealRequired',
  steelApprovalSeal: 'steelHtmlApprovalSealRequired',
  rcResult: 'rcResultReconciliationRequired',
  rcPrint: 'rcStandaloneFormalHtmlPrintRequired',
  rcPackage: 'rcSourceReportPackageRequired',
  formalResult: 'formalResultReconciliationRequired',
  localQuickResult: 'localQuickResultReconciliationRequired',
  rendered: 'renderedDeliveryEvidenceRequired',
  delivery: 'deliveryFileIntegrityRequired',
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && wanted.every((key, index) => actual[index] === key);
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`${label} is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function relativePath(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function resolveInsideRepo(repoRoot, requestedPath, label) {
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, requestedPath);
  const relative = path.relative(root, target);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) return target;
  throw new Error(`${label} must stay inside the repository`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function statusBundle(repoRoot) {
  return {
    platformStatus: readJson(path.join(repoRoot, ...PLATFORM_STATUS_FILE.split('/')), 'tracked platform status'),
    preflightStatus: readJson(path.join(repoRoot, ...PUBLIC_PREFLIGHT_FILE.split('/')), 'tracked public preflight status'),
    reportReadinessStatus: readJson(path.join(repoRoot, ...READINESS_STATUS_FILE.split('/')), 'tracked report readiness status'),
  };
}

function baselineHistoryEntry(repoRoot) {
  const bundle = statusBundle(repoRoot);
  const validation = publicEvidenceSchema.validatePublicEvidenceBundle(bundle);
  if (!validation.pass) throw new Error(`tracked public evidence is invalid: ${validation.errors.join(', ')}`);
  return validation.releaseHistory.entries.at(-1);
}

function candidateEntry(runId, recordsRequired, postChecksRequired, metricRequired) {
  if (!/^\d{8}-\d{6}$/.test(String(runId || ''))) throw new Error('candidate runId must use YYYYMMDD-HHMMSS');
  if (!Number.isInteger(recordsRequired) || recordsRequired <= 0) throw new Error('candidate recordsRequired must be a positive integer');
  if (!Number.isInteger(postChecksRequired) || postChecksRequired <= 0) throw new Error('candidate postChecksRequired must be a positive integer');
  if (!isObject(metricRequired) || !hasExactKeys(metricRequired, publicEvidenceSchema.METRIC_IDS)) {
    throw new Error(`candidate metrics must contain exactly: ${publicEvidenceSchema.METRIC_IDS.join(', ')}`);
  }
  const metrics = publicEvidenceSchema.METRIC_IDS.map(id => {
    const required = metricRequired[id];
    if (!Number.isInteger(required) || required <= 0) throw new Error(`candidate metric ${id} must be a positive integer`);
    return { id, complete: required, required };
  });
  return {
    runId,
    records: { passed: recordsRequired, required: recordsRequired },
    postChecks: { passed: postChecksRequired, required: postChecksRequired },
    metrics,
  };
}

function candidateFromClosedFile(filePath) {
  const payload = readJson(filePath, 'candidate threshold file');
  if (!hasExactKeys(payload, ['schemaVersion', 'kind', 'runId', 'recordsRequired', 'postChecksRequired', 'metrics'])) {
    throw new Error('candidate threshold file has undeclared or missing fields');
  }
  if (payload.schemaVersion !== CANDIDATE_SCHEMA_VERSION || payload.kind !== 'public-release-threshold-candidate') {
    throw new Error('candidate threshold file schema or kind is unsupported');
  }
  return candidateEntry(payload.runId, payload.recordsRequired, payload.postChecksRequired, payload.metrics);
}

function renderedEvidenceSource(repoRoot, preflight, explicitPath = '') {
  const candidatePath = explicitPath
    ? path.resolve(repoRoot, explicitPath)
    : path.join(repoRoot, 'output', 'preflight', 'history', preflight.runId, 'rendered-delivery-evidence', RENDERED_EVIDENCE_NAME);
  if (!fs.existsSync(candidatePath)) {
    if (explicitPath) throw new Error(`candidate rendered delivery evidence is missing: ${candidatePath}`);
    const fallback = maturityMatrix.resolveRenderedDeliveryEvidenceSource();
    if (!fallback || fallback.payload?.runId !== preflight.runId) {
      throw new Error('candidate rendered delivery evidence must belong to the same formal run');
    }
    return fallback;
  }
  const evidence = readJson(candidatePath, 'candidate rendered delivery evidence');
  if (evidence.runId !== preflight.runId) throw new Error('candidate rendered delivery evidence runId does not match the formal preflight');
  const countFamilies = records => {
    const counts = new Map();
    for (const record of Array.isArray(records) ? records : []) {
      const family = String(record?.family || '').trim();
      if (family) counts.set(family, (counts.get(family) || 0) + 1);
    }
    return Array.from(counts, ([family, complete]) => ({ family, complete }))
      .sort((left, right) => left.family.localeCompare(right.family));
  };
  return {
    payload: evidence,
    families: countFamilies(evidence.records),
    supplementalFamilies: countFamilies(evidence.supplementalRecords),
    attachmentIntegrity: evidence.attachmentIntegrity || null,
    filePath: candidatePath,
    sourcePath: relativePath(repoRoot, candidatePath),
    sourceHash: sha256File(candidatePath),
  };
}

function candidateFromCurrentOutput(repoRoot, options = {}) {
  let preflightPath = path.resolve(repoRoot, options.preflightFile || PREFLIGHT_FILE);
  let preflight = readJson(preflightPath, 'candidate formal preflight summary');
  if (!options.preflightFile
    && (preflight.quick !== false || preflight.forcePlatformAudit !== true || preflight.forceSlowChecks !== true)) {
    const tracked = readJson(path.join(repoRoot, ...PUBLIC_PREFLIGHT_FILE.split('/')), 'tracked public preflight status');
    preflightPath = resolveInsideRepo(repoRoot, String(tracked.sourcePath || ''), 'tracked formal preflight source');
    preflight = readJson(preflightPath, 'tracked formal preflight summary');
  }
  if (preflight.quick !== false || preflight.forcePlatformAudit !== true || preflight.forceSlowChecks !== true) {
    throw new Error('candidate preflight must be a formal run with both force flags; quick evidence cannot predict formal thresholds');
  }
  if (!/^\d{8}-\d{6}$/.test(String(preflight.runId || ''))
    || !Number.isInteger(preflight.recordsCount) || preflight.recordsCount <= 0
    || !Number.isInteger(preflight.postCheckCount) || preflight.postCheckCount <= 0) {
    throw new Error('candidate formal preflight does not expose valid runId, recordsCount, and postCheckCount');
  }
  const matrix = maturityMatrix.buildMatrix();
  const compactPreflight = maturityMatrix.buildHomepagePreflightStatus(
    preflight,
    preflightPath,
    relativePath(repoRoot, preflightPath),
  );
  const evidence = renderedEvidenceSource(repoRoot, preflight, options.renderedEvidenceFile || '');
  const readiness = maturityMatrix.buildHomepageReportReadinessStatus(
    matrix.payload,
    '0'.repeat(64),
    compactPreflight,
    preflight,
    evidence,
  );
  const metrics = Object.fromEntries(publicEvidenceSchema.METRIC_IDS.map(id => {
    const required = readiness?.[METRIC_REQUIRED_FIELDS[id]];
    if (!Number.isInteger(required) || required <= 0) throw new Error(`candidate output cannot derive positive ${id} threshold`);
    return [id, required];
  }));
  return {
    entry: candidateEntry(preflight.runId, preflight.recordsCount, preflight.postCheckCount, metrics),
    sources: {
      preflight: relativePath(repoRoot, preflightPath),
      renderedEvidence: evidence?.sourcePath || '',
    },
  };
}

function buildPreview(baseline, candidate, sources = {}) {
  if (!baseline || !candidate) throw new Error('baseline and candidate entries are required');
  if (candidate.runId < baseline.runId) throw new Error('candidate release cannot be older than the public baseline');
  const change = publicEvidenceSchema.classifyReleaseChange(baseline, candidate);
  return {
    schemaVersion: PREVIEW_SCHEMA_VERSION,
    kind: 'public-release-change-preview',
    baselineRunId: baseline.runId,
    candidateRunId: candidate.runId,
    classification: change.classification,
    increases: change.increases,
    reductions: change.reductions,
    authorizationRequired: change.reductions.length > 0,
    sources: {
      preflight: String(sources.preflight || ''),
      renderedEvidence: String(sources.renderedEvidence || ''),
    },
  };
}

function buildAuthorization(preview, reasonCode, reason) {
  if (!preview?.authorizationRequired || !Array.isArray(preview.reductions) || preview.reductions.length === 0) {
    throw new Error('authorization can only be written when the preview contains an actual reduction');
  }
  if (preview.candidateRunId <= preview.baselineRunId) throw new Error('authorization requires a new candidate release after the baseline');
  const authorization = {
    schemaVersion: publicEvidenceSchema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
    kind: publicEvidenceSchema.REDUCTION_AUTHORIZATION_KIND,
    active: true,
    previousRunId: preview.baselineRunId,
    reasonCode: String(reasonCode || ''),
    reason: String(reason || ''),
    reductions: preview.reductions,
  };
  const change = { reductions: preview.reductions };
  const validation = publicEvidenceSchema.validateReductionAuthorization(authorization, change, preview.baselineRunId);
  if (!validation.pass) throw new Error(`authorization is invalid: ${validation.errors.join(', ')}`);
  return authorization;
}

function writeJsonConfig(filePath, value) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw new Error(`authorization directory is missing: ${parent}`);
  if (fs.existsSync(filePath)) {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('authorization target must be a regular file');
  }
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
}

function requireRegularAuthorizationFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`current reduction authorization is missing: ${filePath}`);
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('authorization target must be a regular file');
}

function isInactiveAuthorization(value) {
  return hasExactKeys(value, ['schemaVersion', 'kind', 'active'])
    && value.schemaVersion === publicEvidenceSchema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION
    && value.kind === publicEvidenceSchema.REDUCTION_AUTHORIZATION_KIND
    && value.active === false;
}

function writeAuthorization(repoRoot, preview, reasonCode, reason, authorizationFile = AUTHORIZATION_FILE) {
  const target = resolveInsideRepo(repoRoot, authorizationFile, 'authorization file');
  const next = buildAuthorization(preview, reasonCode, reason);
  requireRegularAuthorizationFile(target);
  const current = readJson(target, 'current reduction authorization');
  if (current.active === true) {
    if (JSON.stringify(current) === JSON.stringify(next)) return { changed: false, target, authorization: current };
    throw new Error('a different active reduction authorization already exists; do not overwrite or combine approvals');
  }
  if (!isInactiveAuthorization(current)) {
    throw new Error('current inactive authorization config is malformed');
  }
  writeJsonConfig(target, next);
  return { changed: true, target, authorization: next };
}

function resetAuthorization(repoRoot, authorizationFile = AUTHORIZATION_FILE, afterReset = null) {
  const target = resolveInsideRepo(repoRoot, authorizationFile, 'authorization file');
  requireRegularAuthorizationFile(target);
  const current = readJson(target, 'current reduction authorization');
  if (current.active === false) {
    if (!isInactiveAuthorization(current)) throw new Error('current inactive authorization config is malformed');
    return { changed: false, target, authorization: current };
  }
  const bundle = statusBundle(repoRoot);
  const validation = publicEvidenceSchema.validatePublicEvidenceBundle(bundle);
  if (!validation.pass) throw new Error(`tracked public evidence is invalid: ${validation.errors.join(', ')}`);
  const entries = validation.releaseHistory.entries;
  const latest = entries.at(-1);
  const previous = entries.at(-2);
  const authorizationValidation = publicEvidenceSchema.validateReductionAuthorization(
    current,
    { reductions: latest?.change?.reductions || [] },
    previous?.runId || '',
  );
  const used = authorizationValidation.pass
    && previous
    && latest.change.reductions.length > 0
    && previous.runId === current.previousRunId
    && JSON.stringify(latest.change.reductions) === JSON.stringify(current.reductions)
    && latest.change.reasonCode === current.reasonCode
    && latest.change.reason === current.reason;
  if (!used) throw new Error('active authorization cannot be reset until the tracked public history proves the exact reduction was released');
  const inactive = {
    schemaVersion: publicEvidenceSchema.REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
    kind: publicEvidenceSchema.REDUCTION_AUTHORIZATION_KIND,
    active: false,
  };
  const previousContents = fs.readFileSync(target, 'utf8');
  writeJsonConfig(target, inactive);
  let resetReceipt = null;
  try {
    if (afterReset) resetReceipt = afterReset({ before: current, after: inactive, target });
  } catch (error) {
    fs.writeFileSync(target, previousContents, 'utf8');
    throw new Error(`authorization reset receipt failed; active authorization was restored: ${error.message}`);
  }
  return { changed: true, target, authorization: inactive, resetReceipt };
}

function parseArgs(argv) {
  const valueFlags = new Set(['--repo-root', '--candidate-file', '--candidate-preflight', '--candidate-evidence', '--authorization-file', '--reason-code', '--reason']);
  const booleanFlags = new Set(['--json', '--write-authorization', '--reset-authorization']);
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (booleanFlags.has(token)) {
      result[token.slice(2)] = true;
      continue;
    }
    if (valueFlags.has(token)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`);
      result[token.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${token}`);
  }
  if (result['write-authorization'] && result['reset-authorization']) throw new Error('write and reset actions are mutually exclusive');
  if (result['candidate-file'] && (result['candidate-preflight'] || result['candidate-evidence'])) {
    throw new Error('candidate file cannot be combined with candidate preflight or rendered evidence');
  }
  if (!result['write-authorization'] && (result['reason-code'] || result.reason)) {
    throw new Error('reason fields are only accepted with --write-authorization');
  }
  return result;
}

function humanPreview(preview, action = null) {
  const formatChanges = items => items.length
    ? items.map(item => `${item.id} ${item.from}→${item.to}`).join('、')
    : '無';
  const lines = [
    '公開發布門檻變化預覽',
    `基準 release：${preview.baselineRunId}`,
    `候選 release：${preview.candidateRunId}`,
    `分類：${preview.classification}`,
    `提升：${formatChanges(preview.increases)}`,
    `縮減：${formatChanges(preview.reductions)}`,
    `一次性授權：${preview.authorizationRequired ? '需要' : '不需要'}`,
  ];
  if (action) lines.push(`設定檔：${action.changed ? '已更新' : '無需變更'} (${action.target})`);
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args['repo-root'] || path.resolve(__dirname, '..', '..'));
  if (args['reset-authorization']) {
    const receiptModule = require('./public-release-decision-receipt.js');
    const authorizationFile = args['authorization-file'] || AUTHORIZATION_FILE;
    const prepared = receiptModule.prepareAuthorizationResetReceipt(repoRoot, authorizationFile);
    const action = resetAuthorization(
      repoRoot,
      authorizationFile,
      prepared ? () => receiptModule.writePreparedResetReceipt(repoRoot, prepared) : null,
    );
    const result = {
      schemaVersion: 1,
      kind: 'public-release-authorization-reset',
      changed: action.changed,
      target: relativePath(repoRoot, action.target),
      resetReceiptId: action.resetReceipt?.receipt?.receiptId || '',
      resetReceiptFile: action.resetReceipt ? relativePath(repoRoot, action.resetReceipt.target) : '',
    };
    console.log(args.json ? JSON.stringify(result, null, 2) : `一次性縮減授權：${action.changed ? '已安全重設為 inactive' : '原已是 inactive'}\n設定檔：${action.target}`);
    return;
  }
  const baseline = baselineHistoryEntry(repoRoot);
  let candidate;
  let sources = {};
  if (args['candidate-file']) {
    const candidatePath = path.resolve(repoRoot, args['candidate-file']);
    candidate = candidateFromClosedFile(candidatePath);
    sources = { preflight: relativePath(repoRoot, candidatePath), renderedEvidence: '' };
  } else {
    const current = candidateFromCurrentOutput(repoRoot, {
      preflightFile: args['candidate-preflight'],
      renderedEvidenceFile: args['candidate-evidence'] || '',
    });
    candidate = current.entry;
    sources = current.sources;
  }
  const preview = buildPreview(baseline, candidate, sources);
  let action = null;
  if (args['write-authorization']) {
    action = writeAuthorization(
      repoRoot,
      preview,
      args['reason-code'],
      args.reason,
      args['authorization-file'] || AUTHORIZATION_FILE,
    );
  }
  const output = action
    ? { ...preview, authorizationWritten: true, authorizationChanged: action.changed, authorizationFile: relativePath(repoRoot, action.target) }
    : preview;
  console.log(args.json ? JSON.stringify(output, null, 2) : humanPreview(preview, action));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Public release change assistant blocked: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  AUTHORIZATION_FILE,
  CANDIDATE_SCHEMA_VERSION,
  PREVIEW_SCHEMA_VERSION,
  METRIC_REQUIRED_FIELDS,
  baselineHistoryEntry,
  candidateEntry,
  candidateFromClosedFile,
  candidateFromCurrentOutput,
  buildPreview,
  buildAuthorization,
  writeAuthorization,
  resetAuthorization,
  parseArgs,
};
