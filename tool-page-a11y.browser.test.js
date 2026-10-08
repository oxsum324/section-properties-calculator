'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const repo = __dirname;
const deps = path.join(repo, 'output/playwright/phase2-quality-deps/node_modules');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const homeSource = fs.readFileSync(path.join(repo, '結構工具箱/assets/home/home.js'), 'utf8');
const runBaseline = process.argv.includes('--baseline');
const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

function extractConstLiteral(source, name) {
  const prefix = `const ${name} = `;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`home.js missing const ${name}`);
  const valueStart = start + prefix.length;
  const open = source[valueStart];
  const close = open === '[' ? ']' : open === '{' ? '}' : '';
  if (!close) throw new Error(`const ${name} must start with a literal`);
  let depth = 0, inString = false, quote = '', escaped = false;
  for (let index = valueStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { inString = true; quote = char; continue; }
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return source.slice(valueStart, index + 1);
  }
  throw new Error(`unterminated const ${name}`);
}

function getFormalTools() {
  const tools = vm.runInNewContext(`(${extractConstLiteral(homeSource, 'tools')})`, {}, { timeout: 1000 });
  const formal = tools.filter(tool => tool.state === 'formal');
  if (tools.length !== 52 || formal.length !== 40) {
    throw new Error(`Expected 52 homepage tools and 40 formal tools; found ${tools.length}/${formal.length}`);
  }
  return formal.map(({ title, href }) => ({ title, href }));
}

