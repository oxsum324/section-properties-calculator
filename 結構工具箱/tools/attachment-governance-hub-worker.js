'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Flow = require('./attachment-package-upgrade-flow.js');
const Assess = require('./attachment-package-upgrade-assess.js');
const Root = require('./attachment-case-governance-root.js');
const Portfolio = require('./attachment-case-governance-portfolio.js');
const Checker = require('./attachment-package-check.js');

const ADVISOR_KIND = 'attachment-governance-path-advice.v1';
const REPORT_LIKE_TYPES = new Set(['pdf', 'docx', 'xlsx', 'html', 'htm']);

function physicalDirectory(inputDir) {
  const resolved = path.resolve(String(inputDir || '').trim());
  if (!String(inputDir || '').trim()) throw new Error('尚未選擇要辨識的資料夾。');
  if (!fs.existsSync(resolved)) throw new Error(`資料夾不存在：${resolved}`);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`只接受實體資料夾，不得為連結或其他特殊項目：${resolved}`);
  }
  return resolved;
}

function recommendation(inputDir, tool, mode, title, reason, evidence = []) {
  return {
    kind: ADVISOR_KIND,
    outcome: 'matched',
    inputDir,
    recommendedTool: tool,
    recommendedMode: mode,
    title,
    reason,
    evidence,
    readOnly: true,
    changedState: false,
    autoLaunched: false,
  };
}

function candidateCount(scan) {
  return ['packages', 'histories', 'chains']
    .reduce((total, key) => total + (scan?.candidates?.[key]?.length || 0), 0);
}

function hasAttachmentSourceSignal(record) {
  const type = String(record?.type || '').trim().toLowerCase();
  if (REPORT_LIKE_TYPES.has(type)) return true;
  return Boolean(
    String(record?.sourceTool || '').trim()
    || String(record?.toolVersion || '').trim()
    || String(record?.projectNo || '').trim()
    || (Array.isArray(record?.fingerprints) && record.fingerprints.length > 0)
  );
}

