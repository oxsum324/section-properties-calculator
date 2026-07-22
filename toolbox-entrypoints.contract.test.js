const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const repoRoot = __dirname;
const toolboxRoot = path.join(repoRoot, '結構工具箱');
const homeJsPath = path.join(toolboxRoot, 'assets/home/home.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(path.join(repoRoot, ...relativePath.split('/'))));
}

function extractConstLiteral(source, name) {
  const prefix = `const ${name} = `;
  const startIndex = source.indexOf(prefix);
  assert.notEqual(startIndex, -1, `home.js missing const ${name}`);
  const valueStart = startIndex + prefix.length;
  const open = source[valueStart];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  assert.ok(close, `const ${name} must start with an array or object literal`);

  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = valueStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      inString = true;
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return source.slice(valueStart, index + 1);
    }
  }

  throw new Error(`unterminated const ${name}`);
}

function evaluateLiteral(literal, label) {
  return vm.runInNewContext(`(${literal})`, {}, { timeout: 1000, filename: label });
}

function extractConstString(source, name) {
  const pattern = new RegExp("const\\s+" + name + "\\s*=\\s*(['\"])(.*?)\\1");
  const match = source.match(pattern);
  assert.ok(match, `home.js missing const ${name}`);
  return match[2];
}

function normalizeSlash(relativePath) {
  return relativePath.replace(/\\/g, '/');
}

function stripHtml(relativePath) {
  return relativePath.replace(/\.html$/i, '');
}

function routeDestinationCandidates(destination) {
  if (!destination.startsWith('/')) return [];
  const clean = destination.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return ['index.html'];
  return [
    clean,
    `${clean}.html`,
    `${clean}/index.html`
  ];
}

function firstExistingRepoFile(candidates) {
  return candidates.find(candidate => fs.existsSync(path.join(repoRoot, ...candidate.split('/'))));
}

function resolveHomeFileHref(href, routeFileMap) {
  const mapped = routeFileMap[href];
  if (mapped) return normalizeSlash(path.relative(repoRoot, path.resolve(toolboxRoot, mapped)));
  if (href.startsWith('/結構工具箱/')) return `結構工具箱/${href.replace(/^\/結構工具箱\//, '')}`;
  if (href.startsWith('/')) return normalizeSlash(path.relative(repoRoot, path.resolve(toolboxRoot, `..${href}`)));
  return normalizeSlash(path.relative(repoRoot, path.resolve(toolboxRoot, href)));
}

function isCleanHomeRoute(href) {
  return href.startsWith('/') && !href.endsWith('.html') && !href.includes('.');
}

function assertDestinationMatchesHtml(route, destination, html) {
  const expectedWithHtml = `/結構工具箱/${html}`;
  const expectedClean = `/結構工具箱/${stripHtml(html)}`;
  assert.ok(
    destination === expectedWithHtml || destination === expectedClean,
    `${route} destination must be ${expectedWithHtml} or ${expectedClean}; got ${destination}`
  );
}

function joinedToolText(tool, fields) {
  return fields
    .flatMap(field => {
      const value = tool[field];
      return Array.isArray(value) ? value : [value];
    })
    .filter(Boolean)
    .join(' ');
}

function assertNonFormalBoundary(tool, rules) {
  assert.ok(tool.output, `${tool.title} non-formal tool needs output boundary`);
  assert.ok(tool.summary, `${tool.title} non-formal tool needs summary boundary`);
  assert.ok(tool.fit, `${tool.title} non-formal tool needs fit boundary`);
  assert.ok(tool.limit, `${tool.title} non-formal tool needs limit boundary`);
  assert.ok(Array.isArray(tool.capabilities) && tool.capabilities.length > 0, `${tool.title} non-formal tool needs capabilities`);
  const capabilityText = joinedToolText(tool, ['capabilities']);
  for (const forbidden of rules.forbiddenCapabilities || []) {
    assert.equal(capabilityText.includes(forbidden), false, `${tool.title} non-formal capability must not claim ${forbidden}`);
  }
  for (const required of rules.requiredCapabilities || []) {
    assert.ok(capabilityText.includes(required), `${tool.title} non-formal capability missing required marker: ${required}`);
  }
  assert.ok(
    rules.limitAny.some(needle => tool.limit.includes(needle)),
    `${tool.title} non-formal limit must include one of: ${rules.limitAny.join(', ')}`
  );
}

const CATEGORICAL_VERSION_RULES = {
  '外部': tool => tool.state === 'external',
  '服務型': tool => tool.state === 'service',
  '舊版': tool => tool.state === 'legacy',
  '新版': tool => tool.state === 'formal'
};

function normalizeVersion(value) {
  const match = String(value || '').trim().match(/^v?\s*(\d+(?:\.\d+)*)$/i);
  return match ? `V${match[1]}` : null;
}

