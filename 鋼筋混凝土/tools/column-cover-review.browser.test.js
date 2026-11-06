// 私有本機 headless 回歸；每次啟動全新瀏覽器 profile，不接觸桌面瀏覽器或登入狀態。
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/pm-review');
const shots = process.env.PM_REVIEW_SHOTS || path.join(out, 'shots');
const baseline = process.env.PM_REVIEW_BASE || 'b579b0d304fabae65405a57ae19889a08a9b9d27';
const legacy = 'a47fb3b6edfd033e32173ad2b9479b62b33e9d90'; // PR86前的V3.3；不是修改版oracle。
const appPath = '鋼筋混凝土/tools/column.app.js';
const gitApp = ref => execFileSync('git', ['show', `${ref}:${appPath}`], { cwd:root, encoding:'utf8', maxBuffer:4e6 });
let checks = 0;
function check(ok, message) { assert.ok(ok, message); checks++; }
function equal(a, b, message) { assert.deepEqual(a, b, message); checks++; }
function hash(data) { return createHash('sha256').update(JSON.stringify(data)).digest('hex'); }
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, bytes) => {
    if (err) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' })[path.extname(file)] || 'application/octet-stream');
    res.end(bytes);
  });
});
async function configure(page, tc) {
  await page.evaluate(tc => {
    setColumnMode(tc.mode || 'check', { recalculate:false, applyPanel:tc.applyPanel !== false });
    for (const [id, value] of Object.entries(tc.checkboxes || {})) document.getElementById(id).checked = value;
    for (const [id, value] of Object.entries(tc.selects || {})) document.getElementById(id).value = String(value);
    syncColumnShapeDimensions(); // 先完成形狀切換的舊 h 還原，再填本案例尺寸。
    for (const [id, value] of Object.entries(tc.values || {})) document.getElementById(id).value = String(value);
    syncDesignFields(); calcColumn();
  }, tc);
}
async function numericBits(page) {
  return page.evaluate(() => {
    const values = {};
    const view = new DataView(new ArrayBuffer(8));
    function visit(value, key) {
      if (typeof value === 'number') {
        view.setFloat64(0, value, false);
        values[key] = [...new Uint8Array(view.buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
      } else if (value && typeof value === 'object') {
        for (const name of Object.keys(value).sort()) visit(value[name], `${key}.${name}`);
      }
    }
    visit(window.colLast, 'colLast'); visit(pmCurve, 'pmCurve'); visit(pmCurveY, 'pmCurveY');
    return values;
  });
}
async function main() {
  fs.mkdirSync(out, { recursive:true }); fs.mkdirSync(shots, { recursive:true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/${encodeURI('鋼筋混凝土/tools/column.html')}`;
  const browser = await chromium.launch({ headless:true, ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : {}) });
  const errors = [];
  async function pageFor(source, sharedSource) {
    const page = await browser.newPage({ viewport:{ width:1280, height:950 } });
    page.on('pageerror', e => errors.push(e.message));
    if (source) await page.route('**/column.app.js?*', route => route.fulfill({ contentType:'application/javascript', body:source }));
    if (sharedSource) await page.route('**/column-transverse-designer.js?*', route => route.fulfill({ contentType:'application/javascript', body:sharedSource }));
    await page.goto(url, { waitUntil:'load' });
    await page.waitForFunction(() => !!window.colLast);
    return page;
  }
  try {
    // Codex P2：真實中間試算失敗仍須列舉；失敗試算不得成為 colLast／計算書。
    const autoTrial = {
      mode:'design', applyPanel:false, checkboxes:{seismicMode:false,manualLayout:false,tieOverride:false,autoVe:false},
      selects:{colType:'rect',barNo:'#8',faceBarNo:'#8',tieNo:'#4'},
      values:{b:30,h:30,cover:4,fc:280,fy:4200,Pu:150,Mux:10,Muy:0,lu:100,Vu:30,Vuy:0,Ve:0},
    };
    const trialRecords = [];
    for (const kind of ['feasible-after-overlap','no-solution','trial-geometry-throws']) {
      const trial = await pageFor();
      await trial.evaluate(kind => {
        const trace = window.__trialTrace = {events:[],searches:0,invalidPm:0};
        const geometry = columnBarGeometryError, compute = computePMSection, search = ColumnRebarDesigner.search;
        let searching = false, injected = false;
        columnBarGeometryError = (...args) => {
          if (!searching && args[6] && kind === 'trial-geometry-throws' && !injected) {
            injected = true;
            trace.events.push('trial-throw');
            return longBarCenterInset(args[3], 0, args[5]); // 實際 helper 的例外，僅注入中間試算呼叫。
          }
          const error = geometry(...args);
          if (!searching && args[6] && error) trace.events.push('trial-invalid');
          return error;
        };
        computePMSection = (...args) => {
          if (geometry(args[8],args[0],args[1],args[4],args[11],args[9],args[10],args[5])) trace.invalidPm++;
          return compute(...args);
        };
        ColumnRebarDesigner.search = options => {
          trace.searches++;
          trace.events.push('search');
          searching = true;
          try { return trace.result = search(options); }
          finally { searching = false; }
        };
      }, kind);
      await configure(trial, {...autoTrial,values:{...autoTrial.values,...(kind === 'no-solution' ? {Vu:1000} : {})}});
      const trace = await trial.evaluate(() => window.__trialTrace);
      check(trace.events.indexOf(kind === 'trial-geometry-throws' ? 'trial-throw' : 'trial-invalid') >= 0, `${kind}: invalid intermediate trial was exercised`);
      equal(trace.events.at(-1), 'search', `${kind}: search occurs after the rejected trial`);
      equal(trace.searches, 1, `${kind}: independent real search runs once`);
      equal(trace.invalidPm, 0, `${kind}: invalid layouts never reach P-M calculation`);
      equal(await trial.evaluate(() => window.colLast), null, `${kind}: invalid trial is not a formal result`);
      equal(await trial.evaluate(() => buildColumnReport()), null, `${kind}: invalid trial cannot generate a report`);
      check(await trial.locator('#columnGeometryError').isVisible(), `${kind}: geometry rejection remains visible`);
      check(await trial.locator('#bannerStatus').evaluate(el => el.classList.contains('fail')), `${kind}: trial is not marked successful`);
      equal(await trial.locator('#pmCanvas').evaluate(cv => [...cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data].some(x => x)), false, `${kind}: stale P-M plot cleared`);
      await trial.locator('.section-tabs [data-tab="rebar"]').click();
      if (kind === 'no-solution') {
        equal(trace.result.status, 'no-solution', 'unachievable shear demand: actual search reports no solution');
        equal(trace.result.candidates, [], 'no-solution: no fabricated candidates');
        check((await trial.locator('#columnRebarDesignCandidates').textContent()).includes('未找到可直接套用方案'), 'no-solution: clear message');
        equal(await trial.locator('.column-design-apply').count(), 0, 'no-solution: no apply button');
        equal(await trial.evaluate(() => applyColumnRebarCandidate(0)), false, 'no-solution: no stale candidate can be applied');
      } else {
        check(trace.result.candidates.length > 0, `${kind}: real evaluator found legal alternatives`);
        const index = trace.result.candidates.findIndex(c => c.nBar === 12 && c.barNo === '#8' && c.transverse.tieNo === '#3' && c.transverse.spacing === 2.5);
        check(index >= 0, `${kind}: Codex 12-#8 / #3@2.5 alternative exists`);
        await trial.screenshot({path:path.join(shots,`${kind}-blocked-with-candidates.png`),fullPage:true});
        await trial.locator(`.column-design-apply[data-candidate-index="${index}"]`).click();
        const final = await trial.evaluate(() => {
          const r = window.colLast;
          return {mode:currentMode,bar:r.barNo,nBar:r.nBar,tie:r.tieNo,spacing:r.tieS,
            geometry:columnBarGeometryError(r.colType,r.b,r.h,r.cover,r.transverseDbForBars,r.db,r.columnLayout,r.nBar),
            checks:['okRhog','okNbar','okBarsPerSide','okLateralSupport','pmOk','okShearStrength','okShearAvMin','okShearSize'].map(key => [key,r[key]]),
            report:!!buildColumnReport()};
        });
        equal([final.mode,final.nBar,final.bar,final.tie,final.spacing], ['check',12,'#8','#3',2.5], `${kind}: UI apply runs the formal check on the selected bars`);
        equal(final.geometry, '', `${kind}: applied result passes geometry`);
        check(final.checks.every(([,ok]) => ok === true), `${kind}: applied result passes existing structural checks: ${JSON.stringify(final.checks)}`);
        check(final.report && await trial.locator('#columnGeometryError').isHidden(), `${kind}: report available only after valid formal recalculation`);
        trace.final = final;
      }
      await trial.screenshot({path:path.join(shots,`${kind}.png`),fullPage:true});
      trialRecords.push({kind,...trace});
      await trial.close();
    }
    fs.writeFileSync(path.join(out,'auto-trial-geometry.json'),JSON.stringify(trialRecords,null,2));

    const records = [];
    const scenario = {mode:'design',checkboxes:{seismicMode:true,manualLayout:false,tieOverride:false,autoVe:false},selects:{colType:'rect'},values:{fc:280,fy:4200,b:60,h:60,cover:4,Pu:200,Mux:40,Muy:0,Vu:20,Vuy:20,Ve:0}};
    const selectionScenarios = [{key:'selection-control',...scenario},{key:'legacy-five-to-four',...scenario,values:{...scenario.values,fc:210,Mux:60}}];
    const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'column-regression-cases.json'), 'utf8')).cases;
    fixtures.push(...selectionScenarios);
    // 比對所有 colLast / 兩向完整 P-M 曲線的數值葉節點 float64 bytes，不容許四捨五入或誤差容許值。
    for (const tc of fixtures) {
      const before = await pageFor(gitApp(baseline));
      const after = await pageFor();
      await configure(before, tc); await configure(after, tc);
      const a = await numericBits(before), b = await numericBits(after);
      check(Object.keys(a).length > 100, `${tc.key}: baseline produced real numeric results`);
      equal(b, a, `${tc.key}: every numeric leaf is bit-identical to master`);
      records.push({ key:tc.key, numericLeaves:Object.keys(a).length, baselineSha256:hash(a), revisedSha256:hash(b) });
      await before.close(); await after.close();
    }
    fs.writeFileSync(path.join(out, 'numeric-parity.json'), JSON.stringify({ baseline, records }, null, 2));

    const page = await pageFor();
    await configure(page, { mode:'check', values:{ b:60, h:60, cover:4 }, selects:{colType:'rect',barNo:'#8',faceBarNo:'#8',tieNo:'#4'} });
    equal(await page.locator('#columnBarCenterInset').textContent(), '6.540 cm', 'read-only actual center inset');
    check(await page.locator('#columnBarCenterInset').evaluate(el => el.tagName === 'OUTPUT'), 'display cannot become an editable project field');
    await page.locator('.section-tabs [data-tab="rebar"]').click();
    await page.locator('#tieNo').selectOption('#5');
    await page.locator('.section-tabs [data-tab="geom"]').click();
    equal(await page.locator('#columnBarCenterInset').textContent(), '6.858 cm', 'tie change updates geometry immediately');
    await page.screenshot({ path:path.join(shots, 'geometry-readonly.png'), fullPage:true });
    await page.setViewportSize({width:375,height:900});
    await page.screenshot({ path:path.join(shots, 'geometry-mobile.png'), fullPage:true });
    await page.setViewportSize({width:1280,height:950});

    const invalids = [
      {key:'small-section',selects:{colType:'rect',barNo:'#11',faceBarNo:'#11',tieNo:'#5'},values:{b:25,h:25,cover:6,nBar:4}},
      {key:'negative-radius',selects:{colType:'circle'},values:{b:20,cover:10}},
      {key:'equal-radius',selects:{colType:'circle',barNo:'#8',spiralBar:'#4'},values:{b:15.08,cover:5}},
      {key:'reversed-rectangle',selects:{colType:'rect'},values:{b:10,h:60,cover:5}},
      {key:'overlapping-circle',selects:{colType:'circle',barNo:'#11',spiralBar:'#5'},values:{b:25,cover:6,nBar:20}},
    ];
    for (const tc of invalids) {
      await configure(page, { ...tc, mode:'check', checkboxes:{manualLayout:false} });
      check(await page.locator('#columnGeometryError').isVisible(), `${tc.key}: visible UI error`);
      equal(await page.evaluate(() => window.colLast), null, `${tc.key}: no stale result`);
      equal(await page.evaluate(() => buildColumnReport()), null, `${tc.key}: report generation blocked`);
      check(await page.locator('#bannerStatus').evaluate(el => el.classList.contains('fail')), `${tc.key}: error cannot become a warning`);
      equal(await page.locator('#pmCanvas').evaluate(cv => [...cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data].some(x => x)), false, `${tc.key}: old P-M canvas cleared`);
      await page.screenshot({ path:path.join(shots, `${tc.key}.png`), fullPage:true });
    }
    await configure(page, { mode:'check', selects:{colType:'rect',barNo:'#8',faceBarNo:'#8',tieNo:'#4'}, values:{b:60,h:60,cover:4,nBar:12} });
    check(await page.evaluate(() => !!window.colLast), 'valid input recovers after rejection');
    check(await page.locator('#columnGeometryError').isHidden(), 'stale error cleared');
    // 真正圖面 fillText 輸出，不只搜尋來源字串。
    const labels = await page.evaluate(() => {
      const text = [], original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(label, ...args) { text.push(label); return original.call(this, label, ...args); };
      try { drawColumnSection(); renderColumnSectionForReport(window.colLast); }
      finally { CanvasRenderingContext2D.prototype.fillText = original; }
      return text;
    });
    check(labels.filter(t => /保護層（至箍筋外緣）/.test(t)).length >= 2, 'work-page and report canvas label measurement edge');
    check(await page.locator('#colSectionHint').textContent().then(t => t.includes('保護層（至箍筋外緣）')), 'section caption measurement edge');
    await page.locator('#colSectionCard').screenshot({ path:path.join(shots, 'section-label.png') });

    // 狀態注入只是檢查頁面adapter不能降低依賴回傳的錯誤層級，不改共用replay規則。
    const statuses = await page.evaluate(() => {
      const current = collectColumnProjectData();
      const oldPayload = RCReportFingerprint.withProjectCalculationFingerprint({ ...current, appVersion:'V3.3' }, {ignoredKeys:['activeTab']});
      const original = RCProjectReplay, show = showColumnProjectStatus;
      const result = [];
      showColumnProjectStatus = (text, status) => { result.push(status); show(text, status); };
      try {
        for (const status of ['error','fail','warn','ok']) {
          window.RCProjectReplay = {...original, describeProjectCalculationReplay: (...args) => ({...original.describeProjectCalculationReplay(...args), status})};
          applyColumnProjectData(oldPayload);
        }
      } finally { window.RCProjectReplay = original; showColumnProjectStatus = show; }
      return result;
    });
    equal(statuses, ['error','fail','warn','warn'], 'legacy disclosure preserves error/fail ahead of warn');

    const behavior = [];

    const permutations = [['#3','#4','#5'],['#3','#5','#4'],['#4','#3','#5'],['#4','#5','#3'],['#5','#3','#4'],['#5','#4','#3']];
    for (const selectedCase of selectionScenarios) {
      for (const ref of [legacy,baseline,'working-tree']) {
        const firsts = [];
        for (const order of permutations) {
          let source = ref === 'working-tree' ? fs.readFileSync(path.join(root,appPath),'utf8') : gitApp(ref);
          if (source.includes("Object.freeze(['#3', '#4', '#5'])")) source = source.replace("Object.freeze(['#3', '#4', '#5'])", `Object.freeze(${JSON.stringify(order)})`);
          // V3.3沒有頁面候選清單；僅在隔離測試中排列該版 shared 的相同三種候選。
          const sharedRef = ref === 'working-tree' ? baseline : ref;
          const shared = execFileSync('git', ['show', `${sharedRef}:鋼筋混凝土/shared/column-transverse-designer.js`], {cwd:root,encoding:'utf8'}).replace("const DEFAULT_BARS = ['#3', '#4', '#5'];", `const DEFAULT_BARS = ${JSON.stringify(order)};`);
          const candidatePage = await pageFor(source, shared);
          await configure(candidatePage, selectedCase);
          const result = await candidatePage.evaluate(() => window.colLast.designSearch.candidates.map(c => ({barNo:c.barNo,nBar:c.nBar,tieNo:c.transverse.tieNo,spacing:c.transverse.spacing,pm:c.pmUtilization})));
          check(result.length > 0, `${ref}: integrated candidates exist`);
          const control = selectedCase.key === 'selection-control';
          equal([result[0].barNo,result[0].nBar,result[0].tieNo,result[0].spacing], control ? ['#11',4,'#5',7.5] : ['#9',8,ref === legacy ? '#5' : '#4',ref === legacy ? 10 : 5], `${selectedCase.key}: selection behavior is explicit, not silently changed`);
          firsts.push(result[0]);
          behavior.push({case:selectedCase.key,ref,order,first:result[0]});
          await candidatePage.close();
        }
        equal(firsts, permutations.map(() => firsts[0]), `${selectedCase.key} ${ref}: all 3! candidate orders give identical selection`);
      }
    }
    // 僅在隔離測試 source 插入觀測點，讀到真正 candidateDepth 的 tDb；正式頁面不加 hook。
    const depthLine = 'const candidateDepth = buildShearDepths(colType, b, h, cover, candidate.nBar, candidate.ab, candidate.db, layout, tDb);';
    const currentSource = fs.readFileSync(path.join(root,appPath),'utf8');
    check(currentSource.includes(depthLine), 'candidate depth observation point exists');
    const observedSource = currentSource.replace(depthLine, depthLine + '\n              window.__candidateDepths?.push({transverseNo,tDb,barNo:candidate.barNo,nBar:candidate.nBar,d_x:candidateDepth.d_x,d_y:candidateDepth.d_y});');
    const consistencies = [];
    const dbCases = [
      {type:'rect',values:{...scenario.values,b:60,h:80}},
      {type:'rect',values:{...scenario.values,fc:210,Mux:60}},
      {type:'rect',values:{...scenario.values,Mux:78}},
      {type:'circle',values:{...scenario.values,b:80,h:80}},
      {type:'circleTied',values:{...scenario.values,b:80,h:80}},
    ];
    for (const {type,values} of dbCases) {
      const observed = await pageFor(observedSource);
      await observed.evaluate(() => { window.__candidateDepths = []; });
      await configure(observed, {...scenario,selects:{colType:type},values});
      const consistency = await observed.evaluate(() => {
        const r = window.colLast, c = r.designSearch.candidates[0];
        const no = c.transverse.tieNo || c.transverse.hoopNo;
        const tDb = REBAR_TABLE[no].db;
        const actual = window.__candidateDepths.filter(d => d.transverseNo === no && d.barNo === c.barNo && d.nBar === c.nBar);
        const applied = applyColumnRebarCandidate(0), final = window.colLast;
        return { applied, selected:no, tDb, finalDb:final.transverseDbForBars, observations:actual.length,
          candidateDbSame:actual.length > 0 && actual.every(d => Object.is(d.tDb,tDb)),
          depthSame:actual.some(d => Object.is(d.d_x,final.d_x) && Object.is(d.d_y,final.d_y)) };
      });
      check(consistency.applied && Object.is(consistency.tDb,consistency.finalDb) && consistency.candidateDbSame && consistency.depthSame, `${type}: observed candidateDepth and final transverseDbForBars equal selected db`);
      consistencies.push({type,...consistency});
      await observed.close();
    }
    fs.writeFileSync(path.join(out,'selected-db-consistency.json'),JSON.stringify(consistencies,null,2));
    fs.writeFileSync(path.join(out,'design-behavior.json'),JSON.stringify(behavior,null,2));
    equal(errors, [], 'no uncaught browser errors');
    fs.writeFileSync(path.join(out,'browser-summary.json'), JSON.stringify({ checks, fixtures:records.length,numericLeaves:records.reduce((n,r)=>n+r.numericLeaves,0),errors,shots },null,2));
    console.log(`column cover review browser: ${checks} checks PASS; ${records.length} scenarios bit-identical`);
    await page.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e); server.close(); process.exitCode=1; });
