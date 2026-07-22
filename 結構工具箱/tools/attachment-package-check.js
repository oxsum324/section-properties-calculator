'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  CALCULATION_BOOK_CONTENT_BOUNDARY,
  CONTENT_GROUPS,
  CONTENT_PROFILES,
  evaluateCalculationContent,
} = require('./calculation-book-content-boundary.js');

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx', '.json', '.txt', '.html', '.htm']);
const IGNORED_SYSTEM_FILES = new Set(['thumbs.db', 'desktop.ini', '.ds_store']);
const PAGE_ONLY_NEEDLES = [...new Set([
  ...Object.values(CALCULATION_BOOK_CONTENT_BOUNDARY.forbiddenCategories).flat(),
  '可作附件，需人工複核',
])];
const DRAFT_DOCUMENT_NEEDLES = [
  'DRAFT /', 'DRAFT／', '非正式附件', '列印內部檢討版', '本文件僅供內部檢討', '本文件僅供內部複核', '不得作為正式附件',
  '文件狀態：內部審閱',
];
const READY_DOCUMENT_CLASS_LABEL = '文件狀態：正式附件';
const PACKAGE_STATUS_EXIT_CODES = Object.freeze({
  ready: 0,
  review: 1,
  blocked: 2,
});
const CLI_ERROR_EXIT_CODE = 3;
const REPORT_DOCUMENT_NEEDLES = ['計算書', '計算報告', '檢討報告', '設計報告', '計算附件'];
const CALCULATION_SUMMARY_DOCUMENT_NEEDLES = ['計算摘要', '檢核摘要', '設計摘要', '計算結果摘要'];
const REPORT_IDENTITY_FIELDS = [
  ['projectName', '計畫名稱'],
  ['projectNo', '計畫編號'],
  ['designer', '設計人員'],
];
const FIELD_LABELS = {
  projectName: ['計畫名稱', '專案名稱', '工程名稱', '案件名稱'],
  projectNo: ['計畫編號', '專案編號', '工程編號', '案件編號'],
  designer: ['設計人員', '設計者', '設計人'],
  sourceTool: ['產出工具', '工具名稱'],
  toolVersion: ['目前工具版本', '工具版本', '頁面版本'],
  outputTime: ['輸出時間', '報表生成時間'],
  approvalTime: ['正式附件核可時間', '核可時間'],
};
const METADATA_TERMINATORS = [
  ...Object.values(FIELD_LABELS).flat(),
  '文件狀態', '核可資訊', '複核人員', '規範版本', '發行日期', '案例最後編修', '留痕時間', '留痕來源', '留痕 Hash',
  '案件計算版本', '本案計算版本', '版本狀態', '版本一致性',
  '整體判定', '正式判定', '控制組合', '控制模式', '製表日期', '計算書模式', '計算指紋',
];

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

function extractHtmlText(value) {
  return normalizeText(String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:script|style|template|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|template|noscript)>/gi, ' ')
    .replace(/<([a-z][\w:-]*)\b[^>]*(?:\shidden(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?|\saria-hidden\s*=\s*["']?true["']?|\sstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["'])[^>]*>[\s\S]*?<\/\1>/gi, ' '));
}

function detectCalculationContentProfile(value) {
  const titleRegion = normalizeText(value).slice(0, 320);
  return CALCULATION_SUMMARY_DOCUMENT_NEEDLES.some(needle => titleRegion.includes(needle))
    ? 'calculation-summary'
    : 'calculation-book';
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileSnapshot(filePath) {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('附件來源不是一般檔案');
  return { bytes: stat.size, sha256: sha256File(filePath) };
}

function cleanMetadataValue(value) {
  const text = String(value || '').trim().replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1');
  return /^(?:—|未填|N\/A|-)$/.test(text) ? '' : text;
}

function normalizeToolVersion(value) {
  const raw = cleanMetadataValue(value);
  if (/^[0-9a-f]{7,40}$/i.test(raw) && /[a-f]/i.test(raw)) return raw;
  const bareVersion = raw.match(/^v?(\d+(?:\.\d+)*(?:[-+.\w]*)?)$/i);
  if (bareVersion) return `v${bareVersion[1]}`;
  const namespacedVersion = raw.match(/^[a-z][a-z0-9-]*\.v(\d+(?:\.\d+)*(?:[-+.\w]*)?)$/i);
  if (namespacedVersion) return `v${namespacedVersion[1]}`;
  return raw;
}

function parseTraceDateTime(value) {
  const text = cleanMetadataValue(value);
  if (!text) return null;
  const local = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:T|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,3})?$/.exec(text);
  const zoned = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/.exec(text);
  const match = local || zoned;
  if (match) {
    const parts = [match[1], match[2], match[3], match[4], match[5], match[6] || '0'].map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
    const validCalendarTime = date.getUTCFullYear() === parts[0]
      && date.getUTCMonth() === parts[1] - 1
      && date.getUTCDate() === parts[2]
      && date.getUTCHours() === parts[3]
      && date.getUTCMinutes() === parts[4]
      && date.getUTCSeconds() === parts[5];
    if (!validCalendarTime) return null;
    if (zoned) {
      const epoch = Date.parse(text);
      return Number.isFinite(epoch) ? epoch : null;
    }
    return date.getTime() - 8 * 60 * 60 * 1000;
  }
  return null;
}

