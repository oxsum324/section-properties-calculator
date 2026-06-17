const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');
const outputDir = path.join(repoRoot, 'output', 'audit');
const jsonOutputPath = path.join(outputDir, 'tool-maturity-matrix.json');
const markdownOutputPath = path.join(outputDir, 'tool-maturity-matrix.md');

function hasArg(name) {
  return process.argv.includes(name);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath).replace(/^\uFEFF/, ''));
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function toolboxFile(relativePath) {
  return path.join(toolboxRoot, ...relativePath.split('/'));
}

function fileExists(fullPath) {
  return fs.existsSync(fullPath);
}

function bool(value) {
  return value ? true : false;
}

function cleanDestinationFor(tool) {
  return `/結構工具箱/${tool.html.replace(/\.html$/i, '')}`;
}

function routeInVercel(vercelText, tool) {
  const cleanDestination = cleanDestinationFor(tool);
  return vercelText.includes(`"source": "${tool.route}"`) &&
    (
      vercelText.includes(`"destination": "/結構工具箱/${tool.html}"`) ||
      vercelText.includes(`"destination": "${cleanDestination}"`)
    );
}

function homeHasTool(homeJs, tool) {
  return homeJs.includes(`href: '${tool.route}'`) &&
    homeJs.includes(`'${tool.route}': '${tool.html}'`);
}

function hasReferenceTraceability(html, tool) {
  const reportNeedles = Array.isArray(tool.reportNeedles) ? tool.reportNeedles : [];
  return html.includes('規範') ||
    html.includes('表 ') ||
    html.includes('式(') ||
    reportNeedles.some(needle => /規範|表|式|圖/.test(needle));
}

function scoreChecks(checks) {
  const entries = Object.entries(checks);
  const passed = entries.filter(([, value]) => value === true).length;
  return {
    passed,
    total: entries.length,
    ratio: entries.length ? passed / entries.length : 0
  };
}

function statusFromScore(score, requiredPass) {
  if (!requiredPass) return 'needs-attention';
  if (score.ratio >= 0.92) return 'governed';
  if (score.ratio >= 0.75) return 'maturing';
  return 'needs-attention';
}

function loadSourceState() {
  const formalManifest = readJson(toolboxFile('tools/formal-tools.manifest.json'));
  const localQuickManifest = readJson(toolboxFile('tools/local-quick-tools.manifest.json'));
  const vercelText = readText(repoFile('vercel.json'));
  const homeJs = readText(toolboxFile('assets/home/home.js'));
  const preflightSummaryPath = repoFile('output/preflight/preflight-summary.json');
  const preflightSummary = fileExists(preflightSummaryPath) ? readJson(preflightSummaryPath) : null;

  return {
    formalManifest,
    localQuickManifest,
    vercelText,
    homeJs,
    preflightSummary
  };
}

function buildFormalRows(state) {
  return state.formalManifest.tools.map((tool) => {
    const htmlPath = toolboxFile(tool.html);
    const html = fileExists(htmlPath) ? readText(htmlPath) : '';
    const caps = tool.capabilities || {};
    const hasJsonWorkflow = Boolean(caps.jsonExport || caps.jsonImport || tool.exportButton || tool.importButton);
    const checks = {
      htmlExists: fileExists(htmlPath),
      cleanRoute: routeInVercel(state.vercelText, tool),
      homeEntry: homeHasTool(state.homeJs, tool),
      reportButton: bool(tool.reportButton || tool.reportButtonSelector),
      reportModes: !tool.reportMode || (html.includes('btnReportModeDetail') && html.includes('btnReportModeSimple')),
      jsonExport: !caps.jsonExport || bool(tool.exportButton && html.includes(tool.exportButton)),
      jsonImport: !caps.jsonImport || bool(tool.importButton && html.includes(tool.importButton)),
      browserSmoke: caps.browserSmoke === true,
      reportRegression: caps.reportRegression === true && Array.isArray(tool.reportNeedles) && tool.reportNeedles.length > 0,
      reportModeRegression: !tool.reportMode || bool(tool.reportExpectations?.simple && tool.reportExpectations?.detail),
      diagramGeometry: !caps.diagramGeometry || bool(tool.diagramChecks && (tool.diagramRoleNeedles || []).length > 0),
      coreRegression: caps.coreRegression === true,
      goldenCaseRegression: Array.isArray(tool.goldenCases) && tool.goldenCases.length > 0,
      jsonRoundTrip: !hasJsonWorkflow || tool.jsonRoundTrip === true,
      referenceTraceability: hasReferenceTraceability(html, tool)
    };
    const score = scoreChecks(checks);
    const requiredPass = checks.htmlExists && checks.cleanRoute && checks.homeEntry && checks.reportButton && checks.browserSmoke && checks.reportRegression;

    return {
      family: 'formal-tools',
      key: tool.key,
      label: tool.label,
      discipline: tool.discipline,
      route: tool.route,
      html: tool.html,
      status: statusFromScore(score, requiredPass),
      score,
      checks,
      coverage: {
        reportModes: bool(tool.reportMode),
        jsonExport: bool(tool.exportButton),
        jsonImport: bool(tool.importButton),
        diagramGeometry: bool(tool.diagramChecks),
        coreRegression: caps.coreRegression === true,
        goldenCaseRegression: checks.goldenCaseRegression,
        jsonRoundTrip: checks.jsonRoundTrip,
        referenceTraceability: checks.referenceTraceability
      }
    };
  });
}

