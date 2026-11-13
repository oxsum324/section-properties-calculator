const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process'),{createInterface}=require('node:readline');
const root=path.resolve(__dirname,'..');
const {chromium}=require(path.join(root,'output/playwright/phase2-quality-deps/node_modules/playwright'));
const ref=require('./fixtures/sonreb-reference.json');
const out=path.resolve(process.env.SONREB_OUT||path.join(root,'output/playwright/sonreb'));
async function main(){
  await fs.mkdir(out,{recursive:true});
  const server=spawn(process.execPath,['serve-local.js','--no-open','--route','/concrete-strength-ndt'],{cwd:root,stdio:['ignore','pipe','inherit'],windowsHide:true});
  let browser;
  try{
    const url=await new Promise((resolve,reject)=>{const lines=createInterface({input:server.stdout});lines.on('line',s=>{const m=s.match(/listening on (http:\/\/\S+)/);if(m){lines.close();resolve(m[1]);}});
      server.once('error',reject);server.once('exit',c=>reject(Error('server '+c)));});
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);assert.equal(await page.locator('#sonrebFrame').getAttribute('src'),null);
    const parent=await page.locator('#bannerStatus').innerText();
    assert.equal(await page.locator('#sonrebDialog [data-project-meta-save]').count(),0);
    await page.locator('#openSonReb').click();const ui=page.frameLocator('#sonrebFrame'),f=id=>ui.locator('#'+id);
    const addr=await f('project').evaluate(e=>e.ownerDocument.location.href);
    const read=async(id,name)=>{
      const pending=page.waitForEvent('download');await f(id).click();const download=await pending;const file=path.join(out,name);await download.saveAs(file);
      return JSON.parse(await fs.readFile(file,'utf8'));
    };
    await f('fromPage').click();assert.match(await f('status').innerText(),/已帶入/);
    const draft=await read('draft','主頁原始量測.json');
    assert.ok(draft.sourceSnapshot.methods.rebound[0].rawReadings.length);
    const imported=draft.table.split('\n').slice(1).map(l=>l.split('\t'));
    assert.ok(imported.every(r=>!r[1]&&!r[3]));assert.ok(imported.filter(r=>r[4]==='C').every(r=>!r[7]));
    await f('example').click();await f('replace').getByRole('button',{name:'保留目前資料'}).click();assert.equal(await f('data').inputValue(),draft.table);
    await f('example').click();await f('replace').getByRole('button',{name:'取代資料'}).click();
    await f('fit').click();assert.match(await f('external').innerText(),/33\.634/);assert.match(await f('external').innerText(),/外插/);
    const raw=await f('data').inputValue();
    await f('selectedZone').fill('Z09');assert.equal(await f('save').isDisabled(),true);
    await f('selectedMpa').fill('30');await f('reason').fill('合成演練，由覆核者指定');assert.equal(await f('save').isDisabled(),false);
    const first=await read('save','同測區校正紀錄.json');assert.equal(first.result.loo.length,8);
    for(const [i,e] of first.result.external.entries())assert.ok(Math.abs(e.medianMpa-ref.externalHoldout[i].medianMpa)<1e-5);
    assert.match(await f('sampling').innerText(),/8 個位置/);
    await f('plot').screenshot({path:path.join(out,'校正範圍.png')});
    const other=raw.split('\n').slice(1).map(l=>{const a=l.split('\t');a[0]='M2';if(a[4]==='C'){a[5]='M2-'+a[5];a[6]=String(Number(a[6])*2);}return a.join('\t');});
    await f('data').fill(raw+'\n'+other.join('\n'));assert.equal(await f('result').isVisible(),false);await f('prepare').click();
    await f('group').selectOption({index:1});await f('fit').click();assert.match(await f('external').innerText(),/67\.268/);assert.equal(await f('selectedMpa').inputValue(),'');
    await f('data').fill(raw.split('\n').filter(l=>!(l.includes('\tZ01\t')&&l.includes('\tV\t'))).join('\n'));
    await f('prepare').click();await f('fit').click();assert.match(await f('status').innerText(),/待補/);assert.equal(await f('result').isVisible(),false);
    const tampered={...first,result:{model:{nCores:999}}};
    await f('file').setInputFiles({name:'重算.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tampered))});
    await f('replace').getByRole('button',{name:'取代資料'}).click();await f('result').waitFor();
    const restored=await read('save','讀回重算.json');assert.deepEqual(restored.result,first.result);assert.deepEqual(restored.adoptions,first.adoptions);
    await page.setViewportSize({width:390,height:844});
    const viewport=await f('result').evaluate(e=>({width:e.ownerDocument.documentElement.clientWidth,scroll:e.ownerDocument.documentElement.scrollWidth}));
    assert.ok(viewport.scroll<=viewport.width+1,JSON.stringify(viewport));await f('plot').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'手機校正.png')});
    await page.locator('#sonrebDialog button').click();assert.equal(await page.locator('#bannerStatus').innerText(),parent);
    await page.goto(addr);await page.locator('#file').setInputFiles(path.join(out,'同測區校正紀錄.json'));await page.locator('#result').waitFor();
    await page.evaluate(()=>window.print=()=>document.body.dataset.print='yes');await page.locator('#print').click();assert.equal(await page.locator('body').getAttribute('data-print'),'yes');
    await page.setViewportSize({width:1280,height:900});await page.pdf({path:path.join(out,'同測區校正內部紀錄.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true});
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(out,'browser.json'),JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),clean:!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),
      viewport,errors,sourceRows:imported.length,replayed:true,external:first.result.external,sampling:first.result.reboundCoverage},null,2));
    console.log('PASS 主頁、條件隔離、整區驗證、缺值、採用紀錄、讀回重算、手機及 PDF');
  }finally{if(browser)await browser.close();server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
