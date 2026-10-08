const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createReportUtils } = require('./結構工具箱/core/ui/report-utils.js');
const { createRcReportUtils } = require('./鋼筋混凝土/shared/report-utils.js');

// f6310e2f 的既有策略：RC 文字不轉引號，RC 屬性僅雙引號，core 兩種皆轉。
const legacyEscape = {
  none: value => (value == null ? '' : String(value)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  double: value => (value == null ? '' : String(value)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  all: value => (value == null ? '' : String(value)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
};
const utils = createReportUtils({ TextEncoder });
assert.equal(utils.containsTexFormula('plain text'), false);
assert.equal(utils.containsTexFormula('<script>var sample = "\\\\(";</script>plain text'), false);
assert.equal(utils.containsTexFormula('<p>\\(V_u\\)</p>'), true);
assert.equal(utils.containsTexFormula('<style>.x::after{content:"\\\\["}</style><p>plain</p>'), false);
assert.equal(utils.formatTexFallback('\\(V_u = \\frac{V_u}{\\phi V_n}\\)'), 'V_(u) = (V_(u)) / (φ V_(n))');
assert.equal(utils.formatTexFallback('\\[A_{s} \\geq 0.01\\%\\]'), 'A_(s) ≥ 0.01%');
for (const value of [null, undefined, 0, false, NaN, '&<>"\' 中文 😀', { value: 1 }]) {
  for (const mode of Object.keys(legacyEscape)) assert.equal(utils.escapeHtml(value, mode), legacyEscape[mode](value));
}
assert.equal(utils.formatTimestamp(new Date(2026, 9, 3, 4, 5, 6)), '2026/10/03 04:05:06');
assert.equal(utils.formatTimestamp('not-a-date'), 'NaN/NaN/NaN NaN:NaN:NaN');
assert.deepEqual(utils.normalizeFingerprintValue({
  z: undefined, html: 'excluded', dataURL: 'excluded', a: [null, false, 0, -0, Infinity, -Infinity, NaN, '😀'],
  nested: { b: 2, a: 1, html: 'excluded' },
}), {
  a: [null, 'false', '0', '0', 'Infinity', '-Infinity', 'NaN', '😀'], nested: { a: '1', b: '2' }, z: null,
});
// 原始 FNV 以 UTF-16 code unit 遍歷；不可在抽取時改成 Unicode code point。
function legacyFingerprintHash(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
for (const text of ['', 'abc', '計算書', '😀𠀀', '\ud800']) {
  for (const seed of [0, 0x811C9DC5, 0x9E3779B9, -1]) {
    assert.equal(utils.fingerprintHash(text, seed), legacyFingerprintHash(text, seed));
  }
}
assert.equal(utils.cleanText('  案名\u00a0甲\r\n  梁\t😀  '), '案名 甲 梁 😀');
assert.equal(utils.cleanText(0), '');
assert.equal(utils.artifactBaseName('梁/柱\\甲:*?<>"|', '正式附件', 'CF-123'), '梁-柱-甲-------_正式附件_CF-123');
assert.equal(utils.artifactBaseName('  梁  ', '', ''), '梁');

const shaSamples = ['', 'abc', '鋼筋混凝土：計算書', '😀𠀀', 'e\u0301', 'a\r\nb', 'x'.repeat(55), 'x'.repeat(56),
  'x'.repeat(64), 'x'.repeat(10000), 0, '0', null, undefined, false, '\ud800', '\udc00'];
const shaOracle = value => crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
for (const encoderAvailable of [true, false]) {
  const instance = createReportUtils(encoderAvailable ? { TextEncoder } : {});
  for (const value of shaSamples) {
    if (!encoderAvailable && (value === '\ud800' || value === '\udc00')) assert.throws(() => instance.sha256Text(value), URIError);
    else assert.equal(instance.sha256Text(value), shaOracle(value));
  }
}

// DOM/URL 以記錄器驗證效果順序，不啟動瀏覽器，不提前 revoke，不新增 await。
const effects = [];
const sourceBlob = new Blob(['計算書']);
let revokeCallback;
const link = { click() { effects.push(['click', this.href, this.download]); }, remove() { effects.push(['remove']); } };
const downloading = createReportUtils({
  URL: { createObjectURL(blob) { assert.equal(blob, sourceBlob); effects.push(['create-url']); return 'blob:test'; },
    revokeObjectURL(url) { effects.push(['revoke', url]); } },
  document: { createElement(tag) { effects.push(['create-element', tag]); return link; },
    body: { appendChild(node) { assert.equal(node, link); effects.push(['append']); } } },
  setTimeout(callback, delay) { revokeCallback = callback; effects.push(['timer', delay]); },
});
assert.equal(downloading.downloadBlob(sourceBlob, '梁_文書版.docx'), undefined);
assert.deepEqual(effects, [['create-url'], ['create-element', 'a'], ['append'],
  ['click', 'blob:test', '梁_文書版.docx'], ['remove'], ['timer', 1000]]);
revokeCallback();
assert.deepEqual(effects.at(-1), ['revoke', 'blob:test']);

const openingEffects = [];
let openedUrl = '';
let popupLoadHandler;
let closePoll;
let loadedCallback = false;
const popupWindow = {
  closed: false,
  location: { replace(value) { openedUrl = value; this.href = value; openingEffects.push(['navigate', value]); } },
  addEventListener(type, callback) { assert.equal(type, 'load'); popupLoadHandler = callback; openingEffects.push(['listen-load']); },
  close() { this.closed = true; },
};
const reportWindow = {
  Blob,
  URL: {
    createObjectURL(blob) { assert.equal(blob.type, 'text/html;charset=utf-8'); openingEffects.push(['create-url', blob.size]); return 'blob:report'; },
    revokeObjectURL(value) { openingEffects.push(['revoke', value]); },
  },
  open(url, target, features) { openingEffects.push(['open', url, target, features]); return popupWindow; },
  setInterval(callback, delay) { closePoll = callback; openingEffects.push(['poll', delay]); return 7; },
  clearInterval(id) { openingEffects.push(['clear-poll', id]); },
};
const opening = createReportUtils(reportWindow);
assert.equal(opening.openReportDocument('<html>報告</html>', reportWindow, 'width=900', () => { loadedCallback = true; }), popupWindow);
assert.deepEqual(openingEffects.slice(0, 4), [
  ['create-url', Buffer.byteLength('<html>報告</html>')],
  ['open', 'about:blank', '_blank', 'width=900'],
  ['listen-load'],
  ['poll', 250],
]);
assert.deepEqual(openingEffects[4], ['navigate', 'blob:report']);
assert.equal(loadedCallback, false, 'HTML URL must remain alive until popup load');
popupLoadHandler();
assert.deepEqual(openingEffects.slice(-2), [['clear-poll', 7], ['revoke', 'blob:report']]);
assert.equal(loadedCallback, true);

const blockedEffects = [];
const blockedWindow = {
  Blob,
  URL: {
    createObjectURL() { blockedEffects.push('create'); return 'blob:blocked'; },
    revokeObjectURL(value) { blockedEffects.push(`revoke:${value}`); },
  },
  open() { blockedEffects.push('open'); return null; },
};
assert.equal(createReportUtils(blockedWindow).openReportDocument('<html></html>', blockedWindow), null);
assert.deepEqual(blockedEffects, ['create', 'open', 'revoke:blob:blocked'], 'blocked popup releases its Blob URL');

async function verifyAsyncAndPortable() {
  for (const runtime of [{}, { TextEncoder }, { TextEncoder, crypto: crypto.webcrypto }]) {
    const shared = createReportUtils(runtime);
    const rc = createRcReportUtils(shared, runtime);
    assert.equal(rc.downloadBlob, shared.downloadBlob);
    assert.equal(rc.normalizeFingerprintValue, shared.normalizeFingerprintValue);
    assert.equal(rc.containsTexFormula, shared.containsTexFormula);
    assert.equal(rc.formatTexFallback, shared.formatTexFallback);
    assert.equal(rc.openReportDocument, shared.openReportDocument);
    assert.equal(rc.loadMathJaxOrFallback, shared.loadMathJaxOrFallback);
    assert.equal(rc.escapeText('&"\''), '&amp;"\'');
    assert.equal(rc.escapeAttribute('&"\''), '&amp;&quot;\'');
    for (const value of shaSamples) {
      const result = rc.sha256Text(value);
      assert.equal(typeof result.then, 'function', 'RC SHA 必須維持 Promise 契約');
      if (!runtime.TextEncoder && (value === '\ud800' || value === '\udc00')) await assert.rejects(result, URIError);
      else assert.equal(await result, shaOracle(value));
    }
  }
  const sharedSource = createReportUtils.toString();
  const rcSource = createRcReportUtils.toString();
  for (const source of [sharedSource, rcSource]) {
    assert.doesNotMatch(source, /<\/(?:script|style)\b|<!--/i, 'factory 必須可直接放入計算書 script');
    assert.doesNotMatch(source, /\b(?:opener|fetch|XMLHttpRequest)\b/, 'factory 不得依賴原頁或外部網路');
  }
  const isolated = { TextEncoder };
  isolated.window = isolated;
  vm.runInNewContext(`var shared = (${sharedSource})(window); var rc = (${rcSource})(shared, window);`, isolated);
  assert.equal(isolated.shared.sha256Text('離線😀'), shaOracle('離線😀'));
  assert.equal(await isolated.rc.sha256Text('離線😀'), shaOracle('離線😀'));
  assert.equal(isolated.rc.escapeAttribute('"<'), '&quot;&lt;');
  const browser = { TextEncoder };
  browser.window = browser;
  for (const relative of ['結構工具箱/core/ui/report-utils.js', '鋼筋混凝土/shared/report-utils.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, relative), 'utf8'), browser);
  }
  assert.equal(browser.StructReportUtils.sha256Text('瀏覽器'), shaOracle('瀏覽器'));
  assert.equal(await browser.RCReportUtils.sha256Text('瀏覽器'), shaOracle('瀏覽器'));
  console.log('shared-report-utils.contract.test.js passed (escape/FNV/UTF-8 SHA/async/download/portable factory)');
}
verifyAsyncAndPortable().catch(error => { console.error(error); process.exitCode = 1; });
