'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('./螺栓檢討/bolt-review-tool/node_modules/jsdom');
const { inspectDocx } = require('./report-docx.browser.test');

const ROOT = __dirname;
const OUTPUT_ROOT = path.join(ROOT, 'output', 'playwright', 'report-docx');
const MAX_BYTES = 2_000_000;
const EXPECTED_CASES = ['rc-beam', 'steel-beam-formal', 'wind-force', 'earth-pressure'];
const compact = value => String(value || '').replace(/\s+/g, '');
function numericFields(value) {
  return String(value || '').replace(/,/g, '').match(/[+-]?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?/g) || [];
}
function latestRun() {
  const pathArg = process.argv.indexOf('--run-dir');
  if (pathArg >= 0) return path.resolve(process.argv[pathArg + 1]);
  const runs = fs.readdirSync(OUTPUT_ROOT).filter(name => fs.existsSync(path.join(OUTPUT_ROOT, name, 'summary.json'))).sort();
  assert.ok(runs.length, '尚無 report-docx 瀏覽器輸出；先執行 test-report-docx.ps1');
  return path.join(OUTPUT_ROOT, runs.at(-1));
}
function tableTextMatrix(table) {
  return [...table.rows].map(row => [...row.cells].map(cell => compact(cell.textContent)));
}

async function compareCase(runDir, record) {
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
    const bodyRows = sourceTable.rows.slice(sourceTable.headerRows || 0);
    const expectedByCell = bodyRows.map((row, rowIndex) => row.map((cell, cellIndex) => ({
      row: rowIndex + (sourceTable.headerRows || 0) + 1,
      column: cellIndex + 1,
      value: numericFields(cell.text),
    })));
    const expectedSequence = expectedByCell.flat().flatMap(cell => cell.value);
    const actualSequence = numericFields(block);
    assert.deepEqual(actualSequence, expectedSequence, `${key} TXT table ${number} numeric fields, in cell order`);
    numericFieldsChecked += expectedSequence.length;
    tableChecks.push({ table: number, rows: sourceTable.rows.length, numericCells: expectedByCell.flat().filter(cell => cell.value.length).length, numericFields: expectedSequence.length });
  }

  const docxResult = await inspectDocx(docxPath, inventory, runDir);
  assert.equal(docxResult.tables, htmlTables.length, `${key} DOCX parsed table count`);
  assert.ok(docxResult.bytes <= MAX_BYTES, `${key} DOCX size limit`);
  dom.window.close();
  return { key, tableCount: htmlTables.length, numericFieldsChecked, sizes, tableChecks, docx: docxResult };
}

async function main() {
  const runDir = latestRun();
  const sourceSummary = JSON.parse(fs.readFileSync(path.join(runDir, 'summary.json'), 'utf8'));
  assert.deepEqual(sourceSummary.selected, EXPECTED_CASES, 'T9 需執行固定四案');
  assert.equal(sourceSummary.failures.length, 0, 'Report DOCX browser run has no failures');
  const caseResults = [];
  for (const record of sourceSummary.cases) caseResults.push(await compareCase(runDir, record));
  assert.equal(caseResults.reduce((sum, item) => sum + 3, 0), 12, '四案各有 HTML、TXT、DOCX，共 12 份輸出');
  const wordChecks = [];
  for (const record of sourceSummary.cases) {
    const wordOutput = execFileSync('cscript.exe', [
      '//NoLogo', path.join(ROOT, 'verify-report-docx-word.vbs'), path.join(runDir, record.key + '.docx'), String(record.docx.tables),
    ], { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    const line = wordOutput.trim();
    assert.ok(line.startsWith('WORD_OPEN_NO_REPAIR_OK '), `${record.key} Microsoft Word OpenNoRepairDialog: ${line}`);
    wordChecks.push(line);
  }
  assert.equal(wordChecks.length, EXPECTED_CASES.length, 'Microsoft Word opened all four DOCX files without the repair dialog');
  const summary = {
    createdAt: new Date().toISOString(),
    sourceSummary: path.relative(ROOT, path.join(runDir, 'summary.json')),
    outputCount: 12,
    wordChecks,
    cases: caseResults,
    pass: true,
  };
  const summaryPath = path.join(runDir, 'format-parity-summary.json');
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ runDir, outputCount: summary.outputCount, cases: caseResults.map(item => ({ key: item.key, tables: item.tableCount, numericFieldsChecked: item.numericFieldsChecked, sizes: item.sizes })), wordChecks, summaryPath }, null, 2));
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
