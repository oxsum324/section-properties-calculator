import { clickSurvey } from './ui-click.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyV022(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const click = selector => clickSurvey(page, selector);
  const current = () => page.evaluate(async () => (await (await import('./store.js')).allProjects())[0]);
  const tap = async (x,y) => {
    const p = await page.locator('#detailStage svg').evaluate((svg,[x,y]) => { const v=svg.viewBox.baseVal, p=new DOMPoint(v.x+x*v.width,v.y+y*v.height).matrixTransform(svg.getScreenCTM()); return {x:p.x,y:p.y}; }, [x,y]);
    await page.mouse.click(p.x,p.y);
  };
  const stageBox = () => page.locator('#detailStage').boundingBox();
  try {
    await page.goto(base);
    await page.evaluate(async () => {
      const m=await import('./model.js'), s=await import('./store.js'), p=m.newProject('V022','操作介面合成測試','2026-09-20'),u=m.newUnit('A戶'),r=m.newRecord(u.id,'2F','客廳');
      r.location='原位置'; p.units.push(u); p.records.push(r); await s.saveProject(m.syncRooms(p),0,[]);
    });
    await page.reload(); await page.locator('#recordForm').waitFor();
    // Starting at the footer must preserve the draft and return to the heading,
    // without the sticky context covering it or triggering the phone keyboard.
    for (const width of [320,390,1280]) {
      await page.setViewportSize({width,height:844}); await page.locator('#location').fill('待保存 '+width);
      await click('#nextRecord');
      await page.waitForFunction(() => document.activeElement?.id === 'recordHeading');
      const position=await page.evaluate(() => ({heading:document.querySelector('#recordHeading').getBoundingClientRect().top,strip:document.querySelector('#contextStrip').getBoundingClientRect().bottom,scroll:scrollY}));
      assert(position.heading >= position.strip + 5 && position.heading < position.strip + 35, JSON.stringify(position));
      const p=await current(); assert.equal(p.records.at(-2).location,'待保存 '+width); assert.equal(p.records.at(-1).floor,'2F'); assert.equal(p.records.at(-1).space,'客廳');
    }
    await page.setViewportSize({width:390,height:844});
    await click('[data-field-detail]'); await click('[data-detail-preset=flatWindow]'); await page.locator('#detailStage svg').waitFor();
    const layouts=[];
    for (const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390},{width:1280,height:900}]) {
      await page.setViewportSize(viewport); const before=await stageBox(); await page.screenshot({path:path.join(out,`v0.22-inspect-${viewport.width}.png`)});
      assert(before.height >= (viewport.width===844 ? 170 : 260), `Canvas too short ${JSON.stringify({viewport,before})}`);
      for (const mode of ['door','window','text','select','region','pan','line']) {
        await click(`[data-detail-tool=${mode}]`); const after=await stageBox();
        assert(Math.abs(before.y-after.y)<1 && Math.abs(before.height-after.height)<1,'Switching tools must not shift the canvas');
      }
      assert(await page.locator('#modal').evaluate(el=>el.scrollHeight<=el.clientHeight+1 && el.scrollWidth<=el.clientWidth+1),'No whole-dialog scrolling');
      const save=await page.locator('#saveDetail').boundingBox(); assert(save.y+save.height<=viewport.height && save.y>=0);
      await page.screenshot({path:path.join(out,`v0.22-detail-${viewport.width}.png`)}); layouts.push({viewport,canvas:before});
    }
    await page.setViewportSize({width:390,height:844}); const before=await stageBox();
    // Reduced portrait height approximates the space left by a software keyboard.
    await page.setViewportSize({width:390,height:420}); await click('[data-detail-tool=text]');
    assert((await stageBox()).height >= 90);
    assert(await page.locator('#modal').evaluate(el=>el.scrollHeight<=el.clientHeight+1));
    assert((await page.locator('#saveDetail').boundingBox()).y + (await page.locator('#saveDetail').boundingBox()).height <= 420);
    await page.setViewportSize({width:390,height:844});
    await click('[data-detail-tool=symbol]'); await page.screenshot({path:path.join(out,'v0.22-symbol-picker.png')});
    assert.equal(await page.locator('[data-detail-symbol]').count(),10); await click('[data-detail-symbol=damp]');
    await page.locator('#detailSymbolSize').selectOption('0.14'); await tap(.38,.45);
    await page.locator('#detailSymbolSize').selectOption('0.36'); await tap(.65,.6);
    assert.deepEqual(await stageBox(),before,'Symbol selection/size does not shift the drawing area');
    await click('[data-detail-tool=select]'); await page.locator('#detailObject').selectOption('0');
    await click('#detailSelectionMore>summary'); await click('#detailRotate'); await click('#detailShrink'); await click('#detailSelectionMore [data-close-detail-panel]');
    await click('#detailMore>summary'); const waiting=page.waitForEvent('download'); await click('#downloadDetail'); await (await waiting).saveAs(path.join(out,'v0.22-detail.png'));
    await click('#detailMore [data-close-detail-panel]'); await click('#saveDetail');
    const detail=(await current()).records.at(-1).detail;
    assert.equal(detail.preset,'flatWindow'); assert.equal(detail.marks[0].rotation,15); assert(Math.abs(detail.marks[0].size-.112)<1e-8); assert.equal(detail.marks[1].size,.36);
    await page.waitForFunction(()=>document.querySelector('#offlineStatus').textContent==='離線已就緒');
    await context.setOffline(true); await page.reload(); await page.locator('#recordForm').waitFor();
    // Select the last record after reloading (the app may initially select the first).
    const p=await current(); await click(`[data-record="${p.records.at(-1).id}"]`);
    await click('[data-field-detail]'); await page.locator('#detailStage svg').waitFor(); assert.equal(await page.locator('#detailStage [data-detail-index]').count(),2);
    await click('#closeModal'); assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(out,'v0.22-result.json'),JSON.stringify({passed:true,layouts,errors,physicalPhoneTested:false},null,2));
    console.log('PASS V0.22 next-position scroll/focus/save, stable compact drawing UI, symbol sizes, PNG, persistence and offline');
  } finally { await context.close(); }
}
