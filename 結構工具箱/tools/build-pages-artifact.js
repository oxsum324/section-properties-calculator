const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PRIVATE_FILES = new Set([
  '啟動案件附件工作台.bat',
  '安裝案件附件工作台捷徑.bat',
  '檢查案件附件工作台捷徑.bat',
  '移除案件附件工作台捷徑.bat',
  '結構工具箱/tools/pages-live-smoke.js',
  '結構工具箱/tools/pages-live-browser-smoke.js',
  '結構工具箱/tools/run-pages-browser-smoke.sh',
  '結構工具箱/tools/build-pages-artifact.js',
  '結構工具箱/tools/build-pages-clean-routes.js',
  '結構工具箱/tools/build-pages-deployment-manifest.js',
  '結構工具箱/tools/verify-pages-release-lineage.js',
  '結構工具箱/tools/public-release-change-assistant.js',
  '結構工具箱/tools/public-release-change-assistant.test.js',
  '結構工具箱/tools/public-release-decision-receipt.js',
  '結構工具箱/tools/public-release-decision-receipt.test.js',
  '結構工具箱/tools/public-release-decision-backup.js',
  '結構工具箱/tools/public-release-decision-backup.test.js',
  '結構工具箱/tools/public-release-decision-backup-health.js',
  '結構工具箱/tools/public-release-decision-backup-health.test.js',
  '結構工具箱/tools/public-release-decision-backup-task.test.js',
  '結構工具箱/tools/run-public-release-decision-backup-health.ps1',
  '結構工具箱/tools/manage-public-release-decision-backup-health-task.ps1',
  '結構工具箱/tools/public-release-decision-restore-drill.js',
  '結構工具箱/tools/public-release-decision-restore-drill.test.js',
  '結構工具箱/tools/public-release-decision-restore-drill-health.js',
  '結構工具箱/tools/public-release-decision-restore-drill-health.test.js',
  '結構工具箱/tools/public-release-decision-cloud-checkpoint.js',
  '結構工具箱/tools/public-release-decision-cloud-checkpoint.test.js',
  '結構工具箱/tools/public-release-decision-restore-drill-task.test.js',
  '結構工具箱/tools/run-public-release-decision-restore-drill.ps1',
  '結構工具箱/tools/manage-public-release-decision-restore-drill-task.ps1',
  '結構工具箱/tools/release-preflight-lock.ps1',
  '結構工具箱/tools/release-preflight-lock.test.js',
  '結構工具箱/tools/attachment-package-check.js',
  '結構工具箱/tools/attachment-package-build.js',
  '結構工具箱/tools/attachment-package-verify.js',
  '結構工具箱/tools/attachment-package-manager-worker.js',
  '結構工具箱/tools/attachment-case-governance-viewer-worker.js',
  '結構工具箱/tools/attachment-package-upgrade-assistant-worker.js',
  '結構工具箱/tools/attachment-governance-hub-worker.js',
  '結構工具箱/tools/install-attachment-governance-shortcuts.ps1',
  '結構工具箱/tools/attachment-governance-shortcut-installer.test.js',
  '結構工具箱/tools/attachment-package-upgrade-assess.js',
  '結構工具箱/tools/attachment-package-upgrade-workspace.js',
  '結構工具箱/tools/attachment-package-upgrade-workspace-check.js',
  '結構工具箱/tools/attachment-package-upgrade-flow.js',
  '結構工具箱/tools/attachment-package-upgrade-history.js',
  '結構工具箱/tools/attachment-package-upgrade-history-index.js',
  '結構工具箱/tools/attachment-package-upgrade-history-baseline.js',
  '結構工具箱/tools/attachment-package-upgrade-history-baseline-advance.js',
  '結構工具箱/tools/attachment-package-upgrade-history-baseline-chain.js',
  '結構工具箱/tools/attachment-case-governance-overview.js',
  '結構工具箱/tools/attachment-case-governance-root.js',
  '結構工具箱/tools/attachment-case-governance-portfolio.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-compare.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot-index.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint.js',
  '結構工具箱/tools/attachment-case-governance-portfolio-snapshot-trend-disposition-checkpoint-history.js',
  '結構工具箱/tools/attachment-case-governance-workspace.js',
  '結構工具箱/tools/engineering-qualification-case-bundle.js',
  '結構工具箱/tools/beam-column-moment-g1-pilot.js',
  '結構工具箱/tools/rendered-delivery-evidence.js',
  '結構工具箱/tools/rendered-delivery-evidence.inventory.json',
  '結構工具箱/tools/rc-stm-atomic-change-set.manifest.json',
  '結構工具箱/tools/rc-stm-atomic-change-set.js',
  '結構工具箱/tools/rc-stm-atomic-change-set-review.js',
  '結構工具箱/tools/rc-stm-atomic-change-set-review.test.js',
  '結構工具箱/tools/docx-package-integrity.js',
  '結構工具箱/tools/docx-package-integrity.test.js',
  '結構工具箱/tools/xlsx-package-integrity.js',
  '結構工具箱/tools/xlsx-package-integrity.test.js',
  '結構工具箱/tools/xlsx-print-export.py',
  '結構工具箱/tools/xlsx-print-visual.js',
  '結構工具箱/tools/xlsx-print-visual.test.js',
  '結構工具箱/tools/xlsx-seal-verifier.js',
  '結構工具箱/tools/xlsx-seal-verifier.test.js',
  '鋼構工具/core/formal-core-manifest.json',
  '鋼筋混凝土/shared/joint-reaction-fixture-sanitizer.js',
  '鋼筋混凝土/shared/joint-reaction-fixture-promotion-gate.js',
  '鋼筋混凝土/shared/joint-reaction-observed-intake.js',
  '鋼筋混凝土/shared/joint-reaction-observed-review.template.json',
  'SRC工具/core/src-column-oracle.js',
  'SRC工具/src-column-page.contract.test.js',
  'SRC工具/src-column-browser-smoke.test.js',
  'SRC工具/src-column-core.test.js',
  'SRC工具/src-column-h-section-catalog.test.js',
  'SRC工具/src-column-oracle.test.js',
  'SRC工具/src-column-rc-biaxial.test.js',
  'SRC工具/src-column-shear.test.js',
  'SRC工具/src-column-seismic-axial.test.js',
  'SRC工具/src-column-seismic-detailing.test.js',
  'SRC工具/src-column-traceability.catalog.json',
  '.github/pages-smoke/build-performance-trend.js',
  '.github/pages-smoke/build-performance-trend.test.js',
  '.github/pages-smoke/normalize-playwright-result.js',
]);

