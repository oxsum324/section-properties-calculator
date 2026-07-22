'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Builder = require('./attachment-package-build.js');
const Checker = require('./attachment-package-check.js');

const LEGACY_MANIFEST_KIND = Builder.LEGACY_MANIFEST_KIND;
const PREVIOUS_MANIFEST_KIND = Builder.PREVIOUS_MANIFEST_KIND;
const MANIFEST_KIND = Builder.MANIFEST_KIND;
const VERIFICATION_KIND = 'formal-attachment-package-verification.v1';
const MANIFEST_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'generatedAt', 'projectNo', 'packageFingerprint',
  'formalAttachments', 'traceabilitySources', 'checkSummary', 'boundary',
]);
const CHECK_SUMMARY_FIELDS = Object.freeze(['attachments', 'errors', 'warnings', 'fingerprintLinks']);
const BOUNDARY_FIELDS = Object.freeze(['formalDirectory', 'internalDirectory', 'instruction']);
const RECORD_FIELDS = Object.freeze([
  'packagedFile', 'bytes', 'sha256', 'sourceTool', 'toolVersion',
  'outputTime', 'approvalTime', 'fingerprints',
]);

function normalizeSlash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function manifestRelativePath() {
  return `${Builder.INTERNAL_TRACE_DIR}/${Builder.PACKAGE_MANIFEST_FILE}`;
}

function readmeRelativePath() {
  return `${Builder.INTERNAL_TRACE_DIR}/${Builder.INTERNAL_README_FILE}`;
}

function portableManifestPathKey(value) {
  return String(value || '').normalize('NFC').toLocaleLowerCase('en-US');
}

function isPortableManifestPart(part) {
  if (!part || part !== part.normalize('NFC')) return false;
  if (/[<>:"|?*\u0000-\u001f]/.test(part) || /[. ]$/.test(part)) return false;
  return !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part);
}

function isSafeManifestPath(value) {
  if (typeof value !== 'string' || !value || value !== value.trim()) return false;
  if (value.includes('\\') || value.includes('\0') || value.includes(':')) return false;
  if (path.posix.isAbsolute(value) || path.posix.normalize(value) !== value) return false;
  const parts = value.split('/');
  return parts.every(part => part !== '.' && part !== '..' && isPortableManifestPart(part));
}

function parseManifestGeneratedAt(value) {
  if (typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
  return Checker.parseTraceDateTime(value);
}

function addIssue(report, code, message, files = []) {
  report.issues.push({ level: 'error', code, message, files });
}

function addWarning(report, code, message, files = []) {
  report.issues.push({ level: 'warning', code, message, files });
}

function summarizeIssues(report) {
  report.summary.errors = report.issues.filter(issue => issue.level === 'error').length;
  report.summary.warnings = report.issues.filter(issue => issue.level === 'warning').length;
  report.status = report.summary.errors ? 'blocked' : report.summary.warnings ? 'review' : 'ready';
  return report;
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonPointerPart(value) {
  return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
}

function unknownObjectFields(value, allowedFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const allowed = new Set(allowedFields);
  return Object.keys(value).filter(key => !allowed.has(key)).sort();
}

function validateKnownObjectFields(value, allowedFields, pointer, label, report) {
  const unknownFields = unknownObjectFields(value, allowedFields);
  if (!unknownFields.length) return;
  const pointers = unknownFields.map(key => `${pointer}/${jsonPointerPart(key)}`);
  addIssue(
    report,
    'unknown-manifest-field',
    `${label}含有未定義且未納入附件包指紋的欄位：${pointers.join('、')}；無法安全解讀。`,
    [manifestRelativePath()],
  );
}

function findDuplicateJsonKeys(value, maxDepth = 128) {
  const text = String(value);
  const duplicates = [];
  let index = 0;

  function fail(message) {
    throw new Error(`${message}（字元 ${index + 1}）`);
  }

  function skipWhitespace() {
    while (index < text.length && /[\u0020\u0009\u000a\u000d]/.test(text[index])) index += 1;
  }

  function parseString() {
    if (text[index] !== '"') fail('預期 JSON 字串');
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
      } else if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      } else {
        index += 1;
      }
    }
    fail('JSON 字串未結束');
  }

  function scanValue(pointer, depth) {
    if (depth > maxDepth) throw new Error(`JSON 巢狀深度超過 ${maxDepth} 層`);
    skipWhitespace();
    if (index >= text.length) fail('JSON 值不完整');

    if (text[index] === '{') {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      while (index < text.length) {
        const key = parseString();
        const childPointer = `${pointer}/${jsonPointerPart(key)}`;
        if (keys.has(key)) duplicates.push({ key, pointer: childPointer });
        else keys.add(key);
        skipWhitespace();
        if (text[index] !== ':') fail('JSON 物件欄位缺少冒號');
        index += 1;
        scanValue(childPointer, depth + 1);
        skipWhitespace();
        if (text[index] === '}') {
          index += 1;
          return;
        }
        if (text[index] !== ',') fail('JSON 物件欄位之間缺少逗號');
        index += 1;
        skipWhitespace();
      }
      fail('JSON 物件未結束');
    }

    if (text[index] === '[') {
      index += 1;
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      let itemIndex = 0;
      while (index < text.length) {
        scanValue(`${pointer}/${itemIndex}`, depth + 1);
        itemIndex += 1;
        skipWhitespace();
        if (text[index] === ']') {
          index += 1;
          return;
        }
        if (text[index] !== ',') fail('JSON 陣列項目之間缺少逗號');
        index += 1;
        skipWhitespace();
      }
      fail('JSON 陣列未結束');
    }

    if (text[index] === '"') {
      parseString();
      return;
    }

    const start = index;
    while (index < text.length && !/[\u0020\u0009\u000a\u000d,}\]]/.test(text[index])) index += 1;
    if (start === index) fail('JSON 值格式不正確');
    JSON.parse(text.slice(start, index));
  }

  scanValue('', 0);
  skipWhitespace();
  if (index !== text.length) fail('JSON 根值後仍有多餘內容');
  return duplicates;
}

