const fs = require('node:fs');
const path = require('node:path');

const RESULT_SCHEMA_VERSION = 1;
const EVIDENCE_SCHEMA_VERSION = 1;
const BUDGET_SCHEMA_VERSION = 1;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, payload) {
  const target = path.resolve(filePath);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`Unexpected ${label} fields`);
  }
}

function assertPositiveIntegerArray(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.some(item => !Number.isInteger(item) || item <= 0)) {
    throw new Error(`Invalid ${label}`);
  }
}

function validateResultPayload(payload, expectedKind) {
  const commonKeys = ['schemaVersion', 'kind', 'status', 'durationMs', 'attemptCount'];
  const passedKeys = expectedKind === 'pages-http-smoke'
    ? [...commonKeys, 'fileCount', 'routeCount']
    : [...commonKeys, 'routes', 'checks', 'issues'];
  if (payload.schemaVersion !== RESULT_SCHEMA_VERSION || payload.kind !== expectedKind) throw new Error(`Unexpected ${expectedKind} evidence schema`);
  if (!['passed', 'failed'].includes(payload.status)) throw new Error(`Unexpected ${expectedKind} status`);
  assertExactKeys(payload, payload.status === 'passed' ? passedKeys : commonKeys, `${expectedKind} evidence`);
  if (!Number.isInteger(payload.durationMs) || payload.durationMs < 0) throw new Error(`Invalid ${expectedKind} duration`);
  if (!Number.isInteger(payload.attemptCount) || payload.attemptCount < 1) throw new Error(`Invalid ${expectedKind} attempt count`);
  if (payload.status === 'passed') {
    const resultValues = expectedKind === 'pages-http-smoke'
      ? [payload.fileCount, payload.routeCount]
      : [payload.routes, payload.checks];
    if (resultValues.some(value => !Number.isInteger(value) || value < 1) ||
        (expectedKind === 'pages-browser-smoke' && (!Number.isInteger(payload.issues) || payload.issues < 0))) {
      throw new Error(`Invalid ${expectedKind} passed result`);
    }
  }
  return payload;
}

function readResult(filePath, expectedKind) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return validateResultPayload(readJson(filePath), expectedKind);
}

function readBudget(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Pages CI performance budget is required');
  const payload = readJson(filePath);
  assertExactKeys(payload, ['schemaVersion', 'kind', 'mode', 'basis', 'thresholdsMs'], 'Pages CI performance budget');
  if (payload.schemaVersion !== BUDGET_SCHEMA_VERSION || payload.kind !== 'pages-ci-performance-budget' || payload.mode !== 'warning-only') {
    throw new Error('Unexpected Pages CI performance budget schema');
  }
  assertExactKeys(payload.thresholdsMs, ['runtimeInstall', 'httpSmoke', 'browserSmoke'], 'Pages CI performance thresholds');
  for (const key of ['runtimeInstall', 'httpSmoke', 'browserSmoke']) {
    if (!Number.isInteger(payload.thresholdsMs?.[key]) || payload.thresholdsMs[key] <= 0) {
      throw new Error(`Invalid Pages CI performance threshold: ${key}`);
    }
  }
  if (!Array.isArray(payload.basis?.sampleRunIds) || payload.basis.sampleRunIds.length < 3) {
    throw new Error('Pages CI performance budget requires at least three sample runs');
  }
  assertExactKeys(payload.basis, ['sampleType', 'sourceCommit', 'sampleRunIds', 'observedJobSeconds', 'observedStepSeconds', 'observedRuntimeInstallMs'], 'Pages CI performance basis');
  assertExactKeys(payload.basis.observedJobSeconds, ['build', 'live-smoke'], 'Pages CI observed job durations');
  assertExactKeys(payload.basis.observedStepSeconds, ['runtimeInstall', 'stagedHttpAndBrowserSmoke', 'liveHttpSmoke', 'liveBrowserSmoke'], 'Pages CI observed step durations');
  if (payload.basis.sampleType !== 'same-commit warm-cache workflow_dispatch' || !/^[0-9a-f]{40}$/i.test(payload.basis.sourceCommit)) {
    throw new Error('Invalid Pages CI performance sample provenance');
  }
  if (new Set(payload.basis.sampleRunIds).size !== payload.basis.sampleRunIds.length || payload.basis.sampleRunIds.some(value => !/^\d+$/.test(value))) {
    throw new Error('Pages CI performance sample runs must be unique numeric IDs');
  }
  for (const [label, observations] of Object.entries({
    'build job observations': payload.basis.observedJobSeconds.build,
    'live job observations': payload.basis.observedJobSeconds['live-smoke'],
    'runtime install step observations': payload.basis.observedStepSeconds.runtimeInstall,
    'staged smoke observations': payload.basis.observedStepSeconds.stagedHttpAndBrowserSmoke,
    'live HTTP observations': payload.basis.observedStepSeconds.liveHttpSmoke,
    'live browser observations': payload.basis.observedStepSeconds.liveBrowserSmoke,
    'runtime install millisecond observations': payload.basis.observedRuntimeInstallMs,
  })) assertPositiveIntegerArray(observations, label);
  const sampleCount = payload.basis.sampleRunIds.length;
  if (payload.basis.observedJobSeconds.build.length !== sampleCount || payload.basis.observedJobSeconds['live-smoke'].length !== sampleCount ||
      payload.basis.observedStepSeconds.stagedHttpAndBrowserSmoke.length !== sampleCount || payload.basis.observedStepSeconds.liveHttpSmoke.length !== sampleCount ||
      payload.basis.observedStepSeconds.liveBrowserSmoke.length !== sampleCount || payload.basis.observedStepSeconds.runtimeInstall.length !== sampleCount * 2 ||
      payload.basis.observedRuntimeInstallMs.length !== sampleCount * 2) {
    throw new Error('Pages CI performance observations must align with the sample runs');
  }
  if (payload.thresholdsMs.runtimeInstall <= Math.max(...payload.basis.observedRuntimeInstallMs) ||
      payload.thresholdsMs.httpSmoke <= Math.max(...payload.basis.observedStepSeconds.liveHttpSmoke) * 1000 ||
      payload.thresholdsMs.browserSmoke <= Math.max(...payload.basis.observedStepSeconds.liveBrowserSmoke) * 1000) {
    throw new Error('Pages CI performance thresholds must exceed observed durations');
  }
  return payload;
}

