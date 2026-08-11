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
  buildReceiverEvidenceTemplateLibrary,
  mergeReceiverEvidenceTemplates,
  parseReceiverEvidenceTemplateLibrary,
  templateFromSupplementalCheck,
  validateReceiverEvidenceTemplate,
} = moduleUnderTest.exports;

const createdAt = '2026-08-11T08:00:00.000Z';
const updatedAt = '2026-08-11T09:00:00.000Z';
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

const template = templateFromSupplementalCheck(
  check,
  'RET-001',
  '接頭與接合｜CONN-001｜A',
  updatedAt,
  createdAt,
);

assert.deepEqual(template.evidence, {
  documentReference: 'CONN-001',
  revision: 'A',
  issuedDate: '2026-08-11',
  pageReference: '第 4-6 頁',
});
assert.equal('fileName' in template.evidence, false, 'template must not persist evidence fileName');
assert.equal('fileSha256' in template.evidence, false, 'template must not persist evidence SHA-256');

const applied = applyReceiverEvidenceTemplate({
  checkId: 'connection',
  status: 'failed',
  basis: '尚未完成正式查核。',
}, template);
assert.equal(applied.status, 'passed');
assert.equal(applied.basis, check.basis);
assert.equal(applied.evidence.fileName, '', 'applying a template requires a fresh evidence file selection');
assert.equal(applied.evidence.fileSha256, '', 'applying a template cannot reuse a prior evidence hash');

const library = buildReceiverEvidenceTemplateLibrary([template], updatedAt);
assert.equal(library.boundary.evidenceFileSha256Excluded, true);
assert.equal(library.boundary.actualEvidenceFileRequiredAfterApply, true);
assert.deepEqual(parseReceiverEvidenceTemplateLibrary(JSON.parse(JSON.stringify(library))), [template]);

const newer = { ...template, name: '新版範本', updatedAt: '2026-08-11T10:00:00.000Z' };
assert.deepEqual(mergeReceiverEvidenceTemplates([template], [newer]), [newer]);

assert.throws(
  () => validateReceiverEvidenceTemplate({
    ...template,
    evidence: { ...template.evidence, fileSha256: 'b'.repeat(64) },
  }),
  /不得保存證據檔名或 SHA-256/,
);
assert.throws(
  () => validateReceiverEvidenceTemplate({ ...template, approvalStatus: 'approved' }),
  /不允許的欄位/,
);
assert.throws(
  () => applyReceiverEvidenceTemplate({ checkId: 'bearing', status: 'failed', basis: '待查核' }, template),
  /範本類別與目前補充查核不一致/,
);
assert.throws(
  () => parseReceiverEvidenceTemplateLibrary({ ...library, boundary: { ...library.boundary, evidenceFileSha256Excluded: false } }),
  /未完整聲明檔案與雜湊排除邊界/,
);
assert.throws(
  () => parseReceiverEvidenceTemplateLibrary({ ...library, templates: [template, template] }),
  /重複的範本識別碼/,
);
assert.throws(
  () => parseReceiverEvidenceTemplateLibrary({ ...library, templates: Array.from({ length: 101 }, (_, index) => ({
    ...template,
    templateId: `RET-${index}`,
  })) }),
  /最多 100 筆/,
);
assert.throws(
  () => validateReceiverEvidenceTemplate({ ...template, evidence: { ...template.evidence, issuedDate: '2026-02-30' } }),
  /不是有效日期/,
);

console.log('receiver evidence templates OK');