function isValidApprovalTime(value) {
  return Number.isFinite(parseTraceDateTime(value));
}

function detectReadyDocumentClass(text) {
  const normalized = normalizeText(text);
  return /文件狀態\s*(?:[｜|:：]\s*)?正式附件/.test(normalized)
    ? [READY_DOCUMENT_CLASS_LABEL]
    : [];
}

function isDocumentClassRequired(record = {}) {
  if (typeof record.documentClassRequired === 'boolean') return record.documentClassRequired;
  if (String(record.type || '').toLowerCase() === 'json') return false;
  if ((record.readyDocumentNeedles || []).length || (record.draftDocumentNeedles || []).length) return true;
  if ((record.reportDocumentNeedles || []).length) return true;
  return Boolean(
    record.sourceTool
    && record.toolVersion
    && record.outputTime
    && Array.isArray(record.fingerprints)
    && record.fingerprints.length
  );
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
  const contentEntries = entries.filter(entry => (
    entry === 'word/document.xml'
    || /^word\/(?:header|footer)\d+\.xml$/i.test(entry)
  ));
  return decodeXmlText(contentEntries.map(entry => readArchiveEntry(filePath, entry)).join('\n'));
}

function extractXlsxText(filePath) {
  const allEntries = readArchiveEntries(filePath);
  const entries = allEntries.filter(entry => (
    entry === 'xl/sharedStrings.xml'
    || entry === 'xl/workbook.xml'
    || /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry)
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
    toolVersion: normalizeToolVersion(tool.version || value?.toolVersion || value?.pageVersion),
    outputTime: cleanMetadataValue(value?.savedAt || value?.outputTime),
    approvalTime: cleanMetadataValue(value?.documentApproval?.approvedAt || value?.approvedAt || value?.report?.approvedAt),
    fingerprints,
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractLabelValue(text, labels) {
  const nextLabels = METADATA_TERMINATORS.map(escapeRegex).join('|');
  const candidates = labels
    .map(label => ({
      label,
      match: new RegExp(`${escapeRegex(label)}\\s*[:：]?\\s*([^\\r\\n]{0,140})`, 'i').exec(String(text || '')),
    }))
    .filter(candidate => candidate.match)
    .sort((left, right) => left.match.index - right.match.index || right.label.length - left.label.length);
  for (const { match } of candidates) {
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
    toolVersion: normalizeToolVersion(extractLabelValue(normalized, FIELD_LABELS.toolVersion)),
    outputTime: extractLabelValue(normalized, FIELD_LABELS.outputTime),
    approvalTime: extractLabelValue(normalized, FIELD_LABELS.approvalTime),
    fingerprints: unique((normalized.match(/CF-[0-9A-F]{16}/gi) || []).map(item => item.toUpperCase())),
  };
}

function inspectAttachment(filePath, rootDir) {
  const type = path.extname(filePath).toLowerCase().slice(1) || 'unknown';
  const record = {
    file: path.relative(rootDir, filePath) || path.basename(filePath), type, size: 0, sourceSha256: '',
    textLength: 0, projectName: '', projectNo: '', designer: '', sourceTool: '', toolVersion: '', outputTime: '', approvalTime: '',
    fingerprints: [], pageOnlyNeedles: [], draftDocumentNeedles: [], readyDocumentNeedles: [],
    reportDocumentNeedles: [], calculationSummaryNeedles: [], documentClassRequired: false, contentBoundary: null, errors: [],
  };
  try {
    const before = fileSnapshot(filePath);
    record.size = before.bytes;
    let text = '';
    let metadata = null;
    if (type === 'pdf') text = extractPdfText(filePath);
    else if (type === 'docx') text = extractDocxText(filePath);
    else if (type === 'xlsx') text = extractXlsxText(filePath);
    else if (type === 'json') {
      text = fs.readFileSync(filePath, 'utf8');
      metadata = extractJsonMetadata(JSON.parse(text));
    } else {
      text = fs.readFileSync(filePath, 'utf8');
      if (type === 'html' || type === 'htm') text = extractHtmlText(text);
    }
    Object.assign(record, metadata || extractTextMetadata(text));
    record.textLength = normalizeText(text).length;
    record.pageOnlyNeedles = PAGE_ONLY_NEEDLES.filter(needle => text.includes(needle));
    record.draftDocumentNeedles = DRAFT_DOCUMENT_NEEDLES.filter(needle => text.includes(needle));
    record.readyDocumentNeedles = detectReadyDocumentClass(text);
    const normalizedText = normalizeText(text);
    record.reportDocumentNeedles = REPORT_DOCUMENT_NEEDLES.filter(needle => normalizedText.includes(needle));
    record.documentClassRequired = isDocumentClassRequired({ ...record, documentClassRequired: undefined });
    if (record.documentClassRequired) {
      const contentBoundaryProfile = detectCalculationContentProfile(normalizedText);
      record.calculationSummaryNeedles = CALCULATION_SUMMARY_DOCUMENT_NEEDLES.filter(needle => normalizedText.slice(0, 320).includes(needle));
      record.contentBoundary = evaluateCalculationContent(normalizedText, { contentBoundaryProfile });
    }
    const after = fileSnapshot(filePath);
    record.sourceSha256 = after.sha256;
    if (before.bytes !== after.bytes || before.sha256 !== after.sha256) {
      record.errors.push('附件在內容檢查期間發生變更；請停止重新輸出檔案後再重查');
    }
  } catch (error) {
    record.errors.push(error.message || String(error));
  }
  return record;
}

function isGeneratedEvidenceFile(fileName, siblingNames) {
  const normalized = String(fileName || '').toLowerCase();
  if (normalized === 'rendered-delivery-evidence-summary.json' || normalized.endsWith('.evidence.json')) return true;
  if (!normalized.endsWith('.txt')) return false;
  const stem = normalized.slice(0, -'.txt'.length);
  return siblingNames.has(`${stem}.evidence.json`);
}

function isIgnorableSystemFile(fileName) {
  return IGNORED_SYSTEM_FILES.has(String(fileName || '').toLowerCase());
}

function collectAttachmentFiles(inputDir, ignoredFile) {
  const files = [];
  const skippedGeneratedEvidence = [];
  const skippedSystemFiles = [];
  const unsupportedFiles = [];
  const unsafeSourceEntries = [];
  const walk = directory => {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const siblingNames = new Set(entries.map(entry => entry.name.toLowerCase()));
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('.')) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) unsafeSourceEntries.push(entryPath);
      else if (entry.isDirectory()) walk(entryPath);
      else if (entry.isFile() && path.resolve(entryPath) !== ignoredFile) {
        if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          if (isGeneratedEvidenceFile(entry.name, siblingNames)) skippedGeneratedEvidence.push(entryPath);
          else files.push(entryPath);
        } else if (isIgnorableSystemFile(entry.name)) skippedSystemFiles.push(entryPath);
        else unsupportedFiles.push(entryPath);
      } else if (!entry.isFile()) unsafeSourceEntries.push(entryPath);
    }
  };
  walk(inputDir);
  const sortFiles = (left, right) => left.localeCompare(right, 'zh-Hant');
  return {
    files: files.sort(sortFiles),
    skippedGeneratedEvidence: skippedGeneratedEvidence.sort(sortFiles),
    skippedSystemFiles: skippedSystemFiles.sort(sortFiles),
    unsupportedFiles: unsupportedFiles.sort(sortFiles),
    unsafeSourceEntries: unsafeSourceEntries.sort(sortFiles),
  };
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