function normalizedDuration(value) {
  if (value === undefined || value === null || value === '') return null;
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 0) throw new Error('Invalid runtime install duration');
  return duration;
}

function cacheState(value) {
  if (value === 'true') return 'exact-hit';
  if (value === 'false' || value === '') return 'miss';
  return 'not-recorded';
}

function performanceWarnings({ runtimeInstall, httpSmoke, browserSmoke }, budget) {
  const observations = [
    ['runtimeInstall', runtimeInstall.durationMs],
    ['httpSmoke', httpSmoke?.durationMs],
    ['browserSmoke', browserSmoke?.durationMs],
  ];
  return observations.flatMap(([signal, durationMs]) => {
    const thresholdMs = budget.thresholdsMs[signal];
    if (!Number.isInteger(durationMs) || durationMs <= thresholdMs) return [];
    return [{ signal, durationMs, thresholdMs }];
  });
}

function buildEvidence(environment = process.env) {
  const budget = readBudget(environment.PAGES_CI_PERFORMANCE_BUDGET_FILE);
  const httpSmoke = readResult(environment.PAGES_HTTP_SMOKE_RESULT_FILE, 'pages-http-smoke');
  const browserSmoke = readResult(environment.PAGES_BROWSER_SMOKE_RESULT_FILE, 'pages-browser-smoke');
  const runtimeInstall = {
    outcome: environment.PAGES_RUNTIME_INSTALL_OUTCOME || 'not-run',
    durationMs: normalizedDuration(environment.PAGES_RUNTIME_INSTALL_DURATION_MS),
  };
  const warnings = performanceWarnings({ runtimeInstall, httpSmoke, browserSmoke }, budget);
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    kind: 'pages-ci-evidence',
    job: environment.PAGES_CI_JOB || 'unknown',
    sourceCommit: environment.GITHUB_SHA || null,
    runId: environment.GITHUB_RUN_ID || null,
    runAttempt: Number(environment.GITHUB_RUN_ATTEMPT || 0) || null,
    runtimeLockSha256: /^[0-9a-f]{64}$/i.test(String(environment.PAGES_RUNTIME_LOCK_DIGEST || ''))
      ? String(environment.PAGES_RUNTIME_LOCK_DIGEST).toLowerCase()
      : null,
    cache: {
      npmContent: cacheState(environment.PAGES_NPM_CACHE_HIT),
      playwrightBrowser: cacheState(environment.PAGES_BROWSER_CACHE_HIT),
    },
    runtimeInstall,
    httpSmoke: httpSmoke || { status: environment.PAGES_HTTP_SMOKE_OUTCOME || 'not-run' },
    browserSmoke: browserSmoke || { status: environment.PAGES_BROWSER_SMOKE_OUTCOME || 'not-run' },
    performanceBudget: {
      mode: budget.mode,
      thresholdsMs: budget.thresholdsMs,
      sampleRunCount: budget.basis.sampleRunIds.length,
      withinBudget: warnings.length === 0,
      warnings,
    },
  };
}