function packageRootIdentity(packageDir) {
  const stat = fs.lstatSync(packageDir, { bigint: true });
  const resolveRealPath = fs.realpathSync.native || fs.realpathSync;
  return {
    isDirectory: stat.isDirectory(),
    isSymbolicLink: stat.isSymbolicLink(),
    realPath: resolveRealPath(packageDir),
    dev: stat.dev,
    ino: stat.ino,
    birthtimeMs: stat.birthtimeMs,
  };
}

function samePackageRoot(left, right) {
  return left && right
    && !right.isSymbolicLink
    && right.isDirectory
    && left.realPath === right.realPath
    && left.dev === right.dev
    && left.ino === right.ino
    && left.birthtimeMs === right.birthtimeMs;
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

function verifyPackageStability(packageDir, baselineRoot, baselineEntries, observedHashes, report) {
  const changedPaths = new Set();
  try {
    if (!samePackageRoot(baselineRoot, packageRootIdentity(packageDir))) changedPaths.add('(附件包根目錄)');
  } catch (error) {
    changedPaths.add('(附件包根目錄)');
  }
  let finalEntries;
  try {
    finalEntries = listPackageEntries(packageDir);
  } catch (error) {
    addIssue(report, 'package-changed-during-verification', `附件包在驗證期間發生變動，無法完成第二次目錄快照：${error.message || error}`, []);
    return;
  }

  for (const key of ['files', 'directories', 'symbolicLinks']) {
    const before = new Set(baselineEntries[key] || []);
    const after = new Set(finalEntries[key] || []);
    before.forEach(relativePath => { if (!after.has(relativePath)) changedPaths.add(relativePath); });
    after.forEach(relativePath => { if (!before.has(relativePath)) changedPaths.add(relativePath); });
  }

  observedHashes.forEach((baselineHash, relativePath) => {
    const absolutePath = path.resolve(packageDir, ...relativePath.split('/'));
    try {
      const stat = fs.lstatSync(absolutePath);
      if (!Builder.isPathInside(packageDir, absolutePath) || stat.isSymbolicLink() || !stat.isFile()
          || Builder.sha256File(absolutePath).toLowerCase() !== baselineHash.toLowerCase()) {
        changedPaths.add(relativePath);
      }
    } catch (error) {
      changedPaths.add(relativePath);
    }
  });

  try {
    const settledEntries = listPackageEntries(packageDir);
    for (const key of ['files', 'directories', 'symbolicLinks']) {
      const beforeHashing = new Set(finalEntries[key] || []);
      const afterHashing = new Set(settledEntries[key] || []);
      beforeHashing.forEach(relativePath => { if (!afterHashing.has(relativePath)) changedPaths.add(relativePath); });
      afterHashing.forEach(relativePath => { if (!beforeHashing.has(relativePath)) changedPaths.add(relativePath); });
    }
  } catch (error) {
    addIssue(report, 'package-changed-during-verification', `附件包在第二次雜湊期間發生變動，無法完成最終目錄快照：${error.message || error}`, []);
    return;
  }

  if (changedPaths.size) {
    const files = [...changedPaths].sort();
    addIssue(report, 'package-changed-during-verification', `附件包在驗證期間有 ${files.length} 個項目發生新增、移除、替換或內容變更；請停止同步或重新輸出後再驗證。`, files);
  }
}

function validateManifestHeader(manifest, report) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    addIssue(report, 'invalid-manifest', '附件包清單必須是 JSON 物件。', [manifestRelativePath()]);
    return;
  }
  validateKnownObjectFields(manifest, MANIFEST_FIELDS, '', '附件包清單', report);
  const isLegacyManifest = manifest.schemaVersion === 1 && manifest.kind === LEGACY_MANIFEST_KIND;
  const isPreviousManifest = manifest.schemaVersion === 2 && manifest.kind === PREVIOUS_MANIFEST_KIND;
  const isCurrentManifest = manifest.schemaVersion === 3 && manifest.kind === MANIFEST_KIND;
  if (!isLegacyManifest && !isPreviousManifest && !isCurrentManifest) {
    addIssue(report, 'unsupported-manifest-schema', `附件包清單格式不符：僅接受 v1／${LEGACY_MANIFEST_KIND}、v2／${PREVIOUS_MANIFEST_KIND} 或 v3／${MANIFEST_KIND}。`, [manifestRelativePath()]);
  } else if (isLegacyManifest || isPreviousManifest) {
    const limitation = isLegacyManifest
      ? '附件包指紋未涵蓋目前 v3 的完整追溯 metadata 與正式核可時間'
      : '附件包指紋未綁定目前 v3 要求的正式核可時間';
    addWarning(
      report,
      'legacy-manifest-review',
      `此附件包採 v${manifest.schemaVersion} 舊版清單；可依原版規則驗證完整性，但${limitation}。需人工確認；重新組包為 v3 後，才能自動判定正式附件包通過。`,
      [manifestRelativePath()],
    );
  }
  if (!Number.isFinite(parseManifestGeneratedAt(manifest.generatedAt))) {
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
  validateKnownObjectFields(manifest.boundary, BOUNDARY_FIELDS, '/boundary', '附件包分流邊界', report);
  const summaryValues = ['attachments', 'errors', 'warnings', 'fingerprintLinks']
    .map(key => manifest.checkSummary?.[key]);
  if (!manifest.checkSummary || typeof manifest.checkSummary !== 'object'
      || summaryValues.some(value => !Number.isSafeInteger(value) || value < 0)
      || manifest.checkSummary.errors !== 0 || manifest.checkSummary.warnings !== 0) {
    addIssue(report, 'invalid-check-summary', '附件包清單的組包前檢查摘要不完整或格式不正確；正式組包應為零阻擋與零提醒。', [manifestRelativePath()]);
  }
  validateKnownObjectFields(manifest.checkSummary, CHECK_SUMMARY_FIELDS, '/checkSummary', '附件包檢查摘要', report);
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
  const recordPointer = `/${role === 'formal' ? 'formalAttachments' : 'traceabilitySources'}/${index}`;
  validateKnownObjectFields(record, RECORD_FIELDS, recordPointer, `${roleLabel}清單第 ${index + 1} 筆`, report);

  const packagedFile = record.packagedFile;
  if (!isSafeManifestPath(packagedFile)) {
    addIssue(report, 'unsafe-manifest-path', `${roleLabel}清單含有不安全或未正規化的檔案路徑。`, [String(packagedFile || '(未指定)')]);
    return null;
  }
  if (!packagedFile.startsWith(expectedPrefix)) {
    addIssue(report, 'wrong-package-role', `${packagedFile} 不在指定的${roleLabel}資料夾內。`, [packagedFile]);
    return null;
  }
  const portablePathKey = portableManifestPathKey(packagedFile);
  const previousPath = seenPaths.get(portablePathKey);
  if (previousPath) {
    const exactDuplicate = previousPath === packagedFile;
    addIssue(
      report,
      exactDuplicate ? 'duplicate-manifest-path' : 'portable-path-collision',
      exactDuplicate
        ? `附件包清單重複列出 ${packagedFile}。`
        : `附件包清單的 ${previousPath} 與 ${packagedFile} 在 Windows／跨平台檔名規則下會指向相同路徑。`,
      [previousPath, packagedFile],
    );
    return null;
  }
  seenPaths.set(portablePathKey, packagedFile);

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
  if (schemaVersion >= 3 && !Number.isFinite(Checker.parseTraceDateTime(record.outputTime))) {
    addIssue(report, 'invalid-output-time', `${packagedFile} 缺少有效的輸出時間。`, [packagedFile]);
  }
  if (role === 'formal' && schemaVersion >= 3) {
    const outputEpoch = Checker.parseTraceDateTime(record.outputTime);
    const approvalEpoch = Checker.parseTraceDateTime(record.approvalTime);
    if (Number.isFinite(outputEpoch) && Number.isFinite(approvalEpoch) && approvalEpoch < outputEpoch) {
      addIssue(report, 'formal-approval-before-output', `${packagedFile} 的核可時間早於輸出時間。`, [packagedFile]);
    }
  }
  return { record, role, packagedFile };
}

