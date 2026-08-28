const assert = require('assert');
const Storage = require('./project-storage.js');

function fakeElement(id, options = {}) {
  const events = [];
  return {
    id,
    tagName: options.tagName || 'INPUT',
    type: options.type || 'text',
    value: options.value ?? '',
    checked: !!options.checked,
    options: options.options || [],
    events,
    dispatchEvent(event) { events.push(event.type); },
  };
}

const projectName = fakeElement('projName', { value: '  A 工程  ' });
const projectNo = fakeElement('projNo', { value: '未填' });
const demand = fakeElement('Mu', { type: 'number', value: '88' });
const checkbox = fakeElement('showSteps', { type: 'checkbox', checked: true });
const select = fakeElement('mode', {
  tagName: 'SELECT',
  value: 'design',
  options: [{ value: 'design' }, { value: 'check' }],
});
const file = fakeElement('projectFile', { type: 'file' });
const excluded = fakeElement('caseJson', { tagName: 'TEXTAREA', value: '{ignore}' });
const elements = { projName: projectName, projNo: projectNo, Mu: demand, showSteps: checkbox, mode: select, projectFile: file, caseJson: excluded };

let clicked = false;
let appended = false;
let removed = false;
let revoked = '';
let capturedBlob = null;
const documentRef = {
  body: { appendChild() { appended = true; } },
  querySelectorAll() { return Object.values(elements); },
  getElementById(id) { return elements[id] || null; },
  createElement(tag) {
    assert.strictEqual(tag, 'a');
    return {
      click() { clicked = true; },
      remove() { removed = true; },
    };
  },
};
class FakeBlob {
  constructor(parts, options) { this.parts = parts; this.type = options.type; capturedBlob = this; }
}
const urlApi = {
  createObjectURL() { return 'blob:project'; },
  revokeObjectURL(value) { revoked = value; },
};
const draft = new Map();
const storage = {
  setItem(key, value) { draft.set(key, value); },
  getItem(key) { return draft.has(key) ? draft.get(key) : null; },
};
const manager = Storage.createManager({
  documentRef,
  excludedIds: ['caseJson'],
  storageKey: 'rc.project.test',
  fallbackBase: 'RC測試專案',
  storage,
  BlobCtor: FakeBlob,
  urlApi,
  EventCtor: class { constructor(type) { this.type = type; } },
  now: () => new Date('2026-08-28T12:34:56.000Z'),
});

const fields = manager.collectFields();
assert.deepStrictEqual(Object.keys(fields), ['projName', 'projNo', 'Mu', 'showSteps', 'mode']);
assert.strictEqual(fields.projName.value, 'A 工程');
assert.strictEqual(fields.projNo.value, '');
assert.strictEqual(fields.showSteps.checked, true);

assert.strictEqual(manager.setControl('Mu', { value: '99' }), true);
assert.strictEqual(demand.value, '99');
assert.deepStrictEqual(demand.events, ['input', 'change']);
assert.strictEqual(manager.setControl('mode', { value: 'missing' }), false, 'unknown select options must fail closed');
assert.strictEqual(select.value, 'design');
assert.strictEqual(manager.applyFields({ showSteps: { checked: false }, mode: { value: 'check' }, missing: { value: 'x' } }), 2);
assert.strictEqual(checkbox.checked, false);
assert.strictEqual(select.value, 'check');

const payload = {
  schema: 'rc-test-project-v1',
  metadata: { projectNo: 'P:001', projectName: 'A 工程' },
  fields,
};
assert.strictEqual(manager.projectDisplayName(payload), 'A 工程');
assert.strictEqual(manager.buildFilename(payload), 'P_001_A_工程_20260828123456.json');
const downloaded = manager.downloadJson(payload);
assert.strictEqual(downloaded, 'P_001_A_工程_20260828123456.json');
assert.ok(clicked && appended && removed, 'download should attach, click, and remove its anchor');
assert.strictEqual(revoked, 'blob:project');
assert.strictEqual(capturedBlob.type, 'application/json;charset=utf-8');
assert.deepStrictEqual(JSON.parse(capturedBlob.parts[0]), payload);

manager.writeDraft(payload);
assert.deepStrictEqual(JSON.parse(manager.readDraft()), payload);
assert.strictEqual(Storage.createManager({ storageKey: 'empty', storage }).readDraft(), null);

(async () => {
  assert.strictEqual(await manager.readProjectFile({ size: 2, text: async () => '{}' }), '{}');
  await assert.rejects(
    () => manager.readProjectFile({ size: Storage.DEFAULT_MAX_FILE_BYTES + 1, text: async () => '{}' }),
    /超過 1024 KiB 上限/,
  );
  await assert.rejects(
    () => manager.readProjectFile({ size: 1, text: async () => 'x'.repeat(Storage.DEFAULT_MAX_FILE_BYTES + 1) }),
    /超過 1024 KiB 上限/,
  );
  console.log('RC shared project storage tests OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
