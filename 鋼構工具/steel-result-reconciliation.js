const assert = require('assert');
const crypto = require('crypto');

function buildSteelResultReconciliation(options = {}) {
  const caseId = String(options.caseId || '').trim();
  const sourcePayload = options.sourcePayload;
  const replayCalculationFingerprint = String(options.replayCalculationFingerprint || '').trim();
  const reportCalculationFingerprint = String(options.reportCalculationFingerprint || '').trim();
  const verifiedAssertionCount = Number(options.verifiedAssertionCount);
  assert.match(caseId, /^[a-z0-9][a-z0-9-]+$/i, 'steel result reconciliation has a calculation case identity');
  assert.ok(sourcePayload && typeof sourcePayload === 'object' && !Array.isArray(sourcePayload), `${caseId} steel result reconciliation has a source payload`);
  assert.equal(sourcePayload.schemaVersion, 1, `${caseId} steel source payload schema`);
  assert.equal(sourcePayload.kind, 'formal-calculation-source', `${caseId} steel source payload kind`);
  const sourceCalculationFingerprint = String(sourcePayload.calculationFingerprint || '').trim();
  assert.match(sourceCalculationFingerprint, /^CF-[0-9A-F]{16}$/i, `${caseId} steel source payload has a calculation fingerprint`);
  assert.equal(sourcePayload.report?.calculationFingerprint, sourceCalculationFingerprint, `${caseId} steel source report fingerprint matches its payload`);
  assert.equal(replayCalculationFingerprint, sourceCalculationFingerprint, `${caseId} steel replay fingerprint matches its source payload`);
  assert.equal(reportCalculationFingerprint, sourceCalculationFingerprint, `${caseId} steel rendered report fingerprint matches its replayed source`);
  assert.ok(Number.isInteger(verifiedAssertionCount) && verifiedAssertionCount > 0, `${caseId} steel result reconciliation records verified result assertions`);
  return {
    schemaVersion: 1,
    strategy: 'steel-source-replay-to-report-fingerprint',
    caseId,
    sourcePayloadSha256: crypto.createHash('sha256').update(JSON.stringify(sourcePayload), 'utf8').digest('hex'),
    verifiedAssertionCount,
    calculationFingerprint: sourceCalculationFingerprint,
    pass: true,
  };
}

module.exports = { buildSteelResultReconciliation };
