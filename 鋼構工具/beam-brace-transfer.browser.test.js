const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {spawn,execFileSync} = require('node:child_process');
const {createInterface} = require('node:readline');
const root = path.resolve(__dirname,'..');
const {chromium} = require(path.join(root,'output/playwright/phase2-quality-deps/node_modules/playwright'));
const out = process.env.BEAM_BRACE_EVIDENCE_DIR;
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8,a+' vs '+b);

async function main(){
  const service=spawn(process.execPath,['serve-local.js','--no-open','--route','/beam-analysis'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','inherit']});
  let browser;
  try{
    const url=await new Promise((resolve,reject)=>{service.once('error',reject);const lines=createInterface({input:service.stdout});
      lines.on('line',line=>{const m=line.match(/listening on (http:\/\/\S+)/);if(m){lines.close();resolve(m[1]);}});});
    browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
    const context=await browser.newContext(), page=await context.newPage(),errors=[];
    context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.waitForFunction(()=>typeof runAnalysis==='function');
    const form=page.locator('#stationTransferBody form'),panel=page.locator('.brace-panel'),sender=panel.locator('.brace-sender'),status=sender.locator('[role=status]');
    const project='P3-05', member='B-3', combo='U1';
    async function solve(loads,units='tf-m',L=8,supportTypes=['pin','roller'],lengths=[L],hinges=[]){
      await page.evaluate(async v=>{
        const model={numSpans:v.lengths.length,supports:v.supportTypes.map(type=>({type})),spans:v.lengths.map((L,i)=>({L,eiMul:1,hinges:i?[]:v.hinges})),loads:v.loads};
        const data={unitSystem:v.units,matSelect:'steel',eVal:20400000,globalI:.0003,projNo:'P3-05',model};
        await window._localImportFile({files:[new File([JSON.stringify(data)],'p3.json')]});runAnalysis();
      },{loads,units,supportTypes,lengths,hinges});
      if(!await page.locator('#stationTransfer').evaluate(el=>el.open))await page.locator('#stationTransfer > summary').click();
      await form.waitFor();
      if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
      await sender.locator('canvas').waitFor();
      await page.waitForFunction(()=>document.querySelector('.brace-sender')._braceWatch?.isCurrent());
    }
    async function identity(revision=1,combination=combo,memberId=member){
      for(const [k,v] of Object.entries({project,member:memberId,caseName:'設計載重',combination,revision}))await form.locator('[name='+k+']').fill(String(v));
      await form.locator('[name=basis]').selectOption('factored');
    }
    async function select(method='quarter',flange='top',restraints='both'){
      await sender.locator('[data-full]').click();
      for(const [k,v] of Object.entries({method,flange,restraints}))await sender.locator('[name='+k+']').selectOption(v);
    }
    async function send(){await sender.locator('[data-send]').click();await sender.locator('a').waitFor();return sender.locator('a').evaluate(e=>e.href);}
    const raw=p=>p.evaluate(()=>buildBeamSourcePayload());
    await solve([[{type:'point',P:10,a:2.737}]]);await identity();await select();
    assert.match(await status.innerText(),/1\.4088783/);
    // 圖上選點後，輸入與圖同步；再輸入全段的確切位置。
    await sender.locator('[data-pick=start]').click();const canvas=sender.locator('canvas'),box=await canvas.boundingBox();
    await canvas.click({position:{x:22+(box.width-44)/4,y:60}});
    assert.ok(Math.abs(Number(await sender.locator('[name=start]').inputValue())-2)<=8/(box.width-44));await select();
    if(out)await sender.screenshot({path:path.join(out,'段端與彎矩圖.png')});
    await page.setViewportSize({width:390,height:844});await sender.scrollIntoViewIfNeeded();
    assert.ok(await sender.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'mobile form fits the available width');
    if(out)await sender.screenshot({path:path.join(out,'手機段選取.png')});
    await page.setViewportSize({width:1280,height:900});
    await form.locator('[name=project]').fill('OTHER');assert.equal(await sender.locator('[data-send]').isEnabled(),false);await identity();
    const review=await context.newPage();await review.goto(await send());const receive=review.locator('#braceReview');
    await receive.waitFor();
    await review.setViewportSize({width:390,height:844});
    assert.ok(await receive.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'mobile review fits the available width');
    if(out)await receive.screenshot({path:path.join(out,'手機鋼梁核對.png')});
    await review.setViewportSize({width:1280,height:900});const confirm=receive.locator('input[type=checkbox]'),apply=receive.locator('button');
    assert.equal(await apply.isEnabled(),false);await review.locator('#btnASD').click();assert.equal(await confirm.isEnabled(),false);await review.locator('#btnLRFD').click();
    await review.locator('#inTf').fill('3');assert.equal(await confirm.isEnabled(),false);
    await review.locator('#inTf').fill('13');assert.ok(await confirm.isEnabled());
    for(const [id,value] of Object.entries({inMu:'30.123456789',inVu:'15.33710192345',inL:'803.123456'}))await review.locator('#'+id).fill(value);
    const before=await raw(review);assert.equal(before.adoptedBrace,undefined);
    await confirm.check();await apply.click();
    const accepted=await raw(review),p=accepted.adoptedBrace;
    assert.ok(p);near(Number(accepted.fields.inLb.value),800);near(Number(accepted.fields.inCb.value),1.408878269161639);
    for(const k of ['inL','inMu','inVu'])assert.equal(accepted.fields[k].value,before.fields[k].value);
    assert.ok(accepted.report.inputs.find(g=>g.group==='未側撐段採用紀錄').items.some(i=>i.value.includes('2.737')));
    await review.locator('#beamUnitModeSiBtn').click();const inSI=await raw(review);
    near(Number(inSI.fields.inLb.value),8);near(Number(inSI.fields.inMu.value),30.123456789*9.80665);near(Number(inSI.fields.inL.value),8.03123456);
    const draftKey=await review.evaluate(()=>Object.keys(localStorage).find(k=>k.startsWith('steel-beam-formal-input-draft-v1.')));
    assert.equal(await review.evaluate(k=>JSON.parse(localStorage.getItem(k)).unitMode,draftKey),'si');
    await review.locator('#beamUnitModeLegacyBtn').click();
    assert.equal(await review.evaluate(k=>JSON.parse(localStorage.getItem(k)).unitMode,draftKey),'legacy');
    await review.reload();
    await review.waitForFunction(()=>window.buildBeamSourcePayload?.()?.adoptedBrace?.id);
    const restored=await raw(review);
    assert.equal(restored.calculationFingerprint,accepted.calculationFingerprint);
    for(const k of ['inMu','inVu','inL','inLb','inCb'])assert.equal(restored.fields[k].value,accepted.fields[k].value);
    {
      const [report]=await Promise.all([review.waitForEvent('popup'),review.locator('#printReportBtn').evaluate(el=>el.click())]);
      const txt=await report.locator('.rep-paper').innerText();assert.ok(txt.includes('四分點')&&txt.includes('2.737')&&txt.includes('U1'));
      if(out)await report.pdf({path:path.join(out,'鋼梁未側撐段.pdf'),format:'A4',printBackground:true});
      await report.close();
    }
    const plain=await context.newPage();await plain.goto(new URL('/steel-beam-formal',url).href);
    const importSource=(target,source)=>target.evaluate(s=>window.importBeamSourceJson(new File([JSON.stringify(s)],'p3.json')),source);
    await importSource(plain,accepted);assert.equal((await raw(plain)).calculationFingerprint,accepted.calculationFingerprint);
    const altered=structuredClone(accepted);altered.adoptedBrace.profile.pieces[0][2]+=1;
    await importSource(plain,altered);assert.match(await plain.locator('#beamInputStatus').innerText(),/匯入失敗/);assert.equal((await raw(plain)).adoptedBrace.id,p.id);
    await plain.locator('#inCb').fill('2');assert.equal(await raw(plain),null);
    await plain.locator('#releaseBeamBrace').evaluate(el=>el.click());assert.equal((await raw(plain)).adoptedBrace,undefined);near(Number((await raw(plain)).fields.inCb.value),1);
    await plain.close();
    // 同站內力與段候選可分別送出，但不同組合或過期修次不能併用。
    const stationOption=form.locator('[name=section] option').filter({hasText:/^2\.737 .*右側/});
    await form.locator('[name=section]').selectOption(await stationOption.getAttribute('value'));await form.locator('[type=submit]').click();
    await review.locator('#stationCandidate option').first().waitFor({state:'attached'});await review.locator('#stationConfirm').check();await review.locator('#stationApply').click();
    const linked=await raw(review);const currentMu=linked.fields.inMu.value;
    await review.locator('#inMu').fill('12.99');assert.equal(await raw(review),null);await review.locator('#inMu').fill(currentMu);
    assert.equal((await raw(review)).calculationFingerprint,linked.calculationFingerprint);assert.equal(linked.adoptedBeamImport.station.combination,combo);assert.equal(linked.adoptedBrace.id,p.id);
    await identity(1,'U2');await send();await receive.locator('select').selectOption({label:await receive.locator('option').filter({hasText:'U2'}).innerText()});
    assert.equal(await confirm.isEnabled(),false);
    await identity(2);await send();await receive.locator('select').selectOption(p.id);assert.match(await receive.locator('[role=status]').innerText(),/舊修次/);
    await solve([[{type:'point',P:11,a:2.737}]]);await identity(2);await select();await send();
    const conflicted=await receive.locator('option').filter({hasText:'U1 ／ R2'}).first().getAttribute('value');
    await receive.locator('select').selectOption(conflicted);assert.match(await receive.locator('[role=status]').innerText(),/同修次來源衝突/);
    await review.close();
    const cases=[];
    async function record(label){const text=await status.innerText();cases.push({label,text,values:await sender.locator('[data-values]').innerText()});return text;}
    await solve([[{type:'moment',M:20,a:0},{type:'moment',M:-20,a:8}]]);await identity(3);await select('quarter','both');
    assert.match(await record('等彎矩'),/Cb = 1$/);
    await solve([[{type:'moment',M:20,a:0},{type:'moment',M:20,a:8}]]);await identity(3);await select('quarter','both');
    assert.match(await record('反曲'),/2\.2727273/);await sender.locator('[name=method]').selectOption('end');
    assert.match(await record('反曲正文上限'),/Cb = 2\.3$/);
    await solve([[{type:'moment',M:12,a:2}]]);await identity(3);await select('quarter','both');
    assert.match(await record('四分點突跳'),/突跳/);assert.equal(await sender.locator('[data-send]').isEnabled(),false);
    await sender.locator('[name=jump]').selectOption('envelope');assert.match(await record('兩側包絡'),/1\.3636364/);
    await sender.locator('[name=method]').selectOption('end');assert.match(await record('正文端矩'),/Cb = 1$/);
    await solve([[{type:'udl',w:0}]]);await identity();await select('quarter','both');assert.match(await record('零彎矩'),/零/);
    await solve([[{type:'point',P:5,a:8}]],'tf-m',8,['fixed','free']);await identity();await select('quarter','both','cantilever');
    assert.match(await record('未側撐懸臂'),/Cb＝1/);
    await solve([[{type:'trapezoid',w1:0,w2:6}]]);await identity();await select();assert.match(await record('三角形載重解析峰值'),/可送出/);
    assert.ok((await sender.locator('[data-values]').innerText()).includes('4.6188022'));
    await solve([[{type:'udl',w:2}],[{type:'udl',w:2}]],'tf-m',8,['pin','roller','roller'],[4,4]);
    await identity(3);await select('quarter','both');
    await sender.locator('[name=start]').fill('1');await sender.locator('[name=end]').fill('7');
    assert.match(await record('跨中間支點同構件'),/可送出/);assert.match(await sender.locator('[data-values]').innerText(),/第 2 跨＋3/);
    await solve([[{type:'udl',w:2}]],'tf-m',8,['fixed','fixed'],[8],[4]);await identity(3);await select('quarter','both');
    assert.match(await record('跨內鉸待核'),/內鉸/);
    for(const [units,L] of [['kN-m',8],['kgf-cm',800]]){
      await solve([[{type:'point',P:10,a:2.737*L/8}]],units,L);await identity(1,'U1','單位'+units);await select();const dest=await context.newPage();await dest.goto(await send());
      await dest.locator('#braceReview input').check();await dest.locator('#braceReview button').click();const src=await raw(dest);near(Number(src.fields.inLb.value),800);near(Number(src.fields.inCb.value),1.408878269161639);await dest.close();
    }
    const previous=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/steel-beam-v121.source.json'),'utf8'));
    assert.equal(previous.tool.version,'v1.2.1');
    const now=await context.newPage();await now.goto(new URL('/steel-beam-formal',url).href);await importSource(now,previous);
    const replayStatus = await now.locator('#beamInputStatus').innerText();
    const updatedSource = await raw(now);
    assert.ok(replayStatus.includes(`已核對 V1.2.1 原始計算 ${previous.calculationFingerprint}`), replayStatus);
    assert.ok(replayStatus.endsWith(`｜${updatedSource.calculationFingerprint}`), replayStatus);
    assert.notEqual(updatedSource.tool.version, previous.tool.version);
    assert.notEqual(updatedSource.calculationFingerprint, previous.calculationFingerprint);
    assert.equal(updatedSource.fields.inMu.value, previous.fields.inMu.value);
    assert.equal(updatedSource.fields.inVu.value, previous.fields.inVu.value);
    await importSource(now,updatedSource);
    assert.equal((await raw(now)).calculationFingerprint,updatedSource.calculationFingerprint);
    await now.close();assert.deepEqual(errors,[]);
    if(out)fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),clean:!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),accepted,linked:linked.calculationFingerprint,cases},null,2));
    console.log('PASS 段端選圖、跨頁採用與需求隔離、三種單位、來源回讀、人工更動、舊修次、組合衝突及解析極值');
  }finally{await browser?.close();service.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
