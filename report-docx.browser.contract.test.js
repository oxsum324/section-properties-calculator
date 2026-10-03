'use strict';
// 不啟動瀏覽器：以獨立真實 DOCX 驗證驗收器會拒絕表格／數值遺失。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const d = require('./石材固定/vendor/package/dist/index.cjs');
const JSZip = require('./螺栓檢討/bolt-review-tool/node_modules/jszip');
const { inspectDocx, prepareCalculationSource, CASES } = require('./report-docx.browser.test.js');
async function assertActualBeamSourceCaptureOrder() {
  const { JSDOM, VirtualConsole } = require('./螺栓檢討/bolt-review-tool/node_modules/jsdom');
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '鋼筋混凝土/tools/beam.html'), 'utf8'), {
    url: 'http://localhost/鋼筋混凝土/tools/beam.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole
  });
  const win = dom.window;
  const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.HTMLElement.prototype.scrollIntoView = function () {};
  // 本契約只核對真頁來源順序；繪圖使用無輸出 mock，不冒充瀏覽器圖像驗收。
  win.HTMLCanvasElement.prototype.getContext = () => new Proxy({
    measureText: value => ({ width: String(value).length * 7 }), createLinearGradient: () => ({ addColorStop() {} })
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
  try {
    for (const script of win.document.scripts) {
      if (!script.src) { win.eval(script.textContent); continue; }
      const url = new URL(script.src), file = decodeURIComponent(url.pathname).slice(1);
      if (url.hostname !== 'localhost' || file.endsWith('/tool-workflow.js')) continue;
      win.eval(fs.readFileSync(path.join(__dirname, file), 'utf8'));
    }
    await new Promise(resolve => setTimeout(resolve, 25));
    const stale = plain(win.collectBeamProjectData());
    assert.equal(stale.calculationFingerprint, 'CF-A8D9DF08D3D2C7FC');
    const metadata = { projectName: '來源順序測試', projectNo: 'DOCX-QA', designer: 'QA' };
    // 模擬 Playwright 傳回可序列化值，計算與來源收集仍執行實際 beam.html 函數。
    const page = {
      locator(selector) { return { async fill(value) { win.document.querySelector(selector).value = value; }, async blur() { win.document.querySelector(selector).blur(); } }; },
      async evaluate(fn, argument) { return plain(win.eval('(' + fn.toString() + ')(' + JSON.stringify(argument) + ')')); }
    };
    const snapshot = await prepareCalculationSource(page, CASES.find(item => item.key === 'rc-beam'), metadata);
    assert.equal(snapshot.activeTab, 'summary');
    assert.equal(snapshot.calculationFingerprint, 'CF-71C1B4ABEB4222F7');
    assert.notEqual(stale.summary.banner, snapshot.summary.banner, '既有 summary.banner 會隨頁面而變；不能先保存 geom JSON');
    const sameFields = { ...stale.fields, projName: snapshot.fields.projName, projNo: snapshot.fields.projNo, projDesigner: snapshot.fields.projDesigner };
    assert.deepEqual(snapshot.fields, sameFields, '切換 summary 並未更改工程輸入');
    let report;
    win.openReport = cfg => { report = plain(cfg); };
    win.buildBeamReport();
    assert.equal(report.calculationFingerprint, snapshot.calculationFingerprint, '修正順序後的真頁報表必須與來源 JSON 指紋相同');
    assert.notEqual(report.calculationFingerprint, stale.calculationFingerprint, '舊順序必須確實被拒絕，不能忽略指紋檢查');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
}
async function main() {
  await assertActualBeamSourceCaptureOrder();
  const output = path.join(__dirname, 'output', 'audit', 'docx-browser-inspector-' + crypto.randomUUID());
  fs.mkdirSync(output, { recursive: true });
  const source = { tables: [{ caption: '', rows: [[{ text: '剪力', colSpan: 1, rowSpan: 1 }, { text: '123.45 kN', colSpan: 1, rowSpan: 1 }]] }], images: [], sourceStatus: 'formal-attachment' };
  const document = new d.Document({ sections: [{ properties: { page: { size: { width: 11906, height: 16838 } } },
    footers: { default: new d.Footer({ children: [new d.Paragraph({ children: [new d.TextRun('文字備查 不作為正式附件 '), new d.TextRun({ children: [d.PageNumber.CURRENT] }), new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES] })] })] }) },
    children: [new d.Paragraph('文件類別：文字備查'), new d.Paragraph('正式附件資格：否'), new d.Paragraph('文件用途：文字備查版（不作為正式附件）'),
      new d.Table({ rows: [new d.TableRow({ children: [new d.TableCell({ children: [new d.Paragraph('剪力')] }), new d.TableCell({ children: [new d.Paragraph('123.45 kN')] })] })] })]
  }] });
  const file = path.join(output, 'valid.docx'); fs.writeFileSync(file, await d.Packer.toBuffer(document));
  const passed = await inspectDocx(file, source, output);
  assert.equal(passed.cells, 2); assert.equal(passed.attachmentStatus, 'blocked');
  await assert.rejects(inspectDocx(file, { ...source, projectMetadata: { projectName: '不在來源文書內的長中文案件名稱' } }, output), /來源計畫資訊必須完整保留/);
  const zip = await JSZip.loadAsync(fs.readFileSync(file)), xml = await zip.file('word/document.xml').async('string');
  zip.file('word/document.xml', xml.replace('123.45 kN', '12.345 kN'));
  const changed = path.join(output, 'changed-value.docx'); fs.writeFileSync(changed, await zip.generateAsync({ type: 'nodebuffer' }));
  await assert.rejects(inspectDocx(changed, source, output), /可見文字與數值/);
  zip.file('word/document.xml', xml.replace(/<w:tbl>.*?<\/w:tbl>/s, ''));
  const missing = path.join(output, 'missing-table.docx'); fs.writeFileSync(missing, await zip.generateAsync({ type: 'nodebuffer' }));
  await assert.rejects(inspectDocx(missing, source, output), /表格數/);
  console.log('DOCX browser inspector: actual OOXML accepted; changed engineering value and removed table rejected; real attachment checker blocks nonformal Word. ' + output);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
