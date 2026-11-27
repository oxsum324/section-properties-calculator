'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = __dirname;
const playwrightPath = [
  path.join(root, '鋼筋混凝土/tools/.column-testdeps/node_modules/playwright'),
  path.join(root, '.github/pages-smoke/node_modules/playwright'),
  path.join(root, 'output/playwright/phase2-quality-deps/node_modules/playwright'),
].find(candidate => fs.existsSync(path.join(candidate, 'package.json')));
if (!playwrightPath) throw new Error('Playwright dependency missing; use the desktop browser setup.');
const { chromium } = require(playwrightPath);
const port = 62089;
const origin = 'http://127.0.0.1:' + port;

function url(relative) {
  return origin + '/' + relative.split('/').map(encodeURIComponent).join('/');
}

async function download(page, button, mobile) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    mobile ? button.tap() : button.click(),
  ]);
  return JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
}

async function upload(page, button, payload, mobile) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    mobile ? button.tap() : button.click(),
  ]);
  await chooser.setFiles({
    name: 'wave3-test-case.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}

async function checkPrint(page, panel) {
  const element = await panel.elementHandle();
  await page.emulateMedia({media:'print'});
  assert.ok(await element.evaluate(current => {
    for (let node = current; node; node = node.parentElement) {
      if (getComputedStyle(node).display === 'none') return true;
    }
    return false;
  }), 'case actions stay outside printing');
}

async function openTokenPage(page, relative, diagram) {
  await page.goto(url(relative), {waitUntil:'load'});
  const tokens = page.locator('link[href$="/colors_and_type.css"]');
  assert.ok(await tokens.evaluate(link => Boolean(link.sheet?.cssRules.length)));
  if (diagram) {
    const svg = page.locator(diagram);
    await svg.waitFor({state:'visible'});
    const bounds = await svg.boundingBox();
    assert.ok(bounds.width > 0 && bounds.height > 0);
  }
}

async function verifyStm(page, name, mobile) {
  await openTokenPage(page, '鋼筋混凝土/tools/' + name + '.html', '#stmDiagram svg');
  const panel = page.locator('[data-stm-case]');
  const exportButton = panel.locator('[data-stm-case-export]');
  const importButton = panel.locator('[data-stm-case-import]');
  const applyButton = panel.locator('[data-stm-case-apply]');
  const status = panel.locator('[data-stm-case-status]');
  const depth = page.locator('#h');

  if (name === 'foundation-deep-beam-stm') {
    await page.locator('#reactionMode').selectOption('pile-group');
    await page.locator('#tieRows').fill('4');
    await page.locator('#tieCount').fill('24');
    await page.locator('#pileSupportWidth').fill('158');
  }
  await depth.fill('435');
  await page.locator('#projName').fill('STM 案件往返測試');
  const original = await download(page, exportButton, mobile);
  assert.equal(original.schema, 'tool-project-storage.v1');
  assert.equal(original.tool.id, 'rc-' + name);
  assert.equal(original.fields.h.value, '435');

  if (name === 'foundation-deep-beam-stm') await page.locator('#reactionMode').selectOption('soil-uniform');
  await depth.fill('310');
  const invalid = structuredClone(original);
  invalid.fields.fc.value = '錯誤欄位';
  await upload(page, importButton, invalid, mobile);
  await status.filter({hasText:'已保留原輸入'}).waitFor({state:'visible'});
  assert.equal(await depth.inputValue(), '310');
  assert.equal(await applyButton.isHidden(), true);

  await upload(page, importButton, original, mobile);
  await applyButton.waitFor({state:'visible'});
  assert.equal(await depth.inputValue(), '310', 'no overwrite before confirmation');
  await (mobile ? applyButton.tap() : applyButton.click());
  await status.filter({hasText:'已套用案件'}).waitFor({state:'visible'});
  assert.equal(await depth.inputValue(), '435');
  if (name === 'foundation-deep-beam-stm') {
    assert.equal(await page.locator('#pilePanel').isVisible(), true);
    assert.equal(await page.locator('#soilPanel').isHidden(), true);
  }
  const restored = await download(page, exportButton, mobile);
  assert.deepEqual(restored.fields, original.fields);
  await checkPrint(page,panel);
}

async function verifyAnchor(page, mobile) {
  await page.goto(url('anchor/'), {waitUntil:'load'});
  const panel = page.getByRole('group', {name:'案件 JSON'});
  const exportButton = panel.getByRole('button', {name:'匯出本案 JSON'});
  const importButton = panel.getByRole('button', {name:'匯入案件 JSON'});
  const name = page.locator('.toolbar').getByLabel('案例名稱');
  await name.fill('錨栓案件往返測試');
  const original = await download(page, exportButton, mobile);
  assert.equal(original.version, 2);
  assert.equal(original.projects.length, 1);
  assert.ok(original.caseReplay);
  assert.equal(original.projects[0].name, '錨栓案件往返測試');

  await name.fill('畫面既有案例');
  await upload(page, importButton, {...original, version:999}, mobile);
  await panel.getByRole('status').filter({hasText:'已保留原工作區'}).waitFor({state:'visible'});
  assert.equal(await name.inputValue(), '畫面既有案例');

  await upload(page, importButton, original, mobile);
  await panel.getByRole('status').filter({hasText:'已匯入'}).waitFor({state:'visible'});
  await page.waitForFunction(element => element.value.includes('錨栓案件往返測試'), await name.elementHandle());
  const restored = await download(page, exportButton, mobile);
  for (const key of ['ruleProfileId', 'layout', 'loads']) {
    assert.deepEqual(restored.projects[0][key], original.projects[0][key], key);
  }
  await checkPrint(page,panel);
}

async function main() {
  let browser;
  const server = spawn(process.execPath, ['serve-local.js', '--no-open', String(port)], {cwd:root, stdio:['ignore','pipe','inherit']});
  try {
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(Error('local server startup timeout')),8000);
      server.once('error',reject);
      server.once('exit',code => reject(Error('local server stopped '+code)));
      server.stdout.on('data', data => {
        if (data.toString().includes(':'+port)) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    browser = await chromium.launch({channel:process.platform === 'win32' ? 'msedge' : undefined});
    for (const width of [1440,390]) {
      const mobile = width === 390;
      const cases = [
        ['rc-index', page => openTokenPage(page,'鋼筋混凝土/index.html')],
        ['deep-beam-stm', page => verifyStm(page,'deep-beam-stm',mobile)],
        ['foundation-deep-beam-stm', page => verifyStm(page,'foundation-deep-beam-stm',mobile)],
        ['pile-cap-3d-stm', page => openTokenPage(page,'鋼筋混凝土/tools/pile-cap-3d-stm.html','#planDiagram svg')],
        ['anchor', page => verifyAnchor(page,mobile)],
      ];
      for (const [key, verify] of cases) {
        const context = await browser.newContext({viewport:{width,height:900},isMobile:mobile,hasTouch:mobile});
        const page = await context.newPage();
        page.setDefaultTimeout(9000);
        try {
          await verify(page);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
          console.log('PASS '+ key + ' '+width);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