function readEvidence(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Pages CI evidence file is required');
  const payload = readJson(filePath);
  assertExactKeys(payload, ['schemaVersion', 'kind', 'job', 'sourceCommit', 'runId', 'runAttempt', 'runtimeLockSha256', 'cache', 'runtimeInstall', 'httpSmoke', 'browserSmoke', 'performanceBudget'], 'Pages CI evidence');
  if (payload.schemaVersion !== EVIDENCE_SCHEMA_VERSION || payload.kind !== 'pages-ci-evidence') {
    throw new Error('Unexpected Pages CI evidence schema');
  }
  if (typeof payload.job !== 'string' || !payload.job || (payload.sourceCommit !== null && !/^[0-9a-f]{40}$/i.test(payload.sourceCommit)) ||
      (payload.runId !== null && !/^\d+$/.test(payload.runId)) ||
      (payload.runAttempt !== null && (!Number.isInteger(payload.runAttempt) || payload.runAttempt < 1)) ||
      (payload.runtimeLockSha256 !== null && !/^[0-9a-f]{64}$/i.test(payload.runtimeLockSha256))) {
    throw new Error('Invalid Pages CI evidence identity');
  }
  assertExactKeys(payload.cache, ['npmContent', 'playwrightBrowser'], 'Pages CI cache evidence');
  if (Object.values(payload.cache).some(value => !['exact-hit', 'miss', 'not-recorded'].includes(value))) throw new Error('Invalid Pages CI cache evidence');
  assertExactKeys(payload.runtimeInstall, ['outcome', 'durationMs'], 'Pages CI runtime evidence');
  if (typeof payload.runtimeInstall.outcome !== 'string' ||
      (payload.runtimeInstall.durationMs !== null && (!Number.isInteger(payload.runtimeInstall.durationMs) || payload.runtimeInstall.durationMs < 0))) {
    throw new Error('Invalid Pages CI runtime evidence');
  }
  for (const [key, kind] of [['httpSmoke', 'pages-http-smoke'], ['browserSmoke', 'pages-browser-smoke']]) {
    const result = payload[key];
    if (Object.keys(result || {}).length === 1 && typeof result?.status === 'string') {
      assertExactKeys(result, ['status'], `${kind} fallback evidence`);
      if (!['success', 'failure', 'cancelled', 'skipped', 'not-run'].includes(result.status)) throw new Error(`Invalid ${kind} fallback status`);
    } else {
      validateResultPayload(result, kind);
    }
  }
  assertExactKeys(payload.performanceBudget, ['mode', 'thresholdsMs', 'sampleRunCount', 'withinBudget', 'warnings'], 'Pages CI performance evidence');
  assertExactKeys(payload.performanceBudget.thresholdsMs, ['runtimeInstall', 'httpSmoke', 'browserSmoke'], 'Pages CI evidence thresholds');
  if (payload.performanceBudget.mode !== 'warning-only' || !Number.isInteger(payload.performanceBudget.sampleRunCount) || payload.performanceBudget.sampleRunCount < 3 ||
      typeof payload.performanceBudget.withinBudget !== 'boolean' || !Array.isArray(payload.performanceBudget.warnings)) {
    throw new Error('Invalid Pages CI performance evidence');
  }
  for (const key of ['runtimeInstall', 'httpSmoke', 'browserSmoke']) {
    if (!Number.isInteger(payload.performanceBudget.thresholdsMs[key]) || payload.performanceBudget.thresholdsMs[key] <= 0) throw new Error('Invalid Pages CI evidence thresholds');
  }
  for (const warning of payload.performanceBudget.warnings) {
    assertExactKeys(warning, ['signal', 'durationMs', 'thresholdMs'], 'Pages CI performance warning');
    if (!['runtimeInstall', 'httpSmoke', 'browserSmoke'].includes(warning.signal) || !Number.isInteger(warning.durationMs) ||
        !Number.isInteger(warning.thresholdMs) || warning.durationMs <= warning.thresholdMs ||
        warning.thresholdMs !== payload.performanceBudget.thresholdsMs[warning.signal]) {
      throw new Error('Invalid Pages CI performance warning');
    }
  }
  if (payload.performanceBudget.withinBudget !== (payload.performanceBudget.warnings.length === 0)) throw new Error('Inconsistent Pages CI performance evidence');
  return payload;
}

