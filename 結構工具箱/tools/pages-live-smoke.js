const assert = require('assert');

const DEFAULT_BASE_URL = 'https://oxsum324.github.io/section-properties-calculator/';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

function hasArg(name) {
  return process.argv.includes(name);
}

function baseUrl() {
  const raw = argValue('--base-url') || process.env.PAGES_BASE_URL || DEFAULT_BASE_URL;
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function liveUrl(base, relativePath) {
  return new URL(encodeURI(relativePath), base).toString();
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'manual', cache: 'no-store' });
  assert.equal(response.status, 200, `${url} expected HTTP 200, got ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

function assertStatusPayload(payload, label) {
  assert.equal(payload.snapshotVersion, 1, `${label} snapshotVersion`);
  assert.equal(typeof payload.kind, 'string', `${label} kind`);
  assert.equal(typeof payload.generatedAt, 'string', `${label} generatedAt`);
  assert.equal(typeof payload.runId, 'string', `${label} runId`);
  assert.ok(payload.runId, `${label} runId populated`);
  assert.equal(payload.pass, true, `${label} pass`);
  assert.equal(Number.isInteger(payload.failureCount), true, `${label} failureCount integer`);
  assert.equal(payload.failureCount, 0, `${label} failureCount`);
  assert.equal(typeof payload.sourcePath, 'string', `${label} sourcePath`);
  assert.match(payload.sourceHash, /^[0-9a-f]{64}$/i, `${label} sourceHash`);
  assert.equal(JSON.stringify(payload).includes('C:\\'), false, `${label} must not expose Windows paths`);
}

async function assertOldOutputNotRequired(base) {
  const legacyUrls = [
    liveUrl(base, 'output/audit/platform-status.json'),
    liveUrl(base, 'output/preflight/preflight-summary.json')
  ];
  for (const url of legacyUrls) {
    const response = await fetch(url, { redirect: 'manual', cache: 'no-store' });
    assert.notEqual(response.status, 200, `${url} should not be the homepage status source`);
  }
}

async function assertPrivateBoundary(base) {
  const privatePaths = [
    'README.md',
    'TOOL_BOUNDARIES.md',
    'STAGING_GROUPS.md',
    'TOOL_REPORT_GUIDE.md',
    'preflight-tools.ps1',
    'run-preflight-tools.bat',
    'toolbox-entrypoints.contract.test.js',
    '結構工具箱/tools/pages-live-smoke.js',
    '結構工具箱/tools/local-quick-browser-smoke.test.js',
    '.github/workflows/pages-deploy.yml'
  ];
  for (const path of privatePaths) {
    const url = liveUrl(base, path);
    const response = await fetch(url, { redirect: 'manual', cache: 'no-store' });
    assert.notEqual(response.status, 200, `${path} should not be published to Pages`);
  }
}

async function main() {
  const base = baseUrl();
  const homeUrl = liveUrl(base, '結構工具箱/');
  const homeJsUrl = liveUrl(base, '結構工具箱/assets/home/home.js');
  const platformStatusUrl = liveUrl(base, '結構工具箱/assets/status/platform-status.json');
  const preflightStatusUrl = liveUrl(base, '結構工具箱/assets/status/preflight-summary.json');

  const homeHtml = await fetchText(homeUrl);
  assert.ok(homeHtml.includes('assets/home/home.js'), 'homepage references home.js');

  const homeJs = await fetchText(homeJsUrl);
  assert.ok(homeJs.includes("assets/status/platform-status.json"), 'home.js reads platform status asset');
  assert.ok(homeJs.includes("assets/status/preflight-summary.json"), 'home.js reads preflight status asset');
  assert.equal(/fetch\(\s*[`'"]\/output\//.test(homeJs), false, 'home.js must not fetch domain-root output paths');

  const platformStatus = await fetchJson(platformStatusUrl);
  assertStatusPayload(platformStatus, 'platform status');
  assert.equal(platformStatus.kind, 'platform-status', 'platform status kind');
  assert.equal(platformStatus.sourcePath, 'output/audit/platform-status.json', 'platform status sourcePath');

  const preflightStatus = await fetchJson(preflightStatusUrl);
  assertStatusPayload(preflightStatus, 'preflight status');
  assert.equal(preflightStatus.kind, 'preflight-summary', 'preflight status kind');
  assert.equal(preflightStatus.quick, false, 'preflight status should publish latest full run');
  assert.ok(/^output\/preflight\/(?:history\/[^/]+\/)?preflight-summary\.json$/.test(preflightStatus.sourcePath), 'preflight status sourcePath');
  assert.equal(Number.isInteger(preflightStatus.recordsCount), true, 'preflight recordsCount integer');
  assert.equal(preflightStatus.recordsCount, preflightStatus.passedCount, 'preflight records all passed');

  await assertOldOutputNotRequired(base);
  if (hasArg('--check-private-boundary') || process.env.PAGES_CHECK_PRIVATE_BOUNDARY === '1') {
    await assertPrivateBoundary(base);
  }

  console.log(`pages live smoke OK (${base})`);
  console.log(`platform runId=${platformStatus.runId}, preflight runId=${preflightStatus.runId}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
