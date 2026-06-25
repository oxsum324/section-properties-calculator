const assert = require('assert');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');
const outputDir = path.join(repoRoot, 'output', 'audit');
const jsonOutputPath = path.join(outputDir, 'tool-maturity-matrix.json');
const markdownOutputPath = path.join(outputDir, 'tool-maturity-matrix.md');
const NA = 'n/a';
const UPGRADE_TARGETS = [
  { key: 'reportModes', label: '報告簡版 / 詳版模式', priority: 'P1' },
  { key: 'jsonRoundTrip', label: 'JSON round-trip 回歸', priority: 'P1' },
  { key: 'jsonExport', label: 'JSON 匯出', priority: 'P2' },
  { key: 'jsonImport', label: 'JSON 匯入', priority: 'P2' },
  { key: 'diagramGeometry', label: '圖面幾何驗證', priority: 'P2' }
];
const COVERAGE_TOTALS = [
  { key: 'reportModes', label: '報告模式' },
  { key: 'jsonExport', label: 'JSON 匯出' },
  { key: 'jsonImport', label: 'JSON 匯入' },
  { key: 'diagramGeometry', label: '圖面幾何驗證' },
  { key: 'coreRegression', label: '核心 / golden regression' },
  { key: 'goldenCaseRegression', label: 'Golden case regression' },
  { key: 'jsonRoundTrip', label: 'JSON round-trip' },
  { key: 'referenceTraceability', label: '工程依據追蹤' }
];

