'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Checker = require('./attachment-package-check.js');
const Builder = require('./attachment-package-build.js');
const History = require('./attachment-package-upgrade-history.js');
const Portfolio = require('./attachment-case-governance-portfolio.js');
const Compare = require('./attachment-case-governance-portfolio-compare.js');

const SNAPSHOT_PUBLICATION_KIND = 'formal-attachment-case-governance-portfolio-snapshot-publication.v1';
const SNAPSHOT_BOUNDARY_INSTRUCTION = '本檔僅保存完整多案件附件治理總覽，供內部跨期比較；不得放入計算書、主報告或正式附件包，不代表正式附件核可、版本前進或數位簽章，亦不得發布至 Pages。';

function samePath(left, right) {
  const normalize = value => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  return normalize(left) === normalize(right);
}

function nearestExistingAncestor(candidate) {
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`找不到快照輸出位置的既有上層資料夾：${candidate}`);
    current = parent;
  }
  return current;
}

function validatePhysicalDirectory(directory, label) {
  const resolved = path.resolve(directory);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label}必須是實體資料夾，不得為連結或特殊項目。`);
  const realPath = (fs.realpathSync.native || fs.realpathSync)(resolved);
  if (!samePath(realPath, resolved)) throw new Error(`${label}不得透過符號連結或目錄連接重新導向。`);
  return realPath;
}

function timestampToken(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('無法建立治理快照時間。');
  const iso = date.toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}-${iso.slice(20, 23)}Z`;
}

function snapshotFileName(snapshot) {
  Compare.validateSnapshot(snapshot, '待保存總覽');
  return `portfolio-${timestampToken(snapshot.generatedAt)}-${snapshot.portfolioFingerprint}.json`;
}

function validateStorageRoot(parentDir, storageRoot) {
  const resolvedParent = path.resolve(parentDir || '');
  const resolvedStorage = path.resolve(storageRoot || '');
  if (!storageRoot) throw new Error('必須指定內部治理快照資料夾。');
  if (Builder.isPathInside(resolvedParent, resolvedStorage) || Builder.isPathInside(resolvedStorage, resolvedParent)) {
    throw new Error('內部治理快照資料夾不得位於案件上層內，也不得包住案件上層。');
  }
  validatePhysicalDirectory(nearestExistingAncestor(resolvedStorage), '快照輸出的既有上層');
  return resolvedStorage;
}

function sourceGuard(parentDir) {
  const scan = Portfolio.scanPortfolio(parentDir);
  return {
    signature: Portfolio.scanSignature(scan),
    candidates: Portfolio.governanceCandidateSnapshots(scan),
  };
}