function waitForServer(server, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error(`serve-local timed out: ${text}`)), timeoutMs);
    server.stdout.on('data', chunk => {
      text += chunk.toString('utf8');
      const match = text.match(/https?:\/\/127\.0\.0\.1:\d+\//);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', (code, signal) => { clearTimeout(timer); reject(new Error(`serve-local exited (${code}/${signal}): ${text}`)); });
  });
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

async function verifyInteractions(page) {
  const iconButtonIssues = await page.locator('button').evaluateAll(buttons => {
    const readable = value => /[\p{L}\p{N}]/u.test(value || '');
    return buttons.map(button => {
      const visible = (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim();
      if (readable(visible)) return null;
      const labelledBy = (button.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
        .map(id => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '').join(' ').trim();
      const name = button.getAttribute('aria-label') || labelledBy || button.getAttribute('title')
        || [...button.querySelectorAll('img[alt]')].map(image => image.alt).join(' ')
        || [...button.querySelectorAll('svg title')].map(title => title.textContent).join(' ');
      return readable(name) ? null : { html: button.outerHTML.slice(0, 320), accessibleName: name || '' };
    }).filter(Boolean);
  });

  const tabGroups = page.locator('.section-tabs[role="tablist"]');
  const groupCount = await tabGroups.count();
  const checks = [];
  const issues = [];
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const group = tabGroups.nth(groupIndex);
    const state = await group.evaluate(element => {
      const tabs = [...element.querySelectorAll(':scope > [role="tab"]')];
      const visible = tabs.filter(tab => tab.getClientRects().length && getComputedStyle(tab).visibility !== 'hidden');
      const selected = tabs.filter(tab => tab.getAttribute('aria-selected') === 'true');
      const associations = tabs.map(tab => {
        const refs = (tab.getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean);
        return { tab: tab.id, refs, panels: refs.map(id => document.getElementById(id)).filter(Boolean).map(panel => ({ id: panel.id, role: panel.getAttribute('role'), labelledBy: panel.getAttribute('aria-labelledby') })) };
      });
      return { visible: visible.map(tab => ({ id: tab.id, selected: tab.getAttribute('aria-selected') === 'true' })), selected: selected.map(tab => tab.id), associations };
    });
    const refsValid = state.associations.every(item => item.refs.length > 0 && item.refs.length === item.panels.length
      && item.panels.every(panel => panel.role === 'tabpanel' && panel.labelledBy.split(/\s+/).includes(item.tab)));
    if (!state.visible.length || state.selected.length !== 1 || !refsValid) {
      issues.push({ groupIndex, reason: 'tablist association or initial selection invalid', visibleTabs: state.visible.length, selectedTabs: state.selected.length, associations: state.associations });
      continue;
    }
    if (state.visible.length > 1) {
      const selectedIndex = state.visible.findIndex(tab => tab.selected);
      const nextIndex = (Math.max(selectedIndex, 0) + 1) % state.visible.length;
      await page.locator(`[id="${state.visible[Math.max(selectedIndex, 0)].id}"]`).focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(80);
      const after = await group.evaluate((element, expectedId) => {
        const active = document.activeElement;
        const selected = [...element.querySelectorAll('[role="tab"]')].find(tab => tab.getAttribute('aria-selected') === 'true');
        const style = active ? getComputedStyle(active) : null;
        return { activeId: active?.id || '', selectedId: selected?.id || '', outlineStyle: style?.outlineStyle || '', outlineWidth: style?.outlineWidth || '' , expectedId };
      }, state.visible[nextIndex].id);
      const focusVisible = after.outlineStyle !== 'none' && Number.parseFloat(after.outlineWidth) >= 2;
      if (after.activeId !== after.expectedId || after.selectedId !== after.expectedId || !focusVisible) {
        issues.push({ groupIndex, reason: 'ArrowRight or visible focus failed', after, focusVisible });
      }
      checks.push({ groupIndex, visibleTabs: state.visible.length, arrowRight: after.activeId === after.expectedId, selected: after.selectedId === after.expectedId, focusVisible });
    } else checks.push({ groupIndex, visibleTabs: 1, arrowRight: true, selected: true, focusVisible: true });
  }
  return { groupCount, checks, issues: [...issues, ...iconButtonIssues.map(item => ({ reason: 'icon button lacks readable name', ...item }))] };
}

async function main() {
  const { chromium } = require(path.join(deps, 'playwright'));
  const { AxeBuilder } = require(path.join(deps, '@axe-core/playwright'));
  const allTools = getFormalTools();
  const selectedRoutes = process.argv.filter(arg => arg.startsWith('--route=')).map(arg => arg.slice('--route='.length));
  const tools = selectedRoutes.length ? allTools.filter(tool => selectedRoutes.includes(tool.href)) : allTools;
  if (!tools.length) throw new Error(`No formal tool matched requested routes: ${selectedRoutes.join(', ')}`);
  if (!fs.existsSync(edge)) throw new Error(`Edge not found: ${edge}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(repo, 'output/playwright/tool-page-a11y', stamp);
  fs.mkdirSync(out, { recursive: true });
  const summary = {
    startedAt: new Date().toISOString(),
    baseline: runBaseline,
    axeVersion: require(path.join(deps, '@axe-core/playwright/package.json')).version,
    toolCount: tools.length,
    viewports,
    tools,
    records: [],
    tabChecks: [],
    passed: false,
    failures: [],
  };
  let server;
  let browser;
  try {
    server = spawn(process.execPath, [path.join(repo, 'serve-local.js'), '--no-open'], {
      cwd: repo,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const serverLog = fs.createWriteStream(path.join(out, 'server.log'));
    server.stdout.pipe(serverLog);
    server.stderr.pipe(serverLog);
    const baseUrl = await waitForServer(server);
    summary.baseUrl = baseUrl;
    browser = await chromium.launch({
      headless: true,
      executablePath: edge,
      args: ['--no-first-run', '--no-default-browser-check'],
    });

    for (const viewport of viewports) {
      for (const tool of tools) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        const page = await context.newPage();
        const errors = { console: [], page: [], http: [], requests: [] };
        page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
        page.on('pageerror', error => errors.page.push(error.stack || error.message));
        page.on('response', response => { if (response.status() >= 400) errors.http.push({ url: response.url(), status: response.status() }); });
        page.on('requestfailed', request => errors.requests.push({ url: request.url(), failure: request.failure()?.errorText || '' }));
        const requestedUrl = new URL(tool.href.replace(/^\//, ''), baseUrl).toString();
        const record = { viewport: viewport.name, ...tool, requestedUrl, status: null, finalUrl: '', title: '', durationMs: 0, violationCount: 0, seriousCount: 0, criticalCount: 0, seriousCritical: [], errors };
        const started = Date.now();
        try {
          const response = await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
          record.status = response?.status() ?? null;
          record.finalUrl = page.url();
          record.title = await page.title();
          await page.waitForTimeout(250);
          const axe = await new AxeBuilder({ page }).analyze();
          const severe = axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
          record.violations = axe.violations.map(violation => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.map(node => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })),
          }));
          record.violationCount = axe.violations.length;
          record.seriousCount = axe.violations.filter(item => item.impact === 'serious').length;
          record.criticalCount = axe.violations.filter(item => item.impact === 'critical').length;
          record.seriousCritical = severe.map(violation => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            helpUrl: violation.helpUrl,
            nodes: violation.nodes.map(node => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })),
          }));
          record.incompleteCount = axe.incomplete.length;
          record.passes = axe.passes.length;
          record.interactions = await verifyInteractions(page);
          if (record.interactions.checks.length) {
            summary.tabChecks.push({
              viewport: viewport.name,
              href: tool.href,
              title: record.title,
              groupCount: record.interactions.groupCount,
              checks: record.interactions.checks,
            });
          }
        } catch (error) {
          record.error = error.stack || String(error);
        }
        record.durationMs = Date.now() - started;
        summary.records.push(record);
        await context.close();
      }
    }

    summary.failures = summary.records.filter(record => record.status !== 200 || record.error
      || record.seriousCount > 0 || record.criticalCount > 0 || record.errors.page.length || record.errors.http.length
      || (record.interactions?.issues?.length || 0) > 0)
      .map(record => ({ viewport: record.viewport, title: record.title, href: record.href, status: record.status,
        seriousCount: record.seriousCount, criticalCount: record.criticalCount, error: record.error || null,
        violations: record.seriousCritical, interactionIssues: record.interactions?.issues || [], pageErrors: record.errors.page, httpErrors: record.errors.http }));
    summary.counts = {
      pageScans: summary.records.length,
      scansWithSerious: summary.records.filter(record => record.seriousCount > 0).length,
      scansWithCritical: summary.records.filter(record => record.criticalCount > 0).length,
      seriousNodes: summary.records.reduce((sum, record) => sum + record.seriousCritical.filter(item => item.impact === 'serious').reduce((n, item) => n + item.nodes.length, 0), 0),
      criticalNodes: summary.records.reduce((sum, record) => sum + record.seriousCritical.filter(item => item.impact === 'critical').reduce((n, item) => n + item.nodes.length, 0), 0),
    };
    summary.passed = runBaseline || summary.failures.length === 0;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise(resolve => { server.once('exit', resolve); setTimeout(resolve, 2500); });
    }
    summary.finishedAt = new Date().toISOString();
    writeJson(path.join(out, 'summary.json'), summary);
  }
  console.log(JSON.stringify({ output: out, toolCount: summary.toolCount, counts: summary.counts, tabChecks: summary.tabChecks.length, failures: summary.failures.length, baseline: runBaseline }));
  if (!summary.passed) process.exitCode = 1;
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
