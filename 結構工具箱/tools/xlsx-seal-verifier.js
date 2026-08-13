'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { inflateRawSync } = require('zlib');

const CONTENT_SCOPE = 'anchor-xlsx-calculation-book-content-v1';
const APPROVAL_SCOPE = 'anchor-xlsx-calculation-book-approval-v1';
const LABELS = Object.freeze({
  contentScope: 'XLSX 內容封印範圍',
  contentSha256: 'XLSX 內容 SHA-256',
  approvalScope: 'XLSX 核可封印範圍',
  approvalSha256: 'XLSX 核可 SHA-256',
  note: 'XLSX 封印說明',
});
const APPROVAL_FIELDS = Object.freeze([
  '文件狀態', '核可資訊', '產出工具', '工具版本', '輸出時間', '計算指紋',
]);
const EXCLUDED_SUMMARY_LABELS = new Set([...APPROVAL_FIELDS, ...Object.values(LABELS)]);

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function xmlAttribute(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeXml(String(source || '').match(new RegExp(`\\b${escaped}=["']([^"']*)["']`, 'i'))?.[1] || '');
}

function readZipEntriesFromBuffer(zip, label = 'XLSX') {
  const bytes = Buffer.isBuffer(zip) ? zip : Buffer.from(zip);
  let eocdOffset = -1;
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { eocdOffset = offset; break; }
  }
  if (eocdOffset < 0) throw new Error(`${label} ZIP 缺少 end-of-central-directory`);
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  let centralOffset = bytes.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error(`${label} ZIP central directory 無效`);
    const method = bytes.readUInt16LE(centralOffset + 10);
    const compressedSize = bytes.readUInt32LE(centralOffset + 20);
    const nameLength = bytes.readUInt16LE(centralOffset + 28);
    const extraLength = bytes.readUInt16LE(centralOffset + 30);
    const commentLength = bytes.readUInt16LE(centralOffset + 32);
    const localOffset = bytes.readUInt32LE(centralOffset + 42);
    const nameStart = centralOffset + 46;
    const name = bytes.toString('utf8', nameStart, nameStart + nameLength);
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`${label} ZIP local header 無效：${name}`);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) entries.set(name, compressed);
    else if (method === 8) entries.set(name, inflateRawSync(compressed));
    else throw new Error(`${label} ZIP 不支援壓縮法 ${method}：${name}`);
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntries(filePath) {
  return readZipEntriesFromBuffer(fs.readFileSync(filePath), path.basename(filePath));
}

function parseSharedStrings(xml) {
  return [...String(xml || '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map(item =>
    [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(text => decodeXml(text[1])).join('')
  );
}

function normalizePart(value) {
  const result = [];
  for (const item of String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').split('/')) {
    if (!item || item === '.') continue;
    if (item === '..') result.pop(); else result.push(item);
  }
  return result.join('/');
}

function workbookSheets(entries) {
  const workbookXml = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const targets = new Map([...relsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)].map(match => [
    xmlAttribute(match[1], 'Id'), normalizePart(path.posix.join('xl', xmlAttribute(match[1], 'Target'))),
  ]));
  return [...workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/gi)].map(match => ({
    name: xmlAttribute(match[1], 'name'),
    state: (xmlAttribute(match[1], 'state') || 'visible').toLowerCase(),
    entry: targets.get(xmlAttribute(match[1], 'r:id')) || '',
  }));
}

function cellScalar(type, raw, sharedStrings) {
  if (type === 's') return sharedStrings[Number(raw)] ?? '';
  if (type === 'b') return raw === '1';
  if (type === 'str' || type === 'inlinestr' || type === 'd' || type === 'e') return decodeXml(raw);
  if (raw === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : decodeXml(raw);
}

function parseWorksheet(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of String(xml || '').matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gi)) {
    const cells = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const address = xmlAttribute(cellMatch[1], 'r');
      if (!address) throw new Error('XLSX 封印驗證遇到缺少 r 參照的儲存格');
      const type = xmlAttribute(cellMatch[1], 't').toLowerCase();
      const formulaMatch = cellMatch[2].match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/i);
      let raw = cellMatch[2].match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i)?.[1] ?? '';
      if (type === 'inlinestr') raw = [...cellMatch[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(item => item[1]).join('');
      const value = cellScalar(type, raw, sharedStrings);
      cells.push({ address, kind: formulaMatch ? 'formula' : 'value', formula: decodeXml(formulaMatch?.[1] || ''), value });
    }
    rows.push({ number: Number(xmlAttribute(rowMatch[1], 'r')) || 0, cells });
  }
  return rows;
}

