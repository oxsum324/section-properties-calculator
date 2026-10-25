import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newUnit, newRecord, id, now, sha256, clone, canonicalJSON, signoffHash, validateProject, restoredCopy, rebaseSignoffs, removeRecordPhotos, assertSignoffHistory, latestSignoffVisit } from '../model.js';
import { proposedSignoff, revisedSignoff, exportSignoff, sealSignoff, signoffChanged, signoffFields, signoffHTML } from '../signoff.js';
import { makeBundle, readBundle, consolidateBundles } from '../bundle.js';
import { attachmentIndex } from '../report.js';

async function revisionFixture() {
  const p = newProject('REV-A', '簽認修訂測試', '2026-10-25'), u = newUnit('A101', '原門牌'); p.units.push(u);
  const r = newRecord(u.id, '1F', '客廳'); r.visitId = p.visits[0].id; r.observedOn = '2026-10-25'; r.condition = 'normal'; p.records.push(r);
  const blob = new Blob(['synthetic-original'], { type: 'image/png' }), mid = id();
  p.media.push({ id: mid, kind: 'image', name: 'synthetic.png', type: blob.type, size: blob.size, sha256: await sha256(blob), importedAt: now() });
  r.photos.push({ mediaId: mid, role: 'overview', caption: '', marks: [], excluded: false, excludedReason: '' });
  const x = proposedSignoff(p, u.id, r.visitId); x.scope = '客廳';
  x.signers.push({ id: id(), role: 'resident', group: 'resident', name: '合成住戶', org: '', title: '', relation: '', status: 'paper', reason: '', signedAt: now(), timeZone: 'Asia/Taipei', source: 'live', mediaId: mid });
  await sealSignoff(p, x); p.signoffs.push(x); validateProject(p); return { p, u, r, x, blob };
}

test('signed identity stays frozen and changed identity exports an unsigned current form', async () => {
  const { p, u, x, blob } = await revisionFixture(), original = canonicalJSON(x.signedContent);
  p.code = 'REV-B'; p.name = '變更案名'; u.code = 'B999'; u.address = '新門牌';
  assert.equal(await signoffChanged(p, x), true);
  assert.equal(signoffFields(p, x)['unit.address'], '原門牌');
  assert.equal(signoffFields(p, x)['project.code'], 'REV-A');
  const current = await exportSignoff(p, u.id); assert.equal(current.signers.length, 0);
  const html = await signoffHTML(p, current, async () => ({ blob }));
  assert(html.includes('本次尚未簽認') && html.includes('新門牌') && !html.includes('合成住戶'));
  assert.equal(canonicalJSON(x.signedContent), original);
});

test('scope edits create a new revision without copying any prior signatures', async () => {
  const { p, x } = await revisionFixture(), original = clone(x), draft = clone(x);
  draft.scope = '全棟'; draft.date = '2026-10-24';
  const next = await revisedSignoff(p, draft);
  assert.notEqual(next.id, x.id); assert.equal(next.revisionOf, x.id); assert.deepEqual(next.signers, []);
  await sealSignoff(p, next); p.signoffs.push(next); validateProject(p);
  assert.deepEqual(x, original); assertSignoffHistory({ signoffs: [original] }, p);
  const forced = clone(p); forced.signoffs[0].scope = '覆寫';
  assert.throws(() => validateProject(forced), /不可覆寫/);
  await assert.rejects(sealSignoff(p, { ...clone(x), scope: '覆寫' }), /不可覆寫/);
});

test('unchanged content appends a signer to the same revision and preserves original signatures', async () => {
  const { p, x } = await revisionFixture(), before = clone(p);
  const same = await revisedSignoff(p, clone(x)); assert.equal(same.id, x.id);
  same.signers.push({ ...clone(x.signers[0]), id: id(), name: '第二位住戶' });
  await sealSignoff(p, same); p.signoffs[0] = same;
  assertSignoffHistory(before, p); assert.equal(await signoffChanged(p, same), false);
  const bad = clone(p); bad.signoffs[0].signers[0].name = '移用簽章';
  assert.throws(() => assertSignoffHistory(before, bad), /不可覆寫/);
  const missing = clone(p); missing.signoffs = [];
  assert.throws(() => assertSignoffHistory(before, missing), /須保留/);
});

