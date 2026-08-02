const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const { verifyHtmlArtifact } = require('./html-attachment-integrity');

const repoRoot = path.resolve(__dirname, '..');
const inventoryPath = path.join(repoRoot, '結構工具箱', 'tools', 'rendered-delivery-evidence.inventory.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function integritySetHash(artifacts) {
  return createHash('sha256')
    .update(artifacts.map(artifact => `${artifact.ordinal}\u0000${artifact.bytes}\u0000${artifact.sha256}`).join('\n'), 'utf8')
    .digest('hex');
}

function classifyIntegrityError(error, exists, record) {
  const message = String(error?.message || '');
  if (!record?.htmlArtifact) return 'missing-manifest-name';
  if (!exists) return 'missing-file';
  if (!Number.isInteger(record.htmlArtifactBytes) || record.htmlArtifactBytes <= 0 || !/^[0-9a-f]{64}$/i.test(String(record.htmlArtifactSha256 || ''))) {
    return 'missing-recorded-integrity';
  }
  if (message.includes('bytes match')) return 'bytes-mismatch';
  if (message.includes('SHA-256 matches')) return 'sha256-mismatch';
  if (message.includes('static formal state')) return 'formal-state-missing';
  if (message.includes('fingerprint')) return 'fingerprint-missing';
  return 'content-invalid';
}

function inspectHtmlArtifact(directory, record, ordinal, label) {
  const name = String(record?.htmlArtifact || '').trim();
  const artifactPath = name ? path.join(directory, name) : '';
  const exists = Boolean(artifactPath && fs.existsSync(artifactPath));
  const buffer = exists ? fs.readFileSync(artifactPath) : null;
  let verified = false;
  let code = '';
  try {
    verifyHtmlArtifact(directory, record || {}, label);
    verified = true;
  } catch (error) {
    code = classifyIntegrityError(error, exists, record);
  }
  return {
    ordinal,
    exists,
    verified,
    bytes: buffer?.length || 0,
    sha256: buffer ? sha256Buffer(buffer) : '',
    code,
  };
}

function loadManifestRecords(runDir, tool) {
  const directory = path.join(runDir, 'rendered-delivery-evidence', tool.family);
  if (tool.family === 'rc-formal') {
    const auditPath = path.join(directory, `${tool.evidenceKey}visual-audit.json`);
    const audit = readJsonIfExists(auditPath);
    const auditRecords = Array.isArray(audit) ? audit : audit?.results;
    return {
      directory,
      records: Array.isArray(auditRecords) ? auditRecords.map(record => record?.portableHtml).filter(Boolean) : [],
      sourceAvailable: Array.isArray(auditRecords),
    };
  }

  const summaryPath = path.join(directory, 'rendered-delivery-evidence-summary.json');
  const summary = readJsonIfExists(summaryPath);
  return {
    directory,
    records: Array.isArray(summary?.records)
      ? summary.records.filter(record => record?.htmlArtifact).map(record => ({
        htmlArtifact: record.htmlArtifact,
        htmlArtifactBytes: record.portableHtml?.htmlArtifactBytes,
        htmlArtifactSha256: record.portableHtml?.htmlArtifactSha256,
        calculationFingerprint: record.portableHtml?.calculationFingerprint || '',
      }))
      : [],
    sourceAvailable: Array.isArray(summary?.records),
  };
}