function collectHtmlVersionHits(source) {
  const hits = [];
  const addHit = (label, value) => {
    const version = normalizeVersion(value);
    if (version) hits.push({ label, version });
  };

  for (const match of source.matchAll(/\b(APP_VERSION|TOOL_VERSION)\s*=\s*['\"]\s*(v?\d+(?:\.\d+)*)\s*['\"]/gi)) {
    addHit(match[1], match[2]);
  }

  for (const match of source.matchAll(/<(title|h1)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = match[2].replace(/<[^>]+>/g, ' ');
    for (const versionMatch of text.matchAll(/\bV\s*(\d+(?:\.\d+)*)\b/gi)) {
      addHit(match[1].toLowerCase(), versionMatch[1]);
    }
  }

  for (const match of source.matchAll(/\b(toolVersion|appVersion)\s*:\s*['\"]\s*(v?\d+(?:\.\d+)*)\s*['\"]/gi)) {
    addHit(match[1], match[2]);
  }

  for (const match of source.matchAll(/<(meta)\b[^>]*(?:name|property)=['\"][^'\"]*version[^'\"]*['\"][^>]*>/gi)) {
    const contentMatch = match[0].match(/\bcontent=['\"]\s*(v?\d+(?:\.\d+)*)\s*['\"]/i);
    if (contentMatch) addHit('meta version', contentMatch[1]);
  }

  for (const match of source.matchAll(/<([a-z][\w-]*)\b[^>]*class=['\"][^'\"]*(?:badge-v|version)[^'\"]*['\"][^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = match[2].replace(/<[^>]+>/g, ' ');
    const versionMatch = text.match(/\bV\s*(\d+(?:\.\d+)*)\b/i);
    if (versionMatch) addHit('visible version badge', versionMatch[1]);
  }

  for (const match of source.matchAll(/\b(outputSource|tool)\s*:\s*\{[\s\S]{0,300}?\bversion\s*:\s*['\"]\s*(v?\d+(?:\.\d+)*)\s*['\"]/gi)) {
    addHit(`${match[1]} metadata`, match[2]);
  }

  for (const match of source.matchAll(/工具版本[\s\S]{0,160}?\bV\s*(\d+(?:\.\d+)*)\b/gi)) {
    addHit('report tool version', match[1]);
  }

  return hits;
}

function detectHtmlVersion(source, label = 'HTML') {
  const hits = collectHtmlVersionHits(source);
  const versions = [...new Set(hits.map(hit => hit.version))];
  assert.ok(
    versions.length <= 1,
    `${label} has inconsistent tool versions: ${hits.map(hit => `${hit.label}=${hit.version}`).join(', ')}`
  );
  return versions[0] || null;
}

function assertHomeDate(value, label) {
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(value), `${label} must use YYYY-MM-DD: ${value}`);
  const parsed = new Date(`${value}T00:00:00Z`);
  assert.equal(Number.isNaN(parsed.valueOf()), false, `${label} must be a real date: ${value}`);
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  assert.ok(parsed <= tomorrow, `${label} must not be future dated: ${value}`);
}

function latestCommittedDate(relativeFile) {
  const result = spawnSync('git', ['log', '-1', '--format=%cs', '--', relativeFile], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) return null;
  const value = String(result.stdout || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function hasWorkingTreeChange(relativeFile) {
  const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--', relativeFile], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  });
  return result.status === 0 && String(result.stdout || '').trim().length > 0;
}

assert.equal(
  detectHtmlVersion('<title>QA V1.6</title><h1>QA <span class="version">V1.6</span></h1>', 'version fixture'),
  'V1.6',
  'version fixture accepts one canonical visible version'
);
assert.throws(
  () => detectHtmlVersion('<title>QA V1.6</title><h1>QA <span>V1.0</span></h1>', 'version mismatch fixture'),
  /inconsistent tool versions/,
  'version contract rejects title and H1 drift'
);
assert.throws(
  () => detectHtmlVersion("<title>QA V1.6</title><script>const TOOL_VERSION = '1.6'; const report = { toolVersion: '1.0' };</script>", 'report metadata mismatch fixture'),
  /inconsistent tool versions/,
  'version contract rejects page and report metadata drift'
);

function assertHomeStatusRegion(source, id, label) {
  const match = source.match(new RegExp(`<div\\s+[^>]*id="${id}"[^>]*>`));
  assert.ok(match, `${label} status region exists`);
  const tag = match[0];
  assert.ok(tag.includes('role="status"'), `${label} status region exposes role=status`);
  assert.ok(tag.includes('aria-live="polite"'), `${label} status region uses polite live updates`);
  assert.ok(tag.includes('aria-atomic="true"'), `${label} status region updates atomically`);
}

function extractStagingPaths(source) {
  const paths = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.trimStart().startsWith('git add')) continue;
    const tokens = [...line.matchAll(/"([^"]+)"|(\S+)/g)].map(match => match[1] || match[2]);
    for (const token of tokens.slice(2)) {
      if (!token || token === '--' || token === '-A' || token.startsWith('-')) continue;
      paths.push(normalizeSlash(token));
    }
  }
  return [...new Set(paths)].sort();
}

function assertStagingPathIsUsable(relativePath) {
  const absolutePath = path.join(repoRoot, ...relativePath.split('/'));
  assert.ok(fs.existsSync(absolutePath), `STAGING_GROUPS path must exist in checkout: ${relativePath}`);
}

function hasUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function containsNonAscii(buffer) {
  return buffer.some(byte => byte >= 0x80);
}

function assertPowerShellEncoding(relativePath) {
  if (!/\.ps1$/i.test(relativePath)) return;
  const absolutePath = path.join(repoRoot, ...relativePath.split('/'));
  const bytes = fs.readFileSync(absolutePath);
  if (containsNonAscii(bytes)) {
    assert.ok(hasUtf8Bom(bytes), `PowerShell helper with non-ASCII text must use UTF-8 BOM for Windows PowerShell 5.1: ${relativePath}`);
  }
}
function normalizePreflightJsPath(rawPath) {
  const cleaned = normalizeSlash(String(rawPath || '')).replace(/^\.\//, '');
  if (!cleaned || cleaned.includes('$')) return null;
  const repoCandidate = path.join(repoRoot, ...cleaned.split('/'));
  if (fs.existsSync(repoCandidate)) return cleaned;
  const toolboxCandidate = path.join(toolboxRoot, ...cleaned.split('/'));
  if (fs.existsSync(toolboxCandidate)) {
    return normalizeSlash(path.relative(repoRoot, toolboxCandidate));
  }
  return cleaned;
}

function extractPreflightRunnableJsPaths(source) {
  const matches = source.matchAll(/[.$\w\u4e00-\u9fff\\/-]+\.(?:test|run)\.js/g);
  return [...new Set([...matches]
    .map(match => normalizePreflightJsPath(match[0]))
    .filter(Boolean))].sort();
}

function extractPreflightContractPaths(source) {
  return extractPreflightRunnableJsPaths(source)
    .filter(relativePath => relativePath.endsWith('.contract.test.js'));
}
const ROOT_PREFLIGHT_HELPER_PATHS = new Set([
  'audit-all.ps1',
  'platform-audit-preflight.ps1',
  'preflight-tools.ps1',
  'refresh-platform-status.ps1',
  'run-audit-all-loop.bat',
  'run-audit-all.bat',
  'run-preflight-tools-quick.bat',
  'run-preflight-tools-release.bat',
  'run-preflight-tools.bat',
  'sync-anchor-deployment.ps1',
  'test-continuous-beam.ps1'
]);

function normalizePreflightHelperPath(rawPath) {
  const cleaned = normalizeSlash(String(rawPath || '')).replace(/^\.\//, '');
  if (!cleaned || cleaned.includes('$') || cleaned.includes(':') || /\s/.test(cleaned)) return null;
  if (!/\.(?:ps1|bat)$/i.test(cleaned)) return null;
  if (!cleaned.includes('/') && !ROOT_PREFLIGHT_HELPER_PATHS.has(cleaned)) return null;
  return cleaned;
}

function extractPreflightHelperPaths(source) {
  const matches = source.matchAll(/['"]([^'"]+\.(?:ps1|bat))['"]/gi);
  return [...new Set([...matches]
    .map(match => normalizePreflightHelperPath(match[1]))
    .filter(Boolean))].sort();
}
const homeSource = readText(homeJsPath);
const homeIndex = readText(path.join(toolboxRoot, 'index.html'));
const homeTools = evaluateLiteral(extractConstLiteral(homeSource, 'tools'), 'home-tools');
const homeToolUpdates = evaluateLiteral(extractConstLiteral(homeSource, 'HOME_TOOL_UPDATES'), 'home-tool-updates');
const homeToolUpdateDependencies = evaluateLiteral(extractConstLiteral(homeSource, 'HOME_TOOL_UPDATE_DEPENDENCIES'), 'home-tool-update-dependencies');
const toolStates = evaluateLiteral(extractConstLiteral(homeSource, 'toolStates'), 'tool-states');
const stateBoundaryRules = evaluateLiteral(extractConstLiteral(homeSource, 'stateBoundaryRules'), 'state-boundary-rules');
const governanceSources = evaluateLiteral(extractConstLiteral(homeSource, 'governanceSources'), 'governance-sources');
const reportReadinessOverview = evaluateLiteral(extractConstLiteral(homeSource, 'reportReadinessOverview'), 'report-readiness-overview');
const reportReadinessStatusSnapshot = readJson('結構工具箱/assets/status/report-readiness-status.json');
const preflightStatusSnapshot = readJson('結構工具箱/assets/status/preflight-summary.json');
const routeFileMap = evaluateLiteral(extractConstLiteral(homeSource, 'routeFileMap'), 'route-file-map');
const EXPECTED_GOVERNANCE_SOURCE_KEYS = {
  'formal-tools': {
    preflightKeys: ['formal-traceability-contract', 'formal-tools-static'],
    fullPreflightKeys: ['formal-browser-smoke']
  },
  'rc-audit': {
    preflightKeys: ['rc-traceability-contract', 'rc-audit-status', 'rc-column-report-contract', 'rc-shear-wall-report-contract']
  },
  'steel-audit': {
    preflightKeys: ['steel-traceability-contract', 'steel-formal-regression', 'steel-audit-status']
  },
  'anchor-deployment': {
    preflightKeys: ['anchor-traceability-contract', 'anchor-route', 'anchor-report-contract'],
    fullPreflightKeys: ['anchor-verify']
  },
  'stone-v2': {
    preflightKeys: ['stone-feedback-contract', 'stone-traceability-contract', 'stone-report-contract', 'stone-self-check', 'stone-quick-check']
  },
  'decking-contract': {
    preflightKeys: ['decking-tools-contract', 'decking-traceability-contract', 'decking-report-contract']
  },
  'excavation-service': {
    preflightKeys: ['excavation-launcher', 'excavation-traceability-contract', 'excavation-backend-quick', 'excavation-report-contract'],
    fullPreflightKeys: ['excavation-backend', 'excavation-frontend']
  },
  'continuous-beam': {
    preflightKeys: ['continuous-beam']
  },
  'frame-analysis': {
    preflightKeys: ['frame-analysis-contract']
  },
  'section-tools': {
    preflightKeys: ['section-tools-contract']
  },
  'local-quick-contract': {
    preflightKeys: ['local-quick-tools-static'],
    fullPreflightKeys: ['local-quick-tools-runner']
  }
};
const vercel = readJson('vercel.json');
const formalManifest = readJson('結構工具箱/tools/formal-tools.manifest.json');
const localQuickManifest = readJson('結構工具箱/tools/local-quick-tools.manifest.json');
const readme = readText(path.join(repoRoot, 'README.md'));
const boundaries = readText(path.join(repoRoot, 'TOOL_BOUNDARIES.md'));
const staging = readText(path.join(repoRoot, 'STAGING_GROUPS.md'));
const preflight = readText(path.join(repoRoot, 'preflight-tools.ps1'));
const releaseWrapper = readText(path.join(repoRoot, 'run-preflight-tools-release.bat'));
const auditAll = readText(path.join(repoRoot, 'audit-all.ps1'));
const maturityMatrix = readText(path.join(toolboxRoot, 'tools/tool-maturity-matrix.js'));
const pagesLiveSmoke = readText(path.join(toolboxRoot, 'tools/pages-live-smoke.js'));
const pagesLiveBrowserSmoke = readText(path.join(toolboxRoot, 'tools/pages-live-browser-smoke.js'));
const pagesBrowserRunner = readText(path.join(toolboxRoot, 'tools/run-pages-browser-smoke.sh'));
const pagesArtifactBuilder = readText(path.join(toolboxRoot, 'tools/build-pages-artifact.js'));
const pagesDeploymentManifestBuilder = readText(path.join(toolboxRoot, 'tools/build-pages-deployment-manifest.js'));
const pagesCleanRouteBuilderPath = path.join(toolboxRoot, 'tools/build-pages-clean-routes.js');
const pagesCleanRouteBuilder = readText(pagesCleanRouteBuilderPath);
const pagesDeployWorkflow = readText(path.join(repoRoot, '.github/workflows/pages-deploy.yml'));
const pagesArtifactSmoke = readText(path.join(repoRoot, 'run-pages-artifact-smoke.ps1'));
const anchorSync = readText(path.join(repoRoot, 'sync-anchor-deployment.ps1'));

function assertPagesCleanRouteBuilder() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-clean-routes-contract-'));
  try {
    const destination = path.join(fixtureRoot, '鋼筋混凝土', 'tools', 'column.html');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'index.html'), '<!doctype html><title>root</title>', 'utf8');
    fs.writeFileSync(destination, '<!doctype html><title>RC column</title>', 'utf8');
    const { buildPagesCleanRoutes, normalizeRoutePath } = require(pagesCleanRouteBuilderPath);
    const result = buildPagesCleanRoutes({
      siteRoot: fixtureRoot,
      config: {
        rewrites: [],
        redirects: [
          { source: '/', destination: '/鋼筋混凝土/tools/column' },
          { source: '/rc-column', destination: '/鋼筋混凝土/tools/column' }
        ]
      }
    });
    assert.equal(result.generated.length, 1, 'Pages clean-route builder generates fixture alias');
    assert.equal(result.skipped.length, 1, 'Pages clean-route builder preserves root index');
    const aliasHtml = readText(path.join(fixtureRoot, 'rc-column', 'index.html'));
    assert.ok(aliasHtml.includes('generated-by: build-pages-clean-routes.js'), 'Pages clean-route alias has generated marker');
    assert.ok(aliasHtml.includes('%E9%8B%BC%E7%AD%8B%E6%B7%B7%E5%87%9D%E5%9C%9F/tools/column.html'), 'Pages clean-route alias targets encoded non-ASCII path');
    assert.ok(aliasHtml.includes('window.location.search + window.location.hash'), 'Pages clean-route alias preserves query and hash');
    assert.equal(readText(path.join(fixtureRoot, 'index.html')).includes('root'), true, 'Pages clean-route builder does not replace root index');
    assert.throws(() => normalizeRoutePath('/../private', 'source'), /unsupported route segments/, 'Pages clean-route builder rejects traversal');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

assertPagesCleanRouteBuilder();

assert.equal(vercel.cleanUrls, true, 'Vercel cleanUrls must stay enabled');
assert.ok(Array.isArray(vercel.redirects), 'vercel redirects array');
assert.ok(Array.isArray(vercel.rewrites), 'vercel rewrites array');
assert.ok(Array.isArray(homeTools), 'home tools array');
assert.ok(homeTools.length >= 40, 'home tool count should cover the governed platform');
assert.equal(homeSource.includes('HOME_DATA_UPDATED'), false, 'home cards must not share one fallback update date');
assert.equal(homeToolUpdates.version, 1, 'home tool update catalog version');
assert.equal(homeToolUpdateDependencies.version, 1, 'home tool update dependency catalog version');
assertHomeDate(homeToolUpdates.generatedAt, 'HOME_TOOL_UPDATES generatedAt');
assertHomeDate(homeToolUpdates.releaseVerifiedAt, 'HOME_TOOL_UPDATES releaseVerifiedAt');
assert.equal(typeof homeToolUpdates.source, 'string', 'home tool update catalog source');
assert.ok(homeToolUpdates.source.includes('Git history'), 'home tool update catalog documents content date source');
assert.ok(homeToolUpdates.source.includes('worktree changes'), 'home tool update catalog documents uncommitted content date source');
assert.ok(homeToolUpdates.source.includes('preflight'), 'home tool update catalog documents release verification source');
assert.equal(preflightStatusSnapshot.quick, false, 'tracked homepage preflight snapshot is full mode');
assert.equal(preflightStatusSnapshot.forcePlatformAudit, true, 'tracked homepage preflight snapshot forced platform audit');
assert.equal(preflightStatusSnapshot.forceSlowChecks, true, 'tracked homepage preflight snapshot forced slow checks');
assert.equal(preflightStatusSnapshot.pass, true, 'tracked homepage preflight snapshot passed');
const trackedReleaseDate = String(preflightStatusSnapshot.generatedAt || '').slice(0, 10);
assertHomeDate(trackedReleaseDate, 'tracked homepage release date');
assert.ok(homeToolUpdates.releaseVerifiedAt >= trackedReleaseDate, 'home release verification date must not predate tracked formal release');
assert.ok(homeToolUpdates.generatedAt >= homeToolUpdates.releaseVerifiedAt, 'home tool update catalog must not predate release verification');
assert.deepEqual(
  Object.keys(homeToolUpdates.routes || {}).sort(),
  homeTools.map(tool => tool.href).sort(),
  'home tool update catalog must cover every card exactly once'
);
assert.ok(toolStates.formal, 'home tool states include formal');
for (const stateKey of Object.keys(toolStates).filter(key => key !== 'formal')) {
  assert.ok(stateBoundaryRules[stateKey], `${stateKey} non-formal state has boundary rules`);
  assert.ok(Array.isArray(stateBoundaryRules[stateKey].limitAny), `${stateKey} boundary has limit needles`);
  assert.ok(Array.isArray(stateBoundaryRules[stateKey].forbiddenCapabilities), `${stateKey} boundary has forbidden capabilities`);
}
assert.ok(governanceSources['formal-tools'], 'home governance sources include formal wind/seismic');
assert.ok(governanceSources['rc-audit'], 'home governance sources include RC audit');
assert.ok(governanceSources['steel-audit'], 'home governance sources include steel audit');
assert.ok(governanceSources['anchor-deployment'], 'home governance sources include anchor deployment');
assert.ok(governanceSources['stone-v2'], 'home governance sources include stone V2');
assert.ok(governanceSources['decking-contract'], 'home governance sources include decking contract');
assert.ok(governanceSources['excavation-service'], 'home governance sources include excavation service');
assert.ok(governanceSources['continuous-beam'], 'home governance sources include continuous beam');
assert.ok(governanceSources['frame-analysis'], 'home governance sources include frame analysis');
assert.ok(governanceSources['section-tools'], 'home governance sources include section tools');
assert.ok(governanceSources['local-quick-contract'], 'home governance sources include local quick tools');
assert.equal(governanceSources['formal-tools'].cardTag, '報告邊界', 'formal wind/seismic governance source exposes report boundary chip');
assert.equal(governanceSources['rc-audit'].cardTag, '報告邊界', 'RC governance source exposes report boundary chip');
assert.equal(governanceSources['steel-audit'].cardTag, '報告邊界', 'steel governance source exposes report boundary chip');
assert.equal(governanceSources['anchor-deployment'].cardTag, '輸出邊界', 'anchor governance source exposes output boundary chip');
assert.equal(governanceSources['stone-v2'].cardTag, 'Word/PDF 邊界', 'stone governance source exposes report boundary chip');
assert.equal(governanceSources['decking-contract'].cardTag, 'Word 邊界', 'decking governance source exposes Word boundary chip');
assert.equal(governanceSources['excavation-service'].cardTag, 'PDF/DOCX 邊界', 'excavation governance source exposes PDF/DOCX boundary chip');
assert.equal(governanceSources['continuous-beam'].cardTag, '計算書邊界', 'continuous beam governance source exposes calculation-book boundary chip');
assert.equal(governanceSources['frame-analysis'].cardTag, '計算書邊界', 'frame analysis governance source exposes calculation-book boundary chip');
assert.equal(governanceSources['section-tools'].cardTag, '報表邊界', 'section tools governance source exposes report boundary chip');
assert.equal(governanceSources['local-quick-contract'].cardTag, 'JSON/計算書/文字 邊界', 'local quick governance source exposes JSON/calculation-book/text boundary chip');
for (const [sourceKey, source] of Object.entries(governanceSources)) {
  assert.ok(Array.isArray(source.preflightKeys) && source.preflightKeys.length > 0, `${sourceKey} governance source preflight keys`);
  for (const preflightKey of source.preflightKeys) {
    assert.ok(preflight.includes(`key = "${preflightKey}"`), `${sourceKey} preflight key missing: ${preflightKey}`);
  }
  for (const preflightKey of source.fullPreflightKeys || []) {
    assert.ok(preflight.includes(`key = "${preflightKey}"`), `${sourceKey} full preflight key missing: ${preflightKey}`);
  }
}
for (const [sourceKey, expected] of Object.entries(EXPECTED_GOVERNANCE_SOURCE_KEYS)) {
  const source = governanceSources[sourceKey];
  assert.ok(source, `expected governance source missing: ${sourceKey}`);
  assert.deepEqual(source.preflightKeys || [], expected.preflightKeys || [], `${sourceKey} preflight keys drifted`);
  assert.deepEqual(source.fullPreflightKeys || [], expected.fullPreflightKeys || [], `${sourceKey} full preflight keys drifted`);
}
assert.ok(homeIndex.includes('id="reportReadinessStatus"'), 'home index exposes report readiness status card');
assertHomeStatusRegion(homeIndex, 'platformStatus', 'home platform');
assertHomeStatusRegion(homeIndex, 'preflightStatus', 'home preflight');
assertHomeStatusRegion(homeIndex, 'reportReadinessStatus', 'home report readiness');
assert.ok(homeSource.includes('function renderReportReadinessStatus('), 'home.js renders report readiness status card');
assert.ok(homeSource.includes('function renderStaticStatusCard('), 'home.js exposes reusable static status card renderer');
assert.equal(reportReadinessOverview.badge, '頁面專用', 'report readiness overview uses page-only badge');
assert.equal(reportReadinessOverview.label, '報告閱讀狀態總覽', 'report readiness overview label');
assert.ok(reportReadinessOverview.summary.includes('優先建議報告閱讀狀態'), 'report readiness overview summary mentions page-only readiness');
assert.ok(reportReadinessOverview.summary.includes('不會寫入計算書、列印或 PDF'), 'report readiness overview summary keeps export boundary');
assert.ok(reportReadinessOverview.compactSummary.includes('頁面診斷明細不進計算書') && reportReadinessOverview.compactSummary.includes('兩者皆可列印'), 'report readiness overview keeps compact page-only and approval summary');
assert.ok(reportReadinessOverview.reportTextSmokeSummary.includes('正式計算書可讀文字抽檢'), 'report readiness overview keeps report text summary');
assert.ok(Array.isArray(reportReadinessOverview.details) && reportReadinessOverview.details.length >= 2, 'report readiness overview details exist');
assert.ok(reportReadinessOverview.details.join(' ').includes('RC 正式工具'), 'report readiness overview covers RC family');
assert.ok(reportReadinessOverview.details.join(' ').includes('鋼構正式工具'), 'report readiness overview covers steel family');
assert.ok(reportReadinessOverview.details.join(' ').includes('石材'), 'report readiness overview covers stone family');
assert.ok(reportReadinessOverview.details.join(' ').includes('覆工板'), 'report readiness overview covers decking family');
assert.ok(reportReadinessOverview.details.join(' ').includes('正式計算書可讀文字抽檢') && reportReadinessOverview.details.join(' ').includes('完整交付前檢查'), 'report readiness overview keeps report text runtime evidence boundary');
assert.ok(reportReadinessOverview.reportTextSmokeScope.includes('風力 / 地震正式工具') && reportReadinessOverview.reportTextSmokeScope.includes('局部快算'), 'report readiness overview names report text scope');
assert.ok(reportReadinessOverview.renderedDeliveryEvidenceSummary.includes('實際交付物渲染') && reportReadinessOverview.renderedDeliveryEvidenceSummary.includes('PDF、DOCX 或 workbook 成品'), 'report readiness overview names rendered delivery evidence');
assert.ok(Array.isArray(reportReadinessOverview.meta) && reportReadinessOverview.meta.length === 4, 'report readiness overview exposes compact metrics');
assert.ok(reportReadinessOverview.details.join(' ').includes('JSON/計算書/文字 邊界'), 'report readiness overview covers local quick text boundary chip');
assert.ok(reportReadinessOverview.details.join(' ').includes('正式交付仍以計算書、Word、PDF、workbook 或下載端點輸出為準'), 'report readiness overview keeps delivery boundary');
assert.equal(reportReadinessStatusSnapshot.kind, 'report-readiness-status', 'tracked report readiness snapshot kind');
assert.ok(reportReadinessStatusSnapshot.summary.includes('優先建議報告閱讀狀態'), 'tracked report readiness snapshot summary mentions page-only readiness');
assert.ok(reportReadinessStatusSnapshot.summary.includes('不會寫入計算書、列印或 PDF'), 'tracked report readiness snapshot summary keeps export boundary');
assert.equal(reportReadinessStatusSnapshot.reportTextSmokeComplete, reportReadinessStatusSnapshot.reportTextSmokeRequired, 'tracked report readiness snapshot report text coverage complete');
assert.equal(reportReadinessStatusSnapshot.reportTextSmokeIssueCount, 0, 'tracked report readiness snapshot report text issues empty');
assert.equal(reportReadinessStatusSnapshot.reportTextSmokeEvidenceComplete, reportReadinessStatusSnapshot.reportTextSmokeEvidenceRequired, 'tracked report readiness snapshot report text runtime evidence complete');
assert.equal(reportReadinessStatusSnapshot.reportTextSmokeEvidenceIssueCount, 0, 'tracked report readiness snapshot report text runtime evidence issues empty');
assert.equal(reportReadinessStatusSnapshot.reportTextSmokeEvidenceRunId, reportReadinessStatusSnapshot.runId, 'tracked report readiness snapshot report text runtime evidence runId');
assert.deepEqual(reportReadinessStatusSnapshot.reportTextSmokeEvidenceUnmappedFamilies, [], 'tracked report readiness snapshot maps every report text family to runtime evidence');
assert.ok(reportReadinessStatusSnapshot.reportTextSmokeEvidenceGates.every(gate => gate.pass && gate.complete === gate.required), 'tracked report readiness snapshot report text runtime evidence gates pass');
assert.ok(reportReadinessStatusSnapshot.reportTextSmokeScope.includes('風力 / 地震正式工具') && reportReadinessStatusSnapshot.reportTextSmokeScope.includes('局部快算'), 'tracked report readiness snapshot names report text scope');
assert.ok(reportReadinessStatusSnapshot.reportTextSmokeScope.includes('矩陣外工具家族'), 'tracked report readiness snapshot keeps other-family report boundary');
assert.equal(reportReadinessStatusSnapshot.renderedDeliveryEvidenceRequired, 31, 'tracked report readiness snapshot rendered delivery covers every formal homepage tool');
assert.equal(reportReadinessStatusSnapshot.renderedDeliveryEvidenceComplete, reportReadinessStatusSnapshot.renderedDeliveryEvidenceRequired, 'tracked report readiness snapshot rendered delivery complete');
assert.equal(reportReadinessStatusSnapshot.renderedDeliveryEvidenceIssueCount, 0, 'tracked report readiness snapshot rendered delivery issues empty');
assert.match(reportReadinessStatusSnapshot.renderedDeliveryEvidenceRunId, /^\d{8}-\d{6}$/, 'tracked report readiness snapshot rendered delivery runId');
assert.ok(Array.isArray(reportReadinessStatusSnapshot.renderedDeliveryEvidenceFamilies) && reportReadinessStatusSnapshot.renderedDeliveryEvidenceFamilies.length >= 6, 'tracked report readiness snapshot rendered delivery families');
assert.equal(reportReadinessStatusSnapshot.renderedDeliveryEvidenceFamilies.reduce((sum, family) => sum + family.complete, 0), reportReadinessStatusSnapshot.renderedDeliveryEvidenceComplete, 'tracked report readiness snapshot rendered delivery family totals');
assert.ok(reportReadinessStatusSnapshot.renderedDeliveryEvidenceSummary.includes('實際交付物渲染'), 'tracked report readiness snapshot rendered delivery summary');
assert.equal(reportReadinessStatusSnapshot.renderedDeliveryEvidenceSourcePath, `output/preflight/history/${reportReadinessStatusSnapshot.renderedDeliveryEvidenceRunId}/rendered-delivery-evidence/rendered-delivery-evidence-summary.json`, 'tracked report readiness snapshot rendered delivery source path');
assert.match(reportReadinessStatusSnapshot.renderedDeliveryEvidenceSourceHash, /^[0-9a-f]{64}$/i, 'tracked report readiness snapshot rendered delivery source hash');
if (Number.isInteger(reportReadinessStatusSnapshot.supplementalDeliveryEvidenceRequired)) {
  assert.ok([1, 2].includes(reportReadinessStatusSnapshot.supplementalDeliveryEvidenceRequired), 'tracked report readiness snapshot supplemental delivery uses a supported transition count');
  assert.equal(reportReadinessStatusSnapshot.supplementalDeliveryEvidenceComplete, reportReadinessStatusSnapshot.supplementalDeliveryEvidenceRequired, 'tracked report readiness snapshot supplemental delivery complete');
  assert.equal(reportReadinessStatusSnapshot.supplementalDeliveryEvidenceIssueCount, 0, 'tracked report readiness snapshot supplemental delivery issues empty');
  assert.ok(reportReadinessStatusSnapshot.supplementalDeliveryEvidenceFamilies.some(item => item.family === 'excavation-formal' && item.complete === 1), 'tracked report readiness snapshot supplemental delivery keeps excavation service coverage');
  if (reportReadinessStatusSnapshot.supplementalDeliveryEvidenceRequired === 2) {
    assert.deepEqual(reportReadinessStatusSnapshot.supplementalDeliveryEvidenceFamilies, [{ family: 'excavation-formal', complete: 1 }, { family: 'seismic-report', complete: 1 }], 'tracked report readiness snapshot supplemental delivery covers report and service families');
    assert.ok(reportReadinessStatusSnapshot.supplementalDeliveryEvidenceSummary.includes('補充報告 / 服務實際交付物渲染'), 'tracked report readiness snapshot supplemental delivery summary');
  }
}
assert.ok(reportReadinessStatusSnapshot.details.join(' ').includes('正式計算書可讀文字抽檢'), 'tracked report readiness snapshot exposes report text coverage');
assert.ok(reportReadinessStatusSnapshot.details.join(' ').includes('正式放行實際交付物渲染佐證'), 'tracked report readiness snapshot exposes actual rendered delivery coverage');
assert.ok(reportReadinessStatusSnapshot.details.join(' ').includes('瀏覽器 smoke 證據'), 'tracked report readiness snapshot exposes report text runtime evidence');
assert.ok(reportReadinessStatusSnapshot.details.join(' ').includes('JSON/計算書/文字 邊界'), 'tracked report readiness snapshot covers local quick text boundary chip');
assert.ok(reportReadinessStatusSnapshot.details.join(' ').includes('正式交付仍以計算書、Word、PDF、workbook 或下載端點輸出為準'), 'tracked report readiness snapshot keeps delivery boundary');
assert.equal(reportReadinessStatusSnapshot.details.join(' ').includes('JSON/計算書 邊界'), false, 'tracked report readiness snapshot rejects stale local quick boundary chip');
assert.ok(maturityMatrix.includes('formal-tools.manifest.json'), 'maturity matrix reads formal manifest');
assert.ok(maturityMatrix.includes('local-quick-tools.manifest.json'), 'maturity matrix reads local quick manifest');
assert.ok(maturityMatrix.includes('homeEntry'), 'maturity matrix checks home entries');
assert.equal(/fetch\(\s*[`'"]\/output\//.test(homeSource), false, 'home status fetches must not use domain-root /output paths');
assert.ok(homeSource.includes("homeAssetHref('assets/status/platform-status.json')"), 'home status fetch uses tracked platform status asset');
assert.ok(homeSource.includes("homeAssetHref('assets/status/preflight-summary.json')"), 'home status fetch uses tracked preflight status asset');
assert.ok(homeSource.includes("homeAssetHref('assets/status/report-readiness-status.json')"), 'home status fetch uses tracked report readiness asset');
assert.ok(homeSource.includes("payload.kind === 'report-readiness-status'"), 'home status validates report readiness snapshot kind');
assert.ok(homeSource.includes("dataset.statusSource = payload && payload.kind === 'report-readiness-status' ? 'snapshot' : 'static'"), 'home status exposes report readiness snapshot source flag');
assert.ok(homeSource.includes('完整檢查'), 'home status exposes full preflight label');
assert.ok(homeSource.includes('快速檢查'), 'home status exposes quick preflight label');
assert.ok(homeSource.includes('正式放行'), 'home status exposes release preflight label');
assert.ok(homeSource.includes('正式交付請以完整檢查或正式放行結果為準'), 'home status explains full-run evidence boundary');
assert.ok(fs.existsSync(path.join(toolboxRoot, 'assets/status/platform-status.json')), 'homepage platform status asset exists');
assert.ok(fs.existsSync(path.join(toolboxRoot, 'assets/status/preflight-summary.json')), 'homepage preflight status asset exists');
assert.ok(fs.existsSync(path.join(toolboxRoot, 'assets/status/report-readiness-status.json')), 'homepage report readiness status asset exists');
assert.ok(staging.includes('## 目前狀態'), 'STAGING_GROUPS records current release status');
assert.ok(staging.includes('不是目前待提交清單'), 'STAGING_GROUPS distinguishes release ledger from active worktree queue');
assert.ok(staging.includes('最新 HEAD 與遠端同步狀態以 `git status -sb`、`git log -1 --oneline` 為準'), 'STAGING_GROUPS avoids self-staling latest HEAD');
assert.ok(staging.includes('本文件不硬編碼自我引用的最新 commit hash'), 'STAGING_GROUPS documents why latest HEAD is not hard-coded');
assert.ok(staging.includes('狀態快照證據基準：以 tracked `結構工具箱/assets/status/preflight-summary.json` 與 `report-readiness-status.json`'), 'STAGING_GROUPS names tracked status snapshots as evidence source');
assert.ok(staging.includes('承載提交由 `git log -1 --oneline` 查詢，不在本 ledger 重複硬編碼'), 'STAGING_GROUPS avoids duplicated status commit ids');
assert.equal(/HEAD\s+`[0-9a-f]{7,40}`/.test(staging), false, 'STAGING_GROUPS must not hard-code a self-staling current HEAD');
assert.ok(staging.includes('4944fa7 Harden page-only report readiness release evidence'), 'STAGING_GROUPS records page-only readiness release commit');
assert.ok(staging.includes('b1a534e Expand report boundary governance across tools'), 'STAGING_GROUPS records cross-family report governance commit');
assert.ok(staging.includes('d530816 Refresh anchor deployment assets'), 'STAGING_GROUPS records anchor deploy asset commit');
assert.ok(staging.includes('60f3c18 Update release status snapshots'), 'STAGING_GROUPS records status snapshot commit');
assert.ok(staging.includes('2029758 Enforce formal attachment boundaries and rendered release evidence'), 'STAGING_GROUPS records rendered release evidence commit');
assert.ok(staging.includes('當前 `runId` 直接讀取 JSON，不在本 ledger 複製'), 'STAGING_GROUPS reads current release runId from tracked JSON');
assert.ok(staging.includes('ForcePlatformAudit=true') && staging.includes('ForceSlowChecks=true'), 'STAGING_GROUPS records release force flags');
assert.ok(staging.includes('gh run list --workflow "Pages deploy" --limit 1'), 'STAGING_GROUPS queries the current Pages deploy evidence');
assert.ok(staging.includes('workflow run ID 不在本 ledger 硬編碼'), 'STAGING_GROUPS avoids self-staling Pages run ids');
assert.ok(staging.includes('最新 `Pages deploy` 必須為 completed/success'), 'STAGING_GROUPS requires current Pages deploy success');
assert.ok(staging.includes('page-only boundary `4/4`') && staging.includes('issue `0`'), 'STAGING_GROUPS records page-only boundary health');
assert.ok(staging.includes('首頁正式工具實際交付物渲染 `31/31`'), 'STAGING_GROUPS records homepage rendered delivery evidence health');
assert.ok(staging.includes('補充報告 / 服務成品 `2/2`'), 'STAGING_GROUPS records supplemental report and service delivery evidence health');
assert.ok(staging.includes('不得附入計算書、列印輸出或 PDF'), 'STAGING_GROUPS keeps report readiness page-only boundary');
assert.ok(staging.includes('下次同類變更的分包 playbook'), 'STAGING_GROUPS keeps future staging playbook');
assert.equal(staging.includes('本檔把目前工作樹切成可審查的提交包'), false, 'STAGING_GROUPS must not describe landed work as the current worktree');
assert.equal(staging.includes('適合最先提交。這包只處理'), false, 'STAGING_GROUPS must not present landed A0 as an active first commit');
assert.ok(staging.includes('## A0. 報告閱讀狀態與 Pages release governance'), 'STAGING_GROUPS defines page-only release governance playbook');
assert.ok(staging.includes('下次同類變更低風險可整檔 staging 的檔案'), 'STAGING_GROUPS A0 separates low-risk whole-file staging for future changes');
assert.ok(staging.includes('下次同類變更需要人工 hunk review'), 'STAGING_GROUPS A0 marks broad docs/contracts for future hunk review');
assert.ok(staging.includes('Harden page-only report readiness release evidence'), 'STAGING_GROUPS keeps a focused A0 commit message pattern');
assert.ok(staging.includes('run-pages-artifact-smoke.ps1'), 'STAGING_GROUPS A0 includes local Pages artifact smoke wrapper');
assert.ok(staging.includes('結構工具箱/assets/status/report-readiness-status.json'), 'STAGING_GROUPS A0 includes report readiness status snapshot');
assert.ok(staging.includes('結構工具箱/assets/status/preflight-summary.json'), 'STAGING_GROUPS A0 includes preflight status snapshot');
assert.ok(staging.includes('結構工具箱/assets/status/platform-status.json'), 'STAGING_GROUPS A0 includes platform status snapshot');
assert.ok(staging.includes('README.md') && staging.includes('需只挑 Pages / report-readiness 相關 hunk'), 'STAGING_GROUPS A0 keeps README hunk review scoped');
assert.ok(staging.includes('toolbox-entrypoints.contract.test.js') && staging.includes('必須同步 staging 它引用的 contract / preflight / home source 變更'), 'STAGING_GROUPS A0 warns against isolated broad contract staging');
assert.ok(staging.includes('下次不要混入本包'), 'STAGING_GROUPS A0 documents excluded neighboring work');
assert.ok(staging.includes('anchor/assets/') && staging.includes('改放 B 包'), 'STAGING_GROUPS A0 keeps anchor deploy assets out of the first package');
assert.ok(maturityMatrix.includes('writeHomepageStatusSnapshots'), 'maturity matrix publishes homepage status snapshots');
assert.ok(maturityMatrix.includes('preserveHomepageStatus'), 'maturity matrix supports preserving tracked homepage status snapshots');
assert.ok(maturityMatrix.includes('--preserve-homepage-status'), 'maturity matrix exposes preserve homepage status CLI flag');
assert.ok(preflight.includes('$maturityMatrixArgs += "--preserve-homepage-status"'), 'quick preflight preserves homepage status on first matrix refresh');
assert.ok(preflight.includes('$postSummaryMatrixArgs += "--preserve-homepage-status"'), 'quick preflight preserves homepage status on final matrix refresh');
assert.ok(readme.includes('--preserve-homepage-status'), 'README documents quick preflight homepage status preservation');
assert.ok(boundaries.includes('--preserve-homepage-status'), 'TOOL_BOUNDARIES documents quick preflight homepage status preservation');
assert.ok(staging.includes('--preserve-homepage-status'), 'STAGING_GROUPS documents quick preflight homepage status preservation');
assert.ok(pagesLiveSmoke.includes('assets/status/platform-status.json'), 'Pages live smoke checks platform status asset');
assert.ok(pagesCleanRouteBuilder.includes('buildPagesCleanRoutes'), 'Pages clean-route builder exposes a testable build function');
assert.ok(pagesCleanRouteBuilder.includes('window.location.replace(target)'), 'Pages clean-route builder emits a browser redirect');
assert.ok(pagesCleanRouteBuilder.includes('window.location.search + window.location.hash'), 'Pages clean-route builder preserves query and hash');
assert.ok(pagesLiveSmoke.includes('assets/status/preflight-summary.json'), 'Pages live smoke checks preflight status asset');
assert.ok(pagesLiveSmoke.includes('assets/status/report-readiness-status.json'), 'Pages live smoke checks report readiness status asset');
assert.ok(pagesLiveSmoke.includes("compactSummary || '').includes('頁面診斷明細不進計算書'"), 'Pages live smoke accepts the canonical compact page-only wording');
assert.ok(pagesLiveSmoke.includes("compactSummary || '').includes('兩者皆可列印'"), 'Pages live smoke accepts the canonical printable approval wording');
assert.ok(pagesLiveSmoke.includes('reportReadinessStatus.runId, preflightStatus.runId'), 'Pages live smoke aligns report readiness runId with public preflight status');
assert.ok(pagesLiveSmoke.includes('reportReadinessStatus.preflightStatusSourcePath, preflightStatus.sourcePath'), 'Pages live smoke aligns report readiness source with public preflight status');
assert.ok(pagesLiveSmoke.includes('--allow-local-output'), 'Pages live smoke supports local repo-root preview override');
assert.ok(pagesLiveSmoke.includes('PUBLIC_ROUTE_SAMPLES'), 'Pages live smoke has public route sample inventory');
assert.ok(pagesLiveSmoke.includes('assertPublicRouteSamples'), 'Pages live smoke checks representative public routes');
assert.ok(pagesLiveSmoke.includes("{ path: 'anchor/', needles: ['錨栓檢討工具'], checkAssets: true }"), 'Pages live smoke checks anchor application assets');
assert.ok(pagesLiveSmoke.includes('async function assertPublicAssets'), 'Pages live smoke has public asset availability gate');
assert.ok(pagesLiveSmoke.includes('response.arrayBuffer()'), 'Pages live smoke rejects empty application assets');
assert.ok(pagesLiveSmoke.includes("'../結構工具箱/assets/status/platform-status.json'"), 'Pages live smoke checks RC public status routing');
assert.ok(pagesLiveSmoke.includes('CLEAN_ROUTE_SAMPLES'), 'Pages live smoke has clean-route sample inventory');
assert.ok(pagesLiveSmoke.includes('assertCleanRouteSamples'), 'Pages live smoke checks generated clean routes');
assert.ok(pagesLiveSmoke.includes('homeCleanRoutes'), 'Pages live smoke derives the full clean-route inventory from public home.js');
assert.ok(pagesLiveSmoke.includes('assertAllHomeCleanRoutes'), 'Pages live smoke checks every homepage clean route');
assert.ok(pagesLiveSmoke.includes("source: '/rc-column'"), 'Pages live smoke samples the RC column clean route');
assert.ok(pagesLiveSmoke.includes('assertNoLocalWorkspaceLeak'), 'Pages live smoke rejects local workspace path leaks from public pages');
assert.ok(anchorSync.includes('$fullResolved.Substring($basePrefix.Length)'), 'anchor sync fingerprint uses runtime-stable relative paths');
assert.ok(preflight.includes('$fullResolved.Substring($basePrefix.Length)'), 'anchor preflight fingerprint uses the same runtime-stable relative paths');
assert.ok(anchorSync.includes('[System.StringComparer]::Ordinal'), 'anchor sync fingerprint uses runtime-stable ordinal record sorting');
assert.ok(preflight.includes('[System.StringComparer]::Ordinal'), 'anchor preflight fingerprint uses the same runtime-stable ordinal record sorting');
assert.equal(anchorSync.includes('MakeRelativeUri'), false, 'anchor sync fingerprint avoids runtime-dependent URI relative paths');
assert.equal(preflight.includes('$baseUri.MakeRelativeUri($fullUri)'), false, 'anchor preflight fingerprint avoids runtime-dependent URI relative paths');
assert.ok(pagesLiveSmoke.includes('鋼筋混凝土/tools/beam.html'), 'Pages live smoke samples RC tool page');
assert.ok(pagesLiveSmoke.includes('鋼構工具/steel-beam-formal.html'), 'Pages live smoke samples steel formal page');
assert.ok(pagesLiveSmoke.includes('鋼構工具/plate-check.html'), 'Pages live smoke samples steel plate formal page');
assert.ok(pagesLiveSmoke.includes('鋼構工具/steel-column-formal.html'), 'Pages live smoke samples steel column formal page');
assert.ok(pagesLiveSmoke.includes('鋼構工具/app.js'), 'Pages live smoke samples the steel public audit-status router');
assert.ok(pagesLiveSmoke.includes('../結構工具箱/assets/status/platform-status.json'), 'Pages live smoke checks the steel public platform-status source');
assert.ok(pagesLiveSmoke.includes('石材固定/石材計算書產生器_規範版V2.html'), 'Pages live smoke samples stone V2 page');
assert.ok(pagesLiveSmoke.includes('開挖擋土支撐/index.html'), 'Pages live smoke samples excavation launcher');
assert.ok(pagesLiveSmoke.includes('pages live smoke OK'), 'Pages live smoke reports success');
assert.ok(pagesLiveSmoke.includes('assertPrivateBoundary'), 'Pages live smoke checks private artifact boundary');
assert.ok(pagesLiveSmoke.includes('CONTEXT.md'), 'Pages live smoke blocks context glossary publication');
assert.ok(pagesLiveSmoke.includes('docs/adr/0001-page-only-report-readiness.md'), 'Pages live smoke blocks ADR publication');
assert.ok(readme.includes('CONTEXT.md') && readme.includes('docs/adr/'), 'README documents context and ADR private boundary');
assert.ok(boundaries.includes('CONTEXT.md') && boundaries.includes('docs/adr/'), 'TOOL_BOUNDARIES documents context and ADR private boundary');
assert.ok(pagesLiveSmoke.includes('preflight-tools.ps1'), 'Pages live smoke blocks preflight script publication');
assert.ok(pagesLiveSmoke.includes('toolbox-entrypoints.contract.test.js'), 'Pages live smoke blocks contract publication');
assert.ok(pagesLiveSmoke.includes('結構工具箱/tools/build-pages-clean-routes.js'), 'Pages live smoke blocks clean-route builder publication');
assert.ok(pagesLiveSmoke.includes('結構工具箱/tools/pages-live-browser-smoke.js'), 'Pages live smoke blocks browser smoke source publication');
assert.ok(pagesLiveSmoke.includes('結構工具箱/tools/run-pages-browser-smoke.sh'), 'Pages live smoke blocks browser smoke runner publication');
assert.ok(pagesLiveSmoke.includes('結構工具箱/tools/build-pages-artifact.js'), 'Pages live smoke blocks shared artifact builder publication');
assert.ok(pagesLiveSmoke.includes('結構工具箱/tools/build-pages-deployment-manifest.js'), 'Pages live smoke blocks deployment manifest builder publication');
assert.ok(pagesLiveSmoke.includes("liveUrl(base, 'pages-deployment.json')") && pagesLiveSmoke.includes('deployed Pages commit matches the requested source commit'), 'Pages live smoke verifies the deployed commit manifest');
assert.ok(pagesLiveSmoke.includes('manifest.fileCount > 0') && !pagesLiveSmoke.includes('manifest.fileCount >= 300'), 'Pages live smoke accepts the canonical clean artifact without a local-worktree file-count assumption');
assert.ok(pagesLiveBrowserSmoke.includes("{ key: 'desktop', width: 1280, height: 800 }") && pagesLiveBrowserSmoke.includes("{ key: 'mobile', width: 390, height: 844 }"), 'Pages browser smoke covers desktop and mobile viewports');
assert.ok(pagesLiveBrowserSmoke.includes("page.on('pageerror'") && pagesLiveBrowserSmoke.includes("page.on('requestfailed'") && pagesLiveBrowserSmoke.includes('horizontal overflow'), 'Pages browser smoke checks runtime, network, and overflow failures');
assert.ok(pagesLiveBrowserSmoke.includes("route === '/rc-pile'") && pagesLiveBrowserSmoke.includes("route === '/wind-cc'") && pagesLiveBrowserSmoke.includes("route === '/stone-fixing'"), 'Pages browser smoke keeps high-risk route regressions');
assert.ok(pagesLiveSmoke.includes('石材固定/dev_tools/baseline_capture.html'), 'Pages live smoke blocks stone dev tools publication');
assert.ok(pagesLiveSmoke.includes('石材固定/server.py'), 'Pages live smoke blocks stone backend helper publication');
assert.ok(pagesLiveSmoke.includes('開挖擋土支撐/backend/app/main.py'), 'Pages live smoke blocks excavation backend publication');
assert.ok(pagesLiveSmoke.includes('開挖擋土支撐/frontend/src/App.tsx'), 'Pages live smoke blocks excavation frontend source publication');
assert.ok(pagesLiveSmoke.includes('螺栓檢討/bolt-review-tool/src/App.tsx'), 'Pages live smoke blocks anchor source publication');
assert.ok(fs.existsSync(path.join(repoRoot, 'run-pages-artifact-smoke.ps1')), 'local Pages artifact smoke wrapper exists');
assert.ok(readme.includes('run-pages-artifact-smoke.ps1'), 'README documents local Pages artifact smoke wrapper');
assert.ok(staging.includes('run-pages-artifact-smoke.ps1'), 'STAGING_GROUPS includes local Pages artifact smoke wrapper');
assert.ok(boundaries.includes('run-pages-artifact-smoke.ps1'), 'TOOL_BOUNDARIES includes local Pages artifact smoke wrapper');
assert.ok(pagesArtifactSmoke.includes('GetTempPath'), 'local Pages artifact smoke stages into temp');
assert.ok(pagesArtifactSmoke.includes('$ArtifactBuilder') && pagesArtifactSmoke.includes('--repo-root $RepoRoot --site-root $SiteRoot'), 'local Pages artifact smoke uses the shared Git-inventory builder');
assert.equal(pagesArtifactSmoke.includes('robocopy'), false, 'local Pages artifact smoke has no duplicate robocopy exclusion policy');
assert.ok(pagesArtifactSmoke.includes("node_modules\\npm\\bin\\npx-cli.js"), 'local Pages artifact smoke bypasses Windows npx wrapper argument rewriting');
assert.ok(pagesArtifactSmoke.includes("--format 'ascii_only=true'") && pagesArtifactSmoke.includes('$BrowserCodeBase64') && pagesArtifactSmoke.includes('$BrowserBootstrap'), 'local Pages artifact smoke carries browser code through a Windows-safe ASCII/Base64 argument');
assert.ok(pagesArtifactSmoke.includes('$BrowserRaw.Trim()'), 'local Pages artifact smoke preserves Playwright CLI diagnostics on non-zero exit');
assert.ok(pagesArtifactBuilder.includes("'--cached', '--others', '--exclude-standard'") && pagesArtifactBuilder.includes('GIT_INDEX_FILE'), 'shared Pages artifact builder uses Git inventory and an isolated index');
assert.ok(pagesArtifactBuilder.includes("core.autocrlf=false") && pagesArtifactBuilder.includes("core.eol=lf"), 'shared Pages artifact builder normalizes Windows and Linux staged bytes');
assert.ok(pagesArtifactBuilder.includes("'output'") && pagesArtifactBuilder.includes("'dev_tools'") && pagesArtifactBuilder.includes("'tests'"), 'shared Pages artifact builder owns private directory exclusions');
assert.ok(pagesArtifactBuilder.includes("'螺栓檢討/bolt-review-tool/'") && pagesArtifactBuilder.includes("'開挖擋土支撐/backend/'") && pagesArtifactBuilder.includes("'開挖擋土支撐/frontend/'"), 'shared Pages artifact builder excludes private source trees');
assert.ok(pagesArtifactBuilder.includes("'.md'") && pagesArtifactBuilder.includes("'.ps1'") && pagesArtifactBuilder.includes("'.test.js'"), 'shared Pages artifact builder owns private file exclusions');
assert.ok(pagesArtifactSmoke.includes('pages-live-smoke.js'), 'local Pages artifact smoke calls shared live smoke');
assert.ok(pagesArtifactSmoke.includes('pages-live-browser-smoke.js'), 'local Pages artifact smoke calls shared browser smoke');
assert.ok(pagesArtifactSmoke.includes('$DeploymentManifestBuilder') && pagesArtifactSmoke.includes('--expected-run-id $LocalRunId'), 'local Pages artifact smoke builds and verifies deployment provenance');
assert.ok(pagesArtifactSmoke.includes("@playwright/cli@0.1.17") && pagesArtifactSmoke.includes("terser@5.49.0"), 'local Pages artifact smoke pins browser dependencies');
assert.ok(pagesArtifactSmoke.includes('$BrowserResult.isError'), 'local Pages artifact smoke checks CLI JSON error state');
assert.ok(pagesArtifactSmoke.includes('build-pages-clean-routes.js'), 'local Pages artifact smoke builds clean routes');
assert.ok(pagesArtifactSmoke.includes('--check-private-boundary'), 'local Pages artifact smoke verifies private boundary');
assert.equal(pagesArtifactSmoke.includes('--allow-local-output'), false, 'local Pages artifact smoke must not allow repo-root output');
assert.ok(pagesLiveSmoke.includes('結構工具箱/core/direct-print-boundary.css'), 'Pages live smoke checks the formal direct-print boundary stylesheet');
assert.ok(pagesLiveSmoke.includes('formal-tool-output-page'), 'Pages live smoke checks formal work-page print body class');
assert.ok(pagesLiveSmoke.includes('正式工具主頁列印已封鎖'), 'Pages live smoke checks formal work-page print boundary wording');
assert.ok(pagesLiveSmoke.includes('local-quick-output-page'), 'Pages live smoke checks local quick work-page print body class');
assert.ok(pagesLiveSmoke.includes('局部快算主頁列印已封鎖'), 'Pages live smoke checks local quick work-page print boundary wording');
assert.ok(pagesLiveSmoke.includes('steel-formal-output-page'), 'Pages live smoke checks steel formal work-page print body class');
assert.ok(pagesLiveSmoke.includes('鋼構正式工具主頁列印已封鎖'), 'Pages live smoke checks steel formal work-page print boundary wording');
assert.ok(pagesArtifactSmoke.includes('Start-Process'), 'local Pages artifact smoke starts a temporary server');
assert.ok(pagesArtifactSmoke.includes('-WindowStyle Hidden'), 'local Pages artifact smoke hides temporary server window');
assert.ok(pagesArtifactSmoke.includes('Stop-Process'), 'local Pages artifact smoke stops temporary server');
assert.ok(pagesDeployWorkflow.includes('actions/configure-pages@v6'), 'Pages deploy workflow configures Pages');
assert.ok(pagesDeployWorkflow.includes('actions/upload-artifact@v6'), 'Pages deploy workflow uploads artifact');
assert.ok(pagesDeployWorkflow.includes('actions/deploy-pages@v5'), 'Pages deploy workflow deploys Pages');
assert.ok(pagesDeployWorkflow.includes('actions/checkout@v6'), 'Pages deploy workflow uses current checkout action');
assert.ok(pagesDeployWorkflow.includes('actions: read'), 'Pages deploy workflow has actions read permission for deploy-pages v5');
assert.ok(pagesDeployWorkflow.includes('pages: write'), 'Pages deploy workflow has pages write permission');
assert.ok(pagesDeployWorkflow.includes('id-token: write'), 'Pages deploy workflow has id-token write permission');
assert.ok(pagesDeployWorkflow.includes('artifact.tar'), 'Pages deploy workflow creates deployable tar artifact');
assert.ok(pagesDeployWorkflow.includes('name: github-pages'), 'Pages deploy workflow uploads the expected github-pages artifact');
assert.ok(pagesDeployWorkflow.includes('node "結構工具箱/tools/build-pages-artifact.js" --repo-root "." --site-root "_site"'), 'Pages deploy workflow uses the shared Git-inventory builder');
assert.equal(pagesDeployWorkflow.includes('rsync -a'), false, 'Pages deploy workflow has no duplicate rsync exclusion policy');
assert.ok(pagesArtifactBuilder.includes('PRIVATE_FILES') && pagesArtifactBuilder.includes('PRIVATE_PREFIXES') && pagesArtifactBuilder.includes('PRIVATE_SUFFIXES'), 'shared Pages artifact builder centralizes the publication policy');
assert.ok(pagesArtifactBuilder.includes('attachment-package-check.js') && pagesArtifactBuilder.includes('attachment-package-build.js') && pagesArtifactBuilder.includes('attachment-package-verify.js') && pagesArtifactBuilder.includes('attachment-package-upgrade-assess.js') && pagesArtifactBuilder.includes('attachment-package-upgrade-workspace.js') && pagesArtifactBuilder.includes('attachment-package-upgrade-workspace-check.js') && pagesArtifactBuilder.includes('attachment-package-upgrade-flow.js') && pagesArtifactBuilder.includes('attachment-package-upgrade-history.js') && pagesArtifactBuilder.includes('attachment-package-upgrade-history-index.js') && pagesArtifactBuilder.includes('attachment-package-upgrade-history-baseline.js') && pagesArtifactBuilder.includes('attachment-package-upgrade-history-baseline-advance.js') && pagesArtifactBuilder.includes('attachment-package-upgrade-history-baseline-chain.js') && pagesArtifactBuilder.includes('attachment-case-governance-overview.js') && pagesArtifactBuilder.includes('attachment-case-governance-root.js') && pagesArtifactBuilder.includes('attachment-case-governance-portfolio.js') && pagesArtifactBuilder.includes('attachment-case-governance-portfolio-compare.js') && pagesArtifactBuilder.includes('attachment-case-governance-portfolio-snapshot.js') && pagesArtifactBuilder.includes('attachment-case-governance-portfolio-snapshot-index.js') && pagesArtifactBuilder.includes('rendered-delivery-evidence.inventory.json'), 'shared Pages artifact builder excludes governance helpers');
assert.ok(pagesLiveSmoke.includes('attachment-package-upgrade-assess.js') && pagesLiveSmoke.includes('attachment-package-upgrade-workspace.js') && pagesLiveSmoke.includes('attachment-package-upgrade-workspace-check.js') && pagesLiveSmoke.includes('attachment-package-upgrade-flow.js') && pagesLiveSmoke.includes('attachment-package-upgrade-history.js') && pagesLiveSmoke.includes('attachment-package-upgrade-history-index.js') && pagesLiveSmoke.includes('attachment-package-upgrade-history-baseline.js') && pagesLiveSmoke.includes('attachment-package-upgrade-history-baseline-advance.js') && pagesLiveSmoke.includes('attachment-package-upgrade-history-baseline-chain.js') && pagesLiveSmoke.includes('attachment-case-governance-overview.js') && pagesLiveSmoke.includes('attachment-case-governance-root.js') && pagesLiveSmoke.includes('attachment-case-governance-portfolio.js') && pagesLiveSmoke.includes('attachment-case-governance-portfolio-compare.js') && pagesLiveSmoke.includes('attachment-case-governance-portfolio-snapshot.js') && pagesLiveSmoke.includes('attachment-case-governance-portfolio-snapshot-index.js'), 'Pages private-boundary smoke blocks the attachment upgrade helpers');
assert.ok(pagesDeployWorkflow.includes('needs: deploy'), 'Pages live smoke waits for deploy job');
assert.ok(pagesDeployWorkflow.includes('build-pages-clean-routes.js" --site-root "_site" --config "vercel.json"'), 'Pages deploy workflow builds Vercel-compatible clean routes for Pages');
assert.ok(pagesDeployWorkflow.includes('結構工具箱/tools/pages-live-smoke.js'), 'Pages deploy workflow runs the HTTP smoke before and after deployment');
const stagedArtifactGateIndex = pagesDeployWorkflow.indexOf('- name: Verify staged Pages artifact');
const pagesArchiveIndex = pagesDeployWorkflow.indexOf('- name: Archive GitHub Pages artifact');
assert.ok(stagedArtifactGateIndex >= 0 && stagedArtifactGateIndex < pagesArchiveIndex, 'Pages deploy workflow blocks archive on staged artifact smoke');
assert.ok(pagesDeployWorkflow.includes('python3 -m http.server 4173') && pagesDeployWorkflow.includes('--directory _site'), 'Pages deploy workflow serves the exact staged _site artifact');
assert.ok(pagesDeployWorkflow.includes('build-pages-deployment-manifest.js') && pagesDeployWorkflow.includes('--commit-sha "$GITHUB_SHA"'), 'Pages deploy workflow writes staged commit provenance');
assert.ok(pagesDeployWorkflow.includes('- name: Verify clean source checkout') && pagesDeployWorkflow.includes('--source-dirty "false"'), 'Pages deploy workflow proves clean source provenance before staging');
assert.ok(pagesDeployWorkflow.includes('--expected-run-id "$GITHUB_RUN_ID"') && pagesDeployWorkflow.includes('PAGES_EXPECTED_RUN_ID: ${{ github.run_id }}'), 'Pages deploy workflow verifies staged and live run provenance');
assert.ok(pagesDeployWorkflow.includes('--expect-clean-source') && pagesDeployWorkflow.includes('PAGES_EXPECT_CLEAN_SOURCE: 1'), 'Pages deploy workflow rejects dirty staged and live provenance');
assert.ok(readme.includes('sourceDirty: false') && readme.includes('sourceDirty: true'), 'README documents formal and local source provenance');
assert.ok(boundaries.includes('sourceDirty: false') && boundaries.includes('sourceDirty: true'), 'TOOL_BOUNDARIES documents clean and dirty source provenance');
assert.ok(staging.includes('git status --porcelain --untracked-files=all') && staging.includes('sourceDirty: false'), 'STAGING_GROUPS documents clean source evidence');
assert.equal((pagesDeployWorkflow.match(/bash "結構工具箱\/tools\/run-pages-browser-smoke\.sh"/g) || []).length, 2, 'Pages deploy workflow reuses browser smoke before and after deploy');
assert.ok(pagesDeployWorkflow.includes('PAGES_BROWSER_SMOKE_ATTEMPTS: 2') && pagesDeployWorkflow.includes('PAGES_BROWSER_SMOKE_RETRY_DELAY_SECONDS: 5'), 'Pages deploy workflow bounds live browser transient retries');
assert.ok(pagesDeployWorkflow.includes('PAGES_HTTP_SMOKE_ATTEMPTS: 2') && pagesDeployWorkflow.includes('PAGES_HTTP_SMOKE_RETRY_DELAY_SECONDS: 5'), 'Pages deploy workflow bounds live HTTP transient retries');
assert.ok(pagesLiveSmoke.includes('response.status >= 500 && response.status <= 599') && pagesLiveSmoke.includes('runWithTransientRetry'), 'Pages live HTTP smoke treats 5xx as retryable failures through a bounded wrapper');
assert.ok(pagesBrowserRunner.includes('install-browser chromium') && pagesBrowserRunner.includes('value.isError'), 'Pages browser runner installs Chromium and fails on CLI JSON errors');
assert.ok(pagesBrowserRunner.includes("@playwright/cli@0.1.17") && pagesBrowserRunner.includes("terser@5.49.0"), 'Pages browser runner pins browser dependencies');
assert.ok(pagesBrowserRunner.includes('trap cleanup EXIT') && pagesBrowserRunner.includes('pages-live-browser-smoke.js'), 'Pages browser runner cleans up and invokes the shared source');
assert.ok(pagesBrowserRunner.includes('status(?: of)? 5') && pagesBrowserRunner.includes('ERR_(?:TIMED_OUT|CONNECTION_RESET'), 'Pages browser runner only retries transient 5xx and network failures');
assert.ok(pagesBrowserRunner.includes('"$attempt" -lt "$attempts"') && pagesBrowserRunner.includes('throw new Error(value.error)'), 'Pages browser runner fails non-transient or persistent issues');
assert.ok(pagesDeploymentManifestBuilder.includes("algorithm: 'sha256-tree-v1'") && pagesDeploymentManifestBuilder.includes('artifactDigest'), 'Pages deployment manifest builder records a deterministic artifact digest');
assert.ok(pagesDeployWorkflow.includes('--check-private-boundary'), 'Pages deploy workflow verifies private artifact boundary');
assert.ok(pagesDeployWorkflow.includes('PAGES_BASE_URL: ${{ needs.deploy.outputs.page_url }}'), 'Pages live smoke uses deployed page URL');
assert.ok(preflight.includes('key = "staging-groups-coverage"'), 'preflight includes staging groups coverage gate');
assert.match(
  preflight,
  /key\s*=\s*"rc-column-report-contract"[\s\S]{0,320}?timeoutSeconds\s*=\s*600/,
  'RC column report contract keeps a ten-minute timeout for the full visual evidence set'
);
assert.match(
  preflight,
  /key\s*=\s*"formal-browser-smoke"[\s\S]{0,320}?timeoutSeconds\s*=\s*600/,
  'formal browser smoke keeps a ten-minute timeout for release-mode browser evidence'
);
[readme, boundaries, staging].forEach((documentText, index) => {
  const label = ['README', 'TOOL_BOUNDARIES', 'STAGING_GROUPS'][index];
  assert.ok(documentText.includes('rc-column-report-contract'), `${label} documents the RC column report gate`);
  assert.ok(documentText.includes('timeoutSeconds = 600'), `${label} documents the RC column report timeout`);
  assert.ok(documentText.includes('formal-browser-smoke'), `${label} documents the formal browser smoke gate`);
  assert.ok(documentText.includes('timeoutSeconds = 600'), `${label} documents the formal browser smoke timeout`);
});
assert.ok(preflight.includes('$maturityMatrixScript = Join-Path $root "結構工具箱\\tools\\tool-maturity-matrix.js"'), 'preflight resolves maturity matrix after summary');
assert.ok(preflight.includes('$matrixProc = Start-Process -FilePath node'), 'preflight refreshes maturity matrix from summary');
assert.ok(preflight.includes('tool-maturity-matrix-refresh: exitCode=$($matrixProc.ExitCode)'), 'preflight reports maturity matrix refresh failures');
assert.ok(
  preflight.indexOf('Write-JsonFile -Path $summaryJsonPath -Value $payload -Depth 6') < preflight.indexOf('$matrixProc = Start-Process -FilePath node'),
  'preflight writes summary before maturity matrix refresh'
);
assert.ok(
  preflight.indexOf('$matrixProc = Start-Process -FilePath node') < preflight.indexOf('$finalContractRecord = Invoke-PreflightCheck'),
  'preflight refreshes maturity matrix before final audit dashboard contract'
);
assert.ok(readme.includes('summary 寫出後先重產工具成熟度矩陣'), 'README documents maturity matrix post-summary refresh');
assert.ok(readme.includes('sourceHash stale'), 'README documents maturity sourceHash stale failure mode');
assert.ok(boundaries.includes('summary 寫出後先重產矩陣'), 'TOOL_BOUNDARIES documents maturity matrix post-summary refresh');
assert.ok(boundaries.includes('audit-dashboard-contract-final'), 'TOOL_BOUNDARIES documents dashboard final contract dependency');
assert.ok(readme.includes('UTF-8 BOM'), 'README documents PowerShell UTF-8 BOM requirement');
assert.ok(boundaries.includes('UTF-8 BOM'), 'TOOL_BOUNDARIES documents PowerShell UTF-8 BOM requirement');
assert.ok(readme.includes('Windows PowerShell 5.1'), 'README documents Windows PowerShell encoding risk');
assert.ok(boundaries.includes('Windows PowerShell 5.1'), 'TOOL_BOUNDARIES documents Windows PowerShell encoding risk');
const steelAuditTool = readText(path.join(repoRoot, '鋼構工具', 'audit-tool.ps1'));
const steelBrowserRunner = readText(path.join(repoRoot, '鋼構工具', 'steel-audit-browser-runner.js'));
const steelFormalCoreSync = readText(path.join(repoRoot, '鋼構工具', 'sync-formal-core.ps1'));
[
  'steel-audit-browser-runner.js',
  'Invoke-BrowserAuditRunner',
  'Edge CDP browser audit',
  'audit-aborted:'
].forEach(needle => assert.ok(steelAuditTool.includes(needle), `steel audit runner integration missing: ${needle}`));
[
  "runner: 'edge-cdp'",
  'scenarioTimeoutMs',
  'WebSocket',
  'Page.captureScreenshot',
  'formal-beam-invalid',
  'formal-column-invalid'
].forEach(needle => assert.ok(steelBrowserRunner.includes(needle), `steel audit Edge CDP runner missing: ${needle}`));
assert.ok(staging.includes('鋼構工具/steel-audit-browser-runner.js'), 'STAGING_GROUPS includes steel audit browser runner');
assert.ok(boundaries.includes('鋼構工具/steel-audit-browser-runner.js'), 'TOOL_BOUNDARIES includes steel audit browser runner');
assert.ok(
  steelFormalCoreSync.includes('Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json'),
  'steel formal core sync reads its UTF-8 manifest consistently in Windows PowerShell and PowerShell 7'
);
assert.ok(
  steelAuditTool.includes('Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json'),
  'steel audit reads its UTF-8 formal core manifest consistently in Windows PowerShell and PowerShell 7'
);
assert.ok(readme.includes('Edge CDP browser runner'), 'README documents steel audit Edge CDP runner');
assert.ok(boundaries.includes('Edge CDP browser runner'), 'TOOL_BOUNDARIES documents steel audit Edge CDP runner');
assert.ok(readme.includes('run-preflight-tools-release.bat'), 'README documents release preflight wrapper');
assert.ok(readme.includes('-ForceSlowChecks') && readme.includes('-ForcePlatformAudit'), 'README documents release preflight force flags');
assert.ok(readme.includes('不接受 `%*` 任意參數透傳'), 'README documents release wrapper argument boundary');
assert.ok(staging.includes('run-preflight-tools-release.bat'), 'STAGING_GROUPS includes release preflight wrapper');
assert.ok(staging.includes('不得透傳 `%*`') && staging.includes('`-Quick` 覆蓋'), 'STAGING_GROUPS documents release wrapper quick override boundary');
const preflightBoundaryRow = boundaries.split(/\r?\n/).find(line => line.includes('preflight-tools.ps1') && line.includes('run-preflight-tools.bat') && line.includes('run-preflight-tools-quick.bat'));
assert.ok(preflightBoundaryRow && preflightBoundaryRow.includes('run-preflight-tools-release.bat'), 'TOOL_BOUNDARIES includes release preflight wrapper in wrapper row');
assert.ok(preflightBoundaryRow.includes('不得透傳 `%*`') && preflightBoundaryRow.includes('`-Quick` 覆蓋'), 'TOOL_BOUNDARIES documents release wrapper quick override boundary');
assert.ok(preflight.includes('run-preflight-tools-release.bat') && preflight.includes('-ForceSlowChecks') && preflight.includes('-ForcePlatformAudit'), 'preflight launcher smoke covers release wrapper force flags');
assert.ok(preflight.includes('Quick preflight cannot be combined with release force flags'), 'preflight rejects quick release force flag combinations');
assert.ok(releaseWrapper.includes('-ForceSlowChecks') && releaseWrapper.includes('-ForcePlatformAudit'), 'release wrapper keeps release force flags');
assert.equal(releaseWrapper.includes('%*'), false, 'release wrapper must not pass through arbitrary arguments');
assert.equal(releaseWrapper.includes('-Quick'), false, 'release wrapper must not enable quick mode');
assert.ok(auditAll.includes('[System.Diagnostics.ProcessStartInfo]::new()'), 'audit-all uses ProcessStartInfo for child audits');
assert.equal(auditAll.includes('Start-Process -FilePath powershell'), false, 'audit-all avoids Start-Process powershell env dictionary bug');
assert.ok(readText(path.join(toolboxRoot, 'tools/local-quick-tools.run.js')).includes('spawn error'), 'local quick runner reports spawn errors');
assert.ok(readText(path.join(toolboxRoot, 'tools/formal-tools.run.js')).includes('spawn error'), 'formal tools runner reports spawn errors');

const stagingPaths = extractStagingPaths(staging);
assert.ok(stagingPaths.length >= 55, 'STAGING_GROUPS should keep concrete git add paths');
for (const stagingPath of stagingPaths) {
  assertStagingPathIsUsable(stagingPath);
}
const preflightContractPaths = extractPreflightContractPaths(preflight);
assert.ok(preflightContractPaths.length >= 9, 'preflight contract inventory should cover current gates; got ' + preflightContractPaths.length);
for (const contractPath of preflightContractPaths) {
  assert.ok(fs.existsSync(path.join(repoRoot, ...contractPath.split('/'))), 'preflight contract file missing: ' + contractPath);
  assert.ok(staging.includes(contractPath), `STAGING_GROUPS missing preflight contract path: ${contractPath}`);
  assert.ok(boundaries.includes(contractPath), `TOOL_BOUNDARIES missing preflight contract path: ${contractPath}`);
}

const preflightRunnableJsPaths = extractPreflightRunnableJsPaths(preflight);
assert.ok(preflightRunnableJsPaths.length >= 16, 'preflight runnable JS inventory should cover current gates; got ' + preflightRunnableJsPaths.length);
for (const runnablePath of preflightRunnableJsPaths) {
  assert.ok(fs.existsSync(path.join(repoRoot, ...runnablePath.split('/'))), 'preflight runnable JS file missing: ' + runnablePath);
  assert.ok(staging.includes(runnablePath), `STAGING_GROUPS missing preflight runnable JS path: ${runnablePath}`);
  assert.ok(boundaries.includes(runnablePath), `TOOL_BOUNDARIES missing preflight runnable JS path: ${runnablePath}`);
}
[
  '結構工具箱/tools/audit-dashboard-browser-smoke.test.js',
  '結構工具箱/tools/local-quick-tools.run.js',
  '結構工具箱/tools/formal-tools.run.js'
].forEach(runnablePath => {
  assert.ok(preflightRunnableJsPaths.includes(runnablePath), `preflight runnable JS inventory missing critical runner/smoke: ${runnablePath}`);
});
const preflightHelperPaths = extractPreflightHelperPaths(preflight);
assert.ok(preflightHelperPaths.length >= 16, 'preflight helper script inventory should cover current gates; got ' + preflightHelperPaths.length);
for (const helperPath of preflightHelperPaths) {
  assert.ok(fs.existsSync(path.join(repoRoot, ...helperPath.split('/'))), 'preflight helper script missing: ' + helperPath);
  assert.ok(staging.includes(helperPath), `STAGING_GROUPS missing preflight helper script path: ${helperPath}`);
  assert.ok(boundaries.includes(helperPath), `TOOL_BOUNDARIES missing preflight helper script path: ${helperPath}`);
  assertPowerShellEncoding(helperPath);
}
[
  'platform-audit-preflight.ps1',
  'refresh-platform-status.ps1',
  'run-preflight-tools-quick.bat',
  'run-preflight-tools-release.bat',
  'sync-anchor-deployment.ps1',
  '結構工具箱/run-audit-core.bat',
  '鋼筋混凝土/tools/test-column.ps1',
  '鋼筋混凝土/tools/test-shear-wall-report.ps1',
  '鋼筋混凝土/run-audit.bat',
  '鋼構工具/run-audit.bat'
].forEach(helperPath => {
  assert.ok(preflightHelperPaths.includes(helperPath), `preflight helper script inventory missing critical helper: ${helperPath}`);
});
const manifestRouteSet = new Set([
  ...formalManifest.tools.map(tool => tool.route),
  ...localQuickManifest.tools.map(tool => tool.route)
]);

const deployedRoutes = new Map();
for (const route of [...vercel.rewrites, ...vercel.redirects]) {
  assert.ok(route.source?.startsWith('/'), `route source must be absolute: ${route.source}`);
  assert.ok(route.destination?.startsWith('/'), `route destination must be absolute: ${route.source}`);
  assert.equal(deployedRoutes.has(route.source), false, `duplicate Vercel route source: ${route.source}`);
  deployedRoutes.set(route.source, route.destination);
  const candidates = routeDestinationCandidates(route.destination);
  const existing = firstExistingRepoFile(candidates);
  assert.ok(existing, `${route.source} destination has no existing repo file candidate: ${candidates.join(', ')}`);
}

const homeHrefSet = new Set();
const cleanHomeRoutes = [];
for (const tool of homeTools) {
  assert.ok(tool.title, 'home tool title');
  assert.ok(tool.href, `${tool.title} home href`);
  assert.ok(toolStates[tool.state], `${tool.title} uses a governed home state: ${tool.state}`);
  if (tool.governance) {
    assert.ok(governanceSources[tool.governance], `${tool.title} unknown governance source: ${tool.governance}`);
  }
  if (tool.state === 'formal' && !manifestRouteSet.has(tool.href)) {
    assert.ok(tool.governance, `${tool.title} formal home card is outside maturity manifests and needs governance source`);
  }
  assert.equal(homeHrefSet.has(tool.href), false, `duplicate home href: ${tool.href}`);
  homeHrefSet.add(tool.href);

  const relativeFile = resolveHomeFileHref(tool.href, routeFileMap);
  const absoluteFile = path.join(repoRoot, ...relativeFile.split('/'));
  assert.ok(fs.existsSync(absoluteFile), `${tool.title} home href target missing: ${relativeFile}`);

  assert.equal(Object.prototype.hasOwnProperty.call(tool, 'updated'), false, `${tool.title} must use the centralized update catalog`);
  const homeUpdated = homeToolUpdates.routes[tool.href];
  assertHomeDate(homeUpdated, `${tool.title} home updated date`);
  assert.ok(homeUpdated <= homeToolUpdates.generatedAt, `${tool.title} home updated date must not exceed catalog generation date`);
  const dependencyFiles = homeToolUpdateDependencies.routes[tool.href] || [];
  dependencyFiles.forEach(dependencyFile => {
    assert.equal(typeof dependencyFile, 'string', `${tool.title} update dependency path`);
    assert.ok(fs.existsSync(path.join(repoRoot, ...dependencyFile.split('/'))), `${tool.title} update dependency missing: ${dependencyFile}`);
  });
  const contentFiles = [relativeFile, ...dependencyFiles];
  const committedDates = contentFiles.map(latestCommittedDate).filter(Boolean).sort();
  const lastCommittedDate = committedDates.at(-1) || null;
  if (lastCommittedDate) {
    const changedFiles = contentFiles.filter(hasWorkingTreeChange);
    const expectedContentDate = changedFiles.length > 0
      ? homeToolUpdates.generatedAt
      : lastCommittedDate;
    assert.equal(
      homeUpdated,
      expectedContentDate,
      `${tool.title} home updated date must match ${changedFiles.length > 0 ? 'current target or shared dependency worktree change' : 'target and shared dependency Git history'} (${contentFiles.join(', ')})`
    );
  }
  assert.ok(tool.version, `${tool.title} home version`);
  const categoricalVersionRule = CATEGORICAL_VERSION_RULES[tool.version];
  if (categoricalVersionRule) {
    assert.ok(categoricalVersionRule(tool), `${tool.title} uses version tag ${tool.version} with incompatible state ${tool.state}`);
  } else {
    const homeVersion = normalizeVersion(tool.version);
    assert.ok(homeVersion, `${tool.title} home version must be Vn.n or an approved categorical tag: ${tool.version}`);
    if (/\.html?$/i.test(relativeFile)) {
      const htmlVersion = detectHtmlVersion(readText(absoluteFile), relativeFile);
      if (htmlVersion) {
        assert.equal(homeVersion, htmlVersion, `${tool.title} home version must match tool version source (${relativeFile})`);
      }
    }
  }

  if (isCleanHomeRoute(tool.href)) {
    cleanHomeRoutes.push(tool.href);
    assert.ok(routeFileMap[tool.href], `${tool.href} clean route missing routeFileMap entry`);
    assert.ok(deployedRoutes.has(tool.href), `${tool.href} clean route missing Vercel redirect/rewrite`);
  }
}

function assertHomeToolGovernance(href, governanceKey) {
  const tool = homeTools.find(item => item.href === href);
  assert.ok(tool, `home tool exists for governance check: ${href}`);
  assert.equal(tool.governance, governanceKey, `${href} home governance source`);
}

[
  '/wind-force',
  '/wind-cc',
  '/wind-parapet',
  '/wind-open-roof',
  '/wind-object-solid',
  '/wind-object-frame',
  '/wind-lattice-tower',
  '/wind-object-tower',
  '/wind-fence-sign',
  '/wind-sign-pole',
  '/seismic-force',
  '/seismic-dynamic',
  '/seismic-appendage',
  '/seismic-misc'
].forEach(href => assertHomeToolGovernance(href, 'formal-tools'));
[
  '/beam-analysis'
].forEach(href => assertHomeToolGovernance(href, 'continuous-beam'));
[
  '/frame-analysis'
].forEach(href => assertHomeToolGovernance(href, 'frame-analysis'));
[
  '/section',
  '/composite-section'
].forEach(href => assertHomeToolGovernance(href, 'section-tools'));
[
  '/foundation-local',
  '/equipment-load',
  '/earth-pressure'
].forEach(href => assertHomeToolGovernance(href, 'local-quick-contract'));

const homeRouteSet = new Set(cleanHomeRoutes);
for (const [route, relativeFile] of Object.entries(routeFileMap)) {
  const resolvedFile = normalizeSlash(path.relative(repoRoot, path.resolve(toolboxRoot, relativeFile)));
  assert.ok(fs.existsSync(path.join(repoRoot, ...resolvedFile.split('/'))), `${route} routeFileMap target missing: ${resolvedFile}`);
  assert.ok(homeRouteSet.has(route) || deployedRoutes.has(route), `${route} routeFileMap entry is not referenced by home cards or Vercel routes`);
  assert.ok(deployedRoutes.has(route), `${route} routeFileMap clean route missing Vercel redirect/rewrite`);
}

const manifestTools = [
  ...formalManifest.tools.map(tool => ({ ...tool, family: formalManifest.family })),
  ...localQuickManifest.tools.map(tool => ({ ...tool, family: localQuickManifest.family }))
];

for (const tool of manifestTools) {
  assert.ok(homeHrefSet.has(tool.route), `${tool.family}:${tool.key} route missing from home cards: ${tool.route}`);
  assert.ok(deployedRoutes.has(tool.route), `${tool.family}:${tool.key} route missing from vercel.json: ${tool.route}`);
  assert.equal(routeFileMap[tool.route], tool.html, `${tool.family}:${tool.key} routeFileMap must point to manifest html`);
  assert.ok(fs.existsSync(path.join(toolboxRoot, ...tool.html.split('/'))), `${tool.family}:${tool.key} html missing: ${tool.html}`);
  assertDestinationMatchesHtml(tool.route, deployedRoutes.get(tool.route), tool.html);
}

[
  'toolbox-entrypoints.contract.test.js',
  '首頁入口',
  'vercel.json',
  'routeFileMap',
  'formal-tools.manifest.json',
  'local-quick-tools.manifest.json',
  '首頁正式狀態治理',
  'governanceSources',
  'tool-maturity-matrix.js',
  '非 formal 責任邊界',
  'stateBoundaryRules',
  '首頁版本治理',
  'HOME_TOOL_UPDATES',
  'TOOL_VERSION',
  'APP_VERSION',
  'Pages deploy',
  'Pages deploy / live smoke',
  'pages-live-smoke.js',
  'pages-live-browser-smoke.js',
  'build-pages-clean-routes.js',
  '.github/workflows/pages-deploy.yml',
  'preflight contract 文件化',
  'preflight JS 執行檔清冊',
  'preflight helper script 清冊',
  'staging 指引可執行性',
  '目前工作樹覆蓋率'
].forEach(needle => {
  assert.ok(readme.includes(needle), `README missing entrypoint governance: ${needle}`);
  assert.ok(boundaries.includes(needle), `TOOL_BOUNDARIES missing entrypoint governance: ${needle}`);
  assert.ok(staging.includes(needle), `STAGING_GROUPS missing entrypoint governance: ${needle}`);
});

console.log(`toolbox entrypoints contract OK (${homeTools.length} home tools, ${deployedRoutes.size} deployed routes, ${manifestTools.length} manifest tools, ${preflightContractPaths.length} preflight contracts, ${preflightRunnableJsPaths.length} runnable JS files, ${preflightHelperPaths.length} helper scripts)`);
