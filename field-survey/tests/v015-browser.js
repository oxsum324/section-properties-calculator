import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV015(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const click = async s => { await page.locator(s).click(); await page.locator('#busy').waitFor({ state: 'hidden' }); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects()).find(p => p.code === 'V015'));
  const tap = async (x, y) => { const p = await page.locator('#detailStage svg').evaluate((svg, [x,y]) => { const b = svg.viewBox.baseVal, p = new DOMPoint(b.x + x*b.width, b.y+y*b.height).matrixTransform(svg.getScreenCTM()); return { x:p.x,y:p.y }; }, [x,y]); await page.touchscreen.tap(p.x,p.y); };
  try {
    await page.goto(base); await page.locator('#contextStrip').waitFor();
    const seed = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), p = m.newProject('V015','照片選刪與門窗測試','2026-09-17'), u = m.newUnit('A戶'), r = m.newRecord(u.id,'1F','客廳'), other = m.newRecord(u.id,'1F','房間');
      p.units.push(u); p.records.push(r,other); r.location = '入口旁'; r.reportText = '保留人工說明'; r.detail = { kind:'preset',preset:'wall',mirror:false,marks:[{type:'pen',points:[{x:.25,y:.35},{x:.45,y:.55}]}] };
      const assets = [];
      for (let i=0;i<4;i++) { const c=document.createElement('canvas');c.width=400;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle=['#739a89','#d4a276','#96b9d9','#ddd'][i];ctx.fillRect(0,0,400,300);const blob=await new Promise(resolve=>c.toBlob(resolve)),id=m.id();assets.push({id,blob,thumb:blob});p.media.push({id,name:`合成-${i}.png`,kind:i===3?'plan':'image',type:blob.type,size:blob.size,sha256:await m.sha256(blob),importedAt:m.now()});if(i<3)r.photos.push({mediaId:id,role:i?'close':'overview',caption:`測試照片 ${i+1}`,marks:[],excluded:false,excludedReason:''});else p.plans.push({id:m.id(),unitId:u.id,floor:'1F',title:'平面',mediaId:id}); }
      const plan=p.plans[0]; r.photos.forEach((photo,i)=>{photo.placement={planId:plan.id,x:.1+i*.1,y:.2,endX:.5,endY:.6};});
      plan.labelLayout=r.photos.map(photo=>({kind:'photo',id:photo.mediaId,recordId:r.id,x:.82,y:.12,locked:true,anchor:[photo.placement.x,.2,.5,.6]}));
      r.mainPhotoId=r.photos[0].mediaId;other.photos.push(structuredClone(r.photos[1]));
      const shared=m.newProject('SHARED','跨案共用照片','2026-09-17'),su=m.newUnit('B戶'),sr=m.newRecord(su.id,'1F','房間');shared.units.push(su);shared.records.push(sr);sr.photos.push({...structuredClone(r.photos[0]),placement:null});shared.media.push(structuredClone(p.media[0]));await s.saveProject(shared,0,[assets[0]]);
      await s.saveProject(m.syncRooms(p),0,assets);return {project:p.id,record:r.id,photos:r.photos.map(p=>p.mediaId),other:other.id};
    });
    await page.reload(); await page.locator('[data-view=case]').click(); await page.locator('#busy').waitFor({state:'hidden'}); await page.locator('#caseSelect').selectOption(seed.project); await page.locator('#busy').waitFor({state:'hidden'}); await page.locator('#recordForm').waitFor();
    const before=await current();
    const conflictSafe=await page.evaluate(async()=>{const s=await import('./store.js'),m=await import('./model.js'),p=(await s.allProjects()).find(p=>p.code==='SHARED'),stale=structuredClone(p),mid=p.records[0].photos[0].mediaId;await s.saveProject(p,p.revision);m.removeRecordPhotos(stale,stale.records[0].id,[mid]);try{await s.saveProject(stale,stale.revision);return false;}catch(e){return e.name==='RevisionConflictError' && !!await s.getMedia(mid) && (await s.getProject(p.id)).records[0].photos.length===1;}});assert(conflictSafe);
    await click('#managePhotos'); assert(await page.locator('#deleteSelectedPhotos').isDisabled());
    await click('#selectAllPhotos'); assert.match(await page.locator('#photoSelectionCount').textContent(),/3 \/ 3/); await click('#clearPhotoSelection');
    for(const id of [seed.photos[0],seed.photos[2]]) await page.locator(`[data-delete-photo="${id}"]`).check();
    await page.screenshot({path:path.join(out,'v0.15-photo-selection-390.png')});
    page.once('dialog',d=>d.dismiss());await click('#deleteSelectedPhotos');assert.equal((await current()).records[0].photos.length,3);
    page.once('dialog',d=>d.accept());await click('#deleteSelectedPhotos');
    const deleted=await current();assert.deepEqual(deleted.records[0].photos,[before.records[0].photos[1]]);assert.equal(deleted.records[0].mainPhotoId,undefined);assert.deepEqual(deleted.records[0].detail,before.records[0].detail);assert.deepEqual(deleted.records[1],before.records[1]);assert.deepEqual(deleted.plans[0].labelLayout,[before.plans[0].labelLayout[1]]);
    const blobs=await page.evaluate(async ids=>{const s=await import('./store.js');return Promise.all(ids.map(async id=>!!await s.getMedia(id)));},seed.photos);assert.deepEqual(blobs,[true,true,false]);
    await click(`[data-field-detail="${seed.record}"]`);await click('[data-detail-tool=door]');await tap(.25,.35);assert(await page.locator('#saveDetail').isDisabled());await click('#detailCancel');
    await tap(.25,.35);await tap(.4,.8);await click('[data-detail-tool=window]');await tap(.56,.36);await tap(.74,.61);
    assert.equal(await page.locator('#detailStage [data-detail-index]').count(),3);
    assert.equal(await page.locator('#detailStage [data-detail-index]').last().getAttribute('data-detail-index'),'0'); // Observation draws above opening.
    await click('#detailUndo');assert.equal(await page.locator('#detailStage [data-detail-index]').count(),2);await click('#detailRedo');
    await click('[data-detail-tool=select]');await page.locator('#detailObject').selectOption('2');await click('#detailCopy');assert.equal(await page.locator('#detailStage [data-detail-index]').count(),4);await click('#detailDelete');
    await page.locator('#detailObject').selectOption('1');const handle=page.locator('#detailStage [data-vertex="1"]');const hb=await handle.boundingBox();await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(hb.x+hb.width/2+12,hb.y+hb.height/2-8,{steps:5});await page.mouse.up();
    await page.screenshot({path:path.join(out,'v0.15-openings-390.png')});
    for(const [width,height] of [[320,740],[844,390]]) { await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await page.locator('#saveDetail').isVisible());await page.screenshot({path:path.join(out,`v0.15-openings-${width}.png`)}); }
    await page.setViewportSize({width:390,height:844});await click('#saveDetail');
    const saved=await current();assert.equal(saved.records[0].detail.marks.length,3);assert.equal(saved.records[0].detail.marks[1].kind,'door');assert.notDeepEqual(saved.records[0].detail.marks[1].points[1],{x:.4,y:.8});assert.equal(saved.records[0].reportText,before.records[0].reportText);
    const exported=await page.evaluate(async id=>{const s=await import('./store.js'),m=await import('./model.js'),b=await import('./bundle.js'),d=await import('./detail.js'),r=await import('./report.js'),p=await s.getProject(id),get=async id=>(await s.getMedia(id)).blob,bundle=await b.readBundle((await b.makeBundle(p,get)).blob),png=await d.detailImage(p.records[0].detail,get),expected=await m.sha256(png),hashes=[];for(const format of ['quick','standard']){const rendered=await r.renderAttachment(p,get,{format}),doc=new DOMParser().parseFromString(rendered.html,'text/html'),src=doc.querySelector('.detail-img').src;hashes.push(await m.sha256(Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0))));}return{version:bundle.manifest.version,detail:bundle.project.records[0].detail,media:bundle.project.media.map(m=>m.id),expected,hashes};},seed.project);
    assert.equal(exported.version, 12);assert.deepEqual(exported.detail,saved.records[0].detail);assert(exported.hashes.every(hash=>hash===exported.expected));assert(!exported.media.includes(seed.photos[0]));assert(!exported.media.includes(seed.photos[2]));
    await page.waitForFunction(()=>document.querySelector('#offlineStatus').textContent==='離線已就緒');await context.setOffline(true);await page.reload();await click(`[data-field-detail="${seed.record}"]`);assert.equal(await page.locator('#detailStage [data-detail-index]').count(),3);await click('#closeModal');
    await click('#managePhotos');await click('#selectAllPhotos');page.once('dialog',d=>d.accept());await click('#deleteSelectedPhotos');assert.equal((await current()).records[0].photos.length,0);assert(await page.locator('#managePhotos').isDisabled());assert.deepEqual((await current()).records[0].detail,saved.records[0].detail);
    // Custom image bases use the same editable opening layer and work offline too.
    await click(`[data-field-detail="${seed.record}"]`);await click('#chooseDetail');
    const custom = Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=500;c.height=400;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,500,400);ctx.strokeRect(40,40,420,320);return c.toDataURL().split(',')[1];}),'base64');
    page.once('dialog',d=>d.accept());await page.locator('#detailFile').setInputFiles({name:'自訂底圖.png',mimeType:'image/png',buffer:custom});await page.locator('#busy').waitFor({state:'hidden'});
    await click('[data-detail-tool=window]');await tap(.3,.3);await tap(.65,.6);await click('#saveDetail');
    const customSaved=(await current()).records[0].detail;assert.equal(customSaved.kind,'image');assert.equal(customSaved.marks[0].kind,'window');
    await click(`[data-field-detail="${seed.record}"]`);assert.equal(await page.locator('#detailStage [data-detail-index]').count(),1);await click('#closeModal');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'v0.15-result.json'),JSON.stringify({passed:true,errors,physicalPhoneTested:false},null,2));console.log('PASS V0.15 selected/all photo deletion, cancellation, shared assets, plan labels, opening edits, report PNGs, backup and offline');
  } finally { await context.close(); }
}
