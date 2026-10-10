'use strict';

// 只在本機 HTTP 回應內插入計數探針，不改正式 HTML / JS。
// 每輪序列執行；沒有自動重試。原生 dialog fixture 與實際工具彈窗分別記錄。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const readline = require('node:readline/promises');
const ROOT = __dirname;
const manifest = require('./結構工具箱/tools/tool-workflow.manifest.json');
const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? '' : process.argv[index + 1] || ''; };
const normalizeKey = value => '/' + value.replace(/^\//, '').trim();
const slug = key => key.replace(/^\//, '');

const ENTRY_FUNCTIONS = {
  '/frame-analysis': ['runAnalysis'], '/rc-beam': ['calcBeam'], '/rc-column': ['calcColumn'],
  '/rc-slab': ['calcSlab'], '/rc-wall': ['calcWall'], '/rc-shear-wall': ['calcShearWall'],
  '/rc-foundation': ['calcFdtn'], '/rc-deep-beam-stm': ['calculate'],
  '/rc-foundation-deep-beam-stm': ['calculate'], '/rc-pile-cap-3d-stm': ['calculate'], '/rc-pile': ['calc'],
  '/rc-retrofit-section': ['calcBeam', 'calcCol'], '/rc-column-cover-deviation': ['calculateColumnCoverDeviation'],
  '/steel-formal': ['update'], '/steel-plate': ['update'], '/steel-beam-formal': ['runCheck'], '/steel-column-formal': ['runCheck'],
  '/src-beam': ['calculate'], '/src-column': ['calculate'],
  '/seismic-force': ['calc', 'calcAppendage', 'calcVertical', 'calcMisc'],
  '/seismic-appendage': ['calcAppendagePage'], '/seismic-misc': ['calcMiscPage'],
  '/stone-fixing': ['render'], '/foundation-local': ['calculateFoundationLocal'], '/equipment-load': ['calculateEquipmentLoad'],
  '/earth-pressure': ['calculateEarthPressure'], '/floor-slab-westergaard': ['calculateFloorSlabWestergaard'],
  '/cable-tension-frequency': ['calculateCableTensionFrequency'], '/decking': ['recalcAll'], '/beam-analysis': ['runAnalysis']
};
const groups = {
  rc: tool => tool.key.startsWith('/rc-'), steel: tool => tool.key.startsWith('/steel'),
  wind: tool => tool.key.startsWith('/wind-'), seismic: tool => tool.key.startsWith('/seismic-'),
  analysis: tool => ['/frame-analysis', '/beam-analysis'].includes(tool.key),
  native: tool => tool.adapter === 'native-react'
};

function probeSourceFile(tool) {
  if (tool.key.startsWith('/src-')) return `SRC工具/${slug(tool.key)}.js`;
  if (tool.adapter === 'steel-explicit') return tool.sourceFile;
  return tool.file;
}
function sourceProbe(tool, relativeFile, source) {
  const edits = [];
  const names = tool.key.startsWith('/wind-') ? ['calc'] : ENTRY_FUNCTIONS[tool.key] || [];
  if (tool.adapter === 'native-react') {
    if (!/^anchor\/assets\/.*\.js$/.test(relativeFile)) return { source, edits };
    source = source.replace(/\bcalculateAndShowResults\s*:\s*\(\s*\)\s*=>\s*\{/g, match => {
      edits.push('calculateAndShowResults');
      return `${match}globalThis.__hyWorkflowBrowserProbe.hit('calculateAndShowResults');`;
    });
    return { source, edits };
  }
  if (relativeFile !== probeSourceFile(tool)) return { source, edits };
  for (const name of names) {
    const pattern = new RegExp(`(^[ \\t]*(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{)`, 'gm');
    let count = 0;
    source = source.replace(pattern, match => { count++; return `${match}\n globalThis.__hyWorkflowBrowserProbe.hit(${JSON.stringify(name)});`; });
    if (count !== 1) throw Error(`${tool.key}: ${relativeFile} 的 ${name} 探針應唯一，實際 ${count}；請更新明確映射，不可退回只數按鍵。`);
    edits.push(name);
  }
  return { source, edits };
}

async function selection() {
  if (process.argv.includes('--list')) {
    manifest.tools.forEach((tool, index) => console.log(`${String(index + 1).padStart(2)}. ${tool.key} | ${tool.adapter} | ${tool.file}`));
    return [];
  }
  let only = argument('--only') || process.env.TOOL_WORKFLOW_ONLY || '';
  const group = argument('--group') || process.env.TOOL_WORKFLOW_GROUP || '';
  if (process.argv.includes('--menu')) {
    manifest.tools.forEach((tool, index) => console.log(`${index + 1}. ${tool.key}`));
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question('輸入序號（逗號分隔）、工具 key，或 all：');
    prompt.close();
    only = answer.trim() === 'all' ? '' : answer.split(',').map(value => /^\d+$/.test(value.trim()) ? manifest.tools[Number(value.trim()) - 1]?.key || value : value).join(',');
  }
  if (group && !groups[group]) throw Error(`未知群組 ${group}；可用 ${Object.keys(groups).join(', ')}`);
  const keys = only ? only.split(',').map(normalizeKey) : null;
  if (keys) for (const key of keys) if (!manifest.tools.some(tool => tool.key === key)) throw Error(`未知工具 ${key}`);
  const selected = manifest.tools.filter(tool => (!keys || keys.includes(tool.key)) && (!group || groups[group](tool)));
  if (!selected.length) throw Error('沒有選到工具');
  return selected;
}

function createProbe() {
  window.__hyWorkflowBrowserProbe = {
    hits: [], events: [], pending: [],
    hit(name) { this.hits.push({ name, at: performance.now() }); },
    reset() { this.hits = []; this.events = []; this.pending = []; }
  };
}
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => {
    let last = -1, stable = 0, frames = 0;
    function next() {
      const count = window.__hyWorkflowBrowserProbe.hits.length;
      stable = count === last ? stable + 1 : 0; last = count; frames++;
      if (stable >= 16 || frames >= 300) resolve(); else requestAnimationFrame(next);
    }
    requestAnimationFrame(next);
  }));
}
async function reset(page) { await page.evaluate(() => window.__hyWorkflowBrowserProbe.reset()); }
async function hits(page) { return page.evaluate(() => window.__hyWorkflowBrowserProbe.hits); }
async function layoutEvidence(page) {
  return page.evaluate(() => {
    const label = node => node.id ? `#${node.id}` : `${node.tagName.toLowerCase()}${typeof node.className === 'string' && node.className ? '.' + node.className.trim().split(/\s+/).join('.') : ''}`;
    const outside = [];
    for (const node of document.body.querySelectorAll('*')) {
      if (!node.getClientRects().length) continue;
      const rect = node.getBoundingClientRect();
      if (rect.right <= innerWidth + .5 && rect.left >= -.5) continue;
      let clipping = null;
      for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX)) { clipping = label(parent); break; }
      }
      outside.push({ element: label(node), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), clipping });
    }
    return { viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth, overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      uncontained: outside.filter(node => !node.clipping).slice(0, 40), locallyClipped: outside.filter(node => node.clipping).slice(0, 12) };
  });
}

