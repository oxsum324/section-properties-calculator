import { assert, clone, sha256, subset, validateProject, now } from './model.js';
const PREFIX = 'CSURVEY/1\n', HEADER_SIZE = PREFIX.length + 11;
const MAX_MANIFEST = 8 * 1024 * 1024, MAX_BUNDLE = 2 * 1024 * 1024 * 1024;
const encode = value => new TextEncoder().encode(JSON.stringify(value));
export async function snapshot(project, unitId = '') {
  const p = subset(project, unitId); validateProject(p);
  const payload = { scope: unitId, project: p, assets: p.media.map(m => ({ id: m.id, size: m.size, sha256: m.sha256 })) };
  return { payload, digest: await sha256(encode(payload)) };
}
export async function makeBundle(project, getBlob, unitId = '', progress = () => {}) {
  const { payload, digest } = await snapshot(project, unitId), parts = [];
  let total = 0;
  for (const [i, a] of payload.assets.entries()) {
    const blob = await getBlob(a.id);
    assert(blob instanceof Blob && blob.size === a.size && await sha256(blob) === a.sha256, '原始檔核對失敗，備份未完成');
    parts.push(blob); total += blob.size; assert(total <= MAX_BUNDLE, '資料超過 2 GB，請選擇單戶分包匯出');
    progress(i + 1, payload.assets.length);
  }
  const manifest = { kind: 'condition-survey-bundle', version: 5, createdAt: now(), payload, digest };
  const bytes = encode(manifest); assert(bytes.length <= MAX_MANIFEST, '紀錄資料過大，請按戶分包');
  const header = PREFIX + String(bytes.length).padStart(10, '0') + '\n';
  return { blob: new Blob([header, bytes, ...parts], { type: 'application/octet-stream' }), manifest };
}
export async function readBundle(blob, progress = () => {}) {
  assert(blob.size >= HEADER_SIZE && blob.size <= MAX_BUNDLE + MAX_MANIFEST + HEADER_SIZE, '備份大小不正確');
  const header = await blob.slice(0, HEADER_SIZE).text();
  assert(header.startsWith(PREFIX) && /^\d{10}\n$/.test(header.slice(PREFIX.length)), '不是現況鑑定備份檔');
  const length = Number(header.slice(PREFIX.length, -1));
  assert(length > 0 && length <= MAX_MANIFEST && HEADER_SIZE + length <= blob.size, '備份標頭損壞');
  let manifest;
  try { manifest = JSON.parse(await blob.slice(HEADER_SIZE, HEADER_SIZE + length).text()); } catch { throw new Error('備份資料無法讀取'); }
  assert(manifest.kind === 'condition-survey-bundle' && [1, 2, 3, 4, 5].includes(manifest.version) && manifest.payload, '不支援此備份版本，請先更新工具');
  const { payload } = manifest; validateProject(payload.project);
  assert(typeof payload.scope === 'string' && (!payload.scope || payload.project.units.some(u => u.id === payload.scope)), '備份戶別不正確');
  assert(await sha256(encode(payload)) === manifest.digest, '紀錄資料指紋不符，備份未通過核對');
  assert(Array.isArray(payload.assets) && payload.assets.length === payload.project.media.length, '媒體清單數量不符');
  let offset = HEADER_SIZE + length; const media = [], ids = new Set();
  for (const [i, a] of payload.assets.entries()) {
    const m = payload.project.media[i];
    assert(a.id === m.id && a.size === m.size && a.sha256 === m.sha256 && !ids.has(a.id), '媒體清單內容不符'); ids.add(a.id);
    assert(offset + a.size <= blob.size, `備份照片／錄音不完整：${m.name}`);
    const file = blob.slice(offset, offset + a.size, m.type); offset += a.size;
    assert(await sha256(file) === a.sha256, `原始檔指紋不符：${m.name}`);
    media.push({ id: a.id, blob: file }); progress(i + 1, payload.assets.length);
  }
  assert(offset === blob.size, '備份含有未列入清單的資料');
  return { manifest, media, project: clone(payload.project) };
}
export function makeReceipt(manifest) {
  return { kind: 'condition-survey-receipt', version: 1, projectId: manifest.payload.project.id, scope: manifest.payload.scope, digest: manifest.digest, revision: manifest.payload.project.revision, mediaCount: manifest.payload.assets.length, verifiedAt: now() };
}
export async function checkReceipt(receipt, project, exports) {
  assert(receipt?.kind === 'condition-survey-receipt' && receipt.version === 1 && typeof receipt.scope === 'string', '核對收據格式不正確');
  const key = receipt.scope || 'all';
  const entry = Object.hasOwn(exports.entries, key) ? exports.entries[key] : null;
  assert(receipt.projectId === project.id && entry && receipt.digest === entry.digest, '收據不屬於這次匯出的案件');
  const current = await snapshot(project, receipt.scope);
  assert(receipt.digest === current.digest && receipt.revision === project.revision, '案件已修改，請重新匯出及核對');
  assert(receipt.mediaCount === current.payload.assets.length && Number.isFinite(Date.parse(receipt.verifiedAt)), '收據內容不完整');
  return { ...entry, verifiedAt: receipt.verifiedAt };
}
