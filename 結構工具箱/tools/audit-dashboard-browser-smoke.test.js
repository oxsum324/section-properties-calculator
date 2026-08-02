const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');
const liveOutputMode = process.argv.includes('--live-output');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const viewports = [
  { key: 'desktop', width: 1365, height: 900, mobile: false },
  { key: 'mobile', width: 390, height: 844, mobile: true },
];

const fixtureGeneratedAt = '2026-06-21T21:30:00+08:00';
const fixtureRoot = 'C:/repo';
const expectedCoverageTotals = [
  { key: 'reportModes', label: '報告模式', value: '1 / 1' },
  { key: 'reportTextSmoke', label: '報告可讀文字抽檢', value: '1 / 1' },
  { key: 'jsonExport', label: 'JSON 匯出', value: '1 / 1' },
  { key: 'jsonImport', label: 'JSON 匯入', value: '1 / 1' },
  { key: 'diagramGeometry', label: '圖面幾何驗證', value: '1 / 1' },
  { key: 'coreRegression', label: '核心 / golden regression', value: '1 / 1' },
  { key: 'goldenCaseRegression', label: 'Golden case regression', value: '1 / 1' },
  { key: 'jsonRoundTrip', label: 'JSON round-trip', value: '1 / 1' },
  { key: 'referenceTraceability', label: '工程依據追蹤', value: '1 / 1' },
];
const expectedTraceabilityCatalogs = [
  { family: 'formal-traceability', value: '1 / 1 tools；2 traces；2 manual-review items' },
  { family: 'rc-traceability', value: '2 / 2 tools；5 traces；5 manual-review items' },
  { family: 'steel-traceability', value: '2 / 2 tools；4 traces；4 manual-review items' },
  { family: 'anchor-traceability', value: '5 / 5 tools；12 traces；12 manual-review items' },
  { family: 'stone-traceability', value: '4 / 4 tools；8 traces；8 manual-review items' },
  { family: 'decking-traceability', value: '4 / 4 tools；8 traces；8 manual-review items' },
  { family: 'excavation-traceability', value: '5 / 5 tools；10 traces；10 manual-review items' },
];
const expectedGlobalGovernance = [
  { key: 'report-disclosure-contract', label: '跨家族報告揭露', value: '通過；runId fixture-full；7 catalogs；required formal-traceability, rc-traceability, steel-traceability, anchor-traceability, stone-traceability, decking-traceability, excavation-traceability；report-disclosure-contract' },
  { key: 'delivery-artifacts-contract', label: '交付物一致性', value: '通過；runId fixture-full；3 catalogs；required stone-traceability, decking-traceability, excavation-traceability；delivery-artifacts-contract' },
  { key: 'release-readiness-contract', label: '正式放行證據', value: '通過；runId fixture-full；0 catalogs；release-readiness-contract' },
  { key: 'rendered-delivery-evidence', label: '實際交付物渲染佐證', value: '通過；runId fixture-full；0 catalogs；rendered-delivery-evidence' },
];
const fixtureAttachmentCounts = [
  ['/rc-beam', 'RC 梁', 'rc-formal', 4],
  ['/rc-column', 'RC 柱', 'rc-formal', 6],
  ['/rc-slab', 'RC 板', 'rc-formal', 5],
  ['/rc-wall', 'RC 牆', 'rc-formal', 4],
  ['/rc-shear-wall', 'RC 剪力牆', 'rc-formal', 2],
  ['/rc-foundation', 'RC 基礎', 'rc-formal', 6],
  ['/rc-pile', '單樁承載力設計器', 'rc-formal', 3],
  ['/rc-retrofit-section', 'RC 補強斷面', 'rc-retrofit', 2],
];
const fixtureAttachmentGroups = fixtureAttachmentCounts.map(([href, title, family, expected], groupIndex) => ({
  href,
  title,
  family,
  expected,
  actual: expected,
  verified: expected,
  issueCount: 0,
  pass: true,
  setSha256: `${groupIndex + 1}`.repeat(64).slice(0, 64),
  artifacts: Array.from({ length: expected }, (_, artifactIndex) => ({
    ordinal: artifactIndex + 1,
    bytes: 1000 + groupIndex * 100 + artifactIndex,
    sha256: `${(groupIndex + artifactIndex + 1) % 10}`.repeat(64),
  })),
}));
const fixtureAttachmentStatus = {
  snapshotVersion: 1,
  kind: 'report-readiness-status',
  generatedAt: fixtureGeneratedAt,
  runId: 'fixture-full',
  pass: true,
  failureCount: 0,
  renderedDeliveryEvidenceRunId: 'fixture-release',
  attachmentIntegrityScope: 'rc-formal-html',
  attachmentIntegrityRequired: 32,
  attachmentIntegrityActual: 32,
  attachmentIntegrityVerified: 32,
  attachmentIntegrityIssueCount: 0,
  attachmentIntegrityPass: true,
  attachmentIntegritySetSha256: 'a'.repeat(64),
  attachmentIntegrityGroups: fixtureAttachmentGroups,
};
const fixtureAttachmentFailureGroups = fixtureAttachmentGroups.map((group) => {
  const artifacts = group.artifacts.map(artifact => ({ ...artifact }));
  if (group.href !== '/rc-column') return { ...group, artifacts };
  return {
    ...group,
    actual: 5,
    verified: 4,
    issueCount: 2,
    pass: false,
    setSha256: 'f'.repeat(64),
    artifacts: [
      ...artifacts.slice(0, 5).map((artifact, index) => (
        index === 4 ? { ...artifact, code: 'sha256-mismatch' } : artifact
      )),
      { ordinal: 6, bytes: 0, sha256: '', code: 'missing-file' },
    ],
  };
});
const fixtureAttachmentFailureDiagnostic = {
  ...fixtureAttachmentStatus,
  kind: 'attachment-integrity-diagnostic',
  runId: 'fixture-tampered-release',
  pass: false,
  failureCount: 2,
  renderedDeliveryEvidenceRunId: 'fixture-tampered-release',
  attachmentIntegrityActual: 31,
  attachmentIntegrityVerified: 30,
  attachmentIntegrityIssueCount: 2,
  attachmentIntegrityPass: false,
  attachmentIntegritySetSha256: 'b'.repeat(64),
  attachmentIntegrityGroups: fixtureAttachmentFailureGroups,
};
const fixtureAttachmentDiagnostic = {
  ...fixtureAttachmentStatus,
  kind: 'attachment-integrity-diagnostic',
  attachmentIntegrityDiagnostic: true,
};

function fixtureOutputPath(relativePath) {
  return fixtureRoot + '/output/' + relativePath;
}

const preflightRecords = [
  {
    key: 'platform-audit',
    label: 'Platform audit (steel, RC, core)',
    pass: true,
    exitCode: 0,
    seconds: 1.6,
    mode: 'reuse-status',
    reused: true,
    statusCheckedAt: '2026-06-21T19:15:00+08:00',
    statusAgeHours: 2.25,
    statusMaxAgeHours: 24,
    workdir: fixtureRoot,
    workdirRelative: '.',
    command: "& './platform-audit-preflight.ps1' -Quiet",
    commandHash: '1111111111111111111111111111111111111111111111111111111111111111',
    script: fixtureOutputPath('preflight/history/fixture-full/platform-audit.ps1'),
    log: fixtureOutputPath('preflight/platform-audit.txt'),
    historyLog: fixtureOutputPath('preflight/history/fixture-full/platform-audit.txt'),
  },
  {
    key: 'dashboard-fixture-failure',
    label: 'Dashboard fixture failure',
    pass: false,
    exitCode: 9,
    seconds: 0.4,
    mode: 'run-command',
    reused: false,
    workdir: fixtureRoot + '/fixtures/dashboard',
    workdirRelative: 'fixtures/dashboard',
    command: "node fixture-failure.js",
    commandHash: '2222222222222222222222222222222222222222222222222222222222222222',
    script: fixtureOutputPath('preflight/history/fixture-full/dashboard-fixture-failure.ps1'),
    log: fixtureOutputPath('preflight/dashboard-fixture-failure.txt'),
    historyLog: fixtureOutputPath('preflight/history/fixture-full/dashboard-fixture-failure.txt'),
  },
];

function statusFixture(runId, modules = [], extras = {}) {
  return {
    generatedAt: fixtureGeneratedAt,
    runId,
    pass: true,
    failureCount: 0,
    failures: [],
    loop: false,
    modules,
    ...extras,
  };
}

function preflightHistoryItem(overrides = {}) {
  return {
    runId: 'fixture-full',
    generatedAt: fixtureGeneratedAt,
    quick: false,
    pass: false,
    state: 'completed',
    complete: true,
    inProgress: false,
    incomplete: false,
    incompleteReason: '',
    logFiles: [],
    failureCount: 1,
    failures: ['dashboard-fixture-failure'],
    recordsCount: preflightRecords.length,
    passedCount: 1,
    totalSeconds: 2.0,
    forcePlatformAudit: false,
    forceSlowChecks: false,
    sourceCommitSha: '1234567890abcdef1234567890abcdef12345678',
    sourceBranch: 'fixture-main',
    sourceDirty: true,
    platformAuditMode: 'reuse-status',
    platformAuditReused: true,
    slowReuseCount: 1,
    slowReuseKeys: ['formal-browser-smoke'],
    slowestKey: 'platform-audit',
    slowestSeconds: 1.6,
    slowestRecords: [{ key: 'platform-audit', label: 'Platform audit (steel, RC, core)', seconds: 1.6, pass: true }],
    failedKeys: ['dashboard-fixture-failure'],
    summaryPath: fixtureOutputPath('preflight/history/fixture-full/preflight-summary.md'),
    summaryJsonPath: fixtureOutputPath('preflight/history/fixture-full/preflight-summary.json'),
    sourcePath: 'output/preflight/preflight-summary.json',
    sourceMtime: fixtureGeneratedAt,
    sourceHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    summaryHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    summaryJsonHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    summaryMtime: fixtureGeneratedAt,
    summaryJsonMtime: fixtureGeneratedAt,
    postCheckCount: 2,
    postChecksPassedCount: 2,
    postCheckFailures: [],
    postChecks: [{
      key: 'audit-dashboard-contract-final',
      label: 'Audit dashboard final output contract',
      pass: true,
      exitCode: 0,
      seconds: 0.3,
      mode: 'run-command',
      reused: false,
      workdir: fixtureRoot,
      workdirRelative: '.',
      commandHash: '3333333333333333333333333333333333333333333333333333333333333333',
      log: fixtureOutputPath('preflight/audit-dashboard-contract-final.txt'),
      historyLog: fixtureOutputPath('preflight/history/fixture-full/audit-dashboard-contract-final.txt'),
    },
    {
      key: 'audit-dashboard-browser-smoke-final',
      label: 'Audit dashboard final browser smoke',
      pass: true,
      exitCode: 0,
      seconds: 2.5,
      mode: 'run-command',
      reused: false,
      workdir: fixtureRoot,
      workdirRelative: '.',
      commandHash: '4444444444444444444444444444444444444444444444444444444444444444',
      log: fixtureOutputPath('preflight/audit-dashboard-browser-smoke-final.txt'),
      historyLog: fixtureOutputPath('preflight/history/fixture-full/audit-dashboard-browser-smoke-final.txt'),
    }],
    ...overrides,
  };
}