test('presentation order, numbering, timestamps and report page settings do not require a new signature', async () => {
  const { p, u, r, x } = await revisionFixture();
  const r2 = clone(r); r2.id = id(); r2.space = '餐廳'; p.records.push(r2);
  delete x.signedContent; delete x.contentDigest; await sealSignoff(p, x);
  r.fieldNumber = 7; r.updatedAt = '2026-10-26T00:00:00Z'; r.mainPhotoId = r.photos[0].mediaId;
  p.records.reverse(); p.reportSettings.pageStart = 20; p.reportSettings.pagePrefix = '附-';
  validateProject(p); assert.equal(await signoffChanged(p, x), false);
  assert.equal((await exportSignoff(p, u.id)).id, x.id);
});

test('content text, photo marks, adopted selection and photo removal are substantive changes', async () => {
  for (const change of [
    r => { r.notes = '新增滲水痕'; },
    r => { r.photos[0].caption = '變更照片說明'; },
    r => { r.photos[0].marks.push({ type: 'text', points: [{ x: .2, y: .2 }], text: '新圈註' }); },
    r => { r.photos[0].reportInclude = false; },
    r => { r.photos = []; }
  ]) {
    const { p, r, x } = await revisionFixture(); change(r);
    assert.equal(await signoffChanged(p, x), true);
    assert.equal((await revisedSignoff(p, clone(x))).signers.length, 0);
  }
});

test('the latest actual unit visit controls export and never falls back to an older signed visit', async () => {
  const { p, u, r, x } = await revisionFixture();
  const v = { id: id(), name: '第二次會勘', start: '2026-10-26', end: '2026-10-26' }; p.visits.push(v);
  const next = newRecord(u.id, '1F', '客廳'); next.visitId = v.id; next.observedOn = v.start; p.records.push(next);
  const current = await exportSignoff(p, u.id); assert.equal(current.visitId, v.id); assert.deepEqual(current.signers, []);
  p.signoffs.push({ ...clone(x), id: id() });
  assert.equal(latestSignoffVisit(p, u.id), v.id);
  p.visits.push({ id: id(), name: '其他戶會勘', start: '2026-10-27', end: '2026-10-27' });
  assert.equal(latestSignoffVisit(p, u.id), v.id); assert.equal(r.visitId, x.visitId);
});

test('historical signed media and revisions survive scoped backup, restore and consolidation', async () => {
  const { p, u, r, x, blob } = await revisionFixture(), snapshot = clone(x.signedContent);
  removeRecordPhotos(p, r.id, [r.photos[0].mediaId]); assert.equal(p.media.length, 1);
  const next = await revisedSignoff(p, clone(x)); await sealSignoff(p, next); p.signoffs.push(next);
  const bundle = await readBundle((await makeBundle(p, async () => blob, u.id)).blob);
  assert.equal(bundle.manifest.version, 19); assert.equal(bundle.project.media.length, 1);
  const copy = restoredCopy(bundle.project).project; await rebaseSignoffs(copy, bundle.project); validateProject(copy);
  assert.deepEqual(copy.signoffs[0].signedContent, snapshot); assert.equal(copy.signoffs[1].revisionOf, copy.signoffs[0].id);
  const merged = await consolidateBundles(newProject('JOIN', '彙整主案', '2026-10-25'), [{ ...bundle, label: '同事' }]);
  assert.deepEqual(merged.project.signoffs[0].signedContent, snapshot);
  assert.equal(merged.project.signoffs[1].revisionOf, merged.project.signoffs[0].id);
});

