const assert = require('assert');
const crypto = require('crypto');

function buildSteelResultReconciliation(options = {}) {
  const caseId = String(options.caseId || '').trim();
  const sourcePayload = options.sourcePayload;
  const replayCalculationFingerprint = String(options.replayCalculationFingerprint || '').trim();
  const reportCalculationFingerprint = String(options.reportCalculationFingerprint || '').trim();
  const verifiedAssertionCount = Number(options.verifiedAssertionCount);
  const providedAssertions = options.verifiedAssertions;
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
  let verifiedAssertions;
  let verifiedSurfaceAssertionCounts;
  if (providedAssertions !== undefined) {
    assert.ok(Array.isArray(providedAssertions), `${caseId} steel visible-value assertions are an array`);
    assert.equal(providedAssertions.length, verifiedAssertionCount, `${caseId} steel assertion count is derived from actual visible-value comparisons`);
    assert.ok(providedAssertions.length > 8, `${caseId} steel visible-value reconciliation records more than the legacy fingerprint assertions`);
    const assertionIds = new Set();
    verifiedAssertions = providedAssertions.map((item, index) => {
      const assertionId = String(item?.assertionId || '').trim();
      const sourcePath = String(item?.sourcePath || '').trim();
      const surface = String(item?.surface || '').trim();
      const visibleText = String(item?.visibleText || '').trim();
      const comparison = String(item?.comparison || '').trim();
      assert.match(assertionId, /^[a-z0-9][a-z0-9_.:-]+$/i, `${caseId} steel visible-value assertion ${index + 1} has an identity`);
      assert.equal(assertionIds.has(assertionId), false, `${caseId} steel visible-value assertion identities are unique`);
      assertionIds.add(assertionId);
      assert.ok(sourcePath, `${caseId} steel visible-value assertion ${assertionId} has a source path`);
      assert.ok(surface, `${caseId} steel visible-value assertion ${assertionId} has a rendered surface`);
      assert.ok(visibleText, `${caseId} steel visible-value assertion ${assertionId} records visible text`);
      if (comparison === 'numeric-within-tolerance') {
        const sourceValue = Number(item.sourceValue);
        const visibleValue = Number(item.visibleValue);
        const tolerance = Number(item.tolerance);
        assert.ok(Number.isFinite(sourceValue), `${caseId} steel visible-value assertion ${assertionId} has a finite source value`);
        assert.ok(Number.isFinite(visibleValue), `${caseId} steel visible-value assertion ${assertionId} has a finite rendered value`);
        assert.ok(Number.isFinite(tolerance) && tolerance >= 0, `${caseId} steel visible-value assertion ${assertionId} has a finite tolerance`);
        const difference = Math.abs(sourceValue - visibleValue);
        assert.ok(difference <= tolerance + Number.EPSILON, `${caseId} steel visible-value assertion ${assertionId} matches its source value`);
        return {
          assertionId, sourcePath, surface, comparison,
          sourceValue, visibleValue, visibleText, tolerance, difference, pass: true,
        };
      }
      assert.equal(comparison, 'exact-visible-text', `${caseId} steel visible-value assertion ${assertionId} uses a supported comparison`);
      const sourceValue = String(item.sourceValue || '').trim();
      const visibleValue = String(item.visibleValue || '').trim();
      assert.ok(sourceValue, `${caseId} steel visible-value assertion ${assertionId} has source text`);
      assert.equal(visibleValue, sourceValue, `${caseId} steel visible-value assertion ${assertionId} matches visible report text`);
      return {
        assertionId, sourcePath, surface, comparison,
        sourceValue, visibleValue, visibleText, pass: true,
      };
    });
    verifiedSurfaceAssertionCounts = {
      reportPopup: verifiedAssertions.filter(item => item.surface.startsWith('report-popup-')).length,
      approvedHtml: verifiedAssertions.filter(item => item.surface.startsWith('approved-html-')).length,
      renderedPdf: verifiedAssertions.filter(item => item.surface.startsWith('rendered-pdf-')).length,
    };
    for (const [surface, count] of Object.entries(verifiedSurfaceAssertionCounts)) {
      assert.ok(count > 8, `${caseId} steel visible-value reconciliation records more than eight actual ${surface} comparisons`);
    }
  }
  const result = {
    schemaVersion: 1,
    strategy: 'steel-source-replay-to-report-fingerprint',
    caseId,
    sourcePayloadSha256: crypto.createHash('sha256').update(JSON.stringify(sourcePayload), 'utf8').digest('hex'),
    verifiedAssertionCount,
    calculationFingerprint: sourceCalculationFingerprint,
    pass: true,
  };
  if (verifiedAssertions) {
    result.verifiedAssertions = verifiedAssertions;
    result.verifiedAssertionsSha256 = crypto.createHash('sha256').update(JSON.stringify(verifiedAssertions), 'utf8').digest('hex');
    result.verifiedSurfaceAssertionCounts = verifiedSurfaceAssertionCounts;
  }
  return result;
}

module.exports = { buildSteelResultReconciliation };
