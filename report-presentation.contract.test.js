'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repository = process.env.REPORT_REPOSITORY_ROOT || __dirname;
const target = process.env.REPORT_TEST_ROOT || repository;
const baseline = process.env.REPORT_BASELINE_ROOT || '';
const { JSDOM, VirtualConsole } = require(path.join(repository, '螺栓檢討/bolt-review-tool/node_modules/jsdom'));
const checker = require(path.join(repository, '結構工具箱/tools/attachment-package-check.js'));
const { verifySteelReportPackage } = require(path.join(repository, '鋼構工具/steel-report-package-contract.js'));
const read = (root, file) => fs.readFileSync(path.join(fs.existsSync(path.join(root, file)) ? root : repository, file), 'utf8');
const normalize = value => JSON.parse(JSON.stringify(value));
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-03T12:00:00Z'])); } static now() { return new FixedDate().getTime(); } }

function coreContext(root) {
  let written = '';
  const popup = { document: { open() {}, write(html) { written = html; }, close() {} } };
  const context = { window: { open: () => popup }, console, Date: FixedDate };
  vm.createContext(context);
  for (const file of ['結構工具箱/core/ui/report-utils.js', '結構工具箱/core/ui/report.js']) vm.runInContext(read(root, file), context, { filename: file });
  return { context, popup, output: () => written };
}

async function portable(html) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole });
  for (const script of dom.window.document.scripts) {
    if (script.src) { assert.match(script.src, /^https:\/\/cdn\.jsdelivr\.net\/npm\/mathjax@3\/es5\/tex-svg\.js$/); continue; }
    new vm.Script(script.textContent);
    dom.window.eval(script.textContent);
  }
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual(errors, []);
  assert.equal(dom.window.opener, undefined);
  assert.equal(typeof dom.window.serializeReportDocumentHtml, 'function');
  return dom;
}