function normalizedFingerprints(record) {
  return unique((record.fingerprints || []).map(item => String(item || '').toUpperCase()));
}

function fingerprintPairingKey(record) {
  const projectNo = String(record.projectNo || '').trim();
  const sourceTool = String(record.sourceTool || '').trim();
  const toolVersion = normalizeToolVersion(record.toolVersion);
  return sourceTool && toolVersion ? `${projectNo}\u0000${sourceTool}\u0000${toolVersion}` : '';
}

function analyzeFingerprintRelationships(records, issues) {
  const groups = new Map();
  records.forEach(record => {
    const key = fingerprintPairingKey(record);
    if (!key || !normalizedFingerprints(record).length) return;
    if (!groups.has(key)) groups.set(key, { sources: [], reports: [] });
    const group = groups.get(key);
    if (String(record.type || '').toLowerCase() === 'json') group.sources.push(record);
    else if (isDocumentClassRequired(record)) group.reports.push(record);
  });

  const links = [];
  groups.forEach(group => {
    if (!group.sources.length || !group.reports.length) return;
    const matchedSources = new Set();
    const matchedReports = new Set();
    group.sources.forEach(source => {
      const sourceFingerprints = new Set(normalizedFingerprints(source));
      group.reports.forEach(report => {
        const shared = normalizedFingerprints(report).filter(fingerprint => sourceFingerprints.has(fingerprint));
        if (!shared.length) return;
        matchedSources.add(source);
        matchedReports.add(report);
        shared.forEach(fingerprint => links.push({
          projectNo: source.projectNo,
          sourceTool: source.sourceTool,
          toolVersion: normalizeToolVersion(source.toolVersion),
          fingerprint,
          sourceFile: source.file,
          reportFile: report.file,
        }));
      });
    });
    const unmatchedSources = group.sources.filter(record => !matchedSources.has(record));
    const unmatchedReports = group.reports.filter(record => !matchedReports.has(record));
    if (!unmatchedSources.length && !unmatchedReports.length) return;
    const files = [...unmatchedSources, ...unmatchedReports].map(record => record.file);
    const exactPair = group.sources.length === 1 && group.reports.length === 1;
    issues.push(buildIssue(
      exactPair ? 'error' : 'warn',
      exactPair ? 'source-report-fingerprint-mismatch' : 'unmatched-source-report-fingerprint',
      exactPair
        ? `${group.sources[0].file} 與 ${group.reports[0].file} 屬同一案件、工具及版本，但計算指紋不一致；來源資料與計算書並非同一次計算，不得組包。`
        : `同一案件、工具及版本仍有來源資料或計算書無法以計算指紋配對：${files.join('、')}；請確認是否混入不同計算狀態。`,
      files,
    ));
  });
  return links;
}