function advisePath(inputDir, dependencies = {}) {
  const deps = { Flow, Assess, Root, Portfolio, Checker, ...dependencies };
  const resolved = physicalDirectory(inputDir);

  let detected = null;
  try { detected = deps.Flow.detectInputKind(resolved); } catch (_) { /* continue with other read-only recognizers */ }
  if (detected?.kind === deps.Flow.INPUT_KINDS.UPGRADE_WORKSPACE
      || detected?.kind === deps.Flow.INPUT_KINDS.PACKAGE_SOURCE) {
    return recommendation(
      resolved, 'upgrade', 'upgrade', '建議使用：舊版附件升級助手',
      detected.kind === deps.Flow.INPUT_KINDS.PACKAGE_SOURCE
        ? '此路徑是升級工作區內的組包來源資料夾。'
        : '此路徑包含舊版附件升級工作區標記。',
      [`輸入類型：${detected.kind}`],
    );
  }
  if (detected?.kind === deps.Flow.INPUT_KINDS.FORMAL_PACKAGE) {
    let assessment = null;
    try { assessment = deps.Assess.assessUpgrade(resolved); } catch (_) { /* damaged packages still belong in verify */ }
    if (assessment?.requiresUpgrade === true) {
      return recommendation(
        resolved, 'upgrade', 'upgrade', '建議使用：舊版附件升級助手',
        '既有正式附件包為可辨識的 v1／v2 格式，應走另建升級流程。',
        [`附件包版本：v${assessment.currentPackage.schemaVersion}`, `升級評估：${assessment.status}`],
      );
    }
    const version = assessment?.currentPackage?.schemaVersion;
    return recommendation(
      resolved, 'manager', 'verify', '建議使用：正式附件包管理器（驗證模式）',
      assessment
        ? '此路徑是現行或需要修復的正式附件包，適合先執行既有附件包驗證。'
        : '此路徑具有正式附件包結構；即使內容不完整，也應由既有驗證功能呈現問題。',
      [version ? `附件包版本：v${version}` : '辨識依據：正式附件包目錄結構'],
    );
  }

  try {
    const caseScan = deps.Root.scanCaseRoot(resolved);
    const count = candidateCount(caseScan);
    if (count > 0) {
      return recommendation(
        resolved, 'viewer', 'case', '建議使用：案件附件治理檢視器（單一案件）',
        '此路徑包含正式附件包、升級歷程或可信基準鏈等案件治理資料。',
        [`案件治理候選資料夾：${count}`],
      );
    }
  } catch (_) { /* continue */ }

  try {
    const portfolioScan = deps.Portfolio.scanPortfolio(resolved);
    if ((portfolioScan.cases || []).length > 0) {
      return recommendation(
        resolved, 'viewer', 'portfolio', '建議使用：案件附件治理檢視器（多案件）',
        '此路徑下辨識到多個具有附件治理訊號的案件資料夾。',
        [`案件數：${portfolioScan.cases.length}`],
      );
    }
  } catch (_) { /* continue */ }

  try {
    const check = deps.Checker.checkPackage(resolved);
    const sourceCandidates = (check?.attachments || []).filter(hasAttachmentSourceSignal);
    if (sourceCandidates.length > 0) {
      return recommendation(
        resolved, 'manager', 'source', '建議使用：正式附件包管理器（新組包模式）',
        '此路徑包含可供附件一致性檢查的計算書或具追溯欄位的來源資料。',
        [`具附件來源訊號：${sourceCandidates.length}`, `來源檢查結果：${check.status}`],
      );
    }
  } catch (_) { /* unresolved paths remain manual */ }

  return {
    kind: ADVISOR_KIND,
    outcome: 'unknown',
    inputDir: resolved,
    recommendedTool: '',
    recommendedMode: '',
    title: '無法安全判斷建議工具',
    reason: '資料夾中沒有足夠的既有附件或治理結構訊號；請依工作目的手動選擇。',
    evidence: [],
    readOnly: true,
    changedState: false,
    autoLaunched: false,
  };
}

function runAction(action, options = {}, dependencies = {}) {
  if (action === 'smoke') {
    return {
      kind: ADVISOR_KIND, outcome: 'matched', readOnly: true, changedState: false,
      autoLaunched: false, counts: { modules: 5 }, message: '附件路徑唯讀建議核心可用。',
    };
  }
  if (action !== 'advise') throw new Error(`不支援的工作台動作：${action}`);
  return advisePath(options.input, dependencies);
}

function parseArgs(argv) {
  const options = { action: 'smoke', input: '', smokeDelayMs: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--action') options.action = argv[++index] || '';
    else if (arg === '--input') options.input = argv[++index] || '';
    else if (arg === '--smoke-delay-ms') {
      options.smokeDelayMs = Number(argv[++index]);
      if (!Number.isInteger(options.smokeDelayMs) || options.smokeDelayMs < 0 || options.smokeDelayMs > 5000) {
        throw new Error('smoke-delay-ms 必須是 0 至 5000 的整數。');
      }
    }
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return '用法：node attachment-governance-hub-worker.js --action smoke|advise [--input <資料夾>]';
}

function exitCodeForResponse(response) {
  return response.outcome === 'matched' ? 0 : response.outcome === 'unknown' ? 1 : 3;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (options.smokeDelayMs > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, options.smokeDelayMs);
  }
  const response = runAction(options.action, options);
  console.log(JSON.stringify(response));
  return exitCodeForResponse(response);
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.log(JSON.stringify({
      kind: ADVISOR_KIND, outcome: 'error', message: error.message || String(error),
      readOnly: true, changedState: false, autoLaunched: false,
    }));
    process.exitCode = 3;
  }
}

module.exports = {
  ADVISOR_KIND,
  physicalDirectory,
  candidateCount,
  hasAttachmentSourceSignal,
  advisePath,
  runAction,
  parseArgs,
  usage,
  exitCodeForResponse,
};
