'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { validatePdfFile } = require('./rendered-delivery-evidence');

const EXPORT_KIND = 'xlsx-office-print-export.v1';
const EXPECTED_RENDERER = 'microsoft-excel-export-as-fixed-format';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableFile(filePath, label) {
  const before = fs.lstatSync(filePath);
  assert.equal(before.isSymbolicLink(), false, `${label} is not a symbolic link`);
  assert.equal(before.isFile(), true, `${label} is a regular file`);
  const bytes = fs.readFileSync(filePath);
  const after = fs.lstatSync(filePath);
  assert.equal(after.size, before.size, `${label} size remains stable`);
  assert.equal(after.mtimeMs, before.mtimeMs, `${label} timestamp remains stable`);
  return bytes;
}

function verifyPrintMetadata(summary, expectedSheets, options = {}) {
  const issues = [];
  const add = (code, sheet, detail) => issues.push({ code, sheet, detail });
  const records = Array.isArray(summary?.records) ? summary.records : [];
  const expected = Array.isArray(expectedSheets) ? expectedSheets : [];

  if (summary?.kind !== EXPORT_KIND) add('invalid-kind', '', String(summary?.kind || ''));
  if (summary?.renderer !== EXPECTED_RENDERER) add('invalid-renderer', '', String(summary?.renderer || ''));
  if (summary?.sheetCount !== expected.length || records.length !== expected.length) {
    add('sheet-count-mismatch', '', `${records.length}/${expected.length}`);
  }

  expected.forEach((sheet, index) => {
    const record = records[index];
    if (!record || record.sheet !== sheet.name || record.index !== index + 1) {
      add('sheet-order-mismatch', sheet.name, `${record?.index || '-'}:${record?.sheet || '-'}`);
      return;
    }
    const setup = record.pageSetup || {};
    const expectedOrientation = Number(record.usedColumns) >= (options.landscapeColumnThreshold || 7) ? 2 : 1;
    if (setup.paperSize !== 9) add('not-a4', sheet.name, String(setup.paperSize));
    if (setup.orientation !== expectedOrientation) add('orientation-mismatch', sheet.name, String(setup.orientation));
    if (setup.zoom !== false) add('fit-mode-disabled', sheet.name, String(setup.zoom));
    if (setup.fitToPagesWide !== 1) add('not-one-page-wide', sheet.name, String(setup.fitToPagesWide));
    if (setup.fitToPagesTall !== 0) add('forced-one-page-tall', sheet.name, String(setup.fitToPagesTall));
    if (setup.centerHorizontally !== true || setup.centerVertically !== false) {
      add('centering-mismatch', sheet.name, `${setup.centerHorizontally}/${setup.centerVertically}`);
    }
    if (!/^\$?[A-Z]+\$?1:\$?[A-Z]+\$?\d+$/.test(String(setup.printArea || ''))) {
      add('missing-print-area', sheet.name, String(setup.printArea || ''));
    }
    if (String(setup.printTitleRows || '') !== '$1:$1') add('missing-repeat-header', sheet.name, String(setup.printTitleRows || ''));
    if (record.verticalPageBreakCount !== 0) add('horizontal-overflow-pages', sheet.name, String(record.verticalPageBreakCount));
    if (!Number.isInteger(record.usedRows) || record.usedRows < 2 || !Number.isInteger(record.usedColumns) || record.usedColumns < 2) {
      add('empty-used-range', sheet.name, `${record.usedRows}x${record.usedColumns}`);
    }
  });

  return {
    pass: issues.length === 0,
    issueCount: issues.length,
    issues,
    sheetCount: records.length,
  };
}

