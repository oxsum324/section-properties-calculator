// Signoff snapshots and history use model primitives through live ES module bindings.
// No model data is read during module initialization.
import { clone, canonicalJSON, sha256, assert, validDate, photoIncluded, recordsDigest } from './model.js';

export const SIGNOFF_CONTENT_KEYS = ['date', 'weather', 'status', 'reason', 'scope', 'statement', 'summary'];
export const signoffConsent = x => Object.fromEntries(SIGNOFF_CONTENT_KEYS.map(key => [key, clone(x[key])]));
export function signoffIdentity(p, x) {
  const u = p.units.find(u => u.id === x.unitId), v = p.visits?.find(v => v.id === x.visitId);
  return { code: p.code, name: p.name, unitCode: u?.code || '', address: u?.address || '', building: u?.building || '', floor: u?.floor || '', kind: u?.kind || 'residence', visitName: v?.name || '', visitStart: v?.start || '', visitEnd: v?.end || '' };
}

export function defaultReportPhotoIds(r) {
  const photos = r.photos.filter(p => !p.excluded), ids = new Set();
  for (const role of ['overview', 'close']) { const p = photos.find(x => x.role === role); if (p) ids.add(p.mediaId); }
  if (!ids.size && photos[0]) ids.add(photos[0].mediaId);
  if (r.mainPhotoId) ids.add(r.mainPhotoId);
  return ids;
}
export function recordReportPhotos(r) {
  const defaults = defaultReportPhotoIds(r);
  return r.photos.filter(p => photoIncluded(p) && (p.reportInclude === true || p.reportInclude === undefined && defaults.has(p.mediaId)));
}
export function preserveReportSelection(r) {
  const included = new Set(recordReportPhotos(r).map(p => p.mediaId));
  for (const photo of r.photos) photo.reportInclude = included.has(photo.mediaId);
  return r;
}

