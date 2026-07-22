'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Builder = require('./attachment-package-build.js');
const Index = require('./attachment-package-upgrade-history-index.js');

const PUBLICATION_KIND = 'formal-attachment-package-upgrade-history-baseline-publication.v1';
const BASELINE_DIR_NAME = '附件升級可信基準_勿附入主報告';
const BASELINE_BOUNDARY_INSTRUCTION = '本基準僅供案件內部歷程完整性比對，不得放入計算書、主報告或正式附件包，亦不代表附件正式核可。';

function samePath(left, right) {
  const normalize = value => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  return normalize(left) === normalize(right);
}

function defaultOutputPath(historyDir, index) {
  const directory = path.join(path.dirname(path.resolve(historyDir)), BASELINE_DIR_NAME);
  const token = Builder.timestampToken(index.generatedAt);
  return path.join(directory, `附件升級歷程可信基準-${token}-${index.collectionFingerprint}.json`);
}

function nearestExistingAncestor(candidate) {
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`找不到可信基準輸出位置的既有上層資料夾：${candidate}`);
    current = parent;
  }
  return current;
}

function validatePhysicalDirectory(directory, label) {
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label}必須是實體資料夾，不得為連結或其他特殊項目：${directory}`);
  }
  const realPath = (fs.realpathSync.native || fs.realpathSync)(directory);
  if (!samePath(realPath, directory)) {
    throw new Error(`${label}不得透過符號連結或目錄連接重新導向：${directory}`);
  }
  return realPath;
}

function validateOutputPath(historyDir, outputPath) {
  const resolvedHistory = path.resolve(historyDir);
  const resolvedOutput = path.resolve(outputPath || '');
  if (!outputPath || path.extname(resolvedOutput).toLowerCase() !== '.json') {
    throw new Error('可信基準輸出必須是歷程外的新 JSON 檔。');
  }
  const outputDirectory = path.dirname(resolvedOutput);
  if (Builder.isPathInside(resolvedHistory, outputDirectory)
      || Builder.isPathInside(outputDirectory, resolvedHistory)) {
    throw new Error('可信基準輸出資料夾不得位於歷程內，也不得包住歷程資料夾。');
  }
  if (fs.existsSync(resolvedOutput)) {
    throw new Error(`可信基準已存在，不得覆寫：${resolvedOutput}`);
  }
  const ancestor = nearestExistingAncestor(outputDirectory);
  validatePhysicalDirectory(ancestor, '可信基準輸出的既有上層');
  return { resolvedOutput, outputDirectory };
}

function validateStagedBaseline(stagingPath, historyDir, expectedIndex) {
  const issues = [];
  const records = Index.baselineRecords(stagingPath, historyDir, issues);
  if (!records || issues.some(item => item.level === 'error')) {
    const details = issues.map(item => item.message).join('；');
    throw new Error(`可信基準發布前自我驗證失敗${details ? `：${details}` : '。'}`);
  }
  if (records.length !== expectedIndex.receipts.length
      || Index.collectionFingerprint(records) !== expectedIndex.collectionFingerprint) {
    throw new Error('可信基準發布前自我驗證的收據數或集合指紋不一致。');
  }
}

function publishBaseline(historyDir, options = {}) {
  const resolvedHistory = path.resolve(historyDir || '');
  const index = Index.inspectHistoryDir(resolvedHistory, {
    baseline: options.baseline,
    now: options.now,
  });
  const result = {
    kind: PUBLICATION_KIND,
    status: index.status,
    published: false,
    baselinePath: '',
    collectionFingerprint: index.collectionFingerprint,
    receiptCount: index.summary.validReceipts,
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      formalApproval: false,
      instruction: BASELINE_BOUNDARY_INSTRUCTION,
    },
    index,
  };
  if (index.status !== 'valid') return result;

  const target = validateOutputPath(
    resolvedHistory,
    options.output || defaultOutputPath(resolvedHistory, index),
  );
  const outputDirectoryExisted = fs.existsSync(target.outputDirectory);
  let stagingPath = '';
  let fileHandle = null;
  const renameSync = options.renameSync || fs.renameSync;
  try {
    fs.mkdirSync(target.outputDirectory, { recursive: true });
    const realOutputDirectory = validatePhysicalDirectory(target.outputDirectory, '可信基準輸出資料夾');
    const realHistory = (fs.realpathSync.native || fs.realpathSync)(resolvedHistory);
    if (Builder.isPathInside(realHistory, realOutputDirectory)
        || Builder.isPathInside(realOutputDirectory, realHistory)) {
      throw new Error('可信基準輸出資料夾不得與歷程資料夾重疊。');
    }
    if (fs.existsSync(target.resolvedOutput)) {
      throw new Error(`可信基準已存在，不得覆寫：${target.resolvedOutput}`);
    }
    stagingPath = path.join(
      target.outputDirectory,
      `.${path.basename(target.resolvedOutput)}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`,
    );
    fileHandle = fs.openSync(stagingPath, 'wx');
    fs.writeFileSync(fileHandle, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fileHandle);
    fs.closeSync(fileHandle);
    fileHandle = null;
    validateStagedBaseline(stagingPath, resolvedHistory, index);
    if (fs.existsSync(target.resolvedOutput)) {
      throw new Error(`可信基準已存在，不得覆寫：${target.resolvedOutput}`);
    }
    renameSync(stagingPath, target.resolvedOutput);
    stagingPath = '';
    result.published = true;
    result.baselinePath = target.resolvedOutput;
    return result;
  } catch (error) {
    if (fileHandle !== null) {
      try { fs.closeSync(fileHandle); } catch {}
    }
    if (stagingPath) fs.rmSync(stagingPath, { force: true });
    if (!outputDirectoryExisted && fs.existsSync(target.outputDirectory)) {
      try { fs.rmdirSync(target.outputDirectory); } catch {}
    }
    throw error;
  }
}

function formatSummary(result) {
  if (!result.published) {
    const label = result.status === 'review' ? '需人工確認' : '完整性阻擋';
    const lines = [
      '附件升級可信基準未發布',
      `歷程狀態：${label}`,
      `集合指紋：${result.collectionFingerprint}`,
      '只有完整性為 valid 的歷程才可建立可信基準；本次沒有建立或修改任何基準檔。',
    ];
    result.index.issues.forEach(item => lines.push(`- ${item.level === 'error' ? '錯誤' : '提醒'}：${item.message}`));
    lines.push(BASELINE_BOUNDARY_INSTRUCTION);
    return lines.join('\n');
  }
  return [
    '附件升級可信基準已發布',
    `收據：${result.receiptCount}`,
    `集合指紋：${result.collectionFingerprint}`,
    `輸出：${result.baselinePath}`,
    BASELINE_BOUNDARY_INSTRUCTION,
  ].join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`參數 ${arg} 缺少路徑值。`);
      index += 1;
      return value;
    };
    if (arg === '--history') options.history = takeValue();
    else if (arg === '--baseline') options.baseline = takeValue();
    else if (arg === '--output') options.output = takeValue();
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-package-upgrade-history-baseline.js --history <外部歷程資料夾>',
    '  [--baseline <既有外部可信基準 JSON>] [--output <新的外部基準 JSON>] [--json]',
    `未指定輸出時，會在歷程旁建立 ${BASELINE_DIR_NAME}；既有檔案不得覆寫。`,
    '歷程非 valid 時不建立基準；本工具不代表附件正式核可。',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return Index.INDEX_EXIT_CODES.valid;
  }
  if (!options.history) {
    console.error(usage());
    return Index.INDEX_EXIT_CODES.error;
  }
  const result = publishBaseline(options.history, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return Index.exitCodeForStatus(result.status);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = Index.INDEX_EXIT_CODES.error;
  }
}

module.exports = {
  PUBLICATION_KIND,
  BASELINE_DIR_NAME,
  BASELINE_BOUNDARY_INSTRUCTION,
  defaultOutputPath,
  validateOutputPath,
  validateStagedBaseline,
  publishBaseline,
  formatSummary,
  parseArgs,
  usage,
};
