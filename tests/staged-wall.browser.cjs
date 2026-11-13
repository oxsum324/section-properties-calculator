const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process'),{createInterface}=require('node:readline');
const root=path.resolve(__dirname,'..'),suite=path.join(root,'開挖擋土支撐'),out=path.resolve(process.env.STAGED_WALL_OUT||path.join(root,'output/playwright/staged-wall'));
const {chromium}=require(path.join(root,'output/playwright/phase2-quality-deps/node_modules/playwright'));
async function main(){
  await fs.mkdir(out,{recursive:true});const temp=await fs.mkdtemp(path.join(os.tmpdir(),'staged-wall-review-'));
  const script=[
    'import sys, pathlib, uvicorn','from backend.app.config import get_settings','s=get_settings()','p=pathlib.Path(sys.argv[1])',
    "s.app_data_dir=p;s.projects_dir=p/'projects';s.reports_dir=p/'reports';s.db_path=p/'cases.db';s.receiver_trust_registry_path=p/'registry.json'",
    's.projects_dir.mkdir();s.reports_dir.mkdir()',"from backend.app.main import app","uvicorn.run(app,host='127.0.0.1',port=0,log_level='info')"
  ].join('\n');
  const srv=spawn('python',['-X','utf8','-c',script,temp],{cwd:suite,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let browser;
  try{
    const base=await new Promise((res,rej)=>{let tail='';createInterface({input:srv.stderr}).on('line',s=>{tail=(tail+'\n'+s).slice(-3000);const m=s.match(/running on (http:\/\/127\.0\.0\.1:\d+)/);if(m)res(m[1]);});srv.once('error',rej);srv.once('exit',c=>rej(Error('server exit '+c+tail)));});
    browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}});
    const http=context.request;
    const project=await http.post(base+'/api/projects',{data:{name:'合成階段檢核'}});assert.ok(project.ok(),await project.text());const id=(await project.json()).metadata.id;
    const lst=['* RETAINING WALL : LENGTH 12 M','* EI=TEST= 21414 tf-m^2/m','4 ... 6 2.03 1.03 0.34 0.546 4.044 0 27 0 0.5 500 0',
      '5 ... 12 2.03 1.03 0.34 0.546 4.044 0 27 0 0.5 900 2.5','* Stage 1 Excavtion Depth= 6.8 m',': EXC(2) 5.8',': EAU(2) 6.8',': STOP','* Stage 1 Excavtion Depth= 6.8 m'].join('\n');
    const loaded=await http.post(base+'/api/projects/'+id+'/import-analysis',{multipart:{side:'top',file:{name:'SYN.LST',mimeType:'text/plain',buffer:Buffer.from(lst)}}});
    assert.ok(loaded.ok(),await loaded.text());
    const app=await context.newPage();await app.goto(base+'/');const link=app.getByRole('link',{name:'逐階壁體與土彈簧（已儲存案件）'});
    const tab=context.waitForEvent('page');await link.click({timeout:90000});const page=await tab;
    const errors=[];page.on('pageerror',e=>errors.push(e.message));const f=id=>page.locator('#'+id);
    await f('bring').click();const layers=await f('layers').inputValue();assert.match(layers,/4903\.325/);assert.match(layers,/Rp 非零/);
    assert.equal(layers.split('\n')[2].split('\t')[1],'');assert.match(await f('stages').inputValue(),/5\.8\t\t6\.8/);assert.equal(await f('toe').inputValue(),'');
    await f('run').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('未完成'));
    await f('example').click();await f('replace').getByRole('button',{name:'保留目前資料'}).click();assert.equal(await f('layers').inputValue(),layers);
    await f('example').click();await f('replace').getByRole('button',{name:'取代資料'}).click();
    const run=async()=>{await f('run').click();await f('result').waitFor();};
    const read=async name=>{const d=page.waitForEvent('download');await f('save').click();await(await d).saveAs(path.join(out,name));return JSON.parse(await fs.readFile(path.join(out,name),'utf8'));};
    await run();await f('stage').selectOption('2');const linear=await read('五階線彈性.json');assert.ok(Math.abs(linear.result.stages[2].wall[0].u_mm-18.64502)<.0001);
    assert.match(await f('comparison').innerText(),/監測/);assert.match(await f('comparison').innerText(),/198\.846/);
    await f('soil_law').selectOption('plastic');let data=await f('layers').inputValue();
    data=data.split('\n').map((r,i)=>{if(!i)return r;const c=r.split('\t');c[4]=-35;c[5]=55;return c.join('\t');}).join('\n');await f('layers').fill(data);
    await run();await f('stage').selectOption('4');await f('springDetails').locator('summary').click();assert.match(await f('springs').innerText(),/塑性位移/);
    const plastic=await read('彈塑性卸載.json');assert.ok(plastic.result.stages[4].wall[0].u_mm>200);
    const corrupt={...linear,result:{stages:[]}};
    await f('file').setInputFiles({name:'replay.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});
    await f('replace').getByRole('button',{name:'取代資料'}).click();await page.waitForFunction(()=>document.getElementById('soil_law').value==='linear'&&document.getElementById('stage').selectedIndex===2);
    const replay=await read('原始輸入重算.json');assert.deepEqual(replay.result,linear.result);await f('springDetails').locator('summary').click();
    await page.setViewportSize({width:390,height:844});await f('plot').scrollIntoViewIfNeeded();
    const viewport=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(viewport.scroll<=viewport.width+1);
    await page.screenshot({path:path.join(out,'手機階段圖.png')});
    await page.evaluate(()=>window.print=()=>document.body.dataset.print='yes');await f('print').click();assert.equal(await page.locator('body').getAttribute('data-print'),'yes');
    await page.setViewportSize({width:1280,height:900});await page.pdf({path:path.join(out,'第三階壁體紀錄.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true});
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'browser.json'),JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),clean:!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),viewport,errors,projectImport:true,modelReplay:true,heads:linear.result.stages.map(s=>s.wall[0].u_mm),reactions:linear.result.stages.map(s=>s.supports.map(r=>r.per_m)),maxPlasticMm:Math.max(...plastic.result.stages[3].springs.flat().map(v=>v.plastic_m))*1000},null,2));
    console.log('PASS 服務案件入口、外部階段與 kh 單位、待補、五階計算、彈塑性、對照、讀回重算、手機與列印');
  }finally{if(browser)await browser.close();srv.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
