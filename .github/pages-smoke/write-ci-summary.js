const fs = require('node:fs');
const path = require('node:path');

const RESULT_SCHEMA_VERSION = 1;

function readResult(filePath, expectedKind) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (payload.schemaVersion !== RESULT_SCHEMA_VERSION || payload.kind !== expectedKind) {
    throw new Error(`Unexpected ${expectedKind} evidence schema`);
  }
  if (!['passed', 'failed'].includes(payload.status)) throw new Error(`Unexpected ${expectedKind} status`);
  if (!Number.isInteger(payload.durationMs) || payload.durationMs < 0) throw new Error(`Invalid ${expectedKind} duration`);
  if (!Number.isInteger(payload.attemptCount) || payload.attemptCount < 1) throw new Error(`Invalid ${expectedKind} attempt count`);
  return payload;
}

function formatDuration(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'not recorded';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function formatCacheHit(value) {
  if (value === 'true') return 'exact hit';
  if (value === 'false' || value === '') return 'miss';
  return 'not recorded';
}

function formatSmoke(result, outcome, detail) {
  if (!result) return `${outcome || 'not run'}; evidence not produced`;
  const suffix = detail(result);
  return `${result.status}; ${formatDuration(result.durationMs)}; ${result.attemptCount} attempt(s)${suffix ? `; ${suffix}` : ''}`;
}

function buildSummary(environment = process.env) {
  const http = readResult(environment.PAGES_HTTP_SMOKE_RESULT_FILE, 'pages-http-smoke');
  const browser = readResult(environment.PAGES_BROWSER_SMOKE_RESULT_FILE, 'pages-browser-smoke');
  const installOutcome = environment.PAGES_RUNTIME_INSTALL_OUTCOME || 'not run';
  const installDuration = formatDuration(environment.PAGES_RUNTIME_INSTALL_DURATION_MS);
  const lockDigest = String(environment.PAGES_RUNTIME_LOCK_DIGEST || '').trim();
  const shortDigest = /^[0-9a-f]{64}$/i.test(lockDigest) ? lockDigest.slice(0, 16) : 'not recorded';
  const lines = [
    `## Pages CI evidence — ${environment.PAGES_CI_JOB || 'unknown job'}`,
    '',
    '| Signal | Evidence |',
    '| --- | --- |',
    `| Job outcome | ${environment.PAGES_CI_JOB_STATUS || 'unknown'} |`,
    `| Source commit | \`${environment.GITHUB_SHA || 'not recorded'}\` |`,
    `| Runtime lock SHA-256 | \`${shortDigest}\` |`,
    `| npm content cache | ${formatCacheHit(environment.PAGES_NPM_CACHE_HIT)} |`,
    `| Playwright browser cache | ${formatCacheHit(environment.PAGES_BROWSER_CACHE_HIT)} |`,
    `| Pinned runtime install | ${installOutcome}; ${installDuration} |`,
    `| HTTP artifact smoke | ${formatSmoke(http, environment.PAGES_HTTP_SMOKE_OUTCOME, value => `${value.fileCount ?? 'unknown'} files; ${value.routeCount ?? 'unknown'} routes`)} |`,
    `| Browser smoke | ${formatSmoke(browser, environment.PAGES_BROWSER_SMOKE_OUTCOME, value => `${value.checks ?? 'unknown'} checks; ${value.issues ?? 'unknown'} issues`)} |`,
    '',
    '> Cache hits improve transfer time only. Every job still rebuilds `node_modules` from the lockfile and performs the full smoke checks.',
    '',
  ];
  return lines.join('\n');
}

function writeSummary(environment = process.env) {
  const target = environment.GITHUB_STEP_SUMMARY;
  if (!target) throw new Error('GITHUB_STEP_SUMMARY is required');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, buildSummary(environment), 'utf8');
}

if (require.main === module) {
  writeSummary();
}

module.exports = { RESULT_SCHEMA_VERSION, readResult, formatDuration, formatCacheHit, formatSmoke, buildSummary, writeSummary };
