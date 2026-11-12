const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..', '結構工具箱');
const main = 'a'.repeat(40), old = 'b'.repeat(40);

async function mainTest() {
  const browser = await chromium.launch({ headless:true, channel:process.platform === 'win32' ? 'msedge' : undefined });
  try {
    const page = await browser.newPage();
    let live = main, responseStatus = 200, expectedRef = 'refs/heads/master';
    await page.route('https://tool.invalid/**', route => {
      const name = new URL(route.request().url()).pathname;
      if (name === '/platform-status.html' || name === '/assets/status/publication-status.js') {
        return route.fulfill({ contentType:name.endsWith('js')?'application/javascript':'text/html; charset=utf-8',
          body:fs.readFileSync(path.join(root,name.slice(1))) });
      }
      return route.fulfill({ status:204 });
    });
    await page.route('https://api.github.com/**', route => route.fulfill({ json:{ref:expectedRef,object:{type:'commit',sha:main}} }));
    await page.route('https://oxsum324.github.io/**', route => route.fulfill({ status:responseStatus,
      json:{kind:'pages-deployment',sourceRef:'refs/heads/master',sourceDirty:false,commitSha:live,
        releaseEvidence:{sourceCommitSha:old}} }));
    const state = page.locator('#publicationState');
    const refresh = page.locator('#refreshPublicationStatus');
    const compare = page.locator('#publicationCompare');
    async function expect(label) {
      await page.waitForFunction(value => !document.getElementById('refreshPublicationStatus').disabled
        && document.querySelector('#publicationState span').textContent === value,label);
    }
    await page.goto('https://tool.invalid/platform-status.html');
    await expect('版本一致');
    assert.equal(await compare.isVisible(),false);
    live = old;
    await refresh.click();
    await expect('主線與公開站版本不一致');
    assert.match(await compare.getAttribute('href'),new RegExp('/compare/'+old+'\\.\\.\\.'+main+'$'));
    responseStatus = 503;
    await refresh.click();
    await expect('無法核對');
    assert.match(await state.innerText(),/HTTP 503/);
    assert.equal(await compare.isVisible(),false);
    responseStatus = 200;
    expectedRef = 'refs/heads/dev';
    await refresh.click();
    await expect('無法核對');
    assert.match(await state.innerText(),/來源或提交識別無法確認/);
    console.log('PASS matching carrier, drift, 503, recovery and non-master ref handling');
  } finally { await browser.close(); }
}
mainTest().catch(error=>{ console.error(error);process.exitCode=1; });