function runXlsxPrintVisualAudit(options) {
  const workbookPath = path.resolve(options.workbookPath);
  const outputDir = path.resolve(options.outputDir);
  const expectedSheets = options.expectedSheets || [];
  const label = options.label || path.basename(workbookPath);
  const workbookBytes = stableFile(workbookPath, `${label} workbook`);
  fs.mkdirSync(outputDir, { recursive: true });
  const summaryPath = path.join(outputDir, 'xlsx-print-export-summary.json');
  const exporter = path.join(__dirname, 'xlsx-print-export.py');
  const python = process.env.XLSX_PRINT_PYTHON || 'python';
  const result = spawnSync(python, [
    exporter,
    '--input', workbookPath,
    '--output-dir', outputDir,
    '--summary', summaryPath,
  ], {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${label} Excel print export: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} Excel print export: ${result.stderr || result.stdout || `exit=${result.status}`}`);

  const summaryBytes = stableFile(summaryPath, `${label} print summary`);
  const summary = JSON.parse(summaryBytes.toString('utf8'));
  assert.equal(summary.source, path.basename(workbookPath), `${label} print summary names the workbook`);
  assert.equal(summary.sourceBytes, workbookBytes.length, `${label} print summary records workbook bytes`);
  assert.equal(summary.sourceSha256, sha256(workbookBytes), `${label} print summary records workbook SHA-256`);
  const metadata = verifyPrintMetadata(summary, expectedSheets);
  assert.equal(metadata.pass, true, `${label} print metadata is valid: ${JSON.stringify(metadata.issues)}`);

  const pdfRecords = summary.records.map((record, index) => {
    const expected = expectedSheets[index];
    assert.ok(record.artifact && path.basename(record.artifact) === record.artifact, `${label} ${record.sheet} PDF uses a direct child name`);
    const pdfPath = path.join(outputDir, record.artifact);
    const pdfBytes = stableFile(pdfPath, `${label} ${record.sheet} PDF`);
    assert.equal(record.artifactBytes, pdfBytes.length, `${label} ${record.sheet} PDF byte count`);
    assert.equal(record.artifactSha256, sha256(pdfBytes), `${label} ${record.sheet} PDF SHA-256`);
    const pdf = validatePdfFile(pdfPath, {
      label: `${label} ${record.sheet}`,
      minTextLength: expected.minTextLength || 20,
      requiredNeedles: expected.requiredNeedles || [],
      forbiddenNeedles: options.forbiddenNeedles || [],
      footerNeedles: [],
      contentBoundaryProfile: 'direct-print-boundary',
    });
    const repeatHeaderNeedle = expected.repeatHeaderNeedle || expected.requiredNeedles?.[0] || '';
    if (repeatHeaderNeedle) {
      for (const page of pdf.pageTextStats) {
        assert.ok(
          page.preview.join(' ').includes(repeatHeaderNeedle),
          `${label} ${record.sheet} PDF page ${page.page} repeats a contextual table header`
        );
      }
    }
    return {
      index: record.index,
      sheet: record.sheet,
      pageCount: pdf.pageCount,
      textLength: pdf.textLength,
      artifactBytes: pdfBytes.length,
      artifactSha256: sha256(pdfBytes),
      verticalPageBreakCount: record.verticalPageBreakCount,
      horizontalPageBreakCount: record.horizontalPageBreakCount,
      paperSize: record.pageSetup.paperSize,
      orientation: record.pageSetup.orientation,
      printArea: record.pageSetup.printArea,
      printTitleRows: record.pageSetup.printTitleRows,
      fitToPagesWide: record.pageSetup.fitToPagesWide,
      fitToPagesTall: record.pageSetup.fitToPagesTall,
    };
  });
  const artifactSetSha256 = sha256(Buffer.from(
    pdfRecords.map(record => `${record.index}\0${record.artifactSha256}`).join('\n'),
    'utf8'
  ));
  return {
    schemaVersion: 1,
    key: options.key || 'xlsx-print',
    pass: true,
    issueCount: 0,
    renderer: EXPECTED_RENDERER,
    workbookBytes: workbookBytes.length,
    workbookSha256: sha256(workbookBytes),
    sheetCount: pdfRecords.length,
    sheetComplete: pdfRecords.length,
    pageCount: pdfRecords.reduce((sum, record) => sum + record.pageCount, 0),
    verticalPageBreakCount: pdfRecords.reduce((sum, record) => sum + record.verticalPageBreakCount, 0),
    artifactSetSha256,
    summaryBytes: summaryBytes.length,
    summarySha256: sha256(summaryBytes),
    records: pdfRecords,
  };
}

module.exports = {
  EXPECTED_RENDERER,
  EXPORT_KIND,
  runXlsxPrintVisualAudit,
  verifyPrintMetadata,
};
