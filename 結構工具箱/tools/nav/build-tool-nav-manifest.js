'use strict';
// 由首頁可讀來源 home.source.js 抽出工具清冊，產生共用導覽頂欄所需的兩個產出：
//   1. 結構工具箱/tools/nav/tool-nav.manifest.json（完整清冊，私有，供建置與契約測試）
//   2. 根目錄 tool-nav.manifest.js（一行 window.STRUCT_TOOL_NAV = {...};，公開，工具頁於 tool-chrome.js 之前載入）
// 不手寫工具清單、不在首頁工具卡物件新增欄位；家族推導規則固定寫在本檔。
// 用法：node 結構工具箱/tools/nav/build-tool-nav-manifest.js [--check]

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const HOME_SOURCE = '結構工具箱/assets/home/src/home.source.js';
const MANIFEST = '結構工具箱/tools/nav/tool-nav.manifest.json';
const RUNTIME_MANIFEST = 'tool-nav.manifest.js';
const RUNTIME_GLOBAL = 'STRUCT_TOOL_NAV';
const GENERATED_BY = '結構工具箱/tools/nav/build-tool-nav-manifest.js';
const HOME_FILE = '結構工具箱/index.html';
const runtimeHeader = `/* generated from ${HOME_SOURCE} by build-tool-nav-manifest.js; do not edit */`;

// 首頁工具卡物件欄位白名單；清冊只讀取，不得新增欄位。
const TOOL_FIELD_WHITELIST = ['aliases', 'capabilities', 'categories', 'fit', 'governance', 'href', 'limit', 'memberSystem', 'output', 'state', 'summary', 'title', 'version'];

// 家族順序固定；前五個家族有獨立家族頁，其餘以首頁分類深連結作家族頁。
const FAMILY_ORDER = ['rc', 'steel', 'wind', 'seismic', 'local-quick', 'analysis', 'reference', 'attachments'];
const FAMILY_PAGES = {
  rc: { label: 'RC 構件', file: '鋼筋混凝土/index.html' },
  steel: { label: '鋼構／SRC 構件', file: '結構工具箱/family/steel.html' },
  wind: { label: '風力規範外力', file: '結構工具箱/family/wind.html' },
  seismic: { label: '地震力規範外力', file: '結構工具箱/family/seismic.html' },
  'local-quick': { label: '施工臨設與局部快算', file: '結構工具箱/family/local-quick.html' },
};

function extractLiteral(source, name) {
  const prefix = `const ${name} = `;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`${HOME_SOURCE} must define const ${name}`);
  const valueStart = start + prefix.length;
  const open = source[valueStart];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) throw new Error(`const ${name} must start with an array or object literal`);
  let depth = 0;
  let quote = null;
  for (let index = valueStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
    } else if (character === "'" || character === '"' || character === '`') quote = character;
    else if (character === open) depth += 1;
    else if (character === close && --depth === 0) {
      return vm.runInNewContext(`(${source.slice(valueStart, index + 1)})`, {}, { timeout: 1000, filename: `${HOME_SOURCE}#${name}` });
    }
  }
  throw new Error(`Unterminated const ${name}`);
}

function familyFor(tool) {
  if (tool.memberSystem === 'rc') return 'rc';
  if (tool.memberSystem === 'steel' || tool.memberSystem === 'src') return 'steel';
  const categories = Array.isArray(tool.categories) ? tool.categories : [];
  if (categories.includes('wind')) return 'wind';
  if (categories.includes('seismic')) return 'seismic';
  if (categories.includes('temporary')) return 'local-quick';
  const first = categories[0];
  if (!first) throw new Error(`${tool.href} has no category to derive a family from`);
  return first;
}

function toRepoFile(mapped) {
  // routeFileMap 以 結構工具箱/ 為基準；轉成 repo 根目錄相對路徑。
  const normalized = path.posix.normalize(path.posix.join('結構工具箱', String(mapped).replace(/\\/g, '/')));
  if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) throw new Error(`route file escapes repository: ${mapped}`);
  return normalized;
}

