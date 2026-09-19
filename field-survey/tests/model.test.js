import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newUnit, newRecord, id, now, sha256, validateProject, recordIssues, unitIssues, subset, restoredCopy, widthMode, recordComponents, recordConditions, emptySketch, validateSketch } from '../model.js';
import { makeBundle, readBundle, snapshot, makeReceipt, checkReceipt } from '../bundle.js';
import { resolveSketchPoint, doorGeometry, expandSketch, sketchArea, sketchView, hitSketch, deleteSketchSelection } from '../sketch.js';
import { syncRooms, clearWrongFloor, observationText, tileTotal, photoPlacement } from '../model.js';
import { attachmentIndex, attachmentUnits, reportPhotos, groupPlanEntries, moveRoom, textChunks } from '../report.js';
import { stairGeometry } from '../stairs.js';
import { parseRoster } from '../organisation.js';
import { recordDateInfo, validDate } from '../model.js';
import { splitVolumes } from '../report-standard.js';
import { planLabelLayout } from '../annotation.js';
import { segmentHitsBox } from '../plan-labels.js';
import { CONDITIONS, COMMON_CONDITIONS, CONDITION_GROUPS } from '../model.js';
import { DETAIL_SYMBOLS, moveDetailMark, mirrorDetailMarks, splitDetailLine, symbolBox } from '../detail-geometry.js';
import { removeRecordPhotos, validateMarks } from '../model.js';
import { detailAnnotationText, detailComparison } from '../model.js';
import { planTemplateCopy } from '../model.js';

test('standard-floor copies isolate geometry and omit source positioning labels', () => {
  const source={id:'source',unitId:'A',floor:'1F',title:'來源圖',mediaId:'old',sketch:{...emptySketch(),strokes:[{type:'line',points:[{x:.2,y:.2},{x:.7,y:.2}]}]},labelLayout:[{id:'old-photo'}]},before=structuredClone(source);
  const copy=planTemplateCopy(source,{unitId:'A',floor:' 2F ',title:'二樓平面',mediaId:'new'});assert.equal(copy.floor,'2F');assert.notEqual(copy.id,source.id);assert.equal(copy.labelLayout,undefined);assert.equal(copy.mediaId,'new');assert.deepEqual(copy.sketch,source.sketch);copy.sketch.strokes[0].points[0].x=.4;assert.deepEqual(source,before);
  assert.throws(()=>planTemplateCopy(source,{unitId:'B',floor:'2F',title:'二樓',mediaId:'new'}),/本戶/);assert.throws(()=>planTemplateCopy(source,{unitId:'A',floor:' ',title:'二樓',mediaId:'new'}),/樓層/);
  const image=planTemplateCopy({...source,sketch:undefined},{unitId:'A',floor:'3F',title:'三樓',mediaId:'new-image'});assert.equal(image.sketch,undefined);assert.equal(image.labelLayout,undefined);
});

test('detail summary links actual marks and notes without base names or invented measurements', async () => {
  const { p, r, blobs } = await fixture(); r.condition = 'crack'; r.conditions = ['crack', 'tileBroken']; r.reportText = '保留人工照片內容';
  r.detail = { kind:'preset',preset:'wall',mirror:false,note:'裂縫 A 在窗角\n破損磁磚在下方',marks:[{type:'symbol',symbol:'tileBroken',points:[{x:.5,y:.5}],size:.24,rotation:0,mirror:false},{type:'text',text:'裂縫 A',points:[{x:.3,y:.3}]}] };
  const before = structuredClone(r), summary = detailAnnotationText(r.detail);
  assert.match(summary,/細圖標註：磁磚破損/);assert.match(summary,/圖中文字：裂縫 A/);assert.match(summary,/細圖補充：裂縫 A 在窗角\n破損磁磚在下方/);assert.doesNotMatch(summary,/完整牆面|wall|m²|mm|塊/);
  assert.deepEqual(detailComparison(r).missing,['crack']);assert.match(detailComparison(r).hints[0],/核對手繪或文字/);assert.deepEqual(r,before);
  const index=attachmentIndex(p).groups[0].records[0];assert.equal(index.detailText,summary);assert.equal(index.text,'保留人工照片內容');
  const restored=await readBundle((await makeBundle(p,id=>blobs.get(id))).blob);assert.deepEqual(restored.project.records[0],before);assert.equal(restored.manifest.version,14);
  const copy=restoredCopy(restored.project).project;assert.equal(copy.records[0].detail.note,r.detail.note);
  r.detail.note='a'.repeat(2001);assert.throws(()=>validateProject(p),/細圖補充/);r.detail.note=42;assert.throws(()=>validateProject(p),/細圖補充/);
});

test('detail reminders compare typed observations in both directions without interpreting freehand', () => {
  const symbol = value => ({type:'symbol',symbol:value,points:[{x:.5,y:.5}],size:.24,rotation:0,mirror:false});
  const r={condition:'crack',conditions:['crack','tileBroken'],detail:{kind:'preset',preset:'wall',mirror:false,marks:[symbol('network')]}};
  assert.deepEqual(detailComparison(r).missing,['tileBroken']);assert.match(detailComparison(r).hints[0],/細圖尚無對應/);
  r.detail.marks.push(symbol('tileBroken'));assert.deepEqual(detailComparison(r).hints,[]);
  r.conditions=['normal'];r.condition='normal';assert.deepEqual(detailComparison(r).extra,['crack','tileBroken']);assert.match(detailComparison(r).hints[0],/現況分類未勾選/);
  r.conditions=['crack'];r.condition='crack';r.detail.marks=[{type:'pen',points:[{x:.1,y:.1},{x:.2,y:.2}]}];assert.deepEqual(detailComparison(r).drawn,[]);assert.match(detailComparison(r).hints[0],/核對手繪/);
  r.detail={kind:'text',value:'photo',note:'已在照片圈註'};assert.deepEqual(detailComparison(r).hints,[]);assert.match(detailAnnotationText(r.detail),/細圖補充/);
  delete r.detail;assert.match(detailComparison(r).hints[0],/尚未建立/);
});

test('selected photo deletion preserves other records and shared assets, removes main and label references', async () => {
  const { p, r, blobs } = await fixture(), other = p.records[1], mid = r.photos[0].mediaId;
  r.detail = { kind: 'preset', preset: 'wall', mirror: false, marks: [] };
  other.photos.push(structuredClone(r.photos[0])); r.mainPhotoId = mid;
  const before = structuredClone(other), detail = structuredClone(r.detail);
  const original = structuredClone(p);
  assert.throws(() => removeRecordPhotos(p, r.id, [id()]), /重新選取/); assert.deepEqual(p, original);
  removeRecordPhotos(p, r.id, [mid]); validateProject(p);
  assert.equal(r.photos.length, 0); assert.equal(r.mainPhotoId, undefined); assert.deepEqual(r.detail, detail); assert.deepEqual(other, before); assert(p.media.some(m => m.id === mid));
  removeRecordPhotos(p, other.id, [mid]); validateProject(p); assert(!p.media.some(m => m.id === mid));
  const result = await readBundle((await makeBundle(p, id => blobs.get(id))).blob); assert(!result.project.media.some(m => m.id === mid));
});

test('editable openings retain geometry through backup and mirror and reject degenerate or photo-only marks', async () => {
  const { p, r, blobs } = await fixture();
  const marks = ['door', 'window'].map(kind => ({ type: 'opening', kind, points: [{ x: .2, y: .3 }, { x: .4, y: .8 }] }));
  r.detail = { kind: 'preset', preset: 'wall', mirror: false, marks }; validateProject(p);
  const backup = await readBundle((await makeBundle(p, id => blobs.get(id))).blob); assert.equal(backup.manifest.version, 14); assert.deepEqual(backup.project.records[0].detail, r.detail);
  const mirrored = mirrorDetailMarks(marks); assert(Math.abs(mirrored[0].points[0].x - .8) < 1e-9); validateMarks(mirrored, true);
  assert.throws(() => validateMarks(marks), /圈註種類/);
  for (const mutation of [m => { m.points[1].x = m.points[0].x; }, m => { m.kind = 'unknown'; }, m => { m.points.push({ x: .5, y: .5 }); }]) { const bad = structuredClone(marks); mutation(bad[0]); assert.throws(() => validateMarks(bad, true), /門窗開口/); }
});

test('detail signs and regions preserve observed quantities, old strokes, manual text and isolated backup', async () => {
  const { p, r, blobs } = await fixture(); r.reportText = '人工描述不改寫'; r.condition = 'crack'; r.crackPattern = 'network';
  r.detail = { kind: 'preset', preset: 'wall', mirror: false, marks: [
    { type: 'pen', points: [{ x: .1, y: .1 }, { x: .3, y: .3 }] },
    ...Object.keys(DETAIL_SYMBOLS).map(symbol => ({ type: 'symbol', symbol, points: [{ x: .5, y: .5 }], size: .24, rotation: 15, mirror: false })),
    { type: 'region', condition: 'damp', points: [{ x: .2, y: .2 }, { x: .4, y: .2 }, { x: .3, y: .5 }] }
  ] };
  const original = structuredClone(r); validateProject(p); assert.deepEqual(recordIssues(r), []);
  const restored = await readBundle((await makeBundle(p, mid => blobs.get(mid))).blob); assert.equal(restored.manifest.version, 14); assert.deepEqual(restored.project.records[0], original);
  const copy = restoredCopy(restored.project).project; validateProject(copy); assert.deepEqual(copy.records[0].detail, r.detail); assert.equal(copy.records[0].reportText, original.reportText);
  r.photos[0].marks = [r.detail.marks[1]]; assert.throws(() => validateProject(p), /圈註/);
});

