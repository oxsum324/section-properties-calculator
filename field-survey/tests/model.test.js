import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newUnit, newRecord, id, now, sha256, validateProject, recordIssues, unitIssues, subset, restoredCopy, widthMode, recordComponents, recordConditions, emptySketch, validateSketch } from '../model.js';
import { makeBundle, readBundle, snapshot, makeReceipt, checkReceipt } from '../bundle.js';
import { resolveSketchPoint, doorGeometry, expandSketch, sketchArea, sketchView, hitSketch, deleteSketchSelection } from '../sketch.js';
import { syncRooms, clearWrongFloor, observationText, tileTotal, photoPlacement } from '../model.js';
import { attachmentIndex, reportPhotos, groupPlanEntries, moveRoom, textChunks } from '../report.js';
import { stairGeometry } from '../stairs.js';

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
  assert.equal(restored.manifest.version, 4);
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
  assert.equal(result.manifest.version, 4); assert.deepEqual(result.project.records[0], r); assert.equal(result.project.records[0].photos.length, 1);
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
