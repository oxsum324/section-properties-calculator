const assert=require('node:assert/strict'), fs=require('node:fs/promises'), path=require('node:path');
const {spawn,execFileSync}=require('node:child_process'),{createInterface}=require('node:readline');
const root=path.resolve(__dirname,'..');
const {chromium}=require(path.join(root,'output/playwright/phase2-quality-deps/node_modules/playwright'));
const out=process.env.COVER_BIAXIAL_EVIDENCE || path.join(root,'output/playwright/column-cover-biaxial');
async function run(){
  await fs.mkdir(out,{recursive:true});
  const server=spawn(process.execPath,['serve-local.js','--no-open','--route','/rc-column-cover-deviation'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','inherit']});
  let browser;
  try{
    const url=await new Promise((resolve,reject)=>{const lines=createInterface({input:server.stdout});
      lines.on('line',line=>{const m=line.match(/listening on (http:\/\/\S+)/);if(m){lines.close();resolve(m[1]);}});
      server.once('error',reject);server.once('exit',c=>reject(Error('serve-local '+c)));});
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(url);
    assert.equal(await page.locator('#coverBiaxialFrame').getAttribute('src'),null);
    const p1=await page.locator('#bannerStatus').innerText();
    await page.locator('#openBiaxial').click();
    const ui=page.frameLocator('#coverBiaxialFrame'),f=id=>ui.locator('#'+id);
    const runCase=()=>f('calculate').click();
    const snapshot=async name=>{
      const pending=page.waitForEvent('download');await f('save').click();const download=await pending;
      const file=path.join(out,name);await download.saveAs(file);return JSON.parse(await fs.readFile(file,'utf8'));
    };
    await f('seed').click();assert.match(await f('designBars').inputValue(),/圖說推定/);
    for(const key of ['observedBars','pTf','mxTfm','myTfm','demandBasis'])assert.equal(await f(key).inputValue(),'');
    await f('example').click();await runCase();
    const original=await snapshot('設計軸力30度.json');
    const ref=require('./fixtures/column-cover-biaxial.json').cases.find(c=>c.mode==='design'&&c.angle===30&&c.pTf===60);
    assert.ok(Math.abs(original.result.observed.capacityTfm-ref.observed.capacityTfm)<.0002);
    await f('results').screenshot({path:path.join(out,'雙軸比較.png')});
    await f('mode').selectOption('nominal');assert.equal(await f('save').isDisabled(),true);
    await runCase();const nominal=await snapshot('名義軸力30度.json');
    assert.ok(Math.abs(nominal.result.observed.capacityTfm-51.0421419139)<1e-6);
    await f('mode').selectOption('design');await f('mxTfm').fill(String(-40/Math.sqrt(2)));await f('myTfm').fill(String(40/Math.sqrt(2)));await runCase();
    const multiple=await snapshot('正負彎矩多交點.json');assert.equal(multiple.result.observed.ok,null);
    assert.match(await f('solutions').innerText(),/39\.96221/);
    await f('observedBars').fill('');await runCase();assert.match(await f('status').innerText(),/待補/);
    assert.equal(await f('save').isDisabled(),true);assert.equal(await f('results').isVisible(),false);
    await f('load').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...original,result:{observed:{ok:false}}}))});
    await f('results').waitFor();const restored=await snapshot('讀回重算.json');assert.deepEqual(restored.result,original.result);
    await page.setViewportSize({width:390,height:844});
    const mobile=await f('results').evaluate(el=>({scroll:el.ownerDocument.documentElement.scrollWidth,view:el.ownerDocument.documentElement.clientWidth}));
    assert.ok(mobile.scroll<=mobile.view+1,JSON.stringify(mobile));await f('results').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'手機比較.png')});
    const direct=await f('results').evaluate(el=>el.ownerDocument.location.href);
    await page.locator('#coverBiaxialDialog button').click();assert.equal(await page.locator('#bannerStatus').innerText(),p1);
    await page.locator('#openBiaxial').click();assert.equal(await f('save').isDisabled(),false);
    await page.goto(direct);await page.locator('#load').setInputFiles(path.join(out,'設計軸力30度.json'));await page.locator('#results').waitFor();
    await page.evaluate(()=>{window.print=()=>document.body.dataset.printCalled='yes';});
    await page.locator('#print').click();assert.equal(await page.locator('body').getAttribute('data-print-called'),'yes');
    await page.setViewportSize({width:1280,height:900});await page.pdf({path:path.join(out,'逐筋雙軸比較.pdf'),format:'A4',printBackground:true,margin:{top:'12mm',bottom:'12mm',left:'12mm',right:'12mm'}});
    assert.deepEqual(errors,[]);
    const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),clean=!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();
    await fs.writeFile(path.join(out,'browser.json'),JSON.stringify({head,clean,mobile,errors,design:original.result,nominal:nominal.result,multiple:multiple.result.observed,
      clearedMissing:true,restoredExact:true,parentUnchanged:true},null,2));
    console.log('PASS 逐筋輸入、讀回、同組內力、雙解待核、缺值、390px、列印與單筆隔離');
  }finally{if(browser)await browser.close();server.kill();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
