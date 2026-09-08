import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newUnit, newRecord, id, now, sha256, validateProject, recordIssues, subset, restoredCopy, widthMode, recordComponents, emptySketch, validateSketch } from '../model.js';
import { makeBundle, readBundle, snapshot, makeReceipt, checkReceipt } from '../bundle.js';

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
