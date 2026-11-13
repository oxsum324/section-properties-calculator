const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process'),{createInterface}=require('node:readline');
const root=path.resolve(__dirname,'..'),ref=require('./fixtures/cable-spectrum-reference.json');
const out=path.resolve(process.env.CABLE_SPECTRUM_OUT||path.join(root,'output/playwright/cable-spectrum'));
const {chromium}=require(path.join(root,'output/playwright/phase2-quality-deps/node_modules/playwright'));
async function signal(name,s){
  if(process.env.CABLE_REFERENCE_CSV)return fs.readFile(path.join(process.env.CABLE_REFERENCE_CSV,s.file));
  const rows=['time_s,accel_m_s2'];for(let i=0;i<ref.n;i++){
    const t=i/ref.rateHz,a=s.activeModes.reduce((v,n,j)=>v+[.65,.22,.095,.31][j]*Math.sin(2*Math.PI*s.modeFrequenciesHz[n-1]*t+.28*n),.13*Math.sin(2*Math.PI*7.23*t)+.0006*t);
    rows.push(t+','+a.toFixed(10));
  }return Buffer.from(rows.join('\n'));
}
async function main(){
  await fs.mkdir(out,{recursive:true});const srv=spawn(process.execPath,['serve-local.js','--no-open','--route','/cable-tension-frequency'],{cwd:root,stdio:['ignore','pipe','inherit'],windowsHide:true});
  let browser;
  try{
    const url=await new Promise((res,rej)=>{const lines=createInterface({input:srv.stdout});lines.on('line',s=>{const m=s.match(/listening on (http:\/\/\S+)/);if(m){lines.close();res(m[1]);}});srv.once('error',rej);srv.once('exit',c=>rej(Error('server '+c)));});
    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
    const parent=await page.locator('#bannerStatus').innerText();assert.equal(await page.locator('#spectrumFrame').getAttribute('src'),null);
    await page.locator('#openSpectrum').click();const ui=page.frameLocator('#spectrumFrame'),f=k=>ui.locator('#'+k);
    const direct=await f('csv').evaluate(el=>el.ownerDocument.location.href);
    await f('parent').click();assert.ok(await f('length').inputValue());assert.equal(await f('sensor').inputValue(),'');assert.equal(await f('csv').inputValue(),'');
    await f('example').click();await f('replace').getByRole('button',{name:'保留目前資料'}).click();assert.equal(await f('csv').inputValue(),'');
    await f('example').click();await f('replace').getByRole('button',{name:'取代資料'}).click();await f('peaks').locator('input').nth(4).waitFor();assert.equal(await f('peaks').locator('input').count(),5);
    const read=async name=>{const ev=page.waitForEvent('download');await f('save').click();const d=await ev;await d.saveAs(path.join(out,name));return JSON.parse(await fs.readFile(path.join(out,name),'utf8'));};
    const results={};let last;
    for(const [name,s] of Object.entries(ref.signals)){
      await f('file').setInputFiles({name:s.file,mimeType:'text/csv',buffer:await signal(name,s)});
      await f('replace').getByRole('button',{name:'取代資料'}).click();
      for(const key of ['caseId','boundary','source','sensor','length','mass','model','tolerance','ei','sag'])assert.equal(await f(key).inputValue(),'');
      await f('low').fill('.5');await f('high').fill('20');await f('analyze').click();
      for(const [key,value] of Object.entries({caseId:'合成索 '+name,source:'獨立時序生成紀錄與已知振型',sensor:'跨內面內加速度',boundary:name==='垂度與端柔'?'兩端平移固定，轉動彈簧及實測垂度參數依合成基準':'簡支直索，端點與材料依合成基準',length:30,mass:18,tolerance:.02}))await f(key).fill(String(value));
      const inputs=f('peaks').locator('input');assert.equal(await inputs.count(),5);
      for(const mode of s.activeModes){
        const b=Math.round(s.modeFrequenciesHz[mode-1]/ref.binWidthHz);await inputs.locator('xpath=self::*[@data-bin="'+b+'"]').fill(String(mode));
      }
      const model=name==='理想弦'?'string':name==='直索含EI'?'beamFit':'sag';
      await f('model').selectOption(model);
      if(model==='sag')for(const [k,v] of Object.entries({ei:ref.EI_Nm2,ea:ref.EA_N,sag:ref.sagM,left:50000,right:120000}))await f(k).fill(String(v));
      await f('identify').click();last=await read(name+'頻譜紀錄.json');assert.ok(Math.abs(last.result.tensionKn-400)<.09);
      results[name]={tensionKn:last.result.tensionKn,maxResidual:last.result.maxResidual,identifiedEI:last.result.eiIdentified,peaks:last.spectrum.peaks,assignments:last.assignments};
    }
    await f('model').selectOption('string');await f('identify').click();
    const bad=await read('模型不符待核.json');assert.equal(bad.result.tensionKn,null);assert.match(await f('outcome').innerText(),/待核/);
    await f('begin').fill('2');assert.equal(await f('spectral').isVisible(),false);await f('end').fill('22');await f('analyze').click();
    assert.equal(await f('peaks').locator('input').evaluateAll(es=>es.filter(e=>e.value).length),0);await f('identify').click();assert.match(await f('outcome').innerText(),/待核/);
    const source={...last,spectrum:{peaks:[]},result:{tensionKn:9999}};await f('file').setInputFiles({name:'重算.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
    await f('replace').getByRole('button',{name:'取代資料'}).click();const replay=await read('讀回重算.json');assert.deepEqual(replay.result,last.result);assert.deepEqual(replay.spectrum,last.spectrum);
    await page.setViewportSize({width:390,height:844});await f('plot').scrollIntoViewIfNeeded();
    const viewport=await f('plot').evaluate(el=>({width:el.ownerDocument.documentElement.clientWidth,scroll:el.ownerDocument.documentElement.scrollWidth}));assert.ok(viewport.scroll<=viewport.width+1);
    await page.screenshot({path:path.join(out,'手機頻譜.png')});await page.locator('#spectrumDialog button').click();assert.equal(await page.locator('#bannerStatus').innerText(),parent);
    await page.goto(direct);await page.locator('#file').setInputFiles(path.join(out,'垂度與端柔頻譜紀錄.json'));await page.locator('#spectral').waitFor();
    await page.evaluate(()=>window.print=()=>document.body.dataset.print='yes');await page.locator('#print').click();assert.equal(await page.locator('body').getAttribute('data-print'),'yes');
    await page.setViewportSize({width:1280,height:900});await page.pdf({path:path.join(out,'鋼索頻譜辨識.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true});
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'browser.json'),JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),clean:!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),independentCSV:Boolean(process.env.CABLE_REFERENCE_CSV),results,viewport,errors,savedAndRecalculated:true,incompatibleModel:bad.result},null,2));
    console.log('PASS 三套時序、人工指派、缺階、待核、重選時間窗、JSON 重算、手機與列印');
  }finally{if(browser)await browser.close();srv.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