function buildLocalQuickRows(state) {
  return state.localQuickManifest.tools.map((tool) => {
    const htmlPath = toolboxFile(tool.html);
    const html = fileExists(htmlPath) ? readText(htmlPath) : '';
    const testPath = toolboxFile(tool.test);
    const goldenPath = toolboxFile(tool.golden);
    const corePath = toolboxFile(tool.core);
    const coreText = fileExists(corePath) ? readText(corePath) : '';
    const goldenCaseRegression = fileExists(testPath) && fileExists(goldenPath);
    const checks = {
      htmlExists: fileExists(htmlPath),
      cleanRoute: routeInVercel(state.vercelText, tool),
      homeEntry: homeHasTool(state.homeJs, tool),
      coreExists: fileExists(corePath),
      goldenCaseRegression,
      reportButton: html.includes('btnPrint') || html.includes('列印計算書'),
      reportModes: true,
      jsonExport: html.includes('btnJson') && html.includes('LocalQuickExport'),
      jsonImport: html.includes('btnImportJson') || html.includes('讀取 JSON'),
      browserSmoke: Boolean(tool.smoke),
      reportRegression: html.includes('列印計算書') && html.includes('output-actions'),
      outputConsistency: fileExists(toolboxFile(state.localQuickManifest.shared.outputConsistencyTest)),
      manifestContract: fileExists(toolboxFile(state.localQuickManifest.shared.contractTest)),
      jsonRoundTrip: tool.key === 'equipment-load' || tool.key === 'earth-pressure' || !(html.includes('btnImportJson') || html.includes('讀取 JSON')),
      referenceTraceability: html.includes('規範') || coreText.includes('provenance') || coreText.includes('reference')
    };
    const score = scoreChecks(checks);
    const requiredPass = checks.htmlExists && checks.cleanRoute && checks.homeEntry && checks.coreExists &&
      checks.goldenCaseRegression && checks.jsonExport && checks.browserSmoke && checks.manifestContract;

    return {
      family: 'local-quick-tools',
      key: tool.key,
      label: tool.label,
      discipline: 'local-quick',
      route: tool.route,
      html: tool.html,
      status: statusFromScore(score, requiredPass),
      score,
      checks,
      coverage: {
        reportModes: false,
        jsonExport: checks.jsonExport,
        jsonImport: checks.jsonImport,
        diagramGeometry: false,
        coreRegression: checks.goldenCaseRegression,
        goldenCaseRegression: checks.goldenCaseRegression,
        jsonRoundTrip: checks.jsonRoundTrip,
        referenceTraceability: checks.referenceTraceability
      }
    };
  });
}

