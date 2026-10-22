#!/usr/bin/env node
'use strict';
// 首屏分類由 home.js 產生靜態佔位內容，避免腳本抵達後才推動整個工具區。
// 不另建工具清冊；JavaScript 載入後仍使用同一份資料重新繫結互動。
// 分類卡（#categoryOverview）是唯一可見的分類篩選，第一張為「全部」；
// #categoryFilters 為隱藏的狀態鏡像，結構維持原樣。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'assets/home/src/home.source.js');
const htmlPath = path.join(root, 'index.html');
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));

function generatedFragments(source) {
  const end = source.indexOf('  const state = {');
  if (end < 0) throw new Error('找不到首頁資料與互動的分界。');
  const { categories, categoryIcons, categoryAllIcon, tools } = vm.runInNewContext(source.slice(0, end) + '\nreturn { categories, categoryIcons, categoryAllIcon, tools }; })();', {}, { timeout: 1000 });
  const count = category => category.id === 'all' ? tools.length : tools.filter(tool => tool.categories.includes(category.id)).length;
  const overview = categories.map(category => {
    const isAll = category.id === 'all';
    const icon = isAll
      ? `<span class="category-card__all-icon" aria-hidden="true">${categoryAllIcon}</span>`
      : `<span class="category-icon category-icon--${escape(category.icon)}" aria-hidden="true">${categoryIcons[category.icon] || ''}<span class="icon-mark">${escape(category.mark)}</span></span>`;
    return `<button type="button" class="category-card${isAll ? ' category-card--all is-active' : ''}" data-category-id="${escape(category.id)}" aria-label="篩選 ${escape(category.label)}" aria-pressed="${isAll}" disabled>${icon}<div class="category-card__body"><strong>${escape(category.label)}<span>${count(category)}</span></strong><p>${escape(category.summary)}</p></div></button>`;
  }).join('');
  const filters = categories.map(category =>
    `<button type="button" class="filter-button${category.id === 'all' ? ' is-active' : ''}" aria-pressed="${category.id === 'all'}" disabled><strong>${escape(category.label)}</strong><span>${count(category)}</span></button>`).join('');
  return { overview, filters };
}
function update(source, html) {
  const fragments = generatedFragments(source);
  for (const [id, className, fragment] of [['categoryOverview','category-grid',fragments.overview], ['categoryFilters','filter-list',fragments.filters]]) {
    const marker = `<!-- home-initial:${id}:start -->`;
    const endMarker = `<!-- home-initial:${id}:end -->`;
    const generated = `${marker}<div id="${id}" class="${className}">${fragment}</div>${endMarker}`;
    const start = html.indexOf(marker), end = html.indexOf(endMarker);
    if (start >= 0 && end > start) html = html.slice(0, start) + generated + html.slice(end + endMarker.length);
    else {
      const original = `<div id="${id}" class="${className}"></div>`;
      if (!html.includes(original)) throw new Error('首頁初始內容標記不完整：' + id);
      html = html.replace(original, generated);
    }
  }
  return html;
}
if (require.main === module) {
  const current = fs.readFileSync(htmlPath, 'utf8');
  const next = update(fs.readFileSync(scriptPath, 'utf8'), current);
  if (process.argv.includes('--check')) {
    if (next !== current) { console.error('首頁初始分類與 home.js 不一致；請執行 sync-home-initial-view.js。'); process.exitCode = 1; }
    else console.log('Homepage initial categories are in sync.');
  } else if (next !== current) { fs.writeFileSync(htmlPath, next); console.log('Updated homepage initial categories.'); }
  else console.log('Homepage initial categories are in sync.');
}
module.exports = { generatedFragments, update };
