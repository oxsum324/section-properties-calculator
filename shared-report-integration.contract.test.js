const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('./螺栓檢討/bolt-review-tool/node_modules/jsdom');
const { checkPackage } = require('./結構工具箱/tools/attachment-package-check.js');
const root = process.env.REPORT_TEST_ROOT || __dirname;
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const cfg = {
  title: '契約測試 <梁> "甲"', subtitle: 'Report',
  project: { name: '工程甲', no: 'A-001', designer: '技師', date: '2026/10/03' }, textExport: true,
  outputSource: { tool: '契約工具', version: 'V1.0' },
  inputs: [{ group: '輸入', items: [{ label: '長度', value: '3.20', unit: 'm' }] }],
  checks: [{ group: '強度', items: [{ label: '撓曲', formula: 'M/R', sub: '2/3', value: '0.667', ok: true }] }],
  steps: [{ group: '代入', body: 'M / R = 2 / 3\n結果 = 0.667' }],
  summary: { ok: true, text: '符合' }, snapshot: { a: 1, nested: { b: 2, a: '甲' } },
};

function render(relative) {
  let html = '';
  let blob;
  const reportUrl = 'blob:http://localhost/report-integration';
  const window = {
    Blob: class { constructor(parts) { this.html = parts.join(''); } },
    URL: {
      createObjectURL(value) { blob = value; return reportUrl; },
      revokeObjectURL(url) { assert.equal(url, reportUrl); },
    },
    open() {
      return { location: { replace(url) { assert.equal(url, reportUrl); html = blob.html; } } };
    },
  };
  const context = { window, console };
  vm.createContext(context);
  for (const file of ['結構工具箱/core/ui/report-utils.js', '鋼筋混凝土/shared/report-utils.js', relative]) vm.runInContext(read(file), context, { filename: file });
  context.openReport(cfg);
  return html;
}

async function openPortable(html) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  // 不開網路、不設 opener，執行的僅是本工具產生的內嵌腳本。
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole });
  for (const script of dom.window.document.querySelectorAll('script')) {
    assert.ok(!script.src, '可攜計算書純工具不能依賴外部 script');
    new vm.Script(script.textContent);
    dom.window.eval(script.textContent);
  }
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(errors.map(error => error.message), []);
  assert.equal(dom.window.opener, undefined);
  assert.equal(dom.window.StructReportUtilsFactory, undefined, 'popup 使用內嵌 factory，不依賴來源頁 global');
  assert.equal(typeof dom.window.serializeReportDocumentHtml, 'function');
  assert.equal(typeof dom.window.buildReportText, 'function');
  return dom;
}

async function main() {
  // 指紋基準實測自 f6310e2f；不同家族保留原投影，不要求跨家族值相同。
  for (const [relative, fingerprint] of [
    ['結構工具箱/core/ui/report.js', 'CF-88CC0158765D3554'],
    ['鋼筋混凝土/shared/report.js', 'CF-B1476E30D726A694'],
  ]) {
    const dom = await openPortable(render(relative));
    try {
      assert.equal(dom.window.document.querySelector('[data-calculation-fingerprint]').dataset.calculationFingerprint, fingerprint);
      const text = await dom.window.buildReportText();
      assert.match(text, /0\.667/);
      assert.match(text, /文字內容 SHA-256（非數位簽章）：[a-f0-9]{64}/);
      const saved = await dom.window.serializeReportDocumentHtml();
      assert.ok(saved.includes(fingerprint));
      const reopened = await openPortable(saved);
      try {
        assert.equal(reopened.window.document.querySelector('[data-calculation-fingerprint]').dataset.calculationFingerprint, fingerprint);
        assert.equal(await reopened.window.buildReportText(), text, '離線重新開啟後文字、指紋與內容 SHA 一致');
      } finally { reopened.window.close(); }
      const approval = dom.window.document.querySelector('.rep-approval-control input[type="checkbox"]');
      assert.ok(approval && !approval.disabled, 'fixture allows formal approval');
      approval.click();
      const approvedText = await dom.window.buildReportText();
      assert.match(approvedText, /來源文件狀態：正式附件/);
      assert.match(approvedText, /正式附件資格：否/);
      const packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-text-package-'));
      try {
        fs.writeFileSync(path.join(packageDir, `契約測試_文字備查_${fingerprint}.txt`), '\ufeff' + approvedText);
        const result = checkPackage(packageDir);
        assert.equal(result.status, 'blocked');
        assert.ok(result.issues.some(issue => issue.code === 'non-formal-reference-text'));
      } finally { fs.rmSync(packageDir, { recursive: true, force: true }); }
    } finally { dom.window.close(); }
  }
  assert.equal(read('結構工具箱/core/ui/report.js'), read('鋼構工具/core/ui/report.js'));
  assert.equal(read('結構工具箱/core/ui/report-utils.js'), read('鋼構工具/core/ui/report-utils.js'));
  const print = read('結構工具箱/core/direct-print-boundary.css');
  assert.equal(print, read('鋼筋混凝土/shared/direct-print-boundary.css'));
  for (const family of ['formal', 'local-quick', 'steel-formal', 'rc']) assert.ok(print.includes('.' + family + '-direct-print-boundary'));
  assert.match(print, /body\.rc-formal-output-page > \.rc-direct-print-boundary\s*\{\s*display: grid !important/);
  assert.match(print, /html:has\(> body\.rc-formal-output-page\)/, 'RC html 背景只作用於 RC 頁');

  const reportPaths = new Set(['結構工具箱/core/ui/report.js', '鋼構工具/core/ui/report.js', '鋼筋混凝土/shared/report.js']);
  const consumers = require('node:child_process').execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(file => file.endsWith('.html'));
  let count = 0;
  for (const file of consumers) {
    const source = read(file), loaded = new Set();
    let usesReport = false;
    for (const script of source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file.replace(/\\/g, '/')), script[1].split('?')[0]));
      if (reportPaths.has(resolved)) {
        usesReport = true;
        const dependencies = resolved.startsWith('鋼筋混凝土/') ? ['結構工具箱/core/ui/report-utils.js', '鋼筋混凝土/shared/report-utils.js'] : [resolved.replace('report.js', 'report-utils.js')];
        for (const dependency of dependencies) assert.ok(loaded.has(dependency), `${file}: ${dependency} 必須先於 renderer`);
      }
      loaded.add(resolved);
    }
    if (usesReport) count++;
  }
  for (const part of ['beam', 'column']) {
    const legacy = read(`結構工具箱/tools/鋼構/steel-${part}.html`);
    assert.ok(legacy.includes(`鋼構工具/steel-${part}-formal.html`), `舊鋼${part === 'beam' ? '梁' : '柱'}網址保留正式頁入口`);
    assert.doesNotMatch(legacy, /<script\b[^>]*\bsrc=["'][^"']*\/report\.js/i, '相容入口由正式頁產報');
  }
  assert.equal(count, 44, '依實際 report.js 引用全集接線，鋼梁、鋼柱相容網址由正式頁產報');
  console.log(`shared-report-integration.contract.test.js passed (${count} consumers / offline HTML / TXT boundary / fingerprints / mirrors)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