function buildAttachmentIntegrityDiagnostic(options) {
  const runDir = path.resolve(options.runDir);
  const inventory = options.inventory;
  const tools = inventory.tools.filter(tool => ['rc-formal', 'rc-retrofit'].includes(tool.family));
  const groups = tools.map((tool) => {
    const expected = Number(tool.htmlExpected || 0);
    const manifest = loadManifestRecords(runDir, tool);
    const inspected = manifest.records.map((record, index) => inspectHtmlArtifact(manifest.directory, record, index + 1, tool.title));
    const displayedArtifacts = inspected.slice();
    while (displayedArtifacts.length < expected) {
      displayedArtifacts.push({
        ordinal: displayedArtifacts.length + 1,
        exists: false,
        verified: false,
        bytes: 0,
        sha256: '',
        code: manifest.sourceAvailable ? 'missing-manifest-record' : 'missing-manifest',
      });
    }
    const actual = inspected.filter(artifact => artifact.exists).length;
    const verified = inspected.filter(artifact => artifact.verified).length;
    const failedRecords = inspected.filter(artifact => !artifact.verified).length;
    const manifestCountDelta = Math.abs(expected - manifest.records.length);
    const issueCount = Math.max(manifest.sourceAvailable ? 0 : 1, failedRecords + manifestCountDelta);
    const artifacts = displayedArtifacts.map(({ ordinal, bytes, sha256, code }) => ({ ordinal, bytes, sha256, code }));
    return {
      href: tool.href,
      title: tool.title,
      family: tool.family,
      expected,
      actual,
      verified,
      issueCount,
      pass: expected > 0 && actual === expected && verified === expected && issueCount === 0,
      setSha256: integritySetHash(artifacts),
      artifacts,
    };
  });
  const required = groups.reduce((sum, group) => sum + group.expected, 0);
  const actual = groups.reduce((sum, group) => sum + group.actual, 0);
  const verified = groups.reduce((sum, group) => sum + group.verified, 0);
  const issueCount = groups.reduce((sum, group) => sum + group.issueCount, 0);
  const pass = groups.length === tools.length && tools.length > 0 && groups.every(group => group.pass);
  return {
    snapshotVersion: 1,
    kind: 'attachment-integrity-diagnostic',
    generatedAt: new Date().toISOString(),
    runId: path.basename(runDir),
    pass,
    failureCount: issueCount,
    attachmentIntegrityDiagnostic: true,
    attachmentIntegrityScope: 'rc-formal-html',
    attachmentIntegrityRequired: required,
    attachmentIntegrityActual: actual,
    attachmentIntegrityVerified: verified,
    attachmentIntegrityIssueCount: issueCount,
    attachmentIntegrityPass: pass,
    attachmentIntegritySetSha256: integritySetHash(groups.flatMap(group => group.artifacts)),
    attachmentIntegrityGroups: groups,
  };
}

function writeAttachmentIntegrityDiagnostic(options) {
  const diagnostic = options.diagnostic;
  const runPath = path.join(options.runDir, 'rendered-delivery-evidence', 'attachment-integrity-diagnostic.json');
  const latestPath = path.join(options.repoRoot || repoRoot, 'output', 'preflight', 'attachment-integrity-latest.json');
  for (const filePath of [runPath, latestPath]) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8');
  }
  return { runPath, latestPath };
}

function main() {
  if (process.env.PREFLIGHT_RELEASE !== '1') {
    console.log('Attachment integrity diagnostic skipped outside release mode.');
    return;
  }
  const runDir = path.resolve(process.env.PREFLIGHT_RUN_DIR || '');
  if (!process.env.PREFLIGHT_RUN_DIR || !fs.existsSync(runDir)) {
    throw new Error('attachment integrity diagnostic requires existing PREFLIGHT_RUN_DIR');
  }
  const diagnostic = buildAttachmentIntegrityDiagnostic({ runDir, inventory: readJson(inventoryPath) });
  const paths = writeAttachmentIntegrityDiagnostic({ runDir, repoRoot, diagnostic });
  const summary = `required=${diagnostic.attachmentIntegrityRequired}, actual=${diagnostic.attachmentIntegrityActual}, verified=${diagnostic.attachmentIntegrityVerified}, issues=${diagnostic.attachmentIntegrityIssueCount}`;
  if (!diagnostic.pass) {
    console.error(`Attachment integrity diagnostic failed (${summary}, latest=${paths.latestPath})`);
    process.exitCode = 1;
    return;
  }
  console.log(`Attachment integrity diagnostic OK (${summary}, latest=${paths.latestPath})`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  buildAttachmentIntegrityDiagnostic,
  classifyIntegrityError,
  inspectHtmlArtifact,
  integritySetHash,
  writeAttachmentIntegrityDiagnostic,
};
