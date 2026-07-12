'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx', '.json', '.txt', '.html', '.htm']);
const PAGE_ONLY_NEEDLES = [
  '產報前檢查', '附件適用狀態', '優先建議報告閱讀狀態', '優先閱讀', '報告閱讀狀態',
  '可作附件，需人工複核', '暫勿作附件', '頁面輔助', '不會寫入計算書',
];
const FIELD_LABELS = {
  projectName: ['計畫名稱', '專案名稱', '工程名稱', '案件名稱'],
  projectNo: ['計畫編號', '專案編號', '工程編號', '案件編號'],
  designer: ['設計人員', '設計者', '設計人'],
  sourceTool: ['產出工具'],
  toolVersion: ['工具版本', '頁面版本'],
  outputTime: ['輸出時間'],
};
const METADATA_TERMINATORS = [...Object.values(FIELD_LABELS).flat(), '製表日期', '計算書模式', '計算指紋'];

function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXmlText(value) {
  return normalizeText(String(value || '')
    .replace(/<w:p[^>]*>/g, '\n')
    .replace(/<row[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, ' '));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanMetadataValue(value) {
  const text = String(value || '').trim();
  return /^(?:—|未填|N\/A|-)$/.test(text) ? '' : text;
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}: ${result.stderr || result.stdout || `exit=${result.status}`}`);
  return result.stdout || '';
}

function readArchiveEntries(filePath) {
  return run('tar', ['-tf', filePath], `${path.basename(filePath)} archive list`)
    .split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function readArchiveEntry(filePath, entry) {
  return run('tar', ['-xOf', filePath, entry], `${path.basename(filePath)} ${entry}`);
}

function extractPdfText(filePath) {
  return run('pdftotext', ['-layout', filePath, '-'], `${path.basename(filePath)} PDF text`);
}

function extractDocxText(filePath) {
  const entries = readArchiveEntries(filePath);
  if (!entries.includes('word/document.xml')) throw new Error('DOCX 缺少 word/document.xml');
  return decodeXmlText(readArchiveEntry(filePath, 'word/document.xml'));
}

function extractXlsxText(filePath) {
  const allEntries = readArchiveEntries(filePath);
  const sharedEntries = allEntries.filter(entry => entry === 'xl/sharedStrings.xml');
  const entries = sharedEntries.length ? sharedEntries : allEntries.filter(entry => (
    entry === 'xl/workbook.xml' || /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry)
  ));
  if (!entries.length) throw new Error('XLSX 缺少可讀取的 workbook XML');
  return decodeXmlText(entries.map(entry => readArchiveEntry(filePath, entry)).join('\n'));
}

function extractJsonMetadata(value) {
  const fields = value && typeof value === 'object' ? value.fields || {} : {};
  const fieldValue = (...ids) => {
    for (const id of ids) {
      const item = fields[id];
      if (item && typeof item === 'object' && item.value != null) return String(item.value).trim();
      if (typeof item === 'string') return item.trim();
    }
    return '';
  };
  const project = value?.project && typeof value.project === 'object' ? value.project : {};
  const tool = value?.tool && typeof value.tool === 'object' ? value.tool : {};
  const fingerprints = unique([value?.calculationFingerprint, value?.fingerprint, value?.report?.calculationFingerprint]
    .map(item => String(item || '').trim()).filter(item => /^CF-[0-9A-F]{16}$/i.test(item)));
  return {
    projectName: cleanMetadataValue(project.name || value?.projectName || fieldValue('projName', 'projectName')),
    projectNo: cleanMetadataValue(project.no || value?.projectNo || fieldValue('projNo', 'projectNo')),
    designer: cleanMetadataValue(project.designer || value?.projectDesigner || fieldValue('projDesigner', 'projectDesigner')),
    sourceTool: cleanMetadataValue(tool.name || tool.id || value?.toolName),
    toolVersion: cleanMetadataValue(tool.version || value?.toolVersion || value?.pageVersion),
    outputTime: cleanMetadataValue(value?.savedAt || value?.outputTime),
    fingerprints,
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractLabelValue(text, labels) {
  const nextLabels = METADATA_TERMINATORS.map(escapeRegex).join('|');
  for (const label of labels) {
    const match = String(text || '').match(new RegExp(`${escapeRegex(label)}\\s*[:：]?\\s*([^\\r\\n]{0,140})`, 'i'));
    if (!match) continue;
    const value = match[1]
      .replace(new RegExp(`\\s*(?:${nextLabels})\\s*[:：]?[\\s\\S]*$`, 'i'), '')
      .replace(/[｜|]+$/g, '')
      .trim();
    if (cleanMetadataValue(value)) return cleanMetadataValue(value);
  }
  return '';
}

function extractTextMetadata(text) {
  const normalized = normalizeText(text);
  return {
    projectName: extractLabelValue(normalized, FIELD_LABELS.projectName),
    projectNo: extractLabelValue(normalized, FIELD_LABELS.projectNo),
    designer: extractLabelValue(normalized, FIELD_LABELS.designer),
    sourceTool: extractLabelValue(normalized, FIELD_LABELS.sourceTool),
    toolVersion: extractLabelValue(normalized, FIELD_LABELS.toolVersion),
    outputTime: extractLabelValue(normalized, FIELD_LABELS.outputTime),
    fingerprints: unique((normalized.match(/CF-[0-9A-F]{16}/gi) || []).map(item => item.toUpperCase())),
  };
}

function inspectAttachment(filePath, rootDir) {
  const type = path.extname(filePath).toLowerCase().slice(1) || 'unknown';
  const record = {
    file: path.relative(rootDir, filePath) || path.basename(filePath), type, size: fs.statSync(filePath).size,
    textLength: 0, projectName: '', projectNo: '', designer: '', sourceTool: '', toolVersion: '', outputTime: '',
    fingerprints: [], pageOnlyNeedles: [], errors: [],
  };
  try {
    let text = '';
    let metadata = null;
    if (type === 'pdf') text = extractPdfText(filePath);
    else if (type === 'docx') text = extractDocxText(filePath);
    else if (type === 'xlsx') text = extractXlsxText(filePath);
    else if (type === 'json') {
      text = fs.readFileSync(filePath, 'utf8');
      metadata = extractJsonMetadata(JSON.parse(text));
    } else text = fs.readFileSync(filePath, 'utf8');
    Object.assign(record, metadata || extractTextMetadata(text));
    record.textLength = normalizeText(text).length;
    record.pageOnlyNeedles = PAGE_ONLY_NEEDLES.filter(needle => text.includes(needle));
  } catch (error) {
    record.errors.push(error.message || String(error));
  }
  return record;
}

function collectAttachmentFiles(inputDir, ignoredFile) {
  const files = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.isFile() && path.resolve(entryPath) !== ignoredFile && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(entryPath);
    }
  };
  walk(inputDir);
  return files.sort((left, right) => left.localeCompare(right, 'zh-Hant'));
}

function buildIssue(level, code, message, files = []) {
  return { level, code, message, files: unique(files) };
}

function findConflicts(records, key, label, issues) {
  const groups = new Map();
  records.forEach(record => {
    const value = String(record[key] || '').trim();
    if (!value) return;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(record.file);
  });
  if (groups.size > 1) issues.push(buildIssue('error', `${key}-conflict`, `${label}不一致：${[...groups.keys()].join(' / ')}`, [...groups.values()].flat()));
  return groups;
}

function analyzePackage(records, options = {}) {
  const issues = [];
  if (!records.length) issues.push(buildIssue('error', 'no-attachments', '資料夾內沒有可檢查的 PDF、DOCX、XLSX、JSON、HTML 或文字附件。'));
  records.forEach(record => {
    if (record.errors.length) issues.push(buildIssue('error', 'unreadable-attachment', `${record.file} 無法讀取：${record.errors.join('；')}`, [record.file]));
    if (record.pageOnlyNeedles.length) issues.push(buildIssue('error', 'page-only-leak', `${record.file} 含有頁面專用文字：${record.pageOnlyNeedles.join('、')}`, [record.file]));
  });
  const readable = records.filter(record => !record.errors.length);
  const projectNumbers = findConflicts(readable, 'projectNo', '計畫編號', issues);
  findConflicts(readable, 'projectName', '計畫名稱', issues);
  findConflicts(readable, 'designer', '設計人員', issues);
  const expectedProjectNo = String(options.projectNo || '').trim();
  if (expectedProjectNo) readable.forEach(record => {
    if (record.projectNo && record.projectNo !== expectedProjectNo) {
      issues.push(buildIssue('error', 'project-no-mismatch', `${record.file} 的計畫編號 ${record.projectNo} 與指定 ${expectedProjectNo} 不一致。`, [record.file]));
    }
  });
  if (!projectNumbers.size) issues.push(buildIssue('warn', 'missing-project-no', '未能從附件抽取計畫編號；建議以 --project-no 指定本次案件編號。'));
  readable.filter(record => !record.projectNo).forEach(record => issues.push(buildIssue('warn', 'missing-project-no', `${record.file} 未能抽取計畫編號。`, [record.file])));
  const toolVersions = new Map();
  readable.forEach(record => {
    if (!record.sourceTool || !record.toolVersion) return;
    if (!toolVersions.has(record.sourceTool)) toolVersions.set(record.sourceTool, new Map());
    const versions = toolVersions.get(record.sourceTool);
    if (!versions.has(record.toolVersion)) versions.set(record.toolVersion, []);
    versions.get(record.toolVersion).push(record.file);
  });
  toolVersions.forEach((versions, sourceTool) => {
    if (versions.size > 1) issues.push(buildIssue('error', 'tool-version-conflict', `${sourceTool} 使用多個工具版本：${[...versions.keys()].join(' / ')}`, [...versions.values()].flat()));
  });
  readable.filter(record => !record.fingerprints.length).forEach(record => issues.push(buildIssue('warn', 'missing-fingerprint', `${record.file} 未找到計算指紋；請人工確認其來源與內容是否屬於本案。`, [record.file])));
  const fingerprints = new Map();
  readable.forEach(record => record.fingerprints.forEach(fingerprint => {
    if (!fingerprints.has(fingerprint)) fingerprints.set(fingerprint, []);
    fingerprints.get(fingerprint).push(record.file);
  }));
  fingerprints.forEach((files, fingerprint) => {
    if (files.length > 1) issues.push(buildIssue('warn', 'duplicate-fingerprint', `計算指紋 ${fingerprint} 出現在多份附件；確認是否重複附入同一計算結果。`, files));
  });
  const errorCount = issues.filter(issue => issue.level === 'error').length;
  const warningCount = issues.filter(issue => issue.level === 'warn').length;
  return {
    kind: 'attachment-package-check.v1', generatedAt: new Date().toISOString(),
    status: errorCount ? 'blocked' : warningCount ? 'review' : 'ready',
    summary: { attachments: records.length, errors: errorCount, warnings: warningCount },
    expectedProjectNo, attachments: records, issues,
  };
}

function checkPackage(inputDir, options = {}) {
  const resolvedInput = path.resolve(inputDir || '');
  if (!fs.existsSync(resolvedInput) || !fs.statSync(resolvedInput).isDirectory()) throw new Error(`附件資料夾不存在：${resolvedInput || inputDir || '(未指定)'}`);
  const ignoredFile = options.output ? path.resolve(options.output) : '';
  return analyzePackage(collectAttachmentFiles(resolvedInput, ignoredFile).map(file => inspectAttachment(file, resolvedInput)), options);
}

function formatSummary(report) {
  const lines = [
    `附件組包一致性檢查：${report.status === 'ready' ? '可整理' : report.status === 'review' ? '需人工確認' : '暫勿整理'}`,
    `附件 ${report.summary.attachments} 份；阻擋 ${report.summary.errors} 項；提醒 ${report.summary.warnings} 項。`,
  ];
  report.attachments.forEach(record => {
    const trace = [record.projectNo, record.sourceTool, record.toolVersion, record.fingerprints.join(',')].filter(Boolean).join('｜') || '未抽取追溯資訊';
    lines.push(`- ${record.file}：${record.errors.length ? `讀取失敗 (${record.errors.join('；')})` : trace}`);
  });
  report.issues.forEach(issue => lines.push(`[${issue.level === 'error' ? '阻擋' : '提醒'}] ${issue.message}`));
  lines.push('此檢查結果僅供交付前整理，不是計算書、列印或 PDF 附件。');
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--project-no') options.projectNo = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help || !options.input) {
    console.log('用法：node attachment-package-check.js --input <附件資料夾> [--project-no <計畫編號>] [--output <內部檢查結果.json>]');
    return options.help ? 0 : 2;
  }
  const report = checkPackage(options.input, options);
  if (options.output) fs.writeFileSync(path.resolve(options.output), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(formatSummary(report));
  return report.status === 'blocked' ? 1 : 0;
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(`附件組包一致性檢查失敗：${error.message || error}`);
    process.exitCode = 2;
  }
}

module.exports = { PAGE_ONLY_NEEDLES, normalizeText, extractTextMetadata, extractJsonMetadata, inspectAttachment, analyzePackage, checkPackage, formatSummary, parseArgs };
