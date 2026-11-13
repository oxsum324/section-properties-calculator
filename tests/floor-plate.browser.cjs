const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process'),{createInterface}=require('node:readline');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.FLOOR_PLATE_OUT||path.join(root,'output/playwright/floor-plate'));
const {chromium}=require(path.join(root,'output/playwright/phase2-quality-deps/node_modules/playwright'));
async function main(){
  await fs.mkdir(out,{recursive:true});
  const server=spawn(process.execPath,['serve-local.js','--no-open','--route','/floor-slab-westergaard'],{cwd:root,stdio:['ignore','pipe','inherit'],windowsHide:true});
  let browser;
  try{
    const url=await new Promise((res,rej)=>{const lines=createInterface({input:server.stdout});
      lines.on('line',s=>{const m=s.match(/listening on (http:\/\/\S+)/);if(m){lines.close();res(m[1]);}});server.once('error',rej);server.once('exit',c=>rej(Error('server '+c)));});
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);assert.equal(await page.locator('#plateFrame').getAttribute('src'),null);
    const parent=await page.locator('#bannerStatus').innerText();
    await page.locator('#openPlate').click();const ui=page.frameLocator('#plateFrame'),f=id=>ui.locator('#'+id);
    const direct=await f('width').evaluate(el=>el.ownerDocument.location.href);
    await f('parentInput').click();assert.equal(await f('hMm').inputValue(),'180');assert.equal(await f('width').inputValue(),'');
    const source=await f('loads').inputValue(),cells=source.split('\n')[1].split('\t');
    assert.deepEqual(cells.slice(1,5),['','','','']);assert.equal(cells[5],'40');
    await f('example').click();await f('replace').getByRole('button',{name:'保留目前資料'}).click();assert.equal(await f('loads').inputValue(),source);
    await f('example').click();await f('replace').getByRole('button',{name:'取代資料'}).click();await f('run').click();await f('result').waitFor();
    const read=async name=>{const ev=page.waitForEvent('download');await f('save').click();const d=await ev;await d.saveAs(path.join(out,name));return JSON.parse(await fs.readFile(path.join(out,name),'utf8'));};
    const first=await read('雙輪位置分析.json');assert.equal(first.result.fine.applied,65);
    await f('plot').screenshot({path:path.join(out,'雙輪應力圖.png')});
    await f('angle').fill('45');assert.equal(await f('save').isDisabled(),true);await f('face').selectOption('top');
    await f('run').click();await f('result').waitFor();assert.match(await f('summary').innerText(),/頂面 45°/);
    await f('joint').selectOption('unknown');await f('run').click();assert.match(await f('status').innerText(),/接縫傳力模型/);assert.equal(await f('result').isVisible(),false);
    await f('joint').selectOption('free');await f('jointsX').fill('1.85');await f('run').click();await f('result').waitFor();
    const joint=await read('無傳力縫跨縫輪印.json');assert.equal(joint.result.fine.panels.length,2);
    const applied=joint.result.fine.panels.map(p=>p.forces[0].applied);assert.ok(applied.every(n=>n>0));assert.ok(Math.abs(applied[0]+applied[1]-40)<1e-7);
    const fake={...first,result:{fine:{applied:99999}}};await f('file').setInputFiles({name:'replay.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fake))});
    await f('replace').getByRole('button',{name:'取代資料'}).click();await f('result').waitFor();const restored=await read('讀回重算.json');assert.deepEqual(restored.result,first.result);
    await page.setViewportSize({width:390,height:844});await f('plot').scrollIntoViewIfNeeded();const viewport=await f('plot').evaluate(el=>({w:el.ownerDocument.documentElement.clientWidth,scroll:el.ownerDocument.documentElement.scrollWidth}));
    assert.ok(viewport.scroll<=viewport.w+1,JSON.stringify(viewport));await page.screenshot({path:path.join(out,'手機應力圖.png')});
    await page.locator('#plateDialog button').click();assert.equal(await page.locator('#bannerStatus').innerText(),parent);
    await page.goto(direct);await page.locator('#file').setInputFiles(path.join(out,'雙輪位置分析.json'));await page.locator('#result').waitFor();
    await page.evaluate(()=>window.print=()=>{document.body.dataset.printed='yes';});await page.locator('#print').click();assert.equal(await page.locator('body').getAttribute('data-printed'),'yes');
    await page.setViewportSize({width:1280,height:900});await page.pdf({path:path.join(out,'地坪雙輪位置分析.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true});
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(out,'browser.json'),JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),clean:!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),
      viewport,parentUnchanged:true,sameResult:true,errors,applied,panelBalance:joint.result.fine.balance,coarseExtreme:first.result.coarse.max,fineExtreme:first.result.fine.max},null,2));
    console.log('PASS 輪組展開、座標缺值、工作執行緒、選面旋轉、跨縫分攤、未知傳力、JSON 重算、手機及列印。');
  }finally{if(browser)await browser.close();server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
