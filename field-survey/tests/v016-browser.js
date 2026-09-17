import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV016(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const click = async selector => { await page.locator(selector).click(); await page.locator('#busy').waitFor({ state: 'hidden' }); };
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects()).find(p => p.code === 'V016'));
  const tap = async (x,y) => { const p = await page.locator('#detailStage svg').evaluate((svg,[x,y]) => { const b = svg.viewBox.baseVal, p = new DOMPoint(b.x + x*b.width, b.y+y*b.height).matrixTransform(svg.getScreenCTM()); return { x:p.x,y:p.y }; },[x,y]); await page.touchscreen.tap(p.x,p.y); };
  try {
    await page.goto(base); await page.locator('#caseSelect').waitFor();
    const keys = await page.evaluate(async () => {
      const m = await import('./model.js'), s = await import('./store.js'), g = await import('./detail-geometry.js'), p = m.newProject('V016','十款圖示合成測試','2026-09-17'), u = m.newUnit('A戶'), r = m.newRecord(u.id,'1F','客廳'); p.units.push(u);p.records.push(r);
      Object.assign(r,{condition:'crack',component:'牆面',location:'窗邊',reportText:'現場人工說明保留',detail:{kind:'preset',preset:'wall',mirror:false,marks:[]}});
      const c=document.createElement('canvas');c.width=400;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle='#ddd';ctx.fillRect(0,0,400,300);const blob=await new Promise(resolve=>c.toBlob(resolve)),id=m.id();
      p.media.push({id,name:'合成照片.png',kind:'image',size:blob.size,type:blob.type,sha256:await m.sha256(blob),importedAt:m.now()});r.photos.push({mediaId:id,role:'overview',caption:'合成照片',marks:[],excluded:false,excludedReason:''});await s.saveProject(m.syncRooms(p),0,[{id,blob,thumb:blob}]);return Object.keys(g.DETAIL_SYMBOLS);
    });
    assert.equal(keys.length,10);await page.reload();await page.locator('#recordForm').waitFor();const before=(await current()).records[0];await click(`[data-field-detail="${before.id}"]`);
    await click('[data-detail-tool=symbol]');assert.equal(await page.locator('[data-detail-symbol]').count(),10);
    // The last option stays reachable on narrow portrait and landscape screens.
    for(const [width,height] of [[320,740],[390,844],[844,390]]) {
      await page.setViewportSize({width,height});await page.locator('[data-detail-symbol=paintBlister]').scrollIntoViewIfNeeded();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const button=await page.locator('[data-detail-symbol=paintBlister]').boundingBox();assert(button.width>=44&&button.height>=44);
      await page.screenshot({path:path.join(out,`v0.16-picker-${width}.png`)});
    }
    await page.setViewportSize({width:390,height:844});
    for(const [i,key] of keys.entries()) { await click('[data-detail-tool=symbol]');await click(`[data-detail-symbol=${key}]`);await tap(.18+i%5*.16,i<5?.35:.7); }
    assert.equal(await page.locator('#detailStage [data-detail-index]').count(),10);assert.match(await page.locator('#detailLegend').textContent(),/10/);
    await click('[data-detail-tool=select]');await page.locator('#detailObject').selectOption('4');await click('#detailRotate');await click('#detailGrow');await click('#detailCopy');await click('#detailDelete');
    await click('#saveDetail');const saved=(await current()).records[0];assert.deepEqual(saved.detail.marks.map(m=>m.symbol),keys);assert.equal(saved.detail.marks[4].rotation,15);
    for(const key of ['condition','conditions','crackPattern','width','length','tiles','reportText','photos'])assert.deepEqual(saved[key],before[key]);
    const result = await page.evaluate(async () => {
      const m=await import('./model.js'),s=await import('./store.js'),b=await import('./bundle.js'),d=await import('./detail.js'),r=await import('./report.js'),g=await import('./detail-geometry.js'),p=(await s.allProjects())[0],get=async id=>(await s.getMedia(id)).blob;
      const bundle=await b.readBundle((await b.makeBundle(p,get)).blob);m.validateProject(bundle.project);
      const labels=[],original=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){labels.push({text,x,y,end:x+this.measureText(text).width,width:this.canvas.width,height:this.canvas.height});return original.call(this,text,x,y,...args);};
      let png;try{png=await d.detailImage(p.records[0].detail,get);}finally{CanvasRenderingContext2D.prototype.fillText=original;}
      const bitmap=await createImageBitmap(png),size={width:bitmap.width,height:bitmap.height};bitmap.close();const expected=await m.sha256(png),hashes=[];
      for(const format of ['quick','standard']) { const report=await r.renderAttachment(p,get,{format}),doc=new DOMParser().parseFromString(report.html,'text/html'),src=doc.querySelector('.detail-img').src;hashes.push(await m.sha256(Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0)))); }
      return {version:bundle.manifest.version,equal:JSON.stringify(bundle.project)===JSON.stringify(p),names:Object.values(g.DETAIL_SYMBOLS),labels,size,hashes,expected,png:Array.from(new Uint8Array(await png.arrayBuffer()))};
    });
    assert.equal(result.version, 11);assert(result.equal);assert(result.hashes.every(h=>h===result.expected));
    assert.deepEqual(result.labels.slice(0,10).map(l=>l.text),result.names);assert.equal(new Set(result.labels.slice(0,10).map(l=>l.y)).size,4);
    assert(result.labels.every(l=>l.x>=0&&l.end<=l.width&&l.y>640&&l.y<l.height));assert.equal(result.size.width,1200);assert(result.size.height>840);
    await fs.writeFile(path.join(out,'v0.16-ten-icons-detail.png'),Buffer.from(result.png));
    await page.waitForFunction(()=>document.querySelector('#offlineStatus').textContent==='離線已就緒');await context.setOffline(true);await page.reload();await click(`[data-field-detail="${before.id}"]`);assert.equal(await page.locator('#detailStage [data-detail-index]').count(),10);await click('#saveDetail');assert.deepEqual((await current()).records[0].detail,saved.detail);
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'v0.16-result.json'),JSON.stringify({passed:true,icons:keys,backupVersion:result.version,reportHash:result.expected,legendRows:4,errors,physicalPhoneTested:false},null,2));console.log('PASS V0.16 ten icons, narrow picker, editing, four-row legend, PNG/report match, backup and offline persistence');
  } finally { await context.close(); }
}
