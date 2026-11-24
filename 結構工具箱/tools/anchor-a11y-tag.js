'use strict';

// 錨栓部署鏡像（anchor/index.html）由 Vite dist 整檔覆寫，不含共用無障礙執行期標籤；
// sync-anchor-deployment.ps1 於暫存目錄補好標籤後才鏡像至 anchor/，已有則不重複（冪等）。
// 規則：插在最後一個 </body>（不分大小寫）之前，保留其前所有內容；</body> 自成一行時沿用
// 「兩格縮排標籤 + 換行 + 行首 </body>」格式；CRLF／LF 與 UTF-8 BOM 原樣保留。
// 多個標籤、非標準寫法的引用或缺 </body> 一律報錯，CLI 以非零結束且不寫檔。
const fs = require('node:fs');

const ANCHOR_A11Y_TAG = '<script src="../tool-page-a11y.js" defer></script>';
const RUNTIME_REFERENCE = /<script\b[^>]*\bsrc\s*=\s*["']?[^"'\s>]*tool-page-a11y\.js\b[^>]*>/gi;
const BODY_END = /<\/body\s*>/gi;
const CHROME_STYLES = [
  '<link rel="stylesheet" href="../結構工具箱/assets/hy/colors_and_type.css">',
  '<link rel="stylesheet" href="../tool-chrome.css">',
];
const CHROME_SCRIPTS = [
  '<script src="../tool-nav.manifest.js" defer></script>',
  '<script src="../tool-chrome.js" defer></script>',
];
const CHROME_SLOT = '<div class="tool-chrome-slot page-only-tool-chrome" data-tool-chrome-slot></div>';

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function lastBodyEndIndex(text) {
  let last = -1;
  BODY_END.lastIndex = 0;
  for (let match = BODY_END.exec(text); match; match = BODY_END.exec(text)) last = match.index;
  return last;
}

function ensureAnchorA11yTag(html) {
  const text = String(html);
  const count = countOccurrences(text, ANCHOR_A11Y_TAG);
  const references = (text.match(RUNTIME_REFERENCE) || []).length;
  if (count > 1) throw new Error(`anchor index has ${count} accessibility runtime tags`);
  if (references !== count) {
    throw new Error(`anchor index has ${references} tool-page-a11y.js references but ${count} canonical tags`);
  }
  if (count === 1) return { html: text, changed: false };

  const bodyEnd = lastBodyEndIndex(text);
  if (bodyEnd < 0) throw new Error('anchor index has no </body>');
  const lineStart = text.lastIndexOf('\n', bodyEnd - 1) + 1;
  let out;
  if (lineStart > 0 && /^[ \t]*$/.test(text.slice(lineStart, bodyEnd))) {
    // </body> 自成一行：沿用既有格式，換行符取該行前一行的實際行尾。
    const eol = text[lineStart - 2] === '\r' ? '\r\n' : '\n';
    out = `${text.slice(0, lineStart)}  ${ANCHOR_A11Y_TAG}${eol}${text.slice(bodyEnd)}`;
  } else {
    // </body> 與其他內容同行（含單行 HTML）：緊貼 </body> 前插入，不動其餘位元。
    out = `${text.slice(0, bodyEnd)}${ANCHOR_A11Y_TAG}${text.slice(bodyEnd)}`;
  }
  if (countOccurrences(out, ANCHOR_A11Y_TAG) !== 1 || out.indexOf(ANCHOR_A11Y_TAG) >= lastBodyEndIndex(out)) {
    throw new Error('anchor accessibility runtime tag insertion failed its post-check');
  }
  return { html: out, changed: true };
}

function ensureAnchorToolChrome(html) {
  const counts = [...CHROME_STYLES, ...CHROME_SCRIPTS, CHROME_SLOT].map(tag => countOccurrences(html, tag));
  const references = html.match(/colors_and_type\.css|tool-chrome\.css|tool-nav\.manifest\.js|tool-chrome\.js|data-tool-chrome-slot/gi) || [];
  if (counts.reduce((total, count) => total + count, 0) !== references.length) {
    throw new Error('anchor index has a non-canonical tool chrome reference');
  }
  const bodyStart = /<body(?=[\s>])[^>]*>/i;
  const headEnd = /(^[ \t]*)?<\/head\s*>/im;
  const body = html.match(bodyStart)?.[0];
  if (!body || !headEnd.test(html) || countOccurrences(html, ANCHOR_A11Y_TAG) !== 1) {
    throw new Error('anchor chrome needs a head, a body and the canonical accessibility tag');
  }
  if (counts.every(count => count === 1) && body.includes('data-family="attachments"')) {
    return { html, changed: false };
  }
  if (counts.some(Boolean) || /\bdata-family\s*=/i.test(body)) {
    throw new Error('anchor index has an incomplete or duplicate tool chrome');
  }
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  let result = html.replace(headEnd, (end, indent = '') => [
    ...CHROME_STYLES.map(tag => indent + '  ' + tag), end,
  ].join(eol));
  result = result.replace(bodyStart, body.slice(0, -1) + ' data-family="attachments">' + eol + '    ' + CHROME_SLOT);
  result = result.replace(ANCHOR_A11Y_TAG, [...CHROME_SCRIPTS, ANCHOR_A11Y_TAG].join(eol + '  '));
  return { html: result, changed: true };
}

function patchAnchorIndexFile(target, withToolChrome = false) {
  const bytes = fs.readFileSync(target);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error(`anchor index is not valid UTF-8: ${target}`);
  const a11y = ensureAnchorA11yTag(text);
  const chrome = withToolChrome ? ensureAnchorToolChrome(a11y.html) : a11y;
  const result = { html: chrome.html, changed: a11y.changed || chrome.changed };
  if (result.changed) fs.writeFileSync(target, Buffer.from(result.html, 'utf8'));
  return result;
}

module.exports = { ANCHOR_A11Y_TAG, ensureAnchorA11yTag, ensureAnchorToolChrome, patchAnchorIndexFile };

if (require.main === module) {
  const [target, option, extra] = process.argv.slice(2);
  if (!target || (option !== undefined && option !== '--with-tool-chrome') || extra !== undefined) {
    console.error('Usage: node 結構工具箱/tools/anchor-a11y-tag.js <index.html> [--with-tool-chrome]');
    process.exitCode = 1;
  } else {
    try {
      const result = patchAnchorIndexFile(target, option === '--with-tool-chrome');
      const label = option === '--with-tool-chrome' ? 'anchor page integrations' : 'anchor accessibility runtime tag';
      console.log(`${label} ${result.changed ? 'added' : 'already present'}: ${target}`);
    } catch (error) {
      console.error(`anchor accessibility runtime tag not written: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
