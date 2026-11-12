const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {createInterface}=require('node:readline');
const {chromium}=require('playwright');

async function start(port, standalone=false){
  const process=spawn('node',['serve-local.js',String(port),'--no-open',...(standalone?['--level-survey']:[])],{windowsHide:true,stdio:['ignore','pipe','inherit']});
  const lines=createInterface({input:process.stdout});
  const base=await new Promise((resolve,reject)=>{
    lines.on('line',s=>{const m=s.match(/listening on (http:\/\/[^/]+)/);if(m){lines.close();resolve(m[1]);}});
    process.once('error',reject);process.once('exit',()=>reject(Error('server stopped')));
  });
  return {process,base};
}
async function stop(s){if(s && s.process.exitCode===null){const end=once(s.process,'exit');s.process.kill();await end;}}
async function waitForStorage(page, fn){
  const end=Date.now()+15000;
  do {if(await page.evaluate(fn))return; await new Promise(resolve=>setTimeout(resolve,120));}while(Date.now()<end);
  throw Error('等待案件或離線快取寫入逾時：'+fn);
}
async function main(){
  let server,browser;
  try{
    server=await start(0);const base=server.base,port=new URL(base).port;
    browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
    const context=await browser.newContext();
    const field=await context.newPage();await field.goto(base+'/condition-survey');
    await field.locator('#startCase').click();
    const form=field.locator('#caseForm');
    await form.locator('[name=code]').fill('LOCAL-QA');
    await form.locator('[name=name]').fill('附件表頭合成測試');
    assert(await form.locator('[name=attachmentCaseNumber]').isDisabled());
    await form.locator('[name=useAttachmentHeader]').check();
    await form.locator('[name=attachmentCaseNumber]').fill('FORM-7');await form.locator('[name=attachmentOrgName]').fill('合成單位');
    await form.locator('[type=submit]').click();
    await waitForStorage(field,async()=>{const m=await import('./store.js');return (await m.allProjects()).some(p=>p.caseNumber==='FORM-7' && p.orgName==='合成單位' && p.code==='LOCAL-QA');});
    await field.locator('#editCase').evaluate(e=>e.click());
    assert(await form.locator('[name=useAttachmentHeader]').isChecked());
    await form.locator('[name=useAttachmentHeader]').uncheck();
    await form.locator('[type=submit]').click();
    await waitForStorage(field,async()=>{const m=await import('./store.js');return (await m.allProjects()).some(p=>p.code==='LOCAL-QA' && !('caseNumber' in p) && !('orgName' in p));});
    await field.close();
    // 在獨立瀏覽器環境先以舊頁建立 IndexedDB 草稿，換伺服器仍使用同一 origin 與 scope。
    const legacy=await context.newPage();await legacy.goto(base+'/level-survey/index.html');
    await legacy.locator('#caseName').fill('P4-舊版草稿');await legacy.locator('#caseName').blur();
    await waitForStorage(legacy,async()=>{const m=await import('./store.js');return (await m.loadProject())?.name==='P4-舊版草稿';});
    const before=await legacy.evaluate(async()=>{await navigator.serviceWorker.ready;return (await (await import('./store.js')).loadProject()).id;});
    await stop(server);server=await start(port,true);
    const worker=await (await fetch(base+'/level-survey/sw.js')).text();
    assert(worker.includes('APP_FILES'));assert(!worker.includes('level-survey-v0.4.3'));
    await legacy.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
    await waitForStorage(legacy,async()=>{const keys=await caches.keys();return keys.some(k=>k.startsWith('level-survey-v') && k!=='level-survey-v0.4.3') && !keys.includes('level-survey-v0.4.3');});
    await legacy.reload();await legacy.waitForFunction(()=>document.getElementById('caseName')?.value==='P4-舊版草稿');
    assert.equal(await legacy.evaluate(async()=>(await (await import('./store.js')).loadProject()).id),before);
    assert.equal((await fetch(base+'/level-survey/test-cases/demo-case.json')).status,200);
    console.log('PASS 現況表頭可選存入與清除，水準原址服務升級後保留既有 IndexedDB 案件 ID 與名稱');
  }finally{await browser?.close();await stop(server);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
