'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const Checker = require('./attachment-package-check.js');
const Builder = require('./attachment-package-build.js');
const Verifier = require('./attachment-package-verify.js');

const ACTIONS = new Set(['smoke', 'check', 'build', 'verify']);
const FORMAL_SOURCE_BUNDLE_SUFFIX = '.formal-source.zip';
const MAX_BUNDLE_BYTES = 320 * 1024 * 1024;
const MAX_PDF_BYTES = 256 * 1024 * 1024;
const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;
const RESULT_FILE_PREFIX = 'attachment-package-manager-result-';
const RESULT_FILE_SUFFIX = '.json';
const PROGRESS_FILE_PREFIX = 'attachment-package-manager-progress-';
const PROGRESS_FILE_SUFFIX = '.jsonl';
const BUILD_PHASES = new Set(['preparing-source', 'source-recheck', 'staging', 'self-verification', 'publishing', 'complete']);

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function sleepMilliseconds(milliseconds) {
  const duration = Number(milliseconds) || 0;
  if (duration > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, duration);
}

function parseRequestBase64(value) {
  const encoded = text(value);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error('背景工作要求格式無效。');
  }
  let request;
  try {
    request = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    throw new Error('背景工作要求無法解析。');
  }
  if (!request || Array.isArray(request) || typeof request !== 'object') throw new Error('背景工作要求必須是物件。');
  const allowed = new Set(['action', 'input', 'output', 'projectNo']);
  const unexpected = Object.keys(request).filter(key => !allowed.has(key));
  if (unexpected.length) throw new Error(`背景工作要求含未知欄位：${unexpected.join('、')}`);
  return request;
}

function resolveResultFile(value) {
  const requested = text(value);
  if (!requested) return '';
  const resolved = path.resolve(requested);
  const tempRoot = path.resolve(os.tmpdir());
  const name = path.basename(resolved);
  if (path.dirname(resolved) !== tempRoot
    || !name.startsWith(RESULT_FILE_PREFIX)
    || !name.endsWith(RESULT_FILE_SUFFIX)
    || name.length > 160) {
    throw new Error('背景工作結果檔必須是系統暫存區內的受管 JSON。');
  }
  if (fs.existsSync(resolved)) throw new Error('背景工作結果檔已存在；拒絕覆寫。');
  return resolved;
}

function emitResponse(response, resultFile = '') {
  const json = `${JSON.stringify(response)}\n`;
  if (!resultFile) {
    process.stdout.write(json);
    return;
  }
  fs.writeFileSync(resolveResultFile(resultFile), json, { encoding: 'utf8', flag: 'wx' });
}

function resolveProgressFile(value, options = {}) {
  const requested = text(value);
  if (!requested) return '';
  const resolved = path.resolve(requested);
  const tempRoot = path.resolve(os.tmpdir());
  const name = path.basename(resolved);
  if (path.dirname(resolved) !== tempRoot
    || !name.startsWith(PROGRESS_FILE_PREFIX)
    || !name.endsWith(PROGRESS_FILE_SUFFIX)
    || name.length > 160) {
    throw new Error('背景工作階段事件檔必須是系統暫存區內的受管 JSONL。');
  }
  if (fs.existsSync(resolved)) {
    const stat = fs.lstatSync(resolved);
    if (!options.allowExisting || !stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('背景工作階段事件檔已存在或不是一般檔案；拒絕使用。');
    }
  }
  return resolved;
}

