const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PRIVATE_FILES = new Set([
  '結構工具箱/tools/pages-live-smoke.js',
  '結構工具箱/tools/pages-live-browser-smoke.js',
  '結構工具箱/tools/run-pages-browser-smoke.sh',
  '結構工具箱/tools/build-pages-artifact.js',
  '結構工具箱/tools/build-pages-clean-routes.js',
  '結構工具箱/tools/build-pages-deployment-manifest.js',
  '結構工具箱/tools/attachment-package-check.js',
  '結構工具箱/tools/attachment-package-build.js',
  '結構工具箱/tools/attachment-package-verify.js',
  '結構工具箱/tools/attachment-package-upgrade-assess.js',
  '結構工具箱/tools/attachment-package-upgrade-workspace.js',
  '結構工具箱/tools/attachment-package-upgrade-workspace-check.js',
  '結構工具箱/tools/attachment-package-upgrade-flow.js',
  '結構工具箱/tools/attachment-package-upgrade-history.js',
  '結構工具箱/tools/attachment-package-upgrade-history-index.js',
  '結構工具箱/tools/attachment-package-upgrade-history-baseline.js',
  '結構工具箱/tools/attachment-package-upgrade-history-baseline-advance.js',
  '結構工具箱/tools/rendered-delivery-evidence.js',
  '結構工具箱/tools/rendered-delivery-evidence.inventory.json',
]);

const PRIVATE_PREFIXES = [
  '螺栓檢討/bolt-review-tool/',
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

const PRIVATE_BASENAMES = new Set([
  'package.json',
  'package-lock.json',
  'requirements.txt',
]);

const PRIVATE_SUFFIXES = [
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

  const basename = parts.at(-1);
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

function stagePagesArtifact(options) {
  const repoRoot = fs.realpathSync(path.resolve(options.repoRoot));
  const siteRoot = path.resolve(options.siteRoot);
  if (siteRoot === repoRoot || isInside(siteRoot, repoRoot)) {
    throw new Error(`site root cannot contain the repository: ${siteRoot}`);
  }

  fs.rmSync(siteRoot, { recursive: true, force: true });
  fs.mkdirSync(siteRoot, { recursive: true });

  const candidates = gitCandidates(repoRoot);
  const reasonCounts = {};
  let missingCount = 0;
  const publishedPaths = [];

  for (const relativePath of candidates) {
    const classification = classifyPublishedPath(relativePath);
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

  return {
    repoRoot,
    siteRoot,
    candidateCount: candidates.length,
    publishedCount: copiedCount,
    excludedCount: candidates.length - publishedPaths.length - missingCount,
    missingCount,
    totalBytes,
    reasonCounts,
  };
}

function main() {
  const result = stagePagesArtifact({
    repoRoot: argValue('--repo-root'),
    siteRoot: argValue('--site-root'),
  });
  console.log(`Pages artifact staged from Git inventory: candidates=${result.candidateCount}, published=${result.publishedCount}, excluded=${result.excludedCount}, missing=${result.missingCount}, bytes=${result.totalBytes}`);
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
  classifyPublishedPath,
  gitCandidates,
  stagePagesArtifact,
};
