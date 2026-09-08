export const VERSION = '0.1.0';
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const clone = value => structuredClone(value);
export const CONDITIONS = { '': '尚未分類', normal: '一般現況', crack: '裂隙', damp: '滲水跡', salt: '白華', spall: '剝落', other: '其他' };
export const COMPONENTS = ['', '外觀', '牆面', '梁', '柱', '地坪', '平頂', '門窗', '其他'];
export const UNIT_STATES = { open: '待完成', partial: '部分完成', inaccessible: '無法入內', complete: '本次紀錄完成' };
export const ROLES = { overview: '位置全景', close: '近照', scale: '量尺照', other: '其他' };
export function newProject(code, name, date) {
  return { id: id(), code: code.trim(), name: name.trim(), date, createdAt: now(), updatedAt: now(), revision: 0, units: [], records: [], plans: [], media: [] };
}
export function newUnit(code, address = '') { return { id: id(), code: code.trim(), address: address.trim(), status: 'open', reason: '' }; }
export function newRecord(unitId, floor = '', space = '') {
  return { id: id(), unitId, floor, space, location: '', component: '', condition: '', visibility: 'visible', notes: '', resident: '', measured: false, width: null, length: null, photos: [], audioIds: [], placement: null, createdAt: now(), updatedAt: now() };
}
export function recordIssues(r) {
  const issues = [];
  if (!r.floor.trim()) issues.push('缺樓層');
  if (!r.space.trim()) issues.push('缺空間');
  if (!r.location.trim() && !r.placement) issues.push('缺位置說明或圖上位置');
  if (!r.component) issues.push('缺部位');
  if (!r.condition) issues.push('尚未分類現況');
  if (!r.photos.some(p => !p.excluded) && r.visibility !== 'inaccessible') issues.push('尚無採用照片');
  if (r.visibility !== 'visible' && !r.notes.trim()) issues.push('請記錄無法觀察的原因');
  if (r.condition === 'crack' && !r.measured) issues.push('裂縫未量測');
  if (r.measured && (r.width === null || r.length === null)) issues.push('量測尺寸未齊');
  return issues;
}
export function unitIssues(p, u) {
  const records = p.records.filter(r => r.unitId === u.id);
  const issues = records.flatMap(r => recordIssues(r).map(text => ({ recordId: r.id, text })));
  if (!records.length && u.status !== 'inaccessible') issues.push({ text: '尚無現況紀錄' });
  if (['partial', 'inaccessible'].includes(u.status) && !u.reason.trim()) issues.push({ text: '缺未完成／無法入內原因' });
  return issues;
}
export function assert(condition, message) { if (!condition) throw new Error(message); }
function text(v, label, max = 10000) { assert(typeof v === 'string' && v.length <= max, `${label}格式不正確`); }
function identifier(v) { text(v, '識別碼', 100); assert(/^[\w-]+$/.test(v) && !['__proto__', 'constructor', 'prototype', 'all'].includes(v), '識別碼格式不正確'); }
function list(v, label, max = 10000) { assert(Array.isArray(v) && v.length <= max, `${label}數量或格式不正確`); }
function unique(items) { const ids = new Set(); for (const item of items) { identifier(item.id); assert(!ids.has(item.id), '識別碼重複'); ids.add(item.id); } return ids; }
const finite01 = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
export function validateMarks(marks) {
  list(marks, '圈註', 500);
  for (const m of marks) {
    assert(['circle', 'arrow', 'pen', 'text'].includes(m.type), '圈註種類不正確');
    list(m.points, '圈註座標', 2000);
    assert(m.points.length >= 1 && m.points.every(p => p && finite01(p.x) && finite01(p.y)), '圈註座標超出圖面');
    if (m.type === 'text') text(m.text, '圈註文字', 120);
  }
}
export function validateProject(p) {
  assert(p && typeof p === 'object', '缺案件資料'); identifier(p.id);
  for (const key of ['code', 'name', 'date', 'createdAt', 'updatedAt']) text(p[key], key, 250);
  assert(p.code.trim() && p.name.trim(), '案號及名稱不可空白');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(p.date), '會勘日期格式不正確');
  assert(Number.isSafeInteger(p.revision) && p.revision >= 0, '案件版本不正確');
  for (const key of ['units', 'records', 'plans', 'media']) list(p[key], key);
  const units = unique(p.units), media = unique(p.media), plans = unique(p.plans); unique(p.records);
  for (const u of p.units) {
    for (const k of ['code', 'address', 'reason']) text(u[k], k);
    assert(u.code.trim() && Object.hasOwn(UNIT_STATES, u.status), '戶別或狀態不正確');
  }
  const meta = new Map(p.media.map(m => [m.id, m]));
  for (const m of p.media) {
    text(m.name, '檔名', 500); text(m.type, '媒體類型', 100); text(m.importedAt, '取得時間', 100);
    assert(['image', 'audio', 'plan'].includes(m.kind), '媒體用途不正確');
    assert((m.kind === 'audio' ? /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)(;codecs=[\w,-]+)?$/ : /^image\/(jpeg|png|webp|heic|heif)$/).test(m.type), '媒體格式不正確');
    assert(Number.isSafeInteger(m.size) && m.size > 0 && m.size <= 60 * 1024 * 1024, '單一媒體大小超過 60 MB 或為空');
    assert(/^[a-f0-9]{64}$/.test(m.sha256), '媒體指紋不正確');
  }
  for (const plan of p.plans) {
    assert(units.has(plan.unitId) && media.has(plan.mediaId) && meta.get(plan.mediaId).kind === 'plan', '位置圖關聯遺失');
    for (const k of ['floor', 'title']) text(plan[k], k, 250);
  }
  for (const r of p.records) {
    assert(units.has(r.unitId), '紀錄的戶別不存在');
    for (const k of ['floor', 'space', 'location', 'notes', 'resident', 'createdAt', 'updatedAt']) text(r[k], k);
    assert(COMPONENTS.includes(r.component) && Object.hasOwn(CONDITIONS, r.condition), '現況分類不正確');
    assert(['visible', 'partial', 'inaccessible'].includes(r.visibility), '觀察狀態不正確');
    assert(typeof r.measured === 'boolean', '量測狀態不正確');
    for (const k of ['width', 'length']) assert(r[k] === null || (typeof r[k] === 'number' && Number.isFinite(r[k]) && r[k] >= 0), '尺寸須為非負數值或未量測');
    if (!r.measured) assert(r.width === null && r.length === null, '未量測不可夾帶尺寸');
    list(r.photos, '照片'); list(r.audioIds, '錄音');
    const refs = new Set();
    for (const photo of r.photos) {
      assert(media.has(photo.mediaId) && meta.get(photo.mediaId).kind === 'image', '照片原檔關聯遺失');
      assert(!refs.has(photo.mediaId), '同筆照片重複'); refs.add(photo.mediaId);
      assert(Object.hasOwn(ROLES, photo.role), '照片用途不正確'); text(photo.caption, '照片說明'); validateMarks(photo.marks);
      assert(typeof photo.excluded === 'boolean', '照片採用狀態不正確'); text(photo.excludedReason, '不採用原因', 500);
      assert(!photo.excluded || photo.excludedReason.trim(), '缺少照片不採用原因');
    }
    for (const audioId of r.audioIds) assert(media.has(audioId) && meta.get(audioId).kind === 'audio', '錄音原檔關聯遺失');
    if (r.placement) {
      const q = r.placement, plan = p.plans.find(x => x.id === q.planId);
      assert(plans.has(q.planId) && plan.unitId === r.unitId && plan.floor === r.floor, '位置圖戶別或樓層不一致');
      assert([q.x, q.y, q.endX, q.endY].every(finite01), '位置圖座標不正確');
    }
  }
  return p;
}
export async function sha256(blob) {
  const buffer = blob instanceof Blob ? await blob.arrayBuffer() : blob;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function subset(p, unitId = '') {
  const result = clone(p);
  if (!unitId) return result;
  assert(p.units.some(u => u.id === unitId), '找不到匯出的戶別');
  result.units = result.units.filter(u => u.id === unitId);
  result.records = result.records.filter(r => r.unitId === unitId);
  result.plans = result.plans.filter(x => x.unitId === unitId);
  const used = new Set([...result.records.flatMap(r => [...r.photos.map(x => x.mediaId), ...r.audioIds]), ...result.plans.map(x => x.mediaId)]);
  result.media = result.media.filter(m => used.has(m.id));
  return result;
}
export function restoredCopy(p) {
  const copy = clone(p), remap = new Map(copy.media.map(m => [m.id, id()]));
  copy.id = id(); copy.name = copy.name.slice(0, 200) + '（還原副本）'; copy.revision = 0; copy.createdAt = now(); copy.updatedAt = now();
  copy.media.forEach(m => { m.id = remap.get(m.id); });
  copy.plans.forEach(x => { x.mediaId = remap.get(x.mediaId); });
  copy.records.forEach(r => { r.photos.forEach(x => { x.mediaId = remap.get(x.mediaId); }); r.audioIds = r.audioIds.map(x => remap.get(x)); });
  return { project: copy, remap };
}
