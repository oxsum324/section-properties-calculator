const fs = require('node:fs');
const path = require('node:path');
const { readEvidence } = require('./write-ci-summary.js');

const TREND_SCHEMA_VERSION = 1;
const MINIMUM_COMPLETE_RUNS = 3;
const DEFAULT_MAX_RUNS = 20;
const JOBS = ['build', 'live-smoke'];
const SIGNALS = ['runtimeInstall', 'httpSmoke', 'browserSmoke'];

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`Unexpected ${label} fields`);
}

function writeJsonAtomic(filePath, payload) {
  const target = path.resolve(filePath);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
}

function percentileNearestRank(values, percentile) {
  if (!Array.isArray(values) || values.length < 1) throw new Error('Percentile requires at least one observation');
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(percentile * ordered.length) - 1];
}

function evidenceDuration(evidence, signal) {
  if (signal === 'runtimeInstall') return evidence.runtimeInstall.durationMs;
  if (signal === 'httpSmoke') return evidence.httpSmoke.durationMs;
  return evidence.browserSmoke.durationMs;
}

function validatePair(build, live) {
  if (build.job !== 'build' || live.job !== 'live-smoke') throw new Error('Pages CI trend requires build and live-smoke evidence');
  for (const key of ['sourceCommit', 'runId', 'runtimeLockSha256']) {
    if (build[key] !== live[key]) throw new Error(`Pages CI evidence pair mismatch: ${key}`);
  }
  for (const evidence of [build, live]) {
    if (!Number.isInteger(evidence.runAttempt) || evidence.runAttempt < 1) throw new Error('Pages CI trend requires a positive runAttempt for each receipt');
    if (evidence.runtimeInstall.outcome !== 'success' || evidence.httpSmoke.status !== 'passed' || evidence.browserSmoke.status !== 'passed') {
      throw new Error('Pages CI trend accepts successful complete evidence only');
    }
    for (const signal of SIGNALS) {
      if (!Number.isInteger(evidenceDuration(evidence, signal)) || evidenceDuration(evidence, signal) < 0) throw new Error(`Pages CI trend missing duration: ${signal}`);
    }
  }
}

function exclusionReasons(pair) {
  const reasons = [];
  for (const [job, evidence] of [['build', pair.build], ['live-smoke', pair.live]]) {
    if (evidence.cache.npmContent !== 'exact-hit') reasons.push(`${job}-npm-cache-not-exact`);
    if (evidence.cache.playwrightBrowser !== 'exact-hit') reasons.push(`${job}-browser-cache-not-exact`);
  }
  return reasons;
}

function loadPairs(directory) {
  if (!directory || !fs.existsSync(directory)) throw new Error('Pages CI trend input directory is required');
  const pairs = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const runRoot = path.join(directory, entry.name);
    const buildPath = path.join(runRoot, 'build.json');
    const livePath = path.join(runRoot, 'live-smoke.json');
    if (!fs.existsSync(buildPath) || !fs.existsSync(livePath)) throw new Error(`Pages CI trend run ${entry.name} is missing one evidence receipt`);
    const build = readEvidence(buildPath);
    const live = readEvidence(livePath);
    validatePair(build, live);
    if (build.runId !== entry.name) throw new Error(`Pages CI trend directory does not match runId: ${entry.name}`);
    pairs.push({
      runId: entry.name,
      sourceCommit: build.sourceCommit,
      // A failed-job rerun can legitimately retain build evidence from an
      // earlier attempt and replace only live-smoke evidence. The pair is
      // finalized by the newest receipt while remaining bound to one run.
      runAttempt: Math.max(build.runAttempt, live.runAttempt),
      runtimeLockSha256: build.runtimeLockSha256,
      build,
      live,
    });
  }
  pairs.sort((left, right) => Number(left.runId) - Number(right.runId));
  if (!pairs.length) throw new Error('Pages CI trend requires at least one complete evidence pair');
  if (new Set(pairs.map(pair => pair.runId)).size !== pairs.length) throw new Error('Pages CI trend run IDs must be unique');
  return pairs;
}

function summarizeSignal(pairs, job, signal) {
  const values = pairs.map(pair => evidenceDuration(pair[job === 'build' ? 'build' : 'live'], signal));
  if (!values.length) return { sampleCount: 0, minimumMs: null, p50Ms: null, p95Ms: null, maximumMs: null };
  return {
    sampleCount: values.length,
    minimumMs: Math.min(...values),
    p50Ms: percentileNearestRank(values, 0.50),
    p95Ms: percentileNearestRank(values, 0.95),
    maximumMs: Math.max(...values),
  };
}

function pairObservations(pair) {
  return Object.fromEntries(JOBS.map(job => [job, Object.fromEntries(SIGNALS.map(signal => [signal, evidenceDuration(pair[job === 'build' ? 'build' : 'live'], signal)]))]));
}