function findDuplicateFingerprints(records, issues) {
  const fingerprints = new Map();
  records.forEach(record => normalizedFingerprints(record).forEach(fingerprint => {
    if (!fingerprints.has(fingerprint)) fingerprints.set(fingerprint, { sources: [], outputs: [] });
    const group = fingerprints.get(fingerprint);
    if (String(record.type || '').toLowerCase() === 'json') group.sources.push(record.file);
    else group.outputs.push(record.file);
  }));
  fingerprints.forEach((group, fingerprint) => {
    if (group.sources.length > 1) {
      issues.push(buildIssue('warn', 'duplicate-source-fingerprint', `計算指紋 ${fingerprint} 出現在多份來源資料；確認是否重複附入同一計算狀態。`, group.sources));
    }
    if (group.outputs.length > 1) {
      issues.push(buildIssue('warn', 'duplicate-report-fingerprint', `計算指紋 ${fingerprint} 出現在多份輸出附件；確認是否重複附入同一計算結果。`, group.outputs));
    }
  });
}

function analyzePackage(records, options = {}) {
  const issues = [];
  const unsupportedFiles = unique(options.unsupportedFiles || []);
  const unsafeSourceEntries = unique(options.unsafeSourceEntries || []);
  if (!records.length) issues.push(buildIssue('error', 'no-attachments', '資料夾內沒有可檢查的 PDF、DOCX、XLSX、JSON、HTML 或文字附件。'));
  if (unsafeSourceEntries.length) {
    const displayedEntries = unsafeSourceEntries.slice(0, 8);
    const remaining = unsafeSourceEntries.length - displayedEntries.length;
    const suffix = remaining ? `（另有 ${remaining} 個）` : '';
    issues.push(buildIssue(
      'error',
      'unsafe-source-entry',
      `來源資料夾含有 ${unsafeSourceEntries.length} 個符號連結、junction 或其他特殊項目：${displayedEntries.join('、')}${suffix}；為避免遺漏或帶入資料夾外內容，不得組包。`,
      unsafeSourceEntries,
    ));
  }
  if (unsupportedFiles.length) {
    const displayedFiles = unsupportedFiles.slice(0, 8);
    const remaining = unsupportedFiles.length - displayedFiles.length;
    const suffix = remaining ? `（另有 ${remaining} 個）` : '';
    issues.push(buildIssue('warn', 'unsupported-attachment', `有 ${unsupportedFiles.length} 個檔案未納入內容檢查：${displayedFiles.join('、')}${suffix}；請轉成支援格式後重查，或逐份人工確認其交付用途。`, unsupportedFiles));
  }
  records.forEach(record => {
    if (record.errors.length) issues.push(buildIssue('error', 'unreadable-attachment', `${record.file} 無法讀取：${record.errors.join('；')}`, [record.file]));
    if (record.pageOnlyNeedles.length) issues.push(buildIssue('error', 'page-only-leak', `${record.file} 含有頁面專用文字：${record.pageOnlyNeedles.join('、')}`, [record.file]));
    if (record.contentBoundary?.missingGroups?.length) {
      const missingDescriptions = record.contentBoundary.groups
        .filter(group => !group.pass)
        .map(group => group.description || group.key);
      issues.push(buildIssue(
        'error',
        'missing-calculation-content',
        `${record.file} 缺少可辨識的計算附件實質內容：${missingDescriptions.join('、')}；只有標題、狀態、核可或追溯資料不得組成正式附件。`,
        [record.file],
      ));
    }
    if ((record.draftDocumentNeedles || []).length) {
      issues.push(buildIssue('error', 'internal-review-document', `${record.file} 的文件狀態仍為內部審閱：${record.draftDocumentNeedles.join('、')}；請在計算書預覽完成核可後再納入正式附件組包。`, [record.file]));
    } else if (isDocumentClassRequired(record) && !(record.readyDocumentNeedles || []).length) {
      issues.push(buildIssue('warn', 'missing-document-class', `${record.file} 未找到「${READY_DOCUMENT_CLASS_LABEL}」；不得自動視為已核可附件，請回原工具確認文件狀態。`, [record.file]));
    } else if ((record.readyDocumentNeedles || []).length && !record.approvalTime) {
      issues.push(buildIssue('error', 'missing-formal-approval-time', `${record.file} 已標示正式附件，但缺少核可時間；請回原工具重新勾選核可並輸出。`, [record.file]));
    } else if ((record.readyDocumentNeedles || []).length && !isValidApprovalTime(record.approvalTime)) {
      issues.push(buildIssue('error', 'invalid-formal-approval-time', `${record.file} 的核可時間格式或日期無效：${record.approvalTime}。`, [record.file]));
    } else if ((record.readyDocumentNeedles || []).length) {
      const outputEpoch = parseTraceDateTime(record.outputTime);
      const approvalEpoch = parseTraceDateTime(record.approvalTime);
      if (Number.isFinite(outputEpoch) && Number.isFinite(approvalEpoch) && approvalEpoch < outputEpoch) {
        issues.push(buildIssue('error', 'formal-approval-before-output', `${record.file} 的核可時間 ${record.approvalTime} 早於輸出時間 ${record.outputTime}；請回原工具重新輸出並核可。`, [record.file]));
      }
    }
  });
  const readable = records.filter(record => !record.errors.length);
  findConflicts(readable, 'projectNo', '計畫編號', issues);
  findConflicts(readable, 'projectName', '計畫名稱', issues);
  findConflicts(readable, 'designer', '設計人員', issues);
  const expectedProjectNo = String(options.projectNo || '').trim();
  if (expectedProjectNo) readable.forEach(record => {
    if (record.projectNo && record.projectNo !== expectedProjectNo) {
      issues.push(buildIssue('error', 'project-no-mismatch', `${record.file} 的計畫編號 ${record.projectNo} 與指定 ${expectedProjectNo} 不一致。`, [record.file]));
    }
  });
  readable.forEach(record => {
    const missingTraceFields = [
      !record.sourceTool && '產出工具',
      !record.toolVersion && '工具版本',
      !record.outputTime && '輸出時間',
    ].filter(Boolean);
    if (missingTraceFields.length) {
      issues.push(buildIssue('warn', 'missing-output-trace', `${record.file} 未能抽取${missingTraceFields.join('、')}；請人工確認其來源與交付用途。`, [record.file]));
    } else if (!Number.isFinite(parseTraceDateTime(record.outputTime))) {
      issues.push(buildIssue('warn', 'invalid-output-time', `${record.file} 的輸出時間格式或日期無效：${record.outputTime}；不得自動放行。`, [record.file]));
    }
  });
  const toolVersions = new Map();
  readable.forEach(record => {
    const toolVersion = normalizeToolVersion(record.toolVersion);
    if (!record.sourceTool || !toolVersion) return;
    if (!toolVersions.has(record.sourceTool)) toolVersions.set(record.sourceTool, new Map());
    const versions = toolVersions.get(record.sourceTool);
    if (!versions.has(toolVersion)) versions.set(toolVersion, []);
    versions.get(toolVersion).push(record.file);
  });
  toolVersions.forEach((versions, sourceTool) => {
    if (versions.size > 1) issues.push(buildIssue('error', 'tool-version-conflict', `${sourceTool} 使用多個工具版本：${[...versions.keys()].join(' / ')}`, [...versions.values()].flat()));
  });
  readable.filter(record => !record.fingerprints.length).forEach(record => issues.push(buildIssue('warn', 'missing-fingerprint', `${record.file} 未找到計算指紋；請人工確認其來源與內容是否屬於本案。`, [record.file])));
  const fingerprintLinks = analyzeFingerprintRelationships(readable, issues);
  findDuplicateFingerprints(readable, issues);
  const errorCount = issues.filter(issue => issue.level === 'error').length;
  const warningCount = issues.filter(issue => issue.level === 'warn').length;
  return {
    kind: 'attachment-package-check.v1', generatedAt: new Date().toISOString(),
    status: errorCount ? 'blocked' : warningCount ? 'review' : 'ready',
    summary: { attachments: records.length, unsupported: unsupportedFiles.length, unsafeSourceEntries: unsafeSourceEntries.length, errors: errorCount, warnings: warningCount },
    expectedProjectNo, attachments: records, fingerprintLinks, issues, unsafeSourceEntries,
  };
}

