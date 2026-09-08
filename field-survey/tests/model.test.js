import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newUnit, newRecord, id, now, sha256, validateProject, recordIssues, subset, restoredCopy } from '../model.js';
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
