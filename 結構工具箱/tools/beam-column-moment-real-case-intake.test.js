'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Module = require('node:module');

const TOOL_PATH = path.join(__dirname, 'beam-column-moment-real-case-intake.js');
const PILOT_PATH = path.join(__dirname, 'beam-column-moment-g1-pilot.js');
const CATALOG_PATH = path.join(__dirname, 'independent-engineering-benchmarks.catalog.json');
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const loadedByIntake = [];
const originalModuleLoad = Module._load;
Module._load = function auditedModuleLoad(request, parent, isMain) {
  if (parent?.filename === TOOL_PATH) loadedByIntake.push(request);
  return originalModuleLoad.call(this, request, parent, isMain);
};
let Intake;
try {
  Intake = require(TOOL_PATH);
} finally {
  Module._load = originalModuleLoad;
}

const Pilot = require(PILOT_PATH);
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8').replace(/^\uFEFF/u, ''));
const benchmark = catalog.benchmarks.find(item => item.id === 'steel-formal-strength');
const benchmarkCase = benchmark.input.momentCases.find(item => item.id === 'momentPriorTestSmrfPass');
const benchmarkFields = Object.keys(benchmarkCase).filter(key => key !== 'id');
const sourceText = fs.readFileSync(TOOL_PATH, 'utf8');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function candidateFixture() {
  const record = clone(Pilot.realCaseIntakeTemplate(benchmarkFields));
  Object.assign(record.caseIdentity, {
    externalCaseId: 'PRIVATE-CASE-BCM-001',
    projectName: '私有實案甲棟耐震補強',
    projectNo: 'P-BCM-2026-001',
    designer: '私有設計者甲',
    intendedUse: '梁柱彎矩接頭實案人工 G1 前的收件準備。',
    permissibleUse: '僅限本私有案件資格化工作區與案件負責人審閱。',
    limitations: ['只涵蓋 SMRF、x 軸、補強式與先前試驗相似性路線。'],
    exclusions: ['不含正交向、完整接頭設計、附件核准與法定簽證。'],
    governingStandards: [{
      standardId: 'AISC-341-22',
      title: 'Seismic Provisions for Structural Steel Buildings',
      edition: '2022',
      clauses: ['E3', 'E3.6'],
      sourceAuthority: '規範判定：AISC 341-22 與本案採用版本',
    }],
    caseSourceArtifactFile: 'inputs/case-source.md',
  });
  record.criteria = {
    definedAt: '2026-01-02T03:04:05.000Z',
    numericToleranceBasis: '專案指定：力與彎矩採絕對差及相對差雙門檻，須於 production 執行前鎖定。',
    controlBranchExpected: 'smrf|x|reinforced|prior_test_similarity|six-strength-checks',
    decisionExpected: 'pass',
    outOfScopeExpected: 'warning',
    applicabilityExpected: 'applicable',
  };
  record.toolInput = clone(benchmarkCase);
  delete record.toolInput.id;
  record.toolInput.projectName = record.caseIdentity.projectName;
  record.toolInput.designer = record.caseIdentity.designer;
  record.toolInput.connectionTag = 'BCM-REAL-001';
  record.toolInput.momentQualificationEvidenceSha256 = sha256('private qualification evidence fixture');
  record.toolInput.momentCapacityEvidenceSha256 = sha256('private capacity evidence fixture');
  record.independentReference = {
    method: 'independent-spreadsheet',
    independentFromProductionCore: true,
    author: '外部覆核者乙',
    reviewer: '',
    createdAt: '2026-01-03T04:05:06.000Z',
    basis: '獨立 Excel 依案件來源證據重算；未呼叫 production core。',
    artifactFile: 'references/independent-reference.md',
    machineDataFile: 'references/independent-reference.json',
  };
  return record;
}

const BASE_CANDIDATE = candidateFixture();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-column-moment-real-case-intake-'));

