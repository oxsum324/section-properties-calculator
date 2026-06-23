const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

const pages = [
  {
    label: 'stone V2',
    path: '石材固定/石材計算書產生器_規範版V2.html',
    needles: [
      'function v2Notify',
      '#v2-migration-toast.err',
      "toast.classList.toggle('err', o.kind === 'error' || o.kind === 'err')",
      'function v2ConfirmAction',
      'id="v2_tpl_name"',
      'function v2SaveUserTemplateFromManager',
      'v2OpenTemplateManager({focusName:true})',
    ],
  },
  {
    label: 'stone legacy base',
    path: '石材固定/石材計算書產生器.html',
    needles: ['function legacyNotify', 'function legacyConfirmAction', "legacyNotify('請允許彈出視窗以開啟列印預覽'", "legacyNotify('Word 直接匯出失敗"],
  },
  {
    label: 'stone legacy Word',
    path: '石材固定/石材計算書產生器_直接Word版.html',
    needles: ['function legacyNotify', 'function legacyConfirmAction', "legacyNotify('PDF.js 尚未載入", "legacyNotify('請至少勾選一頁"],
  },
  {
    label: 'stone legacy spec',
    path: '石材固定/石材計算書產生器_規範版.html',
    needles: ['function legacyNotify', 'function legacyConfirmAction', "legacyNotify('耐風規範模組尚未載入", "legacyNotify('一鍵匯出失敗"],
  },
  {
    label: 'stone baseline capture',
    path: '石材固定/dev_tools/baseline_capture.html',
    needles: ['function devNotify', "devNotify('JSON 解析失敗", "devNotify('請先載入兩個檔案"],
  },
];

for (const page of pages) {
  const html = read(page.path);
  assert(!html.includes('alert('), `${page.label} uses non-blocking feedback`, page.path);
  assert(!html.includes('prompt('), `${page.label} avoids browser prompt input`, page.path);
  assert(!html.includes('confirm('), `${page.label} uses modal confirmations`, page.path);
  for (const needle of page.needles) {
    assert(html.includes(needle), `${page.label} feedback contract is present`, needle);
  }
}

console.log('\nAll stone feedback contract checks passed.');
