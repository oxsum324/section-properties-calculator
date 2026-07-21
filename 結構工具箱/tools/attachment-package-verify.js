'use strict';

const fs = require('fs');
const path = require('path');
const Builder = require('./attachment-package-build.js');
const Checker = require('./attachment-package-check.js');

const LEGACY_MANIFEST_KIND = Builder.LEGACY_MANIFEST_KIND;
const PREVIOUS_MANIFEST_KIND = Builder.PREVIOUS_MANIFEST_KIND;
const MANIFEST_KIND = Builder.MANIFEST_KIND;
const VERIFICATION_KIND = 'formal-attachment-package-verification.v1';

function normalizeSlash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function manifestRelativePath() {
  return `${Builder.INTERNAL_TRACE_DIR}/${Builder.PACKAGE_MANIFEST_FILE}`;
}

function readmeRelativePath() {
  return `${Builder.INTERNAL_TRACE_DIR}/${Builder.INTERNAL_README_FILE}`;
}

function isSafeManifestPath(value) {
  if (typeof value !== 'string' || !value || value !== value.trim()) return false;
  if (value.includes('\\') || value.includes('\0') || value.includes(':')) return false;
  if (path.posix.isAbsolute(value) || path.posix.normalize(value) !== value) return false;
  const parts = value.split('/');
  return parts.every(part => part && part !== '.' && part !== '..');
}

function addIssue(report, code, message, files = []) {
  report.issues.push({ level: 'error', code, message, files });
}

function listPackageEntries(rootDir) {
  const files = [];
  const directories = [];
  const symbolicLinks = [];

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = normalizeSlash(path.relative(rootDir, absolutePath));
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        symbolicLinks.push(relativePath);
      } else if (stat.isDirectory()) {
        directories.push(relativePath);
        walk(absolutePath);
      } else if (stat.isFile()) {
        files.push(relativePath);
      }
    }
  }

  walk(rootDir);
  return { files, directories, symbolicLinks };
}

function expectedDirectories(expectedFiles) {
  const result = new Set();
  expectedFiles.forEach(file => {
    let current = path.posix.dirname(file);
    while (current && current !== '.') {
      result.add(current);
      current = path.posix.dirname(current);
    }
  });
  return result;
}

function validateManifestHeader(manifest, report) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    addIssue(report, 'invalid-manifest', '附件包清單必須是 JSON 物件。', [manifestRelativePath()]);
    return;
  }
  const isLegacyManifest = manifest.schemaVersion === 1 && manifest.kind === LEGACY_MANIFEST_KIND;
  const isPreviousManifest = manifest.schemaVersion === 2 && manifest.kind === PREVIOUS_MANIFEST_KIND;
  const isCurrentManifest = manifest.schemaVersion === 3 && manifest.kind === MANIFEST_KIND;
  if (!isLegacyManifest && !isPreviousManifest && !isCurrentManifest) {
    addIssue(report, 'unsupported-manifest-schema', `附件包清單格式不符：僅接受 v1／${LEGACY_MANIFEST_KIND}、v2／${PREVIOUS_MANIFEST_KIND} 或 v3／${MANIFEST_KIND}。`, [manifestRelativePath()]);
  }
  if (typeof manifest.generatedAt !== 'string' || !manifest.generatedAt || !Number.isFinite(Date.parse(manifest.generatedAt))) {
    addIssue(report, 'invalid-generated-at', '附件包清單缺少有效的建立時間。', [manifestRelativePath()]);
  }
  if (typeof manifest.projectNo !== 'string') {
    addIssue(report, 'invalid-project-no', '附件包清單的計畫編號格式不正確；空白可接受，但欄位必須存在。', [manifestRelativePath()]);
  }
  if (!manifest.boundary
      || manifest.boundary.formalDirectory !== Builder.FORMAL_ATTACHMENTS_DIR
      || manifest.boundary.internalDirectory !== Builder.INTERNAL_TRACE_DIR
      || manifest.boundary.instruction !== Builder.PACKAGE_BOUNDARY_INSTRUCTION) {
    addIssue(report, 'invalid-package-boundary', '附件包清單的正式附件／內部追溯資料夾邊界不正確。', [manifestRelativePath()]);
  }
  const summaryValues = ['attachments', 'errors', 'warnings', 'fingerprintLinks']
    .map(key => manifest.checkSummary?.[key]);
  if (!manifest.checkSummary || typeof manifest.checkSummary !== 'object'
      || summaryValues.some(value => !Number.isSafeInteger(value) || value < 0)
      || manifest.checkSummary.errors !== 0 || manifest.checkSummary.warnings !== 0) {
    addIssue(report, 'invalid-check-summary', '附件包清單的組包前檢查摘要不完整或格式不正確；正式組包應為零阻擋與零提醒。', [manifestRelativePath()]);
  }
}