function buildManifest(homeSource) {
  const categories = extractLiteral(homeSource, 'categories');
  const memberSystems = extractLiteral(homeSource, 'memberSystems');
  const toolStates = extractLiteral(homeSource, 'toolStates');
  const tools = extractLiteral(homeSource, 'tools');
  const routeFileMap = extractLiteral(homeSource, 'routeFileMap');
  const categoryLabel = new Map(categories.map(category => [category.id, category.label]));
  const memberIds = new Set(memberSystems.map(system => system.id));

  const manifestTools = tools.map(tool => {
    const unexpected = Object.keys(tool).filter(key => !TOOL_FIELD_WHITELIST.includes(key));
    if (unexpected.length) throw new Error(`${tool.href} carries fields outside the homepage whitelist: ${unexpected.join(', ')}`);
    if (!routeFileMap[tool.href]) throw new Error(`${tool.href} has no routeFileMap target`);
    if (!toolStates[tool.state]) throw new Error(`${tool.href} has unknown state ${tool.state}`);
    if (tool.memberSystem && !memberIds.has(tool.memberSystem)) throw new Error(`${tool.href} has unknown memberSystem ${tool.memberSystem}`);
    const family = familyFor(tool);
    if (!FAMILY_ORDER.includes(family)) throw new Error(`${tool.href} derives an unregistered family: ${family}`);
    return {
      route: tool.href,
      file: toRepoFile(routeFileMap[tool.href]),
      title: tool.title,
      version: tool.version,
      state: tool.state,
      stateLabel: toolStates[tool.state].label,
      family,
      categories: [...tool.categories],
      memberSystem: tool.memberSystem || null,
    };
  });

  const usedFamilies = new Set(manifestTools.map(tool => tool.family));
  const families = FAMILY_ORDER.filter(id => usedFamilies.has(id)).map(id => {
    if (FAMILY_PAGES[id]) return { id, label: FAMILY_PAGES[id].label, file: FAMILY_PAGES[id].file };
    const label = categoryLabel.get(id);
    if (!label) throw new Error(`family ${id} has no homepage category label`);
    return { id, label, file: `${HOME_FILE}?category=${id}` };
  });

  return { version: 1, generatedBy: GENERATED_BY, home: HOME_FILE, families, tools: manifestTools };
}

// 執行期只需要這些欄位；categories／memberSystem 留在清冊 JSON 供建置與測試使用。
function runtimeProjection(manifest) {
  return {
    version: manifest.version,
    home: manifest.home,
    families: manifest.families.map(family => ({ id: family.id, label: family.label, file: family.file })),
    tools: manifest.tools.map(tool => ({
      route: tool.route,
      file: tool.file,
      title: tool.title,
      version: tool.version,
      state: tool.state,
      stateLabel: tool.stateLabel,
      family: tool.family,
    })),
  };
}

function serialize(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function serializeRuntime(manifest) {
  // JSON 允許 U+2028／U+2029 原樣出現，但 JS 字串字面不允許；以跳脫形式輸出。單行，便於逐位元組比對。
  const literal = JSON.stringify(runtimeProjection(manifest))
    .split(String.fromCharCode(8232)).join('\\u2028')
    .split(String.fromCharCode(8233)).join('\\u2029');
  return `${runtimeHeader} window.${RUNTIME_GLOBAL} = ${literal};\n`;
}

function outputs(homeSource) {
  const manifest = buildManifest(homeSource);
  return [
    { file: MANIFEST, bytes: Buffer.from(serialize(manifest), 'utf8') },
    { file: RUNTIME_MANIFEST, bytes: Buffer.from(serializeRuntime(manifest), 'utf8') },
  ];
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check') || args.length > 1) {
    throw new Error('Usage: node 結構工具箱/tools/nav/build-tool-nav-manifest.js [--check]');
  }
  const check = args.includes('--check');
  const homeSource = fs.readFileSync(path.join(repoRoot, HOME_SOURCE), 'utf8').replace(/\r\n?/g, '\n');
  const messages = [];
  for (const output of outputs(homeSource)) {
    const outputPath = path.join(repoRoot, output.file);
    if (check) {
      if (!fs.existsSync(outputPath) || !fs.readFileSync(outputPath).equals(output.bytes)) {
        throw new Error(`${output.file} is stale; run node ${GENERATED_BY}.`);
      }
      messages.push(`in sync ${output.file}: ${output.bytes.length} bytes`);
      continue;
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output.bytes);
    messages.push(`built ${output.file}: ${output.bytes.length} bytes`);
  }
  console.log(messages.join('\n'));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { HOME_SOURCE, MANIFEST, RUNTIME_MANIFEST, RUNTIME_GLOBAL, GENERATED_BY, HOME_FILE, FAMILY_ORDER, FAMILY_PAGES, TOOL_FIELD_WHITELIST, runtimeHeader, extractLiteral, familyFor, buildManifest, runtimeProjection, serialize, serializeRuntime, outputs };
