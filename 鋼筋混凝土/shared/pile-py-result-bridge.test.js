const assert = require('node:assert/strict');
const Bridge = require('./pile-py-result-bridge.js');

const current = {
  pileNL: 3,
  pileNB: 3,
  spacingLCm: 180,
  spacingBCm: 180,
  pileDiameterCm: 60,
  pileLengthM: 18,
  horizontalXTf: 90,
  horizontalYTf: 45
};

const payload = {
  schema: 'rc-pile-py-result.v1',
  generatedAt: '2026-08-04T00:00:00.000Z',
  analysis: {
    analysisId: 'PY-CASE-001',
    software: 'LPile-compatible solver',
    version: '2025.1',
    caseName: 'SERVICE-X-Y',
    analyst: '',
    capacityBasis: '專案核定樁身斷面容量'
  },
  units: { length: 'cm', force: 'tf', moment: 'tf·m' },
  source: { ...current },
  results: {
    x: {
      headDisplacementCm: 0.82,
      allowableHeadDisplacementCm: 2.5,
      maxShearTf: 15.2,
      shearCapacityTf: 28,
      maxMomentTfm: 18.6,
      momentCapacityTfm: 31
    },
    y: {
      headDisplacementCm: 0.41,
      allowableHeadDisplacementCm: 2.5,
      maxShearTf: 7.8,
      shearCapacityTf: 28,
      maxMomentTfm: 9.4,
      momentCapacityTfm: 31
    }
  }
};

const candidate = Bridge.validatePayload(payload, current);
assert.equal(candidate.complete, true);
assert.equal(candidate.pass, true);
assert.equal(candidate.results.x.displacementOk, true);
assert.equal(candidate.results.y.momentOk, true);
assert.equal(candidate.source.analysisScope, 'pile-group');
assert.equal(candidate.source.analysisHorizontalXTf, 90);

const sourceText = `${JSON.stringify(payload, null, 2)}\n`;
const adopted = Bridge.adopt(candidate, { sourceFilename: 'pile-py.json', sourceSha256: 'a'.repeat(64), sourceText });
const inspected = Bridge.inspectState(JSON.stringify(adopted), current);
assert.equal(adopted.stateSchema, 'rc-pile-py-adoption.v2');
assert.equal(adopted.sourceArtifact.text, sourceText);
assert.equal(inspected.valid, true);
assert.equal(inspected.pass, true, 'p-y reviewed candidate becomes adopted result');
assert.equal(inspected.payload.analysis.analysisId, 'PY-CASE-001');
assert.equal(inspected.state.sourceArtifact.text, sourceText);

const legacyAdopted = JSON.parse(JSON.stringify(adopted));
legacyAdopted.stateSchema = 'rc-pile-py-adoption.v1';
delete legacyAdopted.sourceArtifact;
const legacyInspected = Bridge.inspectState(legacyAdopted, current);
assert.equal(legacyInspected.valid, true, 'legacy v1 adoption remains calculation-compatible');
assert.equal(legacyInspected.state.sourceArtifact, null, 'legacy v1 does not invent source bytes');

const mismatchedSource = JSON.parse(JSON.stringify(payload));
mismatchedSource.analysis.analysisId = 'PY-OTHER';
assert.throws(
  () => Bridge.adopt(candidate, { sourceFilename: 'pile-py.json', sourceSha256: 'a'.repeat(64), sourceText: JSON.stringify(mismatchedSource) }),
  /來源 JSON 原始檔與已驗證候選結果不一致/
);
assert.throws(
  () => Bridge.adopt(candidate, { sourceFilename: '../pile-py.json', sourceSha256: 'a'.repeat(64), sourceText }),
  /來源檔名 格式錯誤/
);
assert.throws(
  () => Bridge.adopt(candidate, { sourceFilename: 'pile-py.json', sourceSha256: 'a'.repeat(64), sourceText: `${sourceText}${' '.repeat(1024 * 1024)}` }),
  /超過 1 MiB/
);

