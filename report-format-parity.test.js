'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { compact, compareTxtTable, validateSelection } = require('./report-format-parity.core');

const ROOT = __dirname;
const MAX_BYTES = 2_000_000;
const EXPECTED_CASES = ['rc-beam', 'steel-beam-formal', 'wind-force', 'earth-pressure'];
function argumentsFromCli(argv) {
  let runDir = '', only = '';
  for (let index = 2; index < argv.length; index += 1) {
    const name = argv[index];
    assert.ok(name === '--run-dir' || name === '--only', `未知 parity 選項：${name}`);
    assert.ok(index + 1 < argv.length && !argv[index + 1].startsWith('--'), `${name} 必須有值`);
    const value = argv[++index];
    if (name === '--run-dir') { assert.equal(runDir, '', '--run-dir 不可重複'); runDir = value; }
    else { assert.equal(only, '', '--only 不可重複'); only = value; }
  }
  const requested = only ? only.split(',').map(item => item.trim()).filter(Boolean) : EXPECTED_CASES;
  assert.ok(runDir, '必須由同一輪 browser 明確傳入 --run-dir');
  assert.ok(only || !argv.includes('--only'), '--only 不可是空案例清單');
  assert.ok(requested.length, '--only 不可是空案例清單');
  assert.equal(new Set(requested).size, requested.length, '--only 不可重複案例');
  for (const key of requested) assert.ok(EXPECTED_CASES.includes(key), `未知工具案例：${key}`);
  return { runDir: path.resolve(runDir), requested: EXPECTED_CASES.filter(key => requested.includes(key)) };
}

function loadRunSummary(runDir, requested) {
  const summaryPath = path.join(runDir, 'summary.json');
  assert.ok(fs.existsSync(summaryPath), `指定 browser run 缺少 summary.json：${summaryPath}`);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  validateSelection(summary.selected, requested, EXPECTED_CASES);
  assert.equal(summary.failures.length, 0, 'Report DOCX browser run has no failures');
  assert.equal(summary.cases.length, requested.length, 'browser summary case records must match selected cases');
  assert.deepEqual(summary.cases.map(record => record.key), requested, 'browser case records must match requested cases');
  return summary;
}
function tableTextMatrix(table) {
  return [...table.rows].map(row => [...row.cells].map(cell => compact(cell.textContent)));
}

