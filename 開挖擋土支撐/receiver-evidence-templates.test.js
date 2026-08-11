const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, 'frontend', 'node_modules', 'typescript'));

const sourcePath = path.join(__dirname, 'frontend', 'src', 'receiverEvidenceTemplates.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
  },
  fileName: sourcePath,
}).outputText;
const moduleUnderTest = { exports: {} };
new Function('exports', 'module', 'require', compiled)(moduleUnderTest.exports, moduleUnderTest, require);

const {
  applyReceiverEvidenceTemplate,
  approveReceiverEvidenceTemplate,
  buildReceiverEvidenceTemplateLibrary,
  mergeReceiverEvidenceTemplates,
  parseReceiverEvidenceTemplateLibrary,
  prepareImportedReceiverEvidenceTemplates,
  receiverEvidenceTemplateAvailability,
  reviseReceiverEvidenceTemplate,
  revokeReceiverEvidenceTemplateApproval,
  templateFromSupplementalCheck,
  validateReceiverEvidenceTemplate,
} = moduleUnderTest.exports;

const createdAt = '2026-08-11T08:00:00.000Z';
const reviewedAt = '2026-08-11T09:00:00.000Z';
const revisedAt = '2026-08-11T10:00:00.000Z';
const check = {
  checkId: 'connection',
  status: 'passed',
  basis: '依接頭計算書第 4 節檢核。',
  evidence: {
    documentReference: 'CONN-001',
    revision: 'A',
    issuedDate: '2026-08-11',
    pageReference: '第 4-6 頁',
    fileName: 'connection.pdf',
    fileSha256: 'a'.repeat(64),
  },
};

const draft = templateFromSupplementalCheck(check, 'RET-001', '接頭與接合｜CONN-001｜A', createdAt);
assert.equal(draft.governance.status, 'draft');
assert.equal(draft.governance.revision, 1);
assert.deepEqual(draft.governance.changeLog[0].changedFields, ['建立範本']);
assert.deepEqual(draft.evidence, {
  documentReference: 'CONN-001',
  revision: 'A',
  issuedDate: '2026-08-11',
  pageReference: '第 4-6 頁',
});
assert.equal('fileName' in draft.evidence, false, 'template must not persist evidence fileName');
assert.equal('fileSha256' in draft.evidence, false, 'template must not persist evidence SHA-256');
assert.deepEqual(receiverEvidenceTemplateAvailability(draft, '2026-08-11'), {
  usable: false,
  status: 'draft',
  reason: '待本機核准',
});
assert.throws(
  () => applyReceiverEvidenceTemplate({ checkId: 'connection', status: 'failed', basis: '待查核' }, draft, '2026-08-11'),
  /待本機核准/,
);

const approved = approveReceiverEvidenceTemplate(draft, '王小明', reviewedAt, '2026-12-31');
assert.equal(approved.governance.status, 'approved');
assert.equal(approved.governance.reviewedBy, '王小明');
assert.equal(receiverEvidenceTemplateAvailability(approved, '2026-12-31').usable, true);
assert.deepEqual(receiverEvidenceTemplateAvailability(approved, '2027-01-01'), {
  usable: false,
  status: 'expired',
  reason: '已於 2026-12-31 到期',
});

const applied = applyReceiverEvidenceTemplate({
  checkId: 'connection',
  status: 'failed',
  basis: '尚未完成正式查核。',
}, approved, '2026-08-11');
assert.equal(applied.status, 'passed');
assert.equal(applied.basis, check.basis);
assert.equal(applied.evidence.fileName, '', 'applying a template requires a fresh evidence file selection');
assert.equal(applied.evidence.fileSha256, '', 'applying a template cannot reuse a prior evidence hash');
assert.throws(
  () => applyReceiverEvidenceTemplate({ checkId: 'connection', status: 'failed', basis: '待查核' }, approved, '2027-01-01'),
  /已於 2026-12-31 到期/,
);

const revised = reviseReceiverEvidenceTemplate(approved, {
  ...check,
  basis: '依接頭計算書第 5 節及修訂圖 A2 檢核。',
  evidence: { ...check.evidence, revision: 'B', pageReference: '第 7-9 頁' },
}, '接頭與接合｜CONN-001｜B', revisedAt);
assert.equal(revised.governance.status, 'draft', 'content revision must revoke approval');
assert.equal(revised.governance.revision, 2);
assert.equal(revised.governance.reviewedBy, '');
assert.deepEqual(revised.governance.changeLog[1].changedFields, ['範本名稱', '查核依據', '文件版次', '頁碼／章節']);
assert.throws(
  () => applyReceiverEvidenceTemplate({ checkId: 'connection', status: 'failed', basis: '待查核' }, revised, '2026-08-11'),
  /待本機核准/,
);
assert.deepEqual(
  reviseReceiverEvidenceTemplate(revised, {
    ...check,
    basis: revised.basis,
    evidence: { ...check.evidence, ...revised.evidence },
  }, revised.name, '2026-08-11T11:00:00.000Z'),
  revised,
  'saving unchanged content must not create a false revision',
);