function steelApp(root, file) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(read(repository, file), { url: 'http://localhost/' + file, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const win = dom.window;
  win.Date = FixedDate;
  win.fetch = async () => ({ ok: true, json: async () => ({}) });
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.HTMLElement.prototype.scrollIntoView = function () {};
  // T3 僅提供渲染 hooks；本契約不以 mock 代替 T3 的真瀏覽器驗證。
  win.HYToolWorkflow = { install: () => ({ refresh() {} }) };
  for (const script of win.document.scripts) {
    if (!script.src) { win.eval(script.textContent); continue; }
    const url = new URL(script.src);
    if (url.hostname !== 'localhost' || url.pathname.endsWith('/tool-workflow.js')) continue;
    win.eval(read(root, decodeURIComponent(url.pathname).slice(1)));
  }
  return { dom, win, errors,
    select(type) {
      const input = win.document.querySelector('[name="connectionType"]');
      input.value = type;
      input.dispatchEvent(new win.Event('change', { bubbles: true }));
      win.document.querySelector('#loadExampleBtn').click();
    },
    report() {
      let html = '';
      win.open = () => ({ document: { open() {}, write(value) { html = value; }, close() {}, documentElement: { classList: { add() {} } } },
        MathJax: { typesetPromise: () => Promise.resolve() } });
      win.document.querySelector('#exportReportBtn').click();
      assert.ok(html.length > 1000);
      assert.deepEqual(errors, []);
      return html;
    },
  };
}

async function main() {
  const { context, popup, output } = coreContext(target);
  const cfg = { title: '契約測試', subtitle: 'Report', textExport: true,
    project: { name: '工程甲', no: 'A-001', designer: '技師' }, outputSource: { tool: '契約工具', version: 'V1.0' },
    inputs: [{ group: '輸入', items: [{ label: '長度', value: '3.20', unit: 'm' }] }],
    checks: [{ group: '強度', items: [{ label: '撓曲', formula: 'M/R', sub: '2/3', value: '0.667', ok: true }] }],
    steps: [{ group: '代入', body: 'M / R = 2 / 3' }], summary: { ok: true, text: '符合' }, snapshot: { force: 2 } };
  const generic = context.buildReportDocumentHtml(cfg);
  assert.equal(context.openReport(cfg), popup, '共用開窗回傳視窗，讓既有工具可延續操作');
  assert.equal(output(), generic);
  if (baseline) {
    const old = coreContext(baseline); old.context.openReport(cfg);
    assert.equal(generic, old.output(), '既有 generic renderer 輸出逐位元不變');
  }
  const customCfg = { ...cfg, inputs: undefined, steps: undefined, checks: [{ label: '原 flat check', demand: 2, available: 3 }], formalApprovalAllowed: false };
  const presentation = { bodyHtml: '<section class="block"><h3>專用計算</h3><table><tbody><tr><th>需求</th><td>2</td></tr></tbody></table></section>', css: '.block{color:#111}', mathJax: true };
  const originalCfg = JSON.stringify(customCfg);
  const custom = context.buildReportDocumentHtml(customCfg, presentation);
  assert.equal(JSON.stringify(customCfg), originalCfg, '渲染不可改動工程 cfg');
  assert.throws(() => context.buildReportDocumentHtml({ ...customCfg, calculationFingerprint: 'CF-FORGED' }, presentation), /不得指定計算指紋/);
  assert.throws(() => context.buildReportDocumentHtml(customCfg, { bodyHtml: 1 }), /bodyHtml/);
  const fingerprint = context.buildCalculationFingerprint(customCfg);
  assert.ok(custom.includes(fingerprint));
  const changed = context.buildReportDocumentHtml({ ...customCfg, snapshot: { force: 4 } }, presentation);
  assert.ok(!changed.includes(fingerprint), '工程資料變更須改 CF');
  const styled = context.buildReportDocumentHtml(customCfg, { ...presentation, css: '.block{color:#222}' });
  assert.ok(styled.includes(fingerprint), '版面不參與 CF 投影');
  const changedBody = context.buildReportDocumentHtml(customCfg, { ...presentation, bodyHtml: presentation.bodyHtml.replace('<td>2', '<td>4') });
  const first = await portable(custom), second = await portable(changedBody);
  try {
    assert.equal(first.window.document.querySelectorAll('.rep-toolbar').length, 1);
    assert.equal(first.window.document.querySelectorAll('.rep-paper').length, 1);
    assert.equal(first.window.document.querySelectorAll('.rep-header').length, 1);
    assert.equal(first.window.document.querySelectorAll('.rep-footer').length, 1);
    assert.equal(first.window.document.querySelector('#repAttachmentApproval').disabled, true);
    assert.ok(first.window.document.documentElement.classList.contains('mathjax-fallback'));
    const saved = await first.window.serializeReportDocumentHtml();
    const other = await second.window.serializeReportDocumentHtml();
    assert.equal(checker.verifyFormalHtmlContentSeal(saved).status, 'verified');
    assert.equal(checker.verifyFormalHtmlApprovalSeal(saved).status, 'verified');
    assert.notEqual(checker.verifyFormalHtmlContentSeal(saved).expectedSha256, checker.verifyFormalHtmlContentSeal(other).expectedSha256, '內容片段須納入 seal');
    const reopened = await portable(saved);
    try { assert.equal(await reopened.window.buildReportText(), await first.window.buildReportText()); }
    finally { reopened.window.close(); }
  } finally { first.window.close(); second.window.close(); }

  const steel = steelApp(target, '鋼構工具/index.html');
  const oldSteel = baseline ? steelApp(baseline, '鋼構工具/index.html') : null;
  const traces = [];
  // T2 afe3708c 的既有來源投影；不能用新 renderer 自己算的值當唯一 oracle。
  const fingerprints = {
    plate_check: 'CF-01690B1EED6335F2', tension_member: 'CF-4059EF78073A60E4',
    single_plate: 'CF-3951FC40B841CFD4', brace_gusset: 'CF-02AEC266D3D66DFA',
    beam_column_moment: 'CF-85C8D1B50B7F31C1', column_splice: 'CF-D72B0E4043A3E774',
  };
  try {
    for (const type of ['plate_check', 'tension_member', 'single_plate', 'brace_gusset', 'beam_column_moment', 'column_splice']) {
      steel.select(type); if (oldSteel) oldSteel.select(type);
      const payload = normalize(steel.win.buildSteelConnectionSourcePayload());
      assert.equal(payload.calculationFingerprint, fingerprints[type], type + ' T2 固定來源指紋');
      if (oldSteel) assert.deepEqual(payload, normalize(oldSteel.win.buildSteelConnectionSourcePayload()), type + ' source JSON / 原投影不得漂移');
      const html = steel.report(), doc = new JSDOM(html).window.document;
      assert.equal(doc.querySelector('[data-calculation-fingerprint]').dataset.calculationFingerprint, payload.calculationFingerprint);
      assert.equal(doc.querySelector('[data-formal-approval-allowed]').dataset.formalApprovalAllowed, String(steel.win.latestSteelConnectionResult.passes));
      assert.equal(doc.querySelectorAll('.rep-toolbar').length, 1);
      assert.equal(doc.querySelectorAll('.rep-header').length, 1);
      assert.equal(doc.querySelectorAll('.rep-footer').length, 1);
      assert.equal(doc.querySelectorAll('.rep-sealed-content > .block').length > 3, true);
      if (oldSteel) {
        const previous = new JSDOM(oldSteel.report()).window.document;
        assert.deepEqual([...doc.querySelectorAll('.block')].map(node => node.textContent), [...previous.querySelectorAll('.block')].map(node => node.textContent), type + ' 所有工程區塊逐段文字保留');
        assert.deepEqual([...doc.querySelectorAll('.block svg')].map(node => node.outerHTML), [...previous.querySelectorAll('.block svg')].map(node => node.outerHTML), type + ' 向量示意圖保留');
      }
      traces.push({ type, fingerprint: payload.calculationFingerprint, passes: steel.win.latestSteelConnectionResult.passes });
    }
    steel.select('plate_check');
    for (const [name, value] of Object.entries({ projectName: 'T4 契約工程', connectionTag: 'T4-CONTRACT-001', designer: 'QA' })) {
      const field = steel.win.document.querySelector(`[name="${name}"]`);
      field.value = value; field.dispatchEvent(new steel.win.Event('change', { bubbles: true }));
    }
    const sourcePayload = normalize(steel.win.buildSteelConnectionSourcePayload());
    const report = await portable(steel.report());
    try {
      const approval = report.window.document.querySelector('#repAttachmentApproval');
      assert.equal(approval.disabled, false);
      approval.checked = true; approval.dispatchEvent(new report.window.Event('change', { bubbles: true }));
      const approvedHtml = report.window.serializeReportDocumentHtml();
      approval.checked = false; approval.dispatchEvent(new report.window.Event('change', { bubbles: true }));
      const internalHtml = report.window.serializeReportDocumentHtml();
      verifySteelReportPackage({ key: 'node-plate', approvedHtml, internalHtml, sourcePayload,
        outputDir: path.join(repository, 'output/contract/steel-report-presentation', String(Date.now())) });
    } finally { report.window.close(); }
  } finally { steel.dom.window.close(); oldSteel?.dom.window.close(); }
  console.log(JSON.stringify({ test: 'report-presentation.contract', passed: true, baselineCompared: Boolean(baseline), browserExecuted: false, traces }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