async function openNativeStack(page) {
  await page.evaluate(() => {
    for (const name of ['lower', 'upper']) {
      const dialog = document.createElement('dialog');
      dialog.id = `workflow-qa-${name}`;
      dialog.dataset.pageOnly = 'true';
      const input = document.createElement('input'); input.setAttribute('aria-label', `QA ${name}`);
      input.addEventListener('keydown', event => { if (event.key === 'Enter') window.__hyWorkflowBrowserProbe.events.push('modal-target-enter'); });
      dialog.append(input); document.body.append(dialog); dialog.showModal();
    }
    document.querySelector('#workflow-qa-upper input').focus();
  });
}
async function visibleModals(page, selectors) {
  return page.evaluate(selectors => Array.from(document.querySelectorAll(selectors)).filter(node => {
    const style = getComputedStyle(node);
    return !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length && style.display !== 'none' && style.visibility !== 'hidden';
  }).map(node => ({ id: node.id, className: node.className, z: Number.parseInt(getComputedStyle(node).zIndex, 10) || 0 })), selectors);
}
async function realModalStack(page, tool) {
  if (tool.key === '/stone-fixing') {
    await page.evaluate(() => { window.v2OpenValidationModal(); window.v2OpenTemplateManager(); });
    return tool.modalSelectors.join(',');
  }
  if (tool.key === '/beam-analysis') {
    await page.evaluate(() => {
      // 開啟真實儲存框；載入框僅設既有開啟狀態，避免驗收讀取遠端 Firebase 案件。
      window._fbSave();
      document.getElementById('loadModal').classList.add('active');
    });
    return '#saveModal, #loadModal';
  }
  if (tool.key === '/anchor') {
    await page.locator('.shortcut-help-trigger').click();
    await page.keyboard.press('Control+k');
    return '[role="dialog"][aria-modal="true"]';
  }
  return null;
}

