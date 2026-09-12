const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { createServer } = require('http'), assert = require('assert/strict');
const { chromium } = require('../../.github/pages-smoke/node_modules/playwright');
(async () => {
  const { VERSION } = await import('../model.js');
  const root = path.resolve(__dirname, '../..');
  for (const source of ['4b324a9cb4c995ef929a504b1a0842828e34a52b', 'd3eef357001a1a00dbbd0dbbab8263ae2105512d', '308fd259772dbe6efd42649e93e1226fe5910836']) {
  const from = JSON.parse(execFileSync('git', ['show', source + ':field-survey/package.json'], { cwd: root })).version, old = new Map(), fresh = new Map();
  const oldSW = execFileSync('git', ['show', source + ':field-survey/sw.js'], { cwd: root }).toString();
  const names = sw => [...sw.match(/const ASSETS = \[([^\]]+)\]/)[1].matchAll(/'\.\/([^']+)'/g)].map(x => x[1]);
  for (const name of [...names(oldSW), 'sw.js']) old.set(name, execFileSync('git', ['show', source + ':field-survey/' + name], { cwd: root }));
  const sw = fs.readFileSync(path.join(root, 'field-survey/sw.js'), 'utf8');
  for (const name of [...names(sw), 'sw.js']) fresh.set(name, fs.readFileSync(path.join(root, 'field-survey', name)));
  let phase = 0;
  const server = createServer((req,res) => { const name = new URL(req.url,'http://local').pathname.split('/').pop(), data = (phase ? fresh : old).get(name); if (!data) { res.writeHead(404); res.end(); return; } const mime = { '.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' }; res.writeHead(200, {'Content-Type':mime[path.extname(name)],'Cache-Control':name==='sw.js'?'no-store':'public, max-age=600'}); res.end(data); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({...(process.platform === 'win32' ? {channel:'chrome'} : {}),headless:true}), ctx = await browser.newContext(), page = await ctx.newPage();
  try {
    const url = `http://127.0.0.1:${server.address().port}/field-survey/recorder.html`; await page.goto(url); await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent==='離線已就緒');
    const before = await page.evaluate(async () => { const m=await import('./model.js'),s=await import('./store.js'),p=m.newProject('UPGRADE-DEMO','合成舊案升級','2026-09-09'),u=m.newUnit('A');p.units.push(u);const r=m.newRecord(u.id,'1F','客廳');Object.assign(r,{condition:'crack',component:'梁',location:'入口旁',measured:true,widthMode:'exact',width:.2,length:3});p.records.push(r);const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#345a48';ctx.fillRect(0,0,32,32);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),mid=m.id();p.media.push({id:mid,kind:'image',name:'synthetic-old-photo.png',type:blob.type,size:blob.size,sha256:await m.sha256(blob),importedAt:m.now()});r.photos.push({mediaId:mid,role:'overview',caption:'舊案合成照片',marks:[{type:'arrow',points:[{x:.2,y:.3},{x:.7,y:.6}]}],excluded:false,excludedReason:''});return s.saveProject(p,0,[{id:mid,blob}]); });
    await page.reload(); const stale = await ctx.newPage(); await stale.goto(url); await stale.locator('#recordForm').waitFor();
    const oldBundle = await page.evaluate(async () => { const s = await import('./store.js'), b = await import('./bundle.js'), p = (await s.allProjects())[0]; return { project: p, bytes: Array.from(new Uint8Array(await (await b.makeBundle(p, async id => (await s.getMedia(id)).blob)).blob.arrayBuffer())) }; });
    phase=1; await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update()); await page.locator('#updateApp').waitFor({state:'visible'}); await Promise.all([page.waitForEvent('load'),page.locator('#updateApp').click()]); await page.locator('#recordForm').waitFor();
    assert.equal(await page.title(),'現況鑑定紀錄 V' + VERSION);
    const after=await page.evaluate(async ()=>(await (await import('./store.js')).allProjects())[0]); const normalized=structuredClone(after);delete normalized.rooms; for(const r of normalized.records){delete r.roomId;delete r.fieldNumber;} normalized.revision=before.revision; normalized.updatedAt=before.updatedAt; assert.deepEqual(normalized,before);
    assert.equal(after.records[0].cracks, undefined); assert.equal(after.records[0].length, 3); assert(after.records[0].roomId);assert.equal(after.records[0].fieldNumber,1);const imageHash=await page.evaluate(async mid=>(await import('./model.js')).sha256((await (await import('./store.js')).getMedia(mid)).blob),before.media[0].id);assert.equal(imageHash,before.media[0].sha256);
    const oldRestore = await page.evaluate(async bytes => (await (await import('./bundle.js')).readBundle(new Blob([new Uint8Array(bytes)]))).project, oldBundle.bytes); assert.deepEqual(oldRestore, oldBundle.project);
    const refused=await stale.evaluate(async()=>{try{const s=await import('./store.js');await s.allProjects();return false;}catch(e){return e.name==='VersionError';}});assert(refused);await stale.close();
    await ctx.setOffline(true);await page.reload();await page.locator('[data-field-preset="u"]').click();await page.locator('#crackCountPresets [data-count="3"]').click();await page.locator('#saveRecord').click();await page.locator('#busy').waitFor({state:'hidden'});assert.equal(await page.evaluate(async()=>(await (await import('./store.js')).allProjects())[0].records[0].crackCount),3);
    fs.writeFileSync(path.join(root,'output/field-survey-validation/upgrade-from-' + from + '-result.json'),JSON.stringify({passed:true,from,to:VERSION,source,oldCasePreserved:true,originalPhotoHash:imageHash,originalPhotoPreserved:true,editableMarksPreserved:true,staleWriterRefused:true,offlineCountSaved:true,checkedAt:new Date().toISOString()},null,2));console.log('PASS real V' + from + ' source -> V' + VERSION + ' with fresh HTTP cache, room migration, stale DB writer refusal, offline count save');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
