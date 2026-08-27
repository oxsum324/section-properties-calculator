const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Intake = require('./joint-reaction-observed-intake.js');

const raw = [
  'TABLE: "CLIENT ALPHA FOUNDATION"',
  'Story,Point,Unique Name,OutputCase,CaseType,StepType,StepNum,F1,F2,F3,M1,M2,M3',
  'BASE,CLIENT-JOINT-17,1701,CLIENT-DEAD,Linear Static,,,0,0,812345.6,0,0,0',
].join('\n');
const fixtureId = 'etabs-v23-observed-002';
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joint-reaction-intake-'));

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

try {
  const inputPath = path.join(tempRoot, 'confidential-client-alpha.csv');
  const outputDir = path.join(tempRoot, 'ignored-intake');
  const manifestDir = path.join(tempRoot, 'fixture-library');
  const manifestPath = path.join(manifestDir, 'observed-manifest.json');
  fs.writeFileSync(inputPath, raw, 'utf8');
  fs.mkdirSync(manifestDir, { recursive:true });
  writeJson(manifestPath, {
    schemaVersion:'rc-joint-reaction-observed-fixtures.v1',
    fixturePolicy:'anonymized-observed-exports-only',
    fixtures:[],
  });

  const prepared = Intake.prepareIntake({
    inputPath,
    software:'ETABS',
    softwareVersion:'v23.0.0',
    units:'kN, m',
    tableName:'Joint Reactions',
    fixtureId,
    outputDir,
  });
  assert.equal(prepared.schemaVersion, 'rc-joint-reaction-observed-intake-receipt.v1');
  assert.equal(prepared.status, 'manual-review-required');
  assert.equal(prepared.sourceStored, false);
  assert.equal(prepared.manualReviewRequired, true);
  for (const filePath of [prepared.receiptPath, prepared.candidatePath, prepared.evidencePath, prepared.reviewPath]) {
    assert.equal(fs.existsSync(filePath), true, `intake output exists: ${filePath}`);
  }
  const receiptText = fs.readFileSync(prepared.receiptPath, 'utf8');
  const receipt = JSON.parse(receiptText);
  const evidence = JSON.parse(fs.readFileSync(prepared.evidencePath, 'utf8'));
  const review = JSON.parse(fs.readFileSync(prepared.reviewPath, 'utf8'));
  assert.equal(receipt.declaredOrigin, 'actual-observed');
  assert.equal(receipt.privacy.sourceFileStored, false);
  assert.equal(receipt.privacy.sourcePathStored, false);
  assert.equal(receipt.privacy.sourceNameStored, false);
  assert.equal(receipt.privacy.sourceHashCommitted, false);
  assert.equal(evidence.originKind, 'actual-observed');
  assert.equal(review.reviewer, '');
  assert.equal(review.reviewedAt, '');
  assert.equal(Object.values(review.assertions).every(value => value === false), true);
  assert.equal(receiptText.includes(inputPath), false, 'receipt must exclude source path');
  assert.equal(receiptText.includes(path.basename(inputPath)), false, 'receipt must exclude source name');
  assert.equal(receiptText.includes(evidence.source.sha256), false, 'receipt must exclude source hash');
  assert.equal(receiptText.includes(evidence.source.sha256.slice(0, 12)), false, 'receipt filenames must exclude partial source hash');
  assert.equal(path.basename(prepared.candidatePath).includes(evidence.source.sha256.slice(0, 12)), false, 'candidate filename must not expose partial source hash');
  assert.equal(path.basename(prepared.candidatePath).includes(evidence.output.sha256.slice(0, 12)), true, 'candidate filename may use anonymized output hash');
  for (const secret of ['CLIENT ALPHA FOUNDATION', 'CLIENT-JOINT-17', 'CLIENT-DEAD', '812345.6']) {
    assert.equal(fs.readFileSync(prepared.candidatePath, 'utf8').includes(secret), false, `candidate leaked ${secret}`);
    assert.equal(receiptText.includes(secret), false, `receipt leaked ${secret}`);
  }

  const preparedPaths = [prepared.receiptPath, prepared.candidatePath, prepared.evidencePath, prepared.reviewPath];
  const preparedSnapshot = new Map(preparedPaths.map(filePath => [filePath, fs.readFileSync(filePath, 'utf8')]));
  const preparedAgain = Intake.prepareIntake({
    inputPath,
    software:'ETABS',
    softwareVersion:'v23.0.0',
    units:'kN, m',
    tableName:'Joint Reactions',
    fixtureId,
    outputDir,
  });
  assert.equal(preparedAgain.receiptPath, prepared.receiptPath);
  for (const filePath of preparedPaths) {
    assert.equal(fs.readFileSync(filePath, 'utf8'), preparedSnapshot.get(filePath), `exact direct reimport keeps bytes: ${path.basename(filePath)}`);
  }

  const directConflictDir = path.join(tempRoot, 'direct-conflict');
  fs.mkdirSync(directConflictDir, { recursive:true });
  const directConflictReceipt = path.join(directConflictDir, path.basename(prepared.receiptPath));
  fs.writeFileSync(directConflictReceipt, 'preexisting-direct-conflict\n', 'utf8');
  assert.throws(() => Intake.prepareIntake({
    inputPath,
    software:'ETABS',
    softwareVersion:'v23.0.0',
    units:'kN, m',
    tableName:'Joint Reactions',
    fixtureId,
    outputDir:directConflictDir,
  }), /輸出檔已存在且內容不同/);
  assert.deepEqual(fs.readdirSync(directConflictDir), [path.basename(directConflictReceipt)], 'late direct conflict leaves no partial files');
  assert.equal(fs.readFileSync(directConflictReceipt, 'utf8'), 'preexisting-direct-conflict\n');

  const browserPackagePath = path.join(tempRoot, 'browser-intake-package.json');
  const candidateContent = fs.readFileSync(prepared.candidatePath, 'utf8');
  const packageData = {
    schemaVersion:'rc-joint-reaction-browser-intake-package.v1',
    status:'manual-review-required',
    createdAt:evidence.generatedAt,
    fixtureId,
    candidate:{ file:path.basename(prepared.candidatePath), sha256:evidence.output.sha256, content:candidateContent },
    evidence:{ file:path.basename(prepared.evidencePath), data:{ ...evidence, extraSecret:'MUST NOT SURVIVE IMPORT' } },
    review:{ file:path.basename(prepared.reviewPath), data:review },
    receipt:{ file:path.basename(prepared.receiptPath), data:receipt },
    privacy:{ manualReviewRequired:true },
    extraSecret:'MUST NOT SURVIVE IMPORT',
  };
  writeJson(browserPackagePath, packageData);
  const browserImportDir = path.join(tempRoot, 'browser-package-import');
  const browserImported = Intake.importBrowserPackage({ packagePath:browserPackagePath, outputDir:browserImportDir });
  assert.equal(browserImported.packageSchemaVersion, 'rc-joint-reaction-browser-intake-package.v1');
  assert.equal(browserImported.status, 'manual-review-required');
  assert.equal(browserImported.manualReviewRequired, true);
  assert.equal(fs.readFileSync(browserImported.candidatePath, 'utf8'), candidateContent);
  assert.equal(fs.readFileSync(browserImported.evidencePath, 'utf8').includes('MUST NOT SURVIVE IMPORT'), false, 'browser package extra evidence fields are discarded');
  assert.equal(fs.readFileSync(browserImported.receiptPath, 'utf8').includes(evidence.source.sha256.slice(0, 12)), false, 'browser package receipt excludes partial source hash');

  const browserPaths = [browserImported.receiptPath, browserImported.candidatePath, browserImported.evidencePath, browserImported.reviewPath];
  const browserSnapshot = new Map(browserPaths.map(filePath => [filePath, fs.readFileSync(filePath, 'utf8')]));
  const browserImportedAgain = Intake.importBrowserPackage({ packagePath:browserPackagePath, outputDir:browserImportDir });
  assert.equal(browserImportedAgain.receiptPath, browserImported.receiptPath);
  for (const filePath of browserPaths) {
    assert.equal(fs.readFileSync(filePath, 'utf8'), browserSnapshot.get(filePath), `exact browser reimport keeps bytes: ${path.basename(filePath)}`);
  }

  const browserConflictDir = path.join(tempRoot, 'browser-package-conflict');
  fs.mkdirSync(browserConflictDir, { recursive:true });
  const browserConflictEvidence = path.join(browserConflictDir, packageData.evidence.file);
  fs.writeFileSync(browserConflictEvidence, 'preexisting-browser-conflict\n', 'utf8');
  assert.throws(() => Intake.importBrowserPackage({ packagePath:browserPackagePath, outputDir:browserConflictDir }), /輸出檔已存在且內容不同/);
  assert.deepEqual(fs.readdirSync(browserConflictDir), [packageData.evidence.file], 'browser conflict leaves no partial package files');
  assert.equal(fs.readFileSync(browserConflictEvidence, 'utf8'), 'preexisting-browser-conflict\n');

  const browserJunctionDir = path.join(tempRoot, 'browser-package-junction');
  const browserJunctionTarget = path.join(tempRoot, 'browser-package-junction-target');
  fs.mkdirSync(browserJunctionDir, { recursive:true });
  fs.mkdirSync(browserJunctionTarget, { recursive:true });
  const browserJunctionCandidate = path.join(browserJunctionDir, packageData.candidate.file);
  fs.symlinkSync(browserJunctionTarget, browserJunctionCandidate, 'junction');
  assert.equal(fs.lstatSync(browserJunctionCandidate).isSymbolicLink(), true, 'browser test fixture must be a junction');
  assert.throws(() => Intake.importBrowserPackage({ packagePath:browserPackagePath, outputDir:browserJunctionDir }), /輸出目標不得是符號連結/);
  assert.deepEqual(fs.readdirSync(browserJunctionDir), [packageData.candidate.file], 'blocked browser junction leaves no other output');
  assert.deepEqual(fs.readdirSync(browserJunctionTarget), [], 'browser junction target stays untouched');

  const browserPending = Intake.assessReceipt({ receiptPath:browserImported.receiptPath, manifestPath });
  assert.equal(browserPending.ready, false, 'browser package import remains pending manual review');
  assert.ok(browserPending.issues.some(item => item.code === 'review-assertion-incomplete'));

  const cliBrowserImportDir = path.join(tempRoot, 'browser-package-cli-import');
  const cliBrowserImport = spawnSync(process.execPath, [
    path.join(__dirname, 'joint-reaction-observed-intake.js'),
    '--package', browserPackagePath,
    '--output-dir', cliBrowserImportDir,
  ], { encoding:'utf8' });
  assert.equal(cliBrowserImport.status, 0, cliBrowserImport.stderr);
  assert.equal(JSON.parse(cliBrowserImport.stdout).manualReviewRequired, true);

  const unsafeBrowserPackagePath = path.join(tempRoot, 'unsafe-browser-intake-package.json');
  writeJson(unsafeBrowserPackagePath, { ...packageData, candidate:{ ...packageData.candidate, file:'../escape.csv' } });
  assert.throws(() => Intake.importBrowserPackage({ packagePath:unsafeBrowserPackagePath, outputDir:browserImportDir }), /收件目錄內的檔名/);
  const preapprovedBrowserPackagePath = path.join(tempRoot, 'preapproved-browser-intake-package.json');
  writeJson(preapprovedBrowserPackagePath, {
    ...packageData,
    review:{
      ...packageData.review,
      data:{ ...review, reviewer:'not-allowed', assertions:{ ...review.assertions, noProjectIdentity:true } },
    },
  });
  assert.throws(() => Intake.importBrowserPackage({ packagePath:preapprovedBrowserPackagePath, outputDir:browserImportDir }), /必須維持未核可狀態|全部為 false/);

  const pending = Intake.assessReceipt({ receiptPath:prepared.receiptPath, manifestPath });
  assert.equal(pending.ready, false);
  assert.equal(pending.intakeStatus, 'manual-review-required');
  assert.ok(pending.issues.some(item => item.code === 'reviewer-missing'));
  assert.ok(pending.issues.some(item => item.code === 'review-time-invalid'));
  assert.ok(pending.issues.some(item => item.code === 'review-assertion-incomplete'));

  writeJson(prepared.reviewPath, {
    ...review,
    reviewedAt:new Date(Date.parse(evidence.generatedAt) + 1000).toISOString(),
    reviewer:'independent-format-reviewer',
    assertions:Object.fromEntries(Object.keys(review.assertions).map(key => [key, true])),
  });
  const ready = Intake.assessReceipt({ receiptPath:prepared.receiptPath, manifestPath });
  assert.equal(ready.ready, true);
  assert.equal(ready.intakeStatus, 'ready-to-promote');
  assert.equal(ready.issueCount, 0);
  const manifestBefore = fs.readFileSync(manifestPath, 'utf8');

  const cliAssess = spawnSync(process.execPath, [
    path.join(__dirname, 'joint-reaction-observed-intake.js'),
    '--receipt', prepared.receiptPath,
    '--manifest', manifestPath,
  ], { encoding:'utf8' });
  assert.equal(cliAssess.status, 0, cliAssess.stderr);
  assert.equal(JSON.parse(cliAssess.stdout).ready, true);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifestBefore, 'receipt assessment must be read-only');

  const cliPromote = spawnSync(process.execPath, [
    path.join(__dirname, 'joint-reaction-observed-intake.js'),
    '--receipt', prepared.receiptPath,
    '--manifest', manifestPath,
    '--promote', 'yes',
  ], { encoding:'utf8' });
  assert.equal(cliPromote.status, 0, cliPromote.stderr);
  const promoted = JSON.parse(cliPromote.stdout);
  assert.equal(promoted.status, 'promoted');
  assert.equal(promoted.sourceFileStored, false);
  assert.equal(promoted.sourceHashCommitted, false);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.fixtures.length, 1);
  const provenanceText = fs.readFileSync(path.join(manifestDir, promoted.provenanceFile), 'utf8');
  assert.equal(provenanceText.includes(evidence.source.sha256), false, 'promoted provenance must exclude original source hash');
  assert.equal(provenanceText.includes(path.basename(inputPath)), false, 'promoted provenance must exclude original source name');

  const unsafeReceiptPath = path.join(outputDir, 'unsafe.intake.json');
  writeJson(unsafeReceiptPath, { ...receipt, candidateFile:'../escape.csv' });
  assert.throws(() => Intake.assessReceipt({ receiptPath:unsafeReceiptPath, manifestPath }), /收件目錄內的檔名/);
  assert.throws(() => Intake.runCli(['--receipt', prepared.receiptPath, '--promote', 'true', '--manifest', manifestPath]), /只接受明確值 yes/);
} finally {
  fs.rmSync(tempRoot, { recursive:true, force:true });
}

console.log('joint reaction observed intake workflow tests passed');
