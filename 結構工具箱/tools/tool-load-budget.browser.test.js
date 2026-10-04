const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { chromium } = require(path.join(process.cwd(), 'output', 'playwright', 'phase2-quality-deps', 'node_modules', 'playwright'));
const { analyzeResults, collectFailureRecords, resetBaseline, sourceDriftPaths, validateBaseline } = require('./tool-load-budget-contract');

const repo = path.resolve(__dirname, '../..');
const baselinePath = path.join(__dirname, 'tool-load-budget-baseline.json');
const outputRoot = path.join(repo, 'output', 'playwright');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const edge = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(candidate => fs.existsSync(candidate));
assert(edge, 'Microsoft Edge was not found');
let activeAudit = null;

function extractLiteral(source, name) {
  const prefix = `const ${name} = `;
  const start = source.indexOf(prefix);
  assert(start >= 0, `Missing ${name}`);
  const valueStart = start + prefix.length;
  const open = source[valueStart];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let quote = null;
  for (let index = valueStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') quote = char;
    else if (char === open) depth += 1;
    else if (char === close && --depth === 0) return require('vm').runInNewContext(`(${source.slice(valueStart, index + 1)})`);
  }
  throw new Error(`Unterminated ${name}`);
}

function sharedPath(pathname) {
  return /^\/npm\//i.test(pathname)
    || /\/(core|shared|vendor)\//i.test(pathname)
    || /\/(tool-workflow(?:-adapters)?|project-meta-profile|report-(?:utils|docx)|report)\.js(?:$|\?)/i.test(pathname);
}

function isThirdPartyOrShared(url, baseUrl) {
  const parsed = new URL(url);
  return parsed.origin !== new URL(baseUrl).origin || sharedPath(parsed.pathname + parsed.search);
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Local server did not start: ${output}`)), 15000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+\/)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Local server exited ${code}: ${output}`)); });
  });
}

function normalizedScriptPath(url) {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

function summedByPath(scripts, baseUrl) {
  const result = new Map();
  for (const script of scripts) {
    if (!isThirdPartyOrShared(script.url, baseUrl)) continue;
    const key = normalizedScriptPath(script.url);
    result.set(key, (result.get(key) || 0) + script.bytes);
  }
  return result;
}

function sourceHashes() {
  const trackedAndUnignored = gitValue(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const auditedSources = trackedAndUnignored.filter(relativePath =>
    /\.(?:html?|m?js|cjs)$/i.test(relativePath)
    && !/(^|[\\/])(?:node_modules|output)(?:[\\/]|$)/i.test(relativePath));
  auditedSources.push('結構工具箱/tools/tool-load-budget-baseline.json');
  return Object.fromEntries(auditedSources.map(relativePath => [relativePath.replace(/\\/g, '/'),
    fs.existsSync(path.join(repo, relativePath))
      ? crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, relativePath))).digest('hex')
      : '<missing>']));
}