test('detail symbols reject malformed geometry and unsupported conditions', async () => {
  const { p, r } = await fixture(), mark = { type: 'symbol', symbol: 'network', points: [{ x: .5, y: .5 }], size: .24, rotation: 15, mirror: false };
  for (const change of [{ symbol: 'tile' }, { size: NaN }, { size: 0 }, { rotation: 360 }, { mirror: 'yes' }, { points: [] }]) {
    r.detail = { kind: 'preset', preset: 'beam', mirror: false, marks: [{ ...mark, ...change }] }; assert.throws(() => validateProject(p));
  }
  r.detail.marks = [{ type: 'region', condition: 'diagnosis', points: [{ x: .1, y: .1 }, { x: .2, y: .1 }, { x: .2, y: .2 }] }]; assert.throws(() => validateProject(p), /範圍/);
  r.detail.marks = [{ type: 'region', condition: 'damp', points: [{ x: .1, y: .1 }, { x: .2, y: .2 }, { x: .3, y: .3 }] }]; assert.throws(() => validateProject(p), /範圍/);
});

test('detail mirror, bounded moves and segment deletion preserve editable geometry without bridging gaps', () => {
  const mark = { type: 'symbol', symbol: 'network', points: [{ x: .5, y: .5 }], size: .7, rotation: 45, mirror: false }, before = structuredClone(mark);
  assert.deepEqual(mirrorDetailMarks(mirrorDetailMarks([mark])), [mark]);
  for (const [w,h] of [[1200,640],[640,1200]]) { const moved = moveDetailMark(mark, 5, -5, w,h), box = symbolBox(moved,w,h); assert(box.x >= -1e-10 && box.y >= -1e-10 && box.x + box.w <= 1 + 1e-10 && box.y + box.h <= 1 + 1e-10); }
  assert.deepEqual(mark, before);
  const line = { type: 'pen', points: Array.from({length:5},(_,i)=>({x:i/5,y:.5})) }, pieces = splitDetailLine(line, 2);
  assert.deepEqual(pieces.map(p=>p.points.length), [3,2]); assert.equal(pieces[0].points.at(-1).x, .4); assert.equal(pieces[1].points[0].x,.6);
});

test('expanded conditions and independent observation layers survive backup and both report indexes', async () => {
  const { p, r, blobs } = await fixture();
  const keys = [...COMMON_CONDITIONS, ...CONDITION_GROUPS.flatMap(([, keys]) => keys)];
  assert.equal(new Set(keys).size, keys.length); assert.equal(keys.length, Object.keys(CONDITIONS).length - 2);
  Object.assign(r, { condition: 'crack', conditions: keys, crackLayer: 'unknown', leakForms: ['drip', 'seep'], cracks: [
    { id: id(), measured: true, widthMode: 'exact', width: .2, length: 1, pattern: 'vertical', notes: '', layer: 'plaster' },
    { id: id(), measured: false, widthMode: 'unknown', width: null, length: null, pattern: 'diagonal', notes: '', layer: 'structural' }
  ] });
  validateProject(p); const saved = await readBundle((await makeBundle(p, mid => blobs.get(mid))).blob);
  assert.equal(saved.manifest.version, 14); assert.deepEqual(saved.project.records[0], r);
  for (const format of ['quick', 'standard']) {
    const row = attachmentIndex(p, { format }).groups[0].records[0];
    assert.deepEqual(row.conditions, keys); assert.match(row.text, /裂縫 A.*粉刷層/); assert.match(row.text, /裂縫 B.*結構體/);
    assert.match(row.text, /滲水痕/); assert(!row.text.includes('滲水跡')); assert.match(row.text, /現場可見漏水（滴水、滲出）/);
    for (const key of keys.filter(k => !['crack', 'activeLeak'].includes(k))) assert(row.text.includes(CONDITIONS[key]), key);
  }
  r.conditions = ['damp']; r.condition = 'damp';
  assert(!observationText(r).includes('漏水')); assert(!observationText(r).includes('觀察層位')); assert(!observationText(r).includes('裂縫 A'));
});

test('new tile damage keeps independent counts and never double counts bulging overlap', async () => {
  const { p, r } = await fixture();
  Object.assign(r, { condition: 'tileBulge', conditions: ['tileBulge', 'tileBroken'], tiles: { crack: false, broken: true, bulge: true, approx: false, crackCount: null, brokenCount: 2, bulgeCount: 20, overlapCount: null } });
  validateProject(p); const text = observationText(r);
  assert.match(text, /磁磚拱起 20 塊/); assert.equal((text.match(/磁磚破損/g) || []).length, 1); assert(!text.includes('合計')); assert.equal(tileTotal(r.tiles), null);
  r.tiles.broken = false; r.conditions = ['tileBulge']; assert.equal(tileTotal(r.tiles), 20);
  r.tiles.bulgeText = '二十餘塊'; r.tiles.bulgeCount = null; validateProject(p); assert.equal(tileTotal(r.tiles), null); assert.match(observationText(r), /二十餘塊/);
  r.tiles.bulgeCount = 21; assert.throws(() => validateProject(p), /推算/);
});

test('observation layers and leak forms reject invented or duplicate facts without requiring diagnosis', async () => {
  const { p, r } = await fixture(); r.condition = 'crack'; r.crackPattern = 'network';
  assert.match(observationText(r), /觀察層位：不確定/); assert.deepEqual(recordIssues(r), []);
  r.crackLayer = 'safe'; assert.throws(() => validateProject(p), /層位/); r.crackLayer = 'unknown';
  for (const forms of [['drip', 'drip'], ['residentReported'], 'drip']) { r.leakForms = forms; assert.throws(() => validateProject(p), /漏水/); }
  r.leakForms = ['drip']; r.condition = 'damp'; r.resident = '住戶說昨天漏水'; validateProject(p); assert.equal(observationText(r).includes('現場可見漏水'), false);
});

test('dense report labels avoid overlap without changing camera points or caller data', () => {
  const items = Array.from({ length: 18 }, (_, i) => ({ ax: 280 + i * 4, ay: 300, w: 85, h: 26 })), before = structuredClone(items), result = planLabelLayout(items, 1200, 800);
  assert.deepEqual(items, before); assert.equal(result.length, items.length);
  result.forEach((a, i) => { assert.equal(a.ax, items[i].ax); assert.equal(a.ay, items[i].ay); assert(a.x >= 0 && a.y >= 0 && a.x + a.w <= 1200 && a.y + a.h <= 800); result.slice(i + 1).forEach(b => assert(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)); });
});

test('label avoidance includes full diagonal shafts, arrowhead wings, circles and reserved locked positions', () => {
  const segments = [{ a: { x: 80, y: 80 }, b: { x: 1100, y: 700 }, pad: 4 }, { a: { x: 700, y: 120 }, b: { x: 1100, y: 700 }, pad: 4 }];
  const points = [{ x: 200, y: 100, r: 35 }], items = [
    { ax: 200, ay: 100, w: 85, h: 35 },
    { ax: 200, ay: 100, w: 85, h: 35, preferred: { x: .3, y: .04, locked: true } },
    { ax: 650, ay: 460, w: 160, h: 70 }
  ], before = structuredClone(items), result = planLabelLayout(items, 1200, 800, { segments, points });
  assert.deepEqual(items, before); assert.equal(result[1].x, 360); assert.equal(result[1].y, 32);
  for (const box of result) for (const s of segments) assert(!segmentHitsBox(s.a, s.b, box, s.pad + 7.5));
  assert(segmentHitsBox({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 4, y: 4, w: 1, h: 1 }));
  assert(!segmentHitsBox({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 4, y: 4, w: 1, h: 1 }));
});

test('impossible or conflicting locked labels request review without silently shifting survey locations', () => {
  const items = [{ ax: 100, ay: 100, w: 900, h: 800 }];
  assert.throws(() => planLabelLayout(items, 800, 600), /編號/);
  const locked = [1, 2].map(() => ({ ax: 100, ay: 100, w: 80, h: 30, preferred: { x: .5, y: .5, locked: true } }));
  assert.throws(() => planLabelLayout(locked, 800, 600), /編號/);
  const visible = planLabelLayout(locked, 800, 600, { strict: false });
  assert(visible[1].invalid); assert.equal(visible[0].x, visible[1].x); assert.equal(visible[0].ax, 100);
});

test('saved labels follow record-photo identities through renumbering, shared media and isolated backup restore', async () => {
  const { p, r, a, blobs } = await fixture(), mid = id(), planId = id();
  p.media.push({ ...p.media[0], id: mid, kind: 'plan' }); blobs.set(mid, blobs.get(r.photos[0].mediaId));
  r.placement = { planId, x: .2, y: .3, endX: .5, endY: .6 };
  const other = { ...structuredClone(r), id: id(), placement: { ...r.placement, x: .3 } }; p.records.push(other);
  const labels = [r, other].map(record => ({ kind: 'photo', id: record.photos[0].mediaId, recordId: record.id, x: .6, y: .2, locked: true, anchor: [.2, .3, .5, .6] }));
  p.plans.push({ id: planId, unitId: a.id, floor: r.floor, title: '合成圖面', mediaId: mid, labelLayout: labels }); validateProject(p);
  const before = structuredClone(p), first = groupPlanEntries({ records: attachmentIndex(p).groups.flatMap(g => g.records) }, planId);
  const next = groupPlanEntries({ records: attachmentIndex(p, { start: 100 }).groups.flatMap(g => g.records) }, planId);
  assert.deepEqual(first.map(x => x.targets), next.map(x => x.targets)); assert.notEqual(first[0].label, next[0].label); assert.deepEqual(p, before);
  const bundle = await readBundle((await makeBundle(p, key => blobs.get(key), a.id)).blob), copy = restoredCopy(bundle.project).project;
  validateProject(copy); assert.deepEqual(bundle.project.plans[0].labelLayout, labels);
  assert.notEqual(copy.plans[0].labelLayout[0].id, labels[0].id); assert.equal(copy.plans[0].labelLayout[0].recordId, r.id);
  assert.deepEqual(copy.records[0].placement, r.placement);
  p.plans[0].labelLayout.push(labels[0]); assert.throws(() => validateProject(p), /重複/); p.plans[0].labelLayout.pop();
  p.plans[0].labelLayout[0].recordId = 'missing'; assert.throws(() => validateProject(p), /不存在/);
});

