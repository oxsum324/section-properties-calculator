'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = __dirname;
const playwright = [
  path.join(root, '鋼筋混凝土/tools/.column-testdeps/node_modules/playwright'),
  path.join(root, '.github/pages-smoke/node_modules/playwright'),
].find(candidate => fs.existsSync(path.join(candidate, 'package.json')));
if (!playwright) throw Error('Playwright dependency missing; run the desktop tool workflow setup.');
const { chromium } = require(playwright);
const port = 62092;
const cases = [
  ['鋼構工具/index.html', '[name=plateThickness]:visible', '#methodAsdBtn'],
  ['SRC工具/src-column.html', '#puTf'],
  ['鋼構工具/plate-check.html', '[name=plateThickness]:visible', '#methodAsdBtn'],
  ['鋼筋混凝土/tools/foundation.html', '#fc', 'button.mode-btn[data-mode=check]'],
  ['鋼筋混凝土/tools/beam.html', '#fc', 'button.mode-btn[data-mode=check]'],
  ['鋼筋混凝土/tools/column.html', '#fc', 'button.mode-btn[data-mode=check]'],
  ['RC補強斷面性質.html', '#b-b'],
  ['結構工具箱/tools/風力/wind-force.html', '#B'],
];

async function exercise(page, file, selector, modeSelector, mobile) {
  const url = 'http://127.0.0.1:' + port + '/' + file.split('/').map(encodeURIComponent).join('/');
  const banner = page.locator('.tool-draft-guard');
  const field = page.locator(selector).first();
  const click = locator => mobile ? locator.tap() : locator.click();
  const draftKey = 'tool-draft-guard:v1:' + new URL(url).pathname;

  await page.goto(url, {waitUntil:'load'});
  await banner.waitFor({state:'attached'});
  assert.equal(await banner.isHidden(), true);
  const initial = await field.inputValue();
  if (modeSelector) await click(page.locator(modeSelector));
  const edited = String(Number(await field.inputValue()) + 5);
  await field.fill(edited);
  await page.waitForFunction(key => Boolean(localStorage.getItem(key)), draftKey, {timeout:5000});
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey);
  assert.equal(saved.version, 1);
  const savedFields = saved.state.fields || Object.entries(saved.state);
  assert.equal(savedFields.some(([key]) => key.includes('"file"')), false);

  await page.reload({waitUntil:'load'});
  await banner.waitFor({state:'visible'});
  assert.equal(await field.inputValue(), initial, 'reload must keep the default until restore');
  assert.match(await banner.innerText(), /偵測到上次暫存草稿/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), mobile ? 390 : 1440);
  await page.emulateMedia({media:'print'});
  assert.equal(await banner.evaluate(node => getComputedStyle(node).display), 'none');
  await page.emulateMedia({media:'screen'});
  await click(banner.getByRole('button',{name:'恢復草稿'}));
  assert.equal(await field.inputValue(), edited);
  if (modeSelector) assert.ok(await page.locator(modeSelector).evaluate(button =>
    button.classList.contains('active') || button.getAttribute('aria-pressed') === 'true'));
  assert.equal(await banner.isHidden(), true);

  await page.reload({waitUntil:'load'});
  await banner.waitFor({state:'visible'});
  await click(banner.getByRole('button',{name:'清除'}));
  assert.equal(await page.evaluate(key => localStorage.getItem(key), draftKey), null);
  assert.equal(await field.inputValue(), initial, 'clear affects storage only');
  await page.reload({waitUntil:'load'});
  await banner.waitFor({state:'attached'});
  assert.equal(await banner.isHidden(), true);

  if (!mobile && file.startsWith('鋼構工具/')) {
    const legacyKey = file.endsWith('/plate-check.html') ? 'steel-plate-check-draft-v2' : 'steel-connection-suite-draft-v6';
    await page.evaluate(({key, state}) => localStorage.setItem(key, JSON.stringify({savedAt:new Date().toISOString(), state})),
      {key:legacyKey, state:saved.state});
    await page.reload({waitUntil:'load'});
    await banner.waitFor({state:'visible'});
    assert.equal(await field.inputValue(), initial, 'a legacy draft also requires explicit restore');
    await click(banner.getByRole('button',{name:'恢復草稿'}));
    assert.equal(await field.inputValue(), edited);
    await page.reload({waitUntil:'load'});
    await banner.waitFor({state:'visible'});
    await click(banner.getByRole('button',{name:'清除'}));
    assert.equal(await page.evaluate(key => localStorage.getItem(key), legacyKey), null);
  }
}

async function main() {
  const server = spawn(process.execPath, ['serve-local.js','--no-open',String(port)], {cwd:root,stdio:['ignore','pipe','inherit']});
  let browser;
  const failures = [];
  try {
    await new Promise((resolve,reject) => {
      const deadline = setTimeout(() => reject(Error('local server startup timeout')),8000);
      server.once('error',reject);
      server.once('exit',code => reject(Error('local server stopped '+code)));
      server.stdout.on('data', data => {
        if (data.toString().includes(':'+port)) {
          clearTimeout(deadline);
          resolve();
        }
      });
    });
    browser = await chromium.launch({channel:process.platform === 'win32' ? 'msedge' : undefined});
    for (const width of [1440,390]) for (const [file,selector,modeSelector] of cases) {
      const mobile = width === 390;
      const context = await browser.newContext({viewport:{width,height:900},isMobile:mobile,hasTouch:mobile});
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(5500);
        await exercise(page,file,selector,modeSelector,mobile);
        console.log('PASS '+file+' '+width);
      } catch (error) {
        failures.push(file + ' ' + width + '\n' + error.message);
      } finally {
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  if (failures.length) throw Error(failures.join('\n\n'));
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
