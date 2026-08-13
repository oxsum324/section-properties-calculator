(function initPublicEvidenceSchema(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PublicEvidenceSchema = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPublicEvidenceSchema() {
  'use strict';

  const SCHEMA_VERSION = 2;
  const SNAPSHOT_VERSION = 1;
  const RELEASE_HISTORY_SCHEMA_VERSION = 1;
  const RELEASE_HISTORY_LIMIT = 8;
  const REQUIRED_PLATFORM_MODULES = Object.freeze(['steel', 'rc', 'core']);
  const DIMENSION_IDS = Object.freeze(['release', 'steel', 'rc', 'delivery']);
  const METRIC_IDS = Object.freeze([
    'steelResult', 'steelContentSeal', 'steelApprovalSeal',
    'rcResult', 'rcPrint', 'rcPackage',
    'formalResult', 'localQuickResult', 'rendered', 'delivery',
  ]);

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
      formalResult: coverage(readiness, 'formalResultReconciliationRequired', 'formalResultReconciliationComplete', 'formalResultReconciliationPass', errors),
      localQuickResult: coverage(readiness, 'localQuickResultReconciliationRequired', 'localQuickResultReconciliationComplete', 'localQuickResultReconciliationPass', errors),
      rendered: coverage(readiness, 'renderedDeliveryEvidenceRequired', 'renderedDeliveryEvidenceComplete', '', errors),
      delivery: coverage(readiness, 'deliveryFileIntegrityRequired', 'deliveryFileIntegrityVerified', 'deliveryFileIntegrityPass', errors),
    };
    const dimensions = [
      { id: 'release', pass: platformPass && preflightPass },
      { id: 'steel', pass: readinessPass && metrics.steelResult.pass && metrics.steelContentSeal.pass && metrics.steelApprovalSeal.pass },
      { id: 'rc', pass: readinessPass && metrics.rcResult.pass && metrics.rcPrint.pass && metrics.rcPackage.pass },
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
    return actual.length === expected.length
      && expected.slice().sort().every((key, index) => actual[index] === key);
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

  function validateReleaseHistory(history, currentEntry, errors) {
    addError(errors, hasExactKeys(history, ['schemaVersion', 'limit', 'entries']), 'history.shape');
    if (!isObject(history)) return;
    addError(errors, history.schemaVersion === RELEASE_HISTORY_SCHEMA_VERSION, 'history.schemaVersion');
    addError(errors, history.limit === RELEASE_HISTORY_LIMIT, 'history.limit');
    const entries = history.entries;
    addError(errors, Array.isArray(entries) && entries.length > 0 && entries.length <= RELEASE_HISTORY_LIMIT, 'history.entries');
    if (!Array.isArray(entries)) return;
    let previousRunId = '';
    let previousTimestamp = -Infinity;
    const seen = new Set();
    entries.forEach((entry, index) => {
      const prefix = `history.entries[${index}]`;
      addError(errors, hasExactKeys(entry, ['runId', 'generatedAt', 'sourceCommitSha', 'records', 'postChecks', 'dimensions', 'metrics']), `${prefix}.shape`);
      addError(errors, isRunId(entry?.runId), `${prefix}.runId`);
      addError(errors, isGeneratedAt(entry?.generatedAt), `${prefix}.generatedAt`);
      addError(errors, isSha(entry?.sourceCommitSha, 40), `${prefix}.sourceCommitSha`);
      addError(errors, hasExactKeys(entry?.records, ['passed', 'required'])
        && isPositiveInteger(entry.records.required)
        && entry.records.passed === entry.records.required, `${prefix}.records`);
      addError(errors, hasExactKeys(entry?.postChecks, ['passed', 'required'])
        && isPositiveInteger(entry.postChecks.required)
        && entry.postChecks.passed === entry.postChecks.required, `${prefix}.postChecks`);
      addError(errors, Array.isArray(entry?.dimensions)
        && entry.dimensions.length === DIMENSION_IDS.length
        && DIMENSION_IDS.every((id, dimensionIndex) => (
          hasExactKeys(entry.dimensions[dimensionIndex], ['id', 'pass'])
          && entry.dimensions[dimensionIndex].id === id
          && entry.dimensions[dimensionIndex].pass === true
        )), `${prefix}.dimensions`);
      addError(errors, Array.isArray(entry?.metrics)
        && entry.metrics.length === METRIC_IDS.length
        && METRIC_IDS.every((id, metricIndex) => {
          const metric = entry.metrics[metricIndex];
          return hasExactKeys(metric, ['id', 'complete', 'required'])
            && metric.id === id
            && isPositiveInteger(metric.required)
            && metric.complete === metric.required;
        }), `${prefix}.metrics`);
      const timestamp = Date.parse(String(entry?.generatedAt || '').replace(' ', 'T'));
      addError(errors, !previousRunId || entry.runId > previousRunId, `${prefix}.order`);
      addError(errors, Number.isFinite(timestamp) && timestamp >= previousTimestamp, `${prefix}.timeOrder`);
      addError(errors, !seen.has(entry?.runId), `${prefix}.unique`);
      previousRunId = String(entry?.runId || '');
      previousTimestamp = timestamp;
      seen.add(entry?.runId);
    });
    const latest = entries[entries.length - 1];
    addError(errors, Boolean(currentEntry) && JSON.stringify(latest) === JSON.stringify(currentEntry), 'history.latestAlignment');
  }

  function buildReleaseHistory(previousBundleOrBundles, currentBundle) {
    const currentEntry = releaseHistoryEntry(currentBundle, [SCHEMA_VERSION]);
    if (!currentEntry) throw new Error('current public evidence cannot create a release history entry');
    let entries = [];
    const previousBundles = Array.isArray(previousBundleOrBundles)
      ? previousBundleOrBundles
      : [previousBundleOrBundles];
    const mergeEntry = candidate => {
      const existingIndex = entries.findIndex(entry => entry.runId === candidate.runId);
      if (existingIndex === -1) {
        entries.push(candidate);
      } else if (JSON.stringify(entries[existingIndex]) !== JSON.stringify(candidate)) {
        throw new Error(`conflicting public release history entry: ${candidate.runId}`);
      }
    };
    for (const previousBundle of previousBundles) {
      const previousEntry = releaseHistoryEntry(previousBundle, [1, SCHEMA_VERSION]);
      if (!previousEntry) continue;
      const previousHistory = previousBundle?.preflightStatus?.releaseHistory;
      const historyErrors = [];
      validateReleaseHistory(previousHistory, previousEntry, historyErrors);
      if (historyErrors.length === 0) {
        previousHistory.entries.forEach(mergeEntry);
      } else {
        mergeEntry(previousEntry);
      }
    }
    entries.sort((left, right) => left.runId.localeCompare(right.runId));
    const latestPrevious = entries[entries.length - 1];
    if (latestPrevious && currentEntry.runId < latestPrevious.runId) {
      throw new Error('current release is older than the retained public release history');
    }
    const sameRunIndex = entries.findIndex(entry => entry.runId === currentEntry.runId);
    if (sameRunIndex !== -1) entries.splice(sameRunIndex, 1);
    entries.push(currentEntry);
    entries = entries.slice(-RELEASE_HISTORY_LIMIT);
    return {
      schemaVersion: RELEASE_HISTORY_SCHEMA_VERSION,
      limit: RELEASE_HISTORY_LIMIT,
      entries,
    };
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
    REQUIRED_PLATFORM_MODULES,
    DIMENSION_IDS,
    METRIC_IDS,
    buildReleaseHistory,
    validatePublicEvidenceBundle,
  });
}));
