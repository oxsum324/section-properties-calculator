'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { JSDOM, VirtualConsole } = require('./螺栓檢討/bolt-review-tool/node_modules/jsdom');
const root = __dirname;
const converterFile = '結構工具箱/core/ui/report-docx.js';
const reports = ['結構工具箱/core/ui/report.js', '鋼筋混凝土/shared/report.js'];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function render(file, enabled) {
  let html;
  const context = { console, window: { open() { return { document: { open() {}, write(value) { html = value; }, close() {} } }; } } };
  vm.createContext(context);
  for (const script of ['結構工具箱/core/ui/report-utils.js', '鋼筋混凝土/shared/report-utils.js', converterFile, file]) vm.runInContext(read(script), context, { filename: script });
  assert.doesNotMatch(context.ReportDocxFactory.toString(), /<\/(?:script|style)\b|<!--/i);
  context.ReportDocxLibraryURL = 'https://example.invalid/local-vendor/index.iife.js';
  context.openReport({ title: '中文文書版測試', project: { name: '案件甲', no: 'DOCX-QA', designer: '測試' }, textExport: enabled,
    outputSource: { tool: '契約工具', version: 'V1.0' }, inputs: [{ group: '輸入', items: [{ label: '長度', value: '3.20', unit: 'm' }] }],
    checks: [{ group: '檢核', items: [{ label: '撓曲', formula: 'M/R', sub: '2/3', value: '0.667', ok: true }] }], summary: { ok: true, text: '符合' } });
  return html;
}

async function main() {
  for (const file of reports) for (const enabled of [true, false]) {
    const html = render(file, enabled), errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => errors.push(error.message));
    const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole });
    try {
      for (const script of dom.window.document.querySelectorAll('script')) {
        assert.equal(script.src, '', 'DOCX 轉換器可攜；857 KB 元件不在載入計算書時下載');
        new vm.Script(script.textContent);
        dom.window.eval(script.textContent);
      }
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.deepEqual(errors, []);
      const button = dom.window.document.getElementById('repDownloadCurrentWord');
      assert.equal(Boolean(button), enabled, '只有 textExport=true 的工具有 Word 按鈕');
      assert.equal(typeof dom.window.buildReportDocx, 'function');
      assert.equal(dom.window.buildReportWordHtml, undefined, '不再以 HTML 偽裝 Word .doc');
      if (enabled) {
        assert.match(button.textContent, /DOCX/);
        assert.ok(button.classList.contains('rep-download-control'));
        assert.match(await dom.window.buildReportText(), /0\.667/);
        const saved = await dom.window.serializeReportDocumentHtml();
        assert.ok(saved.includes('buildCurrentReportDocx'));
        assert.ok(!saved.includes('application/msword'));
        // 在首次 Word 元件仍等待網路時，HTML 下載仍須自足且保留按需載入。
        const pendingDocx = dom.window.buildReportDocx().then(() => null, error => error);
        const runtime = dom.window.document.querySelector('script[data-report-docx-runtime="true"]');
        assert.ok(runtime, '等待中的 runtime 必須有可精確移除的標記');
        try {
          const pendingSaved = new JSDOM(await dom.window.serializeReportDocumentHtml());
          try {
            assert.equal(pendingSaved.window.document.querySelector('script[data-report-docx-runtime]'), null);
            assert.equal(pendingSaved.window.document.querySelector('script[src]'), null, '等待 Word 時下載 HTML 不得夾帶 vendor script');
            assert.ok(pendingSaved.window.document.querySelector('script:not([src])'), '原可攜核可／驗證程式仍須保留');
          } finally { pendingSaved.window.close(); }
        } finally { runtime.dispatchEvent(new dom.window.Event('error')); }
        assert.match((await pendingDocx).message, /元件無法載入/);
      } else {
        await assert.rejects(dom.window.buildReportDocx(), /尚未啟用/);
        assert.equal(dom.window.document.querySelector('script[src]'), null);
      }
    } finally { dom.window.close(); }
  }
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(file => file.endsWith('.html'));
  let count = 0;
  for (const file of files) {
    const loaded = new Set();
    let consumer = false;
    for (const match of read(file).matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1].split('?')[0]));
      if ([...reports, '鋼構工具/core/ui/report.js'].includes(resolved)) {
        consumer = true;
        assert.ok(loaded.has(converterFile), file + ': converter must load before renderer');
      }
      loaded.add(resolved);
    }
    if (consumer) count++;
  }
  assert.equal(count, 45);
  console.log('DOCX integration: core/RC portable scripts, opt-in, .doc removal, 45 consumer dependencies passed; browser and Word checked separately');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