test('public floors become contiguous before numbering while remaining within one unit numbering sequence', async () => {
  const { p, a, r } = await fixture(); p.units = [a]; a.kind = 'public'; p.records = ['RF', '2F', 'B1', '1F', '2F'].map((floor, i) => ({ ...structuredClone(r), id: id(), floor, space: '公設 ' + i })); syncRooms(p);
  const index = attachmentIndex(p, { publicByFloor: true }), before = structuredClone(p);
  assert.deepEqual(index.groups.map(g => g.floor), ['B1', '1F', '2F', '2F', 'RF']); assert.deepEqual(index.groups.map(g => g.records[0].photos[0].number), ['001', '002', '003', '004', '005']); assert.equal(attachmentUnits(index, p).length, 4); assert.deepEqual(p, before);
});

test('roster accepts quoted CSV and Excel tabs, rejects duplicates and unknown columns without changing source', () => {
  const p = newProject('CASE', '名冊測試', '2026-09-10'), before = structuredClone(p);
  const csv = parseRoster('戶別,地址,棟別,種類\r\nA-001,"一號,二樓",A棟,住戶\r\nP-01,公設入口,A棟,公設', p);
  assert.equal(csv.entries[0].address, '一號,二樓'); assert.equal(csv.entries[1].kind, 'public'); assert.deepEqual(csv.errors, []); assert.deepEqual(p, before);
  assert.equal(parseRoster('戶別\t地址\nA\t入口', p).entries[0].code, 'A');
  p.units.push(newUnit('A')); assert.equal(parseRoster('戶別\nA\nB\nB', p).errors.length, 2);
  assert.throws(() => parseRoster('戶別,constructor\nA,X', p)); assert.throws(() => parseRoster('戶別,地址\nB,"未關閉', p));
  assert.equal(parseRoster('戶別,種類\nB,toString', p).errors.length, 1);
});

test('visit dates are actual calendar dates; legacy records retain uncertainty and visit ranges do not invent an exact date', async () => {
  const { p, r, a, blobs } = await fixture(); delete p.visits;
  assert.equal(recordDateInfo(p, r).confirmed, false); assert.match(recordDateInfo(p, r).label, /原案日期.*逐筆日期未確認/);
  p.visits = [{ id: id(), name: '補勘', start: '2026-09-10', end: '2026-09-12' }]; r.visitId = p.visits[0].id; r.observedOn = '';
  assert.match(recordDateInfo(p, r).label, /09-10～2026-09-12/); r.observedOn = '2026-09-11'; assert.equal(recordDateInfo(p, r).confirmed, true);
  a.visitHistory = [{ visitId: r.visitId, date: '2026-09-11', status: 'partial', scope: '客廳', reason: '房間未開門' }];
  const restored = await readBundle((await makeBundle(p, mid => blobs.get(mid), a.id)).blob); assert.deepEqual(restored.project.units[0].visitHistory, a.visitHistory); assert.equal(restored.project.records[0].observedOn, '2026-09-11');
  r.observedOn = '2026-09-13'; assert.throws(() => validateProject(p), /超出/); r.observedOn = '2026-02-30'; assert.throws(() => validateProject(p), /日期/);
  assert(validDate('2024-02-29')); assert(!validDate('2026-02-29')); assert(!validDate('2026-13-01'));
});

test('detail drawings and custom originals survive scoped backup and restore with fresh media identities', async () => {
  const { p, r, blobs, a } = await fixture(), mid = id(), blob = blobs.get(r.photos[0].mediaId);
  p.media.push({ ...p.media[0], id: mid, kind: 'detail' }); blobs.set(mid, blob);
  r.detail = { kind: 'image', mediaId: mid, marks: [{ type: 'pen', points: [{ x: .2, y: .3 }, { x: .4, y: .5 }] }] };
  const result = await readBundle((await makeBundle(p, key => blobs.get(key), a.id)).blob); assert(result.project.media.some(m => m.id === mid));
  const restored = restoredCopy(result.project); validateProject(restored.project); assert.notEqual(restored.project.records[0].detail.mediaId, mid); assert.deepEqual(restored.project.records[0].detail.marks, r.detail.marks);
  assert.equal(result.manifest.version, 14); r.detail.mediaId = r.photos[0].mediaId; assert.throws(() => validateProject(p), /細部圖原檔/);
  r.detail = { kind: 'preset', preset: 'beam', mirror: true, marks: [] }; validateProject(p); r.detail.marks = [{ type: 'pen', points: [{ x: 2, y: .1 }] }]; assert.throws(() => validateProject(p), /座標/);
});

test('numbering resets per selected unit and the full-project option preserves sequential numbers and field identities', async () => {
  const { p } = await fixture(); syncRooms(p); const before = structuredClone(p);
  const perUnit = attachmentIndex(p), nums = perUnit.groups.flatMap(g => g.records.flatMap(r => r.photos.map(p => p.number))); assert.deepEqual(nums, ['001', '001']);
  assert.deepEqual(attachmentIndex(p, { numbering: 'project' }).groups.flatMap(g => g.records.flatMap(r => r.photos.map(p => p.number))), ['001', '002']);
  const reversed = attachmentIndex(p, { unitIds: [...p.units].reverse().map(u => u.id) }); assert.equal(reversed.groups[0].unitId, p.units[1].id); assert.deepEqual(p, before);
  assert.throws(() => attachmentIndex(p, { unitIds: [] })); assert.throws(() => attachmentIndex(p, { unitIds: [p.units[0].id, p.units[0].id] }));
});

test('volume boundaries retain units, preserve absolute appendix pages and mark oversize units', () => {
  const p = newProject('CASE', '分冊', '2026-09-10'), a = newUnit('A'), b = newUnit('B'), c = newUnit('P'); p.units.push(a, b, c);
  const sections = [a.id, a.id, b.id, b.id, c.id, c.id, c.id].map((unitId, i) => ({ unitId, segmentKey: unitId, page: 41 + i, label: '8-' + (41 + i) }));
  const index = { sections, pagePrefix: '8-' }; const volumes = splitVolumes(index, p, 2);
  assert.deepEqual(volumes.map(v => [v.start, v.pageCount, v.overLimit]), [[41, 2, false], [43, 2, false], [45, 3, true]]);
  assert.deepEqual(splitVolumes(index, p, 100, [b.id]).map(v => v.unitIds), [[a.id], [b.id, c.id]]); assert.throws(() => splitVolumes(index, p, 0));
});

test('zero-photo inaccessible units remain explicit standard-report entries without fabricating observations', () => {
  const p = newProject('CASE', '未入內', '2026-09-10'), u = newUnit('C'); p.units.push(u); u.status = 'inaccessible'; u.reason = '未能入內';
  assert.throws(() => attachmentIndex(p)); const index = attachmentIndex(p, { includeEmpty: true }); assert.equal(index.groups.length, 0); assert.equal(attachmentUnits(index, p)[0].status, 'inaccessible');
  assert.throws(() => attachmentIndex(p, { includeEmpty: true, format: 'quick' }));
});

test('individual cracks preserve independent units, uncertainty and legacy group through backup', async () => {
  const { p, r, blobs } = await fixture();
  r.condition = 'crack'; r.cracks = [
    { id: id(), measured: true, widthMode: 'le03', width: null, length: 1.2, pattern: 'diagonal', notes: '窗角' },
    { id: id(), measured: true, widthMode: 'exact', width: .45, length: 2.1, pattern: 'vertical', notes: '' },
    { id: id(), measured: false, widthMode: 'unknown', width: null, length: null, pattern: '', notes: '未能接近' }
  ];
  r.legacyCrack = { measured: true, widthMode: 'exact', width: .2, length: 3, crackPattern: '' };
  validateProject(p); const prose = observationText(r);
  assert.match(prose, /裂縫 A.*長度 1.2 m/); assert.match(prose, /裂縫 B.*寬度 0.45 mm.*長度 2.1 m/);
  assert.match(prose, /原整組紀錄/); assert.deepEqual(recordIssues(r), ['裂縫 C未量測']);
  const restored = await readBundle((await makeBundle(p, mid => blobs.get(mid))).blob);
  assert.deepEqual(restored.project.records[0].cracks, r.cracks); assert.deepEqual(restored.project.records[0].legacyCrack, r.legacyCrack);
  assert.equal(restored.manifest.version, 14);
  r.cracks[2].width = .3; assert.throws(() => validateProject(p), /未量測/);
});

test('descriptive tile counts satisfy quantity note without fabricating totals', async () => {
  const { p, r } = await fixture(); r.condition = 'crack'; r.surface = 'tile';
  r.tiles = { crack: true, broken: true, approx: false, crackCount: null, brokenCount: 2, overlapCount: null, crackText: '十餘塊', brokenText: '' };
  validateProject(p); assert.deepEqual(recordIssues(r), []); assert.equal(tileTotal(r.tiles), null);
  assert.match(observationText(r), /磁磚裂隙 十餘塊/); assert(!observationText(r).includes('合計'));
  r.tiles.crackCount = 15; assert.throws(() => validateProject(p), /推算塊數/);
});