function formatDuration(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'not recorded';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function formatCacheHit(value) {
  if (value === 'exact-hit' || value === 'true') return 'exact hit';
  if (value === 'miss' || value === 'false' || value === '') return 'miss';
  return 'not recorded';
}

function formatSmoke(result, detail) {
  if (!result || !Number.isInteger(result.durationMs)) return `${result?.status || 'not run'}; evidence not produced`;
  const suffix = detail(result);
  return `${result.status}; ${formatDuration(result.durationMs)}; ${result.attemptCount} attempt(s)${suffix ? `; ${suffix}` : ''}`;
}

function buildSummary(evidence, jobStatus = 'unknown') {
  const shortDigest = evidence.runtimeLockSha256 ? evidence.runtimeLockSha256.slice(0, 16) : 'not recorded';
  const warnings = evidence.performanceBudget.warnings;
  const lines = [
    `## Pages CI evidence — ${evidence.job}`,
    '',
    '| Signal | Evidence |',
    '| --- | --- |',
    `| Job outcome | ${jobStatus} |`,
    `| Source commit | \`${evidence.sourceCommit || 'not recorded'}\` |`,
    `| Runtime lock SHA-256 | \`${shortDigest}\` |`,
    `| npm content cache | ${formatCacheHit(evidence.cache.npmContent)} |`,
    `| Playwright browser cache | ${formatCacheHit(evidence.cache.playwrightBrowser)} |`,
    `| Pinned runtime install | ${evidence.runtimeInstall.outcome}; ${formatDuration(evidence.runtimeInstall.durationMs)} |`,
    `| HTTP artifact smoke | ${formatSmoke(evidence.httpSmoke, value => `${value.fileCount ?? 'unknown'} files; ${value.routeCount ?? 'unknown'} routes`)} |`,
    `| Browser smoke | ${formatSmoke(evidence.browserSmoke, value => `${value.checks ?? 'unknown'} checks; ${value.issues ?? 'unknown'} issues`)} |`,
    `| Performance budget | ${warnings.length ? `${warnings.length} warning(s)` : 'within warning thresholds'}; warning-only; ${evidence.performanceBudget.sampleRunCount} baseline runs |`,
    '',
  ];
  if (warnings.length) {
    lines.push('### Performance warnings', '');
    for (const warning of warnings) {
      lines.push(`- ${warning.signal}: ${formatDuration(warning.durationMs)} > ${formatDuration(warning.thresholdMs)}`);
    }
    lines.push('');
  }
  lines.push('> Cache hits improve transfer time only. Every job still rebuilds `node_modules` from the lockfile and performs the full smoke checks.', '');
  return lines.join('\n');
}

function emitWarnings(evidence) {
  for (const warning of evidence.performanceBudget.warnings) {
    process.stdout.write(`::warning title=Pages CI performance::${warning.signal} ${warning.durationMs} ms exceeded warning threshold ${warning.thresholdMs} ms\n`);
  }
}

function prepareEvidence(environment = process.env) {
  if (!environment.PAGES_CI_EVIDENCE_FILE) throw new Error('PAGES_CI_EVIDENCE_FILE is required');
  const evidence = buildEvidence(environment);
  writeJsonAtomic(environment.PAGES_CI_EVIDENCE_FILE, evidence);
  emitWarnings(evidence);
  return evidence;
}

function writeSummary(environment = process.env) {
  if (!environment.GITHUB_STEP_SUMMARY) throw new Error('GITHUB_STEP_SUMMARY is required');
  const evidence = readEvidence(environment.PAGES_CI_EVIDENCE_FILE);
  fs.mkdirSync(path.dirname(environment.GITHUB_STEP_SUMMARY), { recursive: true });
  fs.appendFileSync(environment.GITHUB_STEP_SUMMARY, buildSummary(evidence, environment.PAGES_CI_JOB_STATUS), 'utf8');
}

if (require.main === module) {
  const action = process.env.PAGES_CI_ACTION || 'summary';
  if (action === 'prepare') prepareEvidence();
  else if (action === 'summary') writeSummary();
  else throw new Error(`Unsupported PAGES_CI_ACTION: ${action}`);
}

module.exports = {
  RESULT_SCHEMA_VERSION, EVIDENCE_SCHEMA_VERSION, BUDGET_SCHEMA_VERSION,
  readResult, readBudget, performanceWarnings, buildEvidence, readEvidence,
  formatDuration, formatCacheHit, formatSmoke, buildSummary, emitWarnings,
  prepareEvidence, writeSummary,
};