test('unchanged snapshots remain valid after identity remapping and keep original printed identity', async () => {
  const { p, x, blob } = await revisionFixture(), frozen = clone(x.signedContent);
  const copy = restoredCopy(p).project; await rebaseSignoffs(copy, p);
  assert.deepEqual(copy.signoffs[0].signedContent, frozen); assert.equal(await signoffChanged(copy, copy.signoffs[0]), false);
  const bundle = await readBundle((await makeBundle(p, async () => blob)).blob);
  const merged = await consolidateBundles(newProject('JOIN', '彙整', '2026-10-25'), [{ ...bundle, label: '來源' }]);
  assert.equal(await signoffChanged(merged.project, merged.project.signoffs[0]), false);
  assert.equal(signoffFields(merged.project, merged.project.signoffs[0])['unit.code'], 'A101');
});

test('legacy format 18 signatures remain intact without adding external legacy notices', async () => {
  const { p, x, u, blob } = await revisionFixture();
  delete x.signedContent; delete x.contentDigest; x.snapshotHash = await signoffHash(p, x);
  const old = clone(x), bundle = await makeBundle(p, async () => blob);
  const headerSize = 'CSURVEY/1\n'.length + 11, header = await bundle.blob.slice(0, headerSize).text(), length = Number(header.slice('CSURVEY/1\n'.length, -1));
  const manifest = JSON.parse(await bundle.blob.slice(headerSize, headerSize + length).text()); manifest.version = 18;
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const archive = new Blob(['CSURVEY/1\n' + String(bytes.length).padStart(10, '0') + '\n', bytes, bundle.blob.slice(headerSize + length)]);
  const read = await readBundle(archive); assert.deepEqual(read.project.signoffs[0], old);
  const chosen = await exportSignoff(read.project, u.id), html = await signoffHTML(read.project, chosen, async () => ({ blob }));
  assert(html.includes('合成住戶')); assert(!/舊版簽認|無法完整核對|追溯不足/.test(html));
  const next = await revisedSignoff(p, clone(x)); assert.notEqual(next.id, x.id); assert.deepEqual(next.signers, []);
});

test('public floor segments have one stable signoff home carried into the attachment index', async () => {
  const { p, u, r } = await revisionFixture(); u.kind = 'public';
  const r2 = clone(r); r2.id = id(); r2.floor = '2F'; p.records.push(r2);
  const index = attachmentIndex(p, { includeSignoffs: true, publicByFloor: true });
  assert.equal(index.signoffSegments[u.id], u.id + '/1F');
});

test('photo reorder preserves the adopted image set fixed at save and signing time', async () => {
  const { p, r, x } = await revisionFixture();
  const { preserveReportSelection, recordReportPhotos } = await import('../model.js');
  const second = id(), meta = { ...p.media[0], id: second, sha256: 'f'.repeat(64), name: 'other.png' }; p.media.push(meta);
  r.photos.push({ ...clone(r.photos[0]), mediaId: second });
  preserveReportSelection(r); delete x.signedContent; delete x.contentDigest; await sealSignoff(p, x);
  const before = recordReportPhotos(r).map(p => p.mediaId); r.photos.reverse();
  assert.deepEqual(recordReportPhotos(r).map(p => p.mediaId), before); assert.equal(await signoffChanged(p, x), false);
  r.photos.forEach(p => { p.reportInclude = p.mediaId === second; });
  assert.equal(await signoffChanged(p, x), true);
});

test('legacy presentation normalization has an internal comparison baseline without losing original signatures', async () => {
  const { p, r, x } = await revisionFixture(), { trackLegacySignoffs, preserveReportSelection } = await import('../model.js');
  delete x.signedContent; delete x.contentDigest; x.snapshotHash = await signoffHash(p, x);
  const previous = clone(p); await trackLegacySignoffs(p, previous);
  preserveReportSelection(r); r.updatedAt = '2026-10-26T00:00:00Z';
  assert.equal(await signoffChanged(p, x), false); assertSignoffHistory(previous, p);
  r.notes = '新增實際內容'; assert.equal(await signoffChanged(p, x), true);
});

