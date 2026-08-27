#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Adapter = require('./joint-reaction-load-adapter.js');

const EVIDENCE_SCHEMA = 'rc-joint-reaction-anonymization-evidence.v1';
const REVIEW_SCHEMA = 'rc-joint-reaction-observed-review.v1';
const MANIFEST_SCHEMA = 'rc-joint-reaction-observed-fixtures.v1';
const PROVENANCE_SCHEMA = 'rc-joint-reaction-observed-provenance.v1';
const LOCK_SCHEMA = 'rc-joint-reaction-observed-promotion-lock.v2';
const LOCK_ASSESSMENT_SCHEMA = 'rc-joint-reaction-observed-promotion-lock-assessment.v1';
const LOCK_CLEAR_SCHEMA = 'rc-joint-reaction-observed-promotion-lock-clear.v1';
const DEFAULT_STALE_LOCK_MINUTES = 10;
const ASSERTION_KEYS = Object.freeze([
  'noProjectIdentity',
  'headersReviewed',
  'softwareVersionConfirmed',
  'tableNameConfirmed',
  'unitsConfirmed',
  'compatibilityReplayPassed',
  'nonEngineeringUseAcknowledged',
  'originalSourceExcluded',
]);

function required(value, label) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) throw new Error(`${label}不得空白。`);
  return normalized;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function inspectPath(filePath) {
  try { return { exists:true, stat:fs.lstatSync(filePath) }; }
  catch (error) {
    if (error && error.code === 'ENOENT') return { exists:false, stat:null };
    throw error;
  }
}

function governedPathError(code, message) {
  const error = new Error(message);
  error.issueCode = code;
  return error;
}

