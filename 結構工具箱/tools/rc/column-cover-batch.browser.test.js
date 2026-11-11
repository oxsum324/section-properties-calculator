'use strict';
// node 結構工具箱/tools/rc/column-cover-batch.browser.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const root = path.resolve(__dirname,'../../..');
const {chromium} = require(path.join(root,'output/playwright/phase2-quality-deps/node_modules/playwright'));
const golden = require('./column-cover-deviation-golden-cases.js');
const fixture = path.join(root,'結構工具箱/tests/column-cover-batch-sample.tsv');

async function run() {
  const evidenceDir = path.join(root,'output/playwright/column-cover-batch');
  await fs.mkdir(evidenceDir,{recursive:true});
  const work = await fs.mkdtemp(path.join(evidenceDir,'run-'));
  const sample = (await fs.readFile(fixture,'utf8')).trimEnd().replace(/\r\n/g,'\n');
  const grid = sample.split('\n').map(line => line.split('\t'));
  const server = spawn(process.execPath,['serve-local.js','--no-open','--route','/rc-column-cover-deviation'],{cwd:root,stdio:['ignore','pipe','inherit'],windowsHide:true});
  let browser;
  try {
    const url = await new Promise((resolve,reject) => {
      const lines = createInterface({input:server.stdout});
      lines.on('line', line => {
        const found = line.match(/listening on (http:\/\/\S+)/);
        if (found) {lines.close();resolve(found[1]);}
      });
      server.once('error',reject);server.once('exit', code => reject(Error('serve-local exited '+code)));
    });
    browser = await chromium.launch({channel:'msedge',headless:true});
    const context = await browser.newContext({viewport:{width:1400,height:920}});
    await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(url).origin});
    const page = await context.newPage();
    await page.goto(url);
    const scriptErrors = [];
    page.on('pageerror', e => scriptErrors.push(e.message));
    async function download(button,name) {
      const promise=page.waitForEvent('download');
      await button.click();
      const file=await promise;
      await file.saveAs(path.join(work,name));
      return JSON.parse(await fs.readFile(path.join(work,name),'utf8'));
    }
    const readClipboard = () => page.evaluate(() => navigator.clipboard.readText());
    const before = await download(page.getByRole('button',{name:'另存案件 JSON'}),'before.json');
    await page.getByRole('button',{name:'批次檢核',exact:true}).click();
    const frame=page.frameLocator('#coverBatchFrame');
    await frame.getByRole('button',{name:'複製空白表頭'}).click();
    await frame.locator('#notice').filter({hasText:'已複製表頭'}).waitFor();
    assert.equal(await readClipboard(),grid[0].join('\t'));
    const input=frame.locator('#paste');
    async function paste(text) {
      await page.evaluate(value => navigator.clipboard.writeText(value),text);
      await input.focus(); await input.press('Control+a');await input.press('Control+v');
      assert.equal(await input.inputValue(),text);
      assert.ok(await frame.locator('#run').isDisabled());
      assert.equal(await frame.locator('#output').isVisible(),false);
    }
    async function calculate() {
      await frame.getByRole('button',{name:'預覽對欄'}).click();
      assert.ok(await frame.locator('#rawTable table').isVisible());
      await frame.getByRole('button',{name:'執行批次檢核'}).click();
    }
    await paste(sample);await calculate();
    const counts=await frame.locator('#summary').innerText();
    assert.match(counts,/共 4 列\s+通過 2\s+未通過 1\s+待補 1\s+錯列 0/);
    const last=frame.locator('#resultTable tbody tr').nth(3).locator('td');
    assert.equal(await last.nth(7).textContent(),'待補');
    for(const c of [8,9,10,11])assert.equal(await last.nth(c).textContent(),'');
    await frame.getByRole('button',{name:'複製結果至 Excel'}).click();
    await frame.locator('#notice').filter({hasText:'已複製結果'}).waitFor();
    const resultsTsv=await readClipboard();
    assert.equal(resultsTsv.split(/\r?\n/).length,5);await fs.writeFile(path.join(work,'results.tsv'),resultsTsv);
    await frame.getByRole('button',{name:'複製待補與錯列'}).click();
    await frame.locator('#notice').filter({hasText:'已複製待補與錯列'}).waitFor();
    const errorsTsv=await readClipboard();
    assert.match(errorsTsv,/C04[^\r\n]+實測上_mm\t\t缺少必填值/);
    await fs.writeFile(path.join(work,'errors.tsv'),errorsTsv);
    const audit = await download(frame.locator('#export'),'batch.json');
    assert.equal(audit.rows[3].raw.measuredTopMm,'');assert.equal(audit.rows[3].result,null);
    await page.screenshot({path:path.join(work,'review.png')});
    // 測實際選檔，CSV 含引號內逗號、雙引號與換行；TSV 保留空格。
    for(const ext of ['csv','tsv']) {
      const sep=ext==='csv' ? ',' : '\t';
      const text=grid.map((row,i) => row.map((v,k) => {
        if(ext==='csv' && i===1 && k===11) v+='，記號 "A",B\n複核';
        return '"'+v.replaceAll('"','""')+'"';
      }).join(sep)).join('\r\n');
      await frame.locator('#file').setInputFiles({name:'試辦.'+ext,mimeType:'text/plain',buffer:Buffer.from('\uFEFF'+text)});
      await calculate();
      assert.equal(await frame.locator('#summary').innerText(),counts);
      const fileAudit=await download(frame.locator('#export'),'import-'+ext+'.json');
      assert.equal(fileAudit.source,'試辦.'+ext);
      assert.deepEqual(fileAudit.rows.map(r=>r.status),audit.rows.map(r=>r.status));
      if(ext==='csv')assert.ok(fileAudit.rows[0].result.input.materialBasis.endsWith('記號 "A",B\n複核'));
    }
    const fixed=grid.map(row=>row.slice());
    fixed[4][22]='80';
    await paste(fixed.map(row=>row.join('\t')).join('\n'));await calculate();
    assert.match(await frame.locator('#summary').innerText(),/共 4 列\s+通過 3\s+未通過 1\s+待補 0/);
    await page.getByRole('button',{name:'返回單筆頁'}).click();
    const after=await download(page.getByRole('button',{name:'另存案件 JSON'}),'after.json');
    assert.deepEqual(after.input,before.input);assert.equal(after.calculationFingerprint,before.calculationFingerprint);
    // 單筆端依既有黃金案例與規格原始文字產生輸入，不使用批次對欄器。
    const comparisons=[], differences=[];
    for(let i=0;i<3;i++) {
      const original=grid[i+1],id=original[2];
      const singleInput={...golden[i].input,sectionDimensionBasis:original[8],materialBasis:original[11],measurementBasis:original[26],demandBasis:original[32]};
      await page.locator('#projNo').fill(original[0]);
      for(const [key,value] of Object.entries(singleInput)) {
        const field=page.locator('#'+key);
        if(await field.inputValue()===String(value)) continue;
        if(key==='measurementMode')await field.selectOption(value);
        else await field.fill(String(value));
      }
      await page.getByRole('button',{name:'計算斷面強度偏差'}).click();
      const single=await download(page.getByRole('button',{name:'另存案件 JSON'}),id+'-single.json');
      const b=audit.rows.find(row => row.raw.columnId===id && row.raw.caseNo===original[0] &&
        row.raw.floor===original[1] && row.raw.revision===original[3] &&
        row.raw.demandId===original[4] && row.raw.sourceRow===original[5]);
      assert.ok(b,'批次與單筆識別鍵及來源列應可配對：'+id);
      assert.deepEqual(single.input,singleInput);
      function compare(field, a, s) {
        if(s && typeof s==='object') {
          const keys=new Set([...Object.keys(s),...Object.keys(a ?? {})]);
          for(const key of keys) compare(field+'.'+key,a?.[key],s[key]);
          return;
        }
        if(a!==s) differences.push({id,sourceRow:b.raw.sourceRow,field,batch:a,single:s,
          difference:typeof a==='number' && typeof s==='number' ? a-s : null});
      }
      compare('result',b.result,single.result);
      comparisons.push({id,sourceRow:b.raw.sourceRow,status:b.status,minimumRetentionRatio:b.result.minimumRetentionRatio,
        maximumMeasuredUtilization:b.result.maximumMeasuredUtilization,criticalRetentionDirection:b.result.criticalRetentionDirection,
        governingDemandDirection:b.result.governingDemandDirection,core:single.tool.calculationEngine});
    }
    const receipt={counts,comparisons,differences,missing:audit.rows[3],timings:audit.timings,scriptErrors};
    await fs.writeFile(path.join(work,'comparison.json'),JSON.stringify(receipt,null,2));
    assert.deepEqual(differences,[]);assert.deepEqual(scriptErrors,[]);
    console.log(work);console.table(comparisons);console.log(counts,'；逐欄差異 0。');
  } finally {
    try {if(browser) await browser.close();} finally {server.kill();}
  }
}
run().catch(error => {console.error(error);process.exitCode=1;});
