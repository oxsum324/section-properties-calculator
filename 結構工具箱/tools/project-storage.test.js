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

const fieldA = makeField('projectName', '測試案');
const fieldB = makeField('checkDetail', 'on', 'checkbox');
fieldB.checked = true;
const fileField = makeField('jsonFile', '', 'file');
const fields = [fieldA, fieldB, fileField];

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
assert.deepEqual(collected.projectName, { type: 'text', value: '測試案' });
assert.deepEqual(collected.checkDetail, { type: 'checkbox', checked: true, value: 'on' });
assert.equal(collected.jsonFile, undefined);

Storage.applyFields({
  projectName: { type: 'text', value: '讀取案' },
  checkDetail: { type: 'checkbox', checked: false, value: 'on' },
}, fakeDocument);

assert.equal(fieldA.value, '讀取案');
assert.deepEqual(fieldA.events, ['input', 'change']);
assert.equal(fieldB.checked, false);
assert.deepEqual(fieldB.events, ['input', 'change']);

const payload = Storage.buildPayload({ id: 'wind-kzt', name: 'Kzt' }, fakeDocument);
assert.equal(payload.schema, 'tool-project-storage.v1');
assert.equal(payload.tool.id, 'wind-kzt');
assert.equal(payload.fields.projectName.value, '讀取案');
assert.equal(Storage.safeFileName('A/B:C*D?E'), 'A-B-C-D-E');

console.log('project storage helper OK');