const PRIVATE_PREFIXES = [
  '螺栓檢討/bolt-review-tool/',
  '結構工具箱/tools/independent-engineering-',
  '鋼筋混凝土/shared/fixtures/joint-reactions/',
  '開挖擋土支撐/backend/',
  '開挖擋土支撐/frontend/',
];

const PRIVATE_DIRECTORY_NAMES = new Set([
  '_site',
  'output',
  'dev_tools',
  'tests',
  'node_modules',
]);

const PRIVATE_GENERATED_DIRECTORY_PREFIXES = [
  'GSP-外部歸檔生命週期總覽-',
];

const PRIVATE_GENERATED_FILE_PREFIXES = [
  'case-bundle-EQB-',
  'GSM-外部歸檔生命週期監測-latest',
  'GSM-外部歸檔生命週期監測事件-',
];

const PRIVATE_BASENAMES = new Set([
  'case-bundle.draft.json',
  'package.json',
  'package-lock.json',
  'requirements.txt',
]);

const PRIVATE_SUFFIXES = [
  '.schema.json',
  '_schema.json',
  '.contract.test.js',
  '.test.js',
  '.pyc',
  '.tsx',
  '.tgz',
  '.bat',
  '.md',
  '.ps1',
  '.py',
  '.reg',
  '.ts',
];

