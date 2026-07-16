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
const homepageStatusDir = path.join(toolboxRoot, 'assets', 'status');
const homepagePlatformStatusPath = path.join(homepageStatusDir, 'platform-status.json');
const homepagePreflightStatusPath = path.join(homepageStatusDir, 'preflight-summary.json');
const homepageReportReadinessStatusPath = path.join(homepageStatusDir, 'report-readiness-status.json');
const platformStatusSourcePath = path.join(repoRoot, 'output', 'audit', 'platform-status.json');
const preflightSummarySourcePath = path.join(repoRoot, 'output', 'preflight', 'preflight-summary.json');
const preflightHistorySourcePath = path.join(repoRoot, 'output', 'preflight', 'preflight-history.json');
const preflightHistoryDir = path.join(repoRoot, 'output', 'preflight', 'history');
const renderedDeliveryEvidenceSummaryName = 'rendered-delivery-evidence-summary.json';
const NA = 'n/a';
const UPGRADE_TARGETS = [
  { key: 'reportModes', label: '報告簡版 / 詳版模式', priority: 'P1' },
  { key: 'reportTextSmoke', label: '報告可讀文字抽檢', priority: 'P1' },
  { key: 'jsonRoundTrip', label: 'JSON round-trip 回歸', priority: 'P1' },
  { key: 'jsonExport', label: 'JSON 匯出', priority: 'P2' },
  { key: 'jsonImport', label: 'JSON 匯入', priority: 'P2' },
  { key: 'diagramGeometry', label: '圖面幾何驗證', priority: 'P2' }
];
const COVERAGE_TOTALS = [
  { key: 'reportModes', label: '報告模式' },
  { key: 'reportTextSmoke', label: '報告可讀文字抽檢' },
  { key: 'jsonExport', label: 'JSON 匯出' },
  { key: 'jsonImport', label: 'JSON 匯入' },
  { key: 'diagramGeometry', label: '圖面幾何驗證' },
  { key: 'coreRegression', label: '核心 / golden regression' },
  { key: 'goldenCaseRegression', label: 'Golden case regression' },
  { key: 'jsonRoundTrip', label: 'JSON round-trip' },
  { key: 'referenceTraceability', label: '工程依據追蹤' }
];
const REPORT_TEXT_SMOKE_EVIDENCE_GATES = [
  {
    key: 'formal-browser-smoke',
    label: '風力 / 地震正式工具瀏覽器 smoke',
    family: 'formal-tools',
    scopeLabel: '風力 / 地震正式工具'
  },
  {
    key: 'local-quick-tools-runner',
    label: '局部快算 manifest runner',
    family: 'local-quick-tools',
    scopeLabel: '局部快算'
  }
];
const GLOBAL_GOVERNANCE_GATES = [
  {
    key: 'report-disclosure-contract',
    label: '跨家族報告揭露',
    contract: '結構工具箱/tools/report-disclosure.contract.test.js',
    scope: 'formal、RC、鋼構、錨栓、石材、覆工板與開挖擋土支撐 traceability catalog',
    catalogFamilies: ['formal-traceability', 'rc-traceability', 'steel-traceability', 'anchor-traceability', 'stone-traceability', 'decking-traceability', 'excavation-traceability'],
    minCatalogs: 7
  },
  {
    key: 'delivery-artifacts-contract',
    label: '交付物一致性',
    contract: '結構工具箱/tools/delivery-artifacts.contract.test.js',
    scope: '石材 audit JSON / Word / PDF、錨栓 HTML / XLSX / DOCX、覆工板 JSON / Word 報表與開挖 PDF / DOCX / 下載 API 交付邊界',
    catalogFamilies: ['stone-traceability', 'anchor-traceability', 'decking-traceability', 'excavation-traceability'],
    minCatalogs: 4
  },
  {
    key: 'release-readiness-contract',
    label: '正式放行證據',
    contract: '結構工具箱/tools/release-readiness.contract.test.js',
    scope: 'release wrapper、force flags、慢測重用揭露與 dashboard 放行模式顯示',
    catalogFamilies: [],
    minCatalogs: 0
  },
  {
    key: 'rendered-delivery-evidence',
    label: '實際交付物渲染佐證',
    contract: '結構工具箱/tools/rendered-delivery-evidence.contract.test.js',
    scope: '首頁 31 個正式工具的 PDF、DOCX 或 workbook，加上開挖本機服務 PDF / DOCX / 最新下載的當輪實際產出與文字 / 版面驗證',
    catalogFamilies: [],
    minCatalogs: 0
  }
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

function readJsonIfExists(filePath) {
  return fileExists(filePath) ? readJson(filePath) : null;
}

function tryReadJsonIfExists(filePath) {
  if (!fileExists(filePath)) return null;
  try {
    return readJson(filePath);
  } catch (_) {
    return null;
  }
}

function normalizePreflightSummaryPath(summaryJsonPath) {
  if (!summaryJsonPath) return '';
  return path.isAbsolute(summaryJsonPath)
    ? summaryJsonPath
    : repoFile(String(summaryJsonPath).replace(/\\/g, '/'));
}

function listPreflightHistoryRunIds() {
  if (!fileExists(preflightHistoryDir)) return [];
  return fs.readdirSync(preflightHistoryDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .reverse();
}

// The history manifest trims to recent runs only, so homepage full-run fallback
// must still be able to recover an older completed full summary from disk.
function findLatestPreflightHistorySummary(predicate, historyItems) {
  const completedItems = Array.isArray(historyItems)
    ? historyItems.filter(item => item && item.complete !== false)
    : [];
  const seenRunIds = new Set();

  for (const item of completedItems) {
    if (!item || !item.summaryJsonPath) continue;
    const fullPath = normalizePreflightSummaryPath(item.summaryJsonPath);
    if (!fullPath || !fileExists(fullPath)) continue;
    const payload = tryReadJsonIfExists(fullPath);
    if (!payload) continue;
    const runId = String(item.runId || payload.runId || path.basename(path.dirname(fullPath)) || '');
    if (runId) seenRunIds.add(runId);
    if (predicate(payload, item)) {
      return {
        payload,
        filePath: fullPath,
        sourcePath: displayPath(fullPath)
      };
    }
  }

  for (const runId of listPreflightHistoryRunIds()) {
    if (seenRunIds.has(runId)) continue;
    const fullPath = path.join(preflightHistoryDir, runId, 'preflight-summary.json');
    const payload = tryReadJsonIfExists(fullPath);
    if (!payload) continue;
    if (predicate(payload, { runId, summaryJsonPath: fullPath, complete: true })) {
      return {
        payload,
        filePath: fullPath,
        sourcePath: displayPath(fullPath)
      };
    }
  }

  return null;
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

function parseQuotedList(listText) {
  return String(listText || '')
    .split(',')
    .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function normalizeSlash(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/');
}

function extractRouteFileMap(homeJs) {
  const routeFileMap = {};
  const start = homeJs.indexOf('const routeFileMap = {');
  if (start === -1) return routeFileMap;
  const end = homeJs.indexOf('\n  };', start);
  const body = end === -1 ? homeJs.slice(start) : homeJs.slice(start, end);
  const pattern = /'([^']+)':\s*'([^']+)'/g;
  let match;
  while ((match = pattern.exec(body))) {
    routeFileMap[match[1]] = match[2];
  }
  return routeFileMap;
}

function extractHomeEntrypoints(homeJs, routeFileMap = {}) {
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
      routeFile: routeFileMap[route] || '',
      output: readHomeStringField(block, 'output'),
      fit: readHomeStringField(block, 'fit'),
      limit: readHomeStringField(block, 'limit'),
      capabilities: readHomeArrayField(block, 'capabilities')
    });
  }
  return entries;
}

function extractToolStates(homeJs) {
  const states = {};
  const start = homeJs.indexOf('const toolStates = {');
  if (start === -1) return states;
  const end = homeJs.indexOf('\n  };', start);
  const body = end === -1 ? homeJs.slice(start) : homeJs.slice(start, end);
  const pattern = /(\w+):\s*\{\s*label:\s*'([^']+)',\s*tone:\s*'([^']+)',\s*summary:\s*'([^']+)'/g;
  let match;
  while ((match = pattern.exec(body))) {
    states[match[1]] = {
      key: match[1],
      label: match[2],
      tone: match[3],
      summary: match[4]
    };
  }
  return states;
}

function extractStateBoundaryRules(homeJs) {
  const rules = {};
  const start = homeJs.indexOf('const stateBoundaryRules = {');
  if (start === -1) return rules;
  const end = homeJs.indexOf('\n  };', start);
  const body = end === -1 ? homeJs.slice(start) : homeJs.slice(start, end);
  const pattern = /(\w+):\s*\{\s*limitAny:\s*\[([^\]]*)\](?:,\s*requiredCapabilities:\s*\[([^\]]*)\])?(?:,\s*forbiddenCapabilities:\s*\[([^\]]*)\])?\s*\}/g;
  let match;
  while ((match = pattern.exec(body))) {
    rules[match[1]] = {
      key: match[1],
      limitAny: parseQuotedList(match[2]),
      requiredCapabilities: parseQuotedList(match[3]),
      forbiddenCapabilities: parseQuotedList(match[4])
    };
  }
  return rules;
}

function extractGovernanceSources(homeJs) {
  const sources = {};
  const sourcePattern = /'([^']+)':\s*\{\s*label:\s*'([^']+)',\s*preflightKeys:\s*\[([^\]]*)\](?:,\s*fullPreflightKeys:\s*\[([^\]]*)\])?,\s*cardTag:\s*'([^']+)'/g;
  let match;
  while ((match = sourcePattern.exec(homeJs))) {
    sources[match[1]] = {
      key: match[1],
      label: match[2],
      preflightKeys: match[3]
        .split(',')
        .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean),
      fullPreflightKeys: (match[4] || '')
        .split(',')
        .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean),
      cardTag: match[5] || ''
    };
  }
  return sources;
}

function hasVercelSource(vercelText, route) {
  return Boolean(route && route.startsWith('/') && vercelText.includes(`"source": "${route}"`));
}