const revoked = revokeReceiverEvidenceTemplateApproval(approved, revisedAt);
assert.equal(revoked.governance.status, 'draft');
assert.equal(revoked.governance.revision, 1, 'approval revocation does not change content revision');

const library = buildReceiverEvidenceTemplateLibrary([approved], reviewedAt);
assert.equal(library.schemaVersion, 2);
assert.equal(library.boundary.evidenceFileSha256Excluded, true);
assert.equal(library.boundary.governanceRequiredBeforeApply, true);
assert.equal(library.boundary.importedApprovalRequiresLocalReview, true);
assert.deepEqual(parseReceiverEvidenceTemplateLibrary(JSON.parse(JSON.stringify(library))), [approved]);

const imported = prepareImportedReceiverEvidenceTemplates(parseReceiverEvidenceTemplateLibrary(library));
assert.equal(imported[0].governance.status, 'draft', 'external approval cannot become local trust');
assert.equal(imported[0].governance.reviewedBy, '');
assert.throws(
  () => applyReceiverEvidenceTemplate({ checkId: 'connection', status: 'failed', basis: '待查核' }, imported[0], '2026-08-11'),
  /待本機核准/,
);

const legacyLibrary = {
  schemaVersion: 1,
  kind: library.kind,
  exportedAt: reviewedAt,
  boundary: {
    descriptiveFieldsOnly: true,
    evidenceFileNameExcluded: true,
    evidenceFileSha256Excluded: true,
    actualEvidenceFileRequiredAfterApply: true,
  },
  templates: [{
    templateId: draft.templateId,
    name: draft.name,
    checkId: draft.checkId,
    basis: draft.basis,
    evidence: draft.evidence,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  }],
};
const migrated = parseReceiverEvidenceTemplateLibrary(legacyLibrary);
assert.equal(migrated[0].governance.status, 'draft');
assert.match(migrated[0].governance.changeLog[0].changedFields[0], /v1 遷移/);

const newer = { ...revised, updatedAt: '2026-08-11T12:00:00.000Z' };
assert.deepEqual(mergeReceiverEvidenceTemplates([draft], [newer]), [newer]);

assert.throws(
  () => validateReceiverEvidenceTemplate({
    ...draft,
    evidence: { ...draft.evidence, fileSha256: 'b'.repeat(64) },
  }),
  /不得保存證據檔名或 SHA-256/,
);
assert.throws(
  () => validateReceiverEvidenceTemplate({ ...draft, approvalStatus: 'approved' }),
  /不允許的欄位/,
);
assert.throws(
  () => validateReceiverEvidenceTemplate({
    ...draft,
    governance: { ...draft.governance, trustedSignature: 'forged' },
  }),
  /不允許的欄位/,
);
assert.throws(
  () => approveReceiverEvidenceTemplate(draft, '', reviewedAt, '2026-12-31'),
  /審核人/,
);
assert.throws(
  () => approveReceiverEvidenceTemplate(draft, '王小明', reviewedAt, '2026-08-10'),
  /不得早於核准日期/,
);
assert.throws(
  () => applyReceiverEvidenceTemplate({ checkId: 'bearing', status: 'failed', basis: '待查核' }, approved, '2026-08-11'),
  /範本類別與目前補充查核不一致/,
);
assert.throws(
  () => parseReceiverEvidenceTemplateLibrary({ ...library, boundary: { ...library.boundary, governanceRequiredBeforeApply: false } }),
  /未完整聲明治理、檔案與雜湊排除邊界/,
);
assert.throws(
  () => parseReceiverEvidenceTemplateLibrary({ ...library, templates: [approved, approved] }),
  /重複的範本識別碼/,
);
assert.throws(
  () => parseReceiverEvidenceTemplateLibrary({ ...library, templates: Array.from({ length: 101 }, (_, index) => ({
    ...approved,
    templateId: `RET-${index}`,
  })) }),
  /最多 100 筆/,
);
assert.throws(
  () => validateReceiverEvidenceTemplate({ ...draft, evidence: { ...draft.evidence, issuedDate: '2026-02-30' } }),
  /不是有效日期/,
);

console.log('receiver evidence templates v2 governance OK');