test('four stair symbols stay editable and bounded through rotation expansion and whole erasing', () => {
  for (const stairType of ['straight', 'l', 'u', 'unequal']) for (const rotation of [0, 90, 180, 270]) for (const mirror of [true, false]) {
    const sketch = emptySketch(), stroke = { type: 'stairs', points: [{ x: .2, y: .2 }, { x: .6, y: .7 }], stairType, rotation, mirror, direction: 'unknown', shortRatio: .5, breakLine: true };
    sketch.strokes.push(stroke); validateSketch(sketch);
    const g = stairGeometry(stroke, { x: 10, y: 20 }, { x: 210, y: 320 }); assert.equal(g.arrow, null); assert.equal(g.label, '');
    assert(g.lines.flat().every(p => p.x >= 10 && p.x <= 210 && p.y >= 20 && p.y <= 320));
    const expanded = expandSketch(sketch, 'left'); assert.equal(expanded.strokes[0].rotation, rotation);
    const area = sketchArea(sketch), first = stairGeometry(stroke, { x: .2 * area.width, y: .2 * area.height }, { x: .6 * area.width, y: .7 * area.height }).lines[0][0];
    const hit = hitSketch(sketch, { x: first.x / area.width, y: first.y / area.height }); assert.equal(hit.index, 0); assert.equal(deleteSketchSelection(sketch, hit).strokes.length, 0);
    stroke.direction = 'up'; assert.equal(stairGeometry(stroke, { x: 0, y: 0 }, { x: 200, y: 300 }).label, '上');
  }
  const invalid = emptySketch(); invalid.strokes = [{ type: 'stairs', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], stairType: 'scissor' }]; assert.throws(() => validateSketch(invalid));
});

test('room moves within a selected unit skip intervening rooms from other units', async () => {
  const { p, r, a } = await fixture(), second = newRecord(a.id, '1F', '浴廁'); p.records.push(second); syncRooms(p);
  const other = p.records[1], field = second.fieldNumber;
  moveRoom(p, second.roomId, -1, a.id); assert.deepEqual(p.records.map(x => x.id), [second.id, other.id, r.id]); assert.equal(second.fieldNumber, field);
  moveRoom(p, second.roomId, -1, a.id); assert.equal(p.records[0].id, second.id);
});
test('report prose omits form placeholders and long multiline text can continue without losing content', async () => {
  const { r } = await fixture(); r.condition = 'crack'; r.crackPattern = ''; assert.match(observationText(r), /裂隙/); assert(!observationText(r).includes('尚未選擇'));
  const long = '現場補充\n'.repeat(250), chunks = textChunks(long); assert.equal(chunks.join(''), long); assert(chunks.every(s => s.length <= 700 && s.split('\n').length <= 25));
});

test('U cracks record counts and optional single-path length without total length or forced dimensions', async () => {
  const { p, r } = await fixture(); Object.assign(r, { component: '梁', condition: 'crack', crackPattern: 'u', crackCount: 4 });
  validateProject(p); assert.deepEqual(recordIssues(r), []); assert.match(observationText(r), /4 條/); assert(!observationText(r).includes('總長'));
  Object.assign(r, { measured: true, length: 1.2, uScope: 'representative' }); assert.deepEqual(recordIssues(r), []); assert.match(observationText(r), /代表 1 條實測展開長度 1.2 m/); assert(!observationText(r).includes('4.8'));
  r.crackCount = null; assert(recordIssues(r).includes('U 型裂縫條數未記'));
  for (const n of [-1, 1.5, Infinity, '4']) { r.crackCount = n; assert.throws(() => validateProject(p)); }
});
test('tile counts remain distinct from crack length and area; overlapping damage is counted once', async () => {
  const { p, r } = await fixture(); Object.assign(r, { condition: 'crack', surface: 'tile', tiles: { crack: true, broken: true, approx: false, crackCount: 4, brokenCount: 2, overlapCount: 2 } });
  validateProject(p); assert.equal(tileTotal(r.tiles), 4); assert.deepEqual(recordIssues(r), []); assert.match(observationText(r), /合計 4 塊/); assert(!observationText(r).includes('m²'));
  r.tiles.overlapCount = null; assert.equal(tileTotal(r.tiles), null); assert(!observationText(r).includes('合計'));
  r.tiles.overlapCount = 3; assert.throws(() => validateProject(p), /重疊/);
});
test('room identities and field labels survive sorting, partial backup and restored photo identity', async () => {
  const { p, r, a } = await fixture(); syncRooms(p); const room = r.roomId, label = r.fieldNumber;
  p.records.reverse(); syncRooms(p); assert.equal(r.roomId, room); assert.equal(r.fieldNumber, label);
  r.mainPhotoId = r.photos[0].mediaId; r.photos[0].reportInclude = true;
  const sub = subset(p, a.id); assert.equal(sub.rooms.length, 1); validateProject(sub);
  const copy = restoredCopy(sub); validateProject(copy.project); assert.equal(copy.project.records[0].roomId, room); assert.equal(copy.project.records[0].mainPhotoId, copy.remap.get(r.mainPhotoId));
});
test('report numbering is generated after selection and ordering, never replaces field identities', async () => {
  const { p, r } = await fixture(); const first = r.photos[0];
  const extra = { ...structuredClone(first), mediaId: id(), role: 'close', reportInclude: true }; p.media.push({ ...p.media[0], id: extra.mediaId }); r.photos.push(extra); syncRooms(p);
  r.mainPhotoId = extra.mediaId; const index = attachmentIndex(p, { start: 27 }); assert.deepEqual(index.groups[0].records[0].photos.map(x => x.number), ['027', '028']);
  first.reportInclude = false; const next = attachmentIndex(p, { start: 27 }); assert.equal(next.groups[0].records[0].photos[0].number, '027'); assert.equal(index.groups[0].records[0].photos.length, 2);
  extra.excluded = true; extra.excludedReason = '模糊'; delete r.mainPhotoId; assert.equal(reportPhotos(r).length, 0); assert.equal(r.photos.length, 2);
  assert.throws(() => attachmentIndex(p, { start: 0 }));
});
test('photo placements inherit only when unset, stay separate by camera angle, and clear on floor changes', async () => {
  const { p, r } = await fixture(), photo = r.photos[0], planId = id();
  p.media.push({ ...p.media[0], id: id(), kind: 'plan' }); p.plans.push({ id: planId, unitId: r.unitId, floor: r.floor, title: '合成平面圖', mediaId: p.media.at(-1).id });
  r.placement = { planId, x: .1, y: .2, endX: .6, endY: .7 }; assert.deepEqual(photoPlacement(r, photo), r.placement);
  photo.placement = null; assert.equal(photoPlacement(r, photo), null); photo.placement = { ...r.placement, x: .4 };
  r.observationPin = { ...r.placement, x: .6, endX: .6, y: .7, endY: .7 }; validateProject(p);
  const index = attachmentIndex(p), entries = groupPlanEntries(index.groups[0], planId); assert.equal(entries.length, 2); assert.equal(entries[0].kind, 'observation'); assert.equal(entries[1].placement.x, .4);
  r.floor = '3F'; clearWrongFloor(p, r); assert.equal(r.placement, null); assert.equal(photo.placement, null); assert.equal(r.observationPin, null);
});

test('both report formats share selected numbering; standard plans consolidate across rooms and isolate units', async () => {
  const { p, r, a } = await fixture();
  const second = newRecord(a.id, r.floor, '另一房間'); second.photos.push({ ...structuredClone(r.photos[0]), mediaId: id() });
  p.media.push({ ...p.media[0], id: second.photos[0].mediaId }); p.records.push(second);
  const plan = { id: id(), unitId: a.id, floor: r.floor, title: '全層平面圖', mediaId: id() };
  p.media.push({ ...p.media[0], id: plan.mediaId, kind: 'plan' }); p.plans.push(plan);
  r.placement = { planId: plan.id, x: .2, y: .3, endX: .6, endY: .7 }; second.placement = { ...r.placement, x: .4 };
  const before = structuredClone(p), standard = attachmentIndex(p, { start: 7 }), quick = attachmentIndex(p, { start: 7, format: 'quick' });
  assert.equal(standard.format, 'standard'); assert.equal(standard.version, 3); assert.deepEqual(standard.groups, quick.groups);
  const units = attachmentUnits(standard, p); assert.equal(units.length, 2); assert.equal(units[0].groups.length, 2); assert.equal(units[0].plans.length, 1); assert.equal(units[1].plans.length, 0);
  assert.deepEqual(units[0].records.flatMap(r => r.photos.map(p => p.number)), ['007', '008']);
  assert.deepEqual(groupPlanEntries(units[0], plan.id).map(e => e.label), ['007', '008']);
  assert.deepEqual(p, before); assert.throws(() => attachmentIndex(p, { format: 'unknown' }));
  const scoped = attachmentUnits(attachmentIndex(p, { unitId: a.id }), p); assert.equal(scoped.length, 1);
});

