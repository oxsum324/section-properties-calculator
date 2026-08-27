(function initPublicEvidenceSchema(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PublicEvidenceSchema = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPublicEvidenceSchema() {
  'use strict';

  const SCHEMA_VERSION = 3;
  const SNAPSHOT_VERSION = 1;
  const RELEASE_HISTORY_SCHEMA_VERSION = 2;
  const RELEASE_HISTORY_LIMIT = 8;
  const CHANGE_POLICY_VERSION = 1;
  const REDUCTION_AUTHORIZATION_SCHEMA_VERSION = 1;
  const REDUCTION_AUTHORIZATION_KIND = 'public-release-reduction-authorization';
  const REQUIRED_PLATFORM_MODULES = Object.freeze(['steel', 'rc', 'core']);
  const DIMENSION_IDS = Object.freeze(['release', 'steel', 'rc', 'delivery']);
  const METRIC_IDS = Object.freeze([
    'steelResult', 'steelContentSeal', 'steelApprovalSeal',
    'rcResult', 'rcPrint', 'rcPackage',
    'formalResult', 'localQuickResult', 'rendered', 'delivery',
  ]);
  const COUNTER_IDS = Object.freeze(['records', 'postChecks', ...METRIC_IDS]);
  const CHANGE_CLASSIFICATIONS = Object.freeze(['baseline', 'unchanged', 'expanded', 'reduced', 'mixed']);
  const REDUCTION_REASON_CODES = Object.freeze(['scope-change', 'gate-consolidation', 'tool-retirement', 'metric-correction']);

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
  }

  function isRunId(value) {
    return /^\d{8}-\d{6}$/.test(String(value || ''));
  }

  function isSha(value, length) {
    return new RegExp(`^[0-9a-f]{${length}}$`, 'i').test(String(value || ''));
  }

  function isGeneratedAt(value) {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})?$/.test(text)
      && Number.isFinite(Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}+08:00`));
  }

  function addError(errors, condition, code) {
    if (!condition) errors.push(code);
  }

  function validateBaseSnapshot(payload, kind, errors, allowedSchemaVersions) {
    const prefix = kind.replace(/-status$|-summary$/, '');
    addError(errors, isObject(payload), `${prefix}.object`);
    if (!isObject(payload)) return;
    addError(errors, allowedSchemaVersions.includes(payload.publicEvidenceSchemaVersion), `${prefix}.publicEvidenceSchemaVersion`);
    addError(errors, payload.snapshotVersion === SNAPSHOT_VERSION, `${prefix}.snapshotVersion`);
    addError(errors, payload.kind === kind, `${prefix}.kind`);
    addError(errors, isGeneratedAt(payload.generatedAt), `${prefix}.generatedAt`);
    addError(errors, isRunId(payload.runId), `${prefix}.runId`);
    addError(errors, typeof payload.pass === 'boolean', `${prefix}.pass`);
    addError(errors, isNonNegativeInteger(payload.failureCount), `${prefix}.failureCount`);
    addError(errors, typeof payload.sourcePath === 'string' && payload.sourcePath.length > 0 && !/^[A-Za-z]:[\\/]/.test(payload.sourcePath), `${prefix}.sourcePath`);
    addError(errors, isSha(payload.sourceHash, 64), `${prefix}.sourceHash`);
  }

  function coverage(payload, requiredKey, completeKey, passKey, errors) {
    const required = payload?.[requiredKey];
    const complete = payload?.[completeKey];
    const validCounts = isPositiveInteger(required)
      && isNonNegativeInteger(complete)
      && complete <= required;
    const validPass = passKey ? typeof payload?.[passKey] === 'boolean' : true;
    addError(errors, validCounts, `readiness.${requiredKey}/${completeKey}`);
    if (passKey) addError(errors, validPass, `readiness.${passKey}`);
    return {
      required: validCounts ? required : null,
      complete: validCounts ? complete : null,
      pass: validCounts && validPass && complete === required && (!passKey || payload[passKey] === true),
    };
  }

  function optionalCoverage(payload, requiredKey, completeKey, issueKey, passKey, expectedRequired, errors) {
    const keys = [requiredKey, completeKey, issueKey, passKey];
    const declared = keys.some(key => Object.prototype.hasOwnProperty.call(payload || {}, key));
    if (!declared) return { declared: false, required: 0, complete: 0, pass: true };
    const completeShape = keys.every(key => Object.prototype.hasOwnProperty.call(payload || {}, key));
    addError(errors, completeShape, `readiness.${requiredKey}.optionalShape`);
    const result = coverage(payload, requiredKey, completeKey, passKey, errors);
    const issueCount = payload?.[issueKey];
    addError(errors, isNonNegativeInteger(issueCount), `readiness.${issueKey}`);
    addError(errors, payload?.[requiredKey] === expectedRequired, `readiness.${requiredKey}.expected`);
    return {
      ...result,
      declared: true,
      pass: completeShape
        && result.pass
        && issueCount === 0
        && payload?.[requiredKey] === expectedRequired,
    };
  }

  function validateBundleCore(bundle, allowedSchemaVersions = [SCHEMA_VERSION]) {
    const errors = [];
    const platform = bundle?.platformStatus;
    const preflight = bundle?.preflightStatus;
    const readiness = bundle?.reportReadinessStatus;
    validateBaseSnapshot(platform, 'platform-status', errors, allowedSchemaVersions);
    validateBaseSnapshot(preflight, 'preflight-summary', errors, allowedSchemaVersions);
    validateBaseSnapshot(readiness, 'report-readiness-status', errors, allowedSchemaVersions);
    addError(errors, isObject(platform) && isObject(preflight) && isObject(readiness)
      && platform.publicEvidenceSchemaVersion === preflight.publicEvidenceSchemaVersion
      && readiness.publicEvidenceSchemaVersion === preflight.publicEvidenceSchemaVersion,
    'bundle.schemaAlignment');

    const platformPass = isObject(platform)
      && platform.pass === true
      && platform.failureCount === 0
      && Array.isArray(platform.modules)
      && REQUIRED_PLATFORM_MODULES.every(key => platform.modules.includes(key));
    addError(errors, platformPass, 'platform.releaseCoverage');

    const preflightPass = isObject(preflight)
      && preflight.quick === false
      && preflight.forcePlatformAudit === true
      && preflight.forceSlowChecks === true
      && preflight.sourceDirty === false
      && preflight.pass === true
      && preflight.failureCount === 0
      && isSha(preflight.sourceCommitSha, 40)
      && isPositiveInteger(preflight.recordsCount)
      && preflight.passedCount === preflight.recordsCount
      && isPositiveInteger(preflight.postCheckCount)
      && preflight.postChecksPassedCount === preflight.postCheckCount
      && Array.isArray(preflight.failedKeys)
      && preflight.failedKeys.length === 0
      && Array.isArray(preflight.postCheckFailures)
      && preflight.postCheckFailures.length === 0;
    addError(errors, preflightPass, 'preflight.formalRelease');

    const readinessPass = isObject(readiness)
      && readiness.pass === true
      && readiness.failureCount === 0
      && readiness.runId === preflight?.runId;
    addError(errors, readinessPass, 'readiness.releaseAlignment');

    const metrics = {
      steelResult: coverage(readiness, 'steelResultReconciliationRequired', 'steelResultReconciliationComplete', 'steelResultReconciliationPass', errors),
      steelContentSeal: coverage(readiness, 'steelHtmlContentSealRequired', 'steelHtmlContentSealComplete', 'steelHtmlContentSealPass', errors),
      steelApprovalSeal: coverage(readiness, 'steelHtmlApprovalSealRequired', 'steelHtmlApprovalSealComplete', 'steelHtmlApprovalSealPass', errors),
      rcResult: coverage(readiness, 'rcResultReconciliationRequired', 'rcResultReconciliationComplete', 'rcResultReconciliationPass', errors),
      rcPrint: coverage(readiness, 'rcStandaloneFormalHtmlPrintRequired', 'rcStandaloneFormalHtmlPrintComplete', 'rcStandaloneFormalHtmlPrintPass', errors),
      rcPackage: coverage(readiness, 'rcSourceReportPackageRequired', 'rcSourceReportPackageComplete', 'rcSourceReportPackagePass', errors),
      rcStmAttachment: optionalCoverage(readiness, 'rcStmFormalAttachmentRequired', 'rcStmFormalAttachmentComplete', 'rcStmFormalAttachmentIssueCount', 'rcStmFormalAttachmentPass', 3, errors),
      formalResult: coverage(readiness, 'formalResultReconciliationRequired', 'formalResultReconciliationComplete', 'formalResultReconciliationPass', errors),
      localQuickResult: coverage(readiness, 'localQuickResultReconciliationRequired', 'localQuickResultReconciliationComplete', 'localQuickResultReconciliationPass', errors),
      rendered: coverage(readiness, 'renderedDeliveryEvidenceRequired', 'renderedDeliveryEvidenceComplete', '', errors),
      delivery: coverage(readiness, 'deliveryFileIntegrityRequired', 'deliveryFileIntegrityVerified', 'deliveryFileIntegrityPass', errors),
    };
    const dimensions = [
      { id: 'release', pass: platformPass && preflightPass },
      { id: 'steel', pass: readinessPass && metrics.steelResult.pass && metrics.steelContentSeal.pass && metrics.steelApprovalSeal.pass },
      { id: 'rc', pass: readinessPass && metrics.rcResult.pass && metrics.rcPrint.pass && metrics.rcPackage.pass && metrics.rcStmAttachment.pass },
      { id: 'delivery', pass: readinessPass && metrics.formalResult.pass && metrics.localQuickResult.pass && metrics.rendered.pass && metrics.delivery.pass },
    ];
    return {
      schemaVersion: preflight?.publicEvidenceSchemaVersion || 0,
      valid: errors.length === 0,
      pass: errors.length === 0 && dimensions.every(item => item.pass),
      errors,
      dimensions,
      metrics,
      identity: {
        runId: isRunId(preflight?.runId) ? preflight.runId : '',
        generatedAt: isGeneratedAt(preflight?.generatedAt) ? preflight.generatedAt : '',
        sourceCommitSha: isSha(preflight?.sourceCommitSha, 40) ? preflight.sourceCommitSha.toLowerCase() : '',
      },
    };
  }

  function hasExactKeys(value, expected) {
    if (!isObject(value)) return false;
    const actual = Object.keys(value).sort();
    const wanted = expected.slice().sort();
    return actual.length === wanted.length && wanted.every((key, index) => actual[index] === key);
  }

  function releaseHistoryEntry(bundle, allowedSchemaVersions = [SCHEMA_VERSION]) {
    const validation = validateBundleCore(bundle, allowedSchemaVersions);
    if (!validation.pass) return null;
    const preflight = bundle.preflightStatus;
    return {
      runId: validation.identity.runId,
      generatedAt: validation.identity.generatedAt,
      sourceCommitSha: validation.identity.sourceCommitSha,
      records: { passed: preflight.passedCount, required: preflight.recordsCount },
      postChecks: { passed: preflight.postChecksPassedCount, required: preflight.postCheckCount },
      dimensions: validation.dimensions.map(item => ({ id: item.id, pass: item.pass })),
      metrics: METRIC_IDS.map(id => ({
        id,
        complete: validation.metrics[id].complete,
        required: validation.metrics[id].required,
      })),
    };
  }

  function historyEntryCore(entry) {
    if (!isObject(entry)) return null;
    return {
      runId: entry.runId,
      generatedAt: entry.generatedAt,
      sourceCommitSha: entry.sourceCommitSha,
      records: entry.records,
      postChecks: entry.postChecks,
      dimensions: entry.dimensions,
      metrics: entry.metrics,
    };
  }

  function validateCoreHistoryEntry(entry) {
    if (!hasExactKeys(historyEntryCore(entry), ['runId', 'generatedAt', 'sourceCommitSha', 'records', 'postChecks', 'dimensions', 'metrics'])) return false;
    return isRunId(entry.runId)
      && isGeneratedAt(entry.generatedAt)
      && isSha(entry.sourceCommitSha, 40)
      && hasExactKeys(entry.records, ['passed', 'required'])
      && isPositiveInteger(entry.records.required)
      && entry.records.passed === entry.records.required
      && hasExactKeys(entry.postChecks, ['passed', 'required'])
      && isPositiveInteger(entry.postChecks.required)
      && entry.postChecks.passed === entry.postChecks.required
      && Array.isArray(entry.dimensions)
      && entry.dimensions.length === DIMENSION_IDS.length
      && DIMENSION_IDS.every((id, index) => hasExactKeys(entry.dimensions[index], ['id', 'pass'])
        && entry.dimensions[index].id === id && entry.dimensions[index].pass === true)
      && Array.isArray(entry.metrics)
      && entry.metrics.length === METRIC_IDS.length
      && METRIC_IDS.every((id, index) => {
        const metric = entry.metrics[index];
        return hasExactKeys(metric, ['id', 'complete', 'required'])
          && metric.id === id
          && isPositiveInteger(metric.required)
          && metric.complete === metric.required;
      });
  }

  function counterValue(entry, id) {
    if (id === 'records' || id === 'postChecks') return entry?.[id]?.required;
    return entry?.metrics?.find(metric => metric.id === id)?.required;
  }

  function classifyReleaseChange(previousEntry, currentEntry) {
    if (!previousEntry) {
      return {
        policyVersion: CHANGE_POLICY_VERSION,
        classification: 'baseline',
        increases: [],
        reductions: [],
        reasonCode: '',
        reason: '',
      };
    }
    const increases = [];
    const reductions = [];
    COUNTER_IDS.forEach(id => {
      const from = counterValue(previousEntry, id);
      const to = counterValue(currentEntry, id);
      if (to > from) increases.push({ id, from, to });
      if (to < from) reductions.push({ id, from, to });
    });
    let classification = 'unchanged';
    if (increases.length && reductions.length) classification = 'mixed';
    else if (reductions.length) classification = 'reduced';
    else if (increases.length) classification = 'expanded';
    return {
      policyVersion: CHANGE_POLICY_VERSION,
      classification,
      increases,
      reductions,
      reasonCode: '',
      reason: '',
    };
  }

  function isPublicReason(value) {
    const text = String(value || '');
    return text === text.trim()
      && text.length >= 12
      && text.length <= 120
      && !/[\r\n\t\u0000-\u001f\u007f]/.test(text)
      && !/[A-Za-z]:[\\/]/.test(text)
      && !/(?:^|[\\/])Users[\\/]/i.test(text)
      && !/(?:^|[\\/])output[\\/]/i.test(text)
      && !/\b[0-9a-f]{40,64}\b/i.test(text);
  }

  function validateReductionAuthorization(authorization, change, previousRunId) {
    const errors = [];
    const normalized = authorization == null ? {
      schemaVersion: REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
      kind: REDUCTION_AUTHORIZATION_KIND,
      active: false,
    } : authorization;
    addError(errors, isObject(normalized), 'authorization.object');
    if (!isObject(normalized)) return { pass: false, errors, authorization: null };
    addError(errors, normalized.schemaVersion === REDUCTION_AUTHORIZATION_SCHEMA_VERSION, 'authorization.schemaVersion');
    addError(errors, normalized.kind === REDUCTION_AUTHORIZATION_KIND, 'authorization.kind');
    addError(errors, typeof normalized.active === 'boolean', 'authorization.active');
    const hasReductions = Array.isArray(change?.reductions) && change.reductions.length > 0;
    if (normalized.active !== true) {
      addError(errors, hasExactKeys(normalized, ['schemaVersion', 'kind', 'active']), 'authorization.inactiveShape');
      addError(errors, !hasReductions, 'authorization.requiredForReduction');
      return { pass: errors.length === 0, errors, authorization: normalized };
    }
    addError(errors, hasExactKeys(normalized, ['schemaVersion', 'kind', 'active', 'previousRunId', 'reasonCode', 'reason', 'reductions']), 'authorization.activeShape');
    addError(errors, hasReductions, 'authorization.unused');
    addError(errors, isRunId(normalized.previousRunId) && normalized.previousRunId === previousRunId, 'authorization.previousRunId');
    addError(errors, REDUCTION_REASON_CODES.includes(normalized.reasonCode), 'authorization.reasonCode');
    addError(errors, isPublicReason(normalized.reason), 'authorization.reason');
    addError(errors, Array.isArray(normalized.reductions)
      && JSON.stringify(normalized.reductions) === JSON.stringify(change?.reductions || []), 'authorization.reductions');
    return { pass: errors.length === 0, errors, authorization: normalized };
  }

  function validateChange(change, expected, prefix, errors) {
    addError(errors, hasExactKeys(change, ['policyVersion', 'classification', 'increases', 'reductions', 'reasonCode', 'reason']), `${prefix}.shape`);
    addError(errors, change?.policyVersion === CHANGE_POLICY_VERSION, `${prefix}.policyVersion`);
    addError(errors, CHANGE_CLASSIFICATIONS.includes(change?.classification), `${prefix}.classification`);
    addError(errors, JSON.stringify(change?.increases) === JSON.stringify(expected.increases), `${prefix}.increases`);
    addError(errors, JSON.stringify(change?.reductions) === JSON.stringify(expected.reductions), `${prefix}.reductions`);
    addError(errors, change?.classification === expected.classification, `${prefix}.derivedClassification`);
    if (expected.reductions.length) {
      addError(errors, REDUCTION_REASON_CODES.includes(change?.reasonCode), `${prefix}.reasonCode`);
      addError(errors, isPublicReason(change?.reason), `${prefix}.reason`);
    } else {
      addError(errors, change?.reasonCode === '' && change?.reason === '', `${prefix}.unusedReason`);
    }
  }

  function validateReleaseHistory(history, currentEntry, errors) {
    addError(errors, hasExactKeys(history, ['schemaVersion', 'limit', 'entries']), 'history.shape');
    if (!isObject(history)) return;
    addError(errors, history.schemaVersion === RELEASE_HISTORY_SCHEMA_VERSION, 'history.schemaVersion');
    addError(errors, history.limit === RELEASE_HISTORY_LIMIT, 'history.limit');
    const entries = history.entries;
    addError(errors, Array.isArray(entries) && entries.length > 0 && entries.length <= RELEASE_HISTORY_LIMIT, 'history.entries');
    if (!Array.isArray(entries)) return;
    let previousEntry = null;
    let previousRunId = '';
    let previousTimestamp = -Infinity;
    const seen = new Set();
    entries.forEach((entry, index) => {
      const prefix = `history.entries[${index}]`;
      addError(errors, hasExactKeys(entry, ['runId', 'generatedAt', 'sourceCommitSha', 'records', 'postChecks', 'dimensions', 'metrics', 'change']), `${prefix}.shape`);
      addError(errors, validateCoreHistoryEntry(entry), `${prefix}.core`);
      const expectedChange = classifyReleaseChange(previousEntry, entry);
      validateChange(entry?.change, expectedChange, `${prefix}.change`, errors);
      const timestamp = Date.parse(String(entry?.generatedAt || '').replace(' ', 'T'));
      addError(errors, !previousRunId || entry.runId > previousRunId, `${prefix}.order`);
      addError(errors, Number.isFinite(timestamp) && timestamp >= previousTimestamp, `${prefix}.timeOrder`);
      addError(errors, !seen.has(entry?.runId), `${prefix}.unique`);
      previousEntry = entry;
      previousRunId = String(entry?.runId || '');
      previousTimestamp = timestamp;
      seen.add(entry?.runId);
    });
    const latest = entries[entries.length - 1];
    addError(errors, Boolean(currentEntry)
      && JSON.stringify(historyEntryCore(latest)) === JSON.stringify(currentEntry), 'history.latestAlignment');
  }

  function historicalReason(entry) {
    return isObject(entry?.change) && Array.isArray(entry.change.reductions) && entry.change.reductions.length
      ? { reasonCode: entry.change.reasonCode, reason: entry.change.reason }
      : null;
  }

  function validRetainedHistoryEntries(history, latestEntry) {
    if (!isObject(history) || !Array.isArray(history.entries)) return [];
    if (history.schemaVersion === RELEASE_HISTORY_SCHEMA_VERSION) {
      const errors = [];
      validateReleaseHistory(history, latestEntry, errors);
      return errors.length === 0 ? history.entries : [];
    }
    const legacyEntries = history.entries;
    const legacyShapeValid = history.schemaVersion === 1
      && history.limit === RELEASE_HISTORY_LIMIT
      && hasExactKeys(history, ['schemaVersion', 'limit', 'entries'])
      && legacyEntries.length > 0
      && legacyEntries.length <= RELEASE_HISTORY_LIMIT
      && legacyEntries.every(entry => hasExactKeys(entry, ['runId', 'generatedAt', 'sourceCommitSha', 'records', 'postChecks', 'dimensions', 'metrics'])
        && validateCoreHistoryEntry(entry))
      && legacyEntries.every((entry, index) => index === 0
        || (entry.runId > legacyEntries[index - 1].runId
          && Date.parse(String(entry.generatedAt).replace(' ', 'T')) >= Date.parse(String(legacyEntries[index - 1].generatedAt).replace(' ', 'T'))))
      && new Set(legacyEntries.map(entry => entry.runId)).size === legacyEntries.length
      && JSON.stringify(historyEntryCore(legacyEntries.at(-1))) === JSON.stringify(latestEntry);
    return legacyShapeValid ? legacyEntries : [];
  }

  function buildReleaseHistory(previousBundleOrBundles, currentBundle, reductionAuthorization) {
    const currentEntry = releaseHistoryEntry(currentBundle, [SCHEMA_VERSION]);
    if (!currentEntry) throw new Error('current public evidence cannot create a release history entry');
    let entries = [];
    const preservedReasons = new Map();
    const previousBundles = Array.isArray(previousBundleOrBundles) ? previousBundleOrBundles : [previousBundleOrBundles];
    const mergeEntry = candidate => {
      if (!validateCoreHistoryEntry(candidate)) return;
      const core = historyEntryCore(candidate);
      const existingIndex = entries.findIndex(entry => entry.runId === core.runId);
      if (existingIndex === -1) entries.push(core);
      else if (JSON.stringify(entries[existingIndex]) !== JSON.stringify(core)) throw new Error(`conflicting public release history entry: ${core.runId}`);
      const reason = historicalReason(candidate);
      if (reason) preservedReasons.set(core.runId, reason);
    };
    for (const previousBundle of previousBundles) {
      const previousEntry = releaseHistoryEntry(previousBundle, [1, 2, SCHEMA_VERSION]);
      if (!previousEntry) continue;
      const previousHistory = previousBundle?.preflightStatus?.releaseHistory;
      const retainedEntries = validRetainedHistoryEntries(previousHistory, previousEntry);
      if (retainedEntries.length) retainedEntries.forEach(mergeEntry);
      else {
        if (isObject(previousHistory) && Array.isArray(previousHistory.entries) && previousEntry.runId === currentEntry.runId) {
          throw new Error('invalid retained public release history for current release');
        }
        mergeEntry(previousEntry);
      }
    }
    entries.sort((left, right) => left.runId.localeCompare(right.runId));
    const latestPrevious = entries[entries.length - 1];
    if (latestPrevious && currentEntry.runId < latestPrevious.runId) throw new Error('current release is older than the retained public release history');
    const sameRunIndex = entries.findIndex(entry => entry.runId === currentEntry.runId);
    const sameRunEntry = sameRunIndex === -1 ? null : entries[sameRunIndex];
    const sameRunReason = sameRunEntry ? preservedReasons.get(sameRunEntry.runId) : null;
    const revalidatingAuthorizedRelease = Boolean(
      sameRunEntry
      && JSON.stringify(sameRunEntry) === JSON.stringify(currentEntry)
      && sameRunReason
      && REDUCTION_REASON_CODES.includes(sameRunReason.reasonCode)
      && isPublicReason(sameRunReason.reason),
    );
    if (sameRunIndex !== -1) entries.splice(sameRunIndex, 1);
    entries.push(currentEntry);
    entries = entries.slice(-RELEASE_HISTORY_LIMIT);

    let previousEntry = null;
    entries = entries.map((entry, index) => {
      const change = classifyReleaseChange(previousEntry, entry);
      if (change.reductions.length) {
        const preserved = preservedReasons.get(entry.runId);
        if (index < entries.length - 1 && preserved && REDUCTION_REASON_CODES.includes(preserved.reasonCode) && isPublicReason(preserved.reason)) {
          change.reasonCode = preserved.reasonCode;
          change.reason = preserved.reason;
        }
      }
      const next = { ...entry, change };
      previousEntry = next;
      return next;
    });

    const currentChange = entries.at(-1).change;
    const previousRunId = entries.length > 1 ? entries.at(-2).runId : '';
    const inactiveRevalidationChange = revalidatingAuthorizedRelease && reductionAuthorization?.active !== true
      ? { ...currentChange, reductions: [] }
      : currentChange;
    const authorizationResult = validateReductionAuthorization(reductionAuthorization, inactiveRevalidationChange, previousRunId);
    if (!authorizationResult.pass) throw new Error(`public release reduction authorization failed: ${authorizationResult.errors.join(', ')}`);
    if (currentChange.reductions.length) {
      const reasonSource = revalidatingAuthorizedRelease && reductionAuthorization?.active !== true
        ? sameRunReason
        : authorizationResult.authorization;
      currentChange.reasonCode = reasonSource.reasonCode;
      currentChange.reason = reasonSource.reason;
    }
    return { schemaVersion: RELEASE_HISTORY_SCHEMA_VERSION, limit: RELEASE_HISTORY_LIMIT, entries };
  }

  function validatePublicEvidenceBundle(bundle) {
    const validation = validateBundleCore(bundle, [SCHEMA_VERSION]);
    const errors = validation.errors.slice();
    const currentEntry = releaseHistoryEntry(bundle, [SCHEMA_VERSION]);
    validateReleaseHistory(bundle?.preflightStatus?.releaseHistory, currentEntry, errors);
    return {
      ...validation,
      valid: errors.length === 0,
      pass: errors.length === 0 && validation.dimensions.every(item => item.pass),
      errors,
      releaseHistory: errors.length === 0 ? bundle.preflightStatus.releaseHistory : null,
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    SNAPSHOT_VERSION,
    RELEASE_HISTORY_SCHEMA_VERSION,
    RELEASE_HISTORY_LIMIT,
    CHANGE_POLICY_VERSION,
    REDUCTION_AUTHORIZATION_SCHEMA_VERSION,
    REDUCTION_AUTHORIZATION_KIND,
    REQUIRED_PLATFORM_MODULES,
    DIMENSION_IDS,
    METRIC_IDS,
    COUNTER_IDS,
    CHANGE_CLASSIFICATIONS,
    REDUCTION_REASON_CODES,
    classifyReleaseChange,
    validateReductionAuthorization,
    buildReleaseHistory,
    validatePublicEvidenceBundle,
  });
}));
