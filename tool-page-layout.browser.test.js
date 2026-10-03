'use strict';

// 操作頁的桌機／手機版面契約；工程數值與計算書由各工具既有 wrapper 驗證。
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const ROOT = __dirname;
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = path.join(ROOT, 'output', 'playwright', 'tool-page-layout', runId);
const tools = [
  { key: 'rc-beam', file: '鋼筋混凝土/tools/beam.html', max: 23, calculate: '.btn-calc', summary: true },
  { key: 'rc-column', file: '鋼筋混凝土/tools/column.html', max: 19, summary: true },
  { key: 'rc-slab', file: '鋼筋混凝土/tools/slab.html', max: 12 },
  { key: 'rc-wall', file: '鋼筋混凝土/tools/wall.html', max: 32, summary: true },
  { key: 'rc-shear-wall', file: '鋼筋混凝土/tools/shear-wall.html', max: 9, summary: true },
  { key: 'steel-formal', file: '鋼構工具/index.html', max: 0 },
  { key: 'steel-plate', file: '鋼構工具/plate-check.html', max: 0 },
  { key: 'steel-beam-formal', file: '鋼構工具/steel-beam-formal.html', max: 1, calculate: '#runCheckBtn' },
  { key: 'steel-column-formal', file: '鋼構工具/steel-column-formal.html', max: 1, calculate: '#runCheckBtn' },
  { key: 'continuous-beam', file: '連續梁分析.html', max: 17, calculate: 'button[onclick="runAnalysis()"]' },
  { key: 'frame-analysis', file: '鋼架/平面剛架分析.html', max: 12 }
];
const selected = tools.filter(t => !process.env.TOOL_PAGE_LAYOUT_ONLY || process.env.TOOL_PAGE_LAYOUT_ONLY.split(',').includes(t.key));
if (!selected.length) throw new Error('TOOL_PAGE_LAYOUT_ONLY 未選到工具');
const viewports = [{ width: 1280, height: 900 }, { width: 375, height: 844 }];
const edge = process.env.EDGE_PATH || ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const failures = [], states = [];
let browser, server, serverText = '';
fs.mkdirSync(OUT, { recursive: true });

async function startServer() {
  server = spawn(process.execPath, [path.join(ROOT, 'serve-local.js'), '--no-open'], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = fs.createWriteStream(path.join(OUT, 'server.log'));
  server.stdout.on('data', data => { serverText += data; log.write(data); });
  server.stderr.on('data', data => log.write(data));
  server.once('close', () => log.end());
  return await new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const match = serverText.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearInterval(timer); resolve(match[1]); }
      else if (server.exitCode !== null || Date.now() - started > 20000) { clearInterval(timer); reject(new Error('本機測試服務無法啟動')); }
    }, 100);
  });
}
async function capture(page, tool, viewport, stage, errors) {
  // 等兩個繪圖週期，讓同步計算與 MutationObserver 的畫面更新完成。
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const state = await page.evaluate(() => ({
    overflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth, document.body.scrollWidth - innerWidth),
    token: getComputedStyle(document.documentElement).getPropertyValue('--hy-navy').trim(),
    overflowElements: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().right > innerWidth + 1).slice(0, 20).map(e => ({ id: e.id, tag: e.tagName, className: e.getAttribute('class'), right: e.getBoundingClientRect().right })),
    resultText: [...document.querySelectorAll('#bannerStatus, #resultSummary, #reactionTable, #dispTbl, .result-item')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    inputs: [...document.querySelectorAll('input,select,textarea')].map(e => ({ id: e.id, value: e.value, checked: e.checked }))
  }));
  const screenshot = `${tool.key}-${viewport.width}-${stage}.png`;
  await page.screenshot({ path: path.join(OUT, screenshot), animations: 'disabled' });
  const record = { tool: tool.key, width: viewport.width, stage, ...state, errors: [...errors], screenshot };
  states.push(record);
  if (state.overflowPx !== 0 || !state.token || errors.length) failures.push(record);
}
(async () => {
  const baseUrl = await startServer();
  browser = await chromium.launch({ headless: true, ...(edge ? { executablePath: edge } : {}), args: ['--no-first-run'] });
  for (const tool of selected) {
    const source = fs.readFileSync(path.join(ROOT, tool.file), 'utf8');
    const lines = source.split('\n').filter(line => line.includes('style="')).length;
    if (lines > tool.max) failures.push({ tool: tool.key, rule: 'inline-style-lines', actual: lines, maximum: tool.max });
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      try {
        const response = await page.goto(baseUrl + '/' + tool.file.split('/').map(encodeURIComponent).join('/'), { waitUntil: 'networkidle' });
        if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status()}`);
        await capture(page, tool, viewport, 'initial', errors);
        if (tool.calculate) await page.locator(tool.calculate).first().click();
        if (tool.summary) await page.locator('.section-tabs button[data-tab="summary"]').click();
        if (tool.calculate || tool.summary) await capture(page, tool, viewport, 'results', errors);
        // 頁面專用狀態不可在直接列印中露出。
        await page.emulateMedia({ media: 'print' });
        const visibleHints = await page.locator('[data-page-only="true"], .page-only-report-status').evaluateAll(nodes => nodes.filter(e => e.getClientRects().length && getComputedStyle(e).display !== 'none').length);
        if (visibleHints) failures.push({ tool: tool.key, width: viewport.width, rule: 'print-page-only', visibleHints });
      } catch (error) { failures.push({ tool: tool.key, width: viewport.width, error: String(error.stack || error), errors }); }
      finally { await context.close(); }
    }
  }
})().catch(error => failures.push({ fatal: String(error.stack || error) })).finally(async () => {
  if (browser) await browser.close();
  if (server && server.exitCode === null) server.kill();
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ runId, states, failures }, null, 2));
  console.log(JSON.stringify({ states: states.length, failures: failures.length, output: OUT }));
  if (failures.length) process.exitCode = 1;
});