test('eraser selects rectangle edges without selecting empty rooms and preserves other three walls', () => {
  const sketch = emptySketch(); sketch.strokes.push({ type: 'rect', points: [{ x: .1, y: .2 }, { x: .8, y: .9 }] });
  assert.equal(hitSketch(sketch, { x: .5, y: .5 }), null);
  const hit = hitSketch(sketch, { x: .4, y: .2 }); assert.deepEqual(hit, { index: 0, segment: 0 });
  const deleted = deleteSketchSelection(sketch, hit);
  assert.deepEqual(deleted.strokes.map(s => s.points), [[{ x: .8, y: .2 }, { x: .8, y: .9 }], [{ x: .8, y: .9 }, { x: .1, y: .9 }], [{ x: .1, y: .9 }, { x: .1, y: .2 }]]);
  assert.equal(sketch.strokes[0].type, 'rect'); assert.equal(deleteSketchSelection(sketch, hit, true).strokes.length, 0);
});
test('eraser screen tolerance scales with zoom; visible opening wins over underlying wall', () => {
  const sketch = emptySketch(); sketch.strokes = [{ type: 'line', points: [{ x: .1, y: .5 }, { x: .9, y: .5 }] }, { type: 'window', points: [{ x: .2, y: .5 }, { x: .3, y: .5 }] }];
  assert.equal(hitSketch(sketch, { x: .25, y: .5 }).index, 1);
  assert.equal(hitSketch(sketch, { x: .7, y: .5 + 15 / 780 }, 1).index, 0);
  assert.equal(hitSketch(sketch, { x: .7, y: .5 + 17 / 780 }, 1), null);
  assert.equal(hitSketch(sketch, { x: .7, y: .5 + 15 / 780 }, 2), null);
  const result = deleteSketchSelection(sketch, { index: 1, segment: 0 }); assert.equal(hitSketch(result, { x: .25, y: .5 }).index, 0);
});
test('door leaf, arc and text can be selected and deleted as full symbols', () => {
  const sketch = emptySketch(); sketch.strokes = [{ type: 'door', points: [{ x: .2, y: .5 }, { x: .3, y: .5 }], swing: -1 }, { type: 'text', text: '入口', points: [{ x: .6, y: .7 }] }];
  assert.equal(hitSketch(sketch, { x: .2, y: .5 - 100 / 780 }).index, 0);
  assert.equal(hitSketch(sketch, { x: .2 + .1 / Math.sqrt(2), y: .5 - 115.2 / Math.sqrt(2) / 780 }).index, 0);
  const hit = hitSketch(sketch, { x: .65, y: .68 }); assert.equal(hit.index, 1); assert.equal(deleteSketchSelection(sketch, hit).strokes.length, 1);
});
test('erasing a pen segment leaves two disconnected polylines without a bridge', () => {
  const sketch = emptySketch(), points = [.1, .2, .3, .4, .5].map(x => ({ x, y: .5 })); sketch.strokes = [{ type: 'pen', points }];
  const split = deleteSketchSelection(sketch, hitSketch(sketch, { x: .25, y: .5 }));
  assert.deepEqual(split.strokes.map(s => s.points), [points.slice(0, 2), points.slice(2)]);
  assert.equal(deleteSketchSelection(sketch, { index: 0, segment: 0 }).strokes[0].points.length, 4);
  assert.throws(() => deleteSketchSelection(sketch, { index: 0, segment: 55 }));
});
test('eraser refuses over-capacity rectangle split without mutating input; whole deletion still works', () => {
  const sketch = emptySketch(); sketch.strokes = Array.from({ length: 300 }, () => ({ type: 'rect', points: [{ x: .1, y: .1 }, { x: .8, y: .8 }] }));
  assert.throws(() => deleteSketchSelection(sketch, { index: 0, segment: 0 }), /300/); assert.equal(sketch.strokes.length, 300);
  assert.equal(deleteSketchSelection(sketch, { index: 0, segment: 0 }, true).strokes.length, 299);
});

