#!/usr/bin/env node
// 依 toolbox-entrypoints 契約的規則，重算首頁 HOME_TOOL_UPDATES 各路線的更新日：
// 目標檔與 HOME_TOOL_UPDATE_DEPENDENCIES 依賴檔的最後提交日（%cs）；任一檔有未提交變更時取今日，
// generatedAt 取所有路線日期的最大值（不早於原值）。
// 用法：node 結構工具箱/tools/sync-home-update-dates.js [--check]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const toolboxRoot = path.join(repoRoot, '結構工具箱');
const homePath = path.join(toolboxRoot, 'assets', 'home', 'home.js');
const checkOnly = process.argv.includes('--check');
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });

function extractConstLiteral(source, name) {
  const prefix = `const ${name} = `;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`home.js missing const ${name}`);
  const valueStart = start + prefix.length;
  const open = source[valueStart];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let quote = null;
  for (let index = valueStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') quote = char;
    else if (char === open) depth += 1;
    else if (char === close && --depth === 0) return source.slice(valueStart, index + 1);
  }
  throw new Error(`unterminated const ${name}`);
}

const git = args => execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim();
const toRepo = absolute => path.relative(repoRoot, absolute).split(path.sep).join('/');

function resolveHomeFileHref(href, routeFileMap) {
  const mapped = routeFileMap[href];
  if (mapped) return toRepo(path.resolve(toolboxRoot, mapped));
  if (href.startsWith('/結構工具箱/')) return `結構工具箱/${href.replace(/^\/結構工具箱\//, '')}`;
  if (href.startsWith('/')) return toRepo(path.resolve(toolboxRoot, `..${href}`));
  return toRepo(path.resolve(toolboxRoot, href));
}

let source = fs.readFileSync(homePath, 'utf8');
const evaluate = literal => vm.runInNewContext(`(${literal})`);
const updates = evaluate(extractConstLiteral(source, 'HOME_TOOL_UPDATES'));
const dependencies = evaluate(extractConstLiteral(source, 'HOME_TOOL_UPDATE_DEPENDENCIES'));
const routeFileMap = evaluate(extractConstLiteral(source, 'routeFileMap'));

const changes = [];
const dates = {};
for (const [route, current] of Object.entries(updates.routes)) {
  const files = [resolveHomeFileHref(route, routeFileMap), ...((dependencies.routes || {})[route] || [])];
  const dirty = git(['status', '--porcelain', '--untracked-files=all', '--', ...files]) !== '';
  const committed = files.map(file => git(['log', '-1', '--format=%cs', '--', file])).filter(Boolean).sort().at(-1);
  const expected = dirty ? today : (committed || current);
  dates[route] = expected;
  if (expected !== current) changes.push(`${route}: ${current} -> ${expected}`);
}
const generatedAt = [updates.generatedAt, ...Object.values(dates)].sort().at(-1);
if (generatedAt !== updates.generatedAt) changes.push(`generatedAt: ${updates.generatedAt} -> ${generatedAt}`);

if (checkOnly) {
  if (changes.length) {
    console.error(`首頁更新日未同步（${changes.length} 項）：\n  ${changes.join('\n  ')}\n請執行 node 結構工具箱/tools/sync-home-update-dates.js`);
    process.exit(1);
  }
  console.log('home update dates in sync');
} else {
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [route, date] of Object.entries(dates)) {
    source = source.replace(new RegExp(`('${escape(route)}': ')\\d{4}-\\d{2}-\\d{2}(')`), `$1${date}$2`);
  }
  source = source.replace(/(HOME_TOOL_UPDATES = \{[\s\S]*?generatedAt: ')\d{4}-\d{2}-\d{2}(')/, `$1${generatedAt}$2`);
  fs.writeFileSync(homePath, source, 'utf8');
  console.log(changes.length ? `updated ${changes.length} item(s):\n  ${changes.join('\n  ')}` : 'already in sync');
}