function materialize(name, mutate) {
  const workspace = path.join(tempRoot, name);
  fs.mkdirSync(path.join(workspace, 'inputs'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'references'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'inputs', 'case-source.md'), '# 私有案件來源\n梁柱彎矩接頭來源資料。\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'references', 'independent-reference.md'), '# 外部獨立重算\n人工整理的獨立試算表結果。\n', 'utf8');
  writeJson(path.join(workspace, 'references', 'independent-reference.json'), {
    schemaVersion: 1,
    method: 'independent-spreadsheet',
    checks: [{ id: 'external-check-placeholder-shape', value: 1 }],
  });
  const candidate = clone(BASE_CANDIDATE);
  if (mutate) mutate(candidate, workspace);
  writeJson(path.join(workspace, 'beam-column-moment-real-case-intake.json'), candidate);
  return { workspace, candidate };
}

function fileInventory(root) {
  const records = [];
  function visit(current, relative = '') {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute, childRelative);
      else records.push({ path: childRelative, sha256: sha256(fs.readFileSync(absolute)) });
    }
  }
  visit(root);
  return records;
}

function expectBlocked(name, mutate, pattern, setup) {
  const fixture = materialize(name, mutate);
  if (setup) setup(fixture);
  assert.throws(
    () => Intake.assessIntake(fixture.workspace, 'beam-column-moment-real-case-intake.json'),
    error => error instanceof Intake.IntakeContractError && pattern.test(error.message),
    `${name} must fail closed with a governed contract error`,
  );
  return fixture;
}