function verifyRecord(packageDir, item, report, observedHashes) {
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
  observedHashes.set(item.packagedFile, actualHash);
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

function verifyReadme(packageDir, manifest, report, observedHashes) {
  const relativePath = readmeRelativePath();
  const absolutePath = path.join(packageDir, ...relativePath.split('/'));
  if (!fs.existsSync(absolutePath) || !fs.lstatSync(absolutePath).isFile()) {
    addIssue(report, 'missing-internal-readme', '附件包缺少內部追溯 README。', [relativePath]);
    return;
  }
  const buffer = fs.readFileSync(absolutePath);
  const text = buffer.toString('utf8');
  observedHashes.set(relativePath, sha256Buffer(buffer));
  const expectedText = `本資料夾僅供公司內部追溯，勿附入主報告、正式計算書或送審附件。\r\n正式交付請只取「${Builder.FORMAL_ATTACHMENTS_DIR}」內的檔案。\r\n附件包指紋：${manifest?.packageFingerprint || ''}\r\n`;
  if (text !== expectedText) {
    addIssue(report, 'readme-mismatch', '內部追溯 README 的附件邊界或附件包指紋與清單不符。', [relativePath]);
  }
}

function verifyPackage(inputDir) {
  const packageDir = path.resolve(inputDir || '');
  if (!fs.existsSync(packageDir)) {
    throw new Error(`正式附件包資料夾不存在：${packageDir || inputDir || '(未指定)'}`);
  }
  const rootIdentity = packageRootIdentity(packageDir);
  if (!rootIdentity.isDirectory && !rootIdentity.isSymbolicLink) {
    throw new Error(`正式附件包路徑不是資料夾：${packageDir}`);
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
  const observedHashes = new Map();
  if (rootIdentity.isSymbolicLink) {
    addIssue(report, 'package-root-symbolic-link', '正式附件包根目錄本身不得是符號連結或 Windows junction；請選取實際附件包資料夾。', [packageDir]);
    return summarizeIssues(report);
  }

  const manifestPath = report.manifestPath;
  if (!fs.existsSync(manifestPath) || !fs.lstatSync(manifestPath).isFile()) {
    addIssue(report, 'missing-manifest', '正式附件包缺少附件包清單。', [manifestRelativePath()]);
    return summarizeIssues(report);
  }

  let manifest;
  let manifestText;
  try {
    const manifestBuffer = fs.readFileSync(manifestPath);
    observedHashes.set(manifestRelativePath(), sha256Buffer(manifestBuffer));
    manifestText = manifestBuffer.toString('utf8');
    manifest = JSON.parse(manifestText);
  } catch (error) {
    addIssue(report, 'invalid-manifest-json', `附件包清單不是有效 JSON：${error.message || error}`, [manifestRelativePath()]);
    return summarizeIssues(report);
  }
  try {
    const duplicateKeys = findDuplicateJsonKeys(manifestText);
    if (duplicateKeys.length) {
      const shown = duplicateKeys.slice(0, 5).map(item => item.pointer).join('、');
      const remainder = duplicateKeys.length > 5 ? `，另有 ${duplicateKeys.length - 5} 項` : '';
      addIssue(
        report,
        'duplicate-manifest-json-key',
        `附件包清單含有 ${duplicateKeys.length} 個重複 JSON 欄位：${shown}${remainder}；不同解析器可能產生不同內容。`,
        [manifestRelativePath()],
      );
    }
  } catch (error) {
    addIssue(report, 'ambiguous-manifest-json', `附件包清單無法完成欄位唯一性掃描：${error.message || error}`, [manifestRelativePath()]);
  }
  validateManifestHeader(manifest, report);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return summarizeIssues(report);
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
  if (manifest.schemaVersion >= 3) {
    const packageGeneratedEpoch = parseManifestGeneratedAt(manifest.generatedAt);
    if (Number.isFinite(packageGeneratedEpoch)) formalRecords.forEach(record => {
      const approvalEpoch = Checker.parseTraceDateTime(record?.approvalTime);
      if (Number.isFinite(approvalEpoch) && approvalEpoch > packageGeneratedEpoch) {
        addIssue(report, 'package-generated-before-approval', '附件包建立時間早於正式附件核可時間。', [record.packagedFile || manifestRelativePath()]);
      }
    });
  }

  const seenPaths = new Map();
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

  validItems.forEach(item => verifyRecord(packageDir, item, report, observedHashes));
  verifyReadme(packageDir, manifest, report, observedHashes);

  const expectedFiles = new Set([manifestRelativePath(), readmeRelativePath(), ...validItems.map(item => item.packagedFile)]);
  const expectedDirs = expectedDirectories(expectedFiles);
  let entries;
  try {
    entries = listPackageEntries(packageDir);
    entries.symbolicLinks.forEach(relativePath => addIssue(report, 'unexpected-symbolic-link', `附件包含有不允許的符號連結：${relativePath}。`, [relativePath]));
    entries.files.filter(file => !expectedFiles.has(file)).forEach(file => addIssue(report, 'unexpected-file', `附件包含有清單外檔案：${file}。`, [file]));
    entries.directories.filter(directory => !expectedDirs.has(directory)).forEach(directory => addIssue(report, 'unexpected-directory', `附件包含有清單外資料夾：${directory}。`, [directory]));
    verifyPackageStability(packageDir, rootIdentity, entries, observedHashes, report);
  } catch (error) {
    addIssue(report, 'package-changed-during-verification', `附件包在驗證期間發生變動，無法完成目錄快照：${error.message || error}`, []);
  }

  report.summary.expectedFiles = validItems.length;
  report.summary.verifiedFiles = report.records.filter(record => record.status === 'verified').length;
  return summarizeIssues(report);
}

function formatSummary(report) {
  const statusLabel = report.status === 'ready' ? '通過' : report.status === 'review' ? '需人工確認' : '阻擋';
  const lines = [
    `正式附件包完整性驗證：${statusLabel}`,
    `清單檔案 ${report.summary.expectedFiles} 份；已驗證 ${report.summary.verifiedFiles} 份；阻擋 ${report.summary.errors} 項；提醒 ${report.summary.warnings} 項。`,
  ];
  if (report.packageFingerprint) lines.push(`附件包指紋：${report.packageFingerprint}`);
  report.issues.forEach(issue => lines.push(`[${issue.level === 'warning' ? '提醒' : '阻擋'}] ${issue.message}`));
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
  return Checker.exitCodeForStatus(report.status);
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
  portableManifestPathKey,
  isSafeManifestPath,
  parseManifestGeneratedAt,
  packageRootIdentity,
  samePackageRoot,
  listPackageEntries,
  expectedDirectories,
  sha256Buffer,
  jsonPointerPart,
  unknownObjectFields,
  findDuplicateJsonKeys,
  verifyPackageStability,
  summarizeIssues,
  verifyPackage,
  formatSummary,
  parseArgs,
  usage,
};
