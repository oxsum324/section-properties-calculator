'use strict';

function validBytes(value, { allowZero = false } = {}) {
  return Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1);
}

function sourceDriftPaths(before, after) {
  const paths = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...paths].filter(sourcePath => before?.[sourcePath] !== after?.[sourcePath]).sort();
}

function collectFailureRecords(functionalFailures, thrownError, sourceDrift = []) {
  const errors = [...functionalFailures];
  if (thrownError) errors.push(thrownError.stack || String(thrownError));
  errors.push(...sourceDrift.map(sourcePath => `source changed during audit: ${sourcePath}`));
  return errors;
}

function validateBaseline(candidate, expectedRoutes) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return ['baseline must be an object'];
  if (candidate.schemaVersion !== 1) errors.push('baseline schemaVersion must be 1');
  if (!Array.isArray(expectedRoutes) || expectedRoutes.length !== 52 || new Set(expectedRoutes).size !== expectedRoutes.length) {
    errors.push('expected routes must contain 52 unique entries');
  }
  if (!Array.isArray(candidate.routes)) errors.push('baseline routes must be an array');
  if (candidate.routeCount !== 52 || !Array.isArray(candidate.routes) || candidate.routes.length !== 52) errors.push('baseline must contain exactly 52 routes');
  if (!validBytes(candidate.totalJsBytes)) errors.push('baseline totalJsBytes must be a positive safe integer');
  if (!validBytes(candidate.docxRuntimeBytes)) errors.push('baseline docxRuntimeBytes must be a positive safe integer');
  if (typeof candidate.docxRuntimePath !== 'string' || !candidate.docxRuntimePath) errors.push('baseline docxRuntimePath is required');
  if (typeof candidate.sourceCommit !== 'string' || !candidate.sourceCommit) errors.push('baseline sourceCommit is required');
  if (typeof candidate.capturedAt !== 'string' || !Number.isFinite(Date.parse(candidate.capturedAt))) errors.push('baseline capturedAt must be a valid timestamp');
  if (Array.isArray(candidate.routes)) {
    const seen = new Set();
    let total = 0;
    for (const item of candidate.routes) {
      if (!item || typeof item.route !== 'string' || !item.route) { errors.push('route entry has no route'); continue; }
      if (seen.has(item.route)) errors.push(`duplicate route ${item.route}`);
      seen.add(item.route);
      if (!validBytes(item.jsBytes, { allowZero: true })) errors.push(`${item.route}: jsBytes must be a finite non-negative safe integer`);
      else total += item.jsBytes;
      if (!Array.isArray(item.sharedScripts)) { errors.push(`${item.route}: sharedScripts must be an array`); continue; }
      const scriptPaths = new Set();
      for (const script of item.sharedScripts) {
        if (!script || typeof script.path !== 'string' || !script.path) { errors.push(`${item.route}: shared script path is required`); continue; }
        if (scriptPaths.has(script.path)) errors.push(`${item.route}: duplicate shared script ${script.path}`);
        scriptPaths.add(script.path);
        if (!validBytes(script.bytes)) errors.push(`${item.route}: ${script.path} bytes must be a positive safe integer`);
      }
    }
    if (Array.isArray(expectedRoutes) && expectedRoutes.length === 52) {
      const expected = new Set(expectedRoutes);
      for (const route of expectedRoutes) if (!seen.has(route)) errors.push(`missing route ${route}`);
      for (const route of seen) if (!expected.has(route)) errors.push(`unexpected route ${route}`);
    }
    if (validBytes(candidate.totalJsBytes) && Number.isSafeInteger(total) && candidate.totalJsBytes !== total) errors.push('baseline totalJsBytes does not equal route sum');
  }
  return errors;
}