async function fixture() {
  const p = newProject('DEMO', '合成測試案件', '2026-09-08'), a = newUnit('A'), b = newUnit('B');
  const r = newRecord(a.id, '1F', '客廳'), s = newRecord(b.id, '2F', '樓梯');
  p.units.push(a, b); p.records.push(r, s);
  const blobs = new Map();
  for (const [i, record] of p.records.entries()) {
    const blob = new Blob([new Uint8Array([0, 1, i, 255, 17, 93])], { type: 'image/png' }), mid = id();
    p.media.push({ id: mid, kind: 'image', name: `sample-${i}.png`, type: blob.type, size: blob.size, sha256: await sha256(blob), importedAt: now() });
    record.photos.push({ mediaId: mid, role: 'overview', caption: '<script>text only</script>', marks: [{ type: 'arrow', points: [{ x: .1, y: .2 }, { x: .7, y: .8 }] }], excluded: false, excludedReason: '' });
    Object.assign(record, { location: '門旁', component: '牆面', condition: 'normal' }); blobs.set(mid, blob);
  }
  return { p, blobs, r, a, b };
}
test('complete package preserves originals, Unicode, and editable marks byte for byte', async () => {
  const { p, blobs } = await fixture(); p.revision = 8;
  const { blob, manifest } = await makeBundle(p, mid => blobs.get(mid));
  const restored = await readBundle(blob); assert.deepEqual(restored.project, p); assert.equal(restored.manifest.digest, manifest.digest);
  for (const a of restored.media) assert.deepEqual(await a.blob.arrayBuffer(), await blobs.get(a.id).arrayBuffer());
});
test('single-unit package has only that unit and all referenced media', async () => {
  const { p, blobs, a, b } = await fixture(); const result = await readBundle((await makeBundle(p, mid => blobs.get(mid), a.id)).blob);
  assert.equal(result.project.units.length, 1); assert.equal(result.project.records.length, 1); assert.equal(result.media.length, 1);
  assert.equal(result.manifest.payload.scope, a.id); assert(!JSON.stringify(result.project).includes(b.id));
  assert.throws(() => subset(p, 'nonexistent'), /找不到/);
});
test('unknown measurement remains null; measured zero remains explicit zero', async () => {
  const { p, r } = await fixture(); r.condition = 'crack'; validateProject(p); assert(recordIssues(r).includes('裂縫未量測'));
  r.measured = true; r.width = 0; r.length = 0; validateProject(p); assert(!recordIssues(r).includes('量測尺寸未齊'));
  r.measured = false; assert.throws(() => validateProject(p), /未量測/);
});
test('excluded photo retains media but no longer satisfies photo reminder', async () => {
  const { p, r } = await fixture(); r.photos[0].excluded = true;
  assert.throws(() => validateProject(p), /不採用原因/); r.photos[0].excludedReason = '合成測試'; validateProject(p);
  assert(recordIssues(r).includes('尚無採用照片')); assert.equal(p.media.length, 2);
});
test('network cracks do not require linear measurements, while other reminders and patterns still apply', async () => {
  const { p, r, a } = await fixture(); Object.assign(r, { condition: 'crack', crackPattern: 'network' });
  for (const measured of [false, true]) for (const mode of ['unknown', 'exact', 'lt03', 'ge03', 'le03', 'gt03']) {
    Object.assign(r, { measured, widthMode: mode }); validateProject(p);
    assert.deepEqual(recordIssues(r), []); assert.deepEqual(unitIssues(p, a), []);
    assert.equal(r.width, null); assert.equal(r.length, null);
  }
  r.location = ''; r.photos = []; assert.deepEqual(recordIssues(r), ['缺位置說明或圖上位置', '尚無採用照片']);
  for (const crackPattern of ['', 'horizontal', 'vertical', 'diagonal', 'other']) {
    Object.assign(r, { crackPattern, measured: false }); assert(recordIssues(r).includes('裂縫未量測'));
    r.measured = true; assert(recordIssues(r).includes('量測尺寸未齊'));
  }
  Object.assign(r, { condition: 'normal', crackPattern: 'network' }); assert(!recordIssues(r).includes('量測尺寸未齊')); // Retained inactive dimensions do not create a crack reminder.
});
test('optional network measurements preserve blanks and actual values through backup and restore', async () => {
  const { p, r, blobs } = await fixture(); Object.assign(r, { condition: 'crack', crackPattern: 'network', measured: true, widthMode: 'exact' });
  for (const [width, length] of [[null, null], [.2, null], [null, 1.2], [0, 0], [.3, 1.2]]) {
    Object.assign(r, { width, length }); validateProject(p); assert.deepEqual(recordIssues(r), []);
    const restored = await readBundle((await makeBundle(p, mid => blobs.get(mid))).blob);
    const copied = restoredCopy(restored.project).project.records[0];
    assert.equal(copied.crackPattern, 'network'); assert.equal(copied.width, width); assert.equal(copied.length, length); assert.deepEqual(recordIssues(copied), []);
  }
  r.width = -1; assert.throws(() => validateProject(p), /非負/);
});
test('width ranges preserve uncertainty without inventing an exact threshold reading', async () => {
  const { p, r, blobs } = await fixture(); r.condition = 'crack'; r.widthMode = 'lt03'; r.crackPattern = 'diagonal';
  validateProject(p); assert.equal(r.width, null); assert(recordIssues(r).includes('裂縫未量測'));
  r.measured = true; r.length = 1.2;
  for (const mode of ['lt03', 'ge03', 'le03', 'gt03']) {
    r.widthMode = mode; validateProject(p); assert(!recordIssues(r).includes('量測尺寸未齊'));
    const restored = await readBundle((await makeBundle(p, mid => blobs.get(mid))).blob);
    assert.equal(restored.project.records[0].width, null); assert.equal(restored.project.records[0].widthMode, mode);
  }
  r.width = .3; assert.throws(() => validateProject(p), /區間不可/);
  r.widthMode = 'exact'; validateProject(p); assert.equal(r.width, .3);
});
test('multiple components roundtrip while legacy scalar components remain readable', async () => {
  const { p, r, blobs } = await fixture(); assert.deepEqual(recordComponents(r), ['牆面']);
  r.components = ['牆面', '梁', '柱']; validateProject(p);
  const restored = await readBundle((await makeBundle(p, mid => blobs.get(mid))).blob);
  assert.deepEqual(recordComponents(restored.project.records[0]), ['牆面', '梁', '柱']);
  assert(!recordIssues(r).includes('缺部位'));
  r.components.push('柱'); assert.throws(() => validateProject(p), /部位選項/);
  r.components = ['梁']; assert.throws(() => validateProject(p), /摘要不一致/);
  r.components = []; r.component = ''; validateProject(p); assert(recordIssues(r).includes('缺部位'));
});
test('legacy backups retain exact measurements and no assumed range', async () => {
  const { p, r, blobs } = await fixture(); Object.assign(r, { condition: 'crack', measured: true, width: .3, length: 1.2 });
  delete r.widthMode; delete r.crackPattern;
  const restored = await readBundle((await makeBundle(p, mid => blobs.get(mid))).blob);
  assert.equal(widthMode(restored.project.records[0]), 'exact'); assert.equal(restored.project.records[0].width, .3);
  r.width = null; assert.equal(widthMode(r), 'unknown');
});
test('editable sketches and plan placement survive scoped backup and independent restore', async () => {
  const { p, r, blobs, a } = await fixture(), mid = id(), planId = id();
  const blob = new Blob(['synthetic plan bytes'], { type: 'image/png' }), sketch = emptySketch();
  sketch.strokes.push({ type: 'rect', points: [{ x: .1, y: .1 }, { x: .9, y: .9 }] }, { type: 'text', text: '入口 <script>純文字</script>', points: [{ x: .2, y: .8 }] });
  p.media.push({ id: mid, kind: 'plan', name: '簡圖.png', type: blob.type, size: blob.size, sha256: await sha256(blob), importedAt: now() }); blobs.set(mid, blob);
  p.plans.push({ id: planId, unitId: a.id, floor: '1F', title: '現場簡圖', mediaId: mid, sketch });
  r.placement = { planId, x: .2, y: .3, endX: .5, endY: .6 };
  const restored = await readBundle((await makeBundle(p, x => blobs.get(x), a.id)).blob), copy = restoredCopy(restored.project);
  validateProject(copy.project); assert.deepEqual(copy.project.plans[0].sketch, sketch);
  assert.notEqual(copy.project.plans[0].mediaId, mid); assert.deepEqual(copy.project.records[0].placement, r.placement);
});
test('sketch rejects malformed geometry and unknown width or crack choices', async () => {
  const sketch = emptySketch(); sketch.strokes.push({ type: 'line', points: [{ x: .1, y: .2 }] });
  assert.throws(() => validateSketch(sketch), /端點/); sketch.strokes[0].points.push({ x: 2, y: .4 }); assert.throws(() => validateSketch(sketch), /超出/);
  sketch.strokes = [{ type: 'text', text: ' ', points: [{ x: .1, y: .2 }] }]; assert.throws(() => validateSketch(sketch), /不可空白/);
  const { p, r } = await fixture(); r.widthMode = 'safe'; assert.throws(() => validateProject(p), /寬度選項/);
  r.widthMode = 'unknown'; r.crackPattern = 'safe'; assert.throws(() => validateProject(p), /方向選項/);
});
test('door and window geometry survive backup and restore; invalid openings fail closed', async () => {
  const { p, r, blobs, a } = await fixture(), mid = id(), sketch = emptySketch();
  sketch.strokes = [{ type: 'door', swing: -1, points: [{ x: .2, y: .2 }, { x: .4, y: .2 }] }, { type: 'window', points: [{ x: .6, y: .2 }, { x: .8, y: .2 }] }];
  const blob = new Blob(['synthetic opening preview'], { type: 'image/png' }); blobs.set(mid, blob);
  p.media.push({ id: mid, kind: 'plan', name: '門窗.png', type: blob.type, size: blob.size, sha256: await sha256(blob), importedAt: now() });
  p.plans.push({ id: id(), unitId: a.id, floor: r.floor, title: '門窗簡圖', mediaId: mid, sketch });
  const restored = await readBundle((await makeBundle(p, x => blobs.get(x))).blob); assert.deepEqual(restoredCopy(restored.project).project.plans[0].sketch, sketch);
  sketch.strokes[0].swing = 0; assert.throws(() => validateSketch(sketch), /開啟方向/);
  sketch.strokes[0].swing = 1; sketch.strokes[1].points[1] = { ...sketch.strokes[1].points[0] }; assert.throws(() => validateSketch(sketch), /不可為零/);
});
test('object snapping recognizes rectangle corners and wall edges at mobile scale', () => {
  const sketch = emptySketch(); sketch.strokes.push({ type: 'rect', points: [{ x: .2, y: .2 }, { x: .8, y: .8 }] });
  let result = resolveSketchPoint(sketch, { x: .81, y: .214 }, { scale: .25 }); assert.equal(result.kind, 'endpoint'); assert.deepEqual(result.point, { x: .8, y: .2 });
  result = resolveSketchPoint(sketch, { x: .5, y: .206 }, { scale: .25 }); assert.equal(result.kind, 'edge'); assert.deepEqual(result.point, { x: .5, y: .2 });
  result = resolveSketchPoint(sketch, { x: .5, y: .5 }, { scale: .25 }); assert.equal(result.kind, ''); assert.deepEqual(result.point, { x: .5, y: .5 });
  result = resolveSketchPoint(sketch, { x: .81, y: .214 }, { snap: false }); assert.deepEqual(result.point, { x: .81, y: .214 });
});
test('orthogonal constraint stays exact when snapping and may be disabled for diagonal geometry', () => {
  const sketch = emptySketch(); sketch.strokes.push({ type: 'rect', points: [{ x: .2, y: .2 }, { x: .8, y: .8 }] });
  let result = resolveSketchPoint(sketch, { x: .79, y: .25 }, { anchor: { x: .2, y: .2 }, scale: .25 });
  assert.equal(result.locked, 'horizontal'); assert.deepEqual(result.point, { x: .8, y: .2 });
  result = resolveSketchPoint(sketch, { x: .25, y: .79 }, { anchor: { x: .2, y: .2 }, scale: .25 }); assert.equal(result.locked, 'vertical'); assert.deepEqual(result.point, { x: .2, y: .8 });
  result = resolveSketchPoint(sketch, { x: .6, y: .5 }, { anchor: { x: .2, y: .2 }, orthogonal: false }); assert.equal(result.locked, ''); assert.deepEqual(result.point, { x: .6, y: .5 });
});
test('orthogonal lines meet sloping wall intersections without pulling endpoints off axis', () => {
  const sketch = emptySketch(); sketch.strokes.push({ type: 'line', points: [{ x: .4, y: .2 }, { x: .7, y: .8 }] });
  const result = resolveSketchPoint(sketch, { x: .51, y: .45 }, { anchor: { x: .1, y: .4 } });
  assert.equal(result.kind, 'edge'); assert(Math.abs(result.point.x - .5) < 1e-10); assert(Math.abs(result.point.y - .4) < 1e-10);
});
test('door swing keeps a circular opening with perpendicular leaf for either direction', () => {
  const a = { x: 10, y: 20 }, b = { x: 90, y: 80 };
  for (const swing of [-1, 1]) { const g = doorGeometry(a, b, swing); assert.equal(g.radius, 100); assert.equal(Math.hypot(g.open.x - a.x, g.open.y - a.y), 100); assert.equal((b.x - a.x) * (g.open.x - a.x) + (b.y - a.y) * (g.open.y - a.y), 0); assert.equal(g.sweep, swing === 1 ? 1 : 0); }
});
test('audio codec parameters support MP4 dotted identifiers and quoted codec lists', async () => {
  const { p, r } = await fixture(), media = p.media[0]; media.kind = 'audio'; r.audioIds.push(media.id); r.photos = [];
  for (const type of ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4; codecs="mp4a.40.2"', 'audio/webm;codecs=opus']) { media.type = type; validateProject(p); }
  media.type = 'text/html'; assert.throws(() => validateProject(p), /媒體格式/);
});
test('restoration creates isolated project and media identities without changing source', async () => {
  const { p } = await fixture(), before = structuredClone(p), copy = restoredCopy(p);
  validateProject(copy.project); assert.notEqual(copy.project.id, p.id); assert.equal(copy.project.revision, 0); assert.deepEqual(p, before);
  assert.notEqual(copy.project.records[0].photos[0].mediaId, p.records[0].photos[0].mediaId);
});
test('receipt is bound to exact export and becomes stale after a change', async () => {
  const { p, blobs, a } = await fixture(), { manifest } = await makeBundle(p, mid => blobs.get(mid), a.id);
  const receipt = makeReceipt(manifest), exports = { entries: { [a.id]: { digest: manifest.digest, revision: p.revision } } };
  assert((await checkReceipt(receipt, p, exports)).verifiedAt);
  const changed = structuredClone(p); changed.records[0].notes = 'changed'; changed.revision++;
  await assert.rejects(checkReceipt(receipt, changed, exports), /修改/);
  await assert.rejects(checkReceipt({ ...receipt, projectId: id() }, p, exports), /不屬於/);
  await assert.rejects(checkReceipt({ ...receipt, scope: '__proto__' }, p, exports), /不屬於/);
});
test('media corruption, truncation, and unlisted tail are rejected', async () => {
  const { p, blobs } = await fixture(), { blob } = await makeBundle(p, mid => blobs.get(mid));
  const bytes = new Uint8Array(await blob.arrayBuffer()); bytes[bytes.length - 1] ^= 1;
  await assert.rejects(readBundle(new Blob([bytes])), /指紋不符/);
  await assert.rejects(readBundle(blob.slice(0, -1)), /不完整/);
  await assert.rejects(readBundle(new Blob([blob, 'extra'])), /未列入/);
});
test('manifest corruption and unsupported schema fail before import', async () => {
  const { p, blobs } = await fixture(), { blob } = await makeBundle(p, mid => blobs.get(mid));
  const bytes = new Uint8Array(await blob.arrayBuffer()); bytes[0] = 88;
  await assert.rejects(readBundle(new Blob([bytes])), /不是/);
  await assert.rejects(readBundle(new Blob(['CSURVEY/1\n9999999999\n'])), /標頭/);
  const { payload, digest } = await snapshot(p); payload.project.name = '被改寫';
  const json = JSON.stringify({ kind: 'condition-survey-bundle', version: 1, payload, digest });
  const data = new TextEncoder().encode(json);
  await assert.rejects(readBundle(new Blob(['CSURVEY/1\n' + String(data.length).padStart(10, '0') + '\n', data, ...blobs.values()])), /指紋不符/);
});
test('missing or changed original refuses export', async () => {
  const { p } = await fixture();
  await assert.rejects(makeBundle(p, () => undefined), /核對失敗/);
  await assert.rejects(makeBundle(p, () => new Blob(['123456'])), /核對失敗/);
});
for (const [name, mutate] of [
  ['duplicate identity', p => p.units.push(structuredClone(p.units[0]))],
  ['orphan record', p => p.records[0].unitId = id()],
  ['missing original reference', p => p.media.shift()],
  ['invalid coordinates', p => p.records[0].photos[0].marks[0].points[0].x = 2],
  ['negative measurement', p => Object.assign(p.records[0], { measured: true, width: -1 })],
  ['active image format', p => p.media[0].type = 'image/svg+xml'],
  ['reserved key', p => p.units[0].id = '__proto__'],
  ['invalid exclusion', p => p.records[0].photos[0].excluded = 'false'],
]) test(`invalid model rejected: ${name}`, async () => { const { p } = await fixture(); mutate(p); assert.throws(() => validateProject(p)); });

test('multiple conditions share originals and retain independent measured or estimated areas', async () => {
  const { p, r, blobs } = await fixture(); assert.deepEqual(recordConditions(r), ['normal']);
  Object.assign(r, { condition: 'crack', conditions: ['crack', 'damp', 'salt', 'spall'], crackPattern: 'network', areas: { crack: { value: null, method: 'estimated' }, damp: { value: 1.5, method: 'measured' }, salt: { value: .8, method: 'estimated' }, spall: { value: 0, method: 'measured' } } });
  validateProject(p); assert.deepEqual(recordIssues(r), []);
  const result = await readBundle((await makeBundle(p, mid => blobs.get(mid))).blob);
  assert.equal(result.manifest.version, 14); assert.deepEqual(result.project.records[0], r); assert.equal(result.project.records[0].photos.length, 1);
  const copy = restoredCopy(result.project).project.records[0]; assert.deepEqual(copy.conditions, r.conditions); assert.deepEqual(copy.areas, r.areas);
  r.conditions = ['damp']; r.condition = 'damp'; validateProject(p); assert.equal(r.areas.salt.value, .8); assert.deepEqual(recordIssues(r), []);
});
test('multi-condition validation rejects contradictions, unknown choices, duplicates and invalid areas', async () => {
  const { p, r } = await fixture();
  for (const conditions of [['normal', 'salt'], ['salt', 'salt'], ['unknown']]) { r.conditions = conditions; r.condition = conditions[0]; assert.throws(() => validateProject(p)); }
  r.conditions = ['salt']; r.condition = 'damp'; assert.throws(() => validateProject(p), /摘要/); r.condition = 'salt';
  for (const areas of [{ salt: { value: -1, method: 'measured' } }, { salt: { value: Infinity, method: 'measured' } }, { salt: { value: 1, method: 'automatic' } }, { wrong: { value: 1, method: 'measured' } }]) { r.areas = areas; assert.throws(() => validateProject(p)); }
});
test('backup reader accepts version 1 while new exports explicitly require a newer reader', async () => {
  const { p, blobs } = await fixture(), result = await makeBundle(p, mid => blobs.get(mid));
  const bytes = new Uint8Array(await result.blob.arrayBuffer()), headerSize = 21, length = Number(new TextDecoder().decode(bytes.slice(10, 20)));
  const old = structuredClone(result.manifest); old.version = 1;
  const json = JSON.stringify(old), header = 'CSURVEY/1\n' + String(new TextEncoder().encode(json).length).padStart(10, '0') + '\n';
  const restored = await readBundle(new Blob([header, json, bytes.slice(headerSize + length)])); assert.deepEqual(restored.project, p);
});
test('four-direction paper expansion preserves physical lengths and shifts only the added sides', () => {
  const original = emptySketch(); original.strokes = [{ type: 'door', swing: 1, points: [{ x: .2, y: .3 }, { x: .4, y: .3 }] }, { type: 'text', text: '入口', points: [{ x: .5, y: .5 }] }];
  for (const direction of ['left', 'right', 'top', 'bottom']) {
    const result = expandSketch(original, direction), a = sketchArea(original), b = sketchArea(result);
    for (let i = 0; i < original.strokes.length; i++) for (let j = 0; j < original.strokes[i].points.length; j++) {
      const p = original.strokes[i].points[j], q = result.strokes[i].points[j];
      assert(Math.abs(q.x * b.width - p.x * a.width - (direction === 'left' ? result.width - original.width : 0)) < 1e-8);
      assert(Math.abs(q.y * b.height - p.y * a.height - (direction === 'top' ? result.height - original.height : 0)) < 1e-8);
    }
    assert.equal(result.version, 2); assert.equal(result.strokes[0].swing, 1); assert.equal(original.version, 1);
  }
  let max = original; while (max.width < 4800) max = expandSketch(max, 'right'); assert.throws(() => expandSketch(max, 'right'), /上限/);
  max.height = 4801; assert.throws(() => validateSketch(max), /格式/); assert.throws(() => expandSketch(original, 'diagonal'), /方向/);
});
test('view fitting and pan bounds work for wide and tall expanded paper without changing saved geometry', () => {
  for (const [width, height] of [[1200, 900], [4800, 900], [1200, 4800]]) {
    const sketch = { version: 2, width, height, strokes: [] }, before = structuredClone(sketch);
    const fit = sketchView(sketch, 4 / 3); assert(fit.width >= width && fit.height >= height); assert(Math.abs(fit.width / fit.height - 4 / 3) < 1e-8);
    const zoom = sketchView(sketch, 4 / 3, 4, { x: -10000, y: 10000 }); assert.equal(zoom.width, fit.width / 4);
    assert.deepEqual(sketch, before);
  }
});
test('expanded paper snapping uses unchanged screen distance tolerance', () => {
  const sketch = expandSketch(emptySketch(), 'right'); sketch.strokes.push({ type: 'line', points: [{ x: .2, y: .2 }, { x: .5, y: .2 }] });
  const area = sketchArea(sketch);
  for (const scale of [.2, 2]) {
    assert.equal(resolveSketchPoint(sketch, { x: .5 + 10 / scale / area.width, y: .2 }, { scale }).kind, 'endpoint');
    assert.equal(resolveSketchPoint(sketch, { x: .5 + 15 / scale / area.width, y: .2 }, { scale }).kind, '');
  }
});


import * as M19 from '../model.js';
import { parseRoster as parseRoster19 } from '../organisation.js';
test('case types pre-fill floors and quick spaces without changing observations', () => {
  assert.deepEqual(M19.floorOptions({ floorConfig: { above: 3, below: 1, mezzanine: false } }), ['B1', '1F', '2F', '3F', 'RF']);
  assert.deepEqual(M19.floorOptions({ floorConfig: { above: 2, below: 0, mezzanine: true } }), ['1F', 'MF', '2F', 'RF']);
  assert.deepEqual(M19.floorOptions({}), ['B1', '1F', 'MF', '2F', '3F', '4F', '5F', 'RF'], 'legacy projects keep the old floor list');
  assert.equal(M19.buildingType({}), 'other');
  assert.deepEqual(M19.floorRank('B2') < M19.floorRank('B1') && M19.floorRank('B1') < M19.floorRank('1F') && M19.floorRank('1F') < M19.floorRank('MF') && M19.floorRank('MF') < M19.floorRank('2F') && M19.floorRank('12F') < M19.floorRank('RF'), true);
  const units = M19.apartmentUnits({ above: 3, below: 1, mezzanine: true });
  assert.deepEqual(units.map(u => [u.code, u.floor || '', u.kind || 'residence']), [['1F', '1F', 'residence'], ['2F', '2F', 'residence'], ['3F', '3F', 'residence'], ['公設', '', 'public']]);
  const order = M19.sortedUnits({ units: [{ code: '公設', kind: 'public' }, { code: '10F-2', floor: '10F' }, { code: '2F', floor: '2F' }, { code: 'B棟公設', building: 'B棟', kind: 'public' }, { code: 'A棟 3F', building: 'A棟', floor: '3F' }] }).map(u => u.code);
  assert.deepEqual(order, ['2F', '10F-2', '公設', 'A棟 3F', 'B棟公設'], 'buildings first, residences by floor, public units last within a building');
  assert.deepEqual(M19.spaceOptions({ buildingType: 'townhouse' }, { kind: 'residence' }).main.includes('車庫'), true);
  assert.deepEqual(M19.spaceOptions({ buildingType: 'apartment' }, { kind: 'public' }).main.includes('樓梯間'), true);
  assert.deepEqual(M19.spaceOptions({}, {}).exterior.includes('正面外牆'), true);
  const p = M19.newProject('T19', '型態驗證', '2026-09-19'); p.buildingType = 'apartment'; p.floorConfig = { above: 4, below: 0, mezzanine: false }; p.units.push(...units);
  M19.validateProject(p);
  assert.throws(() => M19.validateProject({ ...p, buildingType: 'villa' }), /案件型態/);
  assert.throws(() => M19.validateProject({ ...p, floorConfig: { above: 0, below: 0, mezzanine: false } }), /樓層設定/);
  assert.throws(() => M19.validateProject({ ...p, floorConfig: { above: 3, below: 1 } }), /樓層設定/);
  assert.throws(() => M19.validateProject({ ...p, units: [{ ...units[0], floor: 5 }] }), /戶別固定樓層/);
  const roster = parseRoster19(['戶別\t地址\t棟別\t種類\t樓層', 'A-301\t合成路 1 號\tA棟\t住戶\t3F', 'A棟公設\t\tA棟\t公設\t'].join('\n'), { units: [] });
  assert.deepEqual(roster.errors, []); assert.deepEqual(roster.entries.map(u => [u.code, u.building, u.floor, u.kind]), [['A-301', 'A棟', '3F', 'residence'], ['A棟公設', 'A棟', '', 'public']]);
});


import * as M20 from '../model.js';
function jpegWithExif20(dateText) {
  const ascii = s => [...s].map(c => c.charCodeAt(0)), u16 = v => [v & 255, v >> 8], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const tiff = [...ascii('II'), ...u16(42), ...u32(8), ...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0), ...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(44), ...u32(0), ...ascii(dateText.padEnd(19, ' ').slice(0, 19)), 0];
  const app1 = [...ascii('Exif'), 0, 0, ...tiff], size = app1.length + 2;
  return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, size >> 8, size & 255, ...app1, 0xFF, 0xD9]).buffer;
}
test('photo dates come from EXIF or file time, stamp copies only, and record dates follow photos within the visit', () => {
  assert.equal(M20.exifDate(jpegWithExif20('2026:09:12 10:20:30')), '2026-09-12');
  assert.equal(M20.exifDate(jpegWithExif20('2026:13:40 00:00:00')), '', 'impossible dates are ignored');
  assert.equal(M20.exifDate(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer), '', 'non-JPEG yields nothing');
  assert.equal(M20.exifDate(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x04, 0x45, 0x78]).buffer), '', 'truncated segments fail closed');
  assert.equal(M20.defaultStamp('2026-09-12', 'exif'), '2026-09-12'); assert.equal(M20.defaultStamp('2026-09-12', 'file'), '2026-09-12（檔案日期）'); assert.equal(M20.defaultStamp('', 'file'), '');
  assert.equal(M20.localDateOf(new Date(2026, 8, 5, 23, 59)), '2026-09-05'); assert.equal(M20.localDateOf('not a date'), '');
  const photo = { mediaId: 'm', role: 'overview', caption: '', marks: [], excluded: false, excludedReason: '', capturedOn: '2026-09-12', captureSource: 'exif', stamp: '2026-09-12', stampHidden: false };
  assert.equal(M20.photoStampText({ photoStamp: true }, photo), '2026-09-12'); assert.equal(M20.photoStampText({}, photo), '2026-09-12', 'legacy projects keep stamps on');
  assert.equal(M20.photoStampText({ photoStamp: false }, photo), ''); assert.equal(M20.photoStampText({}, { ...photo, stampHidden: true }), ''); assert.equal(M20.photoStampText({}, { ...photo, stamp: '' }), '');
  const p = M20.newProject('S20', '戳記驗證', '2026-09-12'), u = M20.newUnit('A'), r = M20.newRecord(u.id, '1F', '客廳'); p.units.push(u); p.records.push(r);
  r.visitId = p.visits[0].id; assert.equal(M20.applyPhotoDate(p, r, '2026-09-13'), false, 'dates outside the visit range are not adopted'); assert.equal(r.observedOn, undefined);
  assert.equal(M20.applyPhotoDate(p, r, '2026-09-12'), true); assert.equal(r.observedOn, '2026-09-12');
  assert.equal(M20.applyPhotoDate(p, r, '2026-09-12'), false, 'an existing record date is never overwritten');
  p.photoStamp = true; r.photos.push({ ...photo, mediaId: 'x' }); p.media.push({ id: 'x', name: 'x.jpg', kind: 'image', size: 10, type: 'image/jpeg', sha256: 'a'.repeat(64), importedAt: M20.now() });
  M20.validateProject(p);
  assert.throws(() => M20.validateProject({ ...p, photoStamp: 'yes' }), /照片戳記設定/);
  assert.throws(() => M20.validateProject({ ...p, records: [{ ...r, photos: [{ ...r.photos[0], capturedOn: '2026/09/12' }] }] }), /照片拍攝日期/);
  assert.throws(() => M20.validateProject({ ...p, records: [{ ...r, photos: [{ ...r.photos[0], captureSource: 'guess' }] }] }), /照片日期來源/);
  assert.throws(() => M20.validateProject({ ...p, records: [{ ...r, photos: [{ ...r.photos[0], stamp: 'x'.repeat(41) }] }] }), /照片日期戳記/);
  assert.throws(() => M20.validateProject({ ...p, records: [{ ...r, photos: [{ ...r.photos[0], stampHidden: 'no' }] }] }), /戳記顯示/);
});
test('marks carry a screen tone and openings may be four-cornered for oblique views', () => {
  M20.validateMarks([{ type: 'pen', tone: 'blue', points: [{ x: .1, y: .1 }, { x: .5, y: .5 }] }, { type: 'text', tone: 'black', text: '補線', points: [{ x: .2, y: .2 }] }]);
  assert.throws(() => M20.validateMarks([{ type: 'pen', tone: 'green', points: [{ x: .1, y: .1 }, { x: .5, y: .5 }] }]), /標記顏色/);
  M20.validateMarks([{ type: 'opening', kind: 'window', points: [{ x: .2, y: .3 }, { x: .4, y: .25 }, { x: .4, y: .6 }, { x: .2, y: .65 }] }], true);
  assert.throws(() => M20.validateMarks([{ type: 'opening', kind: 'door', points: [{ x: .2, y: .3 }, { x: .2, y: .3 }, { x: .2, y: .3 }, { x: .2, y: .3 }] }], true), /門窗開口/);
  assert.throws(() => M20.validateMarks([{ type: 'opening', kind: 'door', points: [{ x: .2, y: .3 }, { x: .4, y: .25 }, { x: .4, y: .6 }] }], true), /門窗開口/);
  assert.equal(M20.conditionTone('crack'), 'red'); assert.equal(M20.conditionTone('damp'), 'blue');
});


