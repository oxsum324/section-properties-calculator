#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('./joint-reaction-fixture-sanitizer-core.js');

const SCHEMA = Core.schemaVersion;

function required(value, label) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) throw new Error(`${label}不得空白。`);
  return normalized;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sanitizeExport(options) {
  const cfg = options && typeof options === 'object' ? options : {};
  const result = Core.sanitizeExportStructure(cfg);
  return {
    sanitized:result.sanitized,
    evidence:{
      ...result.evidence,
      source:{ ...result.evidence.source, sha256:sha256(Buffer.from(String(cfg.raw == null ? '' : cfg.raw), 'utf8')) },
      output:{ ...result.evidence.output, sha256:sha256(Buffer.from(result.sanitized, 'utf8')) },
    },
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`不支援的參數：${key}`);
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) throw new Error(`${key} 缺少值。`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function safeStem(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function inspectOutputTarget(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) throw new Error(`輸出目標不得是符號連結：${filePath}`);
    if (!stat.isFile()) throw new Error(`輸出目標必須是一般檔案：${filePath}`);
    return { exists:true, content:fs.readFileSync(filePath, 'utf8') };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { exists:false, content:null };
    throw error;
  }
}

function writeBundleIfAbsentOrSame(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('交易式輸出至少需要一個檔案。');
  const normalized = entries.map(entry => ({ filePath:path.resolve(entry.filePath), content:String(entry.content) }));
  if (new Set(normalized.map(entry => entry.filePath.toLowerCase())).size !== normalized.length) {
    throw new Error('交易式輸出目標不得重複。');
  }
  const existing = new Set();
  for (const entry of normalized) {
    const state = inspectOutputTarget(entry.filePath);
    if (!state.exists) continue;
    if (state.content !== entry.content) throw new Error(`輸出檔已存在且內容不同：${entry.filePath}`);
    existing.add(entry.filePath);
  }
  const created = [];
  try {
    for (const entry of normalized) {
      if (existing.has(entry.filePath)) continue;
      fs.writeFileSync(entry.filePath, entry.content, { encoding:'utf8', flag:'wx' });
      created.push(entry);
    }
    for (const entry of normalized) {
      const state = inspectOutputTarget(entry.filePath);
      if (!state.exists || state.content !== entry.content) throw new Error(`輸出檔寫入後驗證失敗：${entry.filePath}`);
    }
  } catch (error) {
    const rollbackIssues = [];
    for (const entry of created.reverse()) {
      try {
        const state = inspectOutputTarget(entry.filePath);
        if (state.exists && state.content === entry.content) fs.unlinkSync(entry.filePath);
        else if (state.exists) rollbackIssues.push(entry.filePath);
      } catch (_rollbackError) {
        rollbackIssues.push(entry.filePath);
      }
    }
    const suffix = rollbackIssues.length > 0 ? `；回滾未完成：${rollbackIssues.join('、')}` : '';
    throw new Error(`交易式輸出失敗：${error.message}${suffix}`);
  }
}

function buildOutputBundle(options) {
  const cfg = options && typeof options === 'object' ? options : {};
  const outputDir = path.resolve(cfg.outputDir || path.join(__dirname, '..', '..', 'output', 'anonymized-fixtures', 'joint-reactions'));
  const result = sanitizeExport(cfg);
  const sourceExtension = result.evidence.source.extension;
  const hashPrefix = result.evidence.output.sha256.slice(0, 12);
  const stem = `${safeStem(result.evidence.source.software)}-${safeStem(result.evidence.source.softwareVersion)}-joint-reactions-${hashPrefix}-candidate`;
  const sanitizedPath = path.join(outputDir, `${stem}${sourceExtension}`);
  const evidencePath = path.join(outputDir, `${stem}.evidence.json`);
  const evidence = { ...result.evidence, output:{ ...result.evidence.output, file:path.basename(sanitizedPath) } };
  return {
    outputDir,
    sanitizedPath,
    evidencePath,
    sanitized:result.sanitized,
    evidence,
    entries:[
      { filePath:sanitizedPath, content:result.sanitized },
      { filePath:evidencePath, content:`${JSON.stringify(evidence, null, 2)}\n` },
    ],
  };
}

function runCli(argv) {
  const args = parseArgs(argv);
  const inputPath = path.resolve(required(args.input, '--input'));
  const sourceExtension = path.extname(inputPath).toLowerCase();
  const raw = fs.readFileSync(inputPath, 'utf8');
  const generatedAt = fs.statSync(inputPath).mtime.toISOString();
  const bundle = buildOutputBundle({
    raw,
    software:args.software,
    softwareVersion:args.version,
    units:args.units,
    tableName:args.table || 'Joint Reactions',
    originKind:args.origin,
    sourceExtension,
    generatedAt,
    outputDir:args['output-dir'],
  });
  fs.mkdirSync(bundle.outputDir, { recursive:true });
  writeBundleIfAbsentOrSame(bundle.entries);
  return {
    status:bundle.evidence.status,
    sanitizedPath:bundle.sanitizedPath,
    evidencePath:bundle.evidencePath,
    sourceStored:false,
    manualReviewRequired:true,
  };
}

if (require.main === module) {
  try {
    const summary = runCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { schemaVersion:SCHEMA, sanitizeExport, buildOutputBundle, writeBundleIfAbsentOrSame, runCli };