function checkPackage(inputDir, options = {}) {
  const resolvedInput = path.resolve(inputDir || '');
  if (!fs.existsSync(resolvedInput)) throw new Error(`附件資料夾不存在：${resolvedInput || inputDir || '(未指定)'}`);
  const inputStat = fs.lstatSync(resolvedInput);
  if (inputStat.isSymbolicLink()) throw new Error(`附件資料夾本身不得是符號連結或 junction：${resolvedInput}`);
  if (!inputStat.isDirectory()) throw new Error(`附件資料夾不存在：${resolvedInput || inputDir || '(未指定)'}`);
  const ignoredFile = options.output ? path.resolve(options.output) : '';
  const collection = collectAttachmentFiles(resolvedInput, ignoredFile);
  const unsupportedFiles = collection.unsupportedFiles.map(file => path.relative(resolvedInput, file) || path.basename(file));
  const unsafeSourceEntries = collection.unsafeSourceEntries.map(file => path.relative(resolvedInput, file) || path.basename(file));
  const report = analyzePackage(collection.files.map(file => inspectAttachment(file, resolvedInput)), { ...options, unsupportedFiles, unsafeSourceEntries });
  report.skippedGeneratedEvidence = collection.skippedGeneratedEvidence.map(file => path.relative(resolvedInput, file) || path.basename(file));
  report.skippedSystemFiles = collection.skippedSystemFiles.map(file => path.relative(resolvedInput, file) || path.basename(file));
  report.unsupportedFiles = unsupportedFiles;
  report.unsafeSourceEntries = unsafeSourceEntries;
  return report;
}