export function signoffObservations(p, x) {
  const used = new Set();
  const media = mid => { const m = p.media.find(m => m.id === mid); assert(m, '簽認原始媒體遺失'); used.add(mid); return m.sha256; };
  const plan = pid => {
    const source = p.plans.find(plan => plan.id === pid); assert(source, '簽認位置圖遺失');
    const q = clone(source); delete q.id; delete q.unitId; delete q.labelLayout; q.mediaId = media(q.mediaId); return q;
  };
  const placement = q => q ? { ...clone(q), planId: plan(q.planId) } : q;
  const records = p.records.filter(r => x.level === 'unit' && r.unitId === x.unitId && r.visitId === x.visitId).map(source => {
    const r = clone(source), included = new Set(recordReportPhotos(source).map(p => p.mediaId));
    for (const key of ['id', 'unitId', 'visitId', 'roomId', 'fieldNumber', 'createdAt', 'updatedAt', 'mainPhotoId']) delete r[key];
    r.photos = r.photos.map(photo => {
      const q = clone(photo); q.reportInclude = included.has(q.mediaId); q.mediaId = media(q.mediaId);
      if (q.placement) q.placement = placement(q.placement);
      delete q.number; return q;
    }).sort((a, b) => canonicalJSON(a) < canonicalJSON(b) ? -1 : canonicalJSON(a) > canonicalJSON(b) ? 1 : 0);
    r.audioIds = r.audioIds.map(media).sort();
    if (r.detail?.mediaId) r.detail.mediaId = media(r.detail.mediaId);
    if (r.placement) r.placement = placement(r.placement);
    if (r.observationPin) r.observationPin = placement(r.observationPin);
    return r;
  }).sort((a, b) => canonicalJSON(a) < canonicalJSON(b) ? -1 : canonicalJSON(a) > canonicalJSON(b) ? 1 : 0);
  const assets = [...new Map(p.media.filter(m => used.has(m.id)).map(m => [m.sha256, { sha256: m.sha256, kind: m.kind, type: m.type, size: m.size, name: m.name }])).values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
  return { records, media: assets };
}
export const signoffContent = (p, x) => JSON.parse(JSON.stringify({ version: 1, identity: signoffIdentity(p, x), consent: signoffConsent(x), observations: signoffObservations(p, x) }));
export const signoffContentDigest = content => sha256(new TextEncoder().encode(canonicalJSON(content)));
export async function signoffContentChanged(p, x) {
  if (x.sourceChanged) return true;
  if (!x.signedContent) {
    if (x.legacyTracking) return x.legacyTracking.changed || canonicalJSON(signoffIdentity(p, x)) !== canonicalJSON(x.legacyTracking.identity) || await signoffContentDigest(signoffObservations(p, x)) !== x.legacyTracking.observationsDigest;
    return x.level === 'unit' && x.recordsDigest !== await recordsDigest(p, x.unitId, x.visitId);
  }
  const content = signoffContent(p, x);
  if (x.comparisonIdentity && canonicalJSON(content.identity) === canonicalJSON(x.comparisonIdentity)) content.identity = x.signedContent.identity;
  return await signoffContentDigest(content) !== x.contentDigest;
}

export async function trackLegacySignoffs(p, previous) {
  for (const x of p.signoffs || []) {
    const old = previous?.signoffs?.find(y => y.id === x.id);
    if (!old?.signers.length || x.signedContent || x.legacyTracking) continue;
    x.legacyTracking = { identity: signoffIdentity(previous, old), observationsDigest: await signoffContentDigest(signoffObservations(previous, old)), changed: await signoffContentChanged(previous, old) };
  }
}

export const signoffMediaHashes = p => new Set((p.signoffs || []).flatMap(x => x.signedContent?.observations.media.map(m => m.sha256) || []));
export function latestSignoffVisit(p, unitId) {
  const involved = new Map(), add = (visitId, date) => {
    const v = p.visits?.find(v => v.id === visitId); if (!v) return;
    const day = validDate(date) ? date : v.start;
    if (!involved.has(visitId) || day > involved.get(visitId)) involved.set(visitId, day);
  };
  for (const h of p.units.find(u => u.id === unitId)?.visitHistory || []) add(h.visitId, h.date);
  for (const r of p.records.filter(r => r.unitId === unitId)) add(r.visitId, r.observedOn);
  for (const x of p.signoffs || []) if (x.level === 'unit' && x.unitId === unitId) add(x.visitId, x.date);
  return [...involved.keys()].sort((a, b) => involved.get(b).localeCompare(involved.get(a)) || p.visits.findIndex(v => v.id === b) - p.visits.findIndex(v => v.id === a))[0] || p.visits?.at(-1)?.id;
}
export const latestUnitSignoff = (p, unitId) => (p.signoffs || []).findLast(x => x.level === 'unit' && x.unitId === unitId && x.visitId === latestSignoffVisit(p, unitId));
export function assertSignoffHistory(previous, next) {
  for (const old of previous?.signoffs || []) {
    if (!old.signers.length) continue;
    const x = next.signoffs?.find(x => x.id === old.id); assert(x, '已簽認紀錄須保留，請另建修訂版');
    assert(canonicalJSON(signoffConsent(x)) === canonicalJSON(signoffConsent(old)), '已簽認內容不可覆寫，請另建修訂版');
    for (const key of ['signedContent', 'contentDigest', 'comparisonIdentity', 'revisionOf', 'recordsDigest', 'sourceChanged', 'sourceRecordsDigest', 'sourceSnapshotHash', 'createdAt']) assert(canonicalJSON(x[key]) === canonicalJSON(old[key]), '已簽認快照不可覆寫，請另建修訂版');
    if (old.legacyTracking) assert(canonicalJSON(x.legacyTracking) === canonicalJSON(old.legacyTracking), '舊簽認內部追溯資料不可覆寫');
    for (const signer of old.signers) {
      const current = x.signers.find(y => y.id === signer.id); assert(current, '原簽署人須保留，請以作廢記錄處理');
      const a = clone(signer), b = clone(current); delete a.voided; delete b.voided;
      assert(canonicalJSON(a) === canonicalJSON(b) && (!signer.voided || canonicalJSON(signer.voided) === canonicalJSON(current.voided)), '原簽章不可覆寫');
    }
  }
}