const PRIVATE_CONTENT_PATTERNS = [
  {
    name: 'engineering-qualification-case-bundle',
    pattern: /["']kind["']\s*:\s*["']engineering-qualification-(?:case-bundle\.v1|comparison-data\.v[12])["']/u,
  },
  {
    name: 'beam-column-moment-g1-private-output',
    pattern: /["']kind["']\s*:\s*["'](?:beam-column-moment-g1-pilot-result\.v2|beam-column-moment-g1-internal-execution-envelope\.v1|beam-column-moment-g1-pilot-input\.v1|beam-column-moment-production-result\.v1|beam-column-moment-independent-reference\.v1|beam-column-moment-g1-pilot-profile\.v2|beam-column-moment-real-case-intake-template\.v1|engineering-qualification-g1-decision-receipt\.v2)["']/u,
  },
  {
    name: 'windows-user-profile-path',
    pattern: /(?:^|[^A-Za-z0-9_.-])[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s\"'<>|]+[\\/]+/i,
  },
];

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

function normalizeSlash(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function classifyPublishedPath(candidate) {
  const relativePath = normalizeSlash(candidate);
  const parts = relativePath.split('/');
  if (!relativePath || path.posix.isAbsolute(relativePath) || parts.includes('..')) {
    return { publish: false, reason: 'unsafe-path' };
  }
  if (parts.some(part => part.startsWith('.'))) {
    return { publish: false, reason: 'hidden-path' };
  }
  if (PRIVATE_FILES.has(relativePath)) {
    return { publish: false, reason: 'private-tooling' };
  }
  if (PRIVATE_PREFIXES.some(prefix => relativePath.startsWith(prefix))) {
    return { publish: false, reason: 'private-source-tree' };
  }
  if (parts.slice(0, -1).some(part => PRIVATE_DIRECTORY_NAMES.has(part))) {
    return { publish: false, reason: 'private-directory' };
  }
  if (parts.some(part => PRIVATE_GENERATED_DIRECTORY_PREFIXES.some(prefix => part.startsWith(prefix)))) {
    return { publish: false, reason: 'private-generated-evidence' };
  }

  const basename = parts.at(-1);
  if (PRIVATE_GENERATED_FILE_PREFIXES.some(prefix => basename.startsWith(prefix))) {
    return { publish: false, reason: 'private-generated-evidence' };
  }
  const lower = basename.toLowerCase();
  if (PRIVATE_BASENAMES.has(lower) || lower.startsWith('vite.config.')) {
    return { publish: false, reason: 'private-package-file' };
  }
  if (PRIVATE_SUFFIXES.some(suffix => lower.endsWith(suffix))) {
    return { publish: false, reason: 'private-source-file' };
  }
  return { publish: true, reason: 'published' };
}

function gitCandidates(repoRoot) {
  const output = childProcess.execFileSync('git', [
    '-C', repoRoot,
    '-c', 'core.quotepath=false',
    'ls-files', '-z', '--cached', '--others', '--exclude-standard',
  ], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return [...new Set(output.toString('utf8').split('\0').filter(Boolean).map(normalizeSlash))]
    .sort(compareOrdinal);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isQualificationBundleName(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'case-bundle.draft.json' || /^case-bundle-eqb-.+\.json$/u.test(normalized);
}

function qualificationWorkspacePrefixes(candidates, repoRoot) {
  const prefixes = new Set();
  const checkedDirectories = new Set();
  const root = path.resolve(repoRoot);
  const checkDirectory = directory => {
    if (checkedDirectories.has(directory)) return;
    checkedDirectories.add(directory);
    const absolute = directory === '.' ? root : path.resolve(root, ...directory.split('/'));
    if (!isInside(root, absolute) || !fs.existsSync(absolute) || !fs.lstatSync(absolute).isDirectory()) return;
    const hasBundle = fs.readdirSync(absolute, { withFileTypes: true })
      .some(entry => isQualificationBundleName(entry.name));
    if (!hasBundle) return;
    if (directory === '.') throw new Error('private engineering qualification case bundle cannot be stored at repository root');
    prefixes.add(`${directory}/`);
  };
  for (const candidate of candidates) {
    const normalized = normalizeSlash(candidate);
    let directory = path.posix.dirname(normalized);
    while (true) {
      checkDirectory(directory);
      if (directory === '.') break;
      directory = path.posix.dirname(directory);
    }
  }
  return [...prefixes].sort(compareOrdinal);
}

function privateContentNeedles(repoRoot) {
  const sources = [
    { name: 'build-repository-root', value: path.resolve(repoRoot) },
    { name: 'build-user-home', value: os.homedir() },
  ];
  const needles = [];
  const seen = new Set();
  for (const source of sources) {
    const backslash = String(source.value || '').replace(/\//g, '\\');
    const variants = [
      String(source.value || ''),
      backslash,
      backslash.replace(/\\/g, '\\\\'),
      backslash.replace(/\\/g, '/'),
    ];
    for (const needle of variants) {
      if (needle.length < 4 || seen.has(needle)) {
        continue;
      }
      seen.add(needle);
      needles.push({ name: source.name, needle });
    }
  }
  return needles;
}

function scanPrivatePublishedContent(siteRoot, repoRoot) {
  const findings = [];
  let scannedFileCount = 0;
  const needles = privateContentNeedles(repoRoot);

  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        scan(absolutePath);
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`published artifact contains unsupported symbolic link: ${normalizeSlash(path.relative(siteRoot, absolutePath))}`);
      }
      if (!entry.isFile()) {
        continue;
      }

      scannedFileCount += 1;
      const content = fs.readFileSync(absolutePath).toString('utf8');
      for (const rule of PRIVATE_CONTENT_PATTERNS) {
        if (rule.pattern.test(content)) {
          findings.push({
            path: normalizeSlash(path.relative(siteRoot, absolutePath)),
            rule: rule.name,
          });
        }
      }
      for (const rule of needles) {
        if (content.includes(rule.needle)) {
          findings.push({
            path: normalizeSlash(path.relative(siteRoot, absolutePath)),
            rule: rule.name,
          });
        }
      }
    }
  }

  scan(siteRoot);
  if (findings.length) {
    const summary = findings
      .slice(0, 12)
      .map(finding => `${finding.path} [${finding.rule}]`)
      .join(', ');
    const overflow = findings.length > 12 ? `, and ${findings.length - 12} more` : '';
    throw new Error(`published artifact contains private workstation path content: ${summary}${overflow}`);
  }
  return { scannedFileCount, findingCount: findings.length };
}

function stagePagesArtifact(options) {
  const repoRoot = fs.realpathSync(path.resolve(options.repoRoot));
  const siteRoot = path.resolve(options.siteRoot);
  if (siteRoot === repoRoot || isInside(siteRoot, repoRoot)) {
    throw new Error(`site root cannot contain the repository: ${siteRoot}`);
  }

  fs.rmSync(siteRoot, { recursive: true, force: true });
  fs.mkdirSync(siteRoot, { recursive: true });

  const candidates = gitCandidates(repoRoot);
  const qualificationPrefixes = qualificationWorkspacePrefixes(candidates, repoRoot);
  const reasonCounts = {};
  let missingCount = 0;
  const publishedPaths = [];

  for (const relativePath of candidates) {
    const classification = qualificationPrefixes.some(prefix => relativePath.startsWith(prefix))
      ? { publish: false, reason: 'private-qualification-workspace' }
      : classifyPublishedPath(relativePath);
    if (!classification.publish) {
      reasonCounts[classification.reason] = (reasonCounts[classification.reason] || 0) + 1;
      continue;
    }

    const source = path.resolve(repoRoot, ...relativePath.split('/'));
    if (!isInside(repoRoot, source)) {
      throw new Error(`candidate escapes repository root: ${relativePath}`);
    }
    if (!fs.existsSync(source)) {
      missingCount += 1;
      continue;
    }
    publishedPaths.push(relativePath);
  }

  if (!publishedPaths.length) {
    throw new Error('Git inventory contains no publishable files');
  }

  const temporaryIndexRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-artifact-index-'));
  const temporaryIndex = path.join(temporaryIndexRoot, 'index');
  const gitEnvironment = { ...process.env, GIT_INDEX_FILE: temporaryIndex };
  try {
    childProcess.execFileSync('git', ['-C', repoRoot, 'read-tree', '--empty'], {
      env: gitEnvironment,
      stdio: 'pipe',
    });
    childProcess.execFileSync('git', [
      '-C', repoRoot,
      'add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul',
    ], {
      env: gitEnvironment,
      input: Buffer.from(`${publishedPaths.join('\0')}\0`, 'utf8'),
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    childProcess.execFileSync('git', [
      '-C', repoRoot,
      '-c', 'core.autocrlf=false',
      '-c', 'core.eol=lf',
      'checkout-index', '--all', '--force', `--prefix=${siteRoot}${path.sep}`,
    ], {
      env: gitEnvironment,
      maxBuffer: 64 * 1024 * 1024,
      stdio: 'pipe',
    });
  } finally {
    fs.rmSync(temporaryIndexRoot, { recursive: true, force: true });
  }

  let copiedCount = 0;
  let totalBytes = 0;
  function measure(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        measure(absolutePath);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        copiedCount += 1;
        totalBytes += fs.statSync(absolutePath).size;
      } else {
        throw new Error(`unsupported staged artifact entry: ${path.relative(siteRoot, absolutePath)}`);
      }
    }
  }
  measure(siteRoot);
  if (copiedCount !== publishedPaths.length) {
    throw new Error(`staged file count mismatch: inventory=${publishedPaths.length}, copied=${copiedCount}`);
  }
  const privateContentScan = scanPrivatePublishedContent(siteRoot, repoRoot);
  if (privateContentScan.scannedFileCount !== copiedCount) {
    throw new Error(`private content scan count mismatch: copied=${copiedCount}, scanned=${privateContentScan.scannedFileCount}`);
  }

  return {
    repoRoot,
    siteRoot,
    candidateCount: candidates.length,
    publishedCount: copiedCount,
    excludedCount: candidates.length - publishedPaths.length - missingCount,
    missingCount,
    totalBytes,
    reasonCounts,
    privateContentScan,
  };
}

function main() {
  const result = stagePagesArtifact({
    repoRoot: argValue('--repo-root'),
    siteRoot: argValue('--site-root'),
  });
  console.log(`Pages artifact staged from Git inventory: candidates=${result.candidateCount}, published=${result.publishedCount}, excluded=${result.excludedCount}, missing=${result.missingCount}, bytes=${result.totalBytes}, privateContentScanned=${result.privateContentScan.scannedFileCount}, privateContentFindings=${result.privateContentScan.findingCount}`);
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
  PRIVATE_FILES,
  PRIVATE_PREFIXES,
  PRIVATE_GENERATED_DIRECTORY_PREFIXES,
  PRIVATE_GENERATED_FILE_PREFIXES,
  PRIVATE_CONTENT_PATTERNS,
  isQualificationBundleName,
  qualificationWorkspacePrefixes,
  classifyPublishedPath,
  gitCandidates,
  privateContentNeedles,
  scanPrivatePublishedContent,
  stagePagesArtifact,
};
