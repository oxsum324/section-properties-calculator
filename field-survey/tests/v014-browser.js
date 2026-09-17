import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV014(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['camera'] });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const click = async selector => { const el = page.locator(selector); await el.evaluate(el => { for(let p=el.parentElement;p;p=p.parentElement) if(p.tagName==='DETAILS') p.open=true; }); await el.click(); await page.locator('#busy').waitFor({state:'hidden'}); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  const tapPlan = async (x,y) => { await page.locator('#planStage svg').scrollIntoViewIfNeeded(); const b=await page.locator('#planStage svg').boundingBox();await page.touchscreen.tap(b.x+b.width*x,b.y+b.height*y); };
  const addSymbol = async () => { await click('[data-detail-tool=symbol]');await click('[data-detail-symbol=network]');const p=await page.locator('#detailStage svg').evaluate(svg=>{const p=new DOMPoint(600,320).matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y};});await page.touchscreen.tap(p.x,p.y); };
  try {
    await page.goto(base);await page.locator('#caseSelect').waitFor();
    await page.evaluate(async()=>{
      const m=await import('./model.js'),s=await import('./store.js'),p=m.newProject('V014-SYNTHETIC','現場細圖流程測試','2026-09-15'),u=m.newUnit('A戶'),u2=m.newUnit('B戶'),r=m.newRecord(u.id,'','客廳'),other=m.newRecord(u2.id,'2F','房間');
      p.units.push(u,u2);p.records.push(r,other);Object.assign(r,{component:'牆面',condition:'crack',crackPattern:'network',reportText:'保留現場人工說明'});other.detail={kind:'preset',preset:'door',mirror:false,marks:[]};
      const assets=[];
      for(const [i,name] of ['遠拍','近拍','平面圖'].entries()){
        const canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;const ctx=canvas.getContext('2d');ctx.fillStyle=['#ccc','#ddd','#eee'][i];ctx.fillRect(0,0,400,300);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),mid=m.id();
        p.media.push({id:mid,name:name+'.png',kind:i===2?'plan':'image',size:blob.size,type:blob.type,importedAt:m.now(),sha256:await m.sha256(blob)});assets.push({id:mid,blob,thumb:blob});
        if(i===2)p.plans.push({id:m.id(),unitId:u.id,floor:'1F',title:'全層平面',mediaId:mid});else r.photos.push({mediaId:mid,role:i?'close':'overview',caption:name,marks:[],excluded:false,excludedReason:''});
      }
      await s.saveProject(m.syncRooms(p),0,assets);
    });
    await page.reload();await page.locator('#recordForm').waitFor();const initial=await current(),rid=initial.records[0].id,[far,near]=initial.records[0].photos;
    // Start in field work, without ever visiting attachment organisation.
    assert.match(await page.locator('#recordDetail').textContent(),/尚未建立/);
    await click(`[data-field-detail="${rid}"]`);await click('[data-detail-preset=wall]');await addSymbol();await click('#saveDetail');
    assert.equal((await current()).records[0].detail.marks.length,1);assert.match(await page.locator('#recordDetail').textContent(),/已保存/);
    await click(`[data-photo="${far.mediaId}"]`);await page.locator('#photoCaption').fill('遠拍補充，轉步驟保留');
    await page.locator('#photoStage svg').scrollIntoViewIfNeeded();const photoBox=await page.locator('#photoStage svg').boundingBox();await page.mouse.move(photoBox.x+photoBox.width*.3,photoBox.y+photoBox.height*.3);await page.mouse.down();await page.mouse.move(photoBox.x+photoBox.width*.6,photoBox.y+photoBox.height*.6,{steps:4});await page.mouse.up();
    await click('#photoDetailNext');assert.match(await page.locator('.detail-context').textContent(),/照片 1/);assert.equal(await page.locator('#detailStage [data-detail-index]').count(),1);await click('#closeModal');
    assert.equal((await current()).records[0].photos[0].caption,'遠拍補充，轉步驟保留');assert.equal((await current()).records[0].photos[0].marks.length,1);
    // Missing-floor interstitial must keep the exact selected photo, not redirect its arrow to the record.
    await click(`[data-photo="${near.mediaId}"]`);await click('#photoLocation .location-edit');await page.locator('#planFloor').fill('1F');await click('#planFloorForm button');
    assert.equal(await page.locator('#modalTitle').textContent(),'這張照片的拍攝位置');await tapPlan(.3,.4);await click('#savePlacementDetail');assert(await page.locator('#planStage').isVisible());assert.equal((await current()).records[0].photos[1].placement,undefined);
    await tapPlan(.7,.6);await click('#savePlacementDetail');assert.match(await page.locator('.detail-context').textContent(),/照片 2/);await addSymbol();await click('#saveDetail');
    const placed=(await current()).records[0];assert.equal(placed.detail.marks.length,2);assert.equal(placed.placement,null);assert.equal(placed.photos[0].placement,undefined);assert(placed.photos[1].placement);assert.equal(placed.floor,'1F');
    // Camera capture continues directly to this newly saved photo's arrow, then the same shared detail.
    await click('#takePhoto');await click('#startCamera');await page.waitForFunction(()=>!document.querySelector('#shutter').disabled);await click('#shutter');await page.locator('#saveCameraNext').waitFor();await click('#saveCameraNext');
    assert.equal((await current()).records[0].photos.length,3);await tapPlan(.2,.3);await tapPlan(.6,.5);await click('#savePlacementDetail');assert.match(await page.locator('.detail-context').textContent(),/照片 3/);
    assert.equal(await page.locator('#detailStage [data-detail-index]').count(),2);await page.screenshot({path:path.join(out,'v0.14-field-detail-390.png')});await click('#closeModal');
    const saved=await current();assert(saved.records[0].photos[2].placement);assert.deepEqual(saved.records[0].photos[1].placement,placed.photos[1].placement);assert.deepEqual(saved.records[1],initial.records[1]);assert.equal(saved.records.length,2);assert.equal(saved.records[0].reportText,initial.records[0].reportText);
    // Report editing and field editing address one detail object; cancel keeps committed photos/arrows.
    await click('[data-view=report]');await click(`[data-report-record="${rid}"] [data-do=edit-detail]`);assert.equal(await page.locator('#detailStage [data-detail-index]').count(),2);await click('#closeModal');
    const backup=await page.evaluate(async()=>{const s=await import('./store.js'),b=await import('./bundle.js'),p=(await s.allProjects())[0],bundle=await b.readBundle((await b.makeBundle(p,async id=>(await s.getMedia(id)).blob)).blob);return{version:bundle.manifest.version,detail:bundle.project.records[0].detail};});assert.equal(backup.version, 10);assert.deepEqual(backup.detail,saved.records[0].detail);
    await page.waitForFunction(()=>document.querySelector('#offlineStatus').textContent==='離線已就緒');await context.setOffline(true);await page.reload();await click('[data-view=work]');await click(`[data-field-detail="${rid}"]`);assert.equal(await page.locator('#detailStage [data-detail-index]').count(),2);await click('#closeModal');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'v0.14-result.json'),JSON.stringify({passed:true,errors,physicalPhoneTested:false},null,2));console.log('PASS V0.14 field/photo/camera -> exact photo location -> shared detail; missing floor, pending arrow, cancellation, report, backup and offline');
  }finally{await context.close();}
}