import { PRESET_PLANES as PLANES21, planeTransform as planeTransform21, planeAt as planeAt21, openingOnPlane as openingOnPlane21 } from '../detail-geometry.js';
import * as M21 from '../model.js';
test('oblique preset faces map two taps to a face-aligned opening; flat faces and unfolded presets keep rectangles', () => {
  for (const plane of [...PLANES21.corner, ...PLANES21.wall, ...PLANES21.beam, ...PLANES21.frame]) {
    const t = planeTransform21(plane);
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1], [.3, .7]]) { const p = t.forward({ u, v }), back = t.inverse(p); assert(Math.abs(back.u - u) < 1e-9 && Math.abs(back.v - v) < 1e-9, 'projective round trip'); }
    assert(Math.abs(t.forward({ u: 0, v: 0 }).x - plane[0].x) < 1e-12 && Math.abs(t.forward({ u: 1, v: 1 }).y - plane[2].y) < 1e-12, 'unit square corners land on the face corners');
  }
  const right = planeAt21('corner', false, { x: .7, y: .4 }); assert(right && right.plane === PLANES21.corner[1] && !right.flat);
  const quad = openingOnPlane21('corner', false, { x: .62, y: .35 }, { x: .85, y: .6 }); assert.equal(quad.length, 4);
  assert(quad.every(q => { const l = right.inverse(q); return l.u > -1e-9 && l.u < 1 + 1e-9 && l.v > -1e-9 && l.v < 1 + 1e-9; }), 'all corners stay on the tapped face');
  assert(Math.abs(quad[0].y - quad[1].y) > .01, 'the opening follows the wall perspective rather than staying axis-aligned');
  M21.validateMarks([{ type: 'opening', kind: 'window', points: quad }], true);
  const mirrored = openingOnPlane21('corner', true, { x: 1 - .62, y: .35 }, { x: 1 - .85, y: .6 });
  assert.deepEqual(mirrored.map(p => [Math.round((1 - p.x) * 1e9), Math.round(p.y * 1e9)]), quad.map(p => [Math.round(p.x * 1e9), Math.round(p.y * 1e9)]), 'mirrored presets mirror the snapped opening');
  const front = openingOnPlane21('wall', false, { x: .3, y: .4 }, { x: .5, y: .7 }); assert.equal(front.length, 2); assert(front[0].x < front[1].x && front[0].y < front[1].y);
  assert.equal(openingOnPlane21('wall', false, { x: .5, y: .95 }, { x: .6, y: .99 }), null, 'taps outside every face fall back to the plain rectangle');
  assert.equal(openingOnPlane21('flatWindow', false, { x: .3, y: .4 }, { x: .5, y: .7 }), null, 'unfolded presets have no perspective faces');
  assert.equal(openingOnPlane21('corner', false, { x: .7, y: .4 }, { x: .7, y: .4 }), null, 'degenerate taps are refused');
  assert.equal(Object.keys(M21.DETAIL_PRESETS).length, 12); assert.deepEqual(M21.DETAIL_PRESET_GROUPS.flatMap(g => g[1]).sort(), Object.keys(M21.DETAIL_PRESETS).sort());
  const p = M21.newProject('F21', '展開底圖驗證', '2026-09-21'), u = M21.newUnit('A'), r = M21.newRecord(u.id, '1F', '客廳'); p.units.push(u);
  r.detail = { kind: 'preset', preset: 'flatCorner', mirror: false, marks: [{ type: 'opening', kind: 'door', points: [{ x: .3, y: .5 }, { x: .4, y: .9 }] }] }; p.records.push(r); M21.validateProject(p);
  assert.throws(() => M21.validateProject({ ...p, records: [{ ...r, detail: { ...r.detail, preset: 'flatRoof' } }] }), /細部圖預選/);
});