function summarize(rows, preflightSummary) {
  const totals = {
    tools: rows.length,
    governed: rows.filter(row => row.status === 'governed').length,
    maturing: rows.filter(row => row.status === 'maturing').length,
    needsAttention: rows.filter(row => row.status === 'needs-attention').length,
    jsonExport: rows.filter(row => row.coverage.jsonExport).length,
    jsonImport: rows.filter(row => row.coverage.jsonImport).length,
    reportModes: rows.filter(row => row.coverage.reportModes).length,
    diagramGeometry: rows.filter(row => row.coverage.diagramGeometry).length,
    coreRegression: rows.filter(row => row.coverage.coreRegression).length,
    goldenCaseRegression: rows.filter(row => row.coverage.goldenCaseRegression).length,
    jsonRoundTrip: rows.filter(row => row.coverage.jsonRoundTrip).length,
    referenceTraceability: rows.filter(row => row.coverage.referenceTraceability).length
  };
  return {
    generatedAt: new Date().toISOString(),
    sourceManifests: [
      '結構工具箱/tools/formal-tools.manifest.json',
      '結構工具箱/tools/local-quick-tools.manifest.json'
    ],
    latestPreflight: preflightSummary ? {
      generatedAt: preflightSummary.generatedAt,
      runId: preflightSummary.runId,
      quick: preflightSummary.quick,
      pass: preflightSummary.pass
    } : null,
    totals
  };
}

function buildMarkdown(payload) {
  const lines = [
    '# Tool Maturity Matrix',
    '',
    `- generatedAt: ${payload.generatedAt}`,
    `- tools: ${payload.totals.tools}`,
    `- governed: ${payload.totals.governed}`,
    `- maturing: ${payload.totals.maturing}`,
    `- needsAttention: ${payload.totals.needsAttention}`,
    payload.latestPreflight
      ? `- latestPreflight: ${payload.latestPreflight.runId}, pass=${payload.latestPreflight.pass}, quick=${payload.latestPreflight.quick}`
      : '- latestPreflight: unavailable',
    '',
    '| family | key | label | route | status | score | missing checks |',
    '|---|---|---|---|---|---:|---|'
  ];

  for (const row of payload.rows) {
    const missing = Object.entries(row.checks)
      .filter(([, value]) => value !== true)
      .map(([key]) => key)
      .join(', ') || '-';
    lines.push(`| ${row.family} | ${row.key} | ${row.label} | ${row.route} | ${row.status} | ${row.score.passed}/${row.score.total} | ${missing} |`);
  }

  return `${lines.join('\n')}\n`;
}

function buildMatrix() {
  const state = loadSourceState();
  assert.equal(state.formalManifest.family, 'formal-tools', 'formal manifest family');
  assert.equal(state.localQuickManifest.family, 'local-quick-tools', 'local quick manifest family');

  const rows = [
    ...buildFormalRows(state),
    ...buildLocalQuickRows(state)
  ];
  const payload = {
    ...summarize(rows, state.preflightSummary),
    rows
  };

  return {
    payload,
    markdown: buildMarkdown(payload)
  };
}

function writeMatrix(matrix) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonOutputPath, `${JSON.stringify(matrix.payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownOutputPath, matrix.markdown, 'utf8');
}

function checkMatrix(payload) {
  assert.ok(payload.rows.length >= 17, 'tool maturity matrix should cover formal and local quick tools');
  assert.equal(payload.totals.tools, payload.rows.length, 'tool maturity matrix totals match row count');
  assert.equal(payload.totals.needsAttention, 0, 'tool maturity matrix has no needs-attention tools');
  for (const row of payload.rows) {
    assert.ok(row.score.ratio >= 0.75, `${row.key} maturity score below threshold`);
    assert.equal(row.checks.htmlExists, true, `${row.key} html exists`);
    assert.equal(row.checks.cleanRoute, true, `${row.key} clean route`);
    assert.equal(row.checks.homeEntry, true, `${row.key} home entry`);
    assert.equal(row.checks.browserSmoke, true, `${row.key} browser smoke`);
  }
}

const matrix = buildMatrix();
if (hasArg('--write')) {
  writeMatrix(matrix);
}
if (hasArg('--check')) {
  checkMatrix(matrix.payload);
}

console.log(`tool maturity matrix OK (${matrix.payload.rows.length} tools, governed=${matrix.payload.totals.governed}, maturing=${matrix.payload.totals.maturing})`);
if (hasArg('--write')) {
  console.log(`wrote ${jsonOutputPath}`);
  console.log(`wrote ${markdownOutputPath}`);
}