function validateRecord(record, role, index, report, seenPaths, schemaVersion) {
  const roleLabel = role === 'formal' ? '正式附件' : '內部追溯來源';
  const expectedPrefix = role === 'formal'
    ? `${Builder.FORMAL_ATTACHMENTS_DIR}/`
    : `${Builder.INTERNAL_TRACE_DIR}/${Builder.TRACE_SOURCES_DIR}/`;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    addIssue(report, 'invalid-manifest-record', `${roleLabel}清單第 ${index + 1} 筆不是有效物件。`, [manifestRelativePath()]);
    return null;
  }

  const packagedFile = record.packagedFile;
  if (!isSafeManifestPath(packagedFile)) {
    addIssue(report, 'unsafe-manifest-path', `${roleLabel}清單含有不安全或未正規化的檔案路徑。`, [String(packagedFile || '(未指定)')]);
    return null;
  }
  if (!packagedFile.startsWith(expectedPrefix)) {
    addIssue(report, 'wrong-package-role', `${packagedFile} 不在指定的${roleLabel}資料夾內。`, [packagedFile]);
    return null;
  }
  if (seenPaths.has(packagedFile)) {
    addIssue(report, 'duplicate-manifest-path', `附件包清單重複列出 ${packagedFile}。`, [packagedFile]);
    return null;
  }
  seenPaths.add(packagedFile);

  if (!Number.isSafeInteger(record.bytes) || record.bytes < 0) {
    addIssue(report, 'invalid-manifest-bytes', `${packagedFile} 的檔案大小紀錄不正確。`, [packagedFile]);
  }
  if (typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(record.sha256)) {
    addIssue(report, 'invalid-manifest-hash', `${packagedFile} 的 SHA-256 紀錄不正確。`, [packagedFile]);
  }
  if (typeof record.sourceTool !== 'string' || !record.sourceTool.trim()
      || typeof record.toolVersion !== 'string' || !record.toolVersion.trim()
      || typeof record.outputTime !== 'string' || !record.outputTime.trim()
      || !Array.isArray(record.fingerprints) || !record.fingerprints.length
      || record.fingerprints.some(value => typeof value !== 'string' || !value.trim())) {
    addIssue(report, 'invalid-traceability-record', `${packagedFile} 缺少產出工具、版本、輸出時間或計算指紋。`, [packagedFile]);
  }
  if (role === 'formal' && schemaVersion >= 3
      && (typeof record.approvalTime !== 'string' || !Checker.isValidApprovalTime(record.approvalTime))) {
    addIssue(report, 'invalid-formal-approval-time', `${packagedFile} 缺少有效的正式附件核可時間。`, [packagedFile]);
  }
  return { record, role, packagedFile };
}