function buildTrend(pairs, { currentRunId = null, generatedAt = new Date().toISOString(), maxRuns = DEFAULT_MAX_RUNS } = {}) {
  if (!Number.isInteger(maxRuns) || maxRuns < MINIMUM_COMPLETE_RUNS) throw new Error('Pages CI trend maxRuns must be at least three');
  const latest = pairs[pairs.length - 1];
  if (currentRunId !== null && latest.runId !== String(currentRunId)) throw new Error('Pages CI trend must include the current workflow run');
  const currentExclusionReasons = exclusionReasons(latest);
  const compatible = pairs.filter(pair => pair.runtimeLockSha256 === latest.runtimeLockSha256 && exclusionReasons(pair).length === 0);
  const selected = compatible.slice(-maxRuns);
  const jobs = {};
  for (const job of JOBS) {
    jobs[job] = {};
    for (const signal of SIGNALS) jobs[job][signal] = summarizeSignal(selected, job, signal);
  }
  return {
    schemaVersion: TREND_SCHEMA_VERSION,
    kind: 'pages-ci-performance-trend',
    status: selected.length >= MINIMUM_COMPLETE_RUNS ? 'ready' : 'collecting',
    generatedAt,
    minimumCompleteRuns: MINIMUM_COMPLETE_RUNS,
    maximumIncludedRuns: maxRuns,
    sampleCount: selected.length,
    currentRunId: String(currentRunId || latest.runId),
    currentRunEligible: currentExclusionReasons.length === 0,
    currentRunExclusionReasons: currentExclusionReasons,
    runtimeLockSha256: latest.runtimeLockSha256,
    includedRuns: selected.map(pair => ({ runId: pair.runId, sourceCommit: pair.sourceCommit, runAttempt: pair.runAttempt, observationsMs: pairObservations(pair) })),
    jobs,
  };
}

function validateTrend(payload) {
  assertExactKeys(payload, ['schemaVersion', 'kind', 'status', 'generatedAt', 'minimumCompleteRuns', 'maximumIncludedRuns', 'sampleCount', 'currentRunId', 'currentRunEligible', 'currentRunExclusionReasons', 'runtimeLockSha256', 'includedRuns', 'jobs'], 'Pages CI performance trend');
  if (payload.schemaVersion !== TREND_SCHEMA_VERSION || payload.kind !== 'pages-ci-performance-trend' || !['collecting', 'ready'].includes(payload.status)) throw new Error('Unexpected Pages CI performance trend schema');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(payload.generatedAt) || !/^\d+$/.test(payload.currentRunId) || !/^[0-9a-f]{64}$/i.test(payload.runtimeLockSha256) || !Number.isInteger(payload.sampleCount) || payload.sampleCount < 0 ||
      payload.minimumCompleteRuns !== MINIMUM_COMPLETE_RUNS || !Number.isInteger(payload.maximumIncludedRuns) || payload.maximumIncludedRuns < MINIMUM_COMPLETE_RUNS ||
      payload.sampleCount > payload.maximumIncludedRuns || !Array.isArray(payload.includedRuns) || payload.includedRuns.length !== payload.sampleCount ||
      payload.status !== (payload.sampleCount >= MINIMUM_COMPLETE_RUNS ? 'ready' : 'collecting')) throw new Error('Invalid Pages CI performance trend identity');
  const allowedReasons = new Set(['build-npm-cache-not-exact', 'build-browser-cache-not-exact', 'live-smoke-npm-cache-not-exact', 'live-smoke-browser-cache-not-exact']);
  if (typeof payload.currentRunEligible !== 'boolean' || !Array.isArray(payload.currentRunExclusionReasons) ||
      payload.currentRunExclusionReasons.some(reason => !allowedReasons.has(reason)) || new Set(payload.currentRunExclusionReasons).size !== payload.currentRunExclusionReasons.length ||
      payload.currentRunEligible !== (payload.currentRunExclusionReasons.length === 0)) throw new Error('Invalid Pages CI performance trend current-run eligibility');
  if (payload.currentRunEligible && payload.includedRuns[payload.includedRuns.length - 1]?.runId !== payload.currentRunId) throw new Error('Pages CI performance trend omits the eligible current run');
  if (!payload.currentRunEligible && payload.includedRuns.some(item => item.runId === payload.currentRunId)) throw new Error('Pages CI performance trend includes an ineligible current run');
  if (new Set(payload.includedRuns.map(item => item.runId)).size !== payload.includedRuns.length ||
      payload.includedRuns.some((item, index) => index > 0 && Number(item.runId) <= Number(payload.includedRuns[index - 1].runId))) throw new Error('Pages CI performance trend run IDs must be unique and increasing');
  for (const item of payload.includedRuns) {
    assertExactKeys(item, ['runId', 'sourceCommit', 'runAttempt', 'observationsMs'], 'Pages CI trend run');
    if (!/^\d+$/.test(item.runId) || !/^[0-9a-f]{40}$/i.test(item.sourceCommit) || !Number.isInteger(item.runAttempt) || item.runAttempt < 1) throw new Error('Invalid Pages CI trend run');
    assertExactKeys(item.observationsMs, JOBS, 'Pages CI trend run observations');
    for (const job of JOBS) {
      assertExactKeys(item.observationsMs[job], SIGNALS, `Pages CI trend run ${job} observations`);
      if (SIGNALS.some(signal => !Number.isInteger(item.observationsMs[job][signal]) || item.observationsMs[job][signal] < 0)) throw new Error('Invalid Pages CI trend observations');
    }
  }
  assertExactKeys(payload.jobs, JOBS, 'Pages CI trend jobs');
  for (const job of JOBS) {
    assertExactKeys(payload.jobs[job], SIGNALS, `Pages CI trend ${job}`);
    for (const signal of SIGNALS) {
      const stats = payload.jobs[job][signal];
      assertExactKeys(stats, ['sampleCount', 'minimumMs', 'p50Ms', 'p95Ms', 'maximumMs'], `Pages CI trend ${job} ${signal}`);
      const observations = payload.includedRuns.map(item => item.observationsMs[job][signal]);
      const expected = observations.length
        ? { sampleCount: observations.length, minimumMs: Math.min(...observations), p50Ms: percentileNearestRank(observations, 0.50), p95Ms: percentileNearestRank(observations, 0.95), maximumMs: Math.max(...observations) }
        : { sampleCount: 0, minimumMs: null, p50Ms: null, p95Ms: null, maximumMs: null };
      if (Object.keys(expected).some(key => stats[key] !== expected[key])) throw new Error(`Invalid Pages CI trend statistics: ${job} ${signal}`);
    }
  }
  return payload;
}

