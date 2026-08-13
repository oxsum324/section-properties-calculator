const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MANIFEST_FILE = 'pages-deployment.json';
const PREFLIGHT_STATUS_FILE = '結構工具箱/assets/status/preflight-summary.json';
const REPORT_READINESS_STATUS_FILE = '結構工具箱/assets/status/report-readiness-status.json';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

function normalizeSlash(value) {
  return value.split(path.sep).join('/');
}

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function publishedFiles(siteRoot) {
  const files = [];

  function visit(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => compareOrdinal(left.name, right.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizeSlash(path.relative(siteRoot, absolutePath));
      if (relativePath === MANIFEST_FILE) continue;
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        visit(absolutePath);
      } else if (stat.isFile()) {
        files.push({ absolutePath, relativePath });
      } else {
        throw new Error(`unsupported staged artifact entry: ${relativePath}`);
      }
    }
  }

  visit(siteRoot);
  return files.sort((left, right) => compareOrdinal(left.relativePath, right.relativePath));
}

function artifactIdentity(siteRoot) {
  const files = publishedFiles(siteRoot);
  const treeHash = crypto.createHash('sha256');
  let totalBytes = 0;
  const inventory = [];
  for (const file of files) {
    const content = fs.readFileSync(file.absolutePath);
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    totalBytes += content.byteLength;
    treeHash.update(`${file.relativePath}\0${content.byteLength}\0${contentHash}\n`, 'utf8');
    inventory.push({
      path: file.relativePath,
      bytes: content.byteLength,
      sha256: contentHash,
    });
  }
  return {
    algorithm: 'sha256-tree-v1',
    digest: treeHash.digest('hex'),
    fileCount: files.length,
    totalBytes,
    files: inventory,
  };
}

function readJsonFile(siteRoot, relativePath) {
  const filePath = path.join(siteRoot, ...relativePath.split('/'));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`required Pages release status is missing: ${relativePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function releaseEvidenceIdentity(siteRoot) {
  const preflight = readJsonFile(siteRoot, PREFLIGHT_STATUS_FILE);
  const reportReadiness = readJsonFile(siteRoot, REPORT_READINESS_STATUS_FILE);
  const generatedAt = String(preflight.generatedAt || '');
  const sourceCommitSha = String(preflight.sourceCommitSha || '').toLowerCase();
  const runId = String(preflight.runId || '');
  const generatedAtMs = Date.parse(generatedAt.replace(' ', 'T'));
  const formalRelease = preflight.snapshotVersion === 1
    && preflight.kind === 'preflight-summary'
    && preflight.quick === false
    && preflight.forcePlatformAudit === true
    && preflight.forceSlowChecks === true
    && preflight.sourceDirty === false
    && preflight.pass === true
    && preflight.failureCount === 0
    && Number.isInteger(preflight.recordsCount)
    && preflight.recordsCount > 0
    && preflight.passedCount === preflight.recordsCount
    && Number.isInteger(preflight.postCheckCount)
    && preflight.postCheckCount > 0
    && preflight.postChecksPassedCount === preflight.postCheckCount
    && /^\d{8}-\d{6}$/.test(runId)
    && /^[0-9a-f]{40}$/.test(sourceCommitSha)
    && Number.isFinite(generatedAtMs);
  if (!formalRelease) throw new Error('published preflight status is not complete formal release evidence');
  if (reportReadiness.snapshotVersion !== 1 || reportReadiness.kind !== 'report-readiness-status' || reportReadiness.pass !== true ||
      Number(reportReadiness.failureCount) !== 0 || String(reportReadiness.runId || '') !== runId) {
    throw new Error('published report readiness status does not match the formal release run');
  }
  return { runId, generatedAt, sourceCommitSha };
}

function buildDeploymentManifest(options) {
  const siteRoot = path.resolve(options.siteRoot);
  if (!fs.existsSync(siteRoot) || !fs.statSync(siteRoot).isDirectory()) {
    throw new Error(`site root is not a directory: ${siteRoot}`);
  }

  const commitSha = String(options.commitSha || '').toLowerCase();
  const sourceRef = String(options.sourceRef || '');
  const runId = String(options.runId || '');
  const runAttempt = Number(options.runAttempt);
  const sourceDirty = options.sourceDirty;
  if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('commitSha must be a 40-character Git SHA');
  if (!sourceRef) throw new Error('sourceRef is required');
  if (!runId) throw new Error('runId is required');
  if (!Number.isInteger(runAttempt) || runAttempt < 1) throw new Error('runAttempt must be a positive integer');
  if (typeof sourceDirty !== 'boolean') throw new Error('sourceDirty must be a boolean');

  const releaseEvidence = releaseEvidenceIdentity(siteRoot);
  const identity = artifactIdentity(siteRoot);
  const manifest = {
    schemaVersion: 3,
    kind: 'pages-deployment',
    generatedAt: options.generatedAt || new Date().toISOString(),
    commitSha,
    sourceRef,
    sourceDirty,
    runId,
    runAttempt,
    releaseEvidence,
    artifactDigestAlgorithm: identity.algorithm,
    artifactDigest: identity.digest,
    fileCount: identity.fileCount,
    totalBytes: identity.totalBytes,
    files: identity.files,
  };
  fs.writeFileSync(path.join(siteRoot, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function main() {
  const sourceDirtyValue = argValue('--source-dirty');
  if (!['true', 'false'].includes(sourceDirtyValue)) {
    throw new Error('--source-dirty must be true or false');
  }
  const manifest = buildDeploymentManifest({
    siteRoot: argValue('--site-root'),
    commitSha: argValue('--commit-sha'),
    sourceRef: argValue('--source-ref'),
    sourceDirty: sourceDirtyValue === 'true',
    runId: argValue('--run-id'),
    runAttempt: argValue('--run-attempt'),
  });
  console.log(`Pages deployment manifest generated: commit=${manifest.commitSha}, run=${manifest.runId}, dirty=${manifest.sourceDirty}, files=${manifest.fileCount}, digest=${manifest.artifactDigest}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = {
  MANIFEST_FILE,
  PREFLIGHT_STATUS_FILE,
  REPORT_READINESS_STATUS_FILE,
  artifactIdentity,
  releaseEvidenceIdentity,
  buildDeploymentManifest,
};