async function compareCase(runDir, record) {
  const { JSDOM } = require('./螺栓檢討/bolt-review-tool/node_modules/jsdom');
  const key = record.key;
  const htmlPath = path.join(runDir, key + '-source-portable.html');
  const txtPath = path.join(runDir, key + '-source.txt');
  const docxPath = path.join(runDir, key + '.docx');
  const inventoryPath = path.join(runDir, key + '-source-inventory.json');
  for (const file of [htmlPath, txtPath, docxPath, inventoryPath]) assert.ok(fs.existsSync(file), `${key} missing ${path.basename(file)}`);
  const files = [htmlPath, txtPath, docxPath];
  const sizes = Object.fromEntries(files.map(file => [path.basename(file), fs.statSync(file).size]));
  for (const [file, bytes] of Object.entries(sizes)) assert.ok(bytes > 0 && bytes <= MAX_BYTES, `${key} ${file} must be 1..2,000,000 bytes; got ${bytes}`);

  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html);
  const paper = dom.window.document.querySelector('.rep-paper, .paper');
  assert.ok(paper, `${key} HTML calculation book exists`);
  const htmlTables = [...paper.querySelectorAll('table')];
  assert.equal(htmlTables.length, inventory.tables.length, `${key} saved HTML table count matches captured source DOM`);
  const htmlMatrix = htmlTables.map(tableTextMatrix);
  const sourceMatrix = inventory.tables.map(table => table.rows.map(row => row.map(cell => compact(cell.text))));
  assert.deepEqual(htmlMatrix, sourceMatrix, `${key} saved HTML cells match the captured report DOM`);
  assert.equal(record.docx.tables, htmlTables.length, `${key} HTML and DOCX table count`);

  const rawText = fs.readFileSync(txtPath, 'utf8');
  assert.equal(rawText.charCodeAt(0), 0xfeff, `${key} TXT has UTF-8 BOM`);
  const text = rawText.slice(1);
  const starts = [...text.matchAll(/^【表格 (\d+) 開始】$/gm)];
  const ends = [...text.matchAll(/^【表格 (\d+) 結束】$/gm)];
  assert.equal(starts.length, htmlTables.length, `${key} HTML/TXT table count`);
  assert.equal(ends.length, htmlTables.length, `${key} TXT table end count`);
  let numericFieldsChecked = 0;
  const tableChecks = [];
  for (let tableIndex = 0; tableIndex < htmlTables.length; tableIndex += 1) {
    const start = starts[tableIndex], end = ends[tableIndex];
    const number = String(tableIndex + 1);
    assert.equal(start[1], number, `${key} TXT table start order`);
    assert.equal(end[1], number, `${key} TXT table end order`);
    assert.ok(start.index < end.index, `${key} TXT table ${number} start/end order`);
    assert.equal(starts[tableIndex + 1]?.index < end.index, false, `${key} TXT table blocks cannot overlap`);
    const block = text.slice(start.index + start[0].length, end.index);
    const sourceTable = inventory.tables[tableIndex];
    const checked = compareTxtTable(block, sourceTable, number, key);
    numericFieldsChecked += checked.numericFieldsChecked;
    tableChecks.push({ table: number, rows: sourceTable.rows.length, ...checked });
  }

  const { inspectDocx } = require('./report-docx.browser.test');
  const docxResult = await inspectDocx(docxPath, inventory, runDir);
  assert.equal(docxResult.tables, htmlTables.length, `${key} DOCX parsed table count`);
  assert.ok(docxResult.bytes <= MAX_BYTES, `${key} DOCX size limit`);
  dom.window.close();
  return { key, tableCount: htmlTables.length, numericFieldsChecked, sizes, tableChecks, docx: docxResult };
}

async function main(argv = process.argv) {
  const { runDir, requested } = argumentsFromCli(argv);
  const sourceSummary = loadRunSummary(runDir, requested);
  const caseResults = [];
  for (const record of sourceSummary.cases) caseResults.push(await compareCase(runDir, record));
  assert.equal(caseResults.reduce((sum, item) => sum + 3, 0), requested.length * 3, '每案各有 HTML、TXT、DOCX 三份來源輸出');
  const wordChecks = [];
  for (const record of sourceSummary.cases) {
    const wordOutput = execFileSync('cscript.exe', [
      '//NoLogo', path.join(ROOT, 'verify-report-docx-word.vbs'), path.join(runDir, record.key + '.docx'), String(record.docx.tables),
    ], { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    const line = wordOutput.trim();
    assert.ok(line.startsWith('WORD_OPEN_NO_REPAIR_OK '), `${record.key} Microsoft Word OpenNoRepairDialog: ${line}`);
    wordChecks.push(line);
  }
  assert.equal(wordChecks.length, requested.length, 'Microsoft Word opened every selected DOCX without the repair dialog');
  const summary = {
    createdAt: new Date().toISOString(),
    sourceSummary: path.relative(ROOT, path.join(runDir, 'summary.json')),
    outputCount: requested.length * 3,
    wordChecks,
    cases: caseResults,
    pass: true,
  };
  const summaryPath = path.join(runDir, 'format-parity-summary.json');
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ runDir, outputCount: summary.outputCount, cases: caseResults.map(item => ({ key: item.key, tables: item.tableCount, numericFieldsChecked: item.numericFieldsChecked, sizes: item.sizes })), wordChecks, summaryPath }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { argumentsFromCli, loadRunSummary, tableTextMatrix, compareCase, main };
