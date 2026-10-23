'use strict';
// RC 柱頁主程式外移（column.html → column.app.js）的測試單一來源：app 標籤字串、快取參數與「還原到原內嵌位置的頁面全文」。
// 以字面讀取柱頁程式的測試一律經本模組取得全文，不得各自拼標籤字串或只讀 column.html。
// 調升快取參數（column.app.js 內容有變更時）只改兩處：column.html 的 <script src="column.app.js?v=N"> 與下方 COLUMN_APP_VERSION。
// 本檔是私有測試輔助模組：.test.js 結尾，build-pages-artifact.js 依 PRIVATE_SUFFIXES 自動排除，不進 Pages；
// 直接執行（run-all-tests 會逐檔執行 *.test.js）時只做自我檢查，不改任何檔案。
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COLUMN_HTML_RELATIVE = '鋼筋混凝土/tools/column.html';
const COLUMN_APP_RELATIVE = '鋼筋混凝土/tools/column.app.js';
const COLUMN_APP_FILE = 'column.app.js';
const COLUMN_APP_VERSION = '1';
const COLUMN_APP_SRC = `${COLUMN_APP_FILE}?v=${COLUMN_APP_VERSION}`;
const COLUMN_APP_TAG = `<script src="${COLUMN_APP_SRC}"></script>`;

const resolveIn = (root, relative) => path.join(root, ...relative.split('/'));

// 回傳 app 標籤在 column.html 文字中的位置；不存在或出現多次即擲錯（不靜默退回只讀 HTML）。
function locateColumnAppTag(html) {
  const at = html.indexOf(COLUMN_APP_TAG);
  if (at < 0) {
    throw new Error(`${COLUMN_HTML_RELATIVE} must load its extracted page script with ${COLUMN_APP_TAG} (bump COLUMN_APP_VERSION together with the page tag)`);
  }
  if (html.indexOf(COLUMN_APP_TAG, at + COLUMN_APP_TAG.length) >= 0) {
    throw new Error(`${COLUMN_HTML_RELATIVE} references ${COLUMN_APP_SRC} more than once`);
  }
  return at;
}

// 把 app 內容原樣放回原內嵌位置（與外移前的單一內嵌 <script> 等價），供字面與 inline script 檢查使用。
function restoreColumnPageSource(html, app) {
  const at = locateColumnAppTag(html);
  return html.slice(0, at) + '<script>' + app + '</script>' + html.slice(at + COLUMN_APP_TAG.length);
}

function readColumnPageSource({ root = REPO_ROOT } = {}) {
  const html = fs.readFileSync(resolveIn(root, COLUMN_HTML_RELATIVE), 'utf8');
  const app = fs.readFileSync(resolveIn(root, COLUMN_APP_RELATIVE), 'utf8');
  return restoreColumnPageSource(html, app);
}

// 一般頁面讀原檔；柱頁回傳還原後全文。relativeFile 以 repo 根目錄為基準、使用 / 分隔。
function readPageSource(relativeFile, { root = REPO_ROOT } = {}) {
  const normalized = String(relativeFile).replace(/\\/g, '/');
  if (normalized === COLUMN_HTML_RELATIVE) return readColumnPageSource({ root });
  return fs.readFileSync(resolveIn(root, normalized), 'utf8');
}

module.exports = {
  REPO_ROOT,
  COLUMN_HTML_RELATIVE,
  COLUMN_APP_RELATIVE,
  COLUMN_APP_FILE,
  COLUMN_APP_VERSION,
  COLUMN_APP_SRC,
  COLUMN_APP_TAG,
  locateColumnAppTag,
  restoreColumnPageSource,
  readColumnPageSource,
  readPageSource,
};

if (require.main === module) {
  const assert = require('assert');
  assert.match(COLUMN_APP_VERSION, /^[1-9]\d*$/, 'COLUMN_APP_VERSION is a positive integer cache parameter');
  const html = fs.readFileSync(resolveIn(REPO_ROOT, COLUMN_HTML_RELATIVE), 'utf8');
  const app = fs.readFileSync(resolveIn(REPO_ROOT, COLUMN_APP_RELATIVE), 'utf8');
  const tagCount = html.split(COLUMN_APP_TAG).length - 1;
  assert.equal(tagCount, 1, `${COLUMN_HTML_RELATIVE} contains ${COLUMN_APP_TAG} exactly once`);
  const restored = readColumnPageSource();
  assert.equal(restored.length, html.length - COLUMN_APP_TAG.length + '<script></script>'.length + app.length, 'restored page = html with the tag replaced by the verbatim app body');
  assert.ok(restored.includes('<script>' + app + '</script>'), 'restored page embeds column.app.js verbatim at its original position');
  assert.equal(restored.includes(COLUMN_APP_FILE), false, 'restored page no longer references column.app.js');
  assert.equal(readPageSource(COLUMN_HTML_RELATIVE), restored, 'readPageSource restores the column page');
  assert.throws(() => restoreColumnPageSource(html.replace(COLUMN_APP_TAG, `<script src="${COLUMN_APP_FILE}"></script>`), app), /must load its extracted page script/, 'an unversioned tag is rejected');
  assert.throws(() => restoreColumnPageSource(html + COLUMN_APP_TAG, app), /more than once/, 'a duplicated tag is rejected');
  console.log(`column-app-source helper OK (${COLUMN_APP_TAG}; restored=${Buffer.byteLength(restored, 'utf8')} bytes)`);
}
