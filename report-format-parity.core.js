'use strict';

const assert = require('node:assert/strict');

const compact = value => String(value || '').replace(/\s+/g, '');
function numericFields(value) {
  return (String(value || '').replace(/[−–]/g, '-').replace(/,/g, '').match(/[+-]?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?/g) || []).map(value => value.startsWith('+') ? value.slice(1) : value);
}

function parseTextTable(block) {
  return String(block || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function renderedCells(line, sourceRow, sourceTable) {
  const value = String(line || '').replace(/^[-•]\s*/, '');
  if ((sourceTable.headerRows || 0) > 0 && !/rep-input/.test(sourceTable.className || '')) {
    return value.split('｜').map((segment, index) => {
      const header = compact(sourceTable.rows[0]?.[index]?.text || `欄位 ${index + 1}`);
      const normalized = compact(segment);
      assert.ok(normalized.startsWith(`${header}：`), `TXT column ${index + 1} header label`);
      return normalized.slice(header.length + 1);
    });
  }
  if (sourceRow.length > 2 && value.includes('｜')) return value.split('｜');
  if (sourceRow.length === 2 && value.includes('：')) {
    const separator = value.indexOf('：');
    return [value.slice(0, separator), value.slice(separator + 1)];
  }
  return [value];
}

function compareTxtTable(block, sourceTable, tableNumber, label) {
  const lines = parseTextTable(block);
  const bodyRows = sourceTable.rows.slice(sourceTable.headerRows || 0);
  const numericFieldsChecked = bodyRows.reduce((sum, row) => sum + row.reduce((n, cell) => n + numericFields(cell.text).length, 0), 0);
  const header = sourceTable.rows[0] || [];
  const checkTable = header.length >= 5 && header.some(cell => /^(?:公式)$/.test(compact(cell.text))) && header.some(cell => /^(?:判定|OK\?)$/.test(compact(cell.text)));
  const rowWidth = checkTable ? 5 : 1;
  assert.equal(lines.length, bodyRows.length * rowWidth, `${label} TXT table ${tableNumber} row/cell line count`);

  bodyRows.forEach((row, rowIndex) => {
    const actualLines = lines.slice(rowIndex * rowWidth, (rowIndex + 1) * rowWidth);
    const actualCellsRaw = checkTable
      ? actualLines.map(line => String(line).replace(/^[-•]\s*/, '').replace(/^(?:公式|代入值|結果|判定)：/, ''))
      : renderedCells(actualLines[0], row, sourceTable);
    const actualCells = actualCellsRaw.map(compact);
    assert.equal(actualCells.length, row.length, `${label} TXT table ${tableNumber} row ${rowIndex + 1} cell count`);
    row.forEach((cell, cellIndex) => {
      let expected = compact(cell.text);
      if (!expected && checkTable) expected = '—';
      if (!expected && !checkTable && !/rep-input/.test(sourceTable.className || '') && (sourceTable.headerRows || 0) > 0) expected = '—';
      assert.equal(actualCells[cellIndex], expected, `${label} TXT table ${tableNumber} row ${rowIndex + 1} cell ${cellIndex + 1} label/value/unit/verdict`);
    });
    const expectedNumbers = row.map(cell => numericFields(cell.text));
    const actualNumbers = actualCellsRaw.map(cell => numericFields(cell));
    assert.deepEqual(actualNumbers, expectedNumbers, `${label} TXT table ${tableNumber} row ${rowIndex + 1} numeric values stay in their row`);
  });
  return { numericFieldsChecked, rowsChecked: bodyRows.length, cellsChecked: bodyRows.reduce((n, row) => n + row.length, 0) };
}

function validateSelection(actual, requested, expectedCases) {
  assert.ok(Array.isArray(actual) && actual.length, 'browser summary selected must be a non-empty array');
  assert.equal(new Set(actual).size, actual.length, 'browser summary must not contain duplicate cases');
  assert.deepEqual(actual, requested, 'browser summary cases must exactly match requested cases in declared order');
  for (const key of requested) assert.ok(expectedCases.includes(key), `未知工具案例：${key}`);
  if (requested.length === expectedCases.length) assert.deepEqual(requested, expectedCases, '完整模式必須固定執行四案');
}

module.exports = { compact, numericFields, parseTextTable, compareTxtTable, validateSelection };