test('modern refusal needs a live witness and absence needs an explicit reason', async () => {
  const { p, x, blob } = await revisionFixture(), mid = id();
  p.media.push({ ...p.media[0], id: mid, kind: 'signature' });
  const witness = { ...clone(x.signers[0]), id: id(), role: 'surveyor', group: 'surveyor', status: 'signed', mediaId: mid, strokes: { aspect: 3, strokes: [Array.from({ length: 12 }, (_, i) => ({ x: .1 + i * .025, y: .2 + i * .01, t: i * 10, p: .5 }))] } };
  const refusal = { ...clone(x.signers[0]), id: id(), status: 'refused', reason: '本次拒簽', attestedBy: witness.id }; delete refusal.mediaId;
  x.signers.push(witness, refusal); await sealSignoff(p, x); validateProject(p);
  witness.voided = { at: now(), reason: '作廢見證' }; assert.throws(() => validateProject(p), /見證/);
  refusal.voided = { at: now(), reason: '一併作廢' }; validateProject(p);
  delete witness.voided; delete refusal.voided; refusal.status = 'absent'; refusal.reason = '';
  assert.throws(() => validateProject(p), /不在場須填原因/);
  refusal.reason = '外出未在場'; validateProject(p); assert(blob.size > 0);
});

test('Chinese observation content has the same fingerprint regardless of input order', async () => {
  const { p, r, x } = await revisionFixture(), { signoffContent, signoffContentDigest } = await import('../model.js');
  for (const space of ['一樓', '二樓', '三樓']) { const q = clone(r); q.id = id(); q.space = space; p.records.push(q); }
  const first = await signoffContentDigest(signoffContent(p, x)); p.records.reverse();
  assert.equal(await signoffContentDigest(signoffContent(p, x)), first);
});

test('numbering history preserves old and new photo numbers while signed content remains unchanged', async () => {
  const { p, r, x, blob } = await revisionFixture(), report = await import('../report.js');
  const second = clone(r); second.id = id(); second.space = '餐廳'; p.records.push(second);
  delete x.signedContent; delete x.contentDigest; await sealSignoff(p, x);
  const first = attachmentIndex(p);
  assert(report.rememberAttachmentNumbering(p, first, '0'.repeat(64))); p.records.reverse();
  const next = attachmentIndex(p), changes = report.attachmentNumberingChanges(p, next);
  assert.equal(changes.length, 2); assert(changes.every(x => x.previousNumber !== null && x.number !== x.previousNumber));
  assert.equal(await signoffChanged(p, x), false);
  assert(report.rememberAttachmentNumbering(p, next, '1'.repeat(64)));
  assert.equal(report.rememberAttachmentNumbering(p, next, '1'.repeat(64)), false);
  validateProject(p);
  const bundle = await readBundle((await makeBundle(p, async () => blob)).blob), copy = restoredCopy(bundle.project);
  assert.equal(copy.project.attachmentNumberingHistory.length, 2);
  assert(copy.project.attachmentNumberingHistory.every(h => h.numbers.every(n => n.mediaId === copy.remap.get(r.photos[0].mediaId))));
});

test('single-unit backups keep only that units numbering comparison history', async () => {
  const { p, u, r, blob } = await revisionFixture(), report = await import('../report.js');
  const other = newUnit('B102', '其他門牌'); p.units.push(other);
  const row = clone(r); row.id = id(); row.unitId = other.id; p.records.push(row);
  report.rememberAttachmentNumbering(p, attachmentIndex(p), '0'.repeat(64));
  const scoped = await readBundle((await makeBundle(p, async () => blob, u.id)).blob);
  assert(scoped.project.attachmentNumberingHistory.every(h => h.units.every(uid => uid === u.id) && h.numbers.every(n => n.unitId === u.id)));
});