function resolveHomeEntrypointSource(item, routeFileMap = {}) {
  const routeFile = item?.routeFile || routeFileMap[item?.route] || '';
  if (!routeFile) {
    return {
      routeFile: '',
      sourcePath: '',
      absolutePath: '',
      exists: false,
      html: ''
    };
  }
  const absolutePath = path.resolve(toolboxRoot, routeFile);
  const exists = fileExists(absolutePath);
  return {
    routeFile,
    sourcePath: normalizeSlash(path.relative(repoRoot, absolutePath)),
    absolutePath,
    exists,
    html: exists ? readText(absolutePath) : ''
  };
}

function hasPrintSurface(html) {
  return /window\.print\(|btn-print|mode-bar__report|id="btnPrint"|列印計算書|列印頁面結果|列印整理結果/.test(String(html || ''));
}

function hasPageOnlyReadiness(html) {
  const text = String(html || '');
  return text.includes('page-only-report-status')
    && text.includes('優先閱讀')
    && text.includes('不會寫入計算書或列印 PDF');
}

function hidesPageOnlyReadinessInPrint(html) {
  return /@media\s+print[\s\S]*\.page-only-report-status[\s\S]*display\s*:\s*none\s*!important/.test(String(html || ''));
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

function boundaryRuleForEntrypoint(item, stateBoundaryRules = {}) {
  return item?.state ? (stateBoundaryRules[item.state] || {}) : {};
}

function boundaryIssuesForEntrypoint(item, stateBoundaryRules = {}) {
  const issues = [];
  if (!item.state) issues.push('missing-state');
  if (!item.output) issues.push('missing-output');
  if (!item.fit) issues.push('missing-fit');
  if (!item.limit) issues.push('missing-limit');
  if (item.state === 'formal' && !item.matrixCovered && !item.governance) {
    issues.push('formal-without-governance');
  }
  if (item.state && item.state !== 'formal') {
    const rule = boundaryRuleForEntrypoint(item, stateBoundaryRules);
    const needles = Array.isArray(rule.limitAny) ? rule.limitAny : [];
    if (needles.length && !needles.some(needle => String(item.limit || '').includes(needle))) {
      issues.push('weak-limit-boundary');
    }
    const requiredCapabilities = Array.isArray(rule.requiredCapabilities) ? rule.requiredCapabilities : [];
    if (requiredCapabilities.length > 0 && !requiredCapabilities.every(capability => (item.capabilities || []).includes(capability))) {
      issues.push('missing-required-capability');
    }
    const forbiddenCapabilities = Array.isArray(rule.forbiddenCapabilities) ? rule.forbiddenCapabilities : [];
    if (forbiddenCapabilities.some(capability => (item.capabilities || []).includes(capability))) {
      issues.push('non-formal-capability-claims-formal');
    }
  }
  if (item.pageOnlyReadinessRequired) {
    if (!item.sourceExists) {
      issues.push('missing-home-route-source');
    } else {
      if (!item.pageOnlyReadinessPresent) issues.push('missing-page-only-readiness');
      if (!item.pageOnlyReadinessHiddenInPrint) issues.push('page-only-readiness-print-leak');
    }
  }
  return issues;
}

function entrypointBoundaryList(items, toolStates = {}, stateBoundaryRules = {}, routeFileMap = {}) {
  return items
    .map(item => {
      const stateRule = boundaryRuleForEntrypoint(item, stateBoundaryRules);
      const source = resolveHomeEntrypointSource(item, routeFileMap);
      const reportSurface = hasPrintSurface(source.html);
      const pageOnlyReadinessRequired = reportSurface;
      const pageOnlyReadinessPresent = pageOnlyReadinessRequired ? hasPageOnlyReadiness(source.html) : false;
      const pageOnlyReadinessHiddenInPrint = pageOnlyReadinessRequired ? hidesPageOnlyReadinessInPrint(source.html) : false;
      const enrichedItem = {
        ...item,
        sourcePath: source.sourcePath,
        sourceExists: source.exists,
        reportSurface,
        pageOnlyReadinessRequired,
        pageOnlyReadinessPresent,
        pageOnlyReadinessHiddenInPrint
      };
      const matchedLimitNeedles = (Array.isArray(stateRule.limitAny) ? stateRule.limitAny : [])
        .filter(needle => String(item.limit || '').includes(needle));
      return {
        route: item.route,
        title: item.title,
        state: item.state || '',
        stateLabel: toolStates[item.state]?.label || item.state || '',
        stateSummary: toolStates[item.state]?.summary || '',
        boundaryRule: toolStates[item.state]?.summary || '',
        matchedLimitNeedles,
        output: item.output || '',
        fit: item.fit || '',
        limit: item.limit || '',
        capabilities: Array.isArray(item.capabilities) ? item.capabilities : [],
        sourcePath: source.sourcePath,
        sourceExists: source.exists,
        reportSurface,
        pageOnlyReadinessRequired,
        pageOnlyReadinessPresent,
        pageOnlyReadinessHiddenInPrint,
        boundaryIssues: boundaryIssuesForEntrypoint(enrichedItem, stateBoundaryRules)
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

function otherGovernanceList(items, governanceSources, preflightSummaries) {
  const summaries = Array.isArray(preflightSummaries) ? preflightSummaries.filter(Boolean) : [];
  const quickMode = summaries[0]?.quick === true;
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
      const quickPreflightKeys = Array.isArray(source?.preflightKeys) ? source.preflightKeys : [];
      const fullPreflightKeys = Array.isArray(source?.fullPreflightKeys) ? source.fullPreflightKeys : [];
      const preflightKeys = quickMode ? quickPreflightKeys : [...quickPreflightKeys, ...fullPreflightKeys];
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
        governanceCardTag: source?.cardTag || '',
        preflightKeys,
        fullPreflightKeys,
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

function buildEntrypointCoverage(homeEntrypoints, rows, vercelText, governanceSources = {}, preflightSummaries = [], toolStates = {}, stateBoundaryRules = {}, routeFileMap = {}) {
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
  const boundaryRows = entrypointBoundaryList(nonFormalOutsideCoverage, toolStates, stateBoundaryRules, routeFileMap);
  const boundaryIssueCount = boundaryRows.reduce((sum, item) => sum + item.boundaryIssues.length, 0);
  const pageOnlyBoundaryRows = boundaryRows.filter(item => item.pageOnlyReadinessRequired);
  const pageOnlyBoundaryIssueCount = pageOnlyBoundaryRows.reduce((sum, item) => {
    return sum + item.boundaryIssues.filter(issue => issue === 'missing-page-only-readiness' || issue === 'page-only-readiness-print-leak' || issue === 'missing-home-route-source').length;
  }, 0);
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
    pageOnlyBoundaryRequired: pageOnlyBoundaryRows.length,
    pageOnlyBoundaryComplete: pageOnlyBoundaryRows.filter(item => item.pageOnlyReadinessPresent && item.pageOnlyReadinessHiddenInPrint).length,
    pageOnlyBoundaryIssueCount,
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
    summarizeTraceabilityCatalog(state.deckingTraceabilityCatalog),
    summarizeTraceabilityCatalog(state.excavationTraceabilityCatalog)
  ];
}

function findPreflightRecord(preflightEvidenceSummaries, key) {
  const summaries = Array.isArray(preflightEvidenceSummaries) ? preflightEvidenceSummaries.filter(Boolean) : [];
  for (const summary of summaries) {
    const record = Array.isArray(summary.records)
      ? summary.records.find(item => item && item.key === key)
      : null;
    if (record) {
      return {
        ...record,
        evidenceRunId: summary.runId || '',
        evidenceQuick: summary.quick === true
      };
    }
  }
  return null;
}

function buildGlobalGovernance(preflightEvidenceSummaries, traceabilityCatalogCoverage) {
  const availableCatalogFamilies = (Array.isArray(traceabilityCatalogCoverage) ? traceabilityCatalogCoverage : [])
    .map(item => item.family)
    .filter(Boolean);
  const availableCatalogFamilySet = new Set(availableCatalogFamilies);
  const gates = GLOBAL_GOVERNANCE_GATES.map((gate) => {
    const record = findPreflightRecord(preflightEvidenceSummaries, gate.key);
    const missing = !record;
    const failed = Boolean(record && record.pass !== true);
    const issues = [];
    const requiredCatalogFamilies = Array.isArray(gate.catalogFamilies) ? gate.catalogFamilies.filter(Boolean) : [];
    const coveredCatalogFamilies = requiredCatalogFamilies.filter(family => availableCatalogFamilySet.has(family));
    const missingCatalogFamilies = requiredCatalogFamilies.filter(family => !availableCatalogFamilySet.has(family));
    if (missing) issues.push('missing-preflight-record');
    if (failed) issues.push('failed-preflight-record');
    const minCatalogs = Number.isFinite(Number(gate.minCatalogs)) ? Number(gate.minCatalogs) : 1;
    if (coveredCatalogFamilies.length < minCatalogs) issues.push('missing-traceability-catalog-coverage');
    if (missingCatalogFamilies.length > 0) issues.push('missing-specific-traceability-catalog');
    return {
      ...gate,
      pass: Boolean(record && record.pass === true && issues.length === 0),
      runId: record?.evidenceRunId || '',
      quick: record?.evidenceQuick === true,
      seconds: Number.isFinite(Number(record?.seconds)) ? Number(record.seconds) : 0,
      exitCode: Number.isFinite(Number(record?.exitCode)) ? Number(record.exitCode) : null,
      coveredCatalogs: coveredCatalogFamilies.length,
      catalogFamilies: coveredCatalogFamilies,
      requiredCatalogFamilies,
      missingCatalogFamilies,
      issues
    };
  });
  return {
    required: gates.length,
    passed: gates.filter(gate => gate.pass).length,
    issueCount: gates.reduce((sum, gate) => sum + gate.issues.length, 0),
    gates
  };
}

function loadSourceState() {
  const formalManifestRelativePath = '結構工具箱/tools/formal-tools.manifest.json';
  const formalTraceabilityRelativePath = '結構工具箱/tools/formal-traceability.catalog.json';
  const rcTraceabilityRelativePath = '鋼筋混凝土/tools/rc-traceability.catalog.json';
  const steelTraceabilityRelativePath = '鋼構工具/steel-traceability.catalog.json';
  const anchorTraceabilityRelativePath = '螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json';
  const stoneTraceabilityRelativePath = '石材固定/stone-traceability.catalog.json';
  const deckingTraceabilityRelativePath = '覆工板/decking-traceability.catalog.json';
  const excavationTraceabilityRelativePath = '開挖擋土支撐/excavation-traceability.catalog.json';
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
  const excavationTraceabilityPath = repoFile('開挖擋土支撐/excavation-traceability.catalog.json');
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
  const excavationTraceabilityCatalog = readJson(excavationTraceabilityPath);
  const localQuickManifest = readJson(localQuickManifestPath);
  const vercelText = readText(vercelPath);
  const homeJs = readText(homePath);
  const routeFileMap = extractRouteFileMap(homeJs);
  const homeEntrypoints = extractHomeEntrypoints(homeJs, routeFileMap);
  const preflightSummaryText = fileExists(preflightSummaryPath) ? readText(preflightSummaryPath).replace(/^\uFEFF/, '') : '';
  const preflightSummary = preflightSummaryText ? JSON.parse(preflightSummaryText) : null;
  const preflightSummaryStat = fileExists(preflightSummaryPath) ? fs.statSync(preflightSummaryPath) : null;
  const preflightHistoryText = fileExists(preflightHistoryPath) ? readText(preflightHistoryPath).replace(/^\uFEFF/, '') : '';
  const preflightHistory = preflightHistoryText ? JSON.parse(preflightHistoryText) : null;
  const preflightHistoryItems = Array.isArray(preflightHistory?.items) ? preflightHistory.items : [];
  const completedPreflightItems = Array.isArray(preflightHistory?.items)
    ? preflightHistory.items.filter(item => item && item.complete !== false)
    : [];
  const latestFullPreflightSource = findLatestPreflightHistorySummary(
    summary => summary && summary.quick === false,
    preflightHistoryItems
  );
  const latestPassingFullPreflightSource = findLatestPreflightHistorySummary(
    summary => summary && summary.quick === false && summary.pass === true,
    preflightHistoryItems
  );
  const latestFullPreflightSummaryPath = latestFullPreflightSource?.filePath || '';
  const latestPassingFullPreflightSummaryPath = latestPassingFullPreflightSource?.filePath || '';
  const latestFullPreflightSummaryRelativePath = latestFullPreflightSource?.sourcePath || '';
  const latestPassingFullPreflightSummaryRelativePath = latestPassingFullPreflightSource?.sourcePath || '';
  const latestFullPreflightSummary = latestFullPreflightSource?.payload || null;
  const latestPassingFullPreflightSummary = latestPassingFullPreflightSource?.payload || null;
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
    sourceInput('excavation-traceability-catalog', excavationTraceabilityRelativePath, excavationTraceabilityPath),
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
    excavationTraceabilityCatalog,
    localQuickManifest,
    vercelText,
    homeJs,
    routeFileMap,
    homeEntrypoints,
    toolStates: extractToolStates(homeJs),
    stateBoundaryRules: extractStateBoundaryRules(homeJs),
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
      latestCompletedFullRunId: latestFullPreflightSource?.payload?.runId || ''
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
  const formalContractPath = toolboxFile(state.formalManifest.shared.contractTest);
  const formalContractText = fileExists(formalContractPath) ? readText(formalContractPath) : '';
  return state.formalManifest.tools.map((tool) => {
    const htmlPath = toolboxFile(tool.html);
    const html = fileExists(htmlPath) ? readText(htmlPath) : '';
    const caps = tool.capabilities || {};
    const hasJsonWorkflow = Boolean(caps.jsonExport || caps.jsonImport || tool.exportButton || tool.importButton);
    const goldenCaseCount = Array.isArray(tool.goldenCases) ? tool.goldenCases.length : 0;
    const rowSourceTrace = sourceTraceFor([
      toolboxSourceInput('html', tool.html),
      toolboxSourceInput('shared-contract-test', state.formalManifest.shared.contractTest),
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
      reportTextSmoke: caps.reportRegression === true ? (
        formalContractText.includes('reportHtmlText') &&
        formalContractText.includes('visible report text')
      ) : NA,
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
        reportTextSmoke: checks.reportTextSmoke === true,
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
    const browserSmokePath = toolboxFile(state.localQuickManifest.shared.browserSmokeTest);
    const browserSmokeText = fileExists(browserSmokePath) ? readText(browserSmokePath) : '';
    const rowSourceTrace = sourceTraceFor([
      toolboxSourceInput('html', tool.html),
      toolboxSourceInput('core', tool.core),
      toolboxSourceInput('golden', tool.golden),
      toolboxSourceInput('test', tool.test),
      toolboxSourceInput('shared-output-consistency-test', state.localQuickManifest.shared.outputConsistencyTest),
      toolboxSourceInput('shared-browser-smoke-test', state.localQuickManifest.shared.browserSmokeTest),
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
      reportTextSmoke: tool.reportMode ? (
        browserSmokeText.includes('reportHtmlText') &&
        browserSmokeText.includes('visible report text')
      ) : NA,
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
        reportTextSmoke: checks.reportTextSmoke === true,
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

function summarize(rows, preflightSummary, preflightSummarySource = null, sourceTrace = null, entrypointCoverage = null, preflightHistoryHealth = null, traceabilityCatalogCoverage = [], globalGovernance = null) {
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
    reportTextSmoke: rows.filter(row => row.coverage.reportTextSmoke).length,
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
      '開挖擋土支撐/excavation-traceability.catalog.json',
      '結構工具箱/tools/local-quick-tools.manifest.json'
    ],
    sourceTrace: sourceTrace || { inputs: [] },
    traceabilityCatalogCoverage,
    globalGovernance: globalGovernance || {
      required: 0,
      passed: 0,
      issueCount: 0,
      gates: []
    },
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
      pageOnlyBoundaryRequired: 0,
      pageOnlyBoundaryComplete: 0,
      pageOnlyBoundaryIssueCount: 0,
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
      forcePlatformAudit: preflightSummary.forcePlatformAudit,
      forceSlowChecks: preflightSummary.forceSlowChecks,
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
    `- pageOnlyBoundary: complete=${entrypoint.pageOnlyBoundaryComplete || 0}/${entrypoint.pageOnlyBoundaryRequired || 0}, issues=${entrypoint.pageOnlyBoundaryIssueCount || 0}`,
    `- globalGovernance: complete=${payload.globalGovernance?.passed || 0}/${payload.globalGovernance?.required || 0}, issues=${payload.globalGovernance?.issueCount || 0}`,
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
    '## Global Governance Gates',
    '',
    '| gate | preflight key | status | runId | catalogs | scope | issues |',
    '|---|---|---|---|---:|---|---|'
  );
  const globalGates = Array.isArray(payload.globalGovernance?.gates) ? payload.globalGovernance.gates : [];
  if (globalGates.length === 0) {
    lines.push('| - | - | - | - | 0 | - | - |');
  } else {
    for (const gate of globalGates) {
      const issues = Array.isArray(gate.issues) && gate.issues.length ? gate.issues.join(', ') : '-';
      lines.push(`| ${markdownCell(gate.label)} | ${markdownCell(gate.key)} | ${gate.pass ? 'pass' : 'fail'} | ${markdownCell(gate.runId)} | ${gate.coveredCatalogs || 0} | ${markdownCell(gate.scope)} | ${markdownCell(issues)} |`);
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
    `| page-only readiness complete | ${(entrypoint.pageOnlyBoundaryComplete || 0)} / ${(entrypoint.pageOnlyBoundaryRequired || 0)} |`,
    `| page-only readiness issues | ${entrypoint.pageOnlyBoundaryIssueCount || 0} |`,
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
    '| route | title | governance | source | boundary tag | preflight keys | passed | failed | missing | issues |',
    '|---|---|---|---|---|---|---|---|---|---|'
  );
  const otherGovernanceRoutes = Array.isArray(entrypoint.otherGovernanceRoutes) ? entrypoint.otherGovernanceRoutes : [];
  if (otherGovernanceRoutes.length === 0) {
    lines.push('| - | - | - | - | - | - | - | - | - | - |');
  } else {
    for (const item of otherGovernanceRoutes) {
      const issues = Array.isArray(item.governanceIssues) && item.governanceIssues.length ? item.governanceIssues.join(', ') : '-';
      lines.push(`| ${markdownCell(item.route)} | ${markdownCell(item.title)} | ${markdownCell(item.governance)} | ${markdownCell(item.governanceLabel)} | ${markdownCell(item.governanceCardTag)} | ${markdownCell(item.preflightKeys)} | ${markdownCell(item.passedKeys)} | ${markdownCell(item.failedKeys)} | ${markdownCell(item.missingKeys)} | ${markdownCell(issues)} |`);
    }
  }

  lines.push(
    '',
    '### Non-Matrix Boundary Checks',
    '',
    '| route | title | state | source | boundary rule | matched needles | report surface | page-only readiness | print hidden | output | fit | limit | issues |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|'
  );
  const boundaryRoutes = Array.isArray(entrypoint.boundaryRoutes) ? entrypoint.boundaryRoutes : [];
  if (boundaryRoutes.length === 0) {
    lines.push('| - | - | - | - | - | - | - | - | - | - | - | - | - |');
  } else {
    for (const item of boundaryRoutes) {
      const issues = Array.isArray(item.boundaryIssues) && item.boundaryIssues.length ? item.boundaryIssues.join(', ') : '-';
      lines.push(`| ${markdownCell(item.route)} | ${markdownCell(item.title)} | ${markdownCell(item.stateLabel || item.state)} | ${markdownCell(item.sourcePath || '-')} | ${markdownCell(item.boundaryRule)} | ${markdownCell(item.matchedLimitNeedles)} | ${item.reportSurface ? 'yes' : 'no'} | ${item.pageOnlyReadinessRequired ? (item.pageOnlyReadinessPresent ? 'yes' : 'no') : '-'} | ${item.pageOnlyReadinessRequired ? (item.pageOnlyReadinessHiddenInPrint ? 'yes' : 'no') : '-'} | ${markdownCell(item.output)} | ${markdownCell(item.fit)} | ${markdownCell(item.limit)} | ${markdownCell(issues)} |`);
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
  const entrypointCoverage = buildEntrypointCoverage(
    state.homeEntrypoints,
    rows,
    state.vercelText,
    state.governanceSources,
    state.preflightEvidenceSummaries,
    state.toolStates,
    state.stateBoundaryRules,
    state.routeFileMap
  );
  const traceabilityCatalogCoverage = buildTraceabilityCatalogCoverage(state);
  const globalGovernance = buildGlobalGovernance(state.preflightEvidenceSummaries, traceabilityCatalogCoverage);
  const payload = {
    ...summarize(rows, state.preflightSummary, state.preflightSummarySource, state.sourceTrace, entrypointCoverage, state.preflightHistoryHealth, traceabilityCatalogCoverage, globalGovernance),
    rows
  };

  return {
    payload,
    markdown: buildMarkdown(payload)
  };
}

function sourceHashIfExists(filePath) {
  if (!fileExists(filePath)) return '';
  return hashText(readText(filePath).replace(/^\uFEFF/, ''));
}

function compactStringArray(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function compactNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildHomepagePlatformStatus(payload) {
  if (!payload) return null;
  return {
    snapshotVersion: 1,
    kind: 'platform-status',
    generatedAt: String(payload.generatedAt || ''),
    runId: String(payload.runId || ''),
    pass: Boolean(payload.pass),
    failureCount: compactNumber(payload.failureCount),
    source: String(payload.source || ''),
    modules: compactStringArray(payload.modules),
    sourcePath: 'output/audit/platform-status.json',
    sourceHash: sourceHashIfExists(platformStatusSourcePath)
  };
}

function resolveHomepagePreflightSource() {
  const latestSummary = readJsonIfExists(preflightSummarySourcePath);
  if (latestSummary && latestSummary.quick === false && latestSummary.pass === true) {
    const runId = String(latestSummary.runId || '').trim();
    const historySummaryPath = runId
      ? path.join(preflightHistoryDir, runId, 'preflight-summary.json')
      : '';
    const filePath = historySummaryPath && fileExists(historySummaryPath)
      ? historySummaryPath
      : preflightSummarySourcePath;
    return {
      payload: latestSummary,
      filePath,
      sourcePath: displayPath(filePath)
    };
  }
  const history = readJsonIfExists(preflightHistorySourcePath);
  const latestFull = findLatestPreflightHistorySummary(
    summary => summary && summary.quick === false && summary.pass === true,
    history?.items
  );
  if (latestFull) {
    return latestFull;
  }
  return {
    payload: latestSummary,
    filePath: preflightSummarySourcePath,
    sourcePath: 'output/preflight/preflight-summary.json'
  };
}

function buildHomepagePreflightStatus(payload, sourceFilePath, sourcePath) {
  if (!payload) return null;
  return {
    snapshotVersion: 1,
    kind: 'preflight-summary',
    generatedAt: String(payload.generatedAt || ''),
    runId: String(payload.runId || ''),
    quick: Boolean(payload.quick),
    forcePlatformAudit: Boolean(payload.forcePlatformAudit),
    forceSlowChecks: Boolean(payload.forceSlowChecks),
    pass: Boolean(payload.pass),
    failureCount: compactNumber(payload.failureCount),
    failedKeys: compactStringArray(payload.failedKeys),
    slowReuseCount: compactNumber(payload.slowReuseCount),
    slowReuseKeys: compactStringArray(payload.slowReuseKeys),
    recordsCount: compactNumber(payload.recordsCount),
    passedCount: compactNumber(payload.passedCount),
    totalSeconds: compactNumber(payload.totalSeconds),
    slowestKey: String(payload.slowestKey || ''),
    slowestSeconds: compactNumber(payload.slowestSeconds),
    postCheckCount: compactNumber(payload.postCheckCount),
    postChecksPassedCount: compactNumber(payload.postChecksPassedCount),
    postCheckFailures: compactStringArray(payload.postCheckFailures),
    sourcePath,
    sourceHash: sourceHashIfExists(sourceFilePath)
  };
}

function isRenderedDeliveryRelease(payload) {
  return Boolean(
    payload
    && payload.quick === false
    && payload.forcePlatformAudit === true
    && payload.forceSlowChecks === true
    && payload.pass === true
    && compactNumber(payload.slowReuseCount) === 0
    && payload.platformAuditReused === false
  );
}

function renderedDeliveryEvidencePathForRun(runId) {
  return path.join(
    preflightHistoryDir,
    String(runId || ''),
    'rendered-delivery-evidence',
    renderedDeliveryEvidenceSummaryName
  );
}

function isCompleteRenderedDeliveryEvidence(evidence, runId) {
  const supplementalDeclared = Number.isInteger(evidence?.supplementalRequired);
  return Boolean(
    evidence
    && evidence.kind === 'release-rendered-delivery-evidence'
    && evidence.runId === runId
    && evidence.pass === true
    && Number.isInteger(evidence.required)
    && Number.isInteger(evidence.complete)
    && evidence.complete === evidence.required
    && (!supplementalDeclared || (
      Number.isInteger(evidence.supplementalComplete)
      && evidence.supplementalComplete === evidence.supplementalRequired
      && evidence.supplementalPass === true
    ))
  );
}

function resolveRenderedDeliveryEvidenceSource() {
  const latestReleaseSummary = readJsonIfExists(preflightSummarySourcePath);
  const latestReleaseEvidence = isRenderedDeliveryRelease(latestReleaseSummary)
    ? tryReadJsonIfExists(renderedDeliveryEvidencePathForRun(latestReleaseSummary.runId))
    : null;
  const history = readJsonIfExists(preflightHistorySourcePath);
  const releaseSource = isCompleteRenderedDeliveryEvidence(latestReleaseEvidence, latestReleaseSummary?.runId)
    ? { payload: latestReleaseSummary }
    : findLatestPreflightHistorySummary(
      summary => {
        if (!isRenderedDeliveryRelease(summary)) return false;
        const evidence = tryReadJsonIfExists(renderedDeliveryEvidencePathForRun(summary.runId));
        return isCompleteRenderedDeliveryEvidence(evidence, summary.runId);
      },
      history?.items
    );
  if (!releaseSource) return null;

  const filePath = renderedDeliveryEvidencePathForRun(releaseSource.payload.runId);
  const evidence = readJsonIfExists(filePath);
  const familyCounts = new Map();
  for (const record of Array.isArray(evidence?.records) ? evidence.records : []) {
    const family = String(record?.family || '').trim();
    if (!family) continue;
    familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
  }
  const supplementalFamilyCounts = new Map();
  for (const record of Array.isArray(evidence?.supplementalRecords) ? evidence.supplementalRecords : []) {
    const family = String(record?.family || '').trim();
    if (!family) continue;
    supplementalFamilyCounts.set(family, (supplementalFamilyCounts.get(family) || 0) + 1);
  }
  return {
    payload: evidence,
    families: Array.from(familyCounts, ([family, complete]) => ({ family, complete }))
      .sort((left, right) => left.family.localeCompare(right.family)),
    supplementalFamilies: Array.from(supplementalFamilyCounts, ([family, complete]) => ({ family, complete }))
      .sort((left, right) => left.family.localeCompare(right.family)),
    filePath,
    sourcePath: displayPath(filePath),
    sourceHash: sourceHashIfExists(filePath)
  };
}

function buildReportTextSmokeEvidence(matrixPayload, preflightPayload = null) {
  const rows = Array.isArray(matrixPayload?.rows) ? matrixPayload.rows : [];
  const records = Array.isArray(preflightPayload?.records) ? preflightPayload.records : [];
  const governedFamilies = new Set(REPORT_TEXT_SMOKE_EVIDENCE_GATES.map(gate => gate.family));
  const gates = REPORT_TEXT_SMOKE_EVIDENCE_GATES.map(spec => {
    const familyRows = rows.filter(row => row.family === spec.family && row.coverage?.reportModes === true);
    const required = familyRows.length;
    const staticComplete = familyRows.filter(row => row.coverage?.reportTextSmoke === true).length;
    const record = records.find(item => item && item.key === spec.key) || null;
    const runtimePass = Boolean(preflightPayload?.pass && record?.pass);
    const complete = runtimePass ? Math.min(required, staticComplete) : 0;
    return {
      key: spec.key,
      label: spec.label,
      family: spec.family,
      scopeLabel: spec.scopeLabel,
      required,
      complete,
      pass: required > 0 && staticComplete === required && runtimePass,
      reused: Boolean(record?.reused),
      seconds: compactNumber(record?.seconds)
    };
  });
  const unmappedRows = rows.filter(row => row.coverage?.reportModes === true && !governedFamilies.has(row.family));
  const required = gates.reduce((sum, gate) => sum + gate.required, 0) + unmappedRows.length;
  const complete = gates.reduce((sum, gate) => sum + gate.complete, 0);
  const evidenceComplete = gates.filter(gate => gate.pass).length;
  const scopeItems = gates
    .filter(gate => gate.required > 0)
    .map(gate => `${gate.scopeLabel} ${gate.required} 項`);
  return {
    required,
    complete,
    issueCount: Math.max(0, required - complete),
    evidenceRequired: gates.length,
    evidenceComplete,
    evidenceIssueCount: gates.length - evidenceComplete,
    runId: String(preflightPayload?.runId || ''),
    gates,
    scope: scopeItems.length
      ? `正式計算書可讀文字抽檢範圍：成熟度矩陣：${scopeItems.join('、')}。矩陣外工具家族仍以各自報告合約治理。`
      : '正式計算書可讀文字抽檢範圍：成熟度矩陣目前沒有可讀文字抽檢範圍。',
    unmappedFamilies: Array.from(new Set(unmappedRows.map(row => String(row.family || '')).filter(Boolean)))
  };
}

function buildHomepageReportReadinessStatus(matrixPayload, sourceHash, preflightStatus = null, preflightPayload = null, renderedDeliveryEvidence = null) {
  if (!matrixPayload) return null;
  const entrypointCoverage = matrixPayload.entrypointCoverage || {};
  const boundaryRoutes = Array.isArray(entrypointCoverage.boundaryRoutes) ? entrypointCoverage.boundaryRoutes : [];
  const pageOnlyRoutes = boundaryRoutes.filter(item => item.pageOnlyReadinessRequired);
  const pageOnlyTitles = pageOnlyRoutes.map(item => String(item.title || '').trim()).filter(Boolean);
  const pageOnlyStateLabels = Array.from(new Set(pageOnlyRoutes.map(item => String(item.stateLabel || item.state || '').trim()).filter(Boolean)));
  const required = compactNumber(entrypointCoverage.pageOnlyBoundaryRequired);
  const complete = compactNumber(entrypointCoverage.pageOnlyBoundaryComplete);
  const issues = compactNumber(entrypointCoverage.pageOnlyBoundaryIssueCount);
  const reportTextSmokeEvidence = buildReportTextSmokeEvidence(matrixPayload, preflightPayload);
  const reportTextSmokeRequired = reportTextSmokeEvidence.required;
  const reportTextSmokeComplete = reportTextSmokeEvidence.complete;
  const reportTextSmokeIssueCount = reportTextSmokeEvidence.issueCount;
  const renderedDeliveryPayload = renderedDeliveryEvidence?.payload || null;
  const renderedDeliveryRequired = compactNumber(renderedDeliveryPayload?.required);
  const renderedDeliveryComplete = compactNumber(renderedDeliveryPayload?.complete);
  const renderedDeliveryIssueCount = renderedDeliveryPayload?.pass === true
    ? Math.max(0, renderedDeliveryRequired - renderedDeliveryComplete)
    : Math.max(1, renderedDeliveryRequired - renderedDeliveryComplete);
  const renderedDeliveryFamilies = Array.isArray(renderedDeliveryEvidence?.families)
    ? renderedDeliveryEvidence.families
    : [];
  const supplementalDeliveryDeclared = Number.isInteger(renderedDeliveryPayload?.supplementalRequired);
  const supplementalDeliveryRequired = supplementalDeliveryDeclared
    ? compactNumber(renderedDeliveryPayload.supplementalRequired)
    : 0;
  const supplementalDeliveryComplete = supplementalDeliveryDeclared
    ? compactNumber(renderedDeliveryPayload.supplementalComplete)
    : 0;
  const supplementalDeliveryIssueCount = !supplementalDeliveryDeclared
    ? 0
    : renderedDeliveryPayload?.supplementalPass === true
      ? Math.max(0, supplementalDeliveryRequired - supplementalDeliveryComplete)
      : Math.max(1, supplementalDeliveryRequired - supplementalDeliveryComplete);
  const supplementalDeliveryFamilies = Array.isArray(renderedDeliveryEvidence?.supplementalFamilies)
    ? renderedDeliveryEvidence.supplementalFamilies
    : [];
  const renderedDeliverySummary = supplementalDeliveryDeclared
    ? `最新正式放行實際交付物渲染：首頁正式工具 ${renderedDeliveryComplete} / ${renderedDeliveryRequired}；本機服務成品 ${supplementalDeliveryComplete} / ${supplementalDeliveryRequired}。`
    : `最新正式放行實際交付物渲染：${renderedDeliveryComplete} / ${renderedDeliveryRequired}。`;
  const summary = `頁面上的「優先建議報告閱讀狀態」診斷明細只供公司內部整理計算附件前檢查，不會寫入計算書、列印或 PDF；RC 梁柱若非 ready，輸出會另以 DRAFT／非正式附件標明文件分類。目前首頁矩陣外 ${complete} / ${required} 個有列印 / 報表表面的入口已完成頁面專用閱讀狀態治理。`;
  const details = [
    pageOnlyTitles.length
      ? `目前覆蓋 ${pageOnlyStateLabels.join(' / ')} 入口：${pageOnlyTitles.join('、')}。`
      : '目前沒有需要頁面專用閱讀狀態治理的矩陣外入口。',
    `正式計算書可讀文字抽檢：${reportTextSmokeComplete} / ${reportTextSmokeRequired} 個有報告模式的工具已完成；最新完整交付前檢查的瀏覽器 smoke 證據為 ${reportTextSmokeEvidence.evidenceComplete} / ${reportTextSmokeEvidence.evidenceRequired}。本項確認正式輸出的可讀文字與頁面診斷明細排除；RC 梁柱非 ready 的 DRAFT 文件分類是必要輸出邊界，不屬於 page-only 診斷明細。`,
    `正式放行實際交付物渲染佐證：${renderedDeliveryComplete} / ${renderedDeliveryRequired} 個首頁正式工具已完成，涵蓋 ${renderedDeliveryFamilies.length} 個工具家族${supplementalDeliveryDeclared ? `；另有 ${supplementalDeliveryComplete} / ${supplementalDeliveryRequired} 個本機服務成品，涵蓋 ${supplementalDeliveryFamilies.length} 個服務家族` : ''}；證據來自 release ${String(renderedDeliveryPayload?.runId || '-')}。本項只顯示於頁面狀態，不會寫入計算書、列印或 PDF。`,
    `可讀文字抽檢範圍：${reportTextSmokeEvidence.scope}`,
    '首頁卡片會標記報告邊界、計算書邊界、報表邊界或 JSON/計算書/文字 邊界，避免把 page-only 提醒誤當正式交付內容。',
    '正式交付仍以計算書、Word、PDF、workbook 或下載端點輸出為準。'
  ];
  return {
    snapshotVersion: 1,
    kind: 'report-readiness-status',
    generatedAt: String(matrixPayload.generatedAt || ''),
    runId: String(preflightStatus?.runId || matrixPayload.latestPreflight?.runId || ''),
    pass: issues === 0 && reportTextSmokeIssueCount === 0 && reportTextSmokeEvidence.evidenceIssueCount === 0 && renderedDeliveryIssueCount === 0 && supplementalDeliveryIssueCount === 0,
    failureCount: issues + Math.max(reportTextSmokeIssueCount, reportTextSmokeEvidence.evidenceIssueCount) + renderedDeliveryIssueCount + supplementalDeliveryIssueCount,
    badge: '頁面專用',
    label: '報告閱讀狀態總覽',
    summary,
    compactSummary: '「優先建議報告閱讀狀態」診斷明細不會寫入計算書、列印或 PDF；RC 梁柱非 ready 輸出會另帶 DRAFT／非正式附件分類。',
    details,
    pageOnlyBoundaryRequired: required,
    pageOnlyBoundaryComplete: complete,
    pageOnlyBoundaryIssueCount: issues,
    reportTextSmokeRequired,
    reportTextSmokeComplete,
    reportTextSmokeIssueCount,
    reportTextSmokeEvidenceRequired: reportTextSmokeEvidence.evidenceRequired,
    reportTextSmokeEvidenceComplete: reportTextSmokeEvidence.evidenceComplete,
    reportTextSmokeEvidenceIssueCount: reportTextSmokeEvidence.evidenceIssueCount,
    reportTextSmokeEvidenceRunId: reportTextSmokeEvidence.runId,
    reportTextSmokeEvidenceGates: reportTextSmokeEvidence.gates,
    reportTextSmokeEvidenceUnmappedFamilies: reportTextSmokeEvidence.unmappedFamilies,
    reportTextSmokeScope: reportTextSmokeEvidence.scope,
    renderedDeliveryEvidenceRequired: renderedDeliveryRequired,
    renderedDeliveryEvidenceComplete: renderedDeliveryComplete,
    renderedDeliveryEvidenceIssueCount: renderedDeliveryIssueCount,
    renderedDeliveryEvidenceRunId: String(renderedDeliveryPayload?.runId || ''),
    renderedDeliveryEvidenceFamilies: renderedDeliveryFamilies,
    renderedDeliveryEvidenceSummary: renderedDeliverySummary,
    renderedDeliveryEvidenceSourcePath: String(renderedDeliveryEvidence?.sourcePath || ''),
    renderedDeliveryEvidenceSourceHash: String(renderedDeliveryEvidence?.sourceHash || ''),
    ...(supplementalDeliveryDeclared ? {
      supplementalDeliveryEvidenceRequired: supplementalDeliveryRequired,
      supplementalDeliveryEvidenceComplete: supplementalDeliveryComplete,
      supplementalDeliveryEvidenceIssueCount: supplementalDeliveryIssueCount,
      supplementalDeliveryEvidenceFamilies: supplementalDeliveryFamilies,
      supplementalDeliveryEvidenceSummary: `本機服務實際交付物渲染：${supplementalDeliveryComplete} / ${supplementalDeliveryRequired}。`,
    } : {}),
    pageOnlyRoutes: pageOnlyRoutes.map(item => ({
      route: String(item.route || ''),
      title: String(item.title || ''),
      state: String(item.stateLabel || item.state || ''),
      sourcePath: String(item.sourcePath || '')
    })),
    sourcePath: 'output/audit/tool-maturity-matrix.json',
    preflightStatusSourcePath: String(preflightStatus?.sourcePath || ''),
    sourceHash: String(sourceHash || '')
  };
}

function writeHomepageStatusSnapshots(matrixPayload = null, matrixSourceHash = '') {
  const platformStatus = buildHomepagePlatformStatus(readJsonIfExists(platformStatusSourcePath));
  const preflightSource = resolveHomepagePreflightSource();
  const preflightStatus = buildHomepagePreflightStatus(preflightSource.payload, preflightSource.filePath, preflightSource.sourcePath);
  const renderedDeliveryEvidence = resolveRenderedDeliveryEvidenceSource();
  const reportReadinessStatus = buildHomepageReportReadinessStatus(matrixPayload, matrixSourceHash || sourceHashIfExists(jsonOutputPath), preflightStatus, preflightSource.payload, renderedDeliveryEvidence);
  fs.mkdirSync(homepageStatusDir, { recursive: true });
  if (platformStatus) {
    fs.writeFileSync(homepagePlatformStatusPath, `${JSON.stringify(platformStatus, null, 2)}\n`, 'utf8');
  }
  if (preflightStatus) {
    fs.writeFileSync(homepagePreflightStatusPath, `${JSON.stringify(preflightStatus, null, 2)}\n`, 'utf8');
  }
  if (reportReadinessStatus) {
    fs.writeFileSync(homepageReportReadinessStatusPath, `${JSON.stringify(reportReadinessStatus, null, 2)}\n`, 'utf8');
  }
}

function writeMatrix(matrix, options = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonText = `${JSON.stringify(matrix.payload, null, 2)}\n`;
  fs.writeFileSync(jsonOutputPath, jsonText, 'utf8');
  fs.writeFileSync(markdownOutputPath, matrix.markdown, 'utf8');
  if (!options.preserveHomepageStatus) {
    writeHomepageStatusSnapshots(matrix.payload, hashText(jsonText));
  }
}

function displayPath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function assertHomepageStatusSnapshot(filePath, expectedKind, expectedSourcePath, sourcePath, options = {}) {
  assert.ok(fileExists(filePath), `homepage status snapshot exists: ${displayPath(filePath)}`);
  const payload = readJson(filePath);
  assert.equal(payload.snapshotVersion, 1, `${expectedKind} snapshot version`);
  assert.equal(payload.kind, expectedKind, `${expectedKind} snapshot kind`);
  assert.equal(typeof payload.generatedAt, 'string', `${expectedKind} generatedAt string`);
  assert.equal(typeof payload.runId, 'string', `${expectedKind} runId string`);
  assert.equal(typeof payload.pass, 'boolean', `${expectedKind} pass boolean`);
  assert.equal(Number.isInteger(payload.failureCount), true, `${expectedKind} failureCount integer`);
  if (expectedSourcePath instanceof RegExp) {
    assert.match(payload.sourcePath, expectedSourcePath, `${expectedKind} sourcePath`);
  } else {
    assert.equal(payload.sourcePath, expectedSourcePath, `${expectedKind} sourcePath`);
  }
  assert.match(payload.sourceHash, /^[0-9a-f]{64}$/i, `${expectedKind} sourceHash sha256`);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'root'), false, `${expectedKind} must not publish local root`);
  assert.equal(JSON.stringify(payload).includes(repoRoot), false, `${expectedKind} must not publish local absolute paths`);
  const currentSourcePath = sourcePath || repoFile(String(payload.sourcePath || '').replace(/\\/g, '/'));
  if (!options.skipCurrentSourceHash && fileExists(currentSourcePath)) {
    assert.equal(payload.sourceHash, sourceHashIfExists(currentSourcePath), `${expectedKind} sourceHash current`);
  }
  return payload;
}

function checkMatrix(payload, markdown, options = {}) {
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
  assert.ok(payload.globalGovernance && typeof payload.globalGovernance === 'object', 'tool maturity matrix globalGovernance object');
  assert.equal(Number.isInteger(payload.globalGovernance.required), true, 'tool maturity matrix globalGovernance required integer');
  assert.equal(Number.isInteger(payload.globalGovernance.passed), true, 'tool maturity matrix globalGovernance passed integer');
  assert.equal(Number.isInteger(payload.globalGovernance.issueCount), true, 'tool maturity matrix globalGovernance issueCount integer');
  assert.ok(Array.isArray(payload.globalGovernance.gates), 'tool maturity matrix globalGovernance gates array');
  const reportDisclosureGate = payload.globalGovernance.gates.find(item => item.key === 'report-disclosure-contract');
  assert.ok(reportDisclosureGate, 'tool maturity matrix globalGovernance includes report disclosure gate');
  assert.equal(reportDisclosureGate.pass, true, 'tool maturity matrix report disclosure gate passed');
  assert.equal(reportDisclosureGate.coveredCatalogs, 7, 'tool maturity matrix report disclosure gate covers traceability catalogs');
  assert.deepEqual(reportDisclosureGate.catalogFamilies, ['formal-traceability', 'rc-traceability', 'steel-traceability', 'anchor-traceability', 'stone-traceability', 'decking-traceability', 'excavation-traceability'], 'tool maturity matrix report disclosure gate relevant families');
  assert.deepEqual(reportDisclosureGate.issues, [], 'tool maturity matrix report disclosure gate issues empty');
  const deliveryArtifactsGate = payload.globalGovernance.gates.find(item => item.key === 'delivery-artifacts-contract');
  assert.ok(deliveryArtifactsGate, 'tool maturity matrix globalGovernance includes delivery artifacts gate');
  assert.equal(deliveryArtifactsGate.pass, true, 'tool maturity matrix delivery artifacts gate passed');
  assert.equal(deliveryArtifactsGate.coveredCatalogs, 4, 'tool maturity matrix delivery artifacts gate covers traceability catalogs');
  assert.deepEqual(deliveryArtifactsGate.catalogFamilies, ['stone-traceability', 'anchor-traceability', 'decking-traceability', 'excavation-traceability'], 'tool maturity matrix delivery artifacts gate relevant families');
  assert.deepEqual(deliveryArtifactsGate.issues, [], 'tool maturity matrix delivery artifacts gate issues empty');
  const releaseReadinessGate = payload.globalGovernance.gates.find(item => item.key === 'release-readiness-contract');
  assert.ok(releaseReadinessGate, 'tool maturity matrix globalGovernance includes release readiness gate');
  assert.equal(releaseReadinessGate.pass, true, 'tool maturity matrix release readiness gate passed');
  assert.equal(releaseReadinessGate.coveredCatalogs, 0, 'tool maturity matrix release readiness gate has no catalog dependency');
  assert.deepEqual(releaseReadinessGate.catalogFamilies, [], 'tool maturity matrix release readiness gate relevant families empty');
  assert.deepEqual(releaseReadinessGate.issues, [], 'tool maturity matrix release readiness gate issues empty');
  const renderedDeliveryGate = payload.globalGovernance.gates.find(item => item.key === 'rendered-delivery-evidence');
  assert.ok(renderedDeliveryGate, 'tool maturity matrix rendered delivery evidence gate exists');
  assert.equal(renderedDeliveryGate.pass, true, 'tool maturity matrix rendered delivery evidence gate passed');
  assert.equal(renderedDeliveryGate.coveredCatalogs, 0, 'tool maturity matrix rendered delivery evidence gate has no catalog dependency');
  assert.deepEqual(renderedDeliveryGate.issues, [], 'tool maturity matrix rendered delivery evidence gate issues empty');
  assert.ok(markdown.includes('## Global Governance Gates'), 'tool maturity matrix markdown exposes global governance gates');
  assert.ok(markdown.includes('report-disclosure-contract'), 'tool maturity matrix markdown exposes report disclosure gate');
  assert.ok(markdown.includes('delivery-artifacts-contract'), 'tool maturity matrix markdown exposes delivery artifacts gate');
  assert.ok(markdown.includes('release-readiness-contract'), 'tool maturity matrix markdown exposes release readiness gate');
  assert.ok(markdown.includes('rendered-delivery-evidence'), 'tool maturity matrix markdown exposes rendered delivery evidence gate');
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
  assert.equal(Number.isInteger(payload.entrypointCoverage.pageOnlyBoundaryRequired), true, 'tool maturity matrix entrypointCoverage pageOnlyBoundaryRequired integer');
  assert.equal(Number.isInteger(payload.entrypointCoverage.pageOnlyBoundaryComplete), true, 'tool maturity matrix entrypointCoverage pageOnlyBoundaryComplete integer');
  assert.equal(Number.isInteger(payload.entrypointCoverage.pageOnlyBoundaryIssueCount), true, 'tool maturity matrix entrypointCoverage pageOnlyBoundaryIssueCount integer');
  assert.equal(payload.entrypointCoverage.boundaryComplete, payload.entrypointCoverage.boundaryRequired, 'tool maturity matrix entrypointCoverage boundary checks complete');
  assert.equal(payload.entrypointCoverage.boundaryIssueCount, 0, 'tool maturity matrix entrypointCoverage boundary issues empty');
  assert.equal(payload.entrypointCoverage.pageOnlyBoundaryComplete, payload.entrypointCoverage.pageOnlyBoundaryRequired, 'tool maturity matrix entrypointCoverage page-only readiness checks complete');
  assert.equal(payload.entrypointCoverage.pageOnlyBoundaryIssueCount, 0, 'tool maturity matrix entrypointCoverage page-only readiness issues empty');
  assert.ok(Array.isArray(payload.entrypointCoverage.outsideMatrixRoutes), 'tool maturity matrix entrypointCoverage outsideMatrixRoutes array');
  assert.ok(Array.isArray(payload.entrypointCoverage.boundaryRoutes), 'tool maturity matrix entrypointCoverage boundaryRoutes array');
  assert.ok(payload.entrypointCoverage.boundaryRoutes.length > 0, 'tool maturity matrix entrypointCoverage boundaryRoutes populated');
  for (const route of payload.entrypointCoverage.otherGovernanceRoutes) {
    assert.ok(route.governance, `tool maturity matrix other governance route governance: ${route.route}`);
    assert.ok(route.governanceLabel, `tool maturity matrix other governance route label: ${route.route}`);
    assert.ok(route.governanceCardTag, `tool maturity matrix other governance route boundary tag: ${route.route}`);
    assert.ok(Array.isArray(route.preflightKeys) && route.preflightKeys.length > 0, `tool maturity matrix other governance route preflight keys populated: ${route.route}`);
    assert.deepEqual(route.failedKeys, [], `tool maturity matrix other governance route failed keys empty: ${route.route}`);
    assert.deepEqual(route.missingKeys, [], `tool maturity matrix other governance route missing keys empty: ${route.route}`);
    assert.deepEqual(route.governanceIssues, [], `tool maturity matrix other governance route issues empty: ${route.route}`);
    assert.equal(route.pass, true, `tool maturity matrix other governance route pass: ${route.route}`);
  }
  for (const route of payload.entrypointCoverage.boundaryRoutes) {
    assert.ok(route.stateLabel, `tool maturity matrix boundary route state label: ${route.route}`);
    assert.ok(route.boundaryRule, `tool maturity matrix boundary route rule: ${route.route}`);
    assert.ok(Array.isArray(route.matchedLimitNeedles), `tool maturity matrix boundary route matched needles array: ${route.route}`);
    assert.ok(route.matchedLimitNeedles.length > 0, `tool maturity matrix boundary route matched needles populated: ${route.route}`);
    assert.ok(route.output, `tool maturity matrix boundary route output: ${route.route}`);
    assert.ok(route.fit, `tool maturity matrix boundary route fit: ${route.route}`);
    assert.ok(route.limit, `tool maturity matrix boundary route limit: ${route.route}`);
    assert.ok(typeof route.sourcePath === 'string', `tool maturity matrix boundary route sourcePath string: ${route.route}`);
    assert.equal(typeof route.reportSurface, 'boolean', `tool maturity matrix boundary route reportSurface boolean: ${route.route}`);
    assert.equal(typeof route.pageOnlyReadinessRequired, 'boolean', `tool maturity matrix boundary route pageOnlyReadinessRequired boolean: ${route.route}`);
    assert.equal(typeof route.pageOnlyReadinessPresent, 'boolean', `tool maturity matrix boundary route pageOnlyReadinessPresent boolean: ${route.route}`);
    assert.equal(typeof route.pageOnlyReadinessHiddenInPrint, 'boolean', `tool maturity matrix boundary route pageOnlyReadinessHiddenInPrint boolean: ${route.route}`);
    if (route.pageOnlyReadinessRequired) {
      assert.ok(route.sourcePath, `tool maturity matrix boundary route page-only sourcePath: ${route.route}`);
      assert.equal(route.pageOnlyReadinessPresent, true, `tool maturity matrix boundary route page-only readiness present: ${route.route}`);
      assert.equal(route.pageOnlyReadinessHiddenInPrint, true, `tool maturity matrix boundary route page-only hidden in print: ${route.route}`);
    }
    assert.deepEqual(route.boundaryIssues, [], `tool maturity matrix boundary route issues empty: ${route.route}`);
  }
  assert.ok(markdown.includes('## Coverage Totals'), 'tool maturity matrix markdown exposes coverage totals');
  assert.ok(markdown.includes('## Traceability Catalog Coverage'), 'tool maturity matrix markdown exposes traceability catalog coverage');
  assert.ok(markdown.includes('pageOnlyBoundary:'), 'tool maturity matrix markdown exposes page-only boundary summary');
  assert.ok(markdown.includes('page-only readiness complete'), 'tool maturity matrix markdown exposes page-only readiness metric');
  assert.ok(Array.isArray(payload.traceabilityCatalogCoverage), 'tool maturity matrix traceability catalog coverage array');
  const formalTraceabilityCoverage = payload.traceabilityCatalogCoverage.find(item => item.family === 'formal-traceability');
  assert.ok(formalTraceabilityCoverage, 'tool maturity matrix includes formal traceability catalog coverage');
  assert.equal(formalTraceabilityCoverage.covered, formalTraceabilityCoverage.tools, 'tool maturity matrix formal traceability catalog fully covered');
  assert.ok(formalTraceabilityCoverage.traceCount >= formalTraceabilityCoverage.tools, 'tool maturity matrix formal traceability catalog has traces');
  assert.deepEqual(formalTraceabilityCoverage.uncoveredKeys, [], 'tool maturity matrix formal traceability catalog has no uncovered tools');
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
  const excavationTraceabilityCoverage = payload.traceabilityCatalogCoverage.find(item => item.family === 'excavation-traceability');
  assert.ok(excavationTraceabilityCoverage, 'tool maturity matrix includes excavation traceability catalog coverage');
  assert.equal(excavationTraceabilityCoverage.covered, excavationTraceabilityCoverage.tools, 'tool maturity matrix excavation traceability catalog fully covered');
  assert.ok(excavationTraceabilityCoverage.traceCount >= excavationTraceabilityCoverage.tools, 'tool maturity matrix excavation traceability catalog has traces');
  assert.deepEqual(excavationTraceabilityCoverage.uncoveredKeys, [], 'tool maturity matrix excavation traceability catalog has no uncovered tools');
  assert.ok(markdown.includes('## Homepage Entrypoint Coverage'), 'tool maturity matrix exposes homepage entrypoint coverage');
  assert.ok(markdown.includes('### Other Governance Sources'), 'tool maturity matrix exposes other governance sources');
  assert.ok(markdown.includes('### Non-Matrix Boundary Checks'), 'tool maturity matrix exposes non-matrix boundary checks');
  assert.ok(markdown.indexOf('## Top Upgrade Targets') < markdown.indexOf('## Source Trace'), 'tool maturity matrix top upgrade section precedes source trace');
  assert.ok(markdown.includes('## Source Trace'), 'tool maturity matrix markdown exposes source trace section');
  assert.ok(markdown.includes('sourceManifests:'), 'tool maturity matrix markdown exposes source manifests');
  const preserveHomepageStatus = Boolean(options.preserveHomepageStatus);
  const homepagePlatformStatus = assertHomepageStatusSnapshot(homepagePlatformStatusPath, 'platform-status', 'output/audit/platform-status.json', platformStatusSourcePath, { skipCurrentSourceHash: preserveHomepageStatus });
  const homepagePreflightStatus = assertHomepageStatusSnapshot(homepagePreflightStatusPath, 'preflight-summary', /^output\/preflight\/(?:history\/[^/]+\/)?preflight-summary\.json$/, null);
  const homepageReportReadinessStatus = assertHomepageStatusSnapshot(homepageReportReadinessStatusPath, 'report-readiness-status', 'output/audit/tool-maturity-matrix.json', jsonOutputPath, { skipCurrentSourceHash: preserveHomepageStatus });
  const latestFullHomepagePreflight = resolveHomepagePreflightSource();
  assert.ok(Array.isArray(homepagePlatformStatus.modules), 'homepage platform status modules array');
  assert.equal(typeof homepagePreflightStatus.quick, 'boolean', 'homepage preflight status quick boolean');
  assert.equal(Number.isInteger(homepagePreflightStatus.recordsCount), true, 'homepage preflight status recordsCount integer');
  assert.equal(Number.isInteger(homepagePreflightStatus.passedCount), true, 'homepage preflight status passedCount integer');
  assert.ok(Array.isArray(homepagePreflightStatus.failedKeys), 'homepage preflight status failedKeys array');
  assert.equal(homepageReportReadinessStatus.badge, '頁面專用', 'homepage report readiness badge');
  assert.equal(homepageReportReadinessStatus.label, '報告閱讀狀態總覽', 'homepage report readiness label');
  assert.equal(homepageReportReadinessStatus.pass, true, 'homepage report readiness status is passing');
  assert.equal(Number.isInteger(homepageReportReadinessStatus.pageOnlyBoundaryRequired), true, 'homepage report readiness required integer');
  assert.equal(Number.isInteger(homepageReportReadinessStatus.pageOnlyBoundaryComplete), true, 'homepage report readiness complete integer');
  assert.equal(Number.isInteger(homepageReportReadinessStatus.pageOnlyBoundaryIssueCount), true, 'homepage report readiness issue integer');
  assert.equal(homepageReportReadinessStatus.pageOnlyBoundaryComplete, homepageReportReadinessStatus.pageOnlyBoundaryRequired, 'homepage report readiness coverage complete');
  assert.equal(homepageReportReadinessStatus.pageOnlyBoundaryIssueCount, 0, 'homepage report readiness issues empty');
  assert.equal(Number.isInteger(homepageReportReadinessStatus.reportTextSmokeRequired), true, 'homepage report readiness report text required integer');
  assert.equal(Number.isInteger(homepageReportReadinessStatus.reportTextSmokeComplete), true, 'homepage report readiness report text complete integer');
  assert.equal(Number.isInteger(homepageReportReadinessStatus.reportTextSmokeIssueCount), true, 'homepage report readiness report text issue integer');
  assert.equal(homepageReportReadinessStatus.reportTextSmokeComplete, homepageReportReadinessStatus.reportTextSmokeRequired, 'homepage report readiness report text coverage complete');
  assert.equal(homepageReportReadinessStatus.reportTextSmokeIssueCount, 0, 'homepage report readiness report text issues empty');
  assert.equal(Number.isInteger(homepageReportReadinessStatus.reportTextSmokeEvidenceRequired), true, 'homepage report readiness report text evidence required integer');
  assert.equal(Number.isInteger(homepageReportReadinessStatus.reportTextSmokeEvidenceComplete), true, 'homepage report readiness report text evidence complete integer');
  assert.equal(Number.isInteger(homepageReportReadinessStatus.reportTextSmokeEvidenceIssueCount), true, 'homepage report readiness report text evidence issue integer');
  assert.equal(homepageReportReadinessStatus.reportTextSmokeEvidenceComplete, homepageReportReadinessStatus.reportTextSmokeEvidenceRequired, 'homepage report readiness report text evidence complete');
  assert.equal(homepageReportReadinessStatus.reportTextSmokeEvidenceIssueCount, 0, 'homepage report readiness report text evidence issues empty');
  assert.equal(homepageReportReadinessStatus.reportTextSmokeEvidenceRunId, homepagePreflightStatus.runId, 'homepage report readiness report text evidence runId matches preflight');
  assert.deepEqual(homepageReportReadinessStatus.reportTextSmokeEvidenceUnmappedFamilies, [], 'homepage report readiness report text evidence maps every family');
  assert.ok(String(homepageReportReadinessStatus.reportTextSmokeScope || '').includes('風力 / 地震正式工具'), 'homepage report readiness report text scope includes formal tools');
  assert.ok(String(homepageReportReadinessStatus.reportTextSmokeScope || '').includes('局部快算'), 'homepage report readiness report text scope includes local quick tools');
  assert.ok(String(homepageReportReadinessStatus.reportTextSmokeScope || '').includes('矩陣外工具家族'), 'homepage report readiness report text scope keeps other-family boundary');
  assert.ok(String(homepageReportReadinessStatus.compactSummary || '').includes('優先建議報告閱讀狀態'), 'homepage report readiness compact summary keeps page-only wording');
  assert.ok(String(homepageReportReadinessStatus.compactSummary || '').includes('不會寫入計算書、列印或 PDF'), 'homepage report readiness compact summary keeps export boundary');
  assert.equal(Array.isArray(homepageReportReadinessStatus.reportTextSmokeEvidenceGates), true, 'homepage report readiness report text evidence gates array');
  assert.deepEqual(homepageReportReadinessStatus.reportTextSmokeEvidenceGates.map(gate => gate.key).sort(), REPORT_TEXT_SMOKE_EVIDENCE_GATES.map(gate => gate.key).sort(), 'homepage report readiness report text evidence gates match expected');
  for (const gate of homepageReportReadinessStatus.reportTextSmokeEvidenceGates) {
    assert.equal(gate.pass, true, `homepage report readiness report text evidence gate pass: ${gate.key}`);
    assert.equal(gate.complete, gate.required, `homepage report readiness report text evidence gate coverage: ${gate.key}`);
  }
  assert.equal(Number.isInteger(homepageReportReadinessStatus.renderedDeliveryEvidenceRequired), true, 'homepage report readiness rendered delivery required integer');
  assert.equal(Number.isInteger(homepageReportReadinessStatus.renderedDeliveryEvidenceComplete), true, 'homepage report readiness rendered delivery complete integer');
  assert.equal(Number.isInteger(homepageReportReadinessStatus.renderedDeliveryEvidenceIssueCount), true, 'homepage report readiness rendered delivery issue integer');
  assert.equal(homepageReportReadinessStatus.renderedDeliveryEvidenceRequired, 31, 'homepage report readiness rendered delivery covers every formal homepage tool');
  assert.equal(homepageReportReadinessStatus.renderedDeliveryEvidenceComplete, homepageReportReadinessStatus.renderedDeliveryEvidenceRequired, 'homepage report readiness rendered delivery evidence complete');
  assert.equal(homepageReportReadinessStatus.renderedDeliveryEvidenceIssueCount, 0, 'homepage report readiness rendered delivery evidence issues empty');
  assert.match(homepageReportReadinessStatus.renderedDeliveryEvidenceRunId, /^\d{8}-\d{6}$/, 'homepage report readiness rendered delivery runId');
  assert.equal(Array.isArray(homepageReportReadinessStatus.renderedDeliveryEvidenceFamilies), true, 'homepage report readiness rendered delivery families array');
  assert.equal(homepageReportReadinessStatus.renderedDeliveryEvidenceFamilies.reduce((sum, family) => sum + family.complete, 0), homepageReportReadinessStatus.renderedDeliveryEvidenceComplete, 'homepage report readiness rendered delivery family totals match');
  assert.equal(homepageReportReadinessStatus.renderedDeliveryEvidenceSourcePath, `output/preflight/history/${homepageReportReadinessStatus.renderedDeliveryEvidenceRunId}/rendered-delivery-evidence/${renderedDeliveryEvidenceSummaryName}`, 'homepage report readiness rendered delivery source path');
  assert.match(homepageReportReadinessStatus.renderedDeliveryEvidenceSourceHash, /^[0-9a-f]{64}$/i, 'homepage report readiness rendered delivery source hash');
  assert.ok(String(homepageReportReadinessStatus.renderedDeliveryEvidenceSummary || '').includes('實際交付物渲染'), 'homepage report readiness rendered delivery summary');
  if (Number.isInteger(homepageReportReadinessStatus.supplementalDeliveryEvidenceRequired)) {
    assert.equal(homepageReportReadinessStatus.supplementalDeliveryEvidenceRequired, 1, 'homepage report readiness supplemental delivery covers the excavation service');
    assert.equal(homepageReportReadinessStatus.supplementalDeliveryEvidenceComplete, homepageReportReadinessStatus.supplementalDeliveryEvidenceRequired, 'homepage report readiness supplemental delivery evidence complete');
    assert.equal(homepageReportReadinessStatus.supplementalDeliveryEvidenceIssueCount, 0, 'homepage report readiness supplemental delivery issues empty');
    assert.equal(Array.isArray(homepageReportReadinessStatus.supplementalDeliveryEvidenceFamilies), true, 'homepage report readiness supplemental delivery families array');
    assert.deepEqual(homepageReportReadinessStatus.supplementalDeliveryEvidenceFamilies, [{ family: 'excavation-formal', complete: 1 }], 'homepage report readiness supplemental delivery family coverage');
    assert.ok(String(homepageReportReadinessStatus.supplementalDeliveryEvidenceSummary || '').includes('本機服務實際交付物渲染'), 'homepage report readiness supplemental delivery summary');
    assert.ok(String(homepageReportReadinessStatus.renderedDeliveryEvidenceSummary || '').includes('本機服務成品'), 'homepage report readiness rendered delivery summary includes supplemental service evidence');
  }
  assert.equal(homepageReportReadinessStatus.runId, homepagePreflightStatus.runId, 'homepage report readiness runId matches preflight status runId');
  assert.equal(homepageReportReadinessStatus.preflightStatusSourcePath, homepagePreflightStatus.sourcePath, 'homepage report readiness names preflight status source');
  assert.ok(String(homepageReportReadinessStatus.summary || '').includes('優先建議報告閱讀狀態'), 'homepage report readiness summary keeps boundary wording');
  assert.ok(String(homepageReportReadinessStatus.summary || '').includes('頁面專用閱讀狀態治理'), 'homepage report readiness summary includes governance count');
  assert.ok(Array.isArray(homepageReportReadinessStatus.details) && homepageReportReadinessStatus.details.length >= 3, 'homepage report readiness details array');
  assert.ok((homepageReportReadinessStatus.details || []).join(' ').includes('正式計算書可讀文字抽檢'), 'homepage report readiness details include report text coverage');
  assert.ok((homepageReportReadinessStatus.details || []).join(' ').includes('正式放行實際交付物渲染佐證'), 'homepage report readiness details include actual rendered delivery coverage');
  assert.ok((homepageReportReadinessStatus.details || []).join(' ').includes('Kzt 地形係數'), 'homepage report readiness details include wind kzt');
  assert.ok((homepageReportReadinessStatus.details || []).join(' ').includes('特殊修正 / 折減'), 'homepage report readiness details include wind special');
  assert.ok((homepageReportReadinessStatus.details || []).join(' ').includes('鋼梁舊案延續頁'), 'homepage report readiness details include steel beam transition page');
  assert.ok((homepageReportReadinessStatus.details || []).join(' ').includes('鋼柱舊案延續頁'), 'homepage report readiness details include steel column transition page');
  assert.ok((homepageReportReadinessStatus.details || []).join(' ').includes('JSON/計算書/文字 邊界'), 'homepage report readiness details include local quick text boundary chip');
  assert.equal((homepageReportReadinessStatus.details || []).join(' ').includes('JSON/計算書 邊界'), false, 'homepage report readiness details reject stale local quick boundary chip');
  assert.ok(Array.isArray(homepageReportReadinessStatus.pageOnlyRoutes) && homepageReportReadinessStatus.pageOnlyRoutes.length >= 4, 'homepage report readiness routes array');
  if (latestFullHomepagePreflight?.payload?.quick === false) {
    assert.equal(homepagePreflightStatus.quick, false, 'homepage preflight status should prefer latest full run when history contains one');
    assert.equal(homepagePreflightStatus.runId, String(latestFullHomepagePreflight.payload.runId || ''), 'homepage preflight status runId matches latest full history run');
    assert.equal(homepagePreflightStatus.sourcePath, latestFullHomepagePreflight.sourcePath, 'homepage preflight status sourcePath matches latest full history summary');
  }
  assert.ok(payload.sourceTrace && typeof payload.sourceTrace === 'object', 'tool maturity matrix sourceTrace object');
  assert.ok(Array.isArray(payload.sourceTrace.inputs), 'tool maturity matrix sourceTrace inputs array');
  const requiredSourceKeys = ['formal-tools-manifest', 'formal-traceability-catalog', 'rc-traceability-catalog', 'steel-traceability-catalog', 'anchor-traceability-catalog', 'stone-traceability-catalog', 'decking-traceability-catalog', 'excavation-traceability-catalog', 'local-quick-tools-manifest', 'vercel-routes', 'home-entrypoints'];
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
    assert.equal(typeof payload.latestPreflight.forcePlatformAudit, 'boolean', 'tool maturity matrix latest preflight forcePlatformAudit boolean');
    assert.equal(typeof payload.latestPreflight.forceSlowChecks, 'boolean', 'tool maturity matrix latest preflight forceSlowChecks boolean');
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
    if (row.checks.reportModes === true) {
      assert.equal(row.checks.reportTextSmoke, true, `${row.key} report text smoke`);
      assert.equal(row.coverage.reportTextSmoke, true, `${row.key} report text smoke coverage`);
    }
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
const preserveHomepageStatus = hasArg('--preserve-homepage-status');
if (hasArg('--write')) {
  writeMatrix(matrix, { preserveHomepageStatus });
}
if (hasArg('--check')) {
  checkMatrix(matrix.payload, matrix.markdown, { preserveHomepageStatus });
}

console.log(`tool maturity matrix OK (${matrix.payload.rows.length} tools, governed=${matrix.payload.totals.governed}, maturing=${matrix.payload.totals.maturing})`);
if (hasArg('--write')) {
  console.log(`wrote ${displayPath(jsonOutputPath)}`);
  console.log(`wrote ${displayPath(markdownOutputPath)}`);
  if (preserveHomepageStatus) {
    console.log('preserved homepage status snapshots');
  }
}
