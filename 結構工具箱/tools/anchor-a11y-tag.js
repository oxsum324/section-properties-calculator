'use strict';

// 錨栓部署鏡像（anchor/index.html）由 Vite dist 整檔覆寫，不含共用無障礙執行期標籤；
// sync-anchor-deployment.ps1 複製 dist 後呼叫本工具補回，已有則不重複（冪等）。
const fs = require('node:fs');

const ANCHOR_A11Y_TAG = '<script src="../tool-page-a11y.js" defer></script>';

function ensureAnchorA11yTag(html) {
  const text = String(html);
  const count = text.split(ANCHOR_A11Y_TAG).length - 1;
  if (count === 1) return { html: text, changed: false };
  if (count > 1) throw new Error(`anchor index has ${count} accessibility runtime tags`);
  const bodyEnd = text.lastIndexOf('</body>');
  if (bodyEnd < 0) throw new Error('anchor index has no </body>');
  const lineStart = text.lastIndexOf('\n', bodyEnd) + 1;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const out = `${text.slice(0, lineStart)}  ${ANCHOR_A11Y_TAG}${eol}</body>${text.slice(bodyEnd + '</body>'.length)}`;
  return { html: out, changed: true };
}

module.exports = { ANCHOR_A11Y_TAG, ensureAnchorA11yTag };

if (require.main === module) {
  const target = process.argv[2];
  if (!target || process.argv.length > 3) {
    console.error('Usage: node 結構工具箱/tools/anchor-a11y-tag.js <anchor/index.html>');
    process.exitCode = 1;
  } else {
    const result = ensureAnchorA11yTag(fs.readFileSync(target, 'utf8'));
    if (result.changed) fs.writeFileSync(target, result.html);
    console.log(`anchor accessibility runtime tag ${result.changed ? 'added' : 'already present'}: ${target}`);
  }
}
