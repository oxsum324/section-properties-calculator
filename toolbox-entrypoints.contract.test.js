const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

function detectHtmlVersion(source) {
  const constMatch = source.match(/\b(?:APP_VERSION|TOOL_VERSION)\s*=\s*['\"]\s*v?(\d+(?:\.\d+)*)\s*['\"]/i);
  if (constMatch) return `V${constMatch[1]}`;
  const taggedMatches = source.matchAll(/<(title|h1)\b[^>]*>([\s\S]*?)<\/\1>/gi);
  for (const match of taggedMatches) {
    const text = match[2].replace(/<[^>]+>/g, ' ');
    const versionMatch = text.match(/\bV\s*(\d+(?:\.\d+)*)\b/i);
    if (versionMatch) return `V${versionMatch[1]}`;
  }
  return null;
}

function assertHomeDate(value, label) {
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(value), `${label} must use YYYY-MM-DD: ${value}`);
  const parsed = new Date(`${value}T00:00:00Z`);
  assert.equal(Number.isNaN(parsed.valueOf()), false, `${label} must be a real date: ${value}`);
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  assert.ok(parsed <= tomorrow, `${label} must not be future dated: ${value}`);
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
const homeTools = evaluateLiteral(extractConstLiteral(homeSource, 'tools'), 'home-tools');
const homeDataUpdated = extractConstString(homeSource, 'HOME_DATA_UPDATED');
const toolStates = evaluateLiteral(extractConstLiteral(homeSource, 'toolStates'), 'tool-states');
const stateBoundaryRules = evaluateLiteral(extractConstLiteral(homeSource, 'stateBoundaryRules'), 'state-boundary-rules');
const governanceSources = evaluateLiteral(extractConstLiteral(homeSource, 'governanceSources'), 'governance-sources');
const routeFileMap = evaluateLiteral(extractConstLiteral(homeSource, 'routeFileMap'), 'route-file-map');
const vercel = readJson('vercel.json');
const formalManifest = readJson('結構工具箱/tools/formal-tools.manifest.json');
const localQuickManifest = readJson('結構工具箱/tools/local-quick-tools.manifest.json');
const readme = readText(path.join(repoRoot, 'README.md'));
const boundaries = readText(path.join(repoRoot, 'TOOL_BOUNDARIES.md'));
const staging = readText(path.join(repoRoot, 'STAGING_GROUPS.md'));
const preflight = readText(path.join(repoRoot, 'preflight-tools.ps1'));
const auditAll = readText(path.join(repoRoot, 'audit-all.ps1'));
const maturityMatrix = readText(path.join(toolboxRoot, 'tools/tool-maturity-matrix.js'));
const pagesLiveSmoke = readText(path.join(toolboxRoot, 'tools/pages-live-smoke.js'));
const pagesDeployWorkflow = readText(path.join(repoRoot, '.github/workflows/pages-deploy.yml'));

assert.equal(vercel.cleanUrls, true, 'Vercel cleanUrls must stay enabled');
assert.ok(Array.isArray(vercel.redirects), 'vercel redirects array');
assert.ok(Array.isArray(vercel.rewrites), 'vercel rewrites array');
assert.ok(Array.isArray(homeTools), 'home tools array');
assert.ok(homeTools.length >= 40, 'home tool count should cover the governed platform');
assertHomeDate(homeDataUpdated, 'HOME_DATA_UPDATED');
assert.ok(toolStates.formal, 'home tool states include formal');
for (const stateKey of Object.keys(toolStates).filter(key => key !== 'formal')) {
  assert.ok(stateBoundaryRules[stateKey], `${stateKey} non-formal state has boundary rules`);
  assert.ok(Array.isArray(stateBoundaryRules[stateKey].limitAny), `${stateKey} boundary has limit needles`);
  assert.ok(Array.isArray(stateBoundaryRules[stateKey].forbiddenCapabilities), `${stateKey} boundary has forbidden capabilities`);
}
assert.ok(governanceSources['rc-audit'], 'home governance sources include RC audit');
assert.ok(governanceSources['steel-audit'], 'home governance sources include steel audit');
assert.ok(governanceSources['anchor-deployment'], 'home governance sources include anchor deployment');
assert.ok(governanceSources['stone-v2'], 'home governance sources include stone V2');
assert.ok(governanceSources['decking-contract'], 'home governance sources include decking contract');
for (const [sourceKey, source] of Object.entries(governanceSources)) {
  assert.ok(Array.isArray(source.preflightKeys) && source.preflightKeys.length > 0, `${sourceKey} governance source preflight keys`);
  for (const preflightKey of source.preflightKeys) {
    assert.ok(preflight.includes(`key = "${preflightKey}"`), `${sourceKey} preflight key missing: ${preflightKey}`);
  }
}
assert.ok(maturityMatrix.includes('formal-tools.manifest.json'), 'maturity matrix reads formal manifest');
assert.ok(maturityMatrix.includes('local-quick-tools.manifest.json'), 'maturity matrix reads local quick manifest');
assert.ok(maturityMatrix.includes('homeEntry'), 'maturity matrix checks home entries');
assert.equal(/fetch\(\s*[`'"]\/output\//.test(homeSource), false, 'home status fetches must not use domain-root /output paths');
assert.ok(homeSource.includes("homeAssetHref('assets/status/platform-status.json')"), 'home status fetch uses tracked platform status asset');
assert.ok(homeSource.includes("homeAssetHref('assets/status/preflight-summary.json')"), 'home status fetch uses tracked preflight status asset');
assert.ok(fs.existsSync(path.join(toolboxRoot, 'assets/status/platform-status.json')), 'homepage platform status asset exists');
assert.ok(fs.existsSync(path.join(toolboxRoot, 'assets/status/preflight-summary.json')), 'homepage preflight status asset exists');
assert.ok(maturityMatrix.includes('writeHomepageStatusSnapshots'), 'maturity matrix publishes homepage status snapshots');
assert.ok(pagesLiveSmoke.includes('assets/status/platform-status.json'), 'Pages live smoke checks platform status asset');
assert.ok(pagesLiveSmoke.includes('assets/status/preflight-summary.json'), 'Pages live smoke checks preflight status asset');
assert.ok(pagesLiveSmoke.includes('pages live smoke OK'), 'Pages live smoke reports success');
assert.ok(pagesLiveSmoke.includes('assertPrivateBoundary'), 'Pages live smoke checks private artifact boundary');
assert.ok(pagesLiveSmoke.includes('preflight-tools.ps1'), 'Pages live smoke blocks preflight script publication');
assert.ok(pagesLiveSmoke.includes('toolbox-entrypoints.contract.test.js'), 'Pages live smoke blocks contract publication');
assert.ok(pagesDeployWorkflow.includes('actions/configure-pages@v6'), 'Pages deploy workflow configures Pages');
assert.ok(pagesDeployWorkflow.includes('actions/upload-artifact@v6'), 'Pages deploy workflow uploads artifact');
assert.ok(pagesDeployWorkflow.includes('actions/deploy-pages@v5'), 'Pages deploy workflow deploys Pages');
assert.ok(pagesDeployWorkflow.includes('actions/checkout@v6'), 'Pages deploy workflow uses current checkout action');
assert.ok(pagesDeployWorkflow.includes('actions: read'), 'Pages deploy workflow has actions read permission for deploy-pages v5');
assert.ok(pagesDeployWorkflow.includes('pages: write'), 'Pages deploy workflow has pages write permission');
assert.ok(pagesDeployWorkflow.includes('id-token: write'), 'Pages deploy workflow has id-token write permission');
assert.ok(pagesDeployWorkflow.includes('artifact.tar'), 'Pages deploy workflow creates deployable tar artifact');
assert.ok(pagesDeployWorkflow.includes('name: github-pages'), 'Pages deploy workflow uploads the expected github-pages artifact');
assert.ok(pagesDeployWorkflow.includes("--exclude='*.ps1'"), 'Pages deploy workflow excludes PowerShell helpers');
assert.ok(pagesDeployWorkflow.includes("--exclude='*.test.js'"), 'Pages deploy workflow excludes test files');
assert.ok(pagesDeployWorkflow.includes("--exclude='*.contract.test.js'"), 'Pages deploy workflow excludes contract tests');
assert.ok(pagesDeployWorkflow.includes("--exclude='*.md'"), 'Pages deploy workflow excludes markdown docs');
assert.ok(pagesDeployWorkflow.includes('needs: deploy'), 'Pages live smoke waits for deploy job');
assert.ok(pagesDeployWorkflow.includes('結構工具箱/tools/pages-live-smoke.js'), 'Pages deploy workflow runs smoke script after deployment');
assert.ok(pagesDeployWorkflow.includes('--check-private-boundary'), 'Pages deploy workflow verifies private artifact boundary');
assert.ok(pagesDeployWorkflow.includes('PAGES_BASE_URL: ${{ needs.deploy.outputs.page_url }}'), 'Pages live smoke uses deployed page URL');
assert.ok(preflight.includes('key = "staging-groups-coverage"'), 'preflight includes staging groups coverage gate');
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
assert.ok(readme.includes('Edge CDP browser runner'), 'README documents steel audit Edge CDP runner');
assert.ok(boundaries.includes('Edge CDP browser runner'), 'TOOL_BOUNDARIES documents steel audit Edge CDP runner');
assert.ok(readme.includes('run-preflight-tools-release.bat'), 'README documents release preflight wrapper');
assert.ok(readme.includes('-ForceSlowChecks') && readme.includes('-ForcePlatformAudit'), 'README documents release preflight force flags');
assert.ok(staging.includes('run-preflight-tools-release.bat'), 'STAGING_GROUPS includes release preflight wrapper');
const preflightBoundaryRow = boundaries.split(/\r?\n/).find(line => line.includes('preflight-tools.ps1') && line.includes('run-preflight-tools.bat') && line.includes('run-preflight-tools-quick.bat'));
assert.ok(preflightBoundaryRow && preflightBoundaryRow.includes('run-preflight-tools-release.bat'), 'TOOL_BOUNDARIES includes release preflight wrapper in wrapper row');
assert.ok(preflight.includes('run-preflight-tools-release.bat') && preflight.includes('-ForceSlowChecks') && preflight.includes('-ForcePlatformAudit'), 'preflight launcher smoke covers release wrapper force flags');
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

  assertHomeDate(tool.updated || homeDataUpdated, `${tool.title} home updated date`);
  assert.ok(tool.version, `${tool.title} home version`);
  const categoricalVersionRule = CATEGORICAL_VERSION_RULES[tool.version];
  if (categoricalVersionRule) {
    assert.ok(categoricalVersionRule(tool), `${tool.title} uses version tag ${tool.version} with incompatible state ${tool.state}`);
  } else {
    const homeVersion = normalizeVersion(tool.version);
    assert.ok(homeVersion, `${tool.title} home version must be Vn.n or an approved categorical tag: ${tool.version}`);
    if (/\.html?$/i.test(relativeFile)) {
      const htmlVersion = detectHtmlVersion(readText(absoluteFile));
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
  'HOME_DATA_UPDATED',
  'TOOL_VERSION',
  'APP_VERSION',
  'Pages deploy',
  'Pages deploy / live smoke',
  'pages-live-smoke.js',
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
