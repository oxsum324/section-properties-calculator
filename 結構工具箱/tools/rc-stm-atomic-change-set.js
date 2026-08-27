const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 2;
const KIND = 'rc-stm-atomic-change-set';
const MANIFEST_PATH = '結構工具箱/tools/rc-stm-atomic-change-set.manifest.json';
const INVENTORY_PATH = '結構工具箱/tools/rendered-delivery-evidence.inventory.json';
const EXPECTED_TOOL_KEYS = Object.freeze([
  'deep-beam-stm',
  'foundation-deep-beam-stm',
  'pile-cap-3d-stm',
]);
const EXPECTED_GROUP_KEYS = Object.freeze([
  'calculation-core',
  'runtime-pages-and-handoffs',
  'runtime-baseline-dependencies',
  'observed-format-governance',
  'rc-integration-and-regression',
  'formal-attachment-evidence',
]);
const REQUIRED_GOVERNANCE_PATHS = Object.freeze([
  MANIFEST_PATH,
  '結構工具箱/tools/rc-stm-atomic-change-set.js',
  '結構工具箱/tools/rc-stm-atomic-change-set-review.js',
  '結構工具箱/tools/rc-stm-atomic-change-set-review.test.js',
]);
const ADDITIONAL_DEPENDENCY_SCAN_PATHS = Object.freeze([
  'frame-analysis.contract.test.js',
  '鋼架/平面剛架分析.html',
  '結構工具箱/tools/independent-engineering-adapters/rc-beam-strength.js',
]);
const EXPECTED_HANDOFF_ANCHORS = Object.freeze({
  'rc-beam-design-to-stm': Object.freeze({
    source: '鋼筋混凝土/shared/beam-rebar-designer.js',
    target: '鋼筋混凝土/tools/deep-beam-stm.html',
    contract: '結構工具箱/tools/independent-engineering-adapters/rc-beam-strength.js',
  }),
  'frame-basic-components-to-pile-cap-stm': Object.freeze({
    source: '鋼架/平面剛架分析.html',
    target: '鋼筋混凝土/tools/pile-cap-3d-stm.html',
    contract: 'frame-analysis.contract.test.js',
  }),
  'joint-reactions-to-pile-cap-stm': Object.freeze({
    source: '鋼筋混凝土/shared/joint-reaction-load-adapter.js',
    target: '鋼筋混凝土/tools/pile-cap-3d-stm.html',
    contract: '鋼筋混凝土/shared/joint-reaction-load-adapter-fixtures.test.js',
  }),
  'stm-pages-to-formal-evidence': Object.freeze({
    source: '鋼筋混凝土/tools/deep-beam-stm.html',
    target: '結構工具箱/tools/rendered-delivery-evidence.inventory.json',
    contract: '結構工具箱/tools/rendered-delivery-evidence.contract.test.js',
  }),
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && wanted.every((key, index) => actual[index] === key);
}

function normalizeSlash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function repoFile(repoRoot, relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function isSafeRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\') || relativePath.includes('\0')) return false;
  if (/[\u0000-\u001F<>:"|?*]/.test(relativePath)) return false;
  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) return false;
  if (path.posix.normalize(relativePath) !== relativePath) return false;
  const segments = relativePath.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return false;
  if (segments[0] === '.git' || segments[0] === 'output' || segments.includes('node_modules')) return false;
  return true;
}

function sortedEqual(actual, expected) {
  return JSON.stringify(actual.slice().sort()) === JSON.stringify(expected.slice().sort());
}

function validateRcStmAtomicChangeSet(manifest, options = {}) {
  const issues = [];
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..', '..'));
  const exists = options.exists || (relativePath => fs.existsSync(repoFile(repoRoot, relativePath)));
  const readRelativeText = options.readText || (relativePath => fs.readFileSync(repoFile(repoRoot, relativePath), 'utf8'));
  const inventory = options.renderedDeliveryInventory || readJson(repoFile(repoRoot, INVENTORY_PATH));

  if (!hasExactKeys(manifest, ['schemaVersion', 'kind', 'governedToolKeys', 'homepageFormalToolDelta', 'releaseEvidence', 'entrypoints', 'handoffs', 'groups'])) issues.push('top-level-schema');
  if (manifest?.schemaVersion !== SCHEMA_VERSION) issues.push('schema-version');
  if (manifest?.kind !== KIND) issues.push('kind');
  if (manifest?.homepageFormalToolDelta !== 0) issues.push('homepage-formal-tool-delta');
  if (!sortedEqual(Array.isArray(manifest?.governedToolKeys) ? manifest.governedToolKeys : [], EXPECTED_TOOL_KEYS)) issues.push('governed-tool-keys');
  if (!hasExactKeys(manifest?.releaseEvidence, ['schemaVersion', 'scope', 'requiredAttachments', 'requiredArtifacts'])
    || manifest?.releaseEvidence?.schemaVersion !== 27
    || manifest?.releaseEvidence?.scope !== 'rc-stm-supplemental-formal-attachments'
    || manifest?.releaseEvidence?.requiredAttachments !== 3
    || manifest?.releaseEvidence?.requiredArtifacts !== 12) issues.push('release-evidence-contract');

  const groups = Array.isArray(manifest?.groups) ? manifest.groups : [];
  const groupKeys = groups.map(group => group?.key);
  if (!sortedEqual(groupKeys, EXPECTED_GROUP_KEYS)) issues.push('group-keys');
  for (const group of groups) {
    if (!hasExactKeys(group, ['key', 'purpose', 'paths'])
      || typeof group?.purpose !== 'string'
      || !group.purpose.trim()
      || !Array.isArray(group?.paths)
      || group.paths.length === 0) issues.push(`group-schema:${group?.key || '-'}`);
  }

  const allPaths = groups.flatMap(group => Array.isArray(group?.paths) ? group.paths : []);
  const pathSet = new Set(allPaths);
  if (pathSet.size !== allPaths.length) issues.push('duplicate-path');
  if (allPaths.length < 80) issues.push('insufficient-path-coverage');
  for (const relativePath of allPaths) {
    if (!isSafeRelativePath(relativePath)) issues.push(`unsafe-path:${relativePath}`);
    else if (!exists(relativePath)) issues.push(`missing-file:${relativePath}`);
  }
  for (const requiredPath of REQUIRED_GOVERNANCE_PATHS) {
    if (!pathSet.has(requiredPath)) issues.push(`governance-path-not-listed:${requiredPath}`);
  }

  const handoffs = Array.isArray(manifest?.handoffs) ? manifest.handoffs : [];
  const handoffKeys = handoffs.map(handoff => handoff?.key);
  if (!sortedEqual(handoffKeys, Object.keys(EXPECTED_HANDOFF_ANCHORS))) issues.push('handoff-keys');
  for (const handoff of handoffs) {
    if (!hasExactKeys(handoff, ['key', 'summary', 'sourcePaths', 'targetPaths', 'contractPaths'])
      || typeof handoff?.summary !== 'string'
      || !handoff.summary.trim()) issues.push(`handoff-schema:${handoff?.key || '-'}`);
    const fields = ['sourcePaths', 'targetPaths', 'contractPaths'];
    const combined = [];
    for (const field of fields) {
      const paths = Array.isArray(handoff?.[field]) ? handoff[field] : [];
      if (paths.length === 0) issues.push(`handoff-empty:${handoff?.key || '-'}:${field}`);
      for (const relativePath of paths) {
        combined.push(relativePath);
        if (!isSafeRelativePath(relativePath)) issues.push(`handoff-unsafe-path:${handoff?.key || '-'}:${relativePath}`);
        else if (!pathSet.has(relativePath)) issues.push(`handoff-path-not-listed:${handoff?.key || '-'}:${relativePath}`);
      }
    }
    if (new Set(combined).size !== combined.length) issues.push(`handoff-duplicate-path:${handoff?.key || '-'}`);
    const anchors = EXPECTED_HANDOFF_ANCHORS[handoff?.key];
    if (anchors) {
      if (!handoff.sourcePaths?.includes(anchors.source)) issues.push(`handoff-source-anchor:${handoff.key}`);
      if (!handoff.targetPaths?.includes(anchors.target)) issues.push(`handoff-target-anchor:${handoff.key}`);
      if (!handoff.contractPaths?.includes(anchors.contract)) issues.push(`handoff-contract-anchor:${handoff.key}`);
    }
  }

  const entrypoints = Array.isArray(manifest?.entrypoints) ? manifest.entrypoints : [];
  if (!sortedEqual(entrypoints.map(item => item?.key), EXPECTED_TOOL_KEYS)) issues.push('entrypoint-keys');
  const inventoryByKey = new Map((inventory?.rcSupplementalAttachments || []).map(item => [item.key, item]));
  for (const entrypoint of entrypoints) {
    if (!hasExactKeys(entrypoint, ['key', 'parentHref', 'page', 'regression', 'wrapper'])) issues.push(`entrypoint-schema:${entrypoint?.key || '-'}`);
    for (const field of ['page', 'regression', 'wrapper']) {
      if (!pathSet.has(entrypoint?.[field])) issues.push(`entrypoint-path-not-listed:${entrypoint?.key}:${field}`);
    }
    const inventoryItem = inventoryByKey.get(entrypoint?.key);
    if (!inventoryItem || inventoryItem.href !== entrypoint?.parentHref || inventoryItem.sourcePage !== entrypoint?.page) {
      issues.push(`rendered-inventory-mismatch:${entrypoint?.key}`);
    }
    if (isSafeRelativePath(entrypoint?.wrapper) && isSafeRelativePath(entrypoint?.regression)
      && exists(entrypoint.wrapper) && exists(entrypoint.regression)) {
      const wrapperSource = readRelativeText(entrypoint.wrapper);
      if (!wrapperSource.includes(path.posix.basename(entrypoint.regression))) issues.push(`wrapper-regression-mismatch:${entrypoint?.key}`);
    }
  }

  const scanLocalAssets = relativePath => {
    if (!isSafeRelativePath(relativePath) || !exists(relativePath)) return;
    const source = readRelativeText(relativePath);
    const references = [];
    if (/\.html$/i.test(relativePath)) {
      for (const match of source.matchAll(/(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/gi)) references.push(match[1]);
    } else if (/\.js$/i.test(relativePath)) {
      for (const match of source.matchAll(/require\(["'](\.[^"']+)["']\)/g)) references.push(match[1]);
      for (const match of source.matchAll(/require\(path\.resolve\(__dirname,\s*["'](\.[^"']+)["']\)\)/g)) references.push(match[1]);
    }
    for (const reference of references) {
      const absolute = path.resolve(path.dirname(repoFile(repoRoot, relativePath)), reference);
      const dependency = normalizeSlash(path.relative(repoRoot, absolute));
      if (!dependency.startsWith('../') && isSafeRelativePath(dependency) && exists(dependency) && !pathSet.has(dependency)) {
        issues.push(`runtime-dependency-not-listed:${relativePath}:${dependency}`);
      }
    }
  };
  for (const entrypoint of entrypoints) {
    scanLocalAssets(entrypoint?.page);
    scanLocalAssets(entrypoint?.regression);
  }
  for (const groupKey of ['calculation-core', 'observed-format-governance']) {
    const group = groups.find(item => item?.key === groupKey);
    for (const relativePath of group?.paths || []) {
      if (/\.js$/i.test(relativePath)) scanLocalAssets(relativePath);
    }
  }
  for (const relativePath of REQUIRED_GOVERNANCE_PATHS.filter(item => /\.js$/i.test(item))) scanLocalAssets(relativePath);
  for (const relativePath of ADDITIONAL_DEPENDENCY_SCAN_PATHS) {
    if (!pathSet.has(relativePath)) issues.push(`dependency-scan-path-not-listed:${relativePath}`);
    else scanLocalAssets(relativePath);
  }
  return Array.from(new Set(issues));
}

function loadRcStmAtomicChangeSet(repoRoot, manifestPath = MANIFEST_PATH) {
  const root = path.resolve(repoRoot);
  if (!isSafeRelativePath(manifestPath)) throw new Error(`unsafe manifest path: ${manifestPath}`);
  return readJson(repoFile(root, manifestPath));
}

module.exports = {
  SCHEMA_VERSION,
  KIND,
  MANIFEST_PATH,
  INVENTORY_PATH,
  EXPECTED_TOOL_KEYS,
  EXPECTED_GROUP_KEYS,
  REQUIRED_GOVERNANCE_PATHS,
  ADDITIONAL_DEPENDENCY_SCAN_PATHS,
  EXPECTED_HANDOFF_ANCHORS,
  isSafeRelativePath,
  validateRcStmAtomicChangeSet,
  loadRcStmAtomicChangeSet,
};