const failedPayload = JSON.parse(JSON.stringify(payload));
failedPayload.results.x.headDisplacementCm = 3.1;
const failed = Bridge.validatePayload(failedPayload, current);
assert.equal(failed.complete, true);
assert.equal(failed.pass, false);
assert.equal(failed.results.x.displacementOk, false);

assert.throws(
  () => Bridge.validatePayload(payload, { ...current, horizontalXTf: 80 }),
  /來源與目前樁基模型不符/
);

const representativePayload = JSON.parse(JSON.stringify(payload));
representativePayload.source = {
  ...current,
  representativeXTf: 16,
  representativeYTf: 8,
  analysisScope: 'representative-pile',
  analysisHorizontalXTf: 16,
  analysisHorizontalYTf: 8
};
representativePayload.adapterEvidence = {
  schema: 'rc-pile-py-table-adapter.v1',
  sourceKind: 'tabular-export',
  unitProfile: 'si-kn-m-mm',
  analysisScope: 'representative-pile',
  x: { rowCount: 3, tableSha256: 'a'.repeat(64), sourceFilename: 'lpile-x.csv' },
  y: { rowCount: 3, tableSha256: 'b'.repeat(64), sourceFilename: 'lpile-y.tsv' }
};
const representative = Bridge.validatePayload(representativePayload, { ...current, representativeXTf: 16, representativeYTf: 8 });
assert.equal(representative.source.analysisScope, 'representative-pile');
assert.equal(representative.adapterEvidence.x.rowCount, 3);
assert.equal(representative.adapterEvidence.x.sourceFilename, 'lpile-x.csv');
assert.throws(
  () => Bridge.validatePayload(representativePayload, { ...current, representativeXTf: 15, representativeYTf: 8 }),
  /分析 Hx 16 ≠ 15/
);
const badEvidence = JSON.parse(JSON.stringify(representativePayload));
badEvidence.adapterEvidence.x.tableSha256 = 'bad';
assert.throws(
  () => Bridge.validatePayload(badEvidence, { ...current, representativeXTf: 16, representativeYTf: 8 }),
  /SHA-256 格式錯誤/
);
const badFilenameEvidence = JSON.parse(JSON.stringify(representativePayload));
badFilenameEvidence.adapterEvidence.x.sourceFilename = 'C:\\secret\\lpile-x.csv';
assert.throws(
  () => Bridge.validatePayload(badFilenameEvidence, { ...current, representativeXTf: 16, representativeYTf: 8 }),
  /來源檔名 格式錯誤/
);
assert.throws(
  () => Bridge.validatePayload({ ...payload, schema: 'rc-pile-py-result.v0' }, current),
  /schema 不相容/
);
assert.throws(
  () => Bridge.validatePayload({ ...payload, units: { length: 'mm', force: 'kN', moment: 'kN·m' } }, current),
  /單位必須/
);

const tampered = JSON.parse(JSON.stringify(adopted));
tampered.payload.source.pileDiameterCm = 80;
const rejectedState = Bridge.inspectState(tampered, current);
assert.equal(rejectedState.valid, false);
assert.match(rejectedState.reason, /來源與目前樁基模型不符/);

const tamperedArtifact = JSON.parse(JSON.stringify(adopted));
tamperedArtifact.sourceArtifact.text = tamperedArtifact.sourceArtifact.text.replace('PY-CASE-001', 'PY-CASE-999');
const rejectedArtifact = Bridge.inspectState(tamperedArtifact, current);
assert.equal(rejectedArtifact.valid, false);
assert.match(rejectedArtifact.reason, /來源 JSON 原始檔與採用結果不一致/);

const noResult = Bridge.inspectState('', current);
assert.equal(noResult.available, false);
assert.equal(noResult.pass, false);

console.log('pile p-y result bridge unit tests OK');
