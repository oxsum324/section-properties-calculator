const assert = require('assert');
const crypto = require('crypto');

function buildRcResultReconciliation(options = {}) {
  const caseId = String(options.caseId || '').trim();
  const sourceSnapshot = options.sourceSnapshot;
  const reportCalculationFingerprint = String(options.reportCalculationFingerprint || '').trim();
  const verifiedAssertionCount = Number(options.verifiedAssertionCount);
  assert.match(caseId, /^[a-z0-9][a-z0-9_-]+$/i, 'RC result reconciliation has a regression case identity');
  assert.ok(sourceSnapshot && typeof sourceSnapshot === 'object' && !Array.isArray(sourceSnapshot), `${caseId} RC result reconciliation has a project snapshot`);
  const sourceCalculationFingerprint = String(sourceSnapshot.calculationFingerprint || '').trim();
  assert.match(sourceCalculationFingerprint, /^CF-[0-9A-F]{16}$/i, `${caseId} RC project snapshot has a calculation fingerprint`);
  assert.equal(reportCalculationFingerprint, sourceCalculationFingerprint, `${caseId} RC report fingerprint matches the recalculated project snapshot`);
  assert.ok(Number.isInteger(verifiedAssertionCount) && verifiedAssertionCount > 0, `${caseId} RC result reconciliation records verified result assertions`);
  return {
    schemaVersion: 1,
    strategy: 'rc-project-replay-to-report-fingerprint',
    caseId,
    sourceSnapshotSha256: crypto.createHash('sha256').update(JSON.stringify(sourceSnapshot), 'utf8').digest('hex'),
    verifiedAssertionCount,
    calculationFingerprint: sourceCalculationFingerprint,
    pass: true,
  };
}

module.exports = { buildRcResultReconciliation };
