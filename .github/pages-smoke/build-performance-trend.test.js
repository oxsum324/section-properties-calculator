const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const trend = require('./build-performance-trend.js');

function evidence(job, runId, durations, overrides = {}) {
  const browser = job === 'build' ? durations.buildBrowser : durations.liveBrowser;
  const http = job === 'build' ? durations.buildHttp : durations.liveHttp;
  const runtime = job === 'build' ? durations.buildRuntime : durations.liveRuntime;
  return {
    schemaVersion: 1, kind: 'pages-ci-evidence', job,
    sourceCommit: String(runId).padStart(40, 'a').slice(-40), runId: String(runId), runAttempt: 1,
    runtimeLockSha256: 'b'.repeat(64),
    cache: { npmContent: 'exact-hit', playwrightBrowser: 'exact-hit' },
    runtimeInstall: { outcome: 'success', durationMs: runtime },
    httpSmoke: { schemaVersion: 1, kind: 'pages-http-smoke', status: 'passed', durationMs: http, attemptCount: 1, fileCount: 318, routeCount: 43 },
    browserSmoke: { schemaVersion: 1, kind: 'pages-browser-smoke', status: 'passed', durationMs: browser, attemptCount: 1, routes: 43, checks: 86, issues: 0 },
    performanceBudget: { mode: 'warning-only', thresholdsMs: { runtimeInstall: 8000, httpSmoke: 90000, browserSmoke: 180000 }, sampleRunCount: 3, withinBudget: true, warnings: [] },
    ...overrides,
  };
}

function writePair(root, runId, durations, overrides = {}) {
  const runRoot = path.join(root, String(runId));
  fs.mkdirSync(runRoot, { recursive: true });
  fs.writeFileSync(path.join(runRoot, 'build.json'), JSON.stringify(evidence('build', runId, durations, overrides.build)));
  fs.writeFileSync(path.join(runRoot, 'live-smoke.json'), JSON.stringify(evidence('live-smoke', runId, durations, overrides.live)));
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-ci-trend-'));
try {
  const samples = [
    { buildRuntime: 1000, buildHttp: 100, buildBrowser: 10000, liveRuntime: 1100, liveHttp: 200, liveBrowser: 11000 },
    { buildRuntime: 3000, buildHttp: 300, buildBrowser: 30000, liveRuntime: 3100, liveHttp: 400, liveBrowser: 31000 },
    { buildRuntime: 2000, buildHttp: 200, buildBrowser: 20000, liveRuntime: 2100, liveHttp: 300, liveBrowser: 21000 },
    { buildRuntime: 5000, buildHttp: 500, buildBrowser: 50000, liveRuntime: 5100, liveHttp: 600, liveBrowser: 51000 },
    { buildRuntime: 4000, buildHttp: 400, buildBrowser: 40000, liveRuntime: 4100, liveHttp: 500, liveBrowser: 41000 },
  ];
  samples.forEach((sample, index) => writePair(root, 100 + index, sample, index === 4 ? { live: { runAttempt: 2 } } : {}));
  const pairs = trend.loadPairs(root);
  assert.equal(pairs[4].build.runAttempt, 1, 'failed-job rerun retains the successful build receipt');
  assert.equal(pairs[4].live.runAttempt, 2, 'failed-job rerun replaces the live receipt');
  assert.equal(pairs[4].runAttempt, 2, 'pair records the newest contributing attempt');
  const result = trend.validateTrend(trend.buildTrend(pairs, { currentRunId: '104', generatedAt: '2026-08-13T00:00:00.000Z', maxRuns: 20 }));
  assert.equal(result.status, 'ready');
  assert.equal(result.sampleCount, 5);
  assert.equal(result.currentRunEligible, true);
  assert.equal(result.jobs.build.runtimeInstall.p50Ms, 3000);
  assert.equal(result.jobs.build.runtimeInstall.p95Ms, 5000);
  assert.equal(result.jobs['live-smoke'].browserSmoke.p50Ms, 31000);
  assert.deepEqual(result.includedRuns.map(item => item.runId), ['100', '101', '102', '103', '104']);
  assert.equal(result.includedRuns[2].observationsMs.build.browserSmoke, 20000);
  assert.equal(result.includedRuns[4].runAttempt, 2);
  assert.match(trend.buildSummary(result), /P50.*P95/);

  assert.doesNotThrow(() => trend.validatePair(
    evidence('build', 500, samples[0], { runAttempt: 1 }),
    evidence('live-smoke', 500, samples[0], { runAttempt: 2 }),
  ), 'same-run receipts may come from different workflow attempts');
  assert.throws(() => trend.validatePair(
    evidence('build', 500, samples[0]),
    evidence('live-smoke', 501, samples[0]),
  ), /pair mismatch: sourceCommit|pair mismatch: runId/, 'different workflow runs cannot be paired');

  const collecting = trend.buildTrend(pairs.slice(0, 2), { currentRunId: '101', generatedAt: '2026-08-13T00:00:00.000Z' });
  assert.equal(collecting.status, 'collecting');
  assert.equal(collecting.sampleCount, 2);
  assert.throws(() => trend.buildTrend(pairs, { currentRunId: '999' }), /include the current workflow run/);
  const changedLockPairs = [...pairs.slice(0, 4), { ...pairs[4], runtimeLockSha256: 'c'.repeat(64), build: { ...pairs[4].build, runtimeLockSha256: 'c'.repeat(64) }, live: { ...pairs[4].live, runtimeLockSha256: 'c'.repeat(64) } }];
  const reset = trend.buildTrend(changedLockPairs, { currentRunId: '104', generatedAt: '2026-08-13T00:00:00.000Z' });
  assert.equal(reset.status, 'collecting', 'runtime lock changes start a new comparable trend series');
  assert.equal(reset.sampleCount, 1);

  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-ci-trend-missing-'));
  try {
    writePair(missingRoot, 200, samples[0]);
    fs.unlinkSync(path.join(missingRoot, '200', 'live-smoke.json'));
    assert.throws(() => trend.loadPairs(missingRoot), /missing one evidence receipt/);
  } finally { fs.rmSync(missingRoot, { recursive: true, force: true }); }

  const coldRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-ci-trend-cold-'));
  try {
    writePair(coldRoot, 300, samples[0], { build: { cache: { npmContent: 'miss', playwrightBrowser: 'exact-hit' } } });
    const cold = trend.validateTrend(trend.buildTrend(trend.loadPairs(coldRoot), { currentRunId: '300', generatedAt: '2026-08-13T00:00:00.000Z' }));
    assert.equal(cold.status, 'collecting');
    assert.equal(cold.sampleCount, 0);
    assert.equal(cold.currentRunEligible, false);
    assert.deepEqual(cold.currentRunExclusionReasons, ['build-npm-cache-not-exact']);
    assert.equal(cold.jobs.build.runtimeInstall.p50Ms, null);
  } finally { fs.rmSync(coldRoot, { recursive: true, force: true }); }

  const extra = { ...result, undeclared: true };
  assert.throws(() => trend.validateTrend(extra), /Unexpected Pages CI performance trend fields/);
  const forged = JSON.parse(JSON.stringify(result));
  forged.jobs.build.runtimeInstall.p50Ms = 1;
  assert.throws(() => trend.validateTrend(forged), /Invalid Pages CI trend statistics/, 'trend statistics must reproduce from retained observations');
  console.log('Pages CI performance trend contract OK');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