function analyzeResults(results, baseline, baseUrl) {
  const functionalFailures = [];
  const capacityDifferences = [];
  const seenRoutes = new Set();
  if (results.length !== 52) functionalFailures.push(`expected 52 results, got ${results.length}`);
  const baselineByRoute = new Map(baseline.routes.map(item => [item.route, item]));
  for (const result of results) {
    if (seenRoutes.has(result.route)) functionalFailures.push(`duplicate result route ${result.route}`);
    seenRoutes.add(result.route);
    if (result.status !== 200) functionalFailures.push(`${result.route}: HTTP ${result.status}`);
    if (result.navigationError) functionalFailures.push(`${result.route}: ${result.navigationError}`);
    if (!Array.isArray(result.scripts)) functionalFailures.push(`${result.route}: scripts must be an array`);
    const scripts = Array.isArray(result.scripts) ? result.scripts : [];
    let scriptByteSum = 0;
    let allScriptBytesValid = true;
    for (const script of scripts) {
      if (script.error || script.status !== 200 || !validBytes(script.bytes)) functionalFailures.push(`${result.route}: script ${script.url} status=${script.status} error=${script.error}`);
      if (!validBytes(script.bytes)) allScriptBytesValid = false;
      else scriptByteSum += script.bytes;
    }
    if (!validBytes(result.jsBytes, { allowZero: true })) functionalFailures.push(`${result.route}: jsBytes must be a finite non-negative safe integer`);
    else if (allScriptBytesValid && result.jsBytes !== scriptByteSum) functionalFailures.push(`${result.route}: jsBytes ${result.jsBytes} does not equal script byte sum ${scriptByteSum}`);
    if ((result.workflowScripts || []).length && !result.workflowPanel) functionalFailures.push(`${result.route}: workflow script loaded without a workflow panel`);
    const prior = baselineByRoute.get(result.route);
    if (!prior) { functionalFailures.push(`${result.route}: missing baseline route`); continue; }
    const before = new Map(prior.sharedScripts.map(script => [script.path, script.bytes]));
    const currentShared = new Map();
    for (const script of scripts) {
      if (!isMeasuredShared(script.url, baseUrl)) continue;
      const scriptPath = normalizedPath(script.url);
      if (validBytes(script.bytes)) currentShared.set(scriptPath, (currentShared.get(scriptPath) || 0) + script.bytes);
    }
    for (const [scriptPath, bytes] of currentShared) {
      if (!before.has(scriptPath)) capacityDifferences.push(`${result.route}: new third-party/shared script ${scriptPath} (${bytes} bytes)`);
      else if (bytes > before.get(scriptPath)) capacityDifferences.push(`${result.route}: third-party/shared script grew ${scriptPath} ${before.get(scriptPath)} -> ${bytes} bytes`);
    }
  }
  for (const route of baseline.routes.map(item => item.route)) if (!seenRoutes.has(route)) functionalFailures.push(`missing result route ${route}`);
  return { functionalFailures, capacityDifferences };
}

function normalizedPath(url) { const parsed = new URL(url); return parsed.pathname + parsed.search; }
function isMeasuredShared(url, baseUrl) {
  const parsed = new URL(url);
  return parsed.origin !== new URL(baseUrl).origin || /^\/npm\//i.test(parsed.pathname)
    || /\/(core|shared|vendor)\//i.test(parsed.pathname)
    || /\/(tool-workflow(?:-adapters)?|project-meta-profile|report-(?:utils|docx)|report)\.js(?:$|\?)/i.test(parsed.pathname + parsed.search);
}

function persistAcceptedBaseline({ functionalFailures, sourceDrift = [], capacityDifferences, nextBaseline, expectedRoutes, write }) {
  if (functionalFailures.length || sourceDrift.length) return {
    written: false,
    errors: [...functionalFailures, ...sourceDrift.map(sourcePath => `source changed during audit: ${sourcePath}`)],
  };
  const validationErrors = validateBaseline(nextBaseline, expectedRoutes);
  if (validationErrors.length) return { written: false, errors: validationErrors };
  write(nextBaseline);
  return { written: true, errors: [], acceptedCapacityDifferences: [...capacityDifferences] };
}

function resetBaseline({ docxCheck, ...options }) {
  docxCheck();
  return persistAcceptedBaseline(options);
}

module.exports = { validBytes, validateBaseline, analyzeResults, persistAcceptedBaseline, resetBaseline, sourceDriftPaths, collectFailureRecords };
