'use strict';
// 首頁正式路由數：新增或移除工具時更新，並由委託人授權以 --write-baseline 重設基準。
const HOME_ROUTE_COUNT = 53;

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

function compareRouteSets(label, actual, expected, errors) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  for (const route of expectedSet) if (!actualSet.has(route)) errors.push(`${label}: missing route ${route}`);
  for (const route of actualSet) if (!expectedSet.has(route)) errors.push(`${label}: unexpected route ${route}`);
}

function validateHomepageInventory({ homepageRoutes, baselineRoutes, updateRoutes, routeFileMap }) {
  const errors = [];
  const validateList = (label, routes) => {
    if (!Array.isArray(routes)) { errors.push(`${label} must be an array`); return []; }
    const seen = new Set();
    for (const route of routes) {
      if (typeof route !== 'string' || !route) errors.push(`${label} contains an invalid route`);
      else if (seen.has(route)) errors.push(`${label} contains duplicate route ${route}`);
      else seen.add(route);
    }
    if (routes.length !== HOME_ROUTE_COUNT) errors.push(`${label} must contain exactly ${HOME_ROUTE_COUNT} routes, got ${routes.length}`);
    return routes.filter(route => typeof route === 'string' && route);
  };
  const home = validateList('homepage tools hrefs', homepageRoutes);
  const baseline = validateList('baseline routes', baselineRoutes);
  const dates = updateRoutes && typeof updateRoutes === 'object' && !Array.isArray(updateRoutes) ? Object.keys(updateRoutes) : [];
  if (!updateRoutes || typeof updateRoutes !== 'object' || Array.isArray(updateRoutes)) errors.push('homepage date routes must be an object');
  else {
    if (dates.length !== HOME_ROUTE_COUNT) errors.push(`homepage date routes must contain exactly ${HOME_ROUTE_COUNT} routes, got ${dates.length}`);
    for (const [route, date] of Object.entries(updateRoutes)) {
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) {
        errors.push(`homepage date route ${route} must have a valid YYYY-MM-DD date`);
      }
    }
  }
  compareRouteSets('baseline routes vs homepage tools hrefs', baseline, home, errors);
  compareRouteSets('homepage date routes vs homepage tools hrefs', dates, home, errors);
  if (!routeFileMap || typeof routeFileMap !== 'object' || Array.isArray(routeFileMap)) errors.push('routeFileMap must be an object');
  else for (const route of home) {
    if (!Object.prototype.hasOwnProperty.call(routeFileMap, route) || typeof routeFileMap[route] !== 'string' || !routeFileMap[route]) {
      errors.push(`homepage route ${route} has no routeFileMap target`);
    }
  }
  return errors;
}

function validateSourceReceipts(before, after) {
  const errors = [];
  const sourceDrift = sourceDriftPaths(before?.sourceSha256, after?.sourceSha256);
  if (before?.testedHead !== after?.testedHead) errors.push(`HEAD changed during audit: ${before?.testedHead} -> ${after?.testedHead}`);
  if (sourceDrift.length) errors.push(`source changed during audit: ${sourceDrift.join(', ')}`);
  return { errors, sourceDrift };
}

function validateBaseline(candidate, expectedRoutes) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return ['baseline must be an object'];
  if (candidate.schemaVersion !== 1) errors.push('baseline schemaVersion must be 1');
  if (!Array.isArray(expectedRoutes) || expectedRoutes.length !== HOME_ROUTE_COUNT || new Set(expectedRoutes).size !== expectedRoutes.length) {
    errors.push(`expected routes must contain ${HOME_ROUTE_COUNT} unique entries`);
  }
  if (!Array.isArray(candidate.routes)) errors.push('baseline routes must be an array');
  if (candidate.routeCount !== HOME_ROUTE_COUNT || !Array.isArray(candidate.routes) || candidate.routes.length !== HOME_ROUTE_COUNT) errors.push(`baseline must contain exactly ${HOME_ROUTE_COUNT} routes`);
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
    if (Array.isArray(expectedRoutes) && expectedRoutes.length === HOME_ROUTE_COUNT) {
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
  if (results.length !== HOME_ROUTE_COUNT) functionalFailures.push(`expected ${HOME_ROUTE_COUNT} results, got ${results.length}`);
  const baselineByRoute = new Map(baseline.routes.map(item => [item.route, item]));
  for (const [index, result] of results.entries()) {
    const expectedRoute = baseline.routes[index]?.route;
    if (expectedRoute && result.route !== expectedRoute) functionalFailures.push(`result order differs from baseline at ${index}: expected ${expectedRoute}, got ${result.route}`);
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

module.exports = { HOME_ROUTE_COUNT, validBytes, validateBaseline, validateHomepageInventory, validateSourceReceipts, analyzeResults, persistAcceptedBaseline, resetBaseline, sourceDriftPaths, collectFailureRecords };