function verifyRecord(packageDir, item, report) {
  const absolutePath = path.resolve(packageDir, ...item.packagedFile.split('/'));
  if (!Builder.isPathInside(packageDir, absolutePath)) {
    addIssue(report, 'unsafe-manifest-path', `${item.packagedFile} 超出附件包資料夾。`, [item.packagedFile]);
    return;
  }
  if (!fs.existsSync(absolutePath)) {
    addIssue(report, 'missing-file', `附件包缺少清單所列檔案：${item.packagedFile}。`, [item.packagedFile]);
    report.records.push({ packagedFile: item.packagedFile, role: item.role, status: 'missing' });
    return;
  }
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    addIssue(report, 'invalid-file-type', `${item.packagedFile} 不是一般檔案。`, [item.packagedFile]);
    report.records.push({ packagedFile: item.packagedFile, role: item.role, status: 'invalid' });
    return;
  }

  const actualHash = Builder.sha256File(absolutePath);
  let status = 'verified';
  if (stat.size !== item.record.bytes) {
    addIssue(report, 'size-mismatch', `${item.packagedFile} 的檔案大小與清單不符。`, [item.packagedFile]);
    status = 'mismatch';
  }
  if (actualHash.toLowerCase() !== String(item.record.sha256 || '').toLowerCase()) {
    addIssue(report, 'hash-mismatch', `${item.packagedFile} 的 SHA-256 與清單不符，檔案可能已被修改。`, [item.packagedFile]);
    status = 'mismatch';
  }
  report.records.push({ packagedFile: item.packagedFile, role: item.role, bytes: stat.size, sha256: actualHash, status });
}

function verifyReadme(packageDir, manifest, report) {
  const relativePath = readmeRelativePath();
  const absolutePath = path.join(packageDir, ...relativePath.split('/'));
  if (!fs.existsSync(absolutePath) || !fs.lstatSync(absolutePath).isFile()) {
    addIssue(report, 'missing-internal-readme', '附件包缺少內部追溯 README。', [relativePath]);
    return;
  }
  const text = fs.readFileSync(absolutePath, 'utf8');
  const expectedText = `本資料夾僅供公司內部追溯，勿附入主報告、正式計算書或送審附件。\r\n正式交付請只取「${Builder.FORMAL_ATTACHMENTS_DIR}」內的檔案。\r\n附件包指紋：${manifest?.packageFingerprint || ''}\r\n`;
  if (text !== expectedText) {
    addIssue(report, 'readme-mismatch', '內部追溯 README 的附件邊界或附件包指紋與清單不符。', [relativePath]);
  }
}