function gitValue(args) {
  return require('child_process').execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function sourceReceipt() {
  return {
    testedHead: gitValue(['rev-parse', 'HEAD']),
    worktreeStatus: gitValue(['status', '--porcelain=v1']),
    sourceSha256: sourceHashes(),
  };
}

async function loadRoutes(browser, baseUrl, routes) {
  const results = [];
  for (const route of routes) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const requests = new WeakMap();
    const scripts = [];
    const bodyPromises = [];
    page.on('request', request => {
      if (request.resourceType() !== 'script') return;
      const record = { url: request.url(), status: null, bytes: null, error: null };
      scripts.push(record);
      requests.set(request, record);
    });
    page.on('response', response => {
      const record = requests.get(response.request());
      if (!record) return;
      record.status = response.status();
      bodyPromises.push(response.body().then(body => { record.bytes = body.length; }).catch(error => { record.error = String(error); }));
    });
    page.on('requestfailed', request => {
      const record = requests.get(request);
      if (record) record.error = request.failure()?.errorText || 'request failed';
    });
    let status = null;
    let finalUrl = null;
    let navigationError = null;
    let domContentLoadedMs = null;
    let workflowPanel = false;
    let started = Date.now();
    try {
      const response = await page.goto(new URL(encodeURI(route), baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
      status = response?.status() ?? null;
      finalUrl = page.url();
      domContentLoadedMs = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? null);
      await page.waitForTimeout(500);
      workflowPanel = await page.locator('[data-hy-workflow]').count() > 0;
    } catch (error) { navigationError = error.stack || String(error); }
    await Promise.all(bodyPromises);
    const record = {
      route,
      status,
      finalUrl,
      elapsedMs: Date.now() - started,
      domContentLoadedMs,
      jsBytes: scripts.reduce((sum, script) => sum + (script.bytes || 0), 0),
      scriptCount: scripts.length,
      workflowScripts: scripts.filter(script => /tool-workflow(?:-adapters)?\.js/.test(new URL(script.url).pathname)).map(script => normalizedScriptPath(script.url)),
      workflowPanel,
      scripts,
      navigationError,
    };
    results.push(record);
    await context.close();
    console.log(`${results.length}/${routes.length} ${route}: ${record.jsBytes} JS bytes, DCL ${domContentLoadedMs} ms`);
  }
  return results;
}

async function checkDocxRuntime(browser, baseUrl) {
  const runtimeFile = path.join(repo, '石材固定', 'vendor', 'package', 'dist', 'index.iife.js');
  const runtimeSizeOnDisk = fs.statSync(runtimeFile).size;
  const page = await browser.newPage({ acceptDownloads: true });
  const runtimeResponses = [];
  const watchRuntime = target => target.on('response', response => {
    if (!decodeURIComponent(new URL(response.url()).pathname).endsWith('/石材固定/vendor/package/dist/index.iife.js')) return;
    runtimeResponses.push(response.body().then(body => ({ url: response.url(), status: response.status(), bytes: body.length })));
  });
  watchRuntime(page);
  await page.goto(new URL('wind-force', baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(300);
  const initial = await page.evaluate(() => ({ docxPackerReady: Boolean(window.docx?.Packer), runtimeScriptTags: document.querySelectorAll('script[data-report-docx-runtime]').length }));
  assert(!initial.docxPackerReady && initial.runtimeScriptTags === 0 && runtimeResponses.length === 0, 'DOCX runtime loaded before Word click');
  await page.locator('#btnCalc').click();
  const popupPromise = page.waitForEvent('popup', { timeout: 15000 });
  await page.locator('.btn-print').click();
  const report = await popupPromise;
  watchRuntime(report);
  await report.waitForLoadState('domcontentloaded', { timeout: 20000 });
  await report.locator('#repDownloadCurrentWord').waitFor({ state: 'visible', timeout: 20000 });
  const reportInitiallyLoaded = await report.evaluate(() => ({ docxPackerReady: Boolean(window.docx?.Packer), runtimeScriptTags: document.querySelectorAll('script[data-report-docx-runtime]').length }));
  assert(!reportInitiallyLoaded.docxPackerReady && reportInitiallyLoaded.runtimeScriptTags === 0, 'Report popup eagerly loaded DOCX runtime');
  const downloadPromise = report.waitForEvent('download', { timeout: 45000 });
  await report.locator('#repDownloadCurrentWord').click();
  const download = await downloadPromise;
  await report.waitForFunction(() => Boolean(window.docx?.Packer), null, { timeout: 45000 });
  const responses = await Promise.all(runtimeResponses);
  assert(responses.length === 1, `Expected one DOCX runtime request; got ${responses.length}`);
  assert.equal(responses[0].status, 200, 'DOCX runtime response status');
  assert.equal(responses[0].bytes, runtimeSizeOnDisk, 'DOCX runtime response bytes');
  assert.equal(runtimeSizeOnDisk, baseline.docxRuntimeBytes, 'DOCX runtime size differs from baseline');
  await report.close();
  await page.close();
  return { initial, reportInitiallyLoaded, download: download.suggestedFilename(), runtimeSizeOnDisk, runtimeResponses: responses };
}

async function main() {
  const startedAt = new Date().toISOString();
  const sourceAtStart = sourceReceipt();
  activeAudit = { startedAt, sourceAtStart, results: [], docx: null, baseUrl: null, analysis: null };
  const homeJs = fs.readFileSync(path.join(repo, '結構工具箱', 'assets', 'home', 'home.js'), 'utf8');
  const routes = Object.keys(extractLiteral(homeJs, 'HOME_TOOL_UPDATES').routes);
  const baselineErrors = validateBaseline(baseline, routes);
  assert.deepEqual(baselineErrors, [], `Invalid existing load budget baseline: ${baselineErrors.join('; ')}`);
  assert.equal(routes.length, baseline.routeCount, 'Homepage route count differs from T8 baseline');
  assert.deepEqual(routes, baseline.routes.map(item => item.route), 'Homepage route list/order differs from T8 baseline');

  const server = spawn(process.execPath, [path.join(repo, 'serve-local.js'), '--no-open'], { cwd: repo, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    const baseUrl = await waitForServer(server);
    activeAudit.baseUrl = baseUrl;
    browser = await chromium.launch({ headless: true, executablePath: edge, args: ['--no-first-run', '--no-default-browser-check'] });
    const results = await loadRoutes(browser, baseUrl, routes);
    activeAudit.results = results;
    const analysis = analyzeResults(results, baseline, baseUrl);
    activeAudit.analysis = analysis;
    const docx = await checkDocxRuntime(browser, baseUrl);
    activeAudit.docx = docx;
    const sourceAtFinish = sourceReceipt();
    const sourceDrift = sourceDriftPaths(sourceAtStart.sourceSha256, sourceAtFinish.sourceSha256);
    const functionalFailures = [...analysis.functionalFailures];
    if (sourceAtStart.testedHead !== sourceAtFinish.testedHead) functionalFailures.push(`HEAD changed during audit: ${sourceAtStart.testedHead} -> ${sourceAtFinish.testedHead}`);
    if (sourceDrift.length) functionalFailures.push(`source changed during audit: ${sourceDrift.join(', ')}`);
    const failures = [...functionalFailures];
    if (!process.argv.includes('--write-baseline')) failures.push(...analysis.capacityDifferences);
    if (process.argv.includes('--write-baseline')) {
      // 只有功能健康、DOCX guard 已通過、來源未漂移且新資料完整時才接受容量增量。
      const nextBaseline = {
        schemaVersion: baseline.schemaVersion,
        capturedAt: new Date().toISOString(),
        sourceCommit: sourceAtFinish.testedHead,
        routeCount: results.length,
        totalJsBytes: results.reduce((sum, item) => sum + item.jsBytes, 0),
        docxRuntimePath: baseline.docxRuntimePath,
        docxRuntimeBytes: docx.runtimeSizeOnDisk,
        routes: results.map(result => ({
          route: result.route,
          jsBytes: result.jsBytes,
          sharedScripts: [...summedByPath(result.scripts, baseUrl)].map(([scriptPath, bytes]) => ({ path: scriptPath, bytes })),
        })),
      };
      const decision = resetBaseline({
        docxCheck: () => {},
        functionalFailures,
        sourceDrift,
        capacityDifferences: analysis.capacityDifferences,
        nextBaseline,
        expectedRoutes: routes,
        write: value => fs.writeFileSync(baselinePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'),
      });
      if (decision.errors.length) failures.push(...decision.errors);
      if (decision.written) console.log(`baseline rewritten: ${baselinePath} (${nextBaseline.totalJsBytes} bytes, ${sourceAtFinish.testedHead})`);
    }
    const summary = {
      schemaVersion: 1,
      baselineCommit: baseline.sourceCommit,
      baselineCapturedAt: baseline.capturedAt,
      startedAt,
      finishedAt: new Date().toISOString(),
      testedHead: sourceAtFinish.testedHead,
      worktreeStatusAtStart: sourceAtStart.worktreeStatus,
      worktreeStatusAtFinish: sourceAtFinish.worktreeStatus,
      sourceSha256AtStart: sourceAtStart.sourceSha256,
      sourceSha256: sourceAtFinish.sourceSha256,
      sourceCount: Object.keys(sourceAtFinish.sourceSha256).length,
      sourceDrift,
      baseUrl,
      routeCount: results.length,
      totalJsBytes: results.reduce((sum, item) => sum + item.jsBytes, 0),
      baselineTotalJsBytes: baseline.totalJsBytes,
      docx,
      results,
      failures,
      functionalFailures,
      capacityDifferences: analysis.capacityDifferences,
      pass: failures.length === 0,
    };
    fs.mkdirSync(outputRoot, { recursive: true });
    const output = path.join(outputRoot, `tool-load-budget-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(`summary: ${JSON.stringify({ output, routeCount: summary.routeCount, totalJsBytes: summary.totalJsBytes, baselineTotalJsBytes: summary.baselineTotalJsBytes, failures: failures.length, docxRuntimeBytes: docx.runtimeSizeOnDisk })}`);
    if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
    activeAudit = null;
  } finally {
    if (browser) await browser.close();
    if (server.exitCode == null) server.kill();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  if (activeAudit) {
    try {
      const finishedAt = new Date().toISOString();
      const sourceAtFinish = sourceReceipt();
      const sourceDrift = sourceDriftPaths(activeAudit.sourceAtStart.sourceSha256, sourceAtFinish.sourceSha256);
      const failures = collectFailureRecords(activeAudit.analysis?.functionalFailures || [], error, sourceDrift);
      if (activeAudit.sourceAtStart.testedHead !== sourceAtFinish.testedHead) failures.push(`HEAD changed during audit: ${activeAudit.sourceAtStart.testedHead} -> ${sourceAtFinish.testedHead}`);
      const summary = {
        schemaVersion: 1,
        baselineCommit: baseline.sourceCommit,
        baselineCapturedAt: baseline.capturedAt,
        startedAt: activeAudit.startedAt,
        finishedAt,
        testedHead: sourceAtFinish.testedHead,
        worktreeStatusAtStart: activeAudit.sourceAtStart.worktreeStatus,
        worktreeStatusAtFinish: sourceAtFinish.worktreeStatus,
        sourceSha256AtStart: activeAudit.sourceAtStart.sourceSha256,
        sourceSha256: sourceAtFinish.sourceSha256,
        sourceCount: Object.keys(sourceAtFinish.sourceSha256).length,
        sourceDrift,
        baseUrl: activeAudit.baseUrl,
        routeCount: activeAudit.results.length,
        totalJsBytes: activeAudit.results.reduce((sum, item) => sum + (Number.isSafeInteger(item.jsBytes) ? item.jsBytes : 0), 0),
        baselineTotalJsBytes: baseline.totalJsBytes,
        docx: activeAudit.docx,
        results: activeAudit.results,
        failures,
        functionalFailures: failures,
        capacityDifferences: activeAudit.analysis?.capacityDifferences || [],
        pass: false,
      };
      fs.mkdirSync(outputRoot, { recursive: true });
      const output = path.join(outputRoot, `tool-load-budget-${finishedAt.replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
      console.error(`failure summary: ${output}`);
    } catch (receiptError) { console.error(`Could not write failure summary: ${receiptError.stack || receiptError}`); }
  }
  process.exitCode = 1;
});
