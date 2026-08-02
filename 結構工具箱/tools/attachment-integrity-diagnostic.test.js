const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { describeHtmlArtifact } = require('../../dev_tools/html-attachment-integrity');
const {
  buildAttachmentIntegrityDiagnostic,
  writeAttachmentIntegrityDiagnostic,
} = require('../../dev_tools/attachment-integrity-diagnostic');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-integrity-diagnostic-'));
const runDir = path.join(tempRoot, 'output', 'preflight', 'history', 'fixture-failed-release');
const evidenceDir = path.join(runDir, 'rendered-delivery-evidence', 'rc-formal');

function writeArtifact(name, fingerprint) {
  const html = `<!doctype html><html><body><p>文件狀態：正式附件</p><p>${fingerprint}</p></body></html>`;
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, name), html, 'utf8');
  return {
    htmlArtifact: name,
    calculationFingerprint: fingerprint,
    ...describeHtmlArtifact(name, html),
  };
}

try {
  const beam = writeArtifact('beam-1.html', 'CF-BEAM000000000001');
  const column1 = writeArtifact('column-1.html', 'CF-COLUMN000000001');
  const column2 = writeArtifact('column-2.html', 'CF-COLUMN000000002');
  fs.writeFileSync(path.join(evidenceDir, column1.htmlArtifact), fs.readFileSync(path.join(evidenceDir, column1.htmlArtifact), 'utf8').replace('正式附件', '內部審閱'), 'utf8');
  fs.rmSync(path.join(evidenceDir, column2.htmlArtifact));

  fs.writeFileSync(path.join(evidenceDir, 'beam-report-visual-audit.json'), `${JSON.stringify({ results: [{ portableHtml: beam }] }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceDir, 'column-report-visual-audit.json'), `${JSON.stringify({ results: [{ portableHtml: column1 }, { portableHtml: column2 }] }, null, 2)}\n`, 'utf8');

  const inventory = {
    tools: [
      { href: '/rc-beam', title: 'RC 梁', family: 'rc-formal', evidenceKey: 'beam-report-', htmlExpected: 1 },
      { href: '/rc-column', title: 'RC 柱', family: 'rc-formal', evidenceKey: 'column-report-', htmlExpected: 2 },
    ],
  };
  const diagnostic = buildAttachmentIntegrityDiagnostic({ runDir, inventory });
  assert.equal(diagnostic.pass, false, 'tampered release attachment diagnostic fails');
  assert.equal(diagnostic.attachmentIntegrityRequired, 3, 'diagnostic retains expected attachment count');
  assert.equal(diagnostic.attachmentIntegrityActual, 2, 'diagnostic counts the remaining physical attachments');
  assert.equal(diagnostic.attachmentIntegrityVerified, 1, 'diagnostic counts only unchanged verified attachments');
  assert.equal(diagnostic.attachmentIntegrityIssueCount, 2, 'diagnostic reports one tampered and one deleted attachment');
  assert.equal(diagnostic.attachmentIntegrityGroups.find(group => group.title === 'RC 梁').pass, true, 'unaffected RC group remains passed');
  const failedColumn = diagnostic.attachmentIntegrityGroups.find(group => group.title === 'RC 柱');
  assert.equal(failedColumn.pass, false, 'affected RC group fails');
  assert.equal(failedColumn.issueCount, 2, 'affected RC group reports both issues');
  assert.deepEqual(failedColumn.artifacts.map(artifact => artifact.code), ['sha256-mismatch', 'missing-file'], 'diagnostic classifies equal-length tamper and deletion without publishing file names');

  const paths = writeAttachmentIntegrityDiagnostic({ runDir, repoRoot: tempRoot, diagnostic });
  assert.ok(fs.existsSync(paths.runPath), 'run-specific diagnostic is preserved');
  assert.ok(fs.existsSync(paths.latestPath), 'latest local diagnostic is preserved');
  const latestText = fs.readFileSync(paths.latestPath, 'utf8');
  assert.equal(latestText.includes('column-1.html'), false, 'local dashboard diagnostic omits physical attachment file names');
  assert.equal(JSON.parse(latestText).runId, 'fixture-failed-release', 'latest diagnostic retains failed release run id');

  console.log('attachment integrity diagnostic contract OK');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