function readTrend(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Pages CI performance trend file is required');
  return validateTrend(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function buildSummary(trend) {
  const lines = [
    '## Pages CI performance trend', '',
    `Status: **${trend.status}** — ${trend.sampleCount}/${trend.minimumCompleteRuns} complete exact warm-cache run(s); newest ${trend.currentRunId}${trend.currentRunEligible ? ' included' : ` excluded (${trend.currentRunExclusionReasons.join(', ')})`}.`, '',
    '| Job | Signal | P50 | P95 | Range |', '| --- | --- | ---: | ---: | ---: |',
  ];
  for (const job of JOBS) for (const signal of SIGNALS) {
    const value = trend.jobs[job][signal];
    lines.push(`| ${job} | ${signal} | ${value.p50Ms ?? 'n/a'}${value.p50Ms === null ? '' : ' ms'} | ${value.p95Ms ?? 'n/a'}${value.p95Ms === null ? '' : ' ms'} | ${value.minimumMs === null ? 'n/a' : `${value.minimumMs}–${value.maximumMs} ms`} |`);
  }
  lines.push('', '> This is private CI governance evidence. It is not part of GitHub Pages, a calculation book, or a formal attachment.', '');
  return lines.join('\n');
}

function run(environment = process.env) {
  if (!environment.PAGES_CI_TREND_FILE) throw new Error('PAGES_CI_TREND_FILE is required');
  const action = environment.PAGES_CI_TREND_ACTION || 'prepare';
  if (action === 'prepare') {
    if (!environment.PAGES_CI_TREND_INPUT_DIR) throw new Error('PAGES_CI_TREND_INPUT_DIR is required');
    const trend = validateTrend(buildTrend(loadPairs(environment.PAGES_CI_TREND_INPUT_DIR), {
      currentRunId: environment.GITHUB_RUN_ID,
      maxRuns: Number(environment.PAGES_CI_TREND_MAX_RUNS || DEFAULT_MAX_RUNS),
    }));
    writeJsonAtomic(environment.PAGES_CI_TREND_FILE, trend);
    return trend;
  }
  if (action === 'summary') {
    if (!environment.GITHUB_STEP_SUMMARY) throw new Error('GITHUB_STEP_SUMMARY is required');
    const trend = readTrend(environment.PAGES_CI_TREND_FILE);
    fs.appendFileSync(environment.GITHUB_STEP_SUMMARY, buildSummary(trend), 'utf8');
    return trend;
  }
  throw new Error(`Unsupported PAGES_CI_TREND_ACTION: ${action}`);
}

if (require.main === module) run();

module.exports = { TREND_SCHEMA_VERSION, MINIMUM_COMPLETE_RUNS, DEFAULT_MAX_RUNS, percentileNearestRank, validatePair, exclusionReasons, loadPairs, summarizeSignal, buildTrend, validateTrend, readTrend, buildSummary, run };
