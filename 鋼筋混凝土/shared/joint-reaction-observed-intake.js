#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Sanitizer = require('./joint-reaction-fixture-sanitizer.js');
const PromotionGate = require('./joint-reaction-fixture-promotion-gate.js');

const RECEIPT_SCHEMA = 'rc-joint-reaction-observed-intake-receipt.v1';
const REVIEW_SCHEMA = 'rc-joint-reaction-observed-review.v1';
const BROWSER_PACKAGE_SCHEMA = 'rc-joint-reaction-browser-intake-package.v1';
const EVIDENCE_SCHEMA = 'rc-joint-reaction-anonymization-evidence.v1';
const DEFAULT_MANIFEST = path.join(__dirname, 'fixtures', 'joint-reactions', 'observed-manifest.json');
const ASSERTION_KEYS = Object.freeze([
  'noProjectIdentity',
  'headersReviewed',
  'softwareVersionConfirmed',
  'tableNameConfirmed',
  'unitsConfirmed',
  'compatibilityReplayPassed',
  'nonEngineeringUseAcknowledged',
  'originalSourceExcluded',
]);

function required(value, label) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) throw new Error(`${label}不得空白。`);
  return normalized;
}

function fixtureId(value) {
  const normalized = required(value, 'fixture ID');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new Error('fixture ID 只允許小寫英數與單一連字號分段。');
  }
  return normalized;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label}無法讀取：${error.message}`);
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function packageFileName(value, label) {
  const name = required(value, label);
  if (path.basename(name) !== name || name === '.' || name === '..') throw new Error(`${label}只能是收件目錄內的檔名。`);
  return name;
}

function blankReview(fixtureIdValue, candidateSha256) {
  return {
    schemaVersion:REVIEW_SCHEMA,
    fixtureId:fixtureIdValue,
    candidateSha256,
    reviewedAt:'',
    reviewer:'',
    assertions:Object.fromEntries(ASSERTION_KEYS.map(key => [key, false])),
    notes:'人工檢查匿名候選檔後填入 reviewedAt / reviewer，並逐項將確認完成的 assertion 改為 true；不得以程式自動核可。',
  };
}

function intakeReceipt({ fixtureId:fixtureIdValue, evidence, candidateFile, evidenceFile, reviewFile }) {
  return {
    schemaVersion:RECEIPT_SCHEMA,
    status:'manual-review-required',
    fixtureId:fixtureIdValue,
    createdAt:evidence.generatedAt,
    declaredOrigin:'actual-observed',
    software:evidence.source.software,
    softwareVersion:evidence.source.softwareVersion,
    tableName:evidence.source.tableName,
    units:evidence.source.units,
    candidateFile,
    evidenceFile,
    reviewFile,
    candidateSha256:evidence.output.sha256,
    privacy:{
      sourceFileStored:false,
      sourcePathStored:false,
      sourceNameStored:false,
      sourceHashCommitted:false,
      originalNumbersStored:false,
    },
    nextAction:'人工檢查匿名候選與 review assertions；全部確認後先執行唯讀 assess，最後才可明確使用 --promote yes。',
  };
}

function siblingPath(receiptPath, fileName, label) {
  const safeName = required(fileName, label);
  if (path.basename(safeName) !== safeName) throw new Error(`${label}只能是收件目錄內的檔名。`);
  return path.join(path.dirname(receiptPath), safeName);
}

function prepareIntake(options) {
  const cfg = options && typeof options === 'object' ? options : {};
  const id = fixtureId(cfg.fixtureId);
  const outputDir = path.resolve(cfg.outputDir || path.join(__dirname, '..', '..', 'output', 'anonymized-fixtures', 'joint-reactions'));
  const inputPath = path.resolve(required(cfg.inputPath, '來源檔路徑'));
  const generatedAt = fs.statSync(inputPath).mtime.toISOString();
  const sanitized = Sanitizer.buildOutputBundle({
    raw:fs.readFileSync(inputPath, 'utf8'),
    software:required(cfg.software, '來源軟體'),
    softwareVersion:required(cfg.softwareVersion, '軟體版本'),
    units:required(cfg.units, '來源單位系統'),
    tableName:required(cfg.tableName || 'Joint Reactions', '匯出表名'),
    originKind:'actual-observed',
    sourceExtension:path.extname(inputPath).toLowerCase(),
    generatedAt,
    outputDir,
  });
  const evidence = sanitized.evidence;
  const candidateStem = path.basename(sanitized.evidencePath, '.evidence.json');
  const reviewPath = path.join(outputDir, `${candidateStem}.review.json`);
  const receiptPath = path.join(outputDir, `${candidateStem}.intake.json`);
  const review = blankReview(id, evidence.output.sha256);
  const receipt = intakeReceipt({
    fixtureId:id,
    evidence,
    candidateFile:path.basename(sanitized.sanitizedPath),
    evidenceFile:path.basename(sanitized.evidencePath),
    reviewFile:path.basename(reviewPath),
  });
  fs.mkdirSync(outputDir, { recursive:true });
  Sanitizer.writeBundleIfAbsentOrSame([
    ...sanitized.entries,
    { filePath:reviewPath, content:`${JSON.stringify(review, null, 2)}\n` },
    { filePath:receiptPath, content:`${JSON.stringify(receipt, null, 2)}\n` },
  ]);
  return {
    schemaVersion:RECEIPT_SCHEMA,
    status:receipt.status,
    fixtureId:id,
    receiptPath,
    candidatePath:sanitized.sanitizedPath,
    evidencePath:sanitized.evidencePath,
    reviewPath,
    sourceStored:false,
    manualReviewRequired:true,
  };
}

function importBrowserPackage(options) {
  const cfg = options && typeof options === 'object' ? options : {};
  const packagePath = path.resolve(required(cfg.packagePath, '瀏覽器收件包路徑'));
  if (fs.statSync(packagePath).size > 4 * 1024 * 1024) throw new Error('瀏覽器收件包超過 4 MiB 上限。');
  const packageData = readJson(packagePath, '瀏覽器收件包');
  if (packageData.schemaVersion !== BROWSER_PACKAGE_SCHEMA) throw new Error('瀏覽器收件包 schema 不支援。');
  if (packageData.status !== 'manual-review-required') throw new Error('瀏覽器收件包不得預先標記為已核可。');
  const id = fixtureId(packageData.fixtureId);
  const candidateFile = packageFileName(packageData.candidate?.file, 'candidate.file');
  const evidenceFile = packageFileName(packageData.evidence?.file, 'evidence.file');
  const reviewFile = packageFileName(packageData.review?.file, 'review.file');
  const receiptFile = packageFileName(packageData.receipt?.file, 'receipt.file');
  if (new Set([candidateFile, evidenceFile, reviewFile, receiptFile]).size !== 4) throw new Error('瀏覽器收件包輸出檔名不得重複。');
  const candidate = String(packageData.candidate?.content == null ? '' : packageData.candidate.content);
  if (!candidate || Buffer.byteLength(candidate, 'utf8') > 1024 * 1024) throw new Error('匿名候選內容空白或超過 1 MiB 上限。');
  const candidateSha256 = sha256(Buffer.from(candidate, 'utf8'));
  if (packageData.candidate?.sha256 !== candidateSha256) throw new Error('瀏覽器收件包候選 SHA-256 不一致。');

  const providedEvidence = packageData.evidence?.data;
  if (!providedEvidence || providedEvidence.schemaVersion !== EVIDENCE_SCHEMA) throw new Error('瀏覽器收件包匿名化證據 schema 不支援。');
  if (providedEvidence.status !== 'candidate-manual-review-required' || providedEvidence.provenance !== 'anonymized-observed-export-candidate') {
    throw new Error('瀏覽器收件包匿名化證據狀態不正確。');
  }
  if (providedEvidence.originKind !== 'actual-observed' || providedEvidence.notEngineeringData !== true) {
    throw new Error('瀏覽器收件包只能承接 actual-observed 非工程資料候選。');
  }
  if (providedEvidence.output?.file !== candidateFile || providedEvidence.output?.sha256 !== candidateSha256) {
    throw new Error('瀏覽器收件包候選檔名或匿名輸出 SHA-256 不一致。');
  }
  const sourceSha256 = String(providedEvidence.source?.sha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error('瀏覽器收件包缺少有效的本機來源 SHA-256 證據。');
  const sourceExtension = path.extname(candidateFile).toLowerCase();
  if (providedEvidence.source?.extension !== sourceExtension) throw new Error('瀏覽器收件包候選副檔名與來源證據不一致。');
  const generatedAt = new Date(providedEvidence.generatedAt).toISOString();
  const replay = Sanitizer.sanitizeExport({
    raw:candidate,
    software:providedEvidence.source?.software,
    softwareVersion:providedEvidence.source?.softwareVersion,
    units:providedEvidence.source?.units,
    tableName:providedEvidence.source?.tableName,
    originKind:'actual-observed',
    sourceExtension,
    generatedAt,
  });
  if (replay.sanitized !== candidate) throw new Error('瀏覽器收件包候選不是匿名器可重播的固定輸出。');
  for (const key of ['headerLine', 'delimiter', 'rowCount']) {
    if (providedEvidence.output?.[key] !== replay.evidence.output[key]) throw new Error(`瀏覽器收件包匿名化證據 ${key} 不一致。`);
  }
  for (const key of ['preambleContentRedacted', 'identifiersTokenized', 'numericResultsReplacedWithSyntheticValues', 'caseTypeReducedToClassification', 'unknownDataCellsRedacted', 'originalHeaderTextPreserved']) {
    if (providedEvidence.transform?.[key] !== true) throw new Error(`瀏覽器收件包匿名化證據缺少 ${key}=true。`);
  }

  const providedReview = packageData.review?.data;
  if (!providedReview || providedReview.schemaVersion !== REVIEW_SCHEMA || providedReview.fixtureId !== id || providedReview.candidateSha256 !== candidateSha256) {
    throw new Error('瀏覽器收件包 review 與候選不一致。');
  }
  if (String(providedReview.reviewer || '').trim() || String(providedReview.reviewedAt || '').trim()) {
    throw new Error('瀏覽器收件包 review 必須維持未核可狀態。');
  }
  if (ASSERTION_KEYS.some(key => providedReview.assertions?.[key] !== false)) {
    throw new Error('瀏覽器收件包 review 八項聲明必須全部為 false。');
  }

  const providedReceipt = packageData.receipt?.data;
  if (!providedReceipt || providedReceipt.schemaVersion !== RECEIPT_SCHEMA || providedReceipt.status !== 'manual-review-required') {
    throw new Error('瀏覽器收件包 receipt schema 或狀態不正確。');
  }
  if (providedReceipt.fixtureId !== id || providedReceipt.candidateFile !== candidateFile || providedReceipt.evidenceFile !== evidenceFile
      || providedReceipt.reviewFile !== reviewFile || providedReceipt.candidateSha256 !== candidateSha256) {
    throw new Error('瀏覽器收件包 receipt 與候選檔案不一致。');
  }

  const evidence = {
    schemaVersion:EVIDENCE_SCHEMA,
    status:'candidate-manual-review-required',
    generatedAt,
    provenance:'anonymized-observed-export-candidate',
    originKind:'actual-observed',
    notEngineeringData:true,
    source:{
      software:replay.evidence.source.software,
      softwareVersion:replay.evidence.source.softwareVersion,
      tableName:replay.evidence.source.tableName,
      units:replay.evidence.source.units,
      extension:sourceExtension,
      sha256:sourceSha256,
      stored:false,
    },
    output:{
      sha256:candidateSha256,
      file:candidateFile,
      headerLine:replay.evidence.output.headerLine,
      delimiter:replay.evidence.output.delimiter,
      rowCount:replay.evidence.output.rowCount,
    },
    transform:{ ...replay.evidence.transform },
    reviewChecklist:[...replay.evidence.reviewChecklist],
  };
  const review = blankReview(id, candidateSha256);
  const receipt = intakeReceipt({ fixtureId:id, evidence, candidateFile, evidenceFile, reviewFile });
  const sourcePrefix = sourceSha256.slice(0, 12);
  if ([candidateFile, evidenceFile, reviewFile, receiptFile, JSON.stringify(receipt)].some(value => value.includes(sourcePrefix))) {
    throw new Error('瀏覽器收件包輸出名稱或 receipt 洩漏部分來源 SHA-256。');
  }

  const outputDir = path.resolve(cfg.outputDir || path.join(__dirname, '..', '..', 'output', 'anonymized-fixtures', 'joint-reactions'));
  fs.mkdirSync(outputDir, { recursive:true });
  const candidatePath = path.join(outputDir, candidateFile);
  const evidencePath = path.join(outputDir, evidenceFile);
  const reviewPath = path.join(outputDir, reviewFile);
  const receiptPath = path.join(outputDir, receiptFile);
  Sanitizer.writeBundleIfAbsentOrSame([
    { filePath:candidatePath, content:candidate },
    { filePath:evidencePath, content:`${JSON.stringify(evidence, null, 2)}\n` },
    { filePath:reviewPath, content:`${JSON.stringify(review, null, 2)}\n` },
    { filePath:receiptPath, content:`${JSON.stringify(receipt, null, 2)}\n` },
  ]);
  return {
    schemaVersion:RECEIPT_SCHEMA,
    packageSchemaVersion:BROWSER_PACKAGE_SCHEMA,
    status:'manual-review-required',
    fixtureId:id,
    receiptPath,
    candidatePath,
    evidencePath,
    reviewPath,
    sourceStored:false,
    manualReviewRequired:true,
  };
}

function optionsFromReceipt(options) {
  const cfg = options && typeof options === 'object' ? options : {};
  const receiptPath = path.resolve(required(cfg.receiptPath, '收件 receipt 路徑'));
  const receipt = readJson(receiptPath, '收件 receipt');
  if (receipt.schemaVersion !== RECEIPT_SCHEMA) throw new Error('收件 receipt schema 不支援。');
  const id = fixtureId(receipt.fixtureId);
  return {
    receiptPath,
    receipt,
    gateOptions:{
      candidatePath:siblingPath(receiptPath, receipt.candidateFile, 'candidateFile'),
      evidencePath:siblingPath(receiptPath, receipt.evidenceFile, 'evidenceFile'),
      reviewPath:siblingPath(receiptPath, receipt.reviewFile, 'reviewFile'),
      fixtureId:id,
      manifestPath:path.resolve(cfg.manifestPath || DEFAULT_MANIFEST),
    },
  };
}

function assessReceipt(options) {
  const state = optionsFromReceipt(options);
  const assessment = PromotionGate.assessPromotion(state.gateOptions);
  return {
    ...assessment,
    intakeSchemaVersion:RECEIPT_SCHEMA,
    intakeStatus:assessment.ready ? 'ready-to-promote' : 'manual-review-required',
    receiptFile:path.basename(state.receiptPath),
  };
}

function promoteReceipt(options) {
  const state = optionsFromReceipt(options);
  return {
    ...PromotionGate.promoteCandidate(state.gateOptions),
    intakeSchemaVersion:RECEIPT_SCHEMA,
    receiptFile:path.basename(state.receiptPath),
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`不支援的參數：${key}`);
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) throw new Error(`${key} 缺少值。`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function runCli(argv) {
  const args = parseArgs(argv);
  if (args.package) {
    if (args.input || args.receipt || args.promote) throw new Error('匯入瀏覽器收件包時不得同時指定 --input、--receipt 或 --promote。');
    return importBrowserPackage({ packagePath:args.package, outputDir:args['output-dir'] });
  }
  if (args.input) {
    if (args.receipt || args.promote) throw new Error('準備收件時不得同時指定 --receipt 或 --promote。');
    return prepareIntake({
      inputPath:args.input,
      software:args.software,
      softwareVersion:args.version,
      units:args.units,
      tableName:args.table || 'Joint Reactions',
      fixtureId:args['fixture-id'],
      outputDir:args['output-dir'],
    });
  }
  if (args.receipt) {
    const options = { receiptPath:args.receipt, manifestPath:args.manifest };
    if (args.promote && String(args.promote).toLowerCase() !== 'yes') throw new Error('--promote 只接受明確值 yes。');
    return String(args.promote || 'no').toLowerCase() === 'yes' ? promoteReceipt(options) : assessReceipt(options);
  }
  throw new Error('請指定 --package 匯入瀏覽器收件包、--input 準備收件，或 --receipt 進行唯讀評估。');
}

if (require.main === module) {
  try {
    const result = runCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.ready === false) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { schemaVersion:RECEIPT_SCHEMA, packageSchemaVersion:BROWSER_PACKAGE_SCHEMA, prepareIntake, importBrowserPackage, assessReceipt, promoteReceipt, runCli };