function sourceGuardUnchanged(parentDir, guard) {
  try {
    const current = Portfolio.scanPortfolio(parentDir);
    return History.canonicalJson(Portfolio.scanSignature(current)) === History.canonicalJson(guard.signature)
      && Portfolio.snapshotsUnchanged(guard.candidates);
  } catch (error) {
    return false;
  }
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function captureSnapshot(parentDir, storageRoot, options = {}) {
  const generatedAt = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('無法建立治理快照時間。');
  const inspectPortfolio = options.inspectPortfolio || Portfolio.inspectPortfolio;
  const snapshot = inspectPortfolio(parentDir, { now: generatedAt });
  Compare.validateSnapshot(snapshot, '完整治理總覽');
  const result = {
    schemaVersion: 1,
    kind: SNAPSHOT_PUBLICATION_KIND,
    generatedAt: snapshot.generatedAt,
    status: snapshot.status,
    published: false,
    storageDirectoryName: '',
    snapshotFileName: '',
    snapshotSha256: '',
    portfolioFingerprint: snapshot.portfolioFingerprint,
    caseCount: snapshot.discovery.caseCount,
    boundary: {
      classification: 'internal-governance-snapshot-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      pagesPublication: false,
      instruction: SNAPSHOT_BOUNDARY_INSTRUCTION,
    },
  };
  if (snapshot.issues.some(item => item.code === 'portfolio-changed-during-read')) return result;

  const resolvedStorage = validateStorageRoot(parentDir, storageRoot);
  const fileName = snapshotFileName(snapshot);
  const targetPath = path.join(resolvedStorage, fileName);
  const storageExisted = fs.existsSync(resolvedStorage);
  let stagingPath = '';
  let stagingHandle = null;
  let publishedPath = '';
  const linkSync = options.linkSync || fs.linkSync;
  const readSnapshotFile = options.readSnapshotFile || Compare.readSnapshotFile;
  try {
    fs.mkdirSync(resolvedStorage, { recursive: true });
    const realStorage = validatePhysicalDirectory(resolvedStorage, '內部治理快照資料夾');
    if (!samePath(realStorage, resolvedStorage)) throw new Error('內部治理快照資料夾解析結果不一致。');
    if (fs.existsSync(targetPath)) throw new Error(`同名治理快照已存在，不得覆寫：${fileName}`);
    stagingPath = path.join(resolvedStorage, `.${fileName}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    stagingHandle = fs.openSync(stagingPath, 'wx');
    fs.writeFileSync(stagingHandle, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    fs.fsyncSync(stagingHandle);
    fs.closeSync(stagingHandle);
    stagingHandle = null;
    if (typeof options.beforeValidate === 'function') options.beforeValidate({ stagingPath, targetPath, snapshot });
    const staged = readSnapshotFile(stagingPath, '暫存治理快照');
    if (History.canonicalJson(staged.snapshot) !== History.canonicalJson(snapshot)) throw new Error('治理快照發布前自我驗證內容不一致。');

    const confirmed = inspectPortfolio(parentDir, { now: generatedAt });
    Compare.validateSnapshot(confirmed, '發布前治理總覽');
    if (History.canonicalJson(confirmed) !== History.canonicalJson(snapshot)) throw new Error('治理快照發布前案件狀態已改變。');
    const guard = sourceGuard(parentDir);
    if (typeof options.beforePublish === 'function') options.beforePublish({ stagingPath, targetPath, snapshot });
    validatePhysicalDirectory(resolvedStorage, '內部治理快照資料夾');
    if (!sourceGuardUnchanged(parentDir, guard)) throw new Error('治理快照發布前案件來源已改變。');
    if (fs.existsSync(targetPath)) throw new Error(`同名治理快照已存在，不得覆寫：${fileName}`);
    linkSync(stagingPath, targetPath);
    publishedPath = targetPath;
    fs.unlinkSync(stagingPath);
    stagingPath = '';

    const published = readSnapshotFile(targetPath, '已保存治理快照');
    if (History.canonicalJson(published.snapshot) !== History.canonicalJson(snapshot)) throw new Error('已保存治理快照自我驗證內容不一致。');
    if (typeof options.afterPublish === 'function') options.afterPublish({ targetPath, snapshot });
    if (!sourceGuardUnchanged(parentDir, guard)) throw new Error('治理快照發布期間案件來源已改變。');
    result.published = true;
    result.storageDirectoryName = path.basename(resolvedStorage);
    result.snapshotFileName = fileName;
    result.snapshotSha256 = sha256File(targetPath);
    publishedPath = '';
    return result;
  } catch (error) {
    if (stagingHandle !== null) {
      try { fs.closeSync(stagingHandle); } catch {}
    }
    if (stagingPath) {
      try { fs.rmSync(stagingPath, { force: true }); } catch {}
    }
    if (publishedPath) {
      try { fs.rmSync(publishedPath, { force: true }); } catch {}
    }
    if (!storageExisted && fs.existsSync(resolvedStorage)) {
      try { fs.rmdirSync(resolvedStorage); } catch {}
    }
    throw error;
  }
}

function formatSummary(result) {
  if (!result.published) return [
    '多案件附件治理快照未保存',
    `狀態：${result.status}`,
    `批次指紋：${result.portfolioFingerprint}`,
    '批次總覽讀取期間發生變更；本次沒有建立快照檔。',
    SNAPSHOT_BOUNDARY_INSTRUCTION,
  ].join('\n');
  return [
    '多案件附件治理快照已安全保存',
    `狀態：${result.status}`,
    `案件：${result.caseCount}`,
    `批次指紋：${result.portfolioFingerprint}`,
    `快照：${result.snapshotFileName}`,
    `SHA-256：${result.snapshotSha256}`,
    SNAPSHOT_BOUNDARY_INSTRUCTION,
  ].join('\n');
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--parent' || arg === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`參數 ${arg} 缺少路徑值。`);
      options[arg.slice(2)] = value;
      index += 1;
    } else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '用法：node attachment-case-governance-portfolio-snapshot.js --parent <案件上層資料夾> --output <內部治理快照資料夾> [--json]',
    '輸出資料夾必須與案件上層完全分離；同名快照永不覆寫。',
    '完整快照寫入後會重新驗證；來源在發布期間改變時不保存或撤回。',
    SNAPSHOT_BOUNDARY_INSTRUCTION,
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(usage()); return Checker.PACKAGE_STATUS_EXIT_CODES.ready; }
  if (!options.parent || !options.output) { console.error(usage()); return Checker.CLI_ERROR_EXIT_CODE; }
  const result = captureSnapshot(options.parent, options.output, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return Checker.exitCodeForStatus(result.status);
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(error.message || error);
    process.exitCode = Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  SNAPSHOT_PUBLICATION_KIND,
  SNAPSHOT_BOUNDARY_INSTRUCTION,
  samePath,
  nearestExistingAncestor,
  validatePhysicalDirectory,
  timestampToken,
  snapshotFileName,
  validateStorageRoot,
  sourceGuard,
  sourceGuardUnchanged,
  sha256File,
  captureSnapshot,
  formatSummary,
  parseArgs,
  usage,
  main,
};
