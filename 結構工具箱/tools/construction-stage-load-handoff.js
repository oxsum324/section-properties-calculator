const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const Verifier = require('./attachment-package-verify');
const { replayDeckingExport } = require('../../覆工板/decking-result-replay');

const SCHEMA_VERSION = 1;
const KIND = 'construction-stage-decking-load-handoff';
const TARGET = 'excavation-composite-column';
const CASES = [
  ['Pu1', 'PC400 固定支座位於柱上'],
  ['Pu2', '吊車支座距柱 0.5 m'],
  ['Pu3', '吊車支座位於相鄰跨間'],
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function handoffFingerprint(record) {
  const source = { ...record };
  delete source.handoffFingerprint;
  return `CSH-${crypto.createHash('sha256').update(canonicalJson(source), 'utf8').digest('hex').slice(0, 20).toUpperCase()}`;
}

function requireFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} 必須為非負有限數值。`);
  return number;
}

function sameNumber(actual, expected, tolerance = 1e-6) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance * Math.max(1, Math.abs(Number(expected)));
}

function validateStoredResults(payload, replay) {
  const stored = payload?.results?.girder;
  if (!stored || typeof stored !== 'object') throw new Error('覆工板 JSON 缺少 results.girder，無法確認交接荷重。');
  for (const [key] of [...CASES, ['PuMax', '控制軸力']]) {
    const expected = requireFinite(replay?.results?.girder?.[key], `重算 ${key}`);
    const actual = requireFinite(stored[key], `來源 ${key}`);
    if (!sameNumber(actual, expected)) throw new Error(`覆工板 ${key} 與目前核心重算不一致。`);
  }
  const sourceFingerprint = String(payload?.document?.calculationFingerprint || '').trim().toUpperCase();
  if (!/^CF-[0-9A-F]{16}$/.test(sourceFingerprint)) throw new Error('覆工板 JSON 缺少有效計算指紋。');
  if (sourceFingerprint !== String(replay.calculationFingerprint || '').toUpperCase()) {
    throw new Error('覆工板計算指紋與目前核心重算不一致。');
  }
  return sourceFingerprint;
}

function buildHandoff(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('覆工板來源必須是 JSON 物件。');
  const replay = replayDeckingExport(payload, { toolRoot: options.deckingRoot });
  const calculationFingerprint = validateStoredResults(payload, replay);
  const values = Object.fromEntries(CASES.map(([key]) => [key, requireFinite(replay.results.girder[key], key)]));
  const controlAxialLoadTf = requireFinite(replay.results.girder.PuMax, 'PuMax');
  const controllingKeys = CASES.filter(([key]) => sameNumber(values[key], controlAxialLoadTf)).map(([key]) => key);
  if (!controllingKeys.length) throw new Error('覆工板控制軸力無法對應 Pu1、Pu2 或 Pu3。');

  const record = {
    schemaVersion: SCHEMA_VERSION,
    kind: KIND,
    generatedAt: options.generatedAt || new Date().toISOString(),
    source: {
      toolId: 'fugongban',
      toolName: '覆工板系統計算工具',
      toolVersion: 'v1.0',
      projectName: String(payload?.project?.name || '').trim(),
      projectNo: String(payload?.project?.no || '').trim(),
      calculationFingerprint,
    },
    load: {
      target: TARGET,
      unit: 'tf',
      controlAxialLoadTf,
      controllingCases: controllingKeys,
      cases: CASES.map(([key, label]) => ({ key, label, valueTf: values[key] })),
    },
    boundary: {
      requiresExplicitAcceptance: true,
      autoApplied: false,
      scope: '僅供開挖擋土支撐工具之共構柱施工構台軸力輸入；支承位置、偏心、施工階段與載重組合仍須依施工計畫確認。',
    },
  };
  record.handoffFingerprint = handoffFingerprint(record);
  return record;
}

function validateHandoff(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('施工階段荷重交接檔格式不正確。');
  if (record.schemaVersion !== SCHEMA_VERSION || record.kind !== KIND) throw new Error('施工階段荷重交接檔版本或種類不受支援。');
  if (record?.load?.target !== TARGET || record?.load?.unit !== 'tf') throw new Error('施工階段荷重交接目標或單位不受支援。');
  requireFinite(record?.load?.controlAxialLoadTf, '交接控制軸力');
  if (!/^CF-[0-9A-F]{16}$/.test(String(record?.source?.calculationFingerprint || ''))) throw new Error('交接檔來源計算指紋無效。');
  if (!/^CSH-[0-9A-F]{20}$/.test(String(record.handoffFingerprint || ''))) throw new Error('交接檔指紋格式無效。');
  if (record.handoffFingerprint !== handoffFingerprint(record)) throw new Error('交接檔內容與交接指紋不一致。');
  if (record?.boundary?.requiresExplicitAcceptance !== true || record?.boundary?.autoApplied !== false) {
    throw new Error('交接檔必須要求明確採用，且不得標示為自動套用。');
  }
  return record;
}

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const duplicates = Verifier.findDuplicateJsonKeys(raw);
  if (duplicates.length) throw new Error(`${label}含重複 JSON 欄位：${duplicates.slice(0, 5).map(item => item.pointer).join('、')}。`);
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const options = { input: '', output: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index] || '';
    else if (arg === '--output') options.output = argv[++index] || '';
    else if (arg === '--json') options.json = true;
    else throw new Error(`不支援的參數：${arg}`);
  }
  if (!options.input) throw new Error('請以 --input 指定覆工板匯出 JSON。');
  return options;
}

function defaultOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}_施工階段荷重交接.json`);
}

function runCli(argv) {
  const options = parseArgs(argv);
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output || defaultOutputPath(inputPath));
  const source = readJsonFile(inputPath, '覆工板來源 JSON');
  const record = buildHandoff(source);
  validateHandoff(record);
  fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const result = { status: 'ready', input: inputPath, output: outputPath, handoffFingerprint: record.handoffFingerprint, controlAxialLoadTf: record.load.controlAxialLoadTf };
  process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `施工階段荷重交接檔已建立：${outputPath}\n控制軸力：${record.load.controlAxialLoadTf} tf\n交接指紋：${record.handoffFingerprint}\n`);
  return result;
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`施工階段荷重交接失敗：${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { SCHEMA_VERSION, KIND, TARGET, canonicalJson, handoffFingerprint, buildHandoff, validateHandoff, readJsonFile, defaultOutputPath, runCli };
