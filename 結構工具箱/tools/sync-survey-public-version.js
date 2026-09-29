#!/usr/bin/env node
// 現況鑑定紀錄改版後，將首頁卡片版本／更新日與 Pages 上線檢查標記同步到 field-survey 實際版本。
// 用法：node 結構工具箱/tools/sync-survey-public-version.js [--date YYYY-MM-DD] [--check]
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const write = (relativePath, text) => fs.writeFileSync(path.join(repoRoot, relativePath), text, 'utf8');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const dateIndex = args.indexOf('--date');
const today = dateIndex >= 0 ? args[dateIndex + 1] : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`日期格式須為 YYYY-MM-DD：${today}`);

const version = read('field-survey/model.js').match(/export const VERSION = '([^']+)'/)?.[1];
const cacheName = read('field-survey/sw.js').match(/const CACHE = '(condition-survey-shell-[^']+?)(?:-r\d+)?'/)?.[1];
if (!version || !cacheName) throw new Error('無法由 field-survey/model.js 或 sw.js 取得版本');

const homePath = '結構工具箱/assets/home/home.js';
const smokePath = '結構工具箱/tools/pages-live-smoke.js';
let home = read(homePath);
let smoke = read(smokePath);
const before = { home, smoke };

const cardPattern = /(title: '現況鑑定紀錄',\s*\n\s*version: ')V[^']+(')/;
if (!cardPattern.test(home)) throw new Error('找不到首頁現況鑑定卡片');
home = home.replace(cardPattern, `$1V${version}$2`);
// 更新日規則與 toolbox-entrypoints 契約相同：目標與依賴檔最後提交日；有未提交變更時取今日。
const surveyFiles = ['field-survey/recorder.html', ...(home.match(/'\/condition-survey': \[([^\]]+)\]/)?.[1].match(/'[^']+'/g) || []).map(item => item.slice(1, -1))];
const git = gitArgs => execFileSync('git', ['-c', 'core.quotepath=off', ...gitArgs], { cwd: repoRoot, encoding: 'utf8' }).trim();
const dirty = git(['status', '--porcelain', '--', ...surveyFiles]) !== '';
const contentDate = dirty ? today : surveyFiles.map(file => git(['log', '-1', '--format=%cs', '--', file])).filter(Boolean).sort().at(-1);
home = home.replace(/('\/condition-survey': ')\d{4}-\d{2}-\d{2}(')/, `$1${contentDate}$2`);
const generatedAt = home.match(/generatedAt: '(\d{4}-\d{2}-\d{2})'/)?.[1];
if (generatedAt && generatedAt < contentDate) home = home.replace(/(generatedAt: ')\d{4}-\d{2}-\d{2}(')/, `$1${contentDate}$2`);
smoke = smoke.replace(/'現況鑑定紀錄 V[^']+'/, `'現況鑑定紀錄 V${version}'`);
smoke = smoke.replace(/'condition-survey-shell-[^']+'/, `'${cacheName}'`);

const changed = home !== before.home || smoke !== before.smoke;
if (checkOnly) {
  if (changed) {
    console.error(`首頁或上線檢查標記未同步至 V${version}；請執行 node 結構工具箱/tools/sync-survey-public-version.js`);
    process.exit(1);
  }
  console.log(`survey public version in sync (V${version})`);
} else {
  if (home !== before.home) write(homePath, home);
  if (smoke !== before.smoke) write(smokePath, smoke);
  console.log(changed ? `synced survey public version to V${version} (${today})` : `already in sync (V${version})`);
}
