const assert = require('assert');
const Exporter = require('./local-quick-export.js');

function withDownloadStubs(callback) {
  const originalDocument = global.document;
  const originalBlob = global.Blob;
  const originalURL = global.URL;
  const captured = {
    appended: false,
    clicked: false,
    removed: false,
    revoked: false,
  };

  class FakeBlob {
    constructor(parts, options) {
      captured.blobParts = parts;
      captured.blobOptions = options;
    }
  }

  const link = {};
  Object.defineProperty(link, 'href', {
    set(value) { captured.href = value; },
  });
  Object.defineProperty(link, 'download', {
    set(value) { captured.download = value; },
  });
  link.click = () => { captured.clicked = true; };
  link.remove = () => { captured.removed = true; };

  global.Blob = FakeBlob;
  global.URL = {
    createObjectURL(blob) {
      captured.objectBlob = blob;
      return 'blob:local-quick-test';
    },
    revokeObjectURL(url) {
      captured.revoked = url;
    },
  };
  global.document = {
    createElement(tagName) {
      captured.createdTag = tagName;
      return link;
    },
    body: {
      appendChild(node) {
        captured.appended = node === link;
      },
    },
  };

  try {
    callback(captured);
  } finally {
    global.document = originalDocument;
    global.Blob = originalBlob;
    global.URL = originalURL;
  }
}

assert.equal(Exporter.version, '0.2.0', 'export helper version');
assert.equal(Exporter.escapeHtml('<tag>"x"&\'y\''), '&lt;tag&gt;&quot;x&quot;&amp;&#39;y&#39;', 'escapeHtml escapes critical characters');
assert.equal(Exporter.normalizeProjectFieldValue('未填'), '', 'normalizeProjectFieldValue clears placeholder project text');
assert.equal(Exporter.normalizeProjectFieldValue(' 案名 '), '案名', 'normalizeProjectFieldValue trims normal project text');
assert.deepEqual(
  Exporter.normalizeProjectMeta({ name: '未填', no: ' A-1 ', designer: ' Codex QA ', note: 'keep' }),
  { name: '', no: 'A-1', designer: 'Codex QA', note: 'keep' },
  'normalizeProjectMeta scrubs placeholder project text and keeps extra fields'
);
assert.equal(Exporter.isProjectMetaMissing({ name: '案名', no: 'A-1', designer: 'QA' }), false, 'complete project metadata passes');
assert.equal(Exporter.isProjectMetaMissing({ name: '未填', no: 'A-1', designer: 'QA' }), true, 'placeholder project name counts as missing');

const panel = { className: '', innerHTML: '' };
Exporter.renderStatusGridPanel({
  target: panel,
  level: 'review',
  eyebrow: '頁面輔助｜產報前檢查｜優先閱讀',
  title: '計算已完成，但產報前建議優先閱讀下列項目。',
  badge: '優先複核',
  items: [
    { label: '優先處理 1', value: '計畫名稱 / 編號 / 設計人尚未完整，附件識別不足。' },
    { label: '輸出邊界', value: '頁面顯示，不進計算書、列印或 PDF' },
  ],
  note: '此面板僅供公司內部整理計算附件前檢查，不會寫入計算書或列印 PDF。'
});
assert.equal(panel.className, 'report-readiness review', 'renderStatusGridPanel writes readiness class');
assert.ok(panel.innerHTML.includes('優先處理 1'), 'renderStatusGridPanel includes item labels');
assert.ok(panel.innerHTML.includes('不會寫入計算書或列印 PDF'), 'renderStatusGridPanel includes boundary note');

const compatPanel = { className: '', innerHTML: '' };
Exporter.renderStatusGridPanel({
  container: compatPanel,
  containerClassName: 'report-readiness page-only-report-status',
  panelLabel: '頁面輔助｜產報前檢查｜優先閱讀',
  model: {
    level: 'review',
    title: '計算已完成，但產報前建議優先閱讀下列項目。',
    badge: '優先複核',
    items: [
      ['控制值', '由主案例控制'],
      { label: '輸出邊界', value: '頁面顯示，不進計算書、列印或 PDF' },
    ],
  },
  priorityItems: ['先補計畫名稱'],
  note: '此面板僅供公司內部整理計算附件前檢查，不會寫入計算書或列印 PDF。',
});
assert.equal(compatPanel.className, 'report-readiness page-only-report-status review', 'renderStatusGridPanel supports shared container class');
assert.ok(compatPanel.innerHTML.includes('先補計畫名稱'), 'renderStatusGridPanel supports priorityItems');
assert.ok(compatPanel.innerHTML.includes('控制值'), 'renderStatusGridPanel normalizes tuple items');
assert.ok(compatPanel.innerHTML.includes('由主案例控制'), 'renderStatusGridPanel normalizes tuple item values');

