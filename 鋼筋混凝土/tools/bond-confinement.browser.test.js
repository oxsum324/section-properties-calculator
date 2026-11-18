'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const bondScript = '**/bond-confinement.js?*';
const tools = [
  { name:'beam', api:'Beam', status:'#beamProjectStatus' },
  { name:'column', api:'Column', status:'#projectFileStatus' },
  { name:'wall', api:'Wall', status:'#wallProjectStatus' },
];
const host = '[data-bond-confinement]';

function startServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local server did not start')), 15000);
    child.once('error', reject);
    child.stdout.on('data', chunk => {
      const match = chunk.toString().match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });
  });
}

function monitor(page) {
  const errors = [];
  const loads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/bond-confinement.js')) loads.push(request.url());
  });
  return { errors, loads };
}

async function collect(page, api) {
  return page.evaluate(api => window['collect' + api + 'ProjectData'](), api);
}

async function waitForStatus(page, selector, text) {
  await page.waitForFunction(({ selector, text }) => document.querySelector(selector)?.textContent.includes(text), { selector, text });
}

async function setAllPlanes(page) {
  await page.evaluate(hostSelector => {
    const host = document.querySelector(hostSelector);
    const add = [...host.querySelectorAll('button')].find(button => button.textContent === '新增劈裂面');
    add.click();
    const groups = [...host.querySelector('[data-bond-key="group"]').options].map(option => option.value);
    for (let i = 1; i < groups.length; i++) add.click();
    for (let i = 0; i < groups.length; i++) {
      function set(key, value, type = 'input') {
        const field = host.querySelectorAll('fieldset')[i].querySelector('[data-bond-key="' + key + '"]');
        field.value = value;
        field.dispatchEvent(new Event(type, { bubbles:true }));
      }
      set('group', groups[i], 'change');
      set('site', '本機測試面 ' + (i + 1));
      if (host.querySelector('[data-bond-key="pitch"]')) set('pitch', '10');
      set('method', 'project', 'change');
      set('ktr', '2.5');
      set('source', '試算資料');
    }
    const confirmation = host.querySelector('[type="checkbox"]');
    if (confirmation.disabled) throw new Error('Complete Ktr rows must enable confirmation: ' + host.textContent);
    confirmation.checked = true;
    confirmation.dispatchEvent(new Event('input', { bubbles:true }));
  }, host);
}

async function exercise(browser, base, { name, api, status }) {
  const url = base + '/' + encodeURI('鋼筋混凝土/tools/' + name + '.html');
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    const diagnostics = monitor(page);
    let blockedRoute;
    if (name === 'beam') {
      await page.route(bondScript, route => {
        if (new URL(route.request().url()).searchParams.has('retry')) return route.continue();
        blockedRoute = route;
      });
    }
    await page.goto(url, { waitUntil:'networkidle' });
    assert.equal(diagnostics.loads.length, 0, name + ' ordinary grade does not request Ktr');
    assert.equal(await page.locator(host).getAttribute('hidden'), '');

    await page.locator('#fy').fill('5600');
    if (name === 'beam') {
      await page.waitForFunction(sel => document.querySelector(sel)?.textContent.includes('載入中'), host);
      await page.evaluate(() => document.getElementById('btnReport').click());
      await waitForStatus(page, status, '載入中');
      assert.equal(ctx.pages().length, 1, 'report stays closed while loading Ktr');
      assert.equal(diagnostics.loads.length, 1, 'concurrent recalculations share one request');
      await blockedRoute.fulfill({ status:503 });
      await page.waitForFunction(sel => document.querySelector(sel)?.textContent.includes('載入失敗'), host);
      await page.evaluate(sel => document.querySelector(sel + ' button').click(), host);
    }

    await page.waitForFunction(sel => document.querySelector(sel)?.textContent.includes('新增劈裂面'), host);
    assert.equal(diagnostics.loads.length, name === 'beam' ? 2 : 1);
    if (name === 'beam') await page.unroute(bondScript);
    await setAllPlanes(page);
    const saved = await collect(page, api);
    const planes = JSON.parse(saved.fields.bondPlaneData.value);
    assert.match(planes.confirmed, /^\[/);
    assert(planes.rows.length > 0);
    await page.evaluate(api => window['save' + api + 'ProjectDraft'](), api);
    const reportPopup = page.waitForEvent('popup');
    await page.evaluate(() => document.getElementById('btnReport').click());
    const report = await reportPopup;
    await report.locator('.rep-paper').waitFor();
    const text = await report.locator('.rep-paper').innerText();
    assert(text.includes('橫向圍束 Ktr') && text.includes('本機測試面 1'), name + ' Ktr in calculation report');
    await report.close();

    await page.reload({ waitUntil:'networkidle' });
    assert.equal(await page.locator('#fy').inputValue(),'4200');
    await page.evaluate(api => window['load' + api + 'ProjectDraft'](), api);
    assert.equal((await collect(page, api)).calculationFingerprint,saved.calculationFingerprint, name + ' cold draft replay');
    assert.equal(await page.locator('#bondPlaneData').inputValue(), saved.fields.bondPlaneData.value);

    const filePage = await ctx.newPage();
    const fileDiagnostics = monitor(filePage);
    await filePage.goto(url,{ waitUntil:'networkidle' });
    assert.equal(fileDiagnostics.loads.length,0);
    const file = { name:name + '-project.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(saved)) };
    const input = filePage.locator('#' + name + 'ProjectFile');
    if (name === 'beam') {
      await filePage.route(bondScript, route => route.fulfill({ status:503 }), { times:1 });
      await input.setInputFiles(file);
      await waitForStatus(filePage,status,'已保留原輸入');
      await filePage.waitForFunction(() => !document.getElementById('beamProjectFile').value);
      assert.equal(await filePage.locator('#fy').inputValue(),'4200');
      assert.equal(await filePage.locator('#bondPlaneData').inputValue(),'');
    }
    await input.setInputFiles(file);
    await waitForStatus(filePage,status,saved.calculationFingerprint);
    assert.equal(fileDiagnostics.loads.length,name === 'beam' ? 2 : 1);
    assert.equal((await collect(filePage,api)).calculationFingerprint,saved.calculationFingerprint, name + ' cold file replay');
    assert.deepEqual([...diagnostics.errors, ...fileDiagnostics.errors], []);
    console.log('PASS', name, 'ordinary grade, Ktr report, file and draft replay', saved.calculationFingerprint);
  } finally {
    await ctx.close();
  }
}

async function main() {
  const server = spawn(process.execPath, [path.join(root, 'serve-local.js'), '--no-open'], {
    cwd:root, windowsHide:true, stdio:['ignore','pipe','inherit']
  });
  let browser;
  try {
    const base = await startServer(server);
    const browserType = process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : { channel:'msedge' };
    browser = await chromium.launch({ headless:true, args:['--disable-popup-blocking'], ...browserType });
    for (const tool of tools) await exercise(browser,base,tool);
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) server.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