function verifyPackage(inputDir) {
  const packageDir = path.resolve(inputDir || '');
  if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) {
    throw new Error(`正式附件包資料夾不存在：${packageDir || inputDir || '(未指定)'}`);
  }
  const report = {
    kind: VERIFICATION_KIND,
    status: 'blocked',
    packageDir,
    manifestPath: path.join(packageDir, Builder.INTERNAL_TRACE_DIR, Builder.PACKAGE_MANIFEST_FILE),
    packageFingerprint: '',
    summary: { expectedFiles: 0, verifiedFiles: 0, errors: 0, warnings: 0 },
    issues: [],
    records: [],
  };

  const manifestPath = report.manifestPath;
  if (!fs.existsSync(manifestPath) || !fs.lstatSync(manifestPath).isFile()) {
    addIssue(report, 'missing-manifest', '正式附件包缺少附件包清單。', [manifestRelativePath()]);
    report.summary.errors = report.issues.length;
    return report;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    addIssue(report, 'invalid-manifest-json', `附件包清單不是有效 JSON：${error.message || error}`, [manifestRelativePath()]);
    report.summary.errors = report.issues.length;
    return report;
  }
  validateManifestHeader(manifest, report);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    report.summary.errors = report.issues.length;
    return report;
  }
  report.packageFingerprint = typeof manifest.packageFingerprint === 'string' ? manifest.packageFingerprint : '';

  const formalRecords = Array.isArray(manifest.formalAttachments) ? manifest.formalAttachments : [];
  const traceRecords = Array.isArray(manifest.traceabilitySources) ? manifest.traceabilitySources : [];
  if (!Array.isArray(manifest.formalAttachments)) {
    addIssue(report, 'invalid-formal-attachments', '附件包清單缺少正式附件陣列。', [manifestRelativePath()]);
  }
  if (!Array.isArray(manifest.traceabilitySources)) {
    addIssue(report, 'invalid-traceability-sources', '附件包清單缺少內部追溯來源陣列。', [manifestRelativePath()]);
  }
  if (!formalRecords.length) {
    addIssue(report, 'no-formal-attachments', '正式附件包不得沒有正式附件。', [Builder.FORMAL_ATTACHMENTS_DIR]);
  }
  if (Number.isSafeInteger(manifest.checkSummary?.attachments)
      && manifest.checkSummary.attachments !== formalRecords.length + traceRecords.length) {
    addIssue(report, 'check-summary-count-mismatch', '附件包清單的組包前附件數與正式附件及內部追溯來源筆數不符。', [manifestRelativePath()]);
  }

  const seenPaths = new Set();
  const validItems = [
    ...formalRecords.map((record, index) => validateRecord(record, 'formal', index, report, seenPaths, manifest.schemaVersion)),
    ...traceRecords.map((record, index) => validateRecord(record, 'traceability', index, report, seenPaths, manifest.schemaVersion)),
  ].filter(Boolean);

  let expectedFingerprint = '';
  try {
    expectedFingerprint = Builder.packageFingerprintForManifest(manifest);
  } catch (error) {
    expectedFingerprint = '';
  }
  if (!/^PKG-[0-9A-F]{24}$/.test(report.packageFingerprint) || report.packageFingerprint !== expectedFingerprint) {
    addIssue(report, 'package-fingerprint-mismatch', '附件包指紋與清單內容重新計算結果不符。', [manifestRelativePath()]);
  }

  validItems.forEach(item => verifyRecord(packageDir, item, report));
  verifyReadme(packageDir, manifest, report);

  const expectedFiles = new Set([manifestRelativePath(), readmeRelativePath(), ...validItems.map(item => item.packagedFile)]);
  const expectedDirs = expectedDirectories(expectedFiles);
  const entries = listPackageEntries(packageDir);
  entries.symbolicLinks.forEach(relativePath => addIssue(report, 'unexpected-symbolic-link', `附件包含有不允許的符號連結：${relativePath}。`, [relativePath]));
  entries.files.filter(file => !expectedFiles.has(file)).forEach(file => addIssue(report, 'unexpected-file', `附件包含有清單外檔案：${file}。`, [file]));
  entries.directories.filter(directory => !expectedDirs.has(directory)).forEach(directory => addIssue(report, 'unexpected-directory', `附件包含有清單外資料夾：${directory}。`, [directory]));

  report.summary.expectedFiles = validItems.length;
  report.summary.verifiedFiles = report.records.filter(record => record.status === 'verified').length;
  report.summary.errors = report.issues.length;
  report.status = report.issues.length ? 'blocked' : 'ready';
  return report;
}

function formatSummary(report) {
  const lines = [
    `正式附件包完整性驗證：${report.status === 'ready' ? '通過' : '阻擋'}`,
    `清單檔案 ${report.summary.expectedFiles} 份；已驗證 ${report.summary.verifiedFiles} 份；阻擋 ${report.summary.errors} 項。`,
  ];
  if (report.packageFingerprint) lines.push(`附件包指紋：${report.packageFingerprint}`);
  report.issues.forEach(issue => lines.push(`[阻擋] ${issue.message}`));
  lines.push('此驗證結果僅供交付與歸檔前確認，不應附入主報告。');
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return '用法：node attachment-package-verify.js --input <正式附件包資料夾>';
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
  const report = verifyPackage(options.input);
  console.log(formatSummary(report));
  return report.status === 'ready' ? 0 : Checker.PACKAGE_STATUS_EXIT_CODES.blocked;
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(`正式附件包驗證失敗：${error.message || error}`);
    process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  LEGACY_MANIFEST_KIND,
  PREVIOUS_MANIFEST_KIND,
  MANIFEST_KIND,
  VERIFICATION_KIND,
  normalizeSlash,
  manifestRelativePath,
  readmeRelativePath,
  isSafeManifestPath,
  listPackageEntries,
  expectedDirectories,
  verifyPackage,
  formatSummary,
  parseArgs,
  usage,
};