async function main() {
  const selected = await selection();
  if (!selected.length) return;
  const widths = (argument('--widths') || process.env.TOOL_WORKFLOW_WIDTHS || '1280,375').split(',').map(Number);
  if (widths.some(width => ![1280, 375].includes(width))) throw Error('寬度僅支援核准的 1280,375');
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  const output = path.join(ROOT, 'output/playwright/tool-workflow', runId);
  fs.mkdirSync(output, { recursive: true });
  const summary = { runId, head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), selected: selected.map(tool => tool.key), widths, cases: [], failures: [], probes: [] };
  const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  save();
  let browser, server, serverText = '';
  try {
    let baseUrl = argument('--base-url') || process.env.TOOL_WORKFLOW_BASE_URL;
    if (!baseUrl) {
      server = spawn(process.execPath, [path.join(ROOT, 'serve-local.js'), '--no-open'], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const log = fs.createWriteStream(path.join(output, 'server.log'));
      server.stdout.on('data', data => { serverText += data; log.write(data); });
      server.stderr.on('data', data => log.write(data)); server.once('close', () => log.end());
      baseUrl = await new Promise((resolve, reject) => {
        const start = Date.now(); const timer = setInterval(() => {
          const match = serverText.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
          if (match) { clearInterval(timer); resolve(match[1]); }
          else if (server.exitCode !== null || Date.now() - start > 20000) { clearInterval(timer); reject(Error('本機測試服務無法啟動')); }
        }, 100);
      });
    }
    const origin = new URL(baseUrl);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw Error('僅允許本機測試服務');
    const { chromium } = require('playwright');
    const edge = process.env.EDGE_PATH || ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(file => fs.existsSync(file));
    browser = await chromium.launch({ headless: true, ...(edge ? { executablePath: edge } : {}), args: ['--no-first-run'] });
    for (const tool of selected) for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width === 375 ? 844 : 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      const page = await context.newPage(); const prefix = `${slug(tool.key)}-${width}`;
      const record = { key: tool.key, width, checks: [], screenshots: [], errors: [], probes: [], observations: {} };
      const failuresBefore = summary.failures.length;
      const check = (name, passed, detail) => { record.checks.push({ name, passed: !!passed, detail }); if (!passed) summary.failures.push({ key: tool.key, width, name, detail }); };
      const capture = async stage => {
        (record.observations.layout ||= {})[stage] = await layoutEvidence(page);
        const filename = `${prefix}-${stage}.png`; await page.screenshot({ path: path.join(output, filename), animations: 'disabled' }); record.screenshots.push(filename);
      };
      page.on('pageerror', error => record.errors.push(error.message));
      page.on('dialog', async dialog => { record.errors.push(`browser dialog: ${dialog.type()} ${dialog.message()}`); await dialog.dismiss(); });
      page.on('download', download => record.errors.push(`unexpected download: ${download.suggestedFilename()}`));
      context.on('page', popup => { if (popup !== page) record.errors.push('unexpected popup/report'); });
      try {
        await page.addInitScript(createProbe);
        await context.route(`${origin.origin}/**`, async route => {
          const url = new URL(route.request().url());
          const relativeFile = decodeURIComponent(url.pathname).replace(/^\//, '');
          const relevant = tool.adapter === 'native-react' ? /^anchor\/assets\/.*\.js$/.test(relativeFile) : relativeFile === probeSourceFile(tool);
          if (!relevant) return route.continue();
          const response = await route.fetch(); const original = await response.text();
          const transformed = sourceProbe(tool, relativeFile, original);
          const probe = { file: relativeFile, names: transformed.edits, sha256: crypto.createHash('sha256').update(original).digest('hex') };
          record.probes.push(probe); summary.probes.push({ key: tool.key, width, ...probe });
          await route.fulfill({ response, body: transformed.source });
        });
        const response = await page.goto(`${origin.origin}/${tool.file.split('/').map(encodeURIComponent).join('/')}`, { waitUntil: 'networkidle', timeout: 45000 });
        if (!response || response.status() >= 400) throw Error(`HTTP ${response?.status()}`);
        await settle(page);
        if (tool.adapter === 'native-react') await page.locator('.app-shell').waitFor({ state: 'visible' });
        else await page.locator(`[data-hy-workflow="${tool.key}"]`).waitFor({ state: 'visible', timeout: 10000 });
        check('probe-installed', record.probes.some(probe => probe.names.length > 0), record.probes);
        await capture('initial');

        // 真實輸入框保持焦點，Ctrl+Enter 必須只進入一次原計算入口。
        let input = page.locator('input:not([type]):not([readonly]):not([disabled]),input[type="text"]:not([readonly]):not([disabled]),input[type="number"]:not([readonly]):not([disabled]),textarea:not([readonly]):not([disabled])').filter({ visible: true }).first();
        if (!await input.count()) {
          await page.evaluate(() => { const input = document.createElement('input'); input.id = 'workflow-qa-input'; input.setAttribute('aria-label', 'QA 快捷鍵焦點'); document.body.prepend(input); });
          input = page.locator('#workflow-qa-input'); record.observations.inputFallback = true;
        }
        await input.focus(); await reset(page);
        await page.keyboard.press('Control+Enter'); await settle(page);
        const calculationHits = await hits(page);
        check('ctrl-enter-exactly-once', calculationHits.length === 1, calculationHits);
        const resultVisible = tool.adapter === 'native-react' ? await page.locator('.app-shell[data-active-tab="result"]').count() > 0 : await page.locator(tool.resultSelector).filter({ visible: true }).count() > 0;
        check('ctrl-enter-shows-result', resultVisible, tool.resultSelector);
        await capture('ctrl-enter');

        if (tool.key === '/decking') {
          // 覆工板計算後切至報告頁；透過既有分頁返回真正的參數欄。
          await page.locator('nav.tabs button[data-tab="global"]').click();
          await settle(page);
          check('decking-returns-to-editable-inputs', await input.isVisible());
        }

        await input.focus(); await settle(page);
        record.observations.nonCalculationKeys = [];
        for (const values of [{ key: 'Enter' }, { key: 'Enter', ctrlKey: true, repeat: true }, { key: 'Enter', ctrlKey: true, isComposing: true }, { key: 'Enter', ctrlKey: true, altKey: true }, { key: 'Enter', ctrlKey: true, shiftKey: true }]) {
          await reset(page); await input.dispatchEvent('keydown', values); await settle(page);
          record.observations.nonCalculationKeys.push({ keys: values, hits: await hits(page) });
        }
        check('ordinary-ime-repeat-keys-do-not-calculate', record.observations.nonCalculationKeys.every(item => item.hits.length === 0), record.observations.nonCalculationKeys);

        // capture listener 排在核心之後、原輸入 callback 之前，保留瞬間 pending 證據。
        await page.evaluate(() => {
          document.addEventListener('input', () => {
            const panel = document.querySelector('[data-hy-workflow]');
            if (panel) window.__hyWorkflowBrowserProbe.pending.push({ state: panel.dataset.state, text: panel.querySelector('[data-workflow-summary]')?.textContent || '', tone: panel.dataset.tone });
          }, true);
          const observer = new MutationObserver(records => {
            // React 可在同一 microtask 先提交 pending 再完成計算；即使節點已移除，
            // MutationRecord 仍保留真實插入的節點，避免只查最後 DOM 而漏掉證據。
            const nodes = new Set([document.querySelector('.workspace-recalculation-status')]);
            for (const record of records) for (const added of record.addedNodes) {
              if (added.nodeType !== Node.ELEMENT_NODE) continue;
              if (added.matches('.workspace-recalculation-status')) nodes.add(added);
              added.querySelectorAll('.workspace-recalculation-status').forEach(node => nodes.add(node));
            }
            for (const native of nodes) if (native) window.__hyWorkflowBrowserProbe.pending.push({ state: 'pending', text: native.textContent, native: true });
          });
          observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        });
        if (tool.adapter === 'native-react') {
          // 切回真實構件輸入，使 React 受控輸入產生新的計算參照。
          await page.locator('.workspace-tabs button[data-tab-id="member"]').click();
          input = page.locator('input[type="number"]:not([readonly]):not([disabled])').filter({ visible: true }).first();
        }
        await reset(page);
        const inputBefore = await input.inputValue();
        const inputAfter = await input.evaluate(node => {
          if (node.type !== 'number') return `${node.value} QA`;
          const value = Number(node.value) || 0, step = Number(node.step) || 1;
          const min = node.min === '' ? -Infinity : Number(node.min), max = node.max === '' ? Infinity : Number(node.max);
          return String(value + step <= max ? value + step : Math.max(min, value - step));
        });
        await input.fill(inputAfter); await settle(page);
        record.observations.inputChange = { before: inputBefore, after: inputAfter };
        record.observations.pending = await page.evaluate(() => window.__hyWorkflowBrowserProbe.pending);
        check('input-invalidates-old-conclusion', record.observations.pending.some(item => item.state === 'pending' && /輸入已變更|尚未更新|待更新/.test(item.text)), record.observations.pending);
        await capture('input-pending');
        await input.fill(inputBefore); await settle(page);

        const calculateSelector = tool.createCalculateButton ? '[data-workflow-calculate]' : tool.calculateButton || (tool.key === '/rc-beam' ? '.btn-calc' : tool.key === '/beam-analysis' ? 'button[onclick="runAnalysis()"]' : null);
        if (calculateSelector) {
          // 先提交前一步填值可能留待 blur 的原生 change／自動計算，再隔離這次按鈕操作。
          await input.blur(); await settle(page);
          await reset(page); await page.locator(calculateSelector).filter({ visible: true }).first().click(); await settle(page);
          check('calculate-button-exactly-once', (await hits(page)).length === 1, await hits(page));
        }

        await openNativeStack(page); await reset(page);
        await page.keyboard.press('Control+Enter'); await settle(page);
        for (const flags of [{ repeat: true }, { isComposing: true }]) await page.locator('#workflow-qa-upper input').dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, ...flags });
        check('native-modal-blocks-calculation', (await hits(page)).length === 0, await hits(page));
        check('native-modal-blocks-target-enter', await page.evaluate(() => window.__hyWorkflowBrowserProbe.events.length) === 0);
        await page.keyboard.press('Escape');
        check('escape-closes-only-top-native-dialog', await page.locator('#workflow-qa-lower[open]').count() === 1 && await page.locator('#workflow-qa-upper[open]').count() === 0);
        await page.keyboard.press('Escape');
        check('escape-closes-next-native-dialog', await page.locator('#workflow-qa-lower[open]').count() === 0);
        await page.evaluate(() => document.querySelectorAll('[id^="workflow-qa-"]').forEach(node => node.remove()));

        const modalSelectors = await realModalStack(page, tool);
        if (modalSelectors) {
          const before = await visibleModals(page, modalSelectors);
          check('real-modal-stack-opened', before.length >= 2, before);
          await page.evaluate(selectors => {
            const nodes = [...document.querySelectorAll(selectors)].filter(node => node.getClientRects().length && getComputedStyle(node).display !== 'none').sort((a, b) => (Number.parseInt(getComputedStyle(a).zIndex, 10) || 0) - (Number.parseInt(getComputedStyle(b).zIndex, 10) || 0));
            const top = nodes.at(-1); const focus = top.querySelector('input,button,textarea') || top;
            focus.setAttribute('tabindex', '0'); focus.focus();
            focus.addEventListener('keydown', event => { if (event.key === 'Enter') window.__hyWorkflowBrowserProbe.events.push('real-modal-target-enter'); });
          }, modalSelectors);
          await reset(page); await page.keyboard.press('Control+Enter'); await settle(page);
          await page.evaluate(() => {
            for (const flags of [{ repeat: true }, { isComposing: true }]) document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true, ...flags }));
          });
          check('real-modal-blocks-calculation-and-command', (await hits(page)).length === 0 && await page.evaluate(() => window.__hyWorkflowBrowserProbe.events.length) === 0, await hits(page));
          await capture('real-modal'); await page.keyboard.press('Escape');
          const after = await visibleModals(page, modalSelectors);
          check('escape-closes-only-top-real-modal', after.length === before.length - 1, { before, after });
          for (let i = 0; i < before.length; i++) await page.keyboard.press('Escape');
        }

        const layout = await layoutEvidence(page); record.observations.layout.final = layout;
        const overflow = layout.overflow;
        check('no-horizontal-page-overflow', overflow <= 0, overflow);
        await page.emulateMedia({ media: 'print' });
        const visibleHints = await page.locator('[data-hy-workflow], .workspace-recalculation-status, .workflow-keyboard-hint').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && getComputedStyle(node).display !== 'none').length);
        check('workflow-hints-hidden-in-print', visibleHints === 0, visibleHints);
        check('no-runtime-errors-or-output-side-effects', record.errors.length === 0, record.errors);
      } catch (error) {
        record.error = String(error.stack || error); summary.failures.push({ key: tool.key, width, error: record.error });
        try { await capture('failure'); } catch (_) { /* 保留原失敗 */ }
      } finally {
        const failed = summary.failures.length > failuresBefore;
        await context.tracing.stop(failed ? { path: path.join(output, `${prefix}-failure-trace.zip`) } : {});
        await context.close(); summary.cases.push(record); save();
        fs.writeFileSync(path.join(output, `${prefix}.json`), JSON.stringify(record, null, 2));
        console.log(`${failed ? 'FAIL' : 'PASS'} ${tool.key} ${width}px (${record.checks.length} checks)`);
      }
    }
  } catch (error) { summary.failures.push({ fatal: String(error.stack || error) }); }
  finally {
    if (browser) await browser.close(); if (server && server.exitCode === null) server.kill(); save();
    console.log(JSON.stringify({ cases: summary.cases.length, failures: summary.failures.length, output }));
    if (summary.failures.length) process.exitCode = 1;
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { sourceProbe, ENTRY_FUNCTIONS, probeSourceFile };
