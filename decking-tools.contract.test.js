const fs = require('fs');
const path = require('path');

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

const htmlPath = path.join(__dirname, '覆工板', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

assert(!html.includes('alert('), 'decking tool uses inline feedback', '覆工板/index.html');
assert(!html.includes('confirm('), 'decking tool uses inline confirmations', '覆工板/index.html');
assert(html.includes('id="actionStatus"'), 'decking tool action status exists', 'actionStatus');
assert(html.includes('function setActionStatus'), 'decking tool action status helper exists', 'setActionStatus');
assert(html.includes('function confirmResetAll'), 'decking reset confirmation helper exists', 'confirmResetAll');
assert(html.includes('function cancelResetAll'), 'decking reset cancellation helper exists', 'cancelResetAll');
assert(html.includes('setActionStatus(`已套用'), 'decking preset feedback is inline', 'applyPreset');
assert(html.includes('setActionStatus(`已下載'), 'decking export feedback is inline', 'exportJSON');

console.log('\nAll decking tool contract checks passed.');
