// RC 柱頁主程式外移契約：column.html 只留標記與極小內嵌，主程式在 column.app.js（一般 classic script），
// 於原內嵌位置同步載入（devlength.js 之後、forces-receive.js 之前，不加 defer/async/module）。
// app 標籤字串與 ?v= 快取參數的單一來源在 column-app-source.test.js（其他測試共用同一份還原邏輯）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const columnPage = require('./column-app-source.test.js');

const toolsDir = __dirname;
const htmlPath = path.join(toolsDir, 'column.html');
const appPath = path.join(toolsDir, 'column.app.js');
const APP_SRC = columnPage.COLUMN_APP_FILE;
const HEADER_NEEDLE = '由 column.html 逐字抽出，勿手動分歧';
const MAX_INLINE_SCRIPT_BYTES = 1024;
const MIN_MARKUP_RATIO = 0.8;

let failed = 0;
function assert(pass, label, detail = '') {
  if (!pass) {
    failed++;
    console.error(`FAIL | ${label} :: ${detail}`);
  } else {
    console.log(`PASS | ${label} | ${detail}`);
  }
}

const lf = text => text.replace(/\r\n/g, '\n');
const html = lf(fs.readFileSync(htmlPath, 'utf8'));
assert(fs.existsSync(appPath), 'column.app.js exists next to column.html', path.basename(appPath));
const app = fs.existsSync(appPath) ? lf(fs.readFileSync(appPath, 'utf8')) : '';
const bytes = text => Buffer.byteLength(text, 'utf8');

