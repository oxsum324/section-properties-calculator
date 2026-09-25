import { clickSurvey } from './ui-click.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV017(browser, base, out) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const click = selector => clickSurvey(page, selector);
  const current=()=>page.evaluate(async()=>(await (await import('./store.js')).allProjects())[0]);
  const tap=async(x,y)=>{const p=await page.locator('#detailStage svg').evaluate((svg,[x,y])=>{const b=svg.viewBox.baseVal,p=new DOMPoint(b.x+x*b.width,b.y+y*b.height).matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y};},[x,y]);await page.touchscreen.tap(p.x,p.y);};
  try {
    await page.goto(base);await page.locator('#contextStrip').waitFor();
    await page.evaluate(async()=>{
      const m=await import('./model.js'),s=await import('./store.js'),p=m.newProject('V017','照片與細圖對照測試','2026-09-17'),u=m.newUnit('A戶'),r=m.newRecord(u.id,'1F','客廳'),other=m.newRecord(u.id,'1F','客廳');p.units.push(u);p.records.push(r,other);
      Object.assign(r,{location:'窗邊',component:'牆面',condition:'crack',conditions:['crack','tileBroken'],crackPattern:'network',reportText:'人工照片內容保留',detail:{kind:'preset',preset:'wall',mirror:false,marks:[]}});other.location='另一位置';other.reportText='另一位置文字保留';
      const assets=[];for(let i=0;i<2;i++){const c=document.createElement('canvas');c.width=400;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle=i?'#bbc8bc':'#dfcbb9';ctx.fillRect(0,0,400,300);const blob=await new Promise(resolve=>c.toBlob(resolve)),id=m.id();assets.push({id,blob,thumb:blob});p.media.push({id,name:`合成-${i}.png`,kind:'image',size:blob.size,type:blob.type,sha256:await m.sha256(blob),importedAt:m.now()});r.photos.push({mediaId:id,role:i?'close':'overview',caption:i?'近照內容':'全景內容',marks:[],excluded:false,excludedReason:''});}
      await s.saveProject(m.syncRooms(p),0,assets);
    });
    await page.reload();await page.locator('#recordForm').waitFor();const original=await current(),r=original.records[0];
    assert.match(await page.locator('#recordDetail').textContent(),/裂隙、磁磚破損/);
    await click('.photo-card >> nth=0');assert.match(await page.locator('#photoDetail').textContent(),/對照提醒/);
    assert(await page.evaluate(()=>!!(document.querySelector('#photoCaption').compareDocumentPosition(document.querySelector('#photoDetail'))&Node.DOCUMENT_POSITION_FOLLOWING)));
    await click('#photoDetailNext');assert.equal(await page.locator('#detailName').count(),0);
    await page.locator('#detailLinkage').evaluate(el=>el.open=true);assert.match(await page.locator('#detailComparison').textContent(),/磁磚破損/);
    await click('[data-detail-suggest=tileBroken]');await tap(.65,.65);assert.equal(await page.locator('#detailStage [data-detail-index]').count(),1);
    await page.locator('#detailLinkage').evaluate(el=>el.open=true);assert.match(await page.locator('#detailComparison .detail-reminder').textContent(),/已記錄裂隙/);
    await click('[data-detail-suggest=crack]');await tap(.35,.35);assert.equal(await page.locator('#detailStage [data-detail-index]').count(),2);
    await page.locator('#detailLinkage').evaluate(el=>el.open=true);assert.equal(await page.locator('#detailComparison .detail-reminder').count(),0);
    const note='裂縫 A 位於窗角；磁磚破損在下方。\n同位置全景與近照相互對照。';await page.locator('#detailNote').fill(note);
    for(const [width,height] of [[320,740],[844,390]]){await page.setViewportSize({width,height});await page.locator('#detailNote').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,`v0.17-linkage-${width}.png`)});}
    await page.setViewportSize({width:390,height:844});await page.locator('#detailLinkage').evaluate(el=>el.open=false);await click('[data-detail-tool=text]');await page.locator('#detailText').fill('裂縫 A');await tap(.32,.22);await click('#saveDetail');
    const saved=await current();assert.equal(saved.records[0].detail.note,note);assert.deepEqual(saved.records[1],original.records[1]);assert.equal(saved.records[0].reportText,r.reportText);assert.deepEqual(saved.records[0].photos,r.photos);assert.deepEqual(saved.records[0].conditions,r.conditions);
    await click('[data-view=report]'); await page.locator('#reportAdvanced').evaluate(el => el.open = true);assert.match(await page.locator('#reportRooms .detail-summary').textContent(),/細圖補充/);assert.equal(await page.locator('[data-report-text]').first().inputValue(),r.reportText);
    const reports=await page.evaluate(async()=>{const s=await import('./store.js'),b=await import('./bundle.js'),report=await import('./report.js'),p=(await s.allProjects())[0],get=async id=>(await s.getMedia(id)).blob,bundle=await b.readBundle((await b.makeBundle(p,get)).blob),html={};for(const format of ['standard','quick'])html[format]=(await report.renderAttachment(p,get,{format})).html;return{html,equal:JSON.stringify(bundle.project)===JSON.stringify(p),version:bundle.manifest.version};});
    assert(reports.equal);assert.equal(reports.version,15);
    for(const [format,html] of Object.entries(reports.html)) {
      const file=path.join(out,`v0.17-${format}.html`);await fs.writeFile(file,html);const preview=await context.newPage();await preview.goto('file:///'+file.replaceAll('\\','/'));
      if(format==='standard') {
        const rows=preview.locator('.table-sheet tbody tr[data-photo-number]');assert.equal(await rows.count(),2);
        for(let i=0;i<2;i++){const row=rows.nth(i);assert.equal((await row.locator('td').nth(2).textContent()).trim(),'');assert.doesNotMatch(await row.locator('.row-text').textContent(),/細圖標註：/);assert.match(await row.locator('.row-text').textContent(),/狀況：裂隙、磁磚破損/);assert.match(await row.locator('.row-text').textContent(),/圖中文字：裂縫 A/);assert((await row.locator('.row-text').textContent()).includes(note));}
        await preview.locator('.table-sheet').screenshot({path:path.join(out,'v0.17-photo-table.png')});
      } else assert((await preview.locator('body').textContent()).includes(note));
      assert(await preview.locator('.standard-sheet .sheet-content').evaluateAll(nodes=>nodes.every(n=>n.scrollHeight<=n.clientHeight+1)));await preview.close();
    }
    // A later classification change refreshes reminders and leaves the drawing intact.
    await click('[data-do=edit-record] >> nth=0');await page.locator('#condition input[value=tileBroken]').uncheck();await click('#saveRecord');assert.match(await page.locator('#recordDetail').textContent(),/現況分類未勾選/);assert.deepEqual((await current()).records[0].detail,saved.records[0].detail);
    await page.waitForFunction(()=>document.querySelector('#offlineStatus').textContent==='離線已就緒');await context.setOffline(true);await page.reload();await click(`[data-field-detail="${r.id}"]`);await page.locator('#detailLinkage').evaluate(el=>el.open=true);assert.equal(await page.locator('#detailNote').inputValue(),note);
    // Changing the base clears marks with confirmation, but retains shared explanatory notes.
    await click('#chooseDetail');page.once('dialog',d=>d.accept());await click('[data-detail-preset=window]');assert.equal(await page.locator('#detailNote').inputValue(),note);await click('#saveDetail');assert.equal((await current()).records[0].detail.note,note);
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'v0.17-result.json'),JSON.stringify({passed:true,sharedPhotos:2,backupVersion:reports.version,errors,physicalPhoneTested:false},null,2));console.log('PASS V0.17 shared detail notes, condition suggestions/reminders, photo-content linkage, no base captions, reports, backup and offline');
  }finally{await context.close();}
}
