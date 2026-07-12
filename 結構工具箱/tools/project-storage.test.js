const assert = require('assert');
const Storage = require('./project-storage.js');

function makeField(id, value, type = 'text') {
  return {
    id,
    type,
    value,
    checked: false,
    tagName: 'INPUT',
    closest() { return null; },
    dispatchEvent(event) {
      this.events = this.events || [];
      this.events.push(event.type);
    },
  };
}

const fieldA = makeField('projName', '未填');
const fieldB = makeField('projNo', ' A-1 ');
const fieldC = makeField('checkDetail', 'on', 'checkbox');
const fieldD = makeField('projectDesigner', ' Codex QA ');
fieldC.checked = true;
const fileField = makeField('jsonFile', '', 'file');
const fields = [fieldA, fieldB, fieldC, fieldD, fileField];

const fakeDocument = {
  querySelectorAll(selector) {
    assert.equal(selector, 'input[id], select[id], textarea[id]');
    return fields;
  },
  getElementById(id) {
    return fields.find(field => field.id === id) || null;
  },
};

const collected = Storage.collectFields(fakeDocument);
assert.deepEqual(collected.projName, { type: 'text', value: '' });
assert.deepEqual(collected.projNo, { type: 'text', value: 'A-1' });
assert.deepEqual(collected.checkDetail, { type: 'checkbox', checked: true, value: 'on' });
assert.deepEqual(collected.projectDesigner, { type: 'text', value: 'Codex QA' });
assert.equal(collected.jsonFile, undefined);
assert.equal(Storage.normalizeProjectFieldValue('未填'), '', 'project storage clears placeholder project text');
assert.equal(Storage.normalizeProjectFieldValue(' Codex QA '), 'Codex QA', 'project storage trims project text');

Storage.applyFields({
  projName: { type: 'text', value: '未填' },
  projNo: { type: 'text', value: ' B-2 ' },
  projectDesigner: { type: 'text', value: ' 驗證者 ' },
  checkDetail: { type: 'checkbox', checked: false, value: 'on' },
}, fakeDocument);

assert.equal(fieldA.value, '');
assert.deepEqual(fieldA.events, ['input', 'change']);
assert.equal(fieldB.value, 'B-2');
assert.deepEqual(fieldB.events, ['input', 'change']);
assert.equal(fieldC.checked, false);
assert.deepEqual(fieldC.events, ['input', 'change']);
assert.equal(fieldD.value, '驗證者');
assert.deepEqual(fieldD.events, ['input', 'change']);

const compatibility = Storage.inspectPayload({
  schema: 'tool-project-storage.v1',
  storageVersion: '0.1.0',
  tool: { id: 'wind-kzt', name: 'Kzt', version: 'V0' },
  fields: {
    projName: { type: 'text', value: '舊案' },
    checkDetail: { type: 'text', value: '不應套用' },
    retiredInput: { type: 'number', value: '12' },
  },
}, { id: 'wind-kzt', name: 'Kzt', version: 'V1' }, fakeDocument);
assert.equal(compatibility.storageVersion, '0.1.0');
assert.deepEqual(compatibility.unknownFieldIds, ['retiredInput']);
assert.ok(compatibility.missingFieldIds.includes('projNo'));
assert.deepEqual(compatibility.incompatibleFieldIds, ['checkDetail']);
assert.ok(compatibility.notices.some(notice => notice.includes('儲存格式 0.1.0')));
assert.ok(compatibility.notices.some(notice => notice.includes('工具版本 V0')));

const mismatchedApply = Storage.applyFields({
  checkDetail: { type: 'text', value: '不應套用' },
}, fakeDocument);
assert.deepEqual(mismatchedApply.appliedFieldIds, []);
assert.deepEqual(mismatchedApply.skippedFieldIds, ['checkDetail']);
assert.equal(fieldC.checked, false);

const payload = Storage.buildPayload({ id: 'wind-kzt', name: 'Kzt' }, fakeDocument);
assert.equal(payload.schema, 'tool-project-storage.v1');
assert.equal(payload.tool.id, 'wind-kzt');
assert.equal(payload.fields.projName.value, '');
assert.equal(payload.fields.projNo.value, 'B-2');
assert.equal(payload.fields.projectDesigner.value, '驗證者');
assert.equal(Storage.safeFileName('A/B:C*D?E'), 'A-B-C-D-E');
const storageSource = require('fs').readFileSync(require.resolve('./project-storage.js'), 'utf8');
assert(storageSource.includes("['runCheck', 'calc', 'calculate', 'compute', 'renderSummaryFromFields', 'renderSummary', 'loadOverview']"), 'project storage refreshPage checks renderSummaryFromFields before loadOverview');
assert(storageSource.includes('continue;'), 'project storage refreshPage keeps trying later refresh candidates after an earlier helper throws');
assert(storageSource.includes("@media print{.' + CONTROL_CLASS + '{display:none!important;}}"), 'project storage bar stays screen-only and does not print into PDF output');
assert(storageSource.includes('data-project-storage-preview'), 'project storage shows compatibility preview before applying a saved case');
assert(storageSource.includes('data-project-storage-apply'), 'project storage requires explicit application after preview');

console.log('project storage helper OK');