// 1. 內嵌程式總量 ≤ 1 KB；HTML 純標記（扣除內嵌 script 與 style 內容）佔比 ≥ 80%
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(match => ({
  index: match.index,
  tag: match[0].slice(0, match[0].indexOf('>') + 1),
  attrs: match[1],
  body: match[2],
  src: (match[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || null,
}));
const inlineScripts = scripts.filter(script => !script.src);
const inlineScriptBytes = inlineScripts.reduce((sum, script) => sum + bytes(script.body), 0);
assert(inlineScriptBytes <= MAX_INLINE_SCRIPT_BYTES, 'column.html inline script code stays within 1 KB', `inline=${inlineScriptBytes} bytes in ${inlineScripts.length} block(s)`);
const inlineStyleBytes = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].reduce((sum, match) => sum + bytes(match[1]), 0);
const totalBytes = bytes(html);
const markupRatio = (totalBytes - inlineScriptBytes - inlineStyleBytes) / totalBytes;
assert(markupRatio >= MIN_MARKUP_RATIO, 'column.html is at least 80% pure markup', `markup=${(markupRatio * 100).toFixed(2)}% total=${totalBytes} inlineScript=${inlineScriptBytes} inlineStyle=${inlineStyleBytes}`);

// 2. column.app.js 恰被引用一次，位置在原內嵌處，且為同步 classic script
const appRefs = scripts.filter(script => script.src && script.src.split('?')[0] === APP_SRC);
assert(appRefs.length === 1, 'column.html references column.app.js exactly once', `count=${appRefs.length}`);
assert(html.split(APP_SRC).length - 1 === 1, 'column.app.js appears once in column.html text', `count=${html.split(APP_SRC).length - 1}`);
const appRef = appRefs[0];
if (appRef) {
  assert(/\?v=[1-9]\d*$/.test(appRef.src), 'column.app.js carries a ?v= cache parameter like the RC shared scripts', appRef.src);
  assert(appRef.src === columnPage.COLUMN_APP_SRC, 'column.app.js ?v= matches COLUMN_APP_VERSION in column-app-source.test.js (bump both together)', `${appRef.src} vs ${columnPage.COLUMN_APP_SRC}`);
  assert(appRef.tag === `<script src="${columnPage.COLUMN_APP_SRC}">`, 'column.app.js tag has no defer/async/type/module attributes', appRef.tag);
  assert(appRef.body === '', 'column.app.js tag has no inline body', JSON.stringify(appRef.body.slice(0, 40)));
  assert(html.split(columnPage.COLUMN_APP_TAG).length - 1 === 1, 'column.html contains the shared COLUMN_APP_TAG string exactly once', columnPage.COLUMN_APP_TAG);
  const position = scripts.indexOf(appRef);
  const previous = scripts[position - 1];
  const next = scripts[position + 1];
  const afterNext = scripts[position + 2];
  assert(previous && previous.src === '../shared/devlength.js?v=3', 'column.app.js loads right after devlength.js (original inline position)', previous ? previous.tag : 'missing');
  assert(next && next.src === '../../結構工具箱/core/ui/forces-receive.js', 'column.app.js loads right before forces-receive.js', next ? next.tag : 'missing');
  assert(afterNext && !afterNext.src && afterNext.body.trim() === 'initColumnForceCandidateReview();', 'candidate receiver init stays inline after forces-receive.js', afterNext ? JSON.stringify(afterNext.body) : 'missing');
  const before = scripts.slice(0, position);
  assert(before.every(script => script.src && !/\b(?:defer|async)\b|type\s*=\s*["']module/i.test(script.attrs)), 'all scripts before column.app.js are synchronous external classic scripts', `count=${before.length}`);
  const bodyOpen = html.search(/<body\b/i);
  assert(bodyOpen >= 0 && appRef.index > bodyOpen && appRef.index < html.lastIndexOf('</body>'), 'column.app.js stays inside <body> after page markup', `index=${appRef.index}`);
  const trailing = html.slice(appRef.index, html.lastIndexOf('</body>'));
  assert(!/<(?:div|section|form|input|select|textarea|button|table|canvas|svg)\b/i.test(trailing), 'all work-page markup is parsed before column.app.js runs', `trailingBytes=${bytes(trailing)}`);
}

// 3. column.app.js 檔頭標示來源；可作為 classic script 解析；不含 module 語法；可原樣還原為內嵌
const firstLine = app.split('\n', 1)[0];
assert(firstLine.startsWith('//') && firstLine.includes(HEADER_NEEDLE), 'column.app.js header states verbatim extraction from column.html', firstLine.slice(0, 80));
let parsed = false;
let parseError = '';
try {
  new vm.Script(app, { filename: 'column.app.js' });
  parsed = true;
} catch (error) {
  parseError = String(error && error.message || error);
}
assert(parsed, 'column.app.js parses as a classic script', parseError || 'vm.Script ok');
assert(!/^\s*(?:import\s+[\w{*'"]|export\s+(?:default|const|let|var|function|class|\{))/m.test(app), 'column.app.js has no ES module syntax', 'classic script');
assert(!/<\/script/i.test(app), 'column.app.js has no closing script tag literal', 'can be restored inline verbatim');
{
  let restored = '';
  let restoreError = '';
  try { restored = lf(columnPage.readColumnPageSource()); } catch (error) { restoreError = String(error && error.message || error); }
  assert(!restoreError && restored.includes('<script>' + app + '</script>') && !restored.includes(APP_SRC), 'shared restore helper puts column.app.js back at its original inline position', restoreError || `restored=${bytes(restored)} bytes`);
}
assert(/^  function initColumnForceCandidateReview\(/m.test(app), 'column.app.js declares the top-level receiver initializer used by the inline call', 'initColumnForceCandidateReview');
assert(/^  function applyPanel\(tab\) \{/m.test(app) && /^  function calcColumn\(/m.test(app), 'column.app.js keeps the top-level workflow entry functions', 'applyPanel / calcColumn');

// 4. 載入邊界：頁面專屬程式不放共用路徑
const relativeApp = path.relative(path.resolve(toolsDir, '..', '..'), appPath).split(path.sep).join('/');
assert(relativeApp === '鋼筋混凝土/tools/column.app.js' && !/\/(?:core|shared|vendor)\//.test(`/${relativeApp}`), 'column.app.js stays a page-specific script outside core/shared/vendor', relativeApp);

if (failed) {
  console.error(`column app extraction contract failed: ${failed} check(s)`);
  process.exitCode = 1;
} else {
  console.log(`column app extraction contract OK (html=${totalBytes} bytes, inline script=${inlineScriptBytes} bytes, markup=${(markupRatio * 100).toFixed(2)}%, app=${bytes(app)} bytes)`);
}