function hasArg(name) {
  return process.argv.includes(name);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function hashText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function sourceInput(key, sourcePath, filePath) {
  const exists = fileExists(filePath);
  const text = exists ? readText(filePath).replace(/^\uFEFF/, '') : '';
  const stat = exists ? fs.statSync(filePath) : null;
  return {
    key,
    sourcePath,
    sourceMtime: stat ? stat.mtime.toISOString() : '',
    sourceHash: text ? hashText(text) : '',
    exists
  };
}

function toolboxSourceInput(key, relativePath) {
  return sourceInput(key, `結構工具箱/${relativePath}`, toolboxFile(relativePath));
}

function sourceTraceFor(inputs) {
  const normalized = inputs.map(input => ({
    key: input.key,
    sourcePath: input.sourcePath,
    sourceHash: input.sourceHash,
    exists: input.exists
  }));
  return {
    inputs,
    sourceHash: hashText(JSON.stringify(normalized))
  };
}

function readJson(filePath) {
  return JSON.parse(readText(filePath).replace(/^\uFEFF/, ''));
}

function readJsArrayCount(filePath) {
  if (!fileExists(filePath)) return 0;
  try {
    delete require.cache[require.resolve(filePath)];
    const value = require(filePath);
    return Array.isArray(value) ? value.length : 0;
  } catch (_) {
    return 0;
  }
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

function readHomeStringField(block, name) {
  const match = block.match(new RegExp(`${name}:\\s*'([^']*)'`));
  return match ? match[1] : '';
}

function readHomeArrayField(block, name) {
  const match = block.match(new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`));
  if (!match) return [];
  return match[1]
    .split(',')
    .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function extractHomeEntrypoints(homeJs) {
  const start = homeJs.indexOf('const tools = [');
  if (start === -1) return [];
  const end = homeJs.indexOf('\n  ];', start);
  const body = end === -1 ? homeJs.slice(start) : homeJs.slice(start, end);
  const entries = [];
  const blockPattern = /\{\s*title:\s*'([^']+)'([\s\S]*?)\n\s*\}/g;
  let match;
  while ((match = blockPattern.exec(body))) {
    const block = match[2];
    const route = readHomeStringField(block, 'href');
    if (!route) continue;
    entries.push({
      title: match[1],
      route,
      state: readHomeStringField(block, 'state'),
      governance: readHomeStringField(block, 'governance'),
      output: readHomeStringField(block, 'output'),
      fit: readHomeStringField(block, 'fit'),
      limit: readHomeStringField(block, 'limit'),
      capabilities: readHomeArrayField(block, 'capabilities')
    });
  }
  return entries;
}

function extractGovernanceSources(homeJs) {
  const sources = {};
  const sourcePattern = /'([^']+)':\s*\{\s*label:\s*'([^']+)',\s*preflightKeys:\s*\[([^\]]*)\]/g;
  let match;
  while ((match = sourcePattern.exec(homeJs))) {
    sources[match[1]] = {
      key: match[1],
      label: match[2],
      preflightKeys: match[3]
        .split(',')
        .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    };
  }
  return sources;
}

function hasVercelSource(vercelText, route) {
  return Boolean(route && route.startsWith('/') && vercelText.includes(`"source": "${route}"`));
}

function countByField(items, field) {
  return items.reduce((acc, item) => {
    const key = item[field] || 'unlabeled';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function entrypointList(items) {
  return items
    .map(item => ({
      route: item.route,
      title: item.title,
      state: item.state || '',
      governance: item.governance || '',
      cleanRoute: item.cleanRoute === true
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}

const BOUNDARY_LIMIT_NEEDLES = {
  assist: ['不取代', '仍應回正式', '不是完整', '正式分析', '校核'],
  reference: ['不取代', '不處理', '仍需回', '需由', '支持', '輔助'],
  workflow: ['需專案判斷', '另行', '特殊', '入口'],
  estimate: ['初步', '後續', '需回', '簡化'],
  report: ['不是', '不取代', '由案件', '摘要'],
  service: ['需先啟動', '本機', '服務'],
  legacy: ['尚未完全', '建議逐步', '舊版'],
  external: ['外部', '送審前']
};

function boundaryIssuesForEntrypoint(item) {
  const issues = [];
  if (!item.state) issues.push('missing-state');
  if (!item.output) issues.push('missing-output');
  if (!item.fit) issues.push('missing-fit');
  if (!item.limit) issues.push('missing-limit');
  if (item.state === 'formal' && !item.matrixCovered && !item.governance) {
    issues.push('formal-without-governance');
  }
  if (item.state && item.state !== 'formal') {
    const needles = BOUNDARY_LIMIT_NEEDLES[item.state] || [];
    if (needles.length && !needles.some(needle => String(item.limit || '').includes(needle))) {
      issues.push('weak-limit-boundary');
    }
    if ((item.capabilities || []).includes('正式核算')) {
      issues.push('non-formal-capability-claims-formal');
    }
  }
  return issues;
}

function entrypointBoundaryList(items) {
  return items
    .map(item => ({
      route: item.route,
      title: item.title,
      state: item.state || '',
      output: item.output || '',
      fit: item.fit || '',
      limit: item.limit || '',
      capabilities: Array.isArray(item.capabilities) ? item.capabilities : [],
      boundaryIssues: boundaryIssuesForEntrypoint(item)
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}

function otherGovernanceList(items, governanceSources, preflightSummaries) {
  const summaries = Array.isArray(preflightSummaries) ? preflightSummaries.filter(Boolean) : [];
  const preflightRecords = new Map();
  for (const summary of summaries) {
    for (const record of summary.records || []) {
      const existing = preflightRecords.get(record.key);
      if (!existing || (existing.pass !== true && record.pass === true)) {
        preflightRecords.set(record.key, {
          ...record,
          runId: summary.runId || '',
          quick: summary.quick === true
        });
      }
    }
  }
  return items
    .map(item => {
      const source = governanceSources[item.governance] || null;
      const preflightKeys = Array.isArray(source?.preflightKeys) ? source.preflightKeys : [];
      const missingKeys = preflightKeys.filter(key => !preflightRecords.has(key));
      const failedKeys = preflightKeys.filter(key => preflightRecords.has(key) && preflightRecords.get(key).pass !== true);
      const passedKeys = preflightKeys.filter(key => preflightRecords.has(key) && preflightRecords.get(key).pass === true);
      const governanceIssues = [];
      if (!source) governanceIssues.push('missing-governance-source');
      if (source && !source.label) governanceIssues.push('missing-governance-label');
      if (!preflightKeys.length) governanceIssues.push('missing-preflight-keys');
      governanceIssues.push(...missingKeys.map(key => `missing-preflight:${key}`));
      governanceIssues.push(...failedKeys.map(key => `failed-preflight:${key}`));
      return {
        route: item.route,
        title: item.title,
        state: item.state || '',
        governance: item.governance || '',
        governanceLabel: source?.label || '',
        preflightKeys,
        passedKeys,
        failedKeys,
        missingKeys,
        evidenceRunIds: Array.from(new Set(preflightKeys.map(key => preflightRecords.get(key)?.runId).filter(Boolean))),
        cleanRoute: item.cleanRoute === true,
        pass: governanceIssues.length === 0,
        governanceIssues
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

function buildEntrypointCoverage(homeEntrypoints, rows, vercelText, governanceSources = {}, preflightSummaries = []) {
  const matrixRoutes = new Set(rows.map(row => row.route).filter(Boolean));
  const entries = homeEntrypoints.map(item => ({
    ...item,
    matrixCovered: matrixRoutes.has(item.route),
    cleanRoute: hasVercelSource(vercelText, item.route)
  }));
  const matrixCovered = entries.filter(item => item.matrixCovered);
  const outsideMatrix = entries.filter(item => !item.matrixCovered);
  const otherGoverned = outsideMatrix.filter(item => item.governance);
  const formalOutsideCoverage = outsideMatrix.filter(item => item.state === 'formal' && !item.governance);
  const nonFormalOutsideCoverage = outsideMatrix.filter(item => item.state !== 'formal' && !item.governance);
  const otherGovernanceRows = otherGovernanceList(otherGoverned, governanceSources, preflightSummaries);
  const otherGovernanceIssueCount = otherGovernanceRows.reduce((sum, item) => sum + item.governanceIssues.length, 0);
  const boundaryRows = entrypointBoundaryList(nonFormalOutsideCoverage);
  const boundaryIssueCount = boundaryRows.reduce((sum, item) => sum + item.boundaryIssues.length, 0);
  return {
    total: entries.length,
    matrixCovered: matrixCovered.length,
    otherGoverned: otherGoverned.length,
    formalOutsideCoverage: formalOutsideCoverage.length,
    nonFormalOutsideCoverage: nonFormalOutsideCoverage.length,
    otherGovernanceRequired: otherGovernanceRows.length,
    otherGovernanceComplete: otherGovernanceRows.filter(item => item.pass).length,
    otherGovernanceIssueCount,
    boundaryRequired: boundaryRows.length,
    boundaryComplete: boundaryRows.filter(item => item.boundaryIssues.length === 0).length,
    boundaryIssueCount,
    cleanRouteCount: entries.filter(item => item.cleanRoute).length,
    byState: countByField(entries, 'state'),
    outsideByState: countByField(outsideMatrix, 'state'),
    matrixRoutes: entrypointList(matrixCovered),
    outsideMatrixRoutes: entrypointList(outsideMatrix),
    formalOutsideCoverageRoutes: entrypointList(formalOutsideCoverage),
    otherGovernanceRoutes: otherGovernanceRows,
    otherGovernanceIssueRoutes: otherGovernanceRows.filter(item => !item.pass),
    boundaryRoutes: boundaryRows,
    boundaryIssueRoutes: boundaryRows.filter(item => item.boundaryIssues.length > 0)
  };
}

function markdownCell(value) {
  const text = Array.isArray(value) ? value.join(', ') : String(value || '-');
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
function hasValidTraceabilityEntry(tool, traceEntry) {
  if (!traceEntry || traceEntry.key !== tool.key || !Array.isArray(traceEntry.traces) || traceEntry.traces.length === 0) return false;
  const goldenIds = new Set((tool.goldenCases || []).map(goldenCase => goldenCase.id));
  return traceEntry.traces.every(trace => {
    if (!trace || typeof trace.clause !== 'string' || !/規範|表|圖|式|章|節/.test(trace.clause)) return false;
    if (typeof trace.purpose !== 'string' || !trace.purpose.trim()) return false;
    for (const field of ['inputs', 'calculation', 'report', 'goldenCases', 'manualReview']) {
      if (!Array.isArray(trace[field]) || trace[field].length === 0) return false;
      if (!trace[field].every(item => typeof item === 'string' && item.trim())) return false;
    }
    return trace.goldenCases.every(goldenId => goldenIds.has(goldenId));
  });
}

function hasReferenceTraceability(html, tool, traceEntry) {
  const reportNeedles = Array.isArray(tool.reportNeedles) ? tool.reportNeedles : [];
  const textTrace = html.includes('規範') ||
    html.includes('表 ') ||
    html.includes('式(') ||
    reportNeedles.some(needle => /規範|表|式|圖/.test(needle));
  return textTrace && hasValidTraceabilityEntry(tool, traceEntry);
}

function hasReportModeControls(html, tool) {
  if (!tool.reportMode) return NA;
  const controls = tool.reportModeControls || {};
  if (controls.simpleButton || controls.detailButton) {
    return Boolean(controls.simpleButton && controls.detailButton &&
      html.includes(controls.simpleButton) && html.includes(controls.detailButton));
  }
  const selectId = controls.selectId || 'reportMode';
  if (controls.selectId || controls.simpleValue || controls.detailValue || html.includes(`id="${selectId}"`)) {
    return html.includes(`id="${selectId}"`) &&
      html.includes(controls.simpleValue || 'summary') &&
      html.includes(controls.detailValue || 'detailed');
  }
  return html.includes('btnReportModeDetail') && html.includes('btnReportModeSimple');
}
function scoreChecks(checks) {
  const entries = Object.entries(checks);
  const applicable = entries.filter(([, value]) => value !== NA);
  const passed = applicable.filter(([, value]) => value === true).length;
  return {
    passed,
    total: applicable.length,
    notApplicable: entries.length - applicable.length,
    rawTotal: entries.length,
    ratio: applicable.length ? passed / applicable.length : 0
  };
}

function statusFromScore(score, requiredPass) {
  if (!requiredPass) return 'needs-attention';
  if (score.ratio >= 0.92) return 'governed';
  if (score.ratio >= 0.75) return 'maturing';
  return 'needs-attention';
}

function upgradeGapsFor(row) {
  return UPGRADE_TARGETS
    .filter(target => !row.coverage[target.key])
    .map(target => ({
      key: target.key,
      label: target.label,
      priority: target.priority
    }));
}

function withUpgradeGaps(row) {
  const upgradeGaps = upgradeGapsFor(row);
  return {
    ...row,
    upgradeGaps,
    upgradePriority: upgradeGaps.length ? upgradeGaps[0].priority : 'none'
  };
}

function summarizeTraceabilityCatalog(catalog) {
  const tools = Array.isArray(catalog?.tools) ? catalog.tools : [];
  const toolRows = tools.map(tool => {
    const traces = Array.isArray(tool.traces) ? tool.traces : [];
    const manualReviewCount = traces.reduce((sum, trace) => {
      return sum + (Array.isArray(trace.manualReview) ? trace.manualReview.length : 0);
    }, 0);
    const covered = traces.length > 0 && (!tool.status || tool.status === 'covered');
    return {
      key: tool.key || '',
      label: tool.label || tool.scope || tool.key || '',
      status: tool.status || (covered ? 'covered' : 'missing'),
      traceCount: traces.length,
      manualReviewCount,
      covered
    };
  });
  return {
    family: catalog?.family || '',
    version: catalog?.version || '',
    description: catalog?.description || '',
    tools: toolRows.length,
    covered: toolRows.filter(row => row.covered).length,
    traceCount: toolRows.reduce((sum, row) => sum + row.traceCount, 0),
    manualReviewCount: toolRows.reduce((sum, row) => sum + row.manualReviewCount, 0),
    uncoveredKeys: toolRows.filter(row => !row.covered).map(row => row.key),
    toolKeys: toolRows.map(row => row.key).filter(Boolean),
    rows: toolRows
  };
}

function buildTraceabilityCatalogCoverage(state) {
  return [
    summarizeTraceabilityCatalog(state.formalTraceabilityCatalog),
    summarizeTraceabilityCatalog(state.rcTraceabilityCatalog),
    summarizeTraceabilityCatalog(state.steelTraceabilityCatalog),
    summarizeTraceabilityCatalog(state.anchorTraceabilityCatalog),
    summarizeTraceabilityCatalog(state.stoneTraceabilityCatalog),
    summarizeTraceabilityCatalog(state.deckingTraceabilityCatalog)
  ];
}

function loadSourceState() {
  const formalManifestRelativePath = '結構工具箱/tools/formal-tools.manifest.json';
  const formalTraceabilityRelativePath = '結構工具箱/tools/formal-traceability.catalog.json';
  const rcTraceabilityRelativePath = '鋼筋混凝土/tools/rc-traceability.catalog.json';
  const steelTraceabilityRelativePath = '鋼構工具/steel-traceability.catalog.json';
  const anchorTraceabilityRelativePath = '螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json';
  const stoneTraceabilityRelativePath = '石材固定/stone-traceability.catalog.json';
  const deckingTraceabilityRelativePath = '覆工板/decking-traceability.catalog.json';
  const localQuickManifestRelativePath = '結構工具箱/tools/local-quick-tools.manifest.json';
  const vercelRelativePath = 'vercel.json';
  const homeRelativePath = '結構工具箱/assets/home/home.js';
  const preflightSummaryRelativePath = 'output/preflight/preflight-summary.json';
  const preflightHistoryRelativePath = 'output/preflight/preflight-history.json';
  const formalManifestPath = toolboxFile('tools/formal-tools.manifest.json');
  const formalTraceabilityPath = toolboxFile('tools/formal-traceability.catalog.json');
  const rcTraceabilityPath = repoFile('鋼筋混凝土/tools/rc-traceability.catalog.json');
  const steelTraceabilityPath = repoFile('鋼構工具/steel-traceability.catalog.json');
  const anchorTraceabilityPath = repoFile('螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json');
  const stoneTraceabilityPath = repoFile('石材固定/stone-traceability.catalog.json');
  const deckingTraceabilityPath = repoFile('覆工板/decking-traceability.catalog.json');
  const localQuickManifestPath = toolboxFile('tools/local-quick-tools.manifest.json');
  const vercelPath = repoFile(vercelRelativePath);
  const homePath = toolboxFile('assets/home/home.js');
  const preflightSummaryPath = repoFile(preflightSummaryRelativePath);
  const preflightHistoryPath = repoFile(preflightHistoryRelativePath);
  const formalManifest = readJson(formalManifestPath);
  const formalTraceabilityCatalog = readJson(formalTraceabilityPath);
  const rcTraceabilityCatalog = readJson(rcTraceabilityPath);
  const steelTraceabilityCatalog = readJson(steelTraceabilityPath);
  const anchorTraceabilityCatalog = readJson(anchorTraceabilityPath);
  const stoneTraceabilityCatalog = readJson(stoneTraceabilityPath);
  const deckingTraceabilityCatalog = readJson(deckingTraceabilityPath);
  const localQuickManifest = readJson(localQuickManifestPath);
  const vercelText = readText(vercelPath);
  const homeJs = readText(homePath);
  const preflightSummaryText = fileExists(preflightSummaryPath) ? readText(preflightSummaryPath).replace(/^\uFEFF/, '') : '';
  const preflightSummary = preflightSummaryText ? JSON.parse(preflightSummaryText) : null;
  const preflightSummaryStat = fileExists(preflightSummaryPath) ? fs.statSync(preflightSummaryPath) : null;
  const preflightHistoryText = fileExists(preflightHistoryPath) ? readText(preflightHistoryPath).replace(/^\uFEFF/, '') : '';
  const preflightHistory = preflightHistoryText ? JSON.parse(preflightHistoryText) : null;
  const completedPreflightItems = Array.isArray(preflightHistory?.items)
    ? preflightHistory.items.filter(item => item && item.complete !== false)
    : [];
  const latestFullPreflightItem = completedPreflightItems
    ? completedPreflightItems.find(item => item && item.quick === false && item.summaryJsonPath)
    : null;
  const latestPassingFullPreflightItem = completedPreflightItems
    ? completedPreflightItems.find(item => item && item.quick === false && item.pass === true && item.summaryJsonPath)
    : null;
  const latestFullPreflightSummaryPath = latestFullPreflightItem
    ? (path.isAbsolute(latestFullPreflightItem.summaryJsonPath) ? latestFullPreflightItem.summaryJsonPath : repoFile(latestFullPreflightItem.summaryJsonPath))
    : '';
  const latestPassingFullPreflightSummaryPath = latestPassingFullPreflightItem
    ? (path.isAbsolute(latestPassingFullPreflightItem.summaryJsonPath) ? latestPassingFullPreflightItem.summaryJsonPath : repoFile(latestPassingFullPreflightItem.summaryJsonPath))
    : '';
  const latestFullPreflightSummaryRelativePath = latestFullPreflightSummaryPath
    ? path.relative(repoRoot, latestFullPreflightSummaryPath).replace(/\\/g, '/')
    : '';
  const latestPassingFullPreflightSummaryRelativePath = latestPassingFullPreflightSummaryPath
    ? path.relative(repoRoot, latestPassingFullPreflightSummaryPath).replace(/\\/g, '/')
    : '';
  const latestFullPreflightSummaryText = latestFullPreflightSummaryPath && fileExists(latestFullPreflightSummaryPath)
    ? readText(latestFullPreflightSummaryPath).replace(/^\uFEFF/, '')
    : '';
  const latestPassingFullPreflightSummaryText = latestPassingFullPreflightSummaryPath && fileExists(latestPassingFullPreflightSummaryPath)
    ? readText(latestPassingFullPreflightSummaryPath).replace(/^\uFEFF/, '')
    : '';
  const latestFullPreflightSummary = latestFullPreflightSummaryText ? JSON.parse(latestFullPreflightSummaryText) : null;
  const latestPassingFullPreflightSummary = latestPassingFullPreflightSummaryText ? JSON.parse(latestPassingFullPreflightSummaryText) : null;
  const needsFullPreflightFallback = preflightSummary?.quick === true;
  const needsPassingFullPreflightFallback = preflightSummary?.pass !== true;
  const preflightEvidenceSummaries = [
    preflightSummary,
    needsFullPreflightFallback ? latestFullPreflightSummary : null,
    needsPassingFullPreflightFallback ? latestPassingFullPreflightSummary : null
  ]
    .filter(Boolean)
    .filter((summary, index, array) => array.findIndex(item => item.runId === summary.runId) === index);
  const sourceInputs = [
    sourceInput('formal-tools-manifest', formalManifestRelativePath, formalManifestPath),
    sourceInput('formal-traceability-catalog', formalTraceabilityRelativePath, formalTraceabilityPath),
    sourceInput('rc-traceability-catalog', rcTraceabilityRelativePath, rcTraceabilityPath),
    sourceInput('steel-traceability-catalog', steelTraceabilityRelativePath, steelTraceabilityPath),
    sourceInput('anchor-traceability-catalog', anchorTraceabilityRelativePath, anchorTraceabilityPath),
    sourceInput('stone-traceability-catalog', stoneTraceabilityRelativePath, stoneTraceabilityPath),
    sourceInput('decking-traceability-catalog', deckingTraceabilityRelativePath, deckingTraceabilityPath),
    sourceInput('local-quick-tools-manifest', localQuickManifestRelativePath, localQuickManifestPath),
    sourceInput('vercel-routes', vercelRelativePath, vercelPath),
    sourceInput('home-entrypoints', homeRelativePath, homePath),
    sourceInput('latest-preflight-summary', preflightSummaryRelativePath, preflightSummaryPath)
  ];
  if (needsFullPreflightFallback && latestFullPreflightSummaryPath) {
    sourceInputs.push(sourceInput('latest-full-preflight-summary', latestFullPreflightSummaryRelativePath, latestFullPreflightSummaryPath));
  }
  if (needsPassingFullPreflightFallback && latestPassingFullPreflightSummaryPath) {
    sourceInputs.push(sourceInput('latest-passing-full-preflight-summary', latestPassingFullPreflightSummaryRelativePath, latestPassingFullPreflightSummaryPath));
  }

  return {
    formalManifest,
    formalTraceabilityCatalog,
    rcTraceabilityCatalog,
    steelTraceabilityCatalog,
    anchorTraceabilityCatalog,
    stoneTraceabilityCatalog,
    deckingTraceabilityCatalog,
    localQuickManifest,
    vercelText,
    homeJs,
    homeEntrypoints: extractHomeEntrypoints(homeJs),
    governanceSources: extractGovernanceSources(homeJs),
    preflightSummary,
    latestFullPreflightSummary,
    latestPassingFullPreflightSummary,
    preflightHistoryHealth: {
      count: Number(preflightHistory?.count) || 0,
      completedCount: Number(preflightHistory?.completedCount) || completedPreflightItems.length,
      inProgressCount: Number(preflightHistory?.inProgressCount) || 0,
      incompleteCount: Number(preflightHistory?.incompleteCount) || 0,
      latestRunId: preflightHistory?.items?.[0]?.runId || '',
      latestState: preflightHistory?.items?.[0]?.state || '',
      latestCompletedRunId: completedPreflightItems[0]?.runId || '',
      latestCompletedFullRunId: latestFullPreflightItem?.runId || ''
    },
    preflightEvidenceSummaries,
    preflightSummarySource: {
      path: preflightSummaryRelativePath,
      mtime: preflightSummaryStat ? preflightSummaryStat.mtime.toISOString() : '',
      hash: preflightSummaryText ? hashText(preflightSummaryText) : ''
    },
    sourceTrace: {
      inputs: sourceInputs
    }
  };
}

function buildFormalRows(state) {
  const traceByKey = new Map((state.formalTraceabilityCatalog.tools || []).map(entry => [entry.key, entry]));
  return state.formalManifest.tools.map((tool) => {
    const htmlPath = toolboxFile(tool.html);
    const html = fileExists(htmlPath) ? readText(htmlPath) : '';
    const caps = tool.capabilities || {};
    const hasJsonWorkflow = Boolean(caps.jsonExport || caps.jsonImport || tool.exportButton || tool.importButton);
    const goldenCaseCount = Array.isArray(tool.goldenCases) ? tool.goldenCases.length : 0;
    const rowSourceTrace = sourceTraceFor([
      toolboxSourceInput('html', tool.html),
      toolboxSourceInput('traceability-catalog', 'tools/formal-traceability.catalog.json')
    ]);
    const traceEntry = traceByKey.get(tool.key);
    const checks = {
      htmlExists: fileExists(htmlPath),
      cleanRoute: routeInVercel(state.vercelText, tool),
      homeEntry: homeHasTool(state.homeJs, tool),
      reportButton: bool(tool.reportButton || tool.reportButtonSelector),
      reportModes: hasReportModeControls(html, tool),
      jsonExport: caps.jsonExport ? bool(tool.exportButton && html.includes(tool.exportButton)) : NA,
      jsonImport: caps.jsonImport ? bool(tool.importButton && html.includes(tool.importButton)) : NA,
      browserSmoke: caps.browserSmoke === true,
      reportRegression: caps.reportRegression === true && Array.isArray(tool.reportNeedles) && tool.reportNeedles.length > 0,
      reportModeRegression: tool.reportMode ? bool(tool.reportExpectations?.simple && tool.reportExpectations?.detail) : NA,
      diagramGeometry: caps.diagramGeometry ? bool(tool.diagramChecks && (tool.diagramRoleNeedles || []).length > 0) : NA,
      coreRegression: caps.coreRegression === true,
      goldenCaseRegression: Array.isArray(tool.goldenCases) && tool.goldenCases.length > 0,
      jsonRoundTrip: hasJsonWorkflow ? tool.jsonRoundTrip === true : NA,
      referenceTraceability: hasReferenceTraceability(html, tool, traceEntry)
    };
    const score = scoreChecks(checks);
    const requiredPass = checks.htmlExists && checks.cleanRoute && checks.homeEntry && checks.reportButton && checks.browserSmoke && checks.reportRegression;

    return withUpgradeGaps({
      family: 'formal-tools',
      key: tool.key,
      label: tool.label,
      discipline: tool.discipline,
      route: tool.route,
      html: tool.html,
      status: statusFromScore(score, requiredPass),
      goldenCaseCount,
      score,
      sourceTrace: rowSourceTrace,
      checks,
      coverage: {
        reportModes: checks.reportModes === true,
        jsonExport: bool(tool.exportButton),
        jsonImport: bool(tool.importButton),
        diagramGeometry: bool(tool.diagramChecks),
        coreRegression: caps.coreRegression === true,
        goldenCaseRegression: checks.goldenCaseRegression,
        jsonRoundTrip: checks.jsonRoundTrip === true,
        referenceTraceability: checks.referenceTraceability
      }
    });
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
    const rowSourceTrace = sourceTraceFor([
      toolboxSourceInput('html', tool.html),
      toolboxSourceInput('core', tool.core),
      toolboxSourceInput('golden', tool.golden),
      toolboxSourceInput('test', tool.test),
      toolboxSourceInput('shared-output-consistency-test', state.localQuickManifest.shared.outputConsistencyTest),
      toolboxSourceInput('shared-contract-test', state.localQuickManifest.shared.contractTest)
    ]);
    const goldenCaseRegression = fileExists(testPath) && fileExists(goldenPath);
    const goldenCaseCount = readJsArrayCount(goldenPath);
    const hasJsonImport = html.includes('btnImportJson') || html.includes('讀取 JSON');
    const checks = {
      htmlExists: fileExists(htmlPath),
      cleanRoute: routeInVercel(state.vercelText, tool),
      homeEntry: homeHasTool(state.homeJs, tool),
      coreExists: fileExists(corePath),
      goldenCaseRegression,
      reportButton: html.includes('btnPrint') || html.includes('列印計算書'),
      reportModes: hasReportModeControls(html, tool),
      diagramGeometry: tool.diagramChecks ? bool(tool.diagramSelector && (tool.diagramRoleNeedles || []).length > 0) : NA,
      jsonExport: html.includes('btnJson') && html.includes('LocalQuickExport'),
      jsonImport: html.includes('btnImportJson') || html.includes('讀取 JSON'),
      browserSmoke: Boolean(tool.smoke),
      reportRegression: html.includes('列印計算書') && html.includes('output-actions'),
      outputConsistency: fileExists(toolboxFile(state.localQuickManifest.shared.outputConsistencyTest)),
      manifestContract: fileExists(toolboxFile(state.localQuickManifest.shared.contractTest)),
      jsonRoundTrip: hasJsonImport ? tool.jsonRoundTrip === true : NA,
      referenceTraceability: html.includes('規範') || coreText.includes('provenance') || coreText.includes('reference')
    };
    const score = scoreChecks(checks);
    const requiredPass = checks.htmlExists && checks.cleanRoute && checks.homeEntry && checks.coreExists &&
      checks.goldenCaseRegression && checks.jsonExport && checks.browserSmoke && checks.manifestContract;

    return withUpgradeGaps({
      family: 'local-quick-tools',
      key: tool.key,
      label: tool.label,
      discipline: 'local-quick',
      route: tool.route,
      html: tool.html,
      status: statusFromScore(score, requiredPass),
      goldenCaseCount,
      score,
      sourceTrace: rowSourceTrace,
      checks,
      coverage: {
        reportModes: checks.reportModes === true,
        jsonExport: checks.jsonExport,
        jsonImport: checks.jsonImport,
        diagramGeometry: checks.diagramGeometry === true,
        coreRegression: checks.goldenCaseRegression,
        goldenCaseRegression: checks.goldenCaseRegression,
        jsonRoundTrip: checks.jsonRoundTrip === true,
        referenceTraceability: checks.referenceTraceability
      }
    });
  });
}

function summarize(rows, preflightSummary, preflightSummarySource = null, sourceTrace = null, entrypointCoverage = null, preflightHistoryHealth = null, traceabilityCatalogCoverage = []) {
  const topUpgradeTargets = UPGRADE_TARGETS
    .map(target => {
      const tools = rows
        .filter(row => row.upgradeGaps.some(gap => gap.key === target.key))
        .map(row => row.key);
      return {
        key: target.key,
        label: target.label,
        priority: target.priority,
        count: tools.length,
        tools
      };
    })
    .filter(target => target.count > 0);

  const totals = {
    tools: rows.length,
    governed: rows.filter(row => row.status === 'governed').length,
    maturing: rows.filter(row => row.status === 'maturing').length,
    needsAttention: rows.filter(row => row.status === 'needs-attention').length,
    toolsWithUpgradeGaps: rows.filter(row => row.upgradeGaps.length > 0).length,
    upgradeGapCount: rows.reduce((sum, row) => sum + row.upgradeGaps.length, 0),
    goldenCases: rows.reduce((sum, row) => sum + (row.goldenCaseCount || 0), 0),
    toolsWithMultipleGoldenCases: rows.filter(row => (row.goldenCaseCount || 0) >= 2).length,
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
      '結構工具箱/tools/formal-traceability.catalog.json',
      '鋼筋混凝土/tools/rc-traceability.catalog.json',
      '鋼構工具/steel-traceability.catalog.json',
      '螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json',
      '石材固定/stone-traceability.catalog.json',
      '覆工板/decking-traceability.catalog.json',
      '結構工具箱/tools/local-quick-tools.manifest.json'
    ],
    sourceTrace: sourceTrace || { inputs: [] },
    traceabilityCatalogCoverage,
    preflightHistoryHealth: preflightHistoryHealth || {
      count: 0,
      completedCount: 0,
      inProgressCount: 0,
      incompleteCount: 0,
      latestRunId: '',
      latestState: '',
      latestCompletedRunId: '',
      latestCompletedFullRunId: ''
    },
    entrypointCoverage: entrypointCoverage || {
      total: 0,
      matrixCovered: 0,
      otherGoverned: 0,
      formalOutsideCoverage: 0,
      nonFormalOutsideCoverage: 0,
      otherGovernanceRequired: 0,
      otherGovernanceComplete: 0,
      otherGovernanceIssueCount: 0,
      boundaryRequired: 0,
      boundaryComplete: 0,
      boundaryIssueCount: 0,
      cleanRouteCount: 0,
      byState: {},
      outsideByState: {},
      matrixRoutes: [],
      outsideMatrixRoutes: [],
      formalOutsideCoverageRoutes: [],
      otherGovernanceRoutes: [],
      otherGovernanceIssueRoutes: [],
      boundaryRoutes: [],
      boundaryIssueRoutes: []
    },
    latestPreflight: preflightSummary ? {
      generatedAt: preflightSummary.generatedAt,
      runId: preflightSummary.runId,
      quick: preflightSummary.quick,
      pass: preflightSummary.pass,
      failureCount: preflightSummary.failureCount,
      failedKeys: Array.isArray(preflightSummary.failedKeys) ? preflightSummary.failedKeys : [],
      recordsCount: preflightSummary.recordsCount,
      passedCount: preflightSummary.passedCount,
      totalSeconds: preflightSummary.totalSeconds,
      slowestKey: preflightSummary.slowestKey,
      slowestSeconds: preflightSummary.slowestSeconds,
      slowestText: preflightSummary.slowestText,
      slowestRecords: Array.isArray(preflightSummary.slowestRecords) ? preflightSummary.slowestRecords : [],
      slowReuseCount: preflightSummary.slowReuseCount,
      slowReuseKeys: Array.isArray(preflightSummary.slowReuseKeys) ? preflightSummary.slowReuseKeys : [],
      platformAuditMode: preflightSummary.platformAuditMode,
      platformAuditReused: preflightSummary.platformAuditReused,
      platformAuditDecisionPath: preflightSummary.platformAuditDecisionPath,
      sourcePath: preflightSummarySource?.path || '',
      sourceMtime: preflightSummarySource?.mtime || '',
      sourceHash: preflightSummarySource?.hash || ''
    } : null,
    totals,
    topUpgradeTargets
  };
}

function buildMarkdown(payload) {
  const entrypoint = payload.entrypointCoverage || {};
  const lines = [
    '# Tool Maturity Matrix',
    '',
    `- generatedAt: ${payload.generatedAt}`,
    `- tools: ${payload.totals.tools}`,
    `- governed: ${payload.totals.governed}`,
    `- maturing: ${payload.totals.maturing}`,
    `- needsAttention: ${payload.totals.needsAttention}`,
    `- toolsWithUpgradeGaps: ${payload.totals.toolsWithUpgradeGaps}`,
    `- upgradeGapCount: ${payload.totals.upgradeGapCount}`,
    `- goldenCases: ${payload.totals.goldenCases}`,
    `- toolsWithMultipleGoldenCases: ${payload.totals.toolsWithMultipleGoldenCases}`,
    `- sourceManifests: ${payload.sourceManifests.join(', ')}`,
    `- sourceInputs: ${Array.isArray(payload.sourceTrace?.inputs) ? payload.sourceTrace.inputs.length : 0}`,
    `- homeEntrypoints: total=${entrypoint.total || 0}, maturityMatrix=${entrypoint.matrixCovered || 0}, otherGoverned=${entrypoint.otherGoverned || 0}, formalOutsideCoverage=${entrypoint.formalOutsideCoverage || 0}`,
    `- otherGovernance: complete=${entrypoint.otherGovernanceComplete || 0}/${entrypoint.otherGovernanceRequired || 0}, issues=${entrypoint.otherGovernanceIssueCount || 0}`,
    `- nonMatrixBoundary: complete=${entrypoint.boundaryComplete || 0}/${entrypoint.boundaryRequired || 0}, issues=${entrypoint.boundaryIssueCount || 0}`,
    `- preflightHistoryHealth: completed=${payload.preflightHistoryHealth?.completedCount || 0}/${payload.preflightHistoryHealth?.count || 0}, incomplete=${payload.preflightHistoryHealth?.incompleteCount || 0}, inProgress=${payload.preflightHistoryHealth?.inProgressCount || 0}, latestState=${payload.preflightHistoryHealth?.latestState || '-'}`,
    payload.latestPreflight
      ? `- latestPreflight: ${payload.latestPreflight.runId}, pass=${payload.latestPreflight.pass}, quick=${payload.latestPreflight.quick}, source=${payload.latestPreflight.sourcePath || '-'}, hash=${(payload.latestPreflight.sourceHash || '').slice(0, 12) || '-'}`
      : '- latestPreflight: unavailable',
    '',
    '## Coverage Totals',
    '',
    '| coverage | tools | total |',
    '|---|---:|---:|',
    ...COVERAGE_TOTALS.map(item => `| ${item.label} (${item.key}) | ${payload.totals[item.key] || 0} | ${payload.totals.tools} |`),
    '',
    '## Traceability Catalog Coverage',
    '',
    '| catalog | covered tools | traces | manual review items | uncovered |',
    '|---|---:|---:|---:|---|'
  ];
  const traceabilityCatalogCoverage = Array.isArray(payload.traceabilityCatalogCoverage) ? payload.traceabilityCatalogCoverage : [];
  if (traceabilityCatalogCoverage.length === 0) {
    lines.push('| - | 0 / 0 | 0 | 0 | - |');
  } else {
    for (const item of traceabilityCatalogCoverage) {
      const uncovered = Array.isArray(item.uncoveredKeys) && item.uncoveredKeys.length ? item.uncoveredKeys.join(', ') : '-';
      lines.push(`| ${markdownCell(item.family)} | ${item.covered || 0} / ${item.tools || 0} | ${item.traceCount || 0} | ${item.manualReviewCount || 0} | ${markdownCell(uncovered)} |`);
    }
  }

  lines.push(
    '',
    '## Homepage Entrypoint Coverage',
    '',
    '| metric | count |',
    '|---|---:|',
    `| total home entries | ${entrypoint.total || 0} |`,
    `| covered by maturity matrix | ${entrypoint.matrixCovered || 0} |`,
    `| covered by other audit governance | ${entrypoint.otherGoverned || 0} |`,
    `| other governance complete | ${(entrypoint.otherGovernanceComplete || 0)} / ${(entrypoint.otherGovernanceRequired || 0)} |`,
    `| other governance issues | ${entrypoint.otherGovernanceIssueCount || 0} |`,
    `| formal entries outside coverage | ${entrypoint.formalOutsideCoverage || 0} |`,
    `| non-formal / workflow outside matrix | ${entrypoint.nonFormalOutsideCoverage || 0} |`,
    `| non-matrix boundary complete | ${(entrypoint.boundaryComplete || 0)} / ${(entrypoint.boundaryRequired || 0)} |`,
    `| non-matrix boundary issues | ${entrypoint.boundaryIssueCount || 0} |`,
    `| clean route entries | ${entrypoint.cleanRouteCount || 0} |`,
    '',
    '### Outside Maturity Matrix',
    '',
    '| route | title | state | governance | clean route |',
    '|---|---|---|---|---|'
  );

  const outsideRoutes = Array.isArray(entrypoint.outsideMatrixRoutes) ? entrypoint.outsideMatrixRoutes : [];
  if (outsideRoutes.length === 0) {
    lines.push('| - | - | - | - | - |');
  } else {
    for (const item of outsideRoutes) {
      lines.push(`| ${item.route || '-'} | ${item.title || '-'} | ${item.state || '-'} | ${item.governance || '-'} | ${item.cleanRoute ? 'yes' : 'no'} |`);
    }
  }

  lines.push(
    '',
    '### Other Governance Sources',
    '',
    '| route | title | governance | source | preflight keys | passed | failed | missing | issues |',
    '|---|---|---|---|---|---|---|---|---|'
  );
  const otherGovernanceRoutes = Array.isArray(entrypoint.otherGovernanceRoutes) ? entrypoint.otherGovernanceRoutes : [];
  if (otherGovernanceRoutes.length === 0) {
    lines.push('| - | - | - | - | - | - | - | - | - |');
  } else {
    for (const item of otherGovernanceRoutes) {
      const issues = Array.isArray(item.governanceIssues) && item.governanceIssues.length ? item.governanceIssues.join(', ') : '-';
      lines.push(`| ${markdownCell(item.route)} | ${markdownCell(item.title)} | ${markdownCell(item.governance)} | ${markdownCell(item.governanceLabel)} | ${markdownCell(item.preflightKeys)} | ${markdownCell(item.passedKeys)} | ${markdownCell(item.failedKeys)} | ${markdownCell(item.missingKeys)} | ${markdownCell(issues)} |`);
    }
  }

  lines.push(
    '',
    '### Non-Matrix Boundary Checks',
    '',
    '| route | title | state | output | fit | limit | issues |',
    '|---|---|---|---|---|---|---|'
  );
  const boundaryRoutes = Array.isArray(entrypoint.boundaryRoutes) ? entrypoint.boundaryRoutes : [];
  if (boundaryRoutes.length === 0) {
    lines.push('| - | - | - | - | - | - | - |');
  } else {
    for (const item of boundaryRoutes) {
      const issues = Array.isArray(item.boundaryIssues) && item.boundaryIssues.length ? item.boundaryIssues.join(', ') : '-';
      lines.push(`| ${markdownCell(item.route)} | ${markdownCell(item.title)} | ${markdownCell(item.state)} | ${markdownCell(item.output)} | ${markdownCell(item.fit)} | ${markdownCell(item.limit)} | ${markdownCell(issues)} |`);
    }
  }

  lines.push(
    '',
    '## Top Upgrade Targets',
    '',
    '| priority | target | tools | affected keys |',
    '|---|---|---:|---|'
  );
  if (payload.topUpgradeTargets.length === 0) {
    lines.push('| - | - | 0 | - |');
  } else {
    for (const target of payload.topUpgradeTargets) {
      lines.push(`| ${target.priority} | ${target.label} | ${target.count} | ${target.tools.join(', ')} |`);
    }
  }

  lines.push(
    '',
    '## Source Trace',
    '',
    '| key | source | hash | mtime |',
    '|---|---|---|---|'
  );
  const sourceInputs = Array.isArray(payload.sourceTrace?.inputs) ? payload.sourceTrace.inputs : [];
  if (sourceInputs.length === 0) {
    lines.push('| - | - | - | - |');
  } else {
    for (const input of sourceInputs) {
      lines.push(`| ${input.key || '-'} | ${input.sourcePath || '-'} | ${(input.sourceHash || '').slice(0, 12) || '-'} | ${input.sourceMtime || '-'} |`);
    }
  }

  lines.push(
    '',
    '## Tool Rows',
    '',
    '| family | key | label | route | status | score | golden cases | upgrade priority | upgrade gaps | missing checks | n/a checks | source hash |',
    '|---|---|---|---|---|---:|---:|---|---|---|---|---|'
  );

  for (const row of payload.rows) {
    const missing = Object.entries(row.checks)
      .filter(([, value]) => value === false)
      .map(([key]) => key)
      .join(', ') || '-';
    const notApplicable = Object.entries(row.checks)
      .filter(([, value]) => value === NA)
      .map(([key]) => key)
      .join(', ') || '-';
    const upgradeGaps = row.upgradeGaps
      .map(gap => `${gap.priority}:${gap.key}`)
      .join(', ') || '-';
    const rowSourceHash = (row.sourceTrace?.sourceHash || '').slice(0, 12) || '-';
    lines.push(`| ${row.family} | ${row.key} | ${row.label} | ${row.route} | ${row.status} | ${row.score.passed}/${row.score.total} | ${row.goldenCaseCount || 0} | ${row.upgradePriority} | ${upgradeGaps} | ${missing} | ${notApplicable} | ${rowSourceHash} |`);
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
  const entrypointCoverage = buildEntrypointCoverage(state.homeEntrypoints, rows, state.vercelText, state.governanceSources, state.preflightEvidenceSummaries);
  const traceabilityCatalogCoverage = buildTraceabilityCatalogCoverage(state);
  const payload = {
    ...summarize(rows, state.preflightSummary, state.preflightSummarySource, state.sourceTrace, entrypointCoverage, state.preflightHistoryHealth, traceabilityCatalogCoverage),
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

function displayPath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function checkMatrix(payload, markdown) {
  assert.ok(payload.rows.length >= 17, 'tool maturity matrix should cover formal and local quick tools');
  assert.equal(payload.totals.tools, payload.rows.length, 'tool maturity matrix totals match row count');
  assert.equal(payload.totals.needsAttention, 0, 'tool maturity matrix has no needs-attention tools');
  assert.equal(Number.isInteger(payload.totals.toolsWithUpgradeGaps), true, 'tool maturity matrix upgrade tool count is integer');
  assert.equal(Number.isInteger(payload.totals.upgradeGapCount), true, 'tool maturity matrix upgrade gap count is integer');
  assert.equal(Number.isInteger(payload.totals.goldenCases), true, 'tool maturity matrix golden case total is integer');
  assert.equal(Number.isInteger(payload.totals.toolsWithMultipleGoldenCases), true, 'tool maturity matrix multi-golden count is integer');
  assert.equal(
    payload.totals.toolsWithMultipleGoldenCases,
    payload.totals.tools,
    'tool maturity matrix requires at least two golden cases for every governed tool'
  );
  assert.ok(Array.isArray(payload.topUpgradeTargets), 'tool maturity matrix exposes top upgrade targets');
  assert.ok(payload.preflightHistoryHealth && typeof payload.preflightHistoryHealth === 'object', 'tool maturity matrix preflightHistoryHealth object');
  assert.equal(Number.isInteger(payload.preflightHistoryHealth.count), true, 'tool maturity matrix preflightHistoryHealth count integer');
  assert.equal(Number.isInteger(payload.preflightHistoryHealth.completedCount), true, 'tool maturity matrix preflightHistoryHealth completedCount integer');
  assert.equal(Number.isInteger(payload.preflightHistoryHealth.inProgressCount), true, 'tool maturity matrix preflightHistoryHealth inProgressCount integer');
  assert.equal(Number.isInteger(payload.preflightHistoryHealth.incompleteCount), true, 'tool maturity matrix preflightHistoryHealth incompleteCount integer');
  assert.equal(typeof payload.preflightHistoryHealth.latestState, 'string', 'tool maturity matrix preflightHistoryHealth latestState string');
  assert.ok(markdown.includes('preflightHistoryHealth:'), 'tool maturity matrix markdown exposes preflight history health');
  assert.ok(payload.entrypointCoverage && typeof payload.entrypointCoverage === 'object', 'tool maturity matrix entrypointCoverage object');
  assert.equal(Number.isInteger(payload.entrypointCoverage.total), true, 'tool maturity matrix entrypointCoverage total integer');
  assert.equal(Number.isInteger(payload.entrypointCoverage.matrixCovered), true, 'tool maturity matrix entrypointCoverage matrixCovered integer');
  assert.equal(Number.isInteger(payload.entrypointCoverage.otherGoverned), true, 'tool maturity matrix entrypointCoverage otherGoverned integer');
  assert.equal(Number.isInteger(payload.entrypointCoverage.formalOutsideCoverage), true, 'tool maturity matrix entrypointCoverage formalOutsideCoverage integer');
  assert.equal(payload.entrypointCoverage.matrixCovered, payload.totals.tools, 'tool maturity matrix entrypointCoverage covers every matrix row');
  assert.equal(payload.entrypointCoverage.formalOutsideCoverage, 0, 'tool maturity matrix entrypointCoverage has no uncovered formal home entries');
  assert.equal(Number.isInteger(payload.entrypointCoverage.otherGovernanceRequired), true, 'tool maturity matrix entrypointCoverage otherGovernanceRequired integer');
  assert.equal(Number.isInteger(payload.entrypointCoverage.otherGovernanceComplete), true, 'tool maturity matrix entrypointCoverage otherGovernanceComplete integer');
  assert.equal(Number.isInteger(payload.entrypointCoverage.otherGovernanceIssueCount), true, 'tool maturity matrix entrypointCoverage otherGovernanceIssueCount integer');
  assert.equal(payload.entrypointCoverage.otherGovernanceRequired, payload.entrypointCoverage.otherGoverned, 'tool maturity matrix entrypointCoverage other governance count matches otherGoverned');
  assert.equal(payload.entrypointCoverage.otherGovernanceComplete, payload.entrypointCoverage.otherGovernanceRequired, 'tool maturity matrix entrypointCoverage other governance checks complete');
  assert.equal(payload.entrypointCoverage.otherGovernanceIssueCount, 0, 'tool maturity matrix entrypointCoverage other governance issues empty');
  assert.ok(Array.isArray(payload.entrypointCoverage.otherGovernanceRoutes), 'tool maturity matrix entrypointCoverage otherGovernanceRoutes array');
  assert.equal(Number.isInteger(payload.entrypointCoverage.boundaryRequired), true, 'tool maturity matrix entrypointCoverage boundaryRequired integer');
  assert.equal(Number.isInteger(payload.entrypointCoverage.boundaryComplete), true, 'tool maturity matrix entrypointCoverage boundaryComplete integer');
  assert.equal(Number.isInteger(payload.entrypointCoverage.boundaryIssueCount), true, 'tool maturity matrix entrypointCoverage boundaryIssueCount integer');
  assert.equal(payload.entrypointCoverage.boundaryComplete, payload.entrypointCoverage.boundaryRequired, 'tool maturity matrix entrypointCoverage boundary checks complete');
  assert.equal(payload.entrypointCoverage.boundaryIssueCount, 0, 'tool maturity matrix entrypointCoverage boundary issues empty');
  assert.ok(Array.isArray(payload.entrypointCoverage.outsideMatrixRoutes), 'tool maturity matrix entrypointCoverage outsideMatrixRoutes array');
  assert.ok(Array.isArray(payload.entrypointCoverage.boundaryRoutes), 'tool maturity matrix entrypointCoverage boundaryRoutes array');
  for (const route of payload.entrypointCoverage.otherGovernanceRoutes) {
    assert.ok(route.governance, `tool maturity matrix other governance route governance: ${route.route}`);
    assert.ok(route.governanceLabel, `tool maturity matrix other governance route label: ${route.route}`);
    assert.ok(Array.isArray(route.preflightKeys) && route.preflightKeys.length > 0, `tool maturity matrix other governance route preflight keys populated: ${route.route}`);
    assert.deepEqual(route.failedKeys, [], `tool maturity matrix other governance route failed keys empty: ${route.route}`);
    assert.deepEqual(route.missingKeys, [], `tool maturity matrix other governance route missing keys empty: ${route.route}`);
    assert.deepEqual(route.governanceIssues, [], `tool maturity matrix other governance route issues empty: ${route.route}`);
    assert.equal(route.pass, true, `tool maturity matrix other governance route pass: ${route.route}`);
  }
  assert.ok(markdown.includes('## Coverage Totals'), 'tool maturity matrix markdown exposes coverage totals');
  assert.ok(markdown.includes('## Traceability Catalog Coverage'), 'tool maturity matrix markdown exposes traceability catalog coverage');
  assert.ok(Array.isArray(payload.traceabilityCatalogCoverage), 'tool maturity matrix traceability catalog coverage array');
  const rcTraceabilityCoverage = payload.traceabilityCatalogCoverage.find(item => item.family === 'rc-traceability');
  assert.ok(rcTraceabilityCoverage, 'tool maturity matrix includes RC traceability catalog coverage');
  assert.equal(rcTraceabilityCoverage.covered, rcTraceabilityCoverage.tools, 'tool maturity matrix RC traceability catalog fully covered');
  assert.ok(rcTraceabilityCoverage.traceCount >= rcTraceabilityCoverage.tools, 'tool maturity matrix RC traceability catalog has traces');
  assert.deepEqual(rcTraceabilityCoverage.uncoveredKeys, [], 'tool maturity matrix RC traceability catalog has no uncovered tools');
  const steelTraceabilityCoverage = payload.traceabilityCatalogCoverage.find(item => item.family === 'steel-traceability');
  assert.ok(steelTraceabilityCoverage, 'tool maturity matrix includes steel traceability catalog coverage');
  assert.equal(steelTraceabilityCoverage.covered, steelTraceabilityCoverage.tools, 'tool maturity matrix steel traceability catalog fully covered');
  assert.ok(steelTraceabilityCoverage.traceCount >= steelTraceabilityCoverage.tools, 'tool maturity matrix steel traceability catalog has traces');
  assert.deepEqual(steelTraceabilityCoverage.uncoveredKeys, [], 'tool maturity matrix steel traceability catalog has no uncovered tools');
  const anchorTraceabilityCoverage = payload.traceabilityCatalogCoverage.find(item => item.family === 'anchor-traceability');
  assert.ok(anchorTraceabilityCoverage, 'tool maturity matrix includes anchor traceability catalog coverage');
  assert.equal(anchorTraceabilityCoverage.covered, anchorTraceabilityCoverage.tools, 'tool maturity matrix anchor traceability catalog fully covered');
  assert.ok(anchorTraceabilityCoverage.traceCount >= anchorTraceabilityCoverage.tools, 'tool maturity matrix anchor traceability catalog has traces');
  assert.deepEqual(anchorTraceabilityCoverage.uncoveredKeys, [], 'tool maturity matrix anchor traceability catalog has no uncovered tools');
  const stoneTraceabilityCoverage = payload.traceabilityCatalogCoverage.find(item => item.family === 'stone-traceability');
  assert.ok(stoneTraceabilityCoverage, 'tool maturity matrix includes stone traceability catalog coverage');
  assert.equal(stoneTraceabilityCoverage.covered, stoneTraceabilityCoverage.tools, 'tool maturity matrix stone traceability catalog fully covered');
  assert.ok(stoneTraceabilityCoverage.traceCount >= stoneTraceabilityCoverage.tools, 'tool maturity matrix stone traceability catalog has traces');
  assert.deepEqual(stoneTraceabilityCoverage.uncoveredKeys, [], 'tool maturity matrix stone traceability catalog has no uncovered tools');
  const deckingTraceabilityCoverage = payload.traceabilityCatalogCoverage.find(item => item.family === 'decking-traceability');
  assert.ok(deckingTraceabilityCoverage, 'tool maturity matrix includes decking traceability catalog coverage');
  assert.equal(deckingTraceabilityCoverage.covered, deckingTraceabilityCoverage.tools, 'tool maturity matrix decking traceability catalog fully covered');
  assert.ok(deckingTraceabilityCoverage.traceCount >= deckingTraceabilityCoverage.tools, 'tool maturity matrix decking traceability catalog has traces');
  assert.deepEqual(deckingTraceabilityCoverage.uncoveredKeys, [], 'tool maturity matrix decking traceability catalog has no uncovered tools');
  assert.ok(markdown.includes('## Homepage Entrypoint Coverage'), 'tool maturity matrix exposes homepage entrypoint coverage');
  assert.ok(markdown.includes('### Other Governance Sources'), 'tool maturity matrix exposes other governance sources');
  assert.ok(markdown.includes('### Non-Matrix Boundary Checks'), 'tool maturity matrix exposes non-matrix boundary checks');
  assert.ok(markdown.indexOf('## Top Upgrade Targets') < markdown.indexOf('## Source Trace'), 'tool maturity matrix top upgrade section precedes source trace');
  assert.ok(markdown.includes('## Source Trace'), 'tool maturity matrix markdown exposes source trace section');
  assert.ok(markdown.includes('sourceManifests:'), 'tool maturity matrix markdown exposes source manifests');
  assert.ok(payload.sourceTrace && typeof payload.sourceTrace === 'object', 'tool maturity matrix sourceTrace object');
  assert.ok(Array.isArray(payload.sourceTrace.inputs), 'tool maturity matrix sourceTrace inputs array');
  const requiredSourceKeys = ['formal-tools-manifest', 'formal-traceability-catalog', 'rc-traceability-catalog', 'steel-traceability-catalog', 'anchor-traceability-catalog', 'stone-traceability-catalog', 'decking-traceability-catalog', 'local-quick-tools-manifest', 'vercel-routes', 'home-entrypoints'];
  for (const key of requiredSourceKeys) {
    const input = payload.sourceTrace.inputs.find(item => item.key === key);
    assert.ok(input, `tool maturity matrix sourceTrace includes ${key}`);
    assert.equal(input.exists, true, `tool maturity matrix sourceTrace ${key} exists`);
    assert.match(input.sourceHash, /^[0-9a-f]{64}$/i, `tool maturity matrix sourceTrace ${key} sourceHash sha256`);
    assert.equal(typeof input.sourceMtime, 'string', `tool maturity matrix sourceTrace ${key} sourceMtime string`);
    assert.ok(markdown.includes(input.sourceHash.slice(0, 12)), `tool maturity matrix markdown exposes source hash ${key}`);
  }
  if (payload.latestPreflight) {
    assert.equal(typeof payload.latestPreflight.runId, 'string', 'tool maturity matrix latest preflight runId string');
    assert.equal(typeof payload.latestPreflight.pass, 'boolean', 'tool maturity matrix latest preflight pass boolean');
    assert.equal(typeof payload.latestPreflight.totalSeconds, 'number', 'tool maturity matrix latest preflight totalSeconds number');
    assert.equal(Number.isInteger(payload.latestPreflight.recordsCount), true, 'tool maturity matrix latest preflight recordsCount integer');
    assert.equal(Number.isInteger(payload.latestPreflight.passedCount), true, 'tool maturity matrix latest preflight passedCount integer');
    assert.equal(Number.isInteger(payload.latestPreflight.slowReuseCount), true, 'tool maturity matrix latest preflight slowReuseCount integer');
    assert.ok(Array.isArray(payload.latestPreflight.failedKeys), 'tool maturity matrix latest preflight failedKeys array');
    assert.ok(Array.isArray(payload.latestPreflight.slowReuseKeys), 'tool maturity matrix latest preflight slowReuseKeys array');
    assert.ok(Array.isArray(payload.latestPreflight.slowestRecords), 'tool maturity matrix latest preflight slowestRecords array');
    assert.equal(typeof payload.latestPreflight.sourcePath, 'string', 'tool maturity matrix latest preflight sourcePath string');
    assert.equal(typeof payload.latestPreflight.sourceMtime, 'string', 'tool maturity matrix latest preflight sourceMtime string');
    assert.match(payload.latestPreflight.sourceHash, /^[0-9a-f]{64}$/i, 'tool maturity matrix latest preflight sourceHash sha256');
    assert.ok(markdown.includes(`hash=${payload.latestPreflight.sourceHash.slice(0, 12)}`), 'tool maturity matrix markdown exposes latest preflight source hash');
  }
  for (const item of COVERAGE_TOTALS) {
    assert.equal(Number.isInteger(payload.totals[item.key]), true, `tool maturity matrix total ${item.key} is integer`);
    assert.ok(markdown.includes(`(${item.key})`), `tool maturity matrix markdown includes coverage total ${item.key}`);
  }
  for (const row of payload.rows) {
    assert.ok(row.score.ratio >= 0.75, `${row.key} maturity score below threshold`);
    assert.equal(Number.isInteger(row.goldenCaseCount), true, `${row.key} golden case count is integer`);
    assert.ok(row.goldenCaseCount >= 2, `${row.key} has at least two golden cases`);
    assert.ok(row.score.total <= row.score.rawTotal, `${row.key} applicable score denominator is bounded`);
    assert.equal(row.checks.htmlExists, true, `${row.key} html exists`);
    assert.equal(row.checks.cleanRoute, true, `${row.key} clean route`);
    assert.equal(row.checks.homeEntry, true, `${row.key} home entry`);
    assert.equal(row.checks.browserSmoke, true, `${row.key} browser smoke`);
    assert.ok(Array.isArray(row.upgradeGaps), `${row.key} upgrade gaps array`);
    assert.ok(row.upgradePriority, `${row.key} upgrade priority`);
    assert.ok(row.sourceTrace && typeof row.sourceTrace === 'object', `${row.key} sourceTrace object`);
    assert.ok(Array.isArray(row.sourceTrace.inputs), `${row.key} sourceTrace inputs array`);
    assert.match(row.sourceTrace.sourceHash, /^[0-9a-f]{64}$/i, `${row.key} sourceTrace sourceHash sha256`);
    assert.ok(row.sourceTrace.inputs.length >= 1, `${row.key} sourceTrace has inputs`);
    const htmlSource = row.sourceTrace.inputs.find(input => input.key === 'html');
    assert.ok(htmlSource, `${row.key} sourceTrace includes html`);
    assert.equal(htmlSource.exists, true, `${row.key} html source exists`);
    assert.match(htmlSource.sourceHash, /^[0-9a-f]{64}$/i, `${row.key} html source hash sha256`);
    assert.ok(markdown.includes(row.sourceTrace.sourceHash.slice(0, 12)), `${row.key} markdown exposes row source hash`);
  }
}

const matrix = buildMatrix();
if (hasArg('--write')) {
  writeMatrix(matrix);
}
if (hasArg('--check')) {
  checkMatrix(matrix.payload, matrix.markdown);
}

console.log(`tool maturity matrix OK (${matrix.payload.rows.length} tools, governed=${matrix.payload.totals.governed}, maturing=${matrix.payload.totals.maturing})`);
if (hasArg('--write')) {
  console.log(`wrote ${displayPath(jsonOutputPath)}`);
  console.log(`wrote ${displayPath(markdownOutputPath)}`);
}
