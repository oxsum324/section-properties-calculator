(function initPublicEvidenceSchema(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PublicEvidenceSchema = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPublicEvidenceSchema() {
  'use strict';

  const SCHEMA_VERSION = 1;
  const SNAPSHOT_VERSION = 1;
  const REQUIRED_PLATFORM_MODULES = Object.freeze(['steel', 'rc', 'core']);
  const DIMENSION_IDS = Object.freeze(['release', 'steel', 'rc', 'delivery']);

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

  function validateBaseSnapshot(payload, kind, errors) {
    const prefix = kind.replace(/-status$|-summary$/, '');
    addError(errors, isObject(payload), `${prefix}.object`);
    if (!isObject(payload)) return;
    addError(errors, payload.publicEvidenceSchemaVersion === SCHEMA_VERSION, `${prefix}.publicEvidenceSchemaVersion`);
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

  function validatePublicEvidenceBundle(bundle) {
    const errors = [];
    const platform = bundle?.platformStatus;
    const preflight = bundle?.preflightStatus;
    const readiness = bundle?.reportReadinessStatus;
    validateBaseSnapshot(platform, 'platform-status', errors);
    validateBaseSnapshot(preflight, 'preflight-summary', errors);
    validateBaseSnapshot(readiness, 'report-readiness-status', errors);

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
      schemaVersion: SCHEMA_VERSION,
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

  return Object.freeze({
    SCHEMA_VERSION,
    SNAPSHOT_VERSION,
    REQUIRED_PLATFORM_MODULES,
    DIMENSION_IDS,
    validatePublicEvidenceBundle,
  });
}));
