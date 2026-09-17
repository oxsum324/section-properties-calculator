import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV013(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const click = async selector => { const el = page.locator(selector); await el.evaluate(el => { for(let p=el.parentElement;p;p=p.parentElement) if(p.tagName==='DETAILS') p.open=true; }); await el.click(); await page.locator('#busy').waitFor({ state: 'hidden' }); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  const location = (x,y) => page.locator('#detailStage svg').evaluate((svg,[x,y]) => { const p=new DOMPoint(x*1200,y*640).matrixTransform(svg.getScreenCTM()); return {x:p.x,y:p.y}; },[x,y]);
  const tap = async(x,y) => { const p=await location(x,y); await page.touchscreen.tap(p.x,p.y); };
  const count = () => page.locator('#detailStage [data-detail-index]').count();
  try {
    await page.goto(base); await page.locator('#caseSelect').waitFor();
    await page.evaluate(async () => {
      const m=await import('./model.js'), s=await import('./store.js'), p=m.newProject('V013-SYNTHETIC','合成細圖操作驗證','2026-09-15'),u=m.newUnit('A戶'),r=m.newRecord(u.id,'1F','客廳'); p.units.push(u);p.records.push(r);
      Object.assign(r,{component:'牆面',condition:'crack',crackPattern:'network',location:'入口旁',reportText:'人工說明保留',detail:{kind:'preset',preset:'wall',mirror:false,marks:[{type:'pen',points:[{x:.1,y:.1},{x:.15,y:.18}]}]}});
      const canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;const ctx=canvas.getContext('2d');ctx.fillStyle='#ddd';ctx.fillRect(0,0,400,300); const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),mid=m.id();
      p.media.push({id:mid,name:'synthetic.png',kind:'image',size:blob.size,type:blob.type,importedAt:m.now(),sha256:await m.sha256(blob)});r.photos.push({mediaId:mid,role:'overview',caption:'合成照片',marks:[],excluded:false,excludedReason:''}); await s.saveProject(m.syncRooms(p),0,[{id:mid,blob,thumb:blob}]);
    });
    await page.reload();await page.locator('#recordForm').waitFor();const original=(await current()).records[0];await click('[data-view=report]');await click('[data-do=edit-detail]');
    assert.equal(await count(),1); assert.equal(await page.locator('[data-detail-symbol]').count(),10);assert.equal(await page.locator('[data-detail-tool=tile]').count(),0);
    await tap(.3,.3);await tap(.4,.36);await tap(.47,.55);await tap(.65,.48);assert(await page.locator('#saveDetail').isDisabled());await click('#detailFinish');assert.equal(await count(),2);
    await click('#detailUndo');assert.equal(await count(),1);await click('#detailRedo');assert.equal(await count(),2);
    await click('[data-detail-tool=select]');await page.locator('#detailObject').selectOption('1');
    const a=await location(.4,.36),b=await location(.42,.4);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();
    const changed=await page.locator('#detailStage [data-detail-index="1"] polyline').getAttribute('points');assert.match(changed,/504/);
    await page.locator('#detailObject').selectOption('1');await tap(.445,.475);await click('#detailDeleteSegment');assert.equal(await count(),3);await click('#detailUndo');assert.equal(await count(),2);
    await click('[data-detail-tool=region]');for(const p of [[.55,.48],[.72,.5],[.72,.6],[.55,.58]])await tap(...p);await click('#detailFinish');assert.equal(await page.locator('#detailStage polygon').count(),1);
    for(const [symbol,x,y] of [['network',.3,.38],['damp',.62,.38],['salt',.3,.68],['spall',.65,.68]]) {await click('[data-detail-tool=symbol]');await click(`[data-detail-symbol=${symbol}]`);assert(await page.locator('#detailSymbols').isHidden());await tap(x,y);}
    assert.equal(await count(),7);await click('[data-detail-tool=select]');await page.locator('#detailObject').selectOption('3');await click('#detailGrow');await click('#detailRotate');await click('#detailCopy');assert.equal(await count(),8);await click('#detailDelete');assert.equal(await count(),7);
    await click('[data-detail-tool=line]');await tap(.7,.7);await click('#detailZoomIn');assert.notEqual(await page.locator('#detailStage svg').getAttribute('viewBox'),'0 0 1200 640');await click('#detailCancel');await click('#detailFit');assert.equal(await count(),7);
    // Real two-finger zoom while a line is pending retains its earlier vertices without adding damage.
    await tap(.75,.72);const box=await page.locator('#detailStage svg').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2,cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-30,y:cy,id:1},{x:cx+30,y:cy,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-60,y:cy,id:1},{x:cx+60,y:cy,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    assert((await page.locator('#detailStage svg').getAttribute('viewBox')).split(' ').map(Number)[2]<900);assert.equal(await count(),7);await click('#detailCancel');await click('#detailFit');
    // A cancelled freehand stroke is not saved; a one-tap freehand attempt creates no invisible mark.
    await click('[data-detail-tool=pen]');await tap(.2,.2);assert.equal(await count(),7);
    const p=await location(.2,.2);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+10,p.y+10);await page.locator('#detailStage svg').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();assert.equal(await count(),7);
    for(const width of [320,390,844]){await page.setViewportSize({width,height:width===844?390:844});const box=await page.locator('#detailStage').boundingBox();assert(box.height>=90);assert(await page.locator('#modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:path.join(out,`v0.13-detail-${width}.png`)});}
    await page.setViewportSize({width:390,height:844});const waiting=page.waitForEvent('download');await click('#downloadDetail');await(await waiting).saveAs(path.join(out,'v0.13-detail.png'));await click('#saveDetail');
    const saved=(await current()).records[0];assert.equal(saved.detail.marks.length,7);assert.deepEqual(saved.detail.marks[0],original.detail.marks[0]);assert.equal(saved.detail.marks[3].rotation,15);assert.equal(saved.detail.marks[3].size,.3);
    for(const key of ['condition','conditions','crackPattern','width','length','tiles','reportText','photos'])assert.deepEqual(saved[key],original[key]);
    const reports=await page.evaluate(async()=>{const m=await import('./model.js'),s=await import('./store.js'),d=await import('./detail.js'),r=await import('./report.js'),b=await import('./bundle.js'),p=(await s.allProjects())[0],get=async id=>(await s.getMedia(id)).blob,expected=await m.sha256(await d.detailImage(p.records[0].detail,get)),output=[];for(const format of ['standard','quick']){const result=await r.renderAttachment(p,get,{format}),doc=new DOMParser().parseFromString(result.html,'text/html'),src=doc.querySelector('.detail-img').src;output.push({format,hash:await m.sha256(Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0))),html:result.html});}const bundle=await b.readBundle((await b.makeBundle(p,get)).blob),copy=m.restoredCopy(bundle.project).project;m.validateProject(copy);return{expected,output,equal:JSON.stringify(copy.records[0].detail)===JSON.stringify(p.records[0].detail),version:bundle.manifest.version};});
    assert(reports.output.every(x=>x.hash===reports.expected));assert(reports.equal);assert.equal(reports.version, 11);
    for(const r of reports.output){const file=path.join(out,`v0.13-${r.format}.html`);await fs.writeFile(file,r.html);const preview=await context.newPage();await preview.goto('file:///'+file.replaceAll('\\','/'));await preview.locator(r.format==='standard'?'.table-sheet':'.detail-sheet').screenshot({path:path.join(out,`v0.13-${r.format}.png`)});await preview.close();}
    await page.waitForFunction(()=>document.querySelector('#offlineStatus').textContent==='離線已就緒');await context.setOffline(true);await page.reload();await click('[data-view=report]');await click('[data-do=edit-detail]');assert.equal(await count(),7);await click('#closeModal');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'v0.13-result.json'),JSON.stringify({passed:true,hash:reports.expected,backupVersion:reports.version,errors,physicalPhoneTested:false},null,2));console.log('PASS V0.13 tap lines/regions, vertex/segment edits, four symbols, gestures, responsive canvas, identical PNG/report images and legacy/offline backup');
  }finally{await context.close();}
}
