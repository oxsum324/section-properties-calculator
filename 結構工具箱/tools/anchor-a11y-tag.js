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

function patchAnchorIndexFile(target) {
  const bytes = fs.readFileSync(target);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error(`anchor index is not valid UTF-8: ${target}`);
  const result = ensureAnchorA11yTag(text);
  if (result.changed) fs.writeFileSync(target, Buffer.from(result.html, 'utf8'));
  return result;
}

module.exports = { ANCHOR_A11Y_TAG, ensureAnchorA11yTag, patchAnchorIndexFile };

if (require.main === module) {
  const target = process.argv[2];
  if (!target || process.argv.length > 3) {
    console.error('Usage: node 結構工具箱/tools/anchor-a11y-tag.js <index.html>');
    process.exitCode = 1;
  } else {
    try {
      const result = patchAnchorIndexFile(target);
      console.log(`anchor accessibility runtime tag ${result.changed ? 'added' : 'already present'}: ${target}`);
    } catch (error) {
      console.error(`anchor accessibility runtime tag not written: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
