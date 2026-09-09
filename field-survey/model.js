export const VERSION = '0.7.0';
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const clone = value => structuredClone(value);
export const CONDITIONS = { '': '尚未分類', normal: '一般現況', crack: '裂隙', damp: '滲水跡', salt: '白華', spall: '剝落', other: '其他' };
export const COMPONENTS = ['', '外觀', '牆面', '梁', '柱', '地坪', '平頂', '門窗', '其他'];
export const UNIT_STATES = { open: '待完成', partial: '部分完成', inaccessible: '無法入內', complete: '本次紀錄完成' };
export const ROLES = { overview: '位置全景', close: '近照', scale: '量尺照', other: '其他' };
export const WIDTH_MODES = { unknown: '未確認', le03: '0.3 mm 以下（≤0.3）', gt03: '超過 0.3 mm（>0.3）', exact: '輸入實測值', lt03: '舊紀錄：小於 0.3 mm', ge03: '舊紀錄：大於或等於 0.3 mm' };
export const recordComponents = r => r.components ?? (r.component ? [r.component] : []);
export const recordConditions = r => r.conditions ?? (r.condition ? [r.condition] : []);
export const AREA_CONDITIONS = { crack: '網狀裂隙分布', damp: '滲水跡', salt: '白華', spall: '剝落', other: '其他損害' };
export const AREA_METHODS = { measured: '實測', estimated: '估計' };
export const CRACK_PATTERNS = { '': '尚未選擇', horizontal: '水平裂隙', vertical: '垂直裂隙', diagonal: '斜向裂隙', network: '網狀裂隙', u: '梁 U 型裂縫', other: '其他（於說明補充）' };
export const widthMode = r => r.widthMode ?? (r.width !== null ? 'exact' : 'unknown');
export const isNetworkCrack = r => recordConditions(r).includes('crack') && r.crackPattern === 'network';
export const isUCrack = r => recordConditions(r).includes('crack') && r.crackPattern === 'u' && recordComponents(r).includes('梁');
export const isTile = r => r.surface === 'tile';
export const photoPlacement = (r, photo) => photo.placement === undefined ? r.placement : photo.placement;
export const photoIncluded = photo => !photo.excluded && photo.reportInclude !== false;
export const roomKey = r => JSON.stringify([r.unitId, r.floor.trim(), r.space.trim()]);
// Stable room identities and field labels survive photo selection, sorting and unit backup.
export function syncRooms(p) {
  p.rooms ??= [];
  let next = Math.max(0, ...p.records.map(r => r.fieldNumber || 0)) + 1;
  for (const r of p.records) {
    r.fieldNumber ??= next++;
    if (!r.floor.trim() || !r.space.trim()) { delete r.roomId; continue; }
    let room = p.rooms.find(x => x.unitId === r.unitId && x.floor === r.floor.trim() && x.name === r.space.trim());
    if (!room) { room = { id: id(), unitId: r.unitId, floor: r.floor.trim(), name: r.space.trim() }; p.rooms.push(room); }
    r.roomId = room.id;
  }
  return p;
}
export function clearWrongFloor(p, r) {
  const valid = q => !q || p.plans.some(plan => plan.id === q.planId && plan.unitId === r.unitId && plan.floor === r.floor);
  if (!valid(r.placement)) r.placement = null;
  if (!valid(r.observationPin)) r.observationPin = null;
  for (const photo of r.photos) if (!valid(photo.placement)) photo.placement = null;
}
export function observationText(r) {
  const pieces = [], conditions = recordConditions(r), prefix = [r.space, r.location, recordComponents(r).join('、')].filter(Boolean).join(' · ');
  if (isUCrack(r)) {
    pieces.push(`U 型裂縫${r.crackCount == null ? '' : ` ${r.countApprox ? '約 ' : ''}${r.crackCount} 條`}`);
    if (r.measured && r.length !== null) pieces.push(`${r.uScope === 'each' ? '各條實測展開長度均為' : '代表 1 條實測展開長度'} ${r.length} m`);
    if (r.uPartial) pieces.push('裂縫路徑局部可見');
  } else if (conditions.includes('crack') && !isTile(r)) {
    pieces.push(r.crackPattern ? CRACK_PATTERNS[r.crackPattern] || '裂隙' : '裂隙');
    if (r.measured && r.length !== null) pieces.push(`實測長度 ${r.length} m`);
  }
  if (conditions.includes('crack')) {
    const mode = widthMode(r), scope = isUCrack(r) ? (r.uScope === 'each' ? '各條' : '代表條') : '';
    if (r.measured && mode === 'exact' && r.width !== null) pieces.push(`${scope}實測寬度 ${r.width} mm`);
    else if (['le03', 'gt03', 'lt03', 'ge03'].includes(mode)) pieces.push(`${scope}寬度${r.measured ? '實測區間' : '初記'}：${WIDTH_MODES[mode]}`);
  }
  if (isTile(r)) {
    const t = r.tiles || {}, amount = n => n == null ? '（塊數未記）' : ` ${t.approx ? '約 ' : ''}${n} 塊`;
    if (t.crack) pieces.push('磁磚裂隙' + amount(t.crackCount));
    if (t.broken) pieces.push('磁磚破損' + amount(t.brokenCount));
    if (t.crack && t.broken && t.overlapCount != null) pieces.push(`其中同時裂隙及破損 ${t.overlapCount} 塊`);
    const total = tileTotal(t); if (total !== null) pieces.push(`受損磁磚不重複合計 ${t.approx ? '約 ' : ''}${total} 塊`);
  }
  for (const c of conditions) if (c !== 'crack') pieces.push(CONDITIONS[c]);
  for (const [key, a] of Object.entries(r.areas || {})) if (conditions.includes(key) && a.value !== null && (key !== 'crack' || isNetworkCrack(r))) pieces.push(`${AREA_CONDITIONS[key]}面積 ${a.value} m²（${AREA_METHODS[a.method]}）`);
  return [prefix, pieces.join('；')].filter(Boolean).join('：') + (pieces.length ? '。' : '');
}
export function tileTotal(t) {
  if (t.crack && t.broken) return t.crackCount != null && t.brokenCount != null && t.overlapCount != null ? t.crackCount + t.brokenCount - t.overlapCount : null;
  return t.crack ? t.crackCount ?? null : t.broken ? t.brokenCount ?? null : null;
}
export const emptySketch = () => ({ version: 1, width: 1200, height: 900, strokes: [] });
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
  if (!r.location.trim() && !r.placement && !r.observationPin && !r.photos.some(p => p.placement)) issues.push('缺位置說明或圖上位置');
  if (!recordComponents(r).length) issues.push('缺部位');
  if (!recordConditions(r).length) issues.push('尚未分類現況');
  if (!r.photos.some(p => !p.excluded) && r.visibility !== 'inaccessible') issues.push('尚無採用照片');
  if (r.visibility !== 'visible' && !r.notes.trim()) issues.push('請記錄無法觀察的原因');
  if (isUCrack(r) && r.crackCount == null) issues.push('U 型裂縫條數未記');
  if (isTile(r) && r.tiles?.crack && r.tiles.crackCount == null) issues.push('磁磚裂隙塊數未記');
  if (isTile(r) && r.tiles?.broken && r.tiles.brokenCount == null) issues.push('磁磚破損塊數未記');
  if (recordConditions(r).includes('crack') && !isNetworkCrack(r) && !isUCrack(r) && !isTile(r)) {
    if (!r.measured) issues.push('裂縫未量測');
    if (r.measured && ((r.width === null && !['lt03', 'ge03', 'le03', 'gt03'].includes(widthMode(r))) || r.length === null)) issues.push('量測尺寸未齊');
  }
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
export function validateSketch(sketch) {
  assert(sketch && (sketch.version === 1 && sketch.width === 1200 && sketch.height === 900 || sketch.version === 2 && Number.isInteger(sketch.width) && Number.isInteger(sketch.height) && sketch.width >= 1200 && sketch.height >= 900 && sketch.width <= 4800 && sketch.height <= 4800), '簡圖格式不正確');
  list(sketch.strokes, '簡圖筆畫', 300);
  for (const stroke of sketch.strokes) {
    assert(['line', 'rect', 'pen', 'text', 'door', 'window'].includes(stroke.type), '簡圖筆畫種類不正確');
    list(stroke.points, '簡圖座標', 1500);
    assert(stroke.points.length >= 1 && stroke.points.every(p => p && finite01(p.x) && finite01(p.y)), '簡圖座標超出圖面');
    if (['line', 'rect', 'door', 'window'].includes(stroke.type)) assert(stroke.points.length === 2, '簡圖端點數量不正確');
    if (['door', 'window'].includes(stroke.type)) assert(Math.hypot(stroke.points[0].x - stroke.points[1].x, stroke.points[0].y - stroke.points[1].y) > 0, '門窗寬度不可為零');
    if (stroke.type === 'door') assert(stroke.swing === 1 || stroke.swing === -1, '門扇開啟方向不正確');
    if (stroke.type === 'text') { assert(stroke.points.length === 1, '簡圖文字位置不正確'); text(stroke.text, '簡圖文字', 60); assert(stroke.text.trim(), '簡圖文字不可空白'); }
  }
  return sketch;
}
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
  if (p.rooms !== undefined) {
    list(p.rooms, '房間'); unique(p.rooms);
    for (const room of p.rooms) { assert(units.has(room.unitId), '房間戶別不存在'); text(room.floor, '房間樓層', 100); text(room.name, '房間名稱', 100); assert(room.name.trim() && room.floor.trim(), '房間名稱及樓層不可空白'); }
  }
  const placement = (q, r) => { if (!q) return; const plan = p.plans.find(x => x.id === q.planId); assert(plan && plan.unitId === r.unitId && plan.floor === r.floor, '位置圖戶別或樓層不一致'); assert([q.x, q.y, q.endX, q.endY].every(finite01), '位置圖座標不正確'); };
  const count = v => v === null || Number.isSafeInteger(v) && v >= 0 && v <= 99999;
  const fieldNumbers = new Set();
  for (const u of p.units) {
    for (const k of ['code', 'address', 'reason']) text(u[k], k);
    assert(u.code.trim() && Object.hasOwn(UNIT_STATES, u.status), '戶別或狀態不正確');
  }
  const meta = new Map(p.media.map(m => [m.id, m]));
  for (const m of p.media) {
    text(m.name, '檔名', 500); text(m.type, '媒體類型', 100); text(m.importedAt, '取得時間', 100);
    assert(['image', 'audio', 'plan'].includes(m.kind), '媒體用途不正確');
    assert((m.kind === 'audio' ? /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)(;\s*codecs=(?:[\w.,+-]+|"[\w.,+ -]+"))?$/ : /^image\/(jpeg|png|webp|heic|heif)$/).test(m.type), '媒體格式不正確');
    assert(Number.isSafeInteger(m.size) && m.size > 0 && m.size <= 60 * 1024 * 1024, '單一媒體大小超過 60 MB 或為空');
    assert(/^[a-f0-9]{64}$/.test(m.sha256), '媒體指紋不正確');
  }
  for (const plan of p.plans) {
    assert(units.has(plan.unitId) && media.has(plan.mediaId) && meta.get(plan.mediaId).kind === 'plan', '位置圖關聯遺失');
    for (const k of ['floor', 'title']) text(plan[k], k, 250);
    if (plan.sketch !== undefined) validateSketch(plan.sketch);
  }
  for (const r of p.records) {
    if (r.fieldNumber !== undefined) { assert(Number.isSafeInteger(r.fieldNumber) && r.fieldNumber > 0 && !fieldNumbers.has(r.fieldNumber), '現場代號重複或不正確'); fieldNumbers.add(r.fieldNumber); }
    if (r.roomId !== undefined) assert(p.rooms?.some(x => x.id === r.roomId && x.unitId === r.unitId && x.floor === r.floor.trim() && x.name === r.space.trim()), '房間關聯不一致');
    if (r.crackCount !== undefined) assert(count(r.crackCount), '裂縫條數須為非負整數或未記');
    for (const key of ['countApprox', 'uPartial']) if (r[key] !== undefined) assert(typeof r[key] === 'boolean', '裂縫記法不正確');
    if (r.uScope !== undefined) assert(['representative', 'each'].includes(r.uScope), 'U 型裂縫量測範圍不正確');
    if (r.surface !== undefined) assert(['', 'tile', 'other'].includes(r.surface), '表面材質不正確');
    if (r.reportText !== undefined) text(r.reportText, '附件說明', 10000);
    if (r.tiles !== undefined) {
      const t = r.tiles; assert(t && typeof t === 'object', '磁磚紀錄不正確');
      for (const key of ['crack', 'broken', 'approx']) assert(typeof t[key] === 'boolean', '磁磚狀況不正確');
      for (const key of ['crackCount', 'brokenCount', 'overlapCount']) assert(count(t[key]), '磁磚塊數須為非負整數或未記');
      if (t.crack && t.broken && t.overlapCount !== null) assert(t.crackCount !== null && t.brokenCount !== null && t.overlapCount <= Math.min(t.crackCount, t.brokenCount), '重疊塊數不可超過任一分類塊數');
    }
    if (r.crackPattern === 'u' && recordConditions(r).includes('crack')) assert(recordComponents(r).includes('梁'), 'U 型裂縫須指定梁部位');
    assert(units.has(r.unitId), '紀錄的戶別不存在');
    for (const k of ['floor', 'space', 'location', 'notes', 'resident', 'createdAt', 'updatedAt']) text(r[k], k);
    assert(COMPONENTS.includes(r.component) && Object.hasOwn(CONDITIONS, r.condition), '現況分類不正確');
    if (r.components !== undefined) {
      list(r.components, '部位', COMPONENTS.length - 1);
      assert(r.components.every(c => c && COMPONENTS.includes(c)) && new Set(r.components).size === r.components.length, '部位選項重複或不正確');
      assert(r.component === (r.components[0] || ''), '部位摘要不一致');
    }
    if (r.conditions !== undefined) {
      list(r.conditions, '現況', Object.keys(CONDITIONS).length - 1);
      assert(r.conditions.every(c => c && Object.hasOwn(CONDITIONS, c)) && new Set(r.conditions).size === r.conditions.length, '現況選項重複或不正確');
      assert(r.condition === (r.conditions[0] || ''), '現況摘要不一致');
      assert(!r.conditions.includes('normal') || r.conditions.length === 1, '一般現況不可與損害現況並選');
    }
    if (r.areas !== undefined) {
      assert(r.areas && typeof r.areas === 'object' && !Array.isArray(r.areas), '損害面積格式不正確');
      for (const [key, value] of Object.entries(r.areas)) {
        assert(Object.hasOwn(AREA_CONDITIONS, key) && value && typeof value === 'object' && !Array.isArray(value), '損害面積種類不正確');
        assert(value.value === null || typeof value.value === 'number' && Number.isFinite(value.value) && value.value >= 0, '損害面積須為非負數值或未記錄');
        assert(Object.hasOwn(AREA_METHODS, value.method), '損害面積量測方式不正確');
      }
    }
    assert(['visible', 'partial', 'inaccessible'].includes(r.visibility), '觀察狀態不正確');
    assert(typeof r.measured === 'boolean', '量測狀態不正確');
    for (const k of ['width', 'length']) assert(r[k] === null || (typeof r[k] === 'number' && Number.isFinite(r[k]) && r[k] >= 0), '尺寸須為非負數值或未量測');
    if (!r.measured) assert(r.width === null && r.length === null, '未量測不可夾帶尺寸');
    assert(Object.hasOwn(WIDTH_MODES, widthMode(r)), '裂縫寬度選項不正確');
    assert(widthMode(r) === 'exact' || r.width === null, '裂縫區間不可冒用精確寬度');
    if (r.crackPattern !== undefined) assert(Object.hasOwn(CRACK_PATTERNS, r.crackPattern), '裂隙方向選項不正確');
    list(r.photos, '照片'); list(r.audioIds, '錄音');
    const refs = new Set();
    for (const photo of r.photos) {
      assert(media.has(photo.mediaId) && meta.get(photo.mediaId).kind === 'image', '照片原檔關聯遺失');
      assert(!refs.has(photo.mediaId), '同筆照片重複'); refs.add(photo.mediaId);
      assert(Object.hasOwn(ROLES, photo.role), '照片用途不正確'); text(photo.caption, '照片說明'); validateMarks(photo.marks);
      assert(typeof photo.excluded === 'boolean', '照片採用狀態不正確'); text(photo.excludedReason, '不採用原因', 500);
      assert(!photo.excluded || photo.excludedReason.trim(), '缺少照片不採用原因');
      if (photo.reportInclude !== undefined) assert(typeof photo.reportInclude === 'boolean', '附件選片狀態不正確');
      placement(photo.placement, r);
    }
    if (r.mainPhotoId) assert(r.photos.some(x => x.mediaId === r.mainPhotoId && photoIncluded(x)), '主照片必須納入附件且可採用');
    placement(r.observationPin, r);
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
  if (result.rooms) result.rooms = result.rooms.filter(x => x.unitId === unitId);
  const used = new Set([...result.records.flatMap(r => [...r.photos.map(x => x.mediaId), ...r.audioIds]), ...result.plans.map(x => x.mediaId)]);
  result.media = result.media.filter(m => used.has(m.id));
  return result;
}
export function restoredCopy(p) {
  const copy = clone(p), remap = new Map(copy.media.map(m => [m.id, id()]));
  copy.id = id(); copy.name = copy.name.slice(0, 200) + '（還原副本）'; copy.revision = 0; copy.createdAt = now(); copy.updatedAt = now();
  copy.media.forEach(m => { m.id = remap.get(m.id); });
  copy.plans.forEach(x => { x.mediaId = remap.get(x.mediaId); });
  copy.records.forEach(r => { r.photos.forEach(x => { x.mediaId = remap.get(x.mediaId); }); if (r.mainPhotoId) r.mainPhotoId = remap.get(r.mainPhotoId); r.audioIds = r.audioIds.map(x => remap.get(x)); });
  return { project: copy, remap };
}
