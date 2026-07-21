'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');

const FORMAL_ATTACHMENTS_DIR = '01_正式附件';
const INTERNAL_TRACE_DIR = '99_內部追溯_勿附入主報告';
const TRACE_SOURCES_DIR = '來源資料';
const PACKAGE_MANIFEST_FILE = '附件包清單.json';
const INTERNAL_README_FILE = 'README.txt';

function timestampToken(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('無法建立附件包時間戳記。');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

function defaultOutputDir(inputDir, now = new Date()) {
  const resolvedInput = path.resolve(inputDir || '');
  return path.join(path.dirname(resolvedInput), `${path.basename(resolvedInput)}-正式附件包-${timestampToken(now)}`);
}

function isPathInside(parentDir, candidatePath) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function validateBuildPaths(inputDir, outputDir) {
  const resolvedInput = path.resolve(inputDir || '');
  const resolvedOutput = path.resolve(outputDir || '');
  if (!fs.existsSync(resolvedInput) || !fs.statSync(resolvedInput).isDirectory()) {
    throw new Error(`附件資料夾不存在：${resolvedInput || inputDir || '(未指定)'}`);
  }
  if (isPathInside(resolvedInput, resolvedOutput)) {
    throw new Error('正式附件包輸出位置不得位於來源附件資料夾內。');
  }
  if (fs.existsSync(resolvedOutput)) {
    throw new Error(`正式附件包輸出位置已存在，為避免混入舊檔案而停止：${resolvedOutput}`);
  }
  return { resolvedInput, resolvedOutput };
}

function isFormalAttachment(record = {}) {
  return String(record.type || '').toLowerCase() !== 'json'
    && Checker.isDocumentClassRequired(record)
    && (record.readyDocumentNeedles || []).includes(Checker.READY_DOCUMENT_CLASS_LABEL)
    && !(record.draftDocumentNeedles || []).length;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function safeSourcePath(inputDir, relativeFile) {
  const sourcePath = path.resolve(inputDir, relativeFile);
  if (!isPathInside(inputDir, sourcePath)) throw new Error(`附件路徑超出來源資料夾：${relativeFile}`);
  return sourcePath;
}

function copyRecord(record, inputDir, stagingDir, packageRoot) {
  const sourcePath = safeSourcePath(inputDir, record.file);
  const packagedFile = path.join(packageRoot, record.file);
  const targetPath = path.resolve(stagingDir, packagedFile);
  if (!isPathInside(stagingDir, targetPath)) throw new Error(`附件輸出路徑超出組包資料夾：${record.file}`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  const sourceHash = sha256File(sourcePath);
  const targetHash = sha256File(targetPath);
  if (sourceHash !== targetHash) throw new Error(`附件複製後雜湊不一致：${record.file}`);
  return {
    packagedFile: packagedFile.split(path.sep).join('/'),
    bytes: fs.statSync(targetPath).size,
    sha256: targetHash,
    sourceTool: record.sourceTool,
    toolVersion: record.toolVersion,
    outputTime: record.outputTime,
    fingerprints: [...(record.fingerprints || [])],
  };
}

function addBuildBlock(report, code, message, files = []) {
  const issues = [...(report.issues || []), { level: 'error', code, message, files }];
  return {
    ...report,
    status: 'blocked',
    summary: { ...report.summary, errors: Number(report.summary?.errors || 0) + 1 },
    issues,
  };
}

function packageFingerprint(formalAttachments, traceabilitySources) {
  const stableRecords = [...formalAttachments, ...traceabilitySources]
    .map(record => ({ packagedFile: record.packagedFile, bytes: record.bytes, sha256: record.sha256 }))
    .sort((left, right) => left.packagedFile.localeCompare(right.packagedFile, 'zh-Hant'));
  return `PKG-${crypto.createHash('sha256').update(JSON.stringify(stableRecords)).digest('hex').slice(0, 24).toUpperCase()}`;
}

function resolveProjectNo(report) {
  if (report.expectedProjectNo) return report.expectedProjectNo;
  const values = [...new Set((report.attachments || []).map(record => String(record.projectNo || '').trim()).filter(Boolean))];
  return values.length === 1 ? values[0] : '';
}

function summarizeVerificationFailure(verification) {
  const messages = (verification?.issues || []).map(issue => issue.message).filter(Boolean);
  return messages.length ? messages.slice(0, 3).join('；') : '未提供錯誤明細';
}

function portableVerificationResult(verification) {
  return {
    kind: verification.kind,
    status: verification.status,
    packageFingerprint: verification.packageFingerprint,
    summary: { ...verification.summary },
    issues: [...(verification.issues || [])],
    records: [...(verification.records || [])],
  };
}

function buildPackage(inputDir, options = {}) {
  const targetOutput = options.output || defaultOutputDir(inputDir, options.now || new Date());
  const { resolvedInput, resolvedOutput } = validateBuildPaths(inputDir, targetOutput);
  let report = Checker.checkPackage(resolvedInput, { projectNo: options.projectNo || '' });
  if (report.status !== 'ready') {
    return { kind: 'formal-attachment-package-build.v1', status: report.status, built: false, outputDir: '', report };
  }

  const formalRecords = report.attachments.filter(isFormalAttachment);
  const traceabilityRecords = report.attachments.filter(record => String(record.type || '').toLowerCase() === 'json');
  const unassignedRecords = report.attachments.filter(record => !isFormalAttachment(record) && String(record.type || '').toLowerCase() !== 'json');
  if (!formalRecords.length) {
    report = addBuildBlock(report, 'no-formal-attachments', '附件資料夾沒有明確標示「文件狀態：正式附件」的計算書；不建立空白正式附件包。');
  } else if (unassignedRecords.length) {
    report = addBuildBlock(
      report,
      'unassigned-package-role',
      `有 ${unassignedRecords.length} 個檔案無法安全分類為正式附件或來源 JSON；不自動組包。`,
      unassignedRecords.map(record => record.file),
    );
  }
  if (report.status !== 'ready') {
    return { kind: 'formal-attachment-package-build.v1', status: report.status, built: false, outputDir: '', report };
  }

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  const stagingDir = path.join(path.dirname(resolvedOutput), `.${path.basename(resolvedOutput)}.tmp-${process.pid}-${Date.now()}`);
  if (fs.existsSync(stagingDir)) throw new Error(`組包暫存位置已存在：${stagingDir}`);
  try {
    fs.mkdirSync(stagingDir, { recursive: false });
    const formalAttachments = formalRecords.map(record => copyRecord(record, resolvedInput, stagingDir, FORMAL_ATTACHMENTS_DIR));
    const traceabilitySources = traceabilityRecords.map(record => copyRecord(record, resolvedInput, stagingDir, path.join(INTERNAL_TRACE_DIR, TRACE_SOURCES_DIR)));
    const manifest = {
      schemaVersion: 1,
      kind: 'formal-attachment-package.v1',
      generatedAt: (options.now instanceof Date ? options.now : new Date(options.now || Date.now())).toISOString(),
      projectNo: resolveProjectNo(report),
      packageFingerprint: packageFingerprint(formalAttachments, traceabilitySources),
      formalAttachments,
      traceabilitySources,
      checkSummary: {
        attachments: report.summary.attachments,
        errors: report.summary.errors,
        warnings: report.summary.warnings,
        fingerprintLinks: report.fingerprintLinks.length,
      },
      boundary: {
        formalDirectory: FORMAL_ATTACHMENTS_DIR,
        internalDirectory: INTERNAL_TRACE_DIR,
        instruction: `送入主報告的檔案只取 ${FORMAL_ATTACHMENTS_DIR}；${INTERNAL_TRACE_DIR} 僅供公司內部追溯。`,
      },
    };
    const internalDir = path.join(stagingDir, INTERNAL_TRACE_DIR);
    fs.mkdirSync(internalDir, { recursive: true });
    fs.writeFileSync(path.join(internalDir, PACKAGE_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    fs.writeFileSync(
      path.join(internalDir, INTERNAL_README_FILE),
      `本資料夾僅供公司內部追溯，勿附入主報告、正式計算書或送審附件。\r\n正式交付請只取「${FORMAL_ATTACHMENTS_DIR}」內的檔案。\r\n附件包指紋：${manifest.packageFingerprint}\r\n`,
      'utf8',
    );
    const Verifier = require('./attachment-package-verify.js');
    const verification = Verifier.verifyPackage(stagingDir);
    if (verification.status !== 'ready') {
      throw new Error(`正式附件包發布前完整性驗證未通過：${summarizeVerificationFailure(verification)}`);
    }
    fs.renameSync(stagingDir, resolvedOutput);
    return {
      kind: 'formal-attachment-package-build.v1',
      status: 'ready',
      built: true,
      outputDir: resolvedOutput,
      manifestPath: path.join(resolvedOutput, INTERNAL_TRACE_DIR, PACKAGE_MANIFEST_FILE),
      formalAttachmentCount: formalAttachments.length,
      traceabilitySourceCount: traceabilitySources.length,
      packageFingerprint: manifest.packageFingerprint,
      selfVerification: portableVerificationResult(verification),
      report,
    };
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--project-no') options.projectNo = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return '用法：node attachment-package-build.js --input <附件資料夾> [--output <正式附件包資料夾>] [--project-no <計畫編號>]';
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.input) {
    console.log(usage());
    return Checker.CLI_ERROR_EXIT_CODE;
  }
  const result = buildPackage(options.input, options);
  console.log(Checker.formatSummary(result.report));
  if (!result.built) {
    console.log('未建立正式附件包。');
    return Checker.exitCodeForStatus(result.status);
  }
  console.log(`正式附件包已建立：${result.outputDir}`);
  console.log(`正式附件 ${result.formalAttachmentCount} 份；內部追溯來源 ${result.traceabilitySourceCount} 份。`);
  console.log(`附件包指紋：${result.packageFingerprint}`);
  console.log('發布前完整性驗證：通過。');
  return 0;
}

module.exports = {
  FORMAL_ATTACHMENTS_DIR,
  INTERNAL_TRACE_DIR,
  TRACE_SOURCES_DIR,
  PACKAGE_MANIFEST_FILE,
  INTERNAL_README_FILE,
  timestampToken,
  defaultOutputDir,
  isPathInside,
  validateBuildPaths,
  isFormalAttachment,
  sha256File,
  packageFingerprint,
  summarizeVerificationFailure,
  portableVerificationResult,
  buildPackage,
  parseArgs,
  usage,
};

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(`正式附件組包失敗：${error.message || error}`);
    process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
  }
}