function formatSummary(report) {
  const lines = [
    `附件組包一致性檢查：${report.status === 'ready' ? '可整理' : report.status === 'review' ? '需人工確認' : '暫勿整理'}`,
    `附件 ${report.summary.attachments} 份；阻擋 ${report.summary.errors} 項；提醒 ${report.summary.warnings} 項。`,
  ];
  if (report.skippedGeneratedEvidence?.length) lines.push(`已略過 ${report.skippedGeneratedEvidence.length} 個驗證中間檔（.evidence.json、成對文字擷取或渲染摘要）。`);
  if (report.unsupportedFiles?.length) lines.push(`未檢查 ${report.unsupportedFiles.length} 個不支援檔案；附件狀態不得自動放行。`);
  if (report.unsafeSourceEntries?.length) lines.push(`已阻擋 ${report.unsafeSourceEntries.length} 個來源符號連結、junction 或特殊項目。`);
  if (report.fingerprintLinks?.length) lines.push(`來源資料與計算書已完成 ${report.fingerprintLinks.length} 組計算指紋配對。`);
  report.attachments.forEach(record => {
    const documentClass = (record.draftDocumentNeedles || []).length
      ? '內部審閱'
      : (record.readyDocumentNeedles || []).length
        ? '正式附件'
        : isDocumentClassRequired(record) ? '文件未分類' : '';
    const contentStatus = record.contentBoundary
      ? record.contentBoundary.missingGroups.length ? `內容缺 ${record.contentBoundary.missingGroups.join(',')}` : '工程內容完整'
      : '';
    const trace = [record.projectName, record.projectNo, record.designer, record.sourceTool, record.toolVersion, record.fingerprints.join(','), documentClass, contentStatus, record.approvalTime ? `核可 ${record.approvalTime}` : ''].filter(Boolean).join('｜') || '未抽取追溯資訊';
    lines.push(`- ${record.file}：${record.errors.length ? `讀取失敗 (${record.errors.join('；')})` : trace}`);
  });
  report.issues.forEach(issue => lines.push(`[${issue.level === 'error' ? '阻擋' : '提醒'}] ${issue.message}`));
  lines.push('此檢查結果僅供交付前整理，不是計算書、列印或 PDF 附件。');
  return lines.join('\n');
}