const fixtures = new Map(Object.entries({
  '結構工具箱/assets/status/report-readiness-status.json': fixtureAttachmentStatus,
  'output/preflight/attachment-integrity-latest.json': fixtureAttachmentDiagnostic,
  'output/audit/platform-status.json': statusFixture('platform-fixture', ['steel', 'rc', 'core'], {
    lastSummaryHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    lastSummaryJsonHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  }),
  'output/audit/platform-summary.md': '# Fixture Platform Summary\n\npass=true',
  'output/audit/platform-history.json': {
    count: 1,
    items: [{
      runId: 'platform-fixture',
      generatedAt: fixtureGeneratedAt,
      pass: true,
      failureCount: 0,
      failures: [],
      records: [{ key: 'steel', pass: true }, { key: 'rc', pass: true }, { key: 'core', pass: true }],
      summaryPath: fixtureOutputPath('audit/history/platform-fixture/platform-summary.md'),
      summaryJsonPath: fixtureOutputPath('audit/history/platform-fixture/platform-summary.json'),
      summaryHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      summaryJsonHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    }],
  },
  'output/preflight/post-checks.json': preflightHistoryItem().postChecks,
  'output/audit/tool-maturity-matrix.json': {
    generatedAt: fixtureGeneratedAt,
    latestPreflight: preflightHistoryItem(),
    preflightHistoryHealth: {
      count: 2,
      completedCount: 2,
      inProgressCount: 0,
      incompleteCount: 0,
      latestRunId: 'fixture-full',
      latestState: 'completed',
      latestCompletedRunId: 'fixture-full',
      latestCompletedFullRunId: 'fixture-full',
    },
    totals: {
      tools: 1,
      governed: 1,
      maturing: 0,
      needsAttention: 0,
      toolsWithUpgradeGaps: 0,
      upgradeGapCount: 0,
      goldenCases: 2,
      toolsWithMultipleGoldenCases: 1,
      reportModes: 1,
      reportTextSmoke: 1,
      jsonExport: 1,
      jsonImport: 1,
      diagramGeometry: 1,
      coreRegression: 1,
      goldenCaseRegression: 1,
      jsonRoundTrip: 1,
      referenceTraceability: 1,
    },
    topUpgradeTargets: [],
    traceabilityCatalogCoverage: [
      {
        family: 'formal-traceability',
        version: '0.1.0',
        tools: 1,
        covered: 1,
        traceCount: 2,
        manualReviewCount: 2,
        uncoveredKeys: [],
        toolKeys: ['fixture-tool'],
        rows: [{ key: 'fixture-tool', label: 'Fixture tool', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true }],
      },
      {
        family: 'rc-traceability',
        version: '0.1.0',
        tools: 2,
        covered: 2,
        traceCount: 5,
        manualReviewCount: 5,
        uncoveredKeys: [],
        toolKeys: ['beam', 'column'],
        rows: [
          { key: 'beam', label: '梁', status: 'covered', traceCount: 3, manualReviewCount: 3, covered: true },
          { key: 'column', label: '柱', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
        ],
      },
      {
        family: 'steel-traceability',
        version: '0.1.0',
        tools: 2,
        covered: 2,
        traceCount: 4,
        manualReviewCount: 4,
        uncoveredKeys: [],
        toolKeys: ['steel-main', 'steel-beam-formal'],
        rows: [
          { key: 'steel-main', label: '鋼構正式規範主工具', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'steel-beam-formal', label: '鋼梁正式頁', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
        ],
      },
      {
        family: 'anchor-traceability',
        version: '0.1.0',
        tools: 5,
        covered: 5,
        traceCount: 12,
        manualReviewCount: 12,
        uncoveredKeys: [],
        toolKeys: ['anchor-strength', 'anchor-product-evaluation', 'anchor-seismic', 'base-plate-bearing', 'anchor-reinforcement'],
        rows: [
          { key: 'anchor-strength', label: '錨栓第17章主強度檢核', status: 'covered', traceCount: 3, manualReviewCount: 3, covered: true },
          { key: 'anchor-product-evaluation', label: '後置錨栓產品評估與證據鏈', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'anchor-seismic', label: '錨栓第17.10耐震路徑', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'base-plate-bearing', label: '基板承壓與抗彎延伸檢核', status: 'covered', traceCount: 3, manualReviewCount: 3, covered: true },
          { key: 'anchor-reinforcement', label: '錨栓補強鋼筋替代 breakout 路徑', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
        ],
      },
      {
        family: 'stone-traceability',
        version: '0.1.0',
        tools: 4,
        covered: 4,
        traceCount: 8,
        manualReviewCount: 8,
        uncoveredKeys: [],
        toolKeys: ['stone-load-demand', 'stone-anchor-connection', 'stone-panel-local', 'stone-serviceability-report'],
        rows: [
          { key: 'stone-load-demand', label: '石材外牆風力與耐震需求', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'stone-anchor-connection', label: '石材固定錨栓與連接件', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'stone-panel-local', label: '石材板塊、孔位與材料邊界', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'stone-serviceability-report', label: '石材使用性、匯出與稽核報告', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
        ],
      },
      {
        family: 'decking-traceability',
        version: '0.1.0',
        tools: 4,
        covered: 4,
        traceCount: 8,
        manualReviewCount: 8,
        uncoveredKeys: [],
        toolKeys: ['decking-load-member-strength', 'decking-column-load-path', 'decking-foundation-support', 'decking-report-governance'],
        rows: [
          { key: 'decking-load-member-strength', label: '覆工板面、小梁與大梁強度使用性檢核', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'decking-column-load-path', label: '大梁柱頂 Pu 與共構柱互制檢核', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'decking-foundation-support', label: 'H 型鋼握裹與樁基承載', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'decking-report-governance', label: '覆工板 JSON、Word 報表與交付邊界', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
        ],
      },
      {
        family: 'excavation-traceability',
        version: '0.1.0',
        tools: 5,
        covered: 5,
        traceCount: 10,
        manualReviewCount: 10,
        uncoveredKeys: [],
        toolKeys: ['excavation-analysis-import', 'excavation-member-strength', 'excavation-column-foundation', 'excavation-report-governance', 'excavation-service-data-governance'],
        rows: [
          { key: 'excavation-analysis-import', label: '分析輸出匯入與上下側工作流', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'excavation-member-strength', label: '支撐、橫擋、斜撐與大角撐檢核', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'excavation-column-foundation', label: '柱構件與基礎承載檢核', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'excavation-report-governance', label: 'PDF / DOCX 計算書與下載邊界', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
          { key: 'excavation-service-data-governance', label: '本機服務、專案資料與參考資料治理', status: 'covered', traceCount: 2, manualReviewCount: 2, covered: true },
        ],
      },
    ],
    globalGovernance: {
      required: 4,
      passed: 4,
      issueCount: 0,
      gates: [
        {
          key: 'report-disclosure-contract',
          label: '跨家族報告揭露',
          contract: '結構工具箱/tools/report-disclosure.contract.test.js',
          scope: 'fixture traceability catalog report disclosure',
          pass: true,
          runId: 'fixture-full',
          quick: false,
          seconds: 0.5,
          exitCode: 0,
          coveredCatalogs: 7,
          requiredCatalogFamilies: [
            'formal-traceability',
            'rc-traceability',
            'steel-traceability',
            'anchor-traceability',
            'stone-traceability',
            'decking-traceability',
            'excavation-traceability',
          ],
          catalogFamilies: [
            'formal-traceability',
            'rc-traceability',
            'steel-traceability',
            'anchor-traceability',
            'stone-traceability',
            'decking-traceability',
            'excavation-traceability',
          ],
          missingCatalogFamilies: [],
          issues: [],
        },
        {
          key: 'delivery-artifacts-contract',
          label: '交付物一致性',
          contract: '結構工具箱/tools/delivery-artifacts.contract.test.js',
          scope: 'fixture delivery artifacts',
          pass: true,
          runId: 'fixture-full',
          quick: false,
          seconds: 0.4,
          exitCode: 0,
          coveredCatalogs: 3,
          requiredCatalogFamilies: [
            'stone-traceability',
            'decking-traceability',
            'excavation-traceability',
          ],
          catalogFamilies: [
            'stone-traceability',
            'decking-traceability',
            'excavation-traceability',
          ],
          missingCatalogFamilies: [],
          issues: [],
        },
        {
          key: 'release-readiness-contract',
          label: '正式放行證據',
          contract: '結構工具箱/tools/release-readiness.contract.test.js',
          scope: 'fixture release readiness',
          pass: true,
          runId: 'fixture-full',
          quick: false,
          seconds: 0.3,
          exitCode: 0,
          coveredCatalogs: 0,
          requiredCatalogFamilies: [],
          catalogFamilies: [],
          missingCatalogFamilies: [],
          issues: [],
        },
        {
          key: 'rendered-delivery-evidence',
          label: '實際交付物渲染佐證',
          contract: '結構工具箱/tools/rendered-delivery-evidence.contract.test.js',
          scope: 'fixture rendered delivery evidence',
          pass: true,
          runId: 'fixture-full',
          quick: false,
          seconds: 0.5,
          exitCode: 0,
          coveredCatalogs: 0,
          requiredCatalogFamilies: [],
          catalogFamilies: [],
          missingCatalogFamilies: [],
          issues: [],
        },
      ],
    },
    entrypointCoverage: {
      total: 3,
      matrixCovered: 1,
      otherGoverned: 1,
      formalOutsideCoverage: 0,
      nonFormalOutsideCoverage: 1,
      otherGovernanceRequired: 1,
      otherGovernanceComplete: 1,
      otherGovernanceIssueCount: 0,
      boundaryRequired: 1,
      boundaryComplete: 1,
      boundaryIssueCount: 0,
      pageOnlyBoundaryRequired: 1,
      pageOnlyBoundaryComplete: 1,
      pageOnlyBoundaryIssueCount: 0,
      cleanRouteCount: 3,
      byState: { formal: 2, assist: 1 },
      outsideByState: { formal: 1, assist: 1 },
      matrixRoutes: [{ route: '/fixture-tool', title: 'Fixture tool', state: 'formal', governance: '', cleanRoute: true }],
      outsideMatrixRoutes: [
        { route: '/fixture-rc', title: 'Fixture RC', state: 'formal', governance: 'rc-audit', cleanRoute: true },
        { route: '/fixture-assist', title: 'Fixture Assist', state: 'assist', governance: '', cleanRoute: true },
      ],
      formalOutsideCoverageRoutes: [],
      otherGovernanceRoutes: [{
        route: '/fixture-rc',
        title: 'Fixture RC',
        state: 'formal',
        governance: 'rc-audit',
        governanceLabel: 'RC audit',
        governanceCardTag: '報告邊界',
        preflightKeys: ['rc-audit-status'],
        passedKeys: ['rc-audit-status'],
        failedKeys: [],
        missingKeys: [],
        cleanRoute: true,
        pass: true,
        governanceIssues: [],
      }],
      otherGovernanceIssueRoutes: [],
      boundaryRoutes: [{
        route: '/fixture-assist',
        title: 'Fixture Assist',
        state: 'assist',
        stateLabel: '輔助判讀',
        boundaryRule: '只能作為附件或判讀輔助，不得替代正式計算書判定。',
        matchedLimitNeedles: ['不是完整正式工具'],
        sourcePath: '結構工具箱/tools/fixture-assist.html',
        reportSurface: true,
        pageOnlyReadinessRequired: true,
        pageOnlyReadinessPresent: true,
        pageOnlyReadinessHiddenInPrint: true,
        output: 'Fixture output',
        fit: 'Fixture fit',
        limit: '不是完整正式工具。',
        capabilities: ['分析輔助'],
        boundaryIssues: [],
      }],
      boundaryIssueRoutes: [],
    },
    sourceTrace: {
      inputs: [
        {
          key: 'formal-tools-manifest',
          sourcePath: '結構工具箱/tools/formal-tools.manifest.json',
          sourceMtime: fixtureGeneratedAt,
          sourceHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          exists: true,
        },
        {
          key: 'formal-traceability-catalog',
          sourcePath: '結構工具箱/tools/formal-traceability.catalog.json',
          sourceMtime: fixtureGeneratedAt,
          sourceHash: '234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1',
          exists: true,
        },
        {
          key: 'rc-traceability-catalog',
          sourcePath: '鋼筋混凝土/tools/rc-traceability.catalog.json',
          sourceMtime: fixtureGeneratedAt,
          sourceHash: '34567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
          exists: true,
        },
        {
          key: 'steel-traceability-catalog',
          sourcePath: '鋼構工具/steel-traceability.catalog.json',
          sourceMtime: fixtureGeneratedAt,
          sourceHash: '4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123',
          exists: true,
        },
        {
          key: 'anchor-traceability-catalog',
          sourcePath: '螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json',
          sourceMtime: fixtureGeneratedAt,
          sourceHash: '567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
          exists: true,
        },
        {
          key: 'stone-traceability-catalog',
          sourcePath: '石材固定/stone-traceability.catalog.json',
          sourceMtime: fixtureGeneratedAt,
          sourceHash: '6789012345678901234567890123456789012345678901234567890123456789',
          exists: true,
        },
        {
          key: 'decking-traceability-catalog',
          sourcePath: '覆工板/decking-traceability.catalog.json',
          sourceMtime: fixtureGeneratedAt,
          sourceHash: '7890123456789012345678901234567890123456789012345678901234567890',
          exists: true,
        },
        {
          key: 'excavation-traceability-catalog',
          sourcePath: '開挖擋土支撐/excavation-traceability.catalog.json',
          sourceMtime: fixtureGeneratedAt,
          sourceHash: '8901234567890123456789012345678901234567890123456789012345678901',
          exists: true,
        },
        {
          key: 'latest-preflight-summary',
          sourcePath: 'output/preflight/preflight-summary.json',
          sourceMtime: fixtureGeneratedAt,
          sourceHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          exists: true,
        },
      ],
    },
    rows: [{
      family: 'fixture-tools',
      key: 'fixture-tool',
      label: 'Fixture tool',
      route: '/fixture-tool',
      status: 'governed',
      score: { passed: 4, total: 4 },
      goldenCaseCount: 2,
      upgradePriority: 'none',
      upgradeGaps: [],
      sourceTrace: {
        sourceHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        inputs: [{ key: 'html', sourcePath: '結構工具箱/fixture-tool.html', sourceHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210', exists: true }],
      },
      checks: {
        cleanRoute: true,
        browserSmoke: true,
        reportTextSmoke: true,
        goldenCaseRegression: true,
      },
    }],
  },
  'output/preflight/preflight-summary.json': {
    generatedAt: fixtureGeneratedAt,
    root: fixtureRoot,
    runId: 'fixture-full',
    quick: false,
    forcePlatformAudit: false,
    forceSlowChecks: false,
    sourceCommitSha: '1234567890abcdef1234567890abcdef12345678',
    sourceBranch: 'fixture-main',
    sourceDirty: true,
    pass: false,
    failureCount: 1,
    failures: ['dashboard-fixture-failure'],
    failedKeys: ['dashboard-fixture-failure'],
    recordsCount: preflightRecords.length,
    passedCount: 1,
    slowReuseCount: 1,
    slowReuseKeys: ['formal-browser-smoke'],
    platformAuditMode: 'reuse-status',
    platformAuditReused: true,
    platformAuditDecisionPath: fixtureOutputPath('preflight/platform-audit-decision.json'),
    totalSeconds: 2.0,
    slowestKey: 'platform-audit',
    slowestSeconds: 1.6,
    slowestText: 'platform-audit 1.6s',
    slowestRecords: [{ key: 'platform-audit', label: 'Platform audit (steel, RC, core)', seconds: 1.6, pass: true }],
    records: preflightRecords,
  },
  'output/preflight/preflight-history.json': {
    count: 3,
    completedCount: 3,
    inProgressCount: 0,
    incompleteCount: 0,
    items: [
      preflightHistoryItem(),
      preflightHistoryItem({
        runId: 'fixture-release',
        pass: true,
        failureCount: 0,
        failures: [],
        failedKeys: [],
        passedCount: 2,
        forcePlatformAudit: true,
        forceSlowChecks: true,
        sourceDirty: false,
        platformAuditMode: 'run-audit-all',
        platformAuditReused: false,
        slowReuseCount: 0,
        slowReuseKeys: [],
      }),
      preflightHistoryItem({ runId: 'fixture-quick', quick: true, pass: true, failureCount: 0, failures: [], failedKeys: [], passedCount: 2 }),
    ],
  },
  '鋼構工具/output/audit/audit-status.json': statusFixture('steel-fixture', ['steel']),
  '鋼構工具/output/audit/audit-summary.md': '# Fixture Steel Summary\n\npass=true',
  '鋼筋混凝土/output/audit/audit-status.json': statusFixture('rc-fixture', ['beam', 'column']),
  '鋼筋混凝土/output/audit/audit-summary.md': '# Fixture RC Summary\n\npass=true',
  '結構工具箱/output/audit/audit-status.json': statusFixture('core-fixture', ['wind', 'seismic']),
  '結構工具箱/output/audit/audit-summary.md': '# Fixture Core Summary\n\npass=true',
}));
const requiredFixturePaths = new Set(fixtures.keys());

function createRequestAudit() {
  return {
    fixtureHits: new Map(),
    fileHits: new Set(),
    missing: [],
    unexpectedOutputRequests: [],
  };
}

function incrementFixtureHit(audit, relativePath) {
  if (!audit) return;
  audit.fixtureHits.set(relativePath, (audit.fixtureHits.get(relativePath) || 0) + 1);
}

function isOutputRequest(relativePath) {
  return relativePath === 'output' || relativePath.startsWith('output/') || relativePath.includes('/output/');
}

function assertRequestAudit(audit, options = {}) {
  const fixtureMode = options.fixtureMode !== false;
  assert.deepEqual(audit.missing, [], `missing dashboard fixture/static requests: ${audit.missing.join(', ')}`);
  assert.ok(audit.fileHits.has('結構工具箱/audit-dashboard.html'), 'dashboard HTML served from workspace');
  if (fixtureMode) {
    assert.deepEqual(audit.unexpectedOutputRequests, [], `unexpected non-fixture output requests: ${audit.unexpectedOutputRequests.join(', ')}`);
    const missingFixtures = Array.from(requiredFixturePaths).filter((fixturePath) => !audit.fixtureHits.has(fixturePath));
    assert.deepEqual(missingFixtures, [], `dashboard did not request required fixtures: ${missingFixtures.join(', ')}`);
    return;
  }
  const requiredLiveOutputPaths = [
    '結構工具箱/assets/status/report-readiness-status.json',
    'output/audit/platform-status.json',
    'output/audit/platform-summary.md',
    'output/audit/platform-history.json',
    'output/preflight/post-checks.json',
    'output/audit/tool-maturity-matrix.json',
    'output/preflight/preflight-summary.json',
    'output/preflight/preflight-history.json',
    '鋼構工具/output/audit/audit-status.json',
    '鋼構工具/output/audit/audit-summary.md',
    '鋼筋混凝土/output/audit/audit-status.json',
    '鋼筋混凝土/output/audit/audit-summary.md',
    '結構工具箱/output/audit/audit-status.json',
    '結構工具箱/output/audit/audit-summary.md',
  ];
  for (const livePath of requiredLiveOutputPaths) {
    assert.ok(audit.fileHits.has(livePath), `live dashboard requested ${livePath}`);
  }
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function readJsonFile(relativePath) {
  return JSON.parse(fs.readFileSync(repoFile(relativePath), 'utf8').replace(/^\uFEFF/, ''));
}

function readTextFile(relativePath) {
  return fs.readFileSync(repoFile(relativePath), 'utf8').replace(/^\uFEFF/, '');
}

function summarySnippet(text) {
  const line = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(item => item.trim()).find(Boolean) || '';
  return line.slice(0, 48);
}

function normalizePostChecksPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.postChecks)) return payload.postChecks;
  return [payload];
}

function loadLiveExpected() {
  return {
    summary: readJsonFile('output/preflight/preflight-summary.json'),
    history: readJsonFile('output/preflight/preflight-history.json'),
    matrix: readJsonFile('output/audit/tool-maturity-matrix.json'),
    postChecks: normalizePostChecksPayload(readJsonFile('output/preflight/post-checks.json')),
    platformStatus: readJsonFile('output/audit/platform-status.json'),
    reportReadinessStatus: readJsonFile('結構工具箱/assets/status/report-readiness-status.json'),
    componentStatuses: [
      { key: 'steel', title: '鋼構正式規範工具', status: readJsonFile('鋼構工具/output/audit/audit-status.json') },
      { key: 'rc', title: 'RC 構件工具', status: readJsonFile('鋼筋混凝土/output/audit/audit-status.json') },
      { key: 'core', title: '耐風 / 耐震核心', status: readJsonFile('結構工具箱/output/audit/audit-status.json') },
    ],
    summaries: {
      platform: readTextFile('output/audit/platform-summary.md'),
      steel: readTextFile('鋼構工具/output/audit/audit-summary.md'),
      rc: readTextFile('鋼筋混凝土/output/audit/audit-summary.md'),
      core: readTextFile('結構工具箱/output/audit/audit-summary.md'),
    },
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function contentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.md': return 'text/markdown; charset=utf-8';
    case '.txt': return 'text/plain; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.ico': return 'image/x-icon';
    default: return 'application/octet-stream';
  }
}

function normalizeRequestPath(requestPathname) {
  return decodeURIComponent(requestPathname).replace(/^\/+/, '').replace(/\\/g, '/');
}

function startStaticServer(port, audit, options = {}) {
  const fixtureMode = options.fixtureMode !== false;
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const relativePath = normalizeRequestPath(requestUrl.pathname) || '結構工具箱/audit-dashboard.html';

    if (fixtureMode && fixtures.has(relativePath)) {
      incrementFixtureHit(audit, relativePath);
      const value = fixtures.get(relativePath);
      const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      res.writeHead(200, { 'Content-Type': contentType(relativePath) });
      res.end(body);
      return;
    }

    if (relativePath === 'favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (fixtureMode && isOutputRequest(relativePath)) {
      if (audit) audit.unexpectedOutputRequests.push(relativePath);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Unexpected output request outside fixture map: ${relativePath}`);
      return;
    }

    const fullPath = path.resolve(repoRoot, relativePath);
    const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;
    if (fullPath !== repoRoot && !fullPath.startsWith(rootWithSep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.readFile(fullPath, (err, data) => {
      if (err) {
        if (audit) audit.missing.push(relativePath);
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      if (audit) audit.fileHits.add(relativePath);
      res.writeHead(200, { 'Content-Type': contentType(fullPath) });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function removeDirectoryBestEffort(directoryPath) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      return;
    } catch (err) {
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(err.code)) throw err;
      await delay(250 * (attempt + 1));
    }
  }
  console.warn(`Warning: could not remove temporary Edge profile: ${directoryPath}`);
}

async function waitForJson(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await delay(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function truncateDiagnosticText(value, maxLength = 2000) {
  const text = String(value || '').trim();
  return text.length > maxLength ? text.slice(-maxLength) : text;
}

async function waitForProcessExit(child, timeoutMs = 2000) {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function isTransientEdgeLaunchError(error) {
  if (!error) return false;
  if (['EPERM', 'EACCES', 'EBUSY', 'ECONNREFUSED'].includes(error.code)) return true;
  return /spawn EPERM|WinError 5|access is denied|Permission denied|Timed out waiting|fetch failed|Edge exited before CDP/i.test(error.message || '');
}

async function waitForEdgeStartup(child, versionUrl, timeoutMs = 20000) {
  let exitCode = null;
  const onExit = code => { exitCode = code; };
  child.once('exit', onExit);
  try {
    return await Promise.race([
      waitForJson(versionUrl, timeoutMs),
      new Promise((_, reject) => child.once('error', reject)),
    ]);
  } catch (error) {
    if (exitCode !== null && /Timed out waiting|fetch failed|HTTP \d+/i.test(error.message || '')) {
      throw new Error(`Edge exited before CDP was ready. exitCode=${exitCode}`);
    }
    throw error;
  } finally {
    child.off('exit', onExit);
  }
}

async function launchEdgeForCdp(edgePath, debugPort, userDataRoot) {
  const retryDelaysMs = [0, 5000, 15000, 30000, 60000];
  let lastError;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    const attemptNumber = attempt + 1;
    const attemptUserDataDir = userDataRoot;
    let stderr = '';
    let edge;
    try {
      edge = spawn(edgePath, [
        '--headless=new',
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${attemptUserDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-gpu',
        'about:blank',
      ], { stdio: 'ignore', windowsHide: true });
      const startup = waitForEdgeStartup(edge, `http://127.0.0.1:${debugPort}/json/version`, 20000);
      edge.stderr?.on('data', chunk => {
        stderr = truncateDiagnosticText(stderr + chunk.toString('utf8'));
      });
      const version = await startup;
      return { edge, version };
    } catch (err) {
      const exitDetail = edge ? (edge.exitCode === null ? 'running' : `exitCode=${edge.exitCode}`) : 'spawn-failed';
      lastError = new Error(`Edge CDP startup attempt ${attemptNumber}/${retryDelaysMs.length} failed (${exitDetail}, stderr=${truncateDiagnosticText(stderr) || 'none'}): ${err.message || err}`);
      if (edge && edge.exitCode === null) {
        edge.kill();
        await waitForProcessExit(edge, 5000);
      }
      const canRetry = attempt < retryDelaysMs.length - 1 && isTransientEdgeLaunchError(err);
      if (!canRetry) throw lastError;
      await delay(retryDelaysMs[attempt + 1]);
    }
  }
  throw lastError || new Error('Edge CDP startup failed');
}
function createCdpClient(webSocketUrl) {
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  const ws = new WebSocket(webSocketUrl);

  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message || 'CDP error'} ${message.error.data || ''}`.trim()));
      else resolve(message.result || {});
      return;
    }
    for (const listener of listeners) listener(message);
  });

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  return {
    async open() { await opened; },
    send(method, params = {}, sessionId) {
      const id = nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() { ws.close(); },
  };
}

function waitForEvent(client, sessionId, method, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    unsubscribe = client.on(message => {
      if (message.sessionId === sessionId && message.method === method) {
        clearTimeout(timer);
        unsubscribe();
        resolve(message.params || {});
      }
    });
  });
}

function collectPageErrors(client, sessionId) {
  const errors = [];
  const unsubscribe = client.on(message => {
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails || {};
      errors.push([detail.text || 'Runtime exception', detail.url || ''].filter(Boolean).join(' @ '));
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const args = message.params.args || [];
      errors.push(args.map(arg => arg.value || arg.description || arg.type).join(' '));
    }
    if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
      const entry = message.params.entry || {};
      if ((entry.url || '').endsWith('/favicon.ico')) return;
      errors.push([entry.text || 'Log error', entry.url || ''].filter(Boolean).join(' @ '));
    }
    if (message.method === 'Page.javascriptDialogOpening') {
      errors.push(`JavaScript dialog opened: ${message.params.message || ''}`.trim());
      client.send('Page.handleJavaScriptDialog', { accept: true }, sessionId).catch(() => {});
    }
  });
  return { errors, unsubscribe };
}

async function evaluate(client, sessionId, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluate failed');
  }
  return result.result.value;
}

async function waitForDashboardState(client, sessionId, expectedLive = null, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastState;
  while (Date.now() - startedAt < timeoutMs) {
    lastState = await evaluate(client, sessionId, `(() => {
      const rows = Array.from(document.querySelectorAll('#preflightLatestRecordsWrap tbody tr'));
      const latestLinks = Array.from(document.querySelectorAll('#preflightLatestRecordsWrap a')).filter((a) => a.textContent.trim() === 'latest log');
      const historyLinks = Array.from(document.querySelectorAll('#preflightLatestRecordsWrap a')).filter((a) => a.textContent.trim() === 'history log');
      const failedStatus = Array.from(document.querySelectorAll('#preflightLatestRecordsWrap .history-fail')).map((node) => node.textContent.trim());
      const latestRunText = document.getElementById('preflightLatestStatus')?.textContent?.trim() || '';
      const fullRunText = document.getElementById('preflightFullStatus')?.textContent?.trim() || '';
      const quickRunText = document.getElementById('preflightQuickStatus')?.textContent?.trim() || '';
      const failureText = document.getElementById('preflightFailureStatus')?.textContent?.trim() || '';
      const timelineLegendText = document.getElementById('preflightTimelineLegend')?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const reportReadinessBoundaryNoteText = document.getElementById('reportReadinessBoundaryNote')?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const preflightTimelineLabels = Array.from(document.querySelectorAll('#preflightTimeline .run-tick')).map((node) => ({
        text: node.textContent.trim(),
        title: node.getAttribute('title') || '',
        release: node.classList.contains('release'),
      }));
      const coverageTotals = Array.from(document.querySelectorAll('#maturityCoverageTotals .coverage-total')).map((node) => ({
        key: node.getAttribute('data-coverage-key') || '',
        label: node.querySelector('strong')?.textContent?.trim() || '',
        value: node.querySelector('span')?.textContent?.trim() || '',
        ok: node.classList.contains('ok'),
      }));
      const traceabilityCatalogCoverage = Array.from(document.querySelectorAll('#traceabilityCatalogCoverage .coverage-total')).map((node) => ({
        family: node.getAttribute('data-catalog-family') || '',
        label: node.querySelector('strong')?.textContent?.trim() || '',
        value: node.querySelector('span')?.textContent?.trim() || '',
        ok: node.classList.contains('ok'),
      }));
      const globalGovernance = Array.from(document.querySelectorAll('#maturityGlobalGovernance .coverage-total')).map((node) => ({
        key: node.getAttribute('data-governance-key') || '',
        label: node.querySelector('strong')?.textContent?.trim() || '',
        value: node.querySelector('span')?.textContent?.trim() || '',
        ok: node.classList.contains('ok'),
      }));
      const attachmentIntegrityGroups = Array.from(document.querySelectorAll('#attachmentIntegrityWrap tbody tr')).map((row) => ({
        title: row.querySelector('td:nth-child(1)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        family: row.querySelector('td:nth-child(2)')?.textContent?.trim() || '',
        expected: row.querySelector('td:nth-child(3)')?.textContent?.trim() || '',
        actual: row.querySelector('td:nth-child(4)')?.textContent?.trim() || '',
        verified: row.querySelector('td:nth-child(5)')?.textContent?.trim() || '',
        status: row.querySelector('td:nth-child(6)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        setHash: row.querySelector('td:nth-child(7)')?.textContent?.trim() || '',
        artifactCount: row.querySelectorAll('td:nth-child(8) li').length,
        artifactHashes: Array.from(row.querySelectorAll('td:nth-child(8) li code')).map((node) => node.textContent.trim()),
        artifactStatuses: Array.from(row.querySelectorAll('td:nth-child(8) li [data-integrity-code]')).map((node) => ({
          code: node.getAttribute('data-integrity-code') || '',
          label: node.textContent.trim(),
          failed: node.classList.contains('history-fail'),
        })),
        artifactActions: Array.from(row.querySelectorAll('td:nth-child(8) li')).map((node) => node.querySelector('[data-integrity-action]')?.textContent?.trim() || ''),
        failed: !!row.querySelector('td:nth-child(6) .history-fail'),
      }));
      const records = rows.map((row) => {
        const links = Array.from(row.querySelectorAll('a'));
        return {
          key: row.querySelector('td code')?.textContent?.trim() || '',
          label: row.querySelector('td:nth-child(2)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          status: row.querySelector('td:nth-child(3)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          seconds: row.querySelector('td:nth-child(4)')?.textContent?.trim() || '',
          exitCode: row.querySelector('td:nth-child(5)')?.textContent?.trim() || '',
          mode: row.querySelector('td:nth-child(6)')?.textContent?.trim() || '',
          statusAge: row.querySelector('td:nth-child(7)')?.textContent?.trim() || '',
          workdir: row.querySelector('td:nth-child(8)')?.textContent?.trim() || '',
          commandHash: row.querySelector('td:nth-child(9)')?.textContent?.trim() || '',
          latestHref: links.find((link) => link.textContent.trim() === 'latest log')?.getAttribute('href') || '',
          historyHref: links.find((link) => link.textContent.trim() === 'history log')?.getAttribute('href') || '',
        };
      });
      return {
        rows: rows.length,
        latestLinks: latestLinks.length,
        historyLinks: historyLinks.length,
        records,
        failedStatus,
        latestRunText,
        fullRunText,
        quickRunText,
        failureText,
        timelineLegendText,
        reportReadinessBoundaryNoteText,
        preflightTimelineLabels,
        coverageTotals,
        traceabilityCatalogCoverage,
        globalGovernance,
        attachmentIntegrityStatus: document.getElementById('attachmentIntegrityStatus')?.textContent?.trim() || '',
        attachmentIntegrityStatusFail: document.getElementById('attachmentIntegrityStatus')?.classList.contains('fail') || false,
        attachmentIntegrityStatusHint: document.getElementById('attachmentIntegrityStatusHint')?.textContent?.trim() || '',
        attachmentIntegrityCount: document.getElementById('attachmentIntegrityCount')?.textContent?.trim() || '',
        attachmentIntegrityCountFail: document.getElementById('attachmentIntegrityCount')?.classList.contains('fail') || false,
        attachmentIntegrityVerified: document.getElementById('attachmentIntegrityVerified')?.textContent?.trim() || '',
        attachmentIntegrityVerifiedFail: document.getElementById('attachmentIntegrityVerified')?.classList.contains('fail') || false,
        attachmentIntegrityHash: document.getElementById('attachmentIntegrityHash')?.textContent?.trim() || '',
        attachmentRemediationVisible: (() => {
          const node = document.getElementById('attachmentRemediationToolbar');
          return !!node && !node.hidden && node.getClientRects().length > 0;
        })(),
        attachmentRemediationButtonDisabled: document.getElementById('attachmentRemediationCopyButton')?.disabled ?? true,
        attachmentRemediationButtonText: document.getElementById('attachmentRemediationCopyButton')?.textContent?.trim() || '',
        attachmentRemediationStatus: document.getElementById('attachmentRemediationCopyStatus')?.textContent?.trim() || '',
        attachmentIntegrityGroups,
        hasHistoryTable: !!document.querySelector('#preflightHistoryWrap table'),
        hasMaturityTable: !!document.querySelector('#maturityWrap table'),
        latestTime: document.getElementById('kpiLatestTime')?.textContent?.trim() || '',
        freshness: document.getElementById('kpiFreshness')?.textContent?.trim() || '',
        freshnessHint: document.getElementById('kpiFreshnessHint')?.textContent?.trim() || '',
        maturityPreflightText: document.getElementById('maturityPreflight')?.textContent?.trim() || '',
        maturityPreflightHint: document.getElementById('maturityPreflightHint')?.textContent?.trim() || '',
        maturityEntrypointCoverage: document.getElementById('maturityEntrypointCoverage')?.textContent?.trim() || '',
        maturityEntrypointHint: document.getElementById('maturityEntrypointHint')?.textContent?.trim() || '',
        maturityOtherGovernanceCoverage: document.getElementById('maturityOtherGovernanceCoverage')?.textContent?.trim() || '',
        maturityOtherGovernanceHint: document.getElementById('maturityOtherGovernanceHint')?.textContent?.trim() || '',
        maturityOtherGovernanceRows: Array.from(document.querySelectorAll('#maturityOtherGovernanceWrap tbody tr')).map((row) => ({
          route: row.querySelector('td:nth-child(1)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          tool: row.querySelector('td:nth-child(2)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          governance: row.querySelector('td:nth-child(3)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          boundaryTag: row.querySelector('td:nth-child(4)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          keys: row.querySelector('td:nth-child(5)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          passed: row.querySelector('td:nth-child(6)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          issues: row.querySelector('td:nth-child(7)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        })),
        maturityBoundaryCoverage: document.getElementById('maturityBoundaryCoverage')?.textContent?.trim() || '',
        maturityBoundaryHint: document.getElementById('maturityBoundaryHint')?.textContent?.trim() || '',
        maturityBoundaryRows: Array.from(document.querySelectorAll('#maturityBoundaryWrap tbody tr')).map((row) => ({
          route: row.querySelector('td:nth-child(1)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          tool: row.querySelector('td:nth-child(2)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          state: row.querySelector('td:nth-child(3)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          sourcePath: row.querySelector('td:nth-child(4)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          boundaryRule: row.querySelector('td:nth-child(5)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          matchedNeedles: row.querySelector('td:nth-child(6)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          reportSurface: row.querySelector('td:nth-child(7)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          pageOnlyReadiness: row.querySelector('td:nth-child(8)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          printHidden: row.querySelector('td:nth-child(9)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          output: row.querySelector('td:nth-child(10)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          fit: row.querySelector('td:nth-child(11)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          limit: row.querySelector('td:nth-child(12)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          capabilities: row.querySelector('td:nth-child(13)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          issues: row.querySelector('td:nth-child(14)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        })),
        maturitySourceTrace: Array.from(document.querySelectorAll('#maturitySourceTrace .source-pill')).map((node) => node.textContent.replace(/\\s+/g, ' ').trim()),
        maturityRowSourceHashes: Array.from(document.querySelectorAll('#maturityWrap tbody tr')).map((row) => row.querySelector('td:nth-child(12)')?.textContent?.trim() || ''),
        loadedAt: document.getElementById('pageLoadedAt')?.textContent?.trim() || '',
        platformMeta: Array.from(document.querySelectorAll('#platformOverallStatus .status-meta span')).map((node) => node.textContent.trim()),
        statusCards: ['platformOverallStatus', 'steelPlatformStatus', 'rcPlatformStatus', 'corePlatformStatus'].map((id) => {
          const node = document.getElementById(id);
          return {
            id,
            title: node?.querySelector('.status-title')?.textContent?.trim() || '',
            badge: node?.querySelector('.status-badge')?.textContent?.trim() || '',
            meta: Array.from(node?.querySelectorAll('.status-meta span') || []).map((item) => item.textContent.trim()),
          };
        }),
        summaryPreviews: {
          platform: document.getElementById('platformSummaryPreview')?.textContent?.trim() || '',
          steel: document.getElementById('steelSummaryPreview')?.textContent?.trim() || '',
          rc: document.getElementById('rcSummaryPreview')?.textContent?.trim() || '',
          core: document.getElementById('coreSummaryPreview')?.textContent?.trim() || '',
        },
        latestPostCheckRows: Array.from(document.querySelectorAll('#preflightPostChecksWrap tbody tr')).map((row) => ({
          key: row.querySelector('td:nth-child(1)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          label: row.querySelector('td:nth-child(2)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          status: row.querySelector('td:nth-child(3)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          seconds: row.querySelector('td:nth-child(4)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          exitCode: row.querySelector('td:nth-child(5)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          mode: row.querySelector('td:nth-child(6)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          workdir: row.querySelector('td:nth-child(7)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          commandHash: row.querySelector('td:nth-child(8)')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          latestHref: row.querySelector('td:nth-child(9) a:nth-child(1)')?.getAttribute('href') || '',
          historyHref: row.querySelector('td:nth-child(9) a:nth-child(2)')?.getAttribute('href') || '',
        })),
        platformHistoryHashes: Array.from(document.querySelectorAll('#historyWrap tbody tr')).map((row) => row.querySelector('td:nth-child(5)')?.textContent?.trim() || ''),
        preflightHistoryHashes: Array.from(document.querySelectorAll('#preflightHistoryWrap tbody tr')).map((row) => row.querySelector('td:nth-child(12)')?.textContent?.trim() || ''),
        preflightPostChecks: Array.from(document.querySelectorAll('#preflightHistoryWrap tbody tr')).map((row) => row.querySelector('td:nth-child(13)')?.textContent?.trim() || ''),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      };
    })()`);
    const expectedRows = expectedLive ? expectedLive.summary.records.length : preflightRecords.length;
    const expectedPostCheckRows = expectedLive ? expectedLive.postChecks.length : 2;
    const expectedAttachmentGroups = expectedLive
      ? (expectedLive.reportReadinessStatus.attachmentIntegrityGroups || []).length
      : fixtureAttachmentGroups.length;
    const expectedPreflightHint = expectedLive
      ? `通過 ${expectedLive.summary.passedCount} / ${expectedLive.summary.recordsCount}`
      : '通過 1 / 2';
    if (
      lastState.rows === expectedRows &&
      lastState.latestLinks === expectedRows &&
      lastState.historyLinks === expectedRows &&
      lastState.hasHistoryTable &&
      lastState.hasMaturityTable &&
      lastState.coverageTotals.length === expectedCoverageTotals.length &&
      lastState.traceabilityCatalogCoverage.length >= (expectedLive ? (expectedLive.matrix.traceabilityCatalogCoverage || []).length : expectedTraceabilityCatalogs.length) &&
      lastState.maturityOtherGovernanceRows.length >= 1 &&
      lastState.maturityBoundaryRows.length >= 1 &&
      lastState.latestPostCheckRows.length === expectedPostCheckRows &&
      lastState.attachmentIntegrityGroups.length === expectedAttachmentGroups &&
      lastState.freshness &&
      lastState.maturityPreflightHint.includes(expectedPreflightHint) &&
      (!expectedLive || Object.values(lastState.summaryPreviews || {}).every(value => value && !value.includes('讀取中') && !value.includes('讀取失敗'))) &&
      lastState.loadedAt.includes('頁面更新')
    ) {
      return lastState;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for complete dashboard render: ${JSON.stringify(lastState)}`);
}

async function exerciseAttachmentRemediationCopy(client, sessionId) {
  const copied = await evaluate(client, sessionId, `(async () => {
    window.__copiedAttachmentRemediation = '';
    const clipboard = {
      writeText: async (text) => {
        window.__copiedAttachmentRemediation = String(text || '');
      },
    };
    try {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    } catch (error) {
      if (!navigator.clipboard) throw error;
      navigator.clipboard.writeText = clipboard.writeText;
    }
    const button = document.getElementById('attachmentRemediationCopyButton');
    button?.click();
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = document.getElementById('attachmentRemediationCopyStatus')?.textContent?.trim() || '';
      if (status.startsWith('已複製') || status.startsWith('複製失敗')) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return {
      text: window.__copiedAttachmentRemediation,
      status: document.getElementById('attachmentRemediationCopyStatus')?.textContent?.trim() || '',
      buttonDisabled: button?.disabled ?? true,
    };
  })()`);
  await client.send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
  copied.printVisible = await evaluate(client, sessionId, `(() => {
    const node = document.getElementById('attachmentRemediationToolbar');
    return !!node && node.getClientRects().length > 0;
  })()`);
  await client.send('Emulation.setEmulatedMedia', { media: 'screen' }, sessionId);
  return copied;
}

function assertDashboardLiveState(state, label, expected) {
  const summary = expected.summary;
  const historyLatest = expected.history.items[0];
  const matrix = expected.matrix;
  const postChecks = expected.postChecks;
  const latestFull = expected.history.items.find(item => item && item.quick === false);
  const latestQuick = expected.history.items.find(item => item && item.quick === true);
  assert.equal(state.rows, summary.records.length, `${label} live latest record row count`);
  assert.equal(state.latestLinks, summary.records.length, `${label} live latest log link count`);
  assert.equal(state.historyLinks, summary.records.length, `${label} live history log link count`);
  assert.equal(state.horizontalOverflow, false, `${label} live horizontal overflow (${state.scrollWidth} > ${state.clientWidth})`);
  assert.deepEqual(state.records.map(record => record.key), summary.records.map(record => record.key), `${label} live latest record key order`);
  assert.ok(state.latestRunText.includes(summary.pass ? '通過' : '異常'), `${label} live latest KPI status: ${state.latestRunText}`);
  assert.ok(state.latestRunText.includes(summary.quick ? '快速檢查' : '完整檢查') || state.latestRunText.includes('正式放行'), `${label} live latest KPI mode: ${state.latestRunText}`);
  if (latestFull) {
    assert.ok(state.fullRunText.includes('完整檢查') || state.fullRunText.includes('正式放行'), `${label} live full KPI populated: ${state.fullRunText}`);
  } else {
    assert.equal(state.fullRunText, '無資料', `${label} live full KPI fallback: ${state.fullRunText}`);
  }
  if (latestQuick) {
    assert.ok(state.quickRunText.includes('快速檢查'), `${label} live quick KPI populated: ${state.quickRunText}`);
  } else {
    assert.equal(state.quickRunText, '無資料', `${label} live quick KPI fallback: ${state.quickRunText}`);
  }
  ['F 完整檢查', 'Q 快速檢查', 'R 正式放行', '! 未完成 / 摘要異常'].forEach((needle) => {
    assert.ok(state.timelineLegendText.includes(needle), `${label} live timeline legend includes ${needle}: ${state.timelineLegendText}`);
  });
  ['報告閱讀狀態邊界', '頁面診斷明細只供公司內部整理', '文件狀態由核可勾選決定', '內部審閱與正式附件皆可列印'].forEach((needle) => {
    assert.ok(state.reportReadinessBoundaryNoteText.includes(needle), `${label} live boundary note includes ${needle}: ${state.reportReadinessBoundaryNoteText}`);
  });
  const platformCard = state.statusCards.find(card => card.id === 'platformOverallStatus');
  assert.ok(platformCard, `${label} live platform status card exists`);
  assert.equal(platformCard.title, '全平台總巡檢', `${label} live platform card title`);
  assert.ok(platformCard.badge.includes(expected.platformStatus.pass ? '通過' : '異常'), `${label} live platform card badge: ${platformCard.badge}`);
  if (expected.platformStatus.lastSummaryHash) {
    assert.ok(platformCard.meta.includes(`摘要 hash｜${String(expected.platformStatus.lastSummaryHash).slice(0, 12)}`), `${label} live platform summary hash meta: ${platformCard.meta.join(' | ')}`);
  }
  if (expected.platformStatus.lastSummaryJsonHash) {
    assert.ok(platformCard.meta.includes(`JSON hash｜${String(expected.platformStatus.lastSummaryJsonHash).slice(0, 12)}`), `${label} live platform JSON hash meta: ${platformCard.meta.join(' | ')}`);
  }
  for (const component of expected.componentStatuses) {
    const card = state.statusCards.find(item => item.title === component.title);
    assert.ok(card, `${label} live ${component.key} status card exists`);
    assert.ok(card.badge.includes(component.status.pass ? '通過' : '異常'), `${label} live ${component.key} badge: ${card.badge}`);
    if (component.status.generatedAt) {
      assert.ok(card.meta.some(item => item.includes(component.status.generatedAt)), `${label} live ${component.key} generatedAt meta: ${card.meta.join(' | ')}`);
    }
  }
  for (const [key, sourceText] of Object.entries(expected.summaries)) {
    const snippet = summarySnippet(sourceText);
    assert.ok(snippet, `${label} live ${key} summary source snippet`);
    assert.ok(state.summaryPreviews[key]?.includes(snippet), `${label} live ${key} summary preview includes source snippet ${snippet}: ${state.summaryPreviews[key]?.slice(0, 120)}`);
  }
  assert.equal(state.hasHistoryTable, true, `${label} live preflight history table rendered`);
  assert.equal(state.hasMaturityTable, true, `${label} live maturity table rendered`);
  assert.deepEqual(state.coverageTotals.map(item => item.key), expectedCoverageTotals.map(item => item.key), `${label} live maturity coverage keys`);
  assert.equal(state.coverageTotals.every(item => item.ok), true, `${label} live maturity coverage all OK: ${JSON.stringify(state.coverageTotals)}`);
  const expectedCatalogs = Array.isArray(matrix.traceabilityCatalogCoverage) ? matrix.traceabilityCatalogCoverage : [];
  assert.equal(state.traceabilityCatalogCoverage.length, expectedCatalogs.length, `${label} live traceability catalog coverage count`);
  for (const catalog of expectedCatalogs) {
    const rendered = state.traceabilityCatalogCoverage.find(item => item.family === catalog.family);
    assert.ok(rendered, `${label} live traceability catalog rendered: ${catalog.family}`);
    assert.equal(rendered.ok, true, `${label} live traceability catalog OK: ${catalog.family} ${JSON.stringify(rendered)}`);
    assert.ok(rendered.value.includes(`${catalog.covered} / ${catalog.tools} tools`), `${label} live traceability catalog tool coverage ${catalog.family}: ${rendered.value}`);
    assert.ok(rendered.value.includes(`${catalog.traceCount} traces`), `${label} live traceability catalog trace count ${catalog.family}: ${rendered.value}`);
    assert.ok(rendered.value.includes(`${catalog.manualReviewCount} manual-review items`), `${label} live traceability catalog review count ${catalog.family}: ${rendered.value}`);
  }
  const expectedGlobalGates = Array.isArray(matrix.globalGovernance?.gates) ? matrix.globalGovernance.gates : [];
  assert.equal(state.globalGovernance.length, expectedGlobalGates.length, `${label} live global governance gate count`);
  for (const gate of expectedGlobalGates) {
    const rendered = state.globalGovernance.find(item => item.key === gate.key);
    assert.ok(rendered, `${label} live global governance gate rendered: ${gate.key}`);
    assert.equal(rendered.ok, gate.pass === true, `${label} live global governance gate state: ${gate.key} ${JSON.stringify(rendered)}`);
    assert.ok(rendered.value.includes(gate.pass ? '通過' : '異常'), `${label} live global governance status ${gate.key}: ${rendered.value}`);
    assert.ok(rendered.value.includes(`${gate.coveredCatalogs || 0} catalogs`), `${label} live global governance catalog count ${gate.key}: ${rendered.value}`);
    const requiredCatalogFamilies = Array.isArray(gate.requiredCatalogFamilies) ? gate.requiredCatalogFamilies.filter(Boolean) : [];
    const missingCatalogFamilies = Array.isArray(gate.missingCatalogFamilies) ? gate.missingCatalogFamilies.filter(Boolean) : [];
    if (requiredCatalogFamilies.length > 0) {
      assert.ok(
        rendered.value.includes(`required ${requiredCatalogFamilies.join(', ')}`),
        `${label} live global governance required catalogs ${gate.key}: ${rendered.value}`
      );
    }
    if (missingCatalogFamilies.length > 0) {
      assert.ok(
        rendered.value.includes(`missing ${missingCatalogFamilies.join(', ')}`),
        `${label} live global governance missing catalogs ${gate.key}: ${rendered.value}`
      );
    }
    assert.ok(rendered.value.includes(gate.key), `${label} live global governance preflight key ${gate.key}: ${rendered.value}`);
  }
  const attachmentStatus = expected.reportReadinessStatus;
  assert.equal(state.attachmentIntegrityStatus, attachmentStatus.attachmentIntegrityPass ? '通過' : `異常 ${attachmentStatus.attachmentIntegrityIssueCount || 1} 項`, `${label} live attachment integrity status`);
  assert.equal(state.attachmentIntegrityCount, `${attachmentStatus.attachmentIntegrityActual} / ${attachmentStatus.attachmentIntegrityRequired}`, `${label} live attachment integrity count`);
  assert.equal(state.attachmentIntegrityVerified, `${attachmentStatus.attachmentIntegrityVerified} / ${attachmentStatus.attachmentIntegrityRequired}`, `${label} live attachment integrity verified count`);
  assert.equal(state.attachmentIntegrityHash, String(attachmentStatus.attachmentIntegritySetSha256 || '').slice(0, 12), `${label} live attachment integrity set hash`);
  assert.ok(state.attachmentIntegrityStatusHint.includes(`release ${attachmentStatus.renderedDeliveryEvidenceRunId || attachmentStatus.runId}`), `${label} live attachment integrity release trace`);
  assert.equal(state.attachmentIntegrityGroups.length, attachmentStatus.attachmentIntegrityGroups.length, `${label} live attachment integrity group count`);
  for (const group of attachmentStatus.attachmentIntegrityGroups) {
    const rendered = state.attachmentIntegrityGroups.find(item => item.title === group.title);
    assert.ok(rendered, `${label} live attachment integrity group rendered: ${group.title}`);
    assert.equal(rendered.family, group.family, `${label} live attachment integrity family: ${group.title}`);
    assert.equal(rendered.expected, String(group.expected), `${label} live attachment integrity expected: ${group.title}`);
    assert.equal(rendered.actual, String(group.actual), `${label} live attachment integrity actual: ${group.title}`);
    assert.equal(rendered.verified, String(group.verified), `${label} live attachment integrity verified: ${group.title}`);
    assert.equal(rendered.status, group.pass ? '通過' : `異常 ${group.issueCount || 1} 項`, `${label} live attachment integrity group status: ${group.title}`);
    assert.equal(rendered.setHash, String(group.setSha256 || '').slice(0, 12), `${label} live attachment integrity group hash: ${group.title}`);
    assert.equal(rendered.artifactCount, group.artifacts.length, `${label} live attachment integrity artifact count: ${group.title}`);
    assert.deepEqual(rendered.artifactHashes, group.artifacts.map(artifact => String(artifact.sha256 || '').slice(0, 12)), `${label} live attachment integrity artifact hashes: ${group.title}`);
    assert.deepEqual(rendered.artifactStatuses, group.artifacts.map(() => ({ code: 'verified', label: '已驗證', failed: false })), `${label} live attachment integrity artifact statuses: ${group.title}`);
    assert.deepEqual(rendered.artifactActions, group.artifacts.map(() => ''), `${label} live passed attachments do not show remediation actions: ${group.title}`);
  }
  assert.ok(state.maturityPreflightHint.includes(`runId ${summary.runId}`), `${label} live maturity hint runId: ${state.maturityPreflightHint}`);
  assert.ok(state.maturityPreflightHint.includes(`通過 ${summary.passedCount} / ${summary.recordsCount}`), `${label} live maturity hint pass count: ${state.maturityPreflightHint}`);
  assert.ok(state.maturityPreflightText.includes(summary.quick ? '快速檢查' : '完整檢查') || state.maturityPreflightText.includes('正式放行'), `${label} live maturity preflight mode: ${state.maturityPreflightText}`);
  assert.ok(state.maturityBoundaryHint.includes('頁面專用閱讀狀態檢查'), `${label} live maturity boundary page-only note: ${state.maturityBoundaryHint}`);
  if (summary.quick) {
    assert.ok(state.maturityPreflightHint.includes('僅供快速巡查，不作為正式交付證據。'), `${label} live maturity quick evidence note: ${state.maturityPreflightHint}`);
  } else if (summary.pass === true && summary.forcePlatformAudit === true && summary.forceSlowChecks === true && /^[0-9a-f]{40}$/i.test(String(summary.sourceCommitSha || '')) && summary.sourceDirty === false) {
    assert.ok(state.maturityPreflightHint.includes('來源 commit 可辨識、啟動時工作樹乾淨'), `${label} live maturity release evidence note: ${state.maturityPreflightHint}`);
  } else if (summary.pass === true) {
    assert.ok(state.maturityPreflightHint.includes('正式交付請以完整檢查或正式放行結果為準。'), `${label} live maturity full evidence note: ${state.maturityPreflightHint}`);
  } else {
    assert.ok(state.maturityPreflightHint.includes('本輪仍有異常，修正後才可作為正式交付證據。'), `${label} live maturity failure evidence note: ${state.maturityPreflightHint}`);
  }
  assert.deepEqual(state.latestPostCheckRows.map(row => row.key), postChecks.map(check => check.key), `${label} live latest post-check keys`);
  let expectedHistoryPostChecks = historyLatest.postCheckCount > 0 ? `${historyLatest.postChecksPassedCount} / ${historyLatest.postCheckCount}` : '-';
  if (expectedHistoryPostChecks !== '-' && Array.isArray(historyLatest.postCheckFailures) && historyLatest.postCheckFailures.length) {
    expectedHistoryPostChecks += ` (${historyLatest.postCheckFailures.join(', ')})`;
  }
  assert.equal(state.preflightPostChecks[0], expectedHistoryPostChecks, `${label} live history latest post-check count`);
  const sourceInputs = Array.isArray(matrix.sourceTrace?.inputs) ? matrix.sourceTrace.inputs : [];
  assert.equal(state.maturitySourceTrace.length, sourceInputs.length, `${label} live source trace chip count`);
  for (const input of sourceInputs) {
    assert.ok(state.maturitySourceTrace.some(item => item.includes(input.key) && item.includes(String(input.sourceHash || '').slice(0, 12))), `${label} live source trace ${input.key}: ${JSON.stringify(state.maturitySourceTrace)}`);
  }
  assert.equal(state.maturityRowSourceHashes.length, matrix.rows.length, `${label} live maturity row source hash count`);
  assert.ok(state.loadedAt.includes('頁面更新'), `${label} live loaded timestamp rendered`);
}

function assertDashboardState(state, label, expectedLive = null) {
  if (expectedLive) return assertDashboardLiveState(state, label, expectedLive);
  assert.equal(state.rows, preflightRecords.length, `${label} latest record row count`);
  assert.equal(state.latestLinks, preflightRecords.length, `${label} latest log link count`);
  assert.equal(state.historyLinks, preflightRecords.length, `${label} history log link count`);
  assert.equal(state.horizontalOverflow, false, `${label} horizontal overflow (${state.scrollWidth} > ${state.clientWidth})`);
  assert.deepEqual(state.records, [
    {
      key: 'platform-audit',
      label: 'Platform audit (steel, RC, core)',
      status: '通過',
      seconds: '1.6 秒',
      exitCode: '0',
      mode: '重用狀態',
      statusAge: '2.25 小時 / 24 小時上限',
      workdir: '.',
      commandHash: '111111111111',
      latestHref: '../output/preflight/platform-audit.txt',
      historyHref: '../output/preflight/history/fixture-full/platform-audit.txt',
    },
    {
      key: 'dashboard-fixture-failure',
      label: 'Dashboard fixture failure',
      status: '異常 9',
      seconds: '0.4 秒',
      exitCode: '9',
      mode: '執行命令',
      statusAge: '-',
      workdir: 'fixtures/dashboard',
      commandHash: '222222222222',
      latestHref: '../output/preflight/dashboard-fixture-failure.txt',
      historyHref: '../output/preflight/history/fixture-full/dashboard-fixture-failure.txt',
    },
  ], `${label} latest record rows match fixture order, status, exitCode, and log links: ${JSON.stringify(state.records)}`);
  assert.ok(state.latestRunText.includes('異常'), `${label} latest KPI reflects fixture failure`);
  assert.ok(state.latestRunText.includes('完整檢查'), `${label} latest KPI exposes full mode`);
  assert.ok(state.fullRunText.includes('異常') && state.fullRunText.includes('完整檢查'), `${label} full KPI reflects fixture failure`);
  assert.ok(state.quickRunText.includes('通過') && state.quickRunText.includes('快速檢查'), `${label} quick KPI reflects fixture quick pass`);
  ['F 完整檢查', 'Q 快速檢查', 'R 正式放行', '! 未完成 / 摘要異常'].forEach((needle) => {
    assert.ok(state.timelineLegendText.includes(needle), `${label} timeline legend includes ${needle}: ${state.timelineLegendText}`);
  });
  ['報告閱讀狀態邊界', '頁面診斷明細只供公司內部整理', '文件狀態由核可勾選決定', '內部審閱與正式附件皆可列印'].forEach((needle) => {
    assert.ok(state.reportReadinessBoundaryNoteText.includes(needle), `${label} boundary note includes ${needle}: ${state.reportReadinessBoundaryNoteText}`);
  });
  assert.ok(
    state.preflightTimelineLabels.some((item) => item.text === 'R' && item.release && item.title.includes('正式放行 fixture-release')),
    `${label} release preflight timeline tick rendered: ${JSON.stringify(state.preflightTimelineLabels)}`
  );
  assert.equal(state.failureText, '1 / 3', `${label} failure KPI count`);
  assert.equal(state.hasHistoryTable, true, `${label} preflight history table rendered`);
  assert.equal(state.hasMaturityTable, true, `${label} maturity table rendered`);
  assert.ok(state.latestTime && state.latestTime !== '讀取中', `${label} overview latest timestamp rendered`);
  assert.ok(['新鮮', '可接受', '偏舊', '無法判讀'].includes(state.freshness), `${label} overview freshness rendered: ${state.freshness}`);
  assert.ok(state.freshnessHint && state.freshnessHint !== '讀取中', `${label} overview freshness hint rendered`);
  assert.ok(state.maturityPreflightText.includes('異常') && state.maturityPreflightText.includes('完整檢查'), `${label} maturity latest preflight status rendered: ${state.maturityPreflightText}`);
  assert.equal(state.maturityEntrypointCoverage, '1 / 3', `${label} maturity entrypoint coverage rendered`);
  ['首頁 3 個入口', '成熟度矩陣 1 個', '其他 audit governance 1 個', '非正式 / 工作流 1 個', '未納管正式入口 0 個'].forEach((needle) => {
    assert.ok(state.maturityEntrypointHint.includes(needle), `${label} maturity entrypoint hint includes ${needle}: ${state.maturityEntrypointHint}`);
  });
  assert.equal(state.maturityOtherGovernanceCoverage, '1 / 1', `${label} maturity other governance coverage rendered`);
  ['矩陣外 1 個正式入口', '通過 preflight', '問題 0 個'].forEach((needle) => {
    assert.ok(state.maturityOtherGovernanceHint.includes(needle), `${label} maturity other governance hint includes ${needle}: ${state.maturityOtherGovernanceHint}`);
  });
  assert.deepEqual(state.maturityOtherGovernanceRows, [{
    route: '/fixture-rc',
    tool: 'Fixture RC',
    governance: 'RC audit',
    boundaryTag: '報告邊界',
    keys: 'rc-audit-status',
    passed: 'rc-audit-status',
    issues: '無',
  }], `${label} maturity other governance detail rows rendered: ${JSON.stringify(state.maturityOtherGovernanceRows)}`);
  assert.equal(state.maturityBoundaryCoverage, '1 / 1', `${label} maturity boundary coverage rendered`);
  ['矩陣外 1 個', '已完成 1 個', '問題 0 個', '頁面專用閱讀狀態檢查'].forEach((needle) => {
    assert.ok(state.maturityBoundaryHint.includes(needle), `${label} maturity boundary hint includes ${needle}: ${state.maturityBoundaryHint}`);
  });
  assert.deepEqual(state.maturityBoundaryRows, [{
    route: '/fixture-assist',
    tool: 'Fixture Assist',
    state: '輔助判讀',
    sourcePath: '結構工具箱/tools/fixture-assist.html',
    boundaryRule: '只能作為附件或判讀輔助，不得替代正式計算書判定。',
    matchedNeedles: '不是完整正式工具',
    reportSurface: 'yes',
    pageOnlyReadiness: 'yes',
    printHidden: 'yes',
    output: 'Fixture output',
    fit: 'Fixture fit',
    limit: '不是完整正式工具。',
    capabilities: '分析輔助',
    issues: '無',
  }], `${label} maturity boundary detail rows rendered: ${JSON.stringify(state.maturityBoundaryRows)}`);
  assert.deepEqual(state.latestPostCheckRows, [{
    key: 'audit-dashboard-contract-final',
    label: 'Audit dashboard final output contract',
    status: '通過',
    seconds: '0.3 秒',
    exitCode: '0',
    mode: '執行命令',
    workdir: '.',
    commandHash: '333333333333',
    latestHref: '../output/preflight/audit-dashboard-contract-final.txt',
    historyHref: '../output/preflight/history/fixture-full/audit-dashboard-contract-final.txt',
  }, {
    key: 'audit-dashboard-browser-smoke-final',
    label: 'Audit dashboard final browser smoke',
    status: '通過',
    seconds: '2.5 秒',
    exitCode: '0',
    mode: '執行命令',
    workdir: '.',
    commandHash: '444444444444',
    latestHref: '../output/preflight/audit-dashboard-browser-smoke-final.txt',
    historyHref: '../output/preflight/history/fixture-full/audit-dashboard-browser-smoke-final.txt',
  }], `${label} latest post-check detail rows rendered: ${JSON.stringify(state.latestPostCheckRows)}`);
  ['完整檢查 runId fixture-full', '通過 1 / 2', '耗時 2 秒', '平台 audit 重用狀態', '慢測重用 1 (formal-browser-smoke)', '最慢 platform-audit (1.6 秒)', '本輪仍有異常，修正後才可作為正式交付證據。', '受測 commit 1234567890ab', '分支 fixture-main', '啟動工作樹 有變更', '來源 output/preflight/preflight-summary.json', 'hash abcdef012345'].forEach((needle) => {
    assert.ok(state.maturityPreflightHint.includes(needle), `${label} maturity latest preflight hint includes ${needle}: ${state.maturityPreflightHint}`);
  });
  assert.deepEqual(
    state.coverageTotals,
    expectedCoverageTotals.map((item) => ({ ...item, ok: true })),
    `${label} maturity coverage totals rendered`
  );
  assert.deepEqual(
    state.traceabilityCatalogCoverage,
    expectedTraceabilityCatalogs.map((item) => ({ ...item, label: item.family, ok: true })),
    `${label} traceability catalog coverage rendered`
  );
  assert.deepEqual(
    state.globalGovernance,
    expectedGlobalGovernance.map((item) => ({ ...item, ok: true })),
    `${label} global governance gates rendered`
  );
  assert.equal(state.attachmentIntegrityStatus, '通過', `${label} attachment integrity status`);
  assert.equal(state.attachmentIntegrityStatusFail, false, `${label} attachment integrity status is not failed`);
  assert.equal(state.attachmentIntegrityCount, '32 / 32', `${label} attachment integrity count`);
  assert.equal(state.attachmentIntegrityCountFail, false, `${label} attachment integrity count is not failed`);
  assert.equal(state.attachmentIntegrityVerified, '32 / 32', `${label} attachment integrity verified count`);
  assert.equal(state.attachmentIntegrityVerifiedFail, false, `${label} attachment integrity verified count is not failed`);
  assert.equal(state.attachmentIntegrityHash, 'aaaaaaaaaaaa', `${label} attachment integrity set hash`);
  assert.ok(state.attachmentIntegrityStatusHint.includes('release fixture-release'), `${label} attachment integrity release trace`);
  assert.equal(state.attachmentRemediationVisible, false, `${label} passed/public attachment state hides local remediation copy`);
  assert.equal(state.attachmentRemediationButtonDisabled, true, `${label} passed/public remediation copy is disabled`);
  assert.equal(state.attachmentRemediationStatus, '', `${label} passed/public attachment state has no remediation status`);
  assert.equal(state.attachmentIntegrityGroups.length, 8, `${label} attachment integrity group count`);
  for (const group of fixtureAttachmentGroups) {
    const rendered = state.attachmentIntegrityGroups.find(item => item.title === group.title);
    assert.ok(rendered, `${label} attachment integrity group rendered: ${group.title}`);
    assert.equal(rendered.family, group.family, `${label} attachment integrity family: ${group.title}`);
    assert.equal(rendered.expected, String(group.expected), `${label} attachment integrity expected: ${group.title}`);
    assert.equal(rendered.actual, String(group.actual), `${label} attachment integrity actual: ${group.title}`);
    assert.equal(rendered.verified, String(group.verified), `${label} attachment integrity verified: ${group.title}`);
    assert.equal(rendered.status, '通過', `${label} attachment integrity group status: ${group.title}`);
    assert.equal(rendered.failed, false, `${label} attachment integrity group is not failed: ${group.title}`);
    assert.equal(rendered.setHash, String(group.setSha256).slice(0, 12), `${label} attachment integrity group hash: ${group.title}`);
    assert.equal(rendered.artifactCount, group.artifacts.length, `${label} attachment integrity artifact count: ${group.title}`);
    assert.deepEqual(rendered.artifactHashes, group.artifacts.map(artifact => artifact.sha256.slice(0, 12)), `${label} attachment integrity artifact hashes: ${group.title}`);
    assert.deepEqual(rendered.artifactStatuses, group.artifacts.map(() => ({ code: 'verified', label: '已驗證', failed: false })), `${label} attachment integrity artifact statuses: ${group.title}`);
    assert.deepEqual(rendered.artifactActions, group.artifacts.map(() => ''), `${label} passed attachments do not show remediation actions: ${group.title}`);
  }
  assert.equal(state.maturitySourceTrace.length, 9, `${label} maturity source trace chip count: ${JSON.stringify(state.maturitySourceTrace)}`);
  assert.ok(
    state.maturitySourceTrace.some((item) => item.includes('formal-tools-manifest') && item.includes('1234567890ab')),
    `${label} maturity formal manifest source hash rendered: ${JSON.stringify(state.maturitySourceTrace)}`
  );
  assert.ok(
    state.maturitySourceTrace.some((item) => item.includes('formal-traceability-catalog') && item.includes('234567890abc')),
    `${label} maturity formal traceability source hash rendered: ${JSON.stringify(state.maturitySourceTrace)}`
  );
  assert.ok(
    state.maturitySourceTrace.some((item) => item.includes('rc-traceability-catalog') && item.includes('34567890abcd')),
    `${label} maturity RC traceability source hash rendered: ${JSON.stringify(state.maturitySourceTrace)}`
  );
  assert.ok(
    state.maturitySourceTrace.some((item) => item.includes('steel-traceability-catalog') && item.includes('4567890abcde')),
    `${label} maturity steel traceability source hash rendered: ${JSON.stringify(state.maturitySourceTrace)}`
  );
  assert.ok(
    state.maturitySourceTrace.some((item) => item.includes('anchor-traceability-catalog') && item.includes('567890abcdef')),
    `${label} maturity anchor traceability source hash rendered: ${JSON.stringify(state.maturitySourceTrace)}`
  );
  assert.ok(
    state.maturitySourceTrace.some((item) => item.includes('stone-traceability-catalog') && item.includes('678901234567')),
    `${label} maturity stone traceability source hash rendered: ${JSON.stringify(state.maturitySourceTrace)}`
  );
  assert.ok(
    state.maturitySourceTrace.some((item) => item.includes('decking-traceability-catalog') && item.includes('789012345678')),
    `${label} maturity decking traceability source hash rendered: ${JSON.stringify(state.maturitySourceTrace)}`
  );
  assert.ok(
    state.maturitySourceTrace.some((item) => item.includes('excavation-traceability-catalog') && item.includes('890123456789')),
    `${label} maturity excavation traceability source hash rendered: ${JSON.stringify(state.maturitySourceTrace)}`
  );
  assert.ok(
    state.maturitySourceTrace.some((item) => item.includes('latest-preflight-summary') && item.includes('abcdef012345')),
    `${label} maturity preflight source hash rendered: ${JSON.stringify(state.maturitySourceTrace)}`
  );
  assert.deepEqual(state.maturityRowSourceHashes, ['fedcba987654'], `${label} maturity row source hash rendered`);
  assert.ok(state.platformMeta.includes('摘要 hash｜1234567890ab'), `${label} platform status card summary hash rendered: ${state.platformMeta.join(' | ')}`);
  assert.ok(state.platformMeta.includes('JSON hash｜abcdef012345'), `${label} platform status card JSON hash rendered: ${state.platformMeta.join(' | ')}`);
  assert.deepEqual(state.platformHistoryHashes, ['abcdef012345'], `${label} platform history summary hash rendered`);
  assert.deepEqual(state.preflightHistoryHashes, ['abcdef012345', 'abcdef012345', 'abcdef012345'], `${label} preflight history summary hash rendered`);
  assert.deepEqual(state.preflightPostChecks, ['2 / 2', '2 / 2', '2 / 2'], `${label} preflight post checks rendered`);
  assert.ok(state.loadedAt.includes('頁面更新'), `${label} loaded timestamp rendered`);
}

function assertAttachmentIntegrityFailureState(state, label) {
  assert.equal(state.horizontalOverflow, false, `${label} failure fixture horizontal overflow (${state.scrollWidth} > ${state.clientWidth})`);
  assert.equal(state.attachmentIntegrityStatus, '異常 2 項', `${label} failed attachment integrity status`);
  assert.equal(state.attachmentIntegrityStatusFail, true, `${label} failed attachment integrity status tone`);
  assert.equal(state.attachmentIntegrityCount, '31 / 32', `${label} failed attachment integrity count`);
  assert.equal(state.attachmentIntegrityCountFail, true, `${label} failed attachment integrity count tone`);
  assert.equal(state.attachmentIntegrityVerified, '30 / 32', `${label} failed attachment integrity verified count`);
  assert.equal(state.attachmentIntegrityVerifiedFail, true, `${label} failed attachment integrity verified tone`);
  assert.equal(state.attachmentIntegrityHash, 'bbbbbbbbbbbb', `${label} failed attachment integrity set hash`);
  assert.ok(state.attachmentIntegrityStatusHint.includes('本機失敗 release fixture-tampered-release'), `${label} failed local attachment release trace`);
  assert.ok(state.attachmentIntegrityStatusHint.includes('公開狀態仍保留 release fixture-release'), `${label} successful public release is retained`);
  assert.ok(state.attachmentIntegrityStatusHint.includes('問題 2 項'), `${label} failed attachment issue count`);
  assert.equal(state.attachmentRemediationVisible, true, `${label} failed local release shows remediation copy`);
  assert.equal(state.attachmentRemediationButtonDisabled, false, `${label} failed local remediation copy is enabled`);
  assert.equal(state.attachmentRemediationButtonText, '複製失敗項目處置清單', `${label} remediation copy control is explicit`);
  assert.ok(state.attachmentRemediationStatus.includes('不含檔名、路徑、hash 或 bytes'), `${label} remediation copy privacy boundary is visible`);
  assert.equal(state.attachmentIntegrityGroups.length, 8, `${label} failed attachment group count`);

  const failedGroups = state.attachmentIntegrityGroups.filter(group => group.failed);
  assert.equal(failedGroups.length, 1, `${label} exactly one attachment group failed: ${JSON.stringify(failedGroups)}`);
  const failed = failedGroups[0];
  assert.deepEqual({
    title: failed.title,
    family: failed.family,
    expected: failed.expected,
    actual: failed.actual,
    verified: failed.verified,
    status: failed.status,
    setHash: failed.setHash,
    artifactCount: failed.artifactCount,
  }, {
    title: 'RC 柱',
    family: 'rc-formal',
    expected: '6',
    actual: '5',
    verified: '4',
    status: '異常 2 項',
    setHash: 'ffffffffffff',
    artifactCount: 6,
  }, `${label} failed RC column attachment details`);
  assert.equal(failed.artifactHashes.at(-1), '-', `${label} missing RC column artifact hash is disclosed`);
  assert.deepEqual(failed.artifactStatuses.slice(-2), [
    { code: 'sha256-mismatch', label: 'SHA-256 不符', failed: true },
    { code: 'missing-file', label: '檔案缺失', failed: true },
  ], `${label} failed RC column attachment reasons are human-readable`);
  assert.deepEqual(failed.artifactActions.slice(-2), [
    '建議處置：不要重算 hash 或接受異動檔；請由原始計算重新輸出附件，再重跑正式 release。',
    '建議處置：重新輸出缺失附件，再重跑正式 release。',
  ], `${label} failed RC column attachment remediation is actionable: ${JSON.stringify(failed.artifactActions.slice(-2))}`);
  const copied = state.attachmentRemediationCopy;
  assert.ok(copied, `${label} remediation checklist copy was exercised`);
  assert.equal(copied.buttonDisabled, false, `${label} remediation copy button is restored after copying`);
  assert.equal(copied.printVisible, false, `${label} remediation copy control is excluded from print media`);
  assert.equal(copied.status, '已複製 1 份本機處置清單；未包含檔名、路徑、hash 或 bytes。', `${label} remediation copy confirms privacy boundary`);
  assert.equal(copied.text, [
    '附件完整性失敗處置清單',
    '失敗 release：fixture-tampered-release',
    '問題：2 項',
    '',
    '1. RC 柱／附件 5：SHA-256 不符',
    '   處置：不要重算 hash 或接受異動檔；請由原始計算重新輸出附件，再重跑正式 release。',
    '2. RC 柱／附件 6：檔案缺失',
    '   處置：重新輸出缺失附件，再重跑正式 release。',
    '',
    '安全原則：不得藉由重算 hash、改寫 bytes 或更新清冊接受異動附件；應由原始計算重新輸出。',
    '本清單僅供本機排除，不會寫入計算書、列印、PDF 或公開狀態。',
  ].join('\n'), `${label} copied remediation checklist is deterministic and actionable`);
  for (const forbidden of ['C:/repo', '.html', '1000 bytes', '555555555555', 'ffffffffffff']) {
    assert.equal(copied.text.includes(forbidden), false, `${label} copied remediation checklist excludes ${forbidden}`);
  }
  for (const group of state.attachmentIntegrityGroups.filter(item => item.title !== 'RC 柱')) {
    assert.equal(group.status, '通過', `${label} unaffected attachment group remains passed: ${group.title}`);
    assert.equal(group.failed, false, `${label} unaffected attachment group has no failure tone: ${group.title}`);
    assert.ok(group.artifactStatuses.every(item => item.code === 'verified' && item.label === '已驗證' && item.failed === false), `${label} unaffected attachment artifacts remain verified: ${group.title}`);
    assert.ok(group.artifactActions.every(item => item === ''), `${label} unaffected attachment artifacts do not show remediation: ${group.title}`);
  }
}

async function main() {
  assert.ok(fs.existsSync(repoFile('結構工具箱/audit-dashboard.html')), 'dashboard HTML exists');
  const edgePath = EDGE_CANDIDATES.find(candidate => fs.existsSync(candidate));
  assert.ok(edgePath, `Microsoft Edge not found in: ${EDGE_CANDIDATES.join(', ')}`);
  assert.equal(typeof WebSocket, 'function', 'Node WebSocket support is required for CDP smoke');

  const serverPort = await getFreePort();
  const debugPort = await getFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-dashboard-edge-'));
  let server;
  let edge;
  let client;
  const requestAudit = createRequestAudit();
  const liveExpected = liveOutputMode ? loadLiveExpected() : null;

  try {
    server = await startStaticServer(serverPort, requestAudit, { fixtureMode: !liveOutputMode });
    const launchedEdge = await launchEdgeForCdp(edgePath, debugPort, userDataDir);
    edge = launchedEdge.edge;

    client = createCdpClient(launchedEdge.version.webSocketDebuggerUrl);
    await client.open();

    const target = await client.send('Target.createTarget', { url: 'about:blank' });
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;
    await client.send('Page.enable', {}, sessionId);
    await client.send('Runtime.enable', {}, sessionId);
    await client.send('Log.enable', {}, sessionId);
    await client.send('Network.enable', {}, sessionId);
    await client.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);

    const pageErrors = collectPageErrors(client, sessionId);
    const dashboardUrl = `http://127.0.0.1:${serverPort}/${encodeURI('結構工具箱/audit-dashboard.html')}`;
    const states = [];
    for (const viewport of viewports) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      }, sessionId);
      const loaded = waitForEvent(client, sessionId, 'Page.loadEventFired', 15000);
      await client.send('Page.navigate', { url: dashboardUrl }, sessionId);
      await loaded;
      states.push({ viewport: viewport.key, state: await waitForDashboardState(client, sessionId, liveExpected) });
    }
    const attachmentFailureStates = [];
    if (!liveOutputMode) {
      const preflightFixturePath = 'output/preflight/preflight-summary.json';
      const attachmentDiagnosticFixturePath = 'output/preflight/attachment-integrity-latest.json';
      const originalPreflightFixture = fixtures.get(preflightFixturePath);
      fixtures.set(preflightFixturePath, {
        ...originalPreflightFixture,
        runId: 'fixture-tampered-release',
        forcePlatformAudit: true,
        forceSlowChecks: true,
        sourceDirty: false,
        pass: false,
      });
      fixtures.set(attachmentDiagnosticFixturePath, fixtureAttachmentFailureDiagnostic);
      for (const viewport of viewports) {
        await client.send('Emulation.setDeviceMetricsOverride', {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: viewport.mobile,
        }, sessionId);
        const loaded = waitForEvent(client, sessionId, 'Page.loadEventFired', 15000);
        await client.send('Page.navigate', { url: dashboardUrl }, sessionId);
        await loaded;
        const state = await waitForDashboardState(client, sessionId);
        state.attachmentRemediationCopy = await exerciseAttachmentRemediationCopy(client, sessionId);
        attachmentFailureStates.push({ viewport: viewport.key, state });
      }
      fixtures.set(preflightFixturePath, originalPreflightFixture);
      fixtures.set(attachmentDiagnosticFixturePath, fixtureAttachmentDiagnostic);
    }
    pageErrors.unsubscribe();
    await client.send('Browser.close').catch(() => {});
    await waitForProcessExit(edge, 5000);

    assert.deepEqual(pageErrors.errors, [], `dashboard console/dialog errors: ${pageErrors.errors.join(' | ')}`);
    assertRequestAudit(requestAudit, { fixtureMode: !liveOutputMode });
    for (const { viewport, state } of states) {
      assertDashboardState(state, viewport, liveExpected);
    }
    for (const { viewport, state } of attachmentFailureStates) {
      assertAttachmentIntegrityFailureState(state, viewport);
    }

    const liveMetrics = liveExpected ? (() => {
      const livePostChecksPassed = liveExpected.postChecks.filter(check => check.pass === true).length;
      const historyLatest = liveExpected.history.items[0] || {};
      const historyRuns = Array.from(new Set(liveExpected.postChecks.map(check => String(check.historyLog || '').match(/history[\\/](\d{8}-\d{6})[\\/]/)?.[1]).filter(Boolean)));
      return ', liveRunId=' + liveExpected.summary.runId + ', livePostChecks=' + livePostChecksPassed + '/' + liveExpected.postChecks.length + ', liveHistoryPostChecks=' + (historyLatest.postChecksPassedCount ?? '-') + '/' + (historyLatest.postCheckCount ?? '-') + ', livePostCheckHistoryRuns=' + (historyRuns.join('|') || '-');
    })() : '';
    console.log('audit dashboard browser smoke OK (mode=' + (liveOutputMode ? 'live-output' : 'fixture') + ', viewports=' + states.length + ', attachmentFailureViewports=' + attachmentFailureStates.length + ', records=' + states[0].state.rows + ', latestLinks=' + states[0].state.latestLinks + ', historyLinks=' + states[0].state.historyLinks + ', modes=' + states[0].state.records.filter(record => record.mode).length + ', workdirs=' + states[0].state.records.filter(record => record.workdir).length + ', commandHashes=' + states[0].state.records.filter(record => record.commandHash).length + ', coverageTotals=' + states[0].state.coverageTotals.length + ', traceabilityCatalogs=' + states[0].state.traceabilityCatalogCoverage.length + ', freshnessChecked=' + (states[0].state.freshness ? 1 : 0) + ', maturityPreflightChecked=' + (states[0].state.maturityPreflightHint ? 1 : 0) + ', fixtureHits=' + requestAudit.fixtureHits.size + '/' + requiredFixturePaths.size + ', staticFiles=' + requestAudit.fileHits.size + liveMetrics + ')');
  } finally {
    if (client) client.close();
    if (edge && edge.exitCode === null) {
      edge.kill();
      await waitForProcessExit(edge, 5000);
    }
    if (server) await new Promise(resolve => server.close(resolve));
    await removeDirectoryBestEffort(userDataDir);
  }
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