const payload = Exporter.buildPayload({
  tool: { id: 'foundation-local', name: '基礎局部檢核', pageVersion: 'V0.1' },
  project: { name: '測試案', no: 'T-001', designer: 'QA' },
  generatedAt: '2026-05-19T12:34:56.000Z',
  input: { width: 1.2, length: 3.4 },
  result: {
    value: Infinity,
    nested: { ratio: -Infinity },
    nanValue: NaN,
  },
});

assert.deepEqual(payload.tool, { id: 'foundation-local', name: '基礎局部檢核', pageVersion: 'V0.1' });
assert.deepEqual(payload.project, { name: '測試案', no: 'T-001', designer: 'QA' });
assert.equal(payload.generatedAt, '2026-05-19T12:34:56.000Z');
assert.deepEqual(payload.input, { width: 1.2, length: 3.4 });
assert.equal(payload.result.value, Infinity);

const placeholderPayload = Exporter.buildPayload({
  tool: { id: 'equipment-load', name: '設備局部荷重', pageVersion: 'V0.2' },
  project: { name: '未填', no: 'LOCAL-VERIFY-001', designer: 'Codex QA' },
  generatedAt: '2026-05-19T13:00:00.000Z',
  result: { ok: true },
});
assert.deepEqual(
  placeholderPayload.project,
  { name: '', no: 'LOCAL-VERIFY-001', designer: 'Codex QA' },
  'buildPayload should scrub placeholder project metadata before export'
);

const serialized = JSON.stringify(payload, Exporter.jsonReplacer);
assert.ok(serialized.includes('"Infinity"'), 'serializes positive infinity as a string');
assert.ok(serialized.includes('"-Infinity"'), 'serializes negative infinity as a string');
assert.ok(serialized.includes('"NaN"'), 'serializes NaN as a string');

withDownloadStubs((captured) => {
  const returnedPayload = Exporter.downloadResultJson({
    tool: { id: 'foundation-local', name: '基礎局部檢核', pageVersion: 'V0.1' },
    project: { name: '未填', no: 'LOCAL-VERIFY-001', designer: 'Codex QA' },
    generatedAt: '2026-05-19T12:34:56.000Z',
    input: { fs: 10 },
    result: { fs: Infinity },
  });

  assert.equal(captured.createdTag, 'a');
  assert.equal(captured.href, 'blob:local-quick-test');
  assert.equal(captured.download, 'foundation-local-2026-05-19.json');
  assert.equal(captured.blobOptions.type, 'application/json;charset=utf-8');
  assert.ok(captured.appended, 'download link appended to document');
  assert.ok(captured.clicked, 'download link clicked');
  assert.ok(captured.removed, 'download link removed');
  assert.equal(captured.revoked, 'blob:local-quick-test');

  const downloaded = JSON.parse(captured.blobParts[0]);
  assert.equal(downloaded.tool.id, 'foundation-local');
  assert.equal(downloaded.generatedAt, '2026-05-19T12:34:56.000Z');
  assert.equal(downloaded.project.name, '', 'downloadResultJson should scrub placeholder project metadata');
  assert.equal(downloaded.project.no, 'LOCAL-VERIFY-001', 'downloadResultJson should keep project number');
  assert.equal(downloaded.project.designer, 'Codex QA', 'downloadResultJson should keep project designer');
  assert.equal(downloaded.input.fs, 10);
  assert.equal(downloaded.result.fs, 'Infinity');
  assert.equal(returnedPayload.input.fs, 10);
  assert.equal(returnedPayload.result.fs, Infinity);
});

withDownloadStubs((captured) => {
  Exporter.downloadJson('custom-case.json', { value: -Infinity });
  assert.equal(captured.download, 'custom-case.json');
  assert.equal(JSON.parse(captured.blobParts[0]).value, '-Infinity');
});

withDownloadStubs((captured) => {
  const returnedPayload = Exporter.downloadProjectJson({
    tool: { id: 'equipment-load', name: '設備局部荷重', pageVersion: 'V0.2' },
    project: { name: '暫存案' },
    generatedAt: '2026-05-20T08:00:00.000Z',
    input: { supportCount: 4 },
    result: { utilization: 0.72 },
  });

  assert.equal(captured.download, 'equipment-load-project-2026-05-20.json');
  assert.equal(JSON.parse(captured.blobParts[0]).tool.id, 'equipment-load');
  assert.equal(returnedPayload.input.supportCount, 4);
});

const fakeStorage = {
  data: Object.create(null),
  setItem(key, value) { this.data[key] = value; },
  getItem(key) { return this.data[key] || null; },
};
Exporter.saveDraft('draft-key', { input: { H: 2.5 }, result: { fs: Infinity } }, fakeStorage);
const loadedDraft = Exporter.loadDraft('draft-key', fakeStorage);
assert.deepEqual(loadedDraft.input, { H: 2.5 });
assert.equal(loadedDraft.result.fs, 'Infinity');

console.log('local quick export helper OK');