try {
  assert.deepEqual([...new Set(loadedByIntake)].sort(), ['node:crypto', 'node:fs', 'node:path'], 'intake loads only Node crypto/fs/path');
  assert.doesNotMatch(sourceText, /child_process|steel-formal|calculator\.js|independent-engineering-benchmarks/iu, 'intake source cannot load a calculator, benchmark, adapter, or child process');
  assert.equal(Object.keys(Intake.TOOL_INPUT_TYPES).length, 88);
  assert.equal(Object.values(Intake.TOOL_INPUT_TYPES).filter(type => type === 'string').length, 21);
  assert.equal(Object.values(Intake.TOOL_INPUT_TYPES).filter(type => type === 'number').length, 41);
  assert.equal(Object.values(Intake.TOOL_INPUT_TYPES).filter(type => type === 'boolean').length, 26);
  assert.equal(
    sha256(Buffer.from(Intake.canonicalJson(Intake.TOOL_INPUT_TYPES), 'utf8')),
    Intake.TOOL_INPUT_SCHEMA_SHA256,
    'frozen field/type contract matches its SHA-256',
  );
  assert.deepEqual(Object.keys(Intake.TOOL_INPUT_TYPES).sort(), [...benchmarkFields].sort(), 'intake contract matches the producer 88-field catalog case');
  assert.deepEqual(Object.keys(Pilot.realCaseIntakeTemplate(benchmarkFields)).sort(), [
    'schemaVersion', 'kind', 'status', 'boundary', 'caseIdentity', 'criteria',
    'toolInput', 'independentReference', 'requiredHumanActions',
  ].sort(), 'synthetic G1 produces the exact fillable candidate shape');
  const validatedCandidate = clone(BASE_CANDIDATE);
  assert.equal(Intake.validateCandidate(validatedCandidate, new Date().toISOString()), validatedCandidate);

  const positive = materialize('positive');
  const beforeAssess = fileInventory(positive.workspace);
  const assessed = Intake.assessIntake(positive.workspace, 'beam-column-moment-real-case-intake.json');
  assert.deepEqual(fileInventory(positive.workspace), beforeAssess, 'default assessment is read-only');
  assert.equal(assessed.status, Intake.RECEIPT_STATUS);
  assert.equal(assessed.inputValidated, true);
  assert.equal(assessed.receiptCreated, false);
  assert.equal(assessed.receiptFile, '');
  assert.match(assessed.intakeFingerprint, /^RCI-[0-9A-F]{24}$/u);
  for (const key of ['calculatorExecuted', 'engineeringResultsCompared', 'g1', 'g2', 'g3', 'completeJointDesign', 'legalSignoff']) {
    assert.equal(assessed[key], false, `${key} remains false after intake assessment`);
  }
  const assessedPublic = JSON.stringify(assessed);
  assert.doesNotMatch(assessedPublic, /PRIVATE-CASE|私有實案|私有設計者|beam-column-moment-real-case-intake\.json/u, 'public result omits identities and candidate-controlled paths');
  assert.equal(assessedPublic.includes(path.resolve(positive.workspace)), false, 'public result omits the absolute workspace path');
  assert.equal(fs.existsSync(path.join(positive.workspace, ...Intake.RECEIPT_RELATIVE_PATH.split('/'))), false);

  const sealed = Intake.sealReadiness(positive.workspace, 'beam-column-moment-real-case-intake.json');
  assert.equal(sealed.receiptCreated, true);
  assert.equal(sealed.receiptFile, Intake.RECEIPT_RELATIVE_PATH);
  const receiptPath = path.join(positive.workspace, ...Intake.RECEIPT_RELATIVE_PATH.split('/'));
  const firstReceiptBytes = fs.readFileSync(receiptPath);
  const receipt = JSON.parse(firstReceiptBytes.toString('utf8'));
  assert.equal(Intake.validateReceiptShape(receipt), receipt);
  assert.equal(receipt.kind, Intake.RECEIPT_KIND);
  assert.equal(receipt.status, Intake.RECEIPT_STATUS);
  assert.deepEqual(receipt.boundary, Intake.receiptBoundary());
  assert.equal(Object.values(receipt.boundary).every(value => value === false), true);
  assert.equal(receipt.fieldSchemaSha256, Intake.TOOL_INPUT_SCHEMA_SHA256);
  const receiptText = firstReceiptBytes.toString('utf8');
  assert.doesNotMatch(receiptText, /PRIVATE-CASE|私有實案|私有設計者|claimedLevel|qualificationStatus|"decision"\s*:/u, 'receipt contains hashes and boundaries, not identities or qualification claims');
  assert.throws(
    () => Intake.sealReadiness(positive.workspace, 'beam-column-moment-real-case-intake.json'),
    error => error instanceof Intake.IntakeContractError && /已存在|覆寫/u.test(error.message),
    'an existing receipt is never overwritten',
  );
  assert.deepEqual(fs.readFileSync(receiptPath), firstReceiptBytes, 'failed reseal leaves receipt bytes unchanged');
  const tamperedBoundary = clone(receipt);
  tamperedBoundary.boundary.g1 = true;
  assert.throws(() => Intake.validateReceiptShape(tamperedBoundary), /邊界/u);
  const tamperedNextAction = clone(receipt);
  tamperedNextAction.nextAction = 'G1/G2/G3 complete';
  assert.throws(() => Intake.validateReceiptShape(tamperedNextAction), /下一步/u);

  const cli = spawnSync(process.execPath, [
    TOOL_PATH, '--workspace', positive.workspace, '--input', 'beam-column-moment-real-case-intake.json', '--json',
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stderr, '');
  const cliResult = JSON.parse(cli.stdout);
  assert.equal(cliResult.inputValidated, true);
  assert.equal(cliResult.receiptCreated, false);
  assert.doesNotMatch(cli.stdout, /PRIVATE-CASE|私有實案|私有設計者/u);
  assert.equal(cli.stdout.includes(path.resolve(positive.workspace)), false);
  const usageFailure = spawnSync(process.execPath, [TOOL_PATH, '--seal-readiness', 'no'], { encoding: 'utf8', windowsHide: true });
  assert.equal(usageFailure.status, 3);
  assert.match(usageFailure.stderr, /只接受明確值 yes|請同時指定/u);

  expectBlocked('legacy-template', candidate => {
    candidate.kind = 'beam-column-moment-real-case-intake-template.v1';
    candidate.status = 'template-only-no-case-data';
  }, /舊 synthetic template|candidate-unvalidated/u);
  expectBlocked('missing-field', candidate => { delete candidate.toolInput.momentBeamYieldStrength; }, /欄位不符/u);
  expectBlocked('extra-field', candidate => { candidate.toolInput.unreviewed = true; }, /欄位不符/u);
  expectBlocked('null-number', candidate => { candidate.toolInput.momentBeamYieldStrength = null; }, /必須是 number/u);
  expectBlocked('numeric-string', candidate => { candidate.toolInput.momentBeamYieldStrength = '350'; }, /必須是 number/u);
  expectBlocked('wrong-route', candidate => { candidate.toolInput.momentQualificationRoute = 'direct_test'; }, /必須固定/u);
  expectBlocked('placeholder-basis', candidate => { candidate.toolInput.momentDemandBasis = 'TODO'; }, /占位/u);
  expectBlocked('zero-sha', candidate => { candidate.toolInput.momentCapacityEvidenceSha256 = '0'.repeat(64); }, /SHA-256/u);
  expectBlocked('future-criteria', candidate => { candidate.criteria.definedAt = '2999-01-01T00:00:00.000Z'; }, /不得晚於/u);
  expectBlocked('future-reference', candidate => { candidate.independentReference.createdAt = '2999-01-01T00:00:00.000Z'; }, /不得晚於/u);
  expectBlocked('same-core-reference', candidate => { candidate.independentReference.independentFromProductionCore = false; }, /independentFromProductionCore/u);
  expectBlocked('weakened-actions', candidate => {
    candidate.requiredHumanActions = ['G2 不需人工責任。', 'G3 不需人工責任。'];
  }, /人工責任原文/u);
  expectBlocked('tool-authority', candidate => {
    candidate.caseIdentity.governingStandards[0].sourceAuthority = '工具建議：AISC 341-22';
  }, /權威來源|sourceAuthority/u);
  expectBlocked('unclassified-authority', candidate => {
    candidate.caseIdentity.governingStandards[0].sourceAuthority = 'AISC 341-22';
  }, /必須明列/u);
  expectBlocked('absolute-evidence-path', (candidate, workspace) => {
    candidate.caseIdentity.caseSourceArtifactFile = path.join(workspace, 'inputs', 'case-source.md');
  }, /POSIX 相對路徑/u);
  expectBlocked('backslash-evidence-path', candidate => { candidate.caseIdentity.caseSourceArtifactFile = 'inputs\\case-source.md'; }, /POSIX 相對路徑/u);
  expectBlocked('parent-evidence-path', candidate => { candidate.caseIdentity.caseSourceArtifactFile = '../case-source.md'; }, /越出工作區/u);
  expectBlocked('ads-evidence-path', candidate => { candidate.caseIdentity.caseSourceArtifactFile = 'inputs/case-source.md:secret'; }, /POSIX 相對路徑/u);
  expectBlocked('device-evidence-path', candidate => { candidate.caseIdentity.caseSourceArtifactFile = 'inputs/con.txt'; }, /Windows 裝置/u);
  expectBlocked('missing-evidence', candidate => { candidate.caseIdentity.caseSourceArtifactFile = 'inputs/missing.md'; }, /不存在/u);
  expectBlocked('same-evidence-path', candidate => {
    candidate.independentReference.artifactFile = candidate.caseIdentity.caseSourceArtifactFile;
  }, /不同的實體檔案/u);
  expectBlocked('same-evidence-hash', candidate => {
    candidate.independentReference.artifactFile = 'references/copied-case-source.md';
  }, /相同內容/u, ({ workspace }) => {
    fs.copyFileSync(path.join(workspace, 'inputs', 'case-source.md'), path.join(workspace, 'references', 'copied-case-source.md'));
  });
  expectBlocked('empty-reference-json', () => {}, /非空 JSON 物件/u, ({ workspace }) => {
    fs.writeFileSync(path.join(workspace, 'references', 'independent-reference.json'), '{}\n', 'utf8');
  });
  const duplicateCandidate = materialize('duplicate-candidate-key');
  const duplicateCandidatePath = path.join(duplicateCandidate.workspace, 'beam-column-moment-real-case-intake.json');
  const duplicateRaw = fs.readFileSync(duplicateCandidatePath, 'utf8').replace(
    '"schemaVersion": 1,',
    '"schemaVersion": 1,\n  "schemaVersion": 1,',
  );
  fs.writeFileSync(duplicateCandidatePath, duplicateRaw, 'utf8');
  assert.throws(
    () => Intake.assessIntake(duplicateCandidate.workspace, 'beam-column-moment-real-case-intake.json'),
    error => error instanceof Intake.IntakeContractError && /重複 JSON 欄位/u.test(error.message),
  );
  expectBlocked('duplicate-reference-key', () => {}, /重複 JSON 欄位/u, ({ workspace }) => {
    fs.writeFileSync(path.join(workspace, 'references', 'independent-reference.json'), '{"method":"one","method":"two"}\n', 'utf8');
  });
  expectBlocked('nonfinite-reference-number', () => {}, /非有限數值/u, ({ workspace }) => {
    fs.writeFileSync(path.join(workspace, 'references', 'independent-reference.json'), '{"value":1e999}\n', 'utf8');
  });
  expectBlocked('invalid-reference-utf8', () => {}, /有效 UTF-8/u, ({ workspace }) => {
    fs.writeFileSync(
      path.join(workspace, 'references', 'independent-reference.json'),
      Buffer.concat([Buffer.from('{"value":"', 'utf8'), Buffer.from([0xc3]), Buffer.from('"}\n', 'utf8')]),
    );
  });

  assert.throws(
    () => Intake.assessIntake(REPO_ROOT, 'beam-column-moment-real-case-intake.json'),
    error => error instanceof Intake.IntakeUsageError && /完全分離|工具程式庫/u.test(error.message),
    'repo-local real-case workspaces are prohibited before any input is read',
  );
  assert.throws(
    () => Intake.assessIntake(path.dirname(REPO_ROOT), 'beam-column-moment-real-case-intake.json'),
    error => error instanceof Intake.IntakeUsageError && /完全分離|上層/u.test(error.message),
    'a repository ancestor cannot be abused as a workspace that points back into the repository',
  );

  const hardLinkFixture = materialize('hard-link');
  const hardTarget = path.join(hardLinkFixture.workspace, 'inputs', 'hard-target.md');
  const hardLink = path.join(hardLinkFixture.workspace, 'inputs', 'hard-link.md');
  fs.writeFileSync(hardTarget, 'hard link evidence\n', 'utf8');
  let hardLinkSupported = false;
  try {
    fs.linkSync(hardTarget, hardLink);
    hardLinkSupported = true;
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  }
  if (hardLinkSupported) {
    hardLinkFixture.candidate.caseIdentity.caseSourceArtifactFile = 'inputs/hard-link.md';
    writeJson(path.join(hardLinkFixture.workspace, 'beam-column-moment-real-case-intake.json'), hardLinkFixture.candidate);
    assert.throws(() => Intake.assessIntake(hardLinkFixture.workspace, 'beam-column-moment-real-case-intake.json'), /硬連結|單一實體檔案/u);
  }

  const symlinkFixture = materialize('symlink-file');
  const symlinkPath = path.join(symlinkFixture.workspace, 'inputs', 'linked-source.md');
  let symlinkSupported = false;
  try {
    fs.symlinkSync(path.join(symlinkFixture.workspace, 'inputs', 'case-source.md'), symlinkPath, 'file');
    symlinkSupported = true;
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  }
  if (symlinkSupported) {
    symlinkFixture.candidate.caseIdentity.caseSourceArtifactFile = 'inputs/linked-source.md';
    writeJson(path.join(symlinkFixture.workspace, 'beam-column-moment-real-case-intake.json'), symlinkFixture.candidate);
    assert.throws(() => Intake.assessIntake(symlinkFixture.workspace, 'beam-column-moment-real-case-intake.json'), /連結|實體檔案/u);
  }

  const workspaceTarget = materialize('workspace-target');
  const linkedWorkspace = path.join(tempRoot, 'workspace-link');
  let workspaceLinkSupported = false;
  try {
    fs.symlinkSync(workspaceTarget.workspace, linkedWorkspace, 'junction');
    workspaceLinkSupported = true;
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  }
  if (workspaceLinkSupported) {
    assert.throws(() => Intake.assessIntake(linkedWorkspace, 'beam-column-moment-real-case-intake.json'), /實體資料夾|重新導向/u);
  }

  const raceFixture = materialize('receipt-race');
  const raceReceiptPath = path.join(raceFixture.workspace, ...Intake.RECEIPT_RELATIVE_PATH.split('/'));
  const originalOpenSync = fs.openSync;
  let raceIntercepted = false;
  fs.openSync = function concurrentReceiptOpen(filePath, flags, ...rest) {
    if (path.resolve(filePath) === path.resolve(raceReceiptPath) && flags === 'wx') {
      raceIntercepted = true;
      fs.openSync = originalOpenSync;
      fs.writeFileSync(raceReceiptPath, 'concurrent-owner-sentinel\n', 'utf8');
      const error = new Error('simulated concurrent receipt owner');
      error.code = 'EEXIST';
      throw error;
    }
    return originalOpenSync.call(this, filePath, flags, ...rest);
  };
  try {
    assert.throws(() => Intake.sealReadiness(raceFixture.workspace, 'beam-column-moment-real-case-intake.json'), /concurrent receipt owner/u);
  } finally {
    fs.openSync = originalOpenSync;
  }
  assert.equal(raceIntercepted, true);
  assert.equal(fs.readFileSync(raceReceiptPath, 'utf8'), 'concurrent-owner-sentinel\n', 'a racing process receipt is never deleted');

  const junctionProbeTarget = path.join(tempRoot, 'junction-probe-target');
  const junctionProbe = path.join(tempRoot, 'junction-probe');
  fs.mkdirSync(junctionProbeTarget);
  let junctionSupported = false;
  try {
    fs.symlinkSync(junctionProbeTarget, junctionProbe, 'junction');
    junctionSupported = true;
    fs.unlinkSync(junctionProbe);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  }
  if (junctionSupported) {
    const evidenceRace = materialize('evidence-directory-race');
    const evidenceInputs = path.join(evidenceRace.workspace, 'inputs');
    const originalEvidenceInputs = path.join(evidenceRace.workspace, 'inputs-original');
    const outsideEvidenceInputs = path.join(tempRoot, 'evidence-directory-race-outside');
    fs.mkdirSync(outsideEvidenceInputs);
    fs.copyFileSync(path.join(evidenceInputs, 'case-source.md'), path.join(outsideEvidenceInputs, 'case-source.md'));
    const sourceTimes = fs.statSync(path.join(evidenceInputs, 'case-source.md'));
    fs.utimesSync(path.join(outsideEvidenceInputs, 'case-source.md'), sourceTimes.atime, sourceTimes.mtime);
    const evidenceSourcePath = path.join(evidenceInputs, 'case-source.md');
    const evidenceRaceOpen = fs.openSync;
    let evidenceSourceOpenCount = 0;
    fs.openSync = function swappedEvidenceDirectoryOpen(filePath, flags, ...rest) {
      if (path.resolve(filePath) === path.resolve(evidenceSourcePath) && flags === 'r') {
        evidenceSourceOpenCount += 1;
        if (evidenceSourceOpenCount === 2) {
          fs.openSync = evidenceRaceOpen;
          fs.renameSync(evidenceInputs, originalEvidenceInputs);
          fs.symlinkSync(outsideEvidenceInputs, evidenceInputs, 'junction');
        }
      }
      return evidenceRaceOpen.call(this, filePath, flags, ...rest);
    };
    try {
      assert.throws(
        () => Intake.assessIntake(evidenceRace.workspace, 'beam-column-moment-real-case-intake.json'),
        /重新導向|越出工作區|發生變更/u,
        'evidence parent redirection between initial read and revalidation fails closed even with copied bytes',
      );
    } finally {
      fs.openSync = evidenceRaceOpen;
    }
    assert.equal(evidenceSourceOpenCount, 2);

    const directoryRace = materialize('receipt-directory-race');
    const referenceDirectory = path.join(directoryRace.workspace, 'references');
    const originalReferenceDirectory = path.join(directoryRace.workspace, 'references-original');
    const outsideDirectory = path.join(tempRoot, 'receipt-directory-race-outside');
    fs.mkdirSync(outsideDirectory);
    const redirectedReceipt = path.join(outsideDirectory, path.basename(Intake.RECEIPT_RELATIVE_PATH));
    const directoryRaceReceipt = path.join(directoryRace.workspace, ...Intake.RECEIPT_RELATIVE_PATH.split('/'));
    const raceOpenSync = fs.openSync;
    let directoryRaceIntercepted = false;
    fs.openSync = function swappedDirectoryOpen(filePath, flags, ...rest) {
      if (path.resolve(filePath) === path.resolve(directoryRaceReceipt) && flags === 'wx') {
        directoryRaceIntercepted = true;
        fs.openSync = raceOpenSync;
        fs.renameSync(referenceDirectory, originalReferenceDirectory);
        fs.symlinkSync(outsideDirectory, referenceDirectory, 'junction');
      }
      return raceOpenSync.call(this, filePath, flags, ...rest);
    };
    try {
      assert.throws(
        () => Intake.sealReadiness(directoryRace.workspace, 'beam-column-moment-real-case-intake.json'),
        /目錄或檔案實體身分發生變更/u,
        'a receipt directory swap is detected before any receipt bytes are written',
      );
    } finally {
      fs.openSync = raceOpenSync;
    }
    assert.equal(directoryRaceIntercepted, true);
    assert.equal(fs.existsSync(redirectedReceipt), true, 'exclusive create reached only an empty external sentinel before the identity check');
    assert.equal(fs.statSync(redirectedReceipt).size, 0, 'redirected receipt receives no governed receipt content');
  }

  if (process.platform !== 'win32') {
    const caseLink = materialize('case-only-parent-link');
    fs.symlinkSync(path.join(caseLink.workspace, 'inputs'), path.join(caseLink.workspace, 'INPUTS'), 'dir');
    caseLink.candidate.caseIdentity.caseSourceArtifactFile = 'INPUTS/case-source.md';
    writeJson(path.join(caseLink.workspace, 'beam-column-moment-real-case-intake.json'), caseLink.candidate);
    assert.throws(
      () => Intake.assessIntake(caseLink.workspace, 'beam-column-moment-real-case-intake.json'),
      /重新導向|越出工作區/u,
      'POSIX path comparison cannot case-fold an intermediate symlink',
    );
  }

  assert.throws(() => Intake.parseArgs(['--workspace', tempRoot, '--workspace', tempRoot, '--input', 'x.json']), /不得重複/u);
  assert.throws(() => Intake.parseArgs(['--workspace', tempRoot, '--input', 'x.json', '--seal-readiness', 'true']), /只接受明確值 yes/u);
  assert.match(Intake.usage(), /未執行 calculator，未建立 G1、G2、G3 或簽證/u);

  process.stdout.write('beam-column-moment-real-case-intake tests: PASS\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
