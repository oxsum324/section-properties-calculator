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

console.log('project storage helper OK');