function parsedWorkbook(entries) {
  if (!(entries instanceof Map)) throw new TypeError('XLSX entries must be a Map');
  const sharedStrings = parseSharedStrings(entries.get('xl/sharedStrings.xml')?.toString('utf8') || '');
  return workbookSheets(entries).map(sheet => {
    if (!sheet.entry || !entries.has(sheet.entry)) throw new Error(`XLSX 工作表來源缺失：${sheet.name}`);
    return { ...sheet, rows: parseWorksheet(entries.get(sheet.entry).toString('utf8'), sharedStrings) };
  });
}

function rowField(row) {
  const first = row.cells.find(cell => /^A\d+$/i.test(cell.address));
  const second = row.cells.find(cell => /^B\d+$/i.test(cell.address));
  return [String(first?.value ?? '').trim(), String(second?.value ?? '').trim()];
}

function summaryFields(sheets) {
  const summary = sheets.find(sheet => sheet.name === 'Summary');
  if (!summary) throw new Error('XLSX 缺少 Summary 工作表');
  return new Map(summary.rows.map(rowField).filter(([label]) => label));
}

function canonicalContent(sheets) {
  return JSON.stringify({
    scope: CONTENT_SCOPE,
    sheets: sheets.map(sheet => ({
      name: sheet.name,
      cells: sheet.rows.flatMap(row => {
        const [label] = rowField(row);
        if (sheet.name === 'Summary' && EXCLUDED_SUMMARY_LABELS.has(label)) return [];
        return row.cells.map(cell => [cell.address, cell.kind, cell.formula, cell.value]);
      }),
    })),
  });
}

function canonicalApproval(fields, contentSha256) {
  return JSON.stringify({
    scope: APPROVAL_SCOPE,
    documentState: fields.get('文件狀態') || '',
    approvalInfo: fields.get('核可資訊') || '',
    sourceTool: fields.get('產出工具') || '',
    toolVersion: fields.get('工具版本') || '',
    outputTime: fields.get('輸出時間') || '',
    calculationFingerprint: fields.get('計算指紋') || '',
    contentSha256: String(contentSha256 || '').toLowerCase(),
  });
}

function sealResult(scope, expectedScope, expectedSha256, actualSha256, mismatchReason) {
  const reasons = [];
  if (!scope && !expectedSha256) return { status: 'missing', scope: '', expectedSha256: '', actualSha256, reasons: ['seal-missing'] };
  if (scope !== expectedScope) reasons.push('seal-scope');
  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) reasons.push('seal-sha256');
  if (expectedSha256 && actualSha256 && expectedSha256 !== actualSha256) reasons.push(mismatchReason);
  return { status: reasons.length ? 'failed' : 'verified', scope, expectedSha256, actualSha256, reasons };
}

function verifyAnchorXlsxSeals(entries) {
  const sheetIndex = workbookSheets(entries);
  if (!sheetIndex.some(sheet => sheet.name === 'Summary')) {
    return {
      schemaVersion: 1,
      content: { status: 'missing', scope: '', expectedSha256: '', actualSha256: '', reasons: ['seal-missing'] },
      approval: { status: 'missing', scope: '', expectedSha256: '', actualSha256: '', reasons: ['seal-missing'] },
    };
  }
  const sheets = parsedWorkbook(entries);
  const fields = summaryFields(sheets);
  const contentActual = sha256Text(canonicalContent(sheets));
  const contentExpected = String(fields.get(LABELS.contentSha256) || '').trim().toLowerCase();
  const contentScope = String(fields.get(LABELS.contentScope) || '').trim();
  const approvalExpected = String(fields.get(LABELS.approvalSha256) || '').trim().toLowerCase();
  const approvalScope = String(fields.get(LABELS.approvalScope) || '').trim();
  const approvalActual = sha256Text(canonicalApproval(fields, contentExpected));
  return {
    schemaVersion: 1,
    content: sealResult(contentScope, CONTENT_SCOPE, contentExpected, contentActual, 'content-sha256-mismatch'),
    approval: sealResult(approvalScope, APPROVAL_SCOPE, approvalExpected, approvalActual, 'approval-sha256-mismatch'),
  };
}

function verifyAnchorXlsxFile(filePath) {
  return verifyAnchorXlsxSeals(readZipEntries(filePath));
}

module.exports = {
  CONTENT_SCOPE, APPROVAL_SCOPE, LABELS, sha256Text, decodeXml, readZipEntriesFromBuffer,
  readZipEntries, parseSharedStrings, parsedWorkbook, canonicalContent, canonicalApproval,
  verifyAnchorXlsxSeals, verifyAnchorXlsxFile,
};