function comparablePath(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function resolveGovernedManifestPath(value) {
  const manifestPath = path.resolve(required(value, 'observed 清冊路徑'));
  const manifestDir = path.dirname(manifestPath);
  const directoryState = inspectPath(manifestDir);
  if (!directoryState.exists) throw governedPathError('manifest-parent-missing', `observed 清冊父目錄不存在：${manifestDir}`);
  if (directoryState.stat.isSymbolicLink()) throw governedPathError('manifest-parent-link', `observed 清冊父目錄不得是符號連結或 junction：${manifestDir}`);
  if (!directoryState.stat.isDirectory()) throw governedPathError('manifest-parent-not-directory', `observed 清冊父路徑必須是目錄：${manifestDir}`);
  const canonicalDirectory = fs.realpathSync.native(manifestDir);
  if (comparablePath(canonicalDirectory) !== comparablePath(manifestDir)) {
    throw governedPathError('manifest-parent-not-canonical', `observed 清冊父路徑不得經過符號連結或 junction：${manifestDir}`);
  }
  const manifestState = inspectPath(manifestPath);
  if (!manifestState.exists) throw governedPathError('manifest-missing', `observed 清冊不存在：${manifestPath}`);
  if (manifestState.stat.isSymbolicLink()) throw governedPathError('manifest-is-symbolic-link', `observed 清冊不得是符號連結：${manifestPath}`);
  if (!manifestState.stat.isFile()) throw governedPathError('manifest-is-not-regular-file', `observed 清冊必須是一般檔案：${manifestPath}`);
  const canonicalManifest = fs.realpathSync.native(manifestPath);
  if (comparablePath(canonicalManifest) !== comparablePath(manifestPath)) {
    throw governedPathError('manifest-not-canonical', `observed 清冊路徑不得經過符號連結或 junction：${manifestPath}`);
  }
  return manifestPath;
}

function readRegularText(filePath, label) {
  const state = inspectPath(filePath);
  if (!state.exists) throw new Error(`${label}不存在：${filePath}`);
  if (state.stat.isSymbolicLink()) throw new Error(`${label}不得是符號連結：${filePath}`);
  if (!state.stat.isFile()) throw new Error(`${label}必須是一般檔案：${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function readJsonDocument(filePath, label) {
  const text = readRegularText(filePath, label);
  try { return { text, value:JSON.parse(text) }; }
  catch (error) { throw new Error(`${label}無法讀取：${error.message}`); }
}

function ensureAbsentOutput(filePath, label) {
  const state = inspectPath(filePath);
  if (!state.exists) return;
  if (state.stat.isSymbolicLink()) throw new Error(`${label}不得是符號連結：${filePath}`);
  if (!state.stat.isFile()) throw new Error(`${label}不是可安全建立的一般檔案目標：${filePath}`);
  throw new Error(`${label}已存在，拒絕覆寫：${filePath}`);
}

function writeExclusiveVerified(filePath, content, label) {
  const expected = String(content);
  ensureAbsentOutput(filePath, label);
  let created = false;
  try {
    const descriptor = fs.openSync(filePath, 'wx');
    created = true;
    try {
      fs.writeFileSync(descriptor, expected, 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    if (readRegularText(filePath, label) !== expected) throw new Error(`${label}寫入後驗證失敗：${filePath}`);
  } catch (error) {
    let rollbackIssue = '';
    if (created) {
      try {
        if (readRegularText(filePath, label) === expected) fs.unlinkSync(filePath);
        else rollbackIssue = `；${label}回滾未完成：${filePath}`;
      } catch (_rollbackError) {
        rollbackIssue = `；${label}回滾未完成：${filePath}`;
      }
    }
    const wrapped = new Error(`${error.message}${rollbackIssue}`);
    wrapped.code = error && error.code;
    throw wrapped;
  }
}

function removeExactFile(filePath, content, label, issues) {
  try {
    const state = inspectPath(filePath);
    if (!state.exists) return true;
    if (state.stat.isSymbolicLink() || !state.stat.isFile() || fs.readFileSync(filePath, 'utf8') !== String(content)) {
      issues.push(`${label}內容或型態已改變：${filePath}`);
      return false;
    }
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    issues.push(`${label}無法移除：${filePath}（${error.message}）`);
    return false;
  }
}

function promotionClearResidues(manifestPath) {
  const directory = path.dirname(manifestPath);
  const prefix = `${path.basename(manifestPath)}.promotion-clear-`;
  return fs.readdirSync(directory).filter(name => name.startsWith(prefix)).sort();
}

function acquirePromotionLock(state) {
  const manifestPath = resolveGovernedManifestPath(state.manifestPath);
  const lockPath = `${manifestPath}.promotion.lock`;
  const recoveryResidues = promotionClearResidues(manifestPath);
  if (recoveryResidues.length > 0) {
    throw new Error(`observed 清冊仍有 lock recovery 殘留，拒絕開始新升級：${recoveryResidues.join('、')}`);
  }
  const transactionId = crypto.randomBytes(16).toString('hex');
  const extension = path.extname(state.candidatePath).toLowerCase();
  const content = `${JSON.stringify({
    schemaVersion:LOCK_SCHEMA,
    transactionId,
    fixtureId:state.fixtureId,
    candidateSha256:state.candidateSha256,
    fixtureFile:`observed/${state.fixtureId}${extension}`,
    provenanceFile:`observed/${state.fixtureId}.provenance.json`,
    manifestSha256:sha256(Buffer.from(state.manifestText, 'utf8')),
    pid:process.pid,
    hostname:os.hostname(),
    acquiredAt:new Date().toISOString(),
  }, null, 2)}\n`;
  try { writeExclusiveVerified(lockPath, content, 'observed 清冊升級鎖'); }
  catch (error) {
    if (error && (error.code === 'EEXIST' || /已存在/.test(error.message))) {
      throw new Error(`observed 清冊升級鎖已存在，請先確認沒有其他升級程序或中斷殘留：${lockPath}`);
    }
    throw error;
  }
  return { lockPath, content, transactionId };
}

function releasePromotionLock(lock) {
  const issues = [];
  const state = inspectPath(lock.lockPath);
  if (!state.exists) {
    issues.push(`observed 清冊升級鎖已在交易完成前消失：${lock.lockPath}`);
    return issues;
  }
  removeExactFile(lock.lockPath, lock.content, 'observed 清冊升級鎖', issues);
  return issues;
}

function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'invalid';
  try {
    process.kill(pid, 0);
    return 'active';
  } catch (error) {
    if (error && error.code === 'ESRCH') return 'inactive';
    if (error && error.code === 'EPERM') return 'active';
    return 'unknown';
  }
}

function safeObservedRelativePath(value, fixtureId, kind) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) return '';
  if (kind === 'fixture') {
    return new RegExp(`^observed/${fixtureId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(?:csv|tsv|txt)$`).test(normalized) ? normalized : '';
  }
  return normalized === `observed/${fixtureId}.provenance.json` ? normalized : '';
}

function artifactState(filePath, expectedSha256) {
  const state = inspectPath(filePath);
  if (!state.exists) return { state:'absent', sha256:'' };
  if (state.stat.isSymbolicLink()) return { state:'symlink', sha256:'' };
  if (!state.stat.isFile()) return { state:'non-file', sha256:'' };
  const digest = sha256(Buffer.from(fs.readFileSync(filePath)));
  return { state:digest === expectedSha256 ? 'verified' : 'hash-mismatch', sha256:digest };
}

function assessPromotionLock(options) {
  const cfg = options && typeof options === 'object' ? options : {};
  const manifestPath = path.resolve(required(cfg.manifestPath, 'observed 清冊路徑'));
  const lockPath = `${manifestPath}.promotion.lock`;
  const base = {
    schemaVersion:LOCK_ASSESSMENT_SCHEMA,
    manifestFile:path.basename(manifestPath),
    lockFile:path.basename(lockPath),
    lockExists:false,
    safeToClear:false,
    minimumAgeMinutes:DEFAULT_STALE_LOCK_MINUTES,
    recoveryResidueCount:0,
    recoveryResidues:[],
    issues:[],
  };
  try { resolveGovernedManifestPath(manifestPath); }
  catch (error) {
    base.issues.push(error?.issueCode || 'manifest-path-invalid');
    return { ...base, status:'invalid-manifest-target', transactionState:'unverified', processState:'not-assessed' };
  }
  let manifestDocument = null;
  try { manifestDocument = readJsonDocument(manifestPath, 'observed 清冊'); }
  catch (_error) {
    base.issues.push('manifest-unreadable');
    return { ...base, status:'invalid-manifest', transactionState:'unverified', processState:'not-assessed' };
  }
  if (manifestDocument.value.schemaVersion !== MANIFEST_SCHEMA
      || manifestDocument.value.fixturePolicy !== 'anonymized-observed-exports-only'
      || !Array.isArray(manifestDocument.value.fixtures)) {
    base.issues.push('manifest-schema-invalid');
    return { ...base, status:'invalid-manifest', transactionState:'unverified', processState:'not-assessed' };
  }
  const recoveryResidues = promotionClearResidues(manifestPath);
  base.recoveryResidueCount = recoveryResidues.length;
  base.recoveryResidues = recoveryResidues;
  const lockTarget = inspectPath(lockPath);
  base.lockExists = lockTarget.exists;
  if (!lockTarget.exists) {
    if (recoveryResidues.length > 0) {
      return { ...base, status:'recovery-residue', transactionState:'recovery-incomplete', processState:'not-assessed' };
    }
    return { ...base, status:'absent', transactionState:'none', processState:'not-assessed' };
  }
  if (lockTarget.stat.isSymbolicLink() || !lockTarget.stat.isFile()) {
    base.issues.push(lockTarget.stat.isSymbolicLink() ? 'lock-is-symbolic-link' : 'lock-is-not-regular-file');
    return { ...base, status:'invalid-lock-target', transactionState:'unverified', processState:'not-assessed' };
  }

  const lockText = fs.readFileSync(lockPath, 'utf8');
  const lockSha256 = sha256(Buffer.from(lockText, 'utf8'));
  let lockData = null;
  try { lockData = JSON.parse(lockText); }
  catch (_error) { base.issues.push('lock-json-invalid'); }
  const result = { ...base, lockSha256, transactionState:'unverified', processState:'not-assessed' };
  if (!lockData || lockData.schemaVersion !== LOCK_SCHEMA) result.issues.push('lock-schema-invalid-or-legacy');
  const fixtureId = String(lockData?.fixtureId || '');
  const transactionId = String(lockData?.transactionId || '');
  const candidateSha256 = String(lockData?.candidateSha256 || '').toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fixtureId)) result.issues.push('lock-fixture-id-invalid');
  if (!/^[a-f0-9]{32}$/.test(transactionId)) result.issues.push('lock-transaction-id-invalid');
  if (!/^[a-f0-9]{64}$/.test(candidateSha256)) result.issues.push('lock-candidate-sha256-invalid');
  if (!/^[a-f0-9]{64}$/.test(String(lockData?.manifestSha256 || '').toLowerCase())) result.issues.push('lock-manifest-sha256-invalid');
  const fixtureFile = safeObservedRelativePath(lockData?.fixtureFile, fixtureId, 'fixture');
  const provenanceFile = safeObservedRelativePath(lockData?.provenanceFile, fixtureId, 'provenance');
  if (!fixtureFile) result.issues.push('lock-fixture-file-invalid');
  if (!provenanceFile) result.issues.push('lock-provenance-file-invalid');
  const acquiredAt = Date.parse(lockData?.acquiredAt);
  if (!Number.isFinite(acquiredAt) || acquiredAt > Date.now() + 60000) result.issues.push('lock-time-invalid');
  const ageMinutes = Number.isFinite(acquiredAt) ? Math.max(0, (Date.now() - acquiredAt) / 60000) : null;
  const hostMatches = String(lockData?.hostname || '') === os.hostname();
  if (!String(lockData?.hostname || '')) result.issues.push('lock-hostname-missing');
  const observedProcessState = hostMatches ? processState(lockData?.pid) : 'foreign-host';
  result.fixtureId = fixtureId;
  result.transactionId = transactionId;
  result.ageMinutes = ageMinutes == null ? null : Number(ageMinutes.toFixed(2));
  result.hostMatches = hostMatches;
  result.processState = observedProcessState;

  if (result.issues.length > 0) return { ...result, status:'invalid-lock' };

  const manifestEntry = manifestDocument.value.fixtures.find(item => item.id === fixtureId) || null;
  const fixturePath = fixtureFile ? path.join(path.dirname(manifestPath), ...fixtureFile.split('/')) : '';
  const provenancePath = provenanceFile ? path.join(path.dirname(manifestPath), ...provenanceFile.split('/')) : '';
  const fixtureArtifact = artifactState(fixturePath, candidateSha256);
  let provenanceArtifact = artifactState(provenancePath, '');
  if (provenanceArtifact.state === 'hash-mismatch') provenanceArtifact.state = 'regular';
  const nextPath = path.join(path.dirname(manifestPath), `.${path.basename(manifestPath)}.${fixtureId}.${transactionId}.promotion-next`);
  const backupPath = path.join(path.dirname(manifestPath), `.${path.basename(manifestPath)}.${fixtureId}.${transactionId}.promotion-backup`);
  const nextState = inspectPath(nextPath);
  const backupState = inspectPath(backupPath);
  result.manifestEntryPresent = Boolean(manifestEntry);
  result.fixtureState = fixtureArtifact.state;
  result.provenanceState = provenanceArtifact.state;
  result.nextResiduePresent = nextState.exists;
  result.backupResiduePresent = backupState.exists;

  let committed = false;
  if (manifestEntry && fixtureArtifact.state === 'verified' && provenanceArtifact.state === 'regular'
      && !nextState.exists && !backupState.exists) {
    try {
      const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
      committed = manifestEntry.file === fixtureFile
        && manifestEntry.provenanceFile === provenanceFile
        && manifestEntry.sha256 === candidateSha256
        && manifestEntry.provenance === 'anonymized-observed-export'
        && manifestEntry.software === provenance.software
        && manifestEntry.softwareVersion === provenance.softwareVersion
        && manifestEntry.tableName === provenance.tableName
        && manifestEntry.units === provenance.units
        && manifestEntry.format === provenance.output?.delimiter
        && manifestEntry.headerLine === provenance.output?.headerLine
        && manifestEntry.rowCount === provenance.output?.rowCount
        && provenance.schemaVersion === PROVENANCE_SCHEMA
        && provenance.fixtureId === fixtureId
        && provenance.output?.file === fixtureFile
        && provenance.output?.sha256 === candidateSha256
        && provenance.privacy?.sourceHashCommitted === false;
    } catch (_error) { committed = false; }
  }
  const abandoned = !manifestEntry && fixtureArtifact.state === 'absent' && provenanceArtifact.state === 'absent'
    && !nextState.exists && !backupState.exists;
  result.transactionState = committed ? 'committed-lock-residue' : (abandoned ? 'abandoned-lock-only' : 'partial-or-inconsistent');

  if (!hostMatches) return { ...result, status:'foreign-host-unverified' };
  if (observedProcessState === 'active') return { ...result, status:'active' };
  if (observedProcessState !== 'inactive') return { ...result, status:'process-unverified' };
  if (ageMinutes < DEFAULT_STALE_LOCK_MINUTES) return { ...result, status:'recent-inactive' };
  if (!committed && !abandoned) return { ...result, status:'partial-transaction' };
  return { ...result, status:'stale-safe-to-clear', safeToClear:true };
}

function clearStalePromotionLock(options) {
  const cfg = options && typeof options === 'object' ? options : {};
  if (String(cfg.confirm || '').toLowerCase() !== 'yes') throw new Error('清除殘留升級鎖只接受明確確認 yes。');
  const expectedLockSha256 = required(cfg.expectedLockSha256, '預期 lock SHA-256').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedLockSha256)) throw new Error('預期 lock SHA-256 格式不正確。');
  const assessment = assessPromotionLock(cfg);
  if (!assessment.safeToClear) throw new Error(`升級鎖不可安全清除：${assessment.status}。`);
  if (assessment.lockSha256 !== expectedLockSha256) throw new Error('升級鎖 SHA-256 已改變，拒絕清除。');
  const manifestPath = path.resolve(required(cfg.manifestPath, 'observed 清冊路徑'));
  const lockPath = `${manifestPath}.promotion.lock`;
  const quarantinePath = `${manifestPath}.promotion-clear-${expectedLockSha256.slice(0, 16)}`;
  ensureAbsentOutput(quarantinePath, '升級鎖清除暫存檔');
  fs.renameSync(lockPath, quarantinePath);
  try {
    const quarantinedText = readRegularText(quarantinePath, '升級鎖清除暫存檔');
    if (sha256(Buffer.from(quarantinedText, 'utf8')) !== expectedLockSha256) {
      throw new Error('隔離後的升級鎖 SHA-256 不一致。');
    }
    fs.unlinkSync(quarantinePath);
    if (inspectPath(quarantinePath).exists) throw new Error('升級鎖清除暫存檔仍存在。');
  } catch (error) {
    try {
      if (!inspectPath(lockPath).exists && inspectPath(quarantinePath).exists) fs.renameSync(quarantinePath, lockPath);
    } catch (restoreError) {
      throw new Error(`${error.message}；升級鎖還原失敗：${restoreError.message}`);
    }
    throw error;
  }
  return {
    schemaVersion:LOCK_CLEAR_SCHEMA,
    status:'cleared',
    previousStatus:assessment.status,
    transactionState:assessment.transactionState,
    fixtureId:assessment.fixtureId,
    lockSha256:expectedLockSha256,
    newPromotionLockPresent:inspectPath(lockPath).exists,
  };
}

function issue(issues, code, message) {
  issues.push({ code, message });
}

function expectedSynthetic(key, rowIndex) {
  const factor = rowIndex + 1;
  return { F1:factor * 1.25, F2:factor * -2.5, F3:100 + factor * 10, M1:factor * 3.5, M2:factor * -4.5, M3:factor * 5.5 }[key];
}

function validateCandidateStructure(candidate, parsed, evidence, issues) {
  const format = parsed.delimiter === '\t' ? 'tab' : (parsed.delimiter === ';' ? 'semicolon' : 'comma');
  if (parsed.headerLine !== evidence.output?.headerLine) issue(issues, 'header-line-mismatch', '候選檔表頭行號與匿名化證據不一致。');
  if (format !== evidence.output?.delimiter) issue(issues, 'delimiter-mismatch', '候選檔分隔格式與匿名化證據不一致。');
  if (parsed.rowCount !== evidence.output?.rowCount) issue(issues, 'row-count-mismatch', '候選檔資料列數與匿名化證據不一致。');

  const lines = candidate.replace(/\r\n?/g, '\n').split('\n');
  const preamble = lines.slice(0, parsed.headerLine - 1).filter(line => line.trim());
  if (preamble.some(line => !/^FIXTURE PREAMBLE \d+: \[REDACTED\]$/.test(line.trim()))) {
    issue(issues, 'preamble-not-redacted', '候選檔仍有未依規則清除的前置說明。');
  }
  if (/[A-Za-z]:[\\/]|\\\\[^\s]+\\|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(candidate)) {
    issue(issues, 'path-or-email-detected', '候選檔疑似仍含本機路徑、UNC 路徑或電子郵件。');
  }

  const tokenPatterns = {
    point:/^JOINT_\d{3}$/,
    story:/^(?:|STORY_\d{3})$/,
    uniqueName:/^(?:|UNIQUE_\d{3})$/,
    outputCase:/^CASE_\d{3}$/,
    caseType:/^(?:|Linear Static|Other Case Type|Combination)$/,
    stepType:/^(?:|STEP)$/,
    stepNum:/^(?:|STEP_\d{3})$/,
  };
  parsed.rows.forEach((row, rowIndex) => {
    Object.entries(tokenPatterns).forEach(([key, pattern]) => {
      if (!pattern.test(String(row[key] || ''))) issue(issues, 'identifier-not-tokenized', `第 ${row.sourceLine} 列 ${key} 未完成固定 token 匿名化。`);
    });
    ['F1', 'F2', 'F3', 'M1', 'M2', 'M3'].forEach(key => {
      if (row[key] !== expectedSynthetic(key, rowIndex)) issue(issues, 'numeric-not-synthetic', `第 ${row.sourceLine} 列 ${key} 不是匿名器的固定合成值。`);
    });
  });
}

function loadAssessment(options) {
  const cfg = options && typeof options === 'object' ? options : {};
  const candidatePath = path.resolve(required(cfg.candidatePath, '候選檔路徑'));
  const evidencePath = path.resolve(required(cfg.evidencePath, '匿名化證據路徑'));
  const reviewPath = path.resolve(required(cfg.reviewPath, '人工審閱聲明路徑'));
  const manifestPath = resolveGovernedManifestPath(cfg.manifestPath);
  const fixtureId = required(cfg.fixtureId, 'fixture ID');
  const issues = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fixtureId)) issue(issues, 'invalid-fixture-id', 'fixture ID 只允許小寫英數與單一連字號分段。');

  const candidate = readRegularText(candidatePath, '候選檔');
  const evidence = readJsonDocument(evidencePath, '匿名化證據').value;
  const review = readJsonDocument(reviewPath, '人工審閱聲明').value;
  const manifestDocument = readJsonDocument(manifestPath, 'observed 清冊');
  const manifest = manifestDocument.value;
  const candidateSha256 = sha256(Buffer.from(candidate, 'utf8'));
  let parsed = null;
  try { parsed = Adapter.parseTable(candidate); }
  catch (error) { issue(issues, 'candidate-parse-failed', `匿名候選檔無法由轉接器重播：${error.message}`); }

  if (evidence.schemaVersion !== EVIDENCE_SCHEMA) issue(issues, 'evidence-schema', '匿名化證據 schema 不支援。');
  if (evidence.status !== 'candidate-manual-review-required') issue(issues, 'evidence-status', '匿名化證據不是待人工審閱候選狀態。');
  if (evidence.provenance !== 'anonymized-observed-export-candidate') issue(issues, 'evidence-provenance', '匿名化證據來源分類不正確。');
  if (evidence.originKind !== 'actual-observed') issue(issues, 'origin-not-observed', '只有 actual-observed 實際匯出候選可升級為匿名觀察樣本。');
  if (evidence.notEngineeringData !== true || evidence.source?.stored !== false) issue(issues, 'source-boundary', '候選證據必須聲明非工程資料且不保存來源檔。');
  if (path.basename(candidatePath) !== evidence.output?.file) issue(issues, 'candidate-file-mismatch', '候選檔名與匿名化證據不一致。');
  if (candidateSha256 !== evidence.output?.sha256) issue(issues, 'candidate-hash-mismatch', '候選檔 SHA-256 與匿名化證據不一致。');
  const requiredTransforms = [
    'preambleContentRedacted', 'identifiersTokenized', 'numericResultsReplacedWithSyntheticValues',
    'caseTypeReducedToClassification', 'unknownDataCellsRedacted', 'originalHeaderTextPreserved',
  ];
  requiredTransforms.forEach(key => {
    if (evidence.transform?.[key] !== true) issue(issues, 'transform-incomplete', `匿名化證據缺少 ${key}=true。`);
  });
  ['software', 'softwareVersion', 'tableName', 'units', 'extension'].forEach(key => {
    if (!String(evidence.source?.[key] || '').trim()) issue(issues, 'source-metadata-missing', `匿名化證據缺少來源 ${key}。`);
  });
  if (path.extname(candidatePath).toLowerCase() !== String(evidence.source?.extension || '').toLowerCase()) {
    issue(issues, 'extension-mismatch', '候選檔副檔名與匿名化證據不一致。');
  }
  if (parsed) validateCandidateStructure(candidate, parsed, evidence, issues);

  if (review.schemaVersion !== REVIEW_SCHEMA) issue(issues, 'review-schema', '人工審閱聲明 schema 不支援。');
  if (review.fixtureId !== fixtureId) issue(issues, 'review-fixture-id', '人工審閱聲明的 fixture ID 不一致。');
  if (review.candidateSha256 !== candidateSha256) issue(issues, 'review-hash-mismatch', '人工審閱聲明未綁定目前候選檔 SHA-256。');
  const reviewer = String(review.reviewer || '').trim();
  if (!reviewer || /^replace-with-/i.test(reviewer)) issue(issues, 'reviewer-missing', '人工審閱聲明缺少有效 reviewer 或審閱角色。');
  const reviewedAt = Date.parse(review.reviewedAt);
  const generatedAt = Date.parse(evidence.generatedAt);
  if (!Number.isFinite(reviewedAt)) issue(issues, 'review-time-invalid', '人工審閱時間無效。');
  if (!Number.isFinite(generatedAt)) issue(issues, 'evidence-time-invalid', '匿名化證據產出時間無效。');
  if (Number.isFinite(reviewedAt) && Number.isFinite(generatedAt) && reviewedAt < generatedAt) issue(issues, 'review-before-sanitize', '人工審閱時間不得早於匿名化時間。');
  ASSERTION_KEYS.forEach(key => {
    if (review.assertions?.[key] !== true) issue(issues, 'review-assertion-incomplete', `人工審閱尚未確認 ${key}。`);
  });

  if (manifest.schemaVersion !== MANIFEST_SCHEMA || manifest.fixturePolicy !== 'anonymized-observed-exports-only' || !Array.isArray(manifest.fixtures)) {
    issue(issues, 'manifest-schema', 'observed 清冊 schema 或來源政策不正確。');
  } else if (manifest.fixtures.some(item => item.id === fixtureId)) {
    issue(issues, 'duplicate-fixture-id', `observed 清冊已有 fixture ID：${fixtureId}。`);
  }

  return {
    ready:issues.length === 0,
    issues,
    candidatePath,
    candidate,
    candidateSha256,
    evidencePath,
    evidence,
    reviewPath,
    review,
    manifestPath,
    manifestText:manifestDocument.text,
    manifest,
    fixtureId,
    parsed,
  };
}

function publicAssessment(state) {
  return {
    schemaVersion:'rc-joint-reaction-observed-promotion-assessment.v1',
    fixtureId:state.fixtureId,
    ready:state.ready,
    issueCount:state.issues.length,
    issues:state.issues,
    candidateSha256:state.candidateSha256,
    software:String(state.evidence.source?.software || ''),
    softwareVersion:String(state.evidence.source?.softwareVersion || ''),
    sourceFileStored:false,
    sourceHashWillBeCommitted:false,
  };
}

function assessPromotion(options) {
  return publicAssessment(loadAssessment(options));
}

function promoteCandidate(options) {
  const preliminary = loadAssessment(options);
  if (!preliminary.ready) throw new Error(`匿名觀察樣本不可升級：${preliminary.issues.map(item => item.message).join('；')}`);
  const lock = acquirePromotionLock(preliminary);
  let result = null;
  let operationError = null;
  try {
    const state = loadAssessment(options);
    if (!state.ready) throw new Error(`匿名觀察樣本不可升級：${state.issues.map(item => item.message).join('；')}`);
    const manifestDir = path.dirname(state.manifestPath);
    const observedDir = path.resolve(manifestDir, 'observed');
    if (!observedDir.startsWith(`${path.resolve(manifestDir)}${path.sep}`)) throw new Error('observed 輸出目錄超出清冊範圍。');
    const observedState = inspectPath(observedDir);
    if (observedState.exists && observedState.stat.isSymbolicLink()) throw new Error(`observed 輸出目錄不得是符號連結：${observedDir}`);
    if (observedState.exists && !observedState.stat.isDirectory()) throw new Error(`observed 輸出目標必須是目錄：${observedDir}`);

    const extension = path.extname(state.candidatePath).toLowerCase();
    const fixtureFile = `${state.fixtureId}${extension}`;
    const provenanceFile = `${state.fixtureId}.provenance.json`;
    const fixturePath = path.join(observedDir, fixtureFile);
    const provenancePath = path.join(observedDir, provenanceFile);
    if (observedState.exists) {
      ensureAbsentOutput(fixturePath, 'observed fixture 目標');
      ensureAbsentOutput(provenancePath, 'observed provenance 目標');
    }

    const provenance = {
      schemaVersion:PROVENANCE_SCHEMA,
      fixtureId:state.fixtureId,
      provenance:'anonymized-observed-export',
      notEngineeringData:true,
      software:state.evidence.source.software,
      softwareVersion:state.evidence.source.softwareVersion,
      tableName:state.evidence.source.tableName,
      units:state.evidence.source.units,
      sanitizedAt:state.evidence.generatedAt,
      review:{ reviewedAt:state.review.reviewedAt, reviewer:state.review.reviewer, assertions:{ ...state.review.assertions } },
      output:{
        file:`observed/${fixtureFile}`,
        sha256:state.candidateSha256,
        headerLine:state.parsed.headerLine,
        delimiter:state.evidence.output.delimiter,
        rowCount:state.parsed.rowCount,
      },
      privacy:{ sourceFileStored:false, sourcePathStored:false, sourceNameStored:false, sourceHashCommitted:false, originalNumbersStored:false },
    };
    const entry = {
      id:state.fixtureId,
      provenance:'anonymized-observed-export',
      software:provenance.software,
      softwareVersion:provenance.softwareVersion,
      tableName:provenance.tableName,
      units:provenance.units,
      file:provenance.output.file,
      provenanceFile:`observed/${provenanceFile}`,
      format:provenance.output.delimiter,
      headerLine:provenance.output.headerLine,
      rowCount:provenance.output.rowCount,
      sha256:provenance.output.sha256,
    };
    const nextManifest = { ...state.manifest, fixtures:[...state.manifest.fixtures, entry].sort((a, b) => a.id.localeCompare(b.id)) };
    const provenanceText = `${JSON.stringify(provenance, null, 2)}\n`;
    const nextManifestText = `${JSON.stringify(nextManifest, null, 2)}\n`;
    const nonce = lock.transactionId;
    const nextPath = path.join(manifestDir, `.${path.basename(state.manifestPath)}.${state.fixtureId}.${nonce}.promotion-next`);
    const backupPath = path.join(manifestDir, `.${path.basename(state.manifestPath)}.${state.fixtureId}.${nonce}.promotion-backup`);
    ensureAbsentOutput(nextPath, 'observed 清冊 next 暫存檔');
    ensureAbsentOutput(backupPath, 'observed 清冊 backup 暫存檔');

    let observedDirCreated = false;
    let fixtureWritten = false;
    let provenanceWritten = false;
    let nextWritten = false;
    let backupWritten = false;
    let manifestReplaced = false;
    try {
      if (!observedState.exists) {
        fs.mkdirSync(observedDir);
        observedDirCreated = true;
        const createdState = inspectPath(observedDir);
        if (!createdState.exists || createdState.stat.isSymbolicLink() || !createdState.stat.isDirectory()) {
          throw new Error(`observed 輸出目錄建立後驗證失敗：${observedDir}`);
        }
      }
      ensureAbsentOutput(fixturePath, 'observed fixture 目標');
      ensureAbsentOutput(provenancePath, 'observed provenance 目標');
      writeExclusiveVerified(backupPath, state.manifestText, 'observed 清冊 backup 暫存檔');
      backupWritten = true;
      writeExclusiveVerified(nextPath, nextManifestText, 'observed 清冊 next 暫存檔');
      nextWritten = true;
      writeExclusiveVerified(fixturePath, state.candidate, 'observed fixture');
      fixtureWritten = true;
      writeExclusiveVerified(provenancePath, provenanceText, 'observed provenance');
      provenanceWritten = true;

      if (readRegularText(lock.lockPath, 'observed 清冊升級鎖') !== lock.content) {
        throw new Error('observed 清冊升級鎖在升級期間已變更，拒絕提交。');
      }
      if (readRegularText(state.manifestPath, 'observed 清冊') !== state.manifestText) {
        throw new Error('observed 清冊在升級期間已變更，拒絕覆寫競爭異動。');
      }
      fs.renameSync(nextPath, state.manifestPath);
      nextWritten = false;
      manifestReplaced = true;
      if (readRegularText(state.manifestPath, 'observed 清冊') !== nextManifestText) {
        throw new Error('observed 清冊替換後驗證失敗。');
      }
      if (readRegularText(fixturePath, 'observed fixture') !== state.candidate
          || readRegularText(provenancePath, 'observed provenance') !== provenanceText) {
        throw new Error('observed fixture 或 provenance 寫入後驗證失敗。');
      }
      const cleanupIssues = [];
      if (!removeExactFile(backupPath, state.manifestText, 'observed 清冊 backup 暫存檔', cleanupIssues)) {
        throw new Error(cleanupIssues.join('；'));
      }
      backupWritten = false;
    } catch (error) {
      const rollbackIssues = [];
      if (manifestReplaced) {
        try {
          const currentManifest = readRegularText(state.manifestPath, 'observed 清冊');
          if (currentManifest === nextManifestText && backupWritten
              && readRegularText(backupPath, 'observed 清冊 backup 暫存檔') === state.manifestText) {
            fs.renameSync(backupPath, state.manifestPath);
            backupWritten = false;
            if (readRegularText(state.manifestPath, 'observed 清冊') !== state.manifestText) {
              rollbackIssues.push('observed 清冊回復後內容不一致');
            }
          } else if (currentManifest !== state.manifestText) {
            rollbackIssues.push('observed 清冊已被其他程序改變，未覆寫該外部異動');
          }
        } catch (rollbackError) {
          rollbackIssues.push(`observed 清冊無法回復（${rollbackError.message}）`);
        }
      }
      if (provenanceWritten) removeExactFile(provenancePath, provenanceText, 'observed provenance', rollbackIssues);
      if (fixtureWritten) removeExactFile(fixturePath, state.candidate, 'observed fixture', rollbackIssues);
      if (nextWritten) removeExactFile(nextPath, nextManifestText, 'observed 清冊 next 暫存檔', rollbackIssues);
      if (backupWritten) removeExactFile(backupPath, state.manifestText, 'observed 清冊 backup 暫存檔', rollbackIssues);
      if (observedDirCreated) {
        try { fs.rmdirSync(observedDir); }
        catch (rollbackError) { rollbackIssues.push(`observed 空目錄無法回收（${rollbackError.message}）`); }
      }
      const suffix = rollbackIssues.length > 0 ? `；回滾未完成：${rollbackIssues.join('；')}` : '';
      throw new Error(`交易式升級失敗：${error.message}${suffix}`);
    }
    result = {
      schemaVersion:'rc-joint-reaction-observed-promotion-result.v1',
      status:'promoted',
      fixtureId:state.fixtureId,
      fixtureFile:`observed/${fixtureFile}`,
      provenanceFile:`observed/${provenanceFile}`,
      candidateSha256:state.candidateSha256,
      transaction:'exclusive-lock-preflight-atomic-manifest-v1',
      sourceFileStored:false,
      sourceHashCommitted:false,
    };
  } catch (error) {
    operationError = error;
  }
  const lockIssues = releasePromotionLock(lock);
  if (operationError) {
    const suffix = lockIssues.length > 0 ? `；升級鎖清理未完成：${lockIssues.join('；')}` : '';
    throw new Error(`${operationError.message}${suffix}`);
  }
  if (lockIssues.length > 0) {
    result.lockCleanupRequired = true;
    result.lockCleanupIssues = lockIssues;
  } else {
    result.lockCleanupRequired = false;
  }
  return result;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`不支援的參數：${key}`);
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) throw new Error(`${key} 缺少值。`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function runCli(argv) {
  const args = parseArgs(argv);
  const manifestPath = args.manifest || path.join(__dirname, 'fixtures', 'joint-reactions', 'observed-manifest.json');
  if (Object.hasOwn(args, 'clear-stale-lock')) {
    if (String(args['clear-stale-lock']).toLowerCase() !== 'yes') throw new Error('--clear-stale-lock 只接受明確值 yes。');
    return clearStalePromotionLock({
      manifestPath,
      confirm:'yes',
      expectedLockSha256:args['expected-lock-sha256'],
    });
  }
  if (Object.hasOwn(args, 'lock-status')) {
    if (String(args['lock-status']).toLowerCase() !== 'yes') throw new Error('--lock-status 只接受明確值 yes。');
    return assessPromotionLock({ manifestPath });
  }
  const options = {
    candidatePath:args.candidate,
    evidencePath:args.evidence,
    reviewPath:args.review,
    fixtureId:args['fixture-id'],
    manifestPath,
  };
  if (String(args.promote || 'no').toLowerCase() === 'yes') return promoteCandidate(options);
  return assessPromotion(options);
}

if (require.main === module) {
  try {
    const result = runCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.ready === false) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { assessPromotion, promoteCandidate, assessPromotionLock, clearStalePromotionLock, runCli };
