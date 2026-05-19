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

assert.equal(Exporter.version, '0.1.0', 'export helper version');

const payload = Exporter.buildPayload({
  tool: { id: 'foundation-local', name: '基礎局部檢核', pageVersion: 'V0.1' },
  project: { name: '測試案', no: 'T-001', designer: 'QA' },
  generatedAt: '2026-05-19T12:34:56.000Z',
  result: {
    value: Infinity,
    nested: { ratio: -Infinity },
    nanValue: NaN,
  },
});

assert.deepEqual(payload.tool, { id: 'foundation-local', name: '基礎局部檢核', pageVersion: 'V0.1' });
assert.deepEqual(payload.project, { name: '測試案', no: 'T-001', designer: 'QA' });
assert.equal(payload.generatedAt, '2026-05-19T12:34:56.000Z');
assert.equal(payload.result.value, Infinity);

const serialized = JSON.stringify(payload, Exporter.jsonReplacer);
assert.ok(serialized.includes('"Infinity"'), 'serializes positive infinity as a string');
assert.ok(serialized.includes('"-Infinity"'), 'serializes negative infinity as a string');
assert.ok(serialized.includes('"NaN"'), 'serializes NaN as a string');

withDownloadStubs((captured) => {
  const returnedPayload = Exporter.downloadResultJson({
    tool: { id: 'foundation-local', name: '基礎局部檢核', pageVersion: 'V0.1' },
    project: { name: '測試案' },
    generatedAt: '2026-05-19T12:34:56.000Z',
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
  assert.equal(downloaded.result.fs, 'Infinity');
  assert.equal(returnedPayload.result.fs, Infinity);
});

withDownloadStubs((captured) => {
  Exporter.downloadJson('custom-case.json', { value: -Infinity });
  assert.equal(captured.download, 'custom-case.json');
  assert.equal(JSON.parse(captured.blobParts[0]).value, '-Infinity');
});

console.log('local quick export helper OK');