function emitProgress(progressFile, phase) {
  if (!progressFile) return;
  if (!BUILD_PHASES.has(phase)) throw new Error(`不支援的正式建立階段：${phase || '(空白)'}`);
  const record = { schemaVersion: 1, phase, emittedAt: new Date().toISOString() };
  fs.appendFileSync(resolveProgressFile(progressFile, { allowExisting: true }), `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'a' });
}

function firstFingerprint(record = {}) {
  return Array.isArray(record.fingerprints) && record.fingerprints.length
    ? text(record.fingerprints[0])
    : '';
}

function documentState(record = {}, checker = Checker) {
  if ((record.draftDocumentNeedles || []).length) return '內部審閱';
  if ((record.readyDocumentNeedles || []).includes(checker.READY_DOCUMENT_CLASS_LABEL)) return '正式附件';
  return typeof checker.isDocumentClassRequired === 'function' && checker.isDocumentClassRequired(record)
    ? '未分類'
    : '來源資料';
}

function checkRecords(report = {}, checker = Checker) {
  return (report.attachments || []).map(record => ({
    file: text(record.file),
    role: text(record.type).toLowerCase() === 'json' ? '內部追溯來源' : '計算文件',
    state: documentState(record, checker),
    tool: text(record.sourceTool),
    version: text(record.toolVersion),
    fingerprint: firstFingerprint(record),
    result: (record.errors || []).length
      ? '讀取失敗'
      : record.contentBoundary?.missingGroups?.length
        ? `內容缺 ${record.contentBoundary.missingGroups.join('、')}`
        : '已讀取',
  }));
}

function verifyRecords(report = {}) {
  return (report.records || []).map(record => {
    const familyLabels = { anchor: '錨栓', rc: 'RC', formal: '共用正式 HTML' };
    const seal = record.htmlDualSeal;
    const sealResult = seal
      ? `${familyLabels[seal.family] || 'HTML'}雙封印${seal.contentStatus === 'verified' && seal.approvalStatus === 'verified' ? '已驗證' : '異常'}`
      : '';
    return {
      file: text(record.packagedFile || record.file),
      role: text(record.role || record.type),
      state: text(record.documentState || record.status),
      tool: text(record.sourceTool),
      version: text(record.toolVersion),
      fingerprint: firstFingerprint(record),
      result: [text(record.status), sealResult].filter(Boolean).join('｜'),
    };
  });
}

function dualSealSummaryLine(summary = {}) {
  const expected = Number(summary.htmlDualSealExpected || 0);
  if (!expected) return '';
  return `HTML 雙封印複驗 ${Number(summary.htmlDualSealVerified || 0)} / ${expected} 份（只顯示完成數，不輸出封印值）。`;
}

function evidenceChainSummaryLine(summary = {}) {
  const expected = Number(summary.evidenceChainExpected || 0);
  if (!expected) return '';
  return `開挖證據鏈複驗 ${Number(summary.evidenceChainVerified || 0)} / ${expected} 組（只顯示完成數，不輸出證據指紋）。`;
}

function issueRecords(report = {}) {
  return (report.issues || []).map(issue => ({
    level: text(issue.level),
    code: text(issue.code),
    message: text(issue.message),
    files: Array.isArray(issue.files) ? issue.files.map(text).filter(Boolean) : [],
  }));
}

function suggestedProjectNo(report = {}) {
  const values = [...new Set(
    (report.attachments || []).map(record => text(record.projectNo)).filter(Boolean),
  )];
  return values.length === 1 ? values[0] : '';
}

function requireInput(options = {}) {
  const input = path.resolve(text(options.input));
  if (!text(options.input)) throw new Error('尚未選擇附件來源資料夾或 PDF＋證據來源 ZIP。');
  if (!fs.existsSync(input)) throw new Error(`附件來源不存在：${input}`);
  return input;
}

function bundleStem(bundlePath) {
  const name = path.basename(bundlePath);
  if (!name.endsWith(FORMAL_SOURCE_BUNDLE_SUFFIX)) return '';
  return name.slice(0, -FORMAL_SOURCE_BUNDLE_SUFFIX.length);
}

function expectedBundleEntries(bundlePath) {
  const stem = bundleStem(bundlePath);
  if (!stem || stem === '.' || stem === '..') {
    throw new Error(`PDF＋證據來源 ZIP 檔名必須以 ${FORMAL_SOURCE_BUNDLE_SUFFIX} 結尾，且前方須有 PDF 名稱。`);
  }
  return [`${stem}.pdf`, `${stem}.canonical-render.evidence.json`];
}

function runTar(args, options = {}) {
  const result = childProcess.spawnSync('tar', args, {
    windowsHide: true,
    encoding: options.encoding,
    maxBuffer: options.maxBuffer,
  });
  if (result.error) throw new Error(`無法讀取 PDF＋證據來源 ZIP：${result.error.message || result.error}`);
  if (result.status !== 0) {
    const detail = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : text(result.stderr);
    throw new Error(`PDF＋證據來源 ZIP 無法讀取${detail ? `：${detail.trim()}` : '。'}`);
  }
  return result.stdout;
}

function listBundleEntries(bundlePath) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    '$previous = [Console]::OutputEncoding',
    'try {',
    '  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
    '  $archive = [System.IO.Compression.ZipFile]::OpenRead($env:CODEX_FORMAL_SOURCE_ZIP)',
    '  try {',
    "    @($archive.Entries | ForEach-Object { [pscustomobject]@{ name = $_.FullName; length = $_.Length; compressedLength = $_.CompressedLength } }) | ConvertTo-Json -Compress",
    '  } finally { $archive.Dispose() }',
    '} finally { [Console]::OutputEncoding = $previous }',
  ].join('\n');
  const result = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 256 * 1024,
    env: { ...process.env, CODEX_FORMAL_SOURCE_ZIP: bundlePath },
  });
  if (result.error || result.status !== 0) {
    const detail = text(result.stderr || result.error?.message || result.error);
    throw new Error(`PDF＋證據來源 ZIP 中央目錄無法讀取${detail ? `：${detail}` : '。'}`);
  }
  try {
    const parsed = JSON.parse(String(result.stdout || '').replace(/^\uFEFF/, '').trim() || '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    throw new Error(`PDF＋證據來源 ZIP 中央目錄格式無法解析：${error.message || error}`);
  }
}

function validateBundleEntries(bundlePath, entries) {
  const expected = expectedBundleEntries(bundlePath);
  const normalized = Array.isArray(entries)
    ? entries.map(entry => typeof entry === 'string' ? { name: entry, length: 1 } : entry)
    : [];
  if (normalized.length !== expected.length
    || normalized.some((entry, index) => entry?.name !== expected[index])) {
    throw new Error(`PDF＋證據來源 ZIP 必須依序且只含根目錄兩檔：${expected.join('、')}。`);
  }
  const limits = [MAX_PDF_BYTES, MAX_EVIDENCE_BYTES];
  normalized.forEach((entry, index) => {
    const length = Number(entry.length);
    if (!Number.isSafeInteger(length) || length <= 0 || length > limits[index]) {
      throw new Error(`PDF＋證據來源 ZIP 檔案大小不允許：${expected[index]}`);
    }
  });
  return expected;
}

function readBundleEntry(bundlePath, entry, maxBytes) {
  const output = runTar(['-xOf', bundlePath, entry], { encoding: null, maxBuffer: maxBytes + 1 });
  if (!Buffer.isBuffer(output)) throw new Error(`PDF＋證據來源 ZIP 無法回讀：${entry}`);
  if (!output.length || output.length > maxBytes) {
    throw new Error(`PDF＋證據來源 ZIP 檔案大小不允許：${entry}`);
  }
  return output;
}

function extractFormalSourceBundle(bundlePath) {
  const stat = fs.lstatSync(bundlePath);
  if (!stat.isFile()) throw new Error(`PDF＋證據來源 ZIP 不是一般檔案：${bundlePath}`);
  if (!bundleStem(bundlePath)) throw new Error(`附件來源不是資料夾或 ${FORMAL_SOURCE_BUNDLE_SUFFIX}：${bundlePath}`);
  if (!stat.size || stat.size > MAX_BUNDLE_BYTES) throw new Error('PDF＋證據來源 ZIP 檔案大小不允許。');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `formal-source-${process.pid}-`));
  const tempDir = path.join(tempRoot, 'source');
  const archiveCopy = path.join(tempRoot, 'source.zip');
  try {
    fs.mkdirSync(tempDir);
    fs.copyFileSync(bundlePath, archiveCopy, fs.constants.COPYFILE_EXCL);
    if (fs.statSync(archiveCopy).size !== stat.size) throw new Error('PDF＋證據來源 ZIP 複製期間發生變更。');
    const entries = validateBundleEntries(bundlePath, listBundleEntries(archiveCopy));
    const limits = [MAX_PDF_BYTES, MAX_EVIDENCE_BYTES];
    entries.forEach((entry, index) => {
      const bytes = readBundleEntry(archiveCopy, entry, limits[index]);
      fs.writeFileSync(path.join(tempDir, entry), bytes, { flag: 'wx' });
    });
    const extracted = fs.readdirSync(tempDir).sort();
    const expected = [...entries].sort();
    if (JSON.stringify(extracted) !== JSON.stringify(expected)
      || extracted.some(entry => !fs.lstatSync(path.join(tempDir, entry)).isFile())) {
      throw new Error('PDF＋證據來源 ZIP 安全展開後的檔案清單不符。');
    }
    return { input: tempDir, cleanupRoot: tempRoot, originalInput: bundlePath, inputKind: 'formal-source-zip', stem: bundleStem(bundlePath) };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function resolveInput(action, options = {}) {
  const input = requireInput(options);
  const stat = fs.lstatSync(input);
  if (stat.isDirectory()) return { input, originalInput: input, inputKind: 'directory', stem: path.basename(input) };
  if (action === 'verify') throw new Error('驗證既有正式附件包必須選擇資料夾，不接受來源 ZIP。');
  return extractFormalSourceBundle(input);
}

function cleanupResolvedInput(resolved) {
  if (resolved?.inputKind === 'formal-source-zip' && resolved.input) {
    fs.rmSync(resolved.cleanupRoot || resolved.input, { recursive: true, force: true });
  }
}

function sourceDisplayPrefix(resolved) {
  return resolved?.inputKind === 'formal-source-zip'
    ? '來源：PDF＋證據來源 ZIP（已在隔離暫存區安全讀取；ZIP 本身不是正式附件包）。\n'
    : '';
}

function checkResponse(report, checker = Checker) {
  return {
    action: 'check',
    status: report.status,
    title: report.status === 'ready' ? '附件來源可建立正式附件包' : report.status === 'review' ? '附件來源需人工確認' : '附件來源已阻擋',
    canBuild: report.status === 'ready',
    built: false,
    outputDir: '',
    packageFingerprint: '',
    suggestedProjectNo: suggestedProjectNo(report),
    suggestedOutputDir: '',
    counts: {
      attachments: Number(report.summary?.attachments || 0),
      errors: Number(report.summary?.errors || 0),
      warnings: Number(report.summary?.warnings || 0),
      fingerprintLinks: Number(report.fingerprintLinks?.length || 0),
    },
    records: checkRecords(report, checker),
    issues: issueRecords(report),
    displayText: checker.formatSummary(report),
  };
}

function buildResponse(result, checker = Checker) {
  const report = result.report || {};
  const lines = [checker.formatSummary(report)];
  if (result.built) {
    lines.push(`正式附件包已建立：${result.outputDir}`);
    lines.push(`正式附件 ${result.formalAttachmentCount} 份；內部追溯來源 ${result.traceabilitySourceCount} 份。`);
    lines.push(`附件包指紋：${result.packageFingerprint}`);
    lines.push('發布前完整性與工程內容驗證：通過。');
    lines.push(dualSealSummaryLine(result.selfVerification?.summary));
    lines.push(evidenceChainSummaryLine(result.selfVerification?.summary));
  } else {
    lines.push('未建立正式附件包。');
  }
  return {
    action: 'build',
    status: result.status,
    title: result.built ? '正式附件包已建立並完成自我驗證' : result.status === 'review' ? '尚待人工確認，未建立附件包' : '組包條件未通過',
    canBuild: false,
    built: result.built === true,
    outputDir: text(result.outputDir),
    packageFingerprint: text(result.packageFingerprint),
    suggestedProjectNo: suggestedProjectNo(report),
    suggestedOutputDir: '',
    counts: {
      attachments: Number(report.summary?.attachments || 0),
      errors: Number(report.summary?.errors || 0),
      warnings: Number(report.summary?.warnings || 0),
      fingerprintLinks: Number(report.fingerprintLinks?.length || 0),
      htmlDualSealExpected: Number(result.selfVerification?.summary?.htmlDualSealExpected || 0),
      htmlDualSealVerified: Number(result.selfVerification?.summary?.htmlDualSealVerified || 0),
      evidenceChainExpected: Number(result.selfVerification?.summary?.evidenceChainExpected || 0),
      evidenceChainVerified: Number(result.selfVerification?.summary?.evidenceChainVerified || 0),
    },
    records: checkRecords(report, checker),
    issues: issueRecords(report),
    displayText: lines.filter(Boolean).join('\n'),
  };
}

function verifyResponse(report, verifier = Verifier) {
  return {
    action: 'verify',
    status: report.status,
    title: report.status === 'ready' ? '正式附件包驗證通過' : report.status === 'review' ? '附件包需人工確認' : '附件包完整性驗證已阻擋',
    canBuild: false,
    built: false,
    outputDir: '',
    packageFingerprint: text(report.packageFingerprint),
    suggestedProjectNo: '',
    suggestedOutputDir: '',
    counts: {
      attachments: Number(report.summary?.expectedFiles || 0),
      verified: Number(report.summary?.verifiedFiles || 0),
      errors: Number(report.summary?.errors || 0),
      warnings: Number(report.summary?.warnings || 0),
      htmlDualSealExpected: Number(report.summary?.htmlDualSealExpected || 0),
      htmlDualSealVerified: Number(report.summary?.htmlDualSealVerified || 0),
      evidenceChainExpected: Number(report.summary?.evidenceChainExpected || 0),
      evidenceChainVerified: Number(report.summary?.evidenceChainVerified || 0),
    },
    records: verifyRecords(report),
    issues: issueRecords(report),
    displayText: verifier.formatSummary(report),
  };
}

function runAction(action, options = {}, dependencies = {}) {
  const checker = dependencies.Checker || Checker;
  const builder = dependencies.Builder || Builder;
  const verifier = dependencies.Verifier || Verifier;
  if (!ACTIONS.has(action)) throw new Error(`不支援的管理器動作：${action || '(空白)'}`);
  if (action === 'smoke') {
    sleepMilliseconds(options.smokeDelayMs);
    return {
      action,
      status: 'ready',
      title: '附件包管理器核心可用',
      canBuild: false,
      built: false,
      outputDir: '',
      packageFingerprint: '',
      suggestedProjectNo: '',
      suggestedOutputDir: '',
      counts: { modules: 3 },
      records: [],
      issues: [],
      displayText: '檢查、正式組包與事後驗證核心均已載入。',
    };
  }

  const onProgress = typeof dependencies.onProgress === 'function' ? dependencies.onProgress : () => {};
  if (action === 'build') onProgress('preparing-source');
  const resolved = resolveInput(action, options);
  try {
    sleepMilliseconds(options.smokeDelayMs);
    let response;
    if (action === 'check') {
      response = checkResponse(checker.checkPackage(resolved.input, { projectNo: text(options.projectNo) }), checker);
      if (response.status === 'ready' && resolved.inputKind === 'formal-source-zip') {
        const outputSeed = path.join(path.dirname(resolved.originalInput), resolved.stem);
        response.suggestedOutputDir = text(builder.defaultOutputDir(outputSeed));
      }
    } else if (action === 'build') {
      const buildOptions = { projectNo: text(options.projectNo), onProgress };
      if (text(options.output)) buildOptions.output = path.resolve(text(options.output));
      else if (resolved.inputKind === 'formal-source-zip') {
        buildOptions.output = builder.defaultOutputDir(path.join(path.dirname(resolved.originalInput), resolved.stem));
      }
      response = buildResponse(builder.buildPackage(resolved.input, buildOptions), checker);
    } else {
      response = verifyResponse(verifier.verifyPackage(resolved.input), verifier);
    }
    response.inputKind = resolved.inputKind;
    response.displayText = `${sourceDisplayPrefix(resolved)}${response.displayText}`;
    return response;
  } finally {
    cleanupResolvedInput(resolved);
  }
}

function parseArgs(argv = []) {
  let options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--action') options.action = argv[++index];
    else if (arg === '--input') options.input = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--project-no') options.projectNo = argv[++index];
    else if (arg === '--request-base64') options = { ...options, ...parseRequestBase64(argv[++index]) };
    else if (arg === '--result-file') options.resultFile = argv[++index];
    else if (arg === '--progress-file') options.progressFile = argv[++index];
    else if (arg === '--smoke-delay-ms') options.smokeDelayMs = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  if (!Number.isFinite(Number(options.smokeDelayMs || 0)) || Number(options.smokeDelayMs || 0) < 0 || Number(options.smokeDelayMs || 0) > 5000) {
    throw new Error('背景工作測試延遲必須介於 0 至 5000 毫秒。');
  }
  return options;
}

function usageResponse() {
  return {
    action: 'help',
    status: 'ready',
    usage: 'node attachment-package-manager-worker.js --action smoke|check|build|verify [--input <資料夾或 .formal-source.zip>] [--output <輸出資料夾>] [--project-no <計畫編號>] [--progress-file <受管 JSONL>]',
  };
}

function exitCodeForResponse(response, checker = Checker) {
  if (response?.status === 'error') return checker.CLI_ERROR_EXIT_CODE;
  return checker.exitCodeForStatus(response?.status);
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const progressFile = options.progressFile ? resolveProgressFile(options.progressFile) : '';
    const response = options.help ? usageResponse() : runAction(text(options.action), options, {
      onProgress: phase => emitProgress(progressFile, phase),
    });
    emitResponse(response, options.resultFile);
    return exitCodeForResponse(response);
  } catch (error) {
    const response = {
      action: 'error',
      status: 'error',
      title: '附件包管理器執行失敗',
      canBuild: false,
      built: false,
      outputDir: '',
      packageFingerprint: '',
      suggestedProjectNo: '',
      suggestedOutputDir: '',
      counts: {},
      records: [],
      issues: [{ level: 'error', code: 'manager-error', message: text(error?.message || error), files: [] }],
      displayText: text(error?.message || error),
    };
    let resultFile = '';
    try { resultFile = parseArgs(argv).resultFile || ''; } catch { /* fall back to stdout */ }
    try { emitResponse(response, resultFile); } catch { process.stdout.write(`${JSON.stringify(response)}\n`); }
    return Checker.CLI_ERROR_EXIT_CODE;
  }
}

module.exports = {
  ACTIONS,
  RESULT_FILE_PREFIX,
  RESULT_FILE_SUFFIX,
  PROGRESS_FILE_PREFIX,
  PROGRESS_FILE_SUFFIX,
  BUILD_PHASES,
  text,
  sleepMilliseconds,
  parseRequestBase64,
  resolveResultFile,
  emitResponse,
  resolveProgressFile,
  emitProgress,
  firstFingerprint,
  documentState,
  checkRecords,
  verifyRecords,
  dualSealSummaryLine,
  issueRecords,
  suggestedProjectNo,
  requireInput,
  bundleStem,
  expectedBundleEntries,
  listBundleEntries,
  validateBundleEntries,
  readBundleEntry,
  extractFormalSourceBundle,
  resolveInput,
  cleanupResolvedInput,
  sourceDisplayPrefix,
  checkResponse,
  buildResponse,
  verifyResponse,
  runAction,
  parseArgs,
  usageResponse,
  exitCodeForResponse,
  main,
};

if (require.main === module) process.exitCode = main();
