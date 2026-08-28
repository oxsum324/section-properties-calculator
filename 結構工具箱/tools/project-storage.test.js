const assert = require('assert');
const Storage = require('./project-storage.js');

assert.equal(Storage.version, '0.4.0', 'project storage helper exposes the cache-busting API version');

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
const fieldE = makeField('city', '臺北市', 'select-one');
fieldE.options = [{ value: '臺北市' }, { value: '高雄市' }];
fieldC.checked = true;
const fileField = makeField('jsonFile', '', 'file');
const fields = [fieldA, fieldB, fieldC, fieldD, fieldE, fileField];

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
    city: { type: 'select-one', value: '已刪除城市' },
    retiredInput: { type: 'number', value: '12' },
  },
}, { id: 'wind-kzt', name: 'Kzt', version: 'V1' }, fakeDocument);
assert.equal(compatibility.storageVersion, '0.1.0');
assert.deepEqual(compatibility.unknownFieldIds, ['retiredInput']);
assert.ok(compatibility.missingFieldIds.includes('projNo'));
assert.deepEqual(compatibility.incompatibleFieldIds, ['checkDetail']);
assert.deepEqual(compatibility.unavailableOptionFieldIds, ['city']);
assert.ok(compatibility.notices.some(notice => notice.includes('儲存格式 0.1.0')));
assert.ok(compatibility.notices.some(notice => notice.includes('工具版本 V0')));

const mismatchedApply = Storage.applyFields({
  checkDetail: { type: 'text', value: '不應套用' },
  city: { type: 'select-one', value: '已刪除城市' },
}, fakeDocument);
assert.deepEqual(mismatchedApply.appliedFieldIds, []);
assert.deepEqual(mismatchedApply.skippedFieldIds, ['checkDetail', 'city']);
assert.deepEqual(mismatchedApply.unavailableOptionFieldIds, ['city']);
assert.equal(fieldC.checked, false);
assert.equal(fieldE.value, '臺北市');

const payload = Storage.buildPayload({ id: 'wind-kzt', name: 'Kzt' }, fakeDocument);
assert.equal(payload.schema, 'tool-project-storage.v1');
assert.equal(payload.tool.id, 'wind-kzt');
assert.equal(payload.fields.projName.value, '');
assert.equal(payload.fields.projNo.value, 'B-2');
assert.equal(payload.fields.projectDesigner.value, '驗證者');
assert.equal(payload.review, null, 'project storage leaves review blank until a person confirms it');
const reviewSnapshot = Storage.buildReviewSnapshotFromFields(payload.fields);
assert.match(reviewSnapshot, /^RS-[0-9A-F]{8}$/, 'project storage creates a stable review snapshot');
assert.equal(Storage.buildReviewSnapshotFromFields(payload.fields), reviewSnapshot, 'review snapshot is deterministic');
const confirmedReview = Storage.evaluateReviewRecord({
  reviewer: '複核人員',
  reviewedAt: '2026-07-12T03:00:00.000Z',
  reviewedSnapshot: reviewSnapshot,
}, reviewSnapshot);
assert.equal(confirmedReview.status, 'confirmed', 'matching case data keeps review confirmed');
assert.equal(Storage.evaluateReviewRecord({
  reviewer: '複核人員',
  reviewedAt: '2026-07-12T03:00:00.000Z',
  reviewedSnapshot: reviewSnapshot,
}, 'RS-CHANGED').status, 'stale', 'changed case data requires review again');
assert.equal(Storage.safeFileName('A/B:C*D?E'), 'A-B-C-D-E');

const draftValues = new Map();
const draftStorage = {
  getItem(key) { return draftValues.has(key) ? draftValues.get(key) : null; },
  setItem(key, value) { draftValues.set(key, String(value)); },
};
const draftStatuses = [];
let draftSource = { schemaVersion: 'seismic-force.case.v3', inputs: { values: { H: '30' } } };
let appliedDraft = null;
let draftRefreshCount = 0;
const draftController = Storage.createCaseDraftController({
  pathname: '/section-properties-calculator/seismic-force/',
  schemaVersion: 'seismic-force.case.v3',
  storage: draftStorage,
  buildPayload: () => draftSource,
  applyPayload: value => { appliedDraft = value; },
  refresh: () => { draftRefreshCount += 1; },
  setStatus: (message, tone) => draftStatuses.push({ message, tone }),
});
assert.equal(draftController.version, '1.0.0', 'case draft controller exposes its contract version');
assert.equal(
  draftController.storageKey,
  'toolCaseDraft:/section-properties-calculator/seismic-force/:seismic-force.case.v3',
  'case draft key preserves the existing pathname and schema convention'
);
assert.equal(draftController.save().ok, true, 'case draft controller saves the page payload');
draftSource = { schemaVersion: 'seismic-force.case.v3', inputs: { values: { H: '99' } } };
const loadedDraft = draftController.load();
assert.equal(loadedDraft.ok, true, 'case draft controller reloads the stored payload');
assert.equal(appliedDraft.inputs.values.H, '30', 'case draft controller restores the saved state instead of the later page state');
assert.equal(draftRefreshCount, 1, 'case draft controller recalculates after applying a draft');
assert.ok(draftStatuses.some(item => item.message.includes('已暫存目前案件')), 'case draft controller reports save success');
assert.ok(draftStatuses.some(item => item.message.includes('已讀取瀏覽器暫存')), 'case draft controller reports load success');

const missingDraftStatuses = [];
const missingDraftController = Storage.createCaseDraftController({
  pathname: '/missing/',
  schemaVersion: 'v1',
  storage: draftStorage,
  buildPayload: () => ({}),
  applyPayload: () => { throw new Error('missing draft must not apply'); },
  setStatus: (message, tone) => missingDraftStatuses.push({ message, tone }),
});
assert.deepEqual(missingDraftController.load().reason, 'missing', 'missing case draft remains a non-destructive warning');
assert.equal(missingDraftStatuses.at(-1).tone, 'warn', 'missing case draft uses warning status');

const storageSource = require('fs').readFileSync(require.resolve('./project-storage.js'), 'utf8');
assert(storageSource.includes("['runCheck', 'calc', 'calculate', 'compute', 'renderSummaryFromFields', 'renderSummary', 'loadOverview']"), 'project storage refreshPage checks renderSummaryFromFields before loadOverview');
assert(storageSource.includes('continue;'), 'project storage refreshPage keeps trying later refresh candidates after an earlier helper throws');
assert(storageSource.includes("@media print{.' + CONTROL_CLASS + '{display:none!important;}}"), 'project storage bar stays screen-only and does not print into PDF output');
assert(storageSource.includes('data-project-storage-preview'), 'project storage shows compatibility preview before applying a saved case');
assert(storageSource.includes('data-project-storage-apply'), 'project storage requires explicit application after preview');
assert(storageSource.includes('data-project-review-confirm'), 'project storage has an explicit page-only review confirmation');
assert(storageSource.includes('案件資料或計算輸入已變更'), 'project storage invalidates review after case data changes');
assert(storageSource.includes('不會寫入計算書、列印或 PDF'), 'project storage keeps manual review out of reports and PDF output');
assert(storageSource.includes('已不存在的選項而保留本頁值'), 'project storage warns before skipping retired select options');
assert(storageSource.includes("scriptEl?.dataset.autoBind === 'false'"), 'project storage can expose shared helpers without injecting the generic storage bar');

console.log('project storage helper OK');