function exitCodeForStatus(status) {
  return Object.prototype.hasOwnProperty.call(PACKAGE_STATUS_EXIT_CODES, status)
    ? PACKAGE_STATUS_EXIT_CODES[status]
    : CLI_ERROR_EXIT_CODE;
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
  if (options.help) {
    console.log('用法：node attachment-package-check.js --input <附件資料夾> [--project-no <計畫編號>] [--output <內部檢查結果.json>]');
    return 0;
  }
  if (!options.input) {
    console.log('用法：node attachment-package-check.js --input <附件資料夾> [--project-no <計畫編號>] [--output <內部檢查結果.json>]');
    return CLI_ERROR_EXIT_CODE;
  }
  const report = checkPackage(options.input, options);
  if (options.output) fs.writeFileSync(path.resolve(options.output), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(formatSummary(report));
  return exitCodeForStatus(report.status);
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(`附件組包一致性檢查失敗：${error.message || error}`);
    process.exitCode = CLI_ERROR_EXIT_CODE;
  }
}

module.exports = { CALCULATION_BOOK_CONTENT_BOUNDARY, CONTENT_GROUPS, CONTENT_PROFILES, SUPPORTED_EXTENSIONS, IGNORED_SYSTEM_FILES, PAGE_ONLY_NEEDLES, DRAFT_DOCUMENT_NEEDLES, READY_DOCUMENT_CLASS_LABEL, PACKAGE_STATUS_EXIT_CODES, CLI_ERROR_EXIT_CODE, REPORT_DOCUMENT_NEEDLES, CALCULATION_SUMMARY_DOCUMENT_NEEDLES, REPORT_IDENTITY_FIELDS, normalizeText, extractHtmlText, detectCalculationContentProfile, evaluateCalculationContent, cleanMetadataValue, normalizeToolVersion, parseTraceDateTime, isValidApprovalTime, detectReadyDocumentClass, isDocumentClassRequired, sha256File, fileSnapshot, extractTextMetadata, extractJsonMetadata, inspectAttachment, isGeneratedEvidenceFile, isIgnorableSystemFile, collectAttachmentFiles, normalizedFingerprints, fingerprintPairingKey, analyzeFingerprintRelationships, findDuplicateFingerprints, analyzePackage, checkPackage, formatSummary, exitCodeForStatus, parseArgs };
