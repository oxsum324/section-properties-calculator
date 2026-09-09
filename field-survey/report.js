import { assert, clone, now, VERSION, observationText, photoPlacement, photoIncluded, roomKey, ROLES, recordIssues, sha256, validateProject } from './model.js';
import { markedImage, placementMarks } from './annotation.js';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const compactText = value => value.replace(/\s+/g, ' ').trim();
export function textChunks(value) {
  const chunks = []; let part = '', lines = 0;
  for (const char of value) { part += char; if (char === '\n') lines++; if (part.length >= 700 || lines >= 24) { chunks.push(part); part = ''; lines = 0; } }
  if (part) chunks.push(part); return chunks;
}
export function defaultPhotoIds(r) {
  const photos = r.photos.filter(p => !p.excluded), ids = new Set();
  for (const role of ['overview', 'close']) { const p = photos.find(x => x.role === role); if (p) ids.add(p.mediaId); }
  if (!ids.size && photos[0]) ids.add(photos[0].mediaId);
  if (r.mainPhotoId) ids.add(r.mainPhotoId);
  return ids;
}
export function reportPhotos(r) {
  const defaults = defaultPhotoIds(r);
  return r.photos.filter(p => photoIncluded(p) && (p.reportInclude === true || p.reportInclude === undefined && defaults.has(p.mediaId)));
}
export function attachmentIndex(project, { unitId = '', start = 1, perPage = 2 } = {}) {
  validateProject(project);
  assert(!unitId || project.units.some(u => u.id === unitId), '附件戶別不存在');
  assert(Number.isSafeInteger(start) && start > 0 && start <= 999999, '起始編號須為 1 至 999999 的整數');
  assert([1, 2].includes(perPage), '每頁照片數不正確');
  const groups = new Map();
  for (const r of project.records.filter(r => !unitId || r.unitId === unitId)) {
    const photos = reportPhotos(r); if (!photos.length) continue;
    const key = r.roomId || roomKey(r), unit = project.units.find(u => u.id === r.unitId);
    if (!groups.has(key)) groups.set(key, { roomId: key, unitId: unit.id, unit: unit.code, address: unit.address, floor: r.floor, room: r.space, records: [] });
    groups.get(key).records.push({ recordId: r.id, text: r.reportText?.trim() || observationText(r), notes: r.notes, issues: recordIssues(r), pin: clone(r.observationPin || null), photos: photos.map(photo => ({ ...clone(photo), placement: clone(photoPlacement(r, photo) || null), main: r.mainPhotoId ? r.mainPhotoId === photo.mediaId : photo.mediaId === (photos.find(p => p.role === 'close') || photos[0]).mediaId })) });
  }
  let number = start;
  for (const group of groups.values()) for (const record of group.records) for (const photo of record.photos) photo.number = String(number++).padStart(3, '0');
  assert(number > start, '尚未選擇附件照片');
  return { kind: 'condition-survey-attachment', version: 1, toolVersion: VERSION, createdAt: now(), projectId: project.id, sourceRevision: project.revision, code: project.code, name: project.name, date: project.date, start, perPage, groups: [...groups.values()] };
}
export function groupPlanEntries(group, planId) {
  const arrows = new Map(), pins = [];
  for (const r of group.records) {
    if (r.pin?.planId === planId) pins.push({ placement: r.pin, kind: 'observation', label: r.photos.map(p => p.number).join('、') });
    for (const photo of r.photos) if (photo.placement?.planId === planId) {
      const key = JSON.stringify(photo.placement);
      if (!arrows.has(key)) arrows.set(key, { placement: photo.placement, numbers: [] });
      arrows.get(key).numbers.push(photo.number);
    }
  }
  return [...pins, ...[...arrows.values()].map(x => ({ placement: x.placement, label: x.numbers.join('、') }))];
}
export function observationMarks(q, label = '') {
  const marks = placementMarks({ ...q, kind: 'observation' }, label);
  return marks;
}
const dataURL = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('附件影像讀取失敗')); reader.readAsDataURL(blob); });
export async function renderAttachment(project, getBlob, options = {}, progress = () => {}) {
  const index = attachmentIndex(project, options), e = escapeHTML, pages = [], includedAssets = new Map();
  let pageNumber = 0, imageCount = 0, outputBytes = 0;
  const total = index.groups.reduce((n, g) => n + g.records.reduce((m, r) => m + r.photos.length, 0), 0);
  const encodeImage = async (mediaId, marks) => {
    const meta = project.media.find(m => m.id === mediaId), blob = await getBlob(mediaId);
    assert(blob && await sha256(blob) === meta.sha256, '附件原始檔核對失敗：' + meta.name);
    includedAssets.set(mediaId, { id: mediaId, name: meta.name, sha256: meta.sha256 });
    const result = await markedImage(blob, marks);
    outputBytes += result.size; assert(outputBytes <= 160 * 1024 * 1024, '附件影像超過 160 MB，請改按戶匯出或減少選片');
    return dataURL(result);
  };
  const page = (group, body, type = '') => `<section class="sheet ${type}"><header><h1>現況照片紀錄附件</h1><div>${e(index.code)} · ${e(index.name)}</div><div>${e(group.unit)} · ${e(group.floor)} · ${e(group.room)}${group.address ? ' · ' + e(group.address) : ''}</div></header>${body}<footer>會勘日期：${e(index.date)}　｜　第 ${++pageNumber} 頁</footer></section>`;
  for (const group of index.groups) {
    const planIds = new Set(group.records.flatMap(r => [r.pin?.planId, ...r.photos.map(p => p.placement?.planId)]).filter(Boolean));
    const photoNumbers = group.records.flatMap(r => r.photos.map(p => p.number));
    for (const planId of planIds) {
      const plan = project.plans.find(p => p.id === planId), entries = groupPlanEntries(group, planId);
      const marks = entries.flatMap(x => x.kind === 'observation' ? observationMarks(x.placement, x.label) : placementMarks(x.placement, x.label));
      pages.push(page(group, `<h2>${e(plan.title)}</h2><img class="plan" src="${await encodeImage(plan.mediaId, marks)}" alt="位置圖"><p>大圓圈為狀況位置；箭頭起點為拍攝點、箭頭為拍攝方向。代號對應照片編號。簡圖未按比例。</p><p>本房間照片：${e(photoNumbers.join('、'))}</p>`, 'plan-sheet'));
    }
    for (const record of group.records) {
      const fullText = [record.text, record.notes].filter(Boolean).join('\n'), longText = fullText.length > 180 || fullText.split('\n').length > 4;
      const moreText = [];
      if (longText) moreText.push(`現況完整說明（照片 ${record.photos.map(p => p.number).join('、')}）：\n${fullText}`);
      for (let i = 0; i < record.photos.length; i += index.perPage) {
        const cards = [];
        for (const photo of record.photos.slice(i, i + index.perPage)) {
          const src = await encodeImage(photo.mediaId, photo.marks); progress(++imageCount, total);
          const longCaption = photo.caption.length > 100 || photo.caption.split('\n').length > 2;
          const caption = longCaption ? compactText(photo.caption).slice(0, 100) + '…（完整說明見續頁）' : photo.caption;
          if (longCaption) moreText.push(`照片 ${photo.number} 完整說明：\n${photo.caption}`);
          cards.push(`<figure><img src="${src}" alt="照片 ${photo.number}"><figcaption><strong>照片 ${photo.number} · ${e(ROLES[photo.role])}${photo.main ? ' · 主要照片' : ''}</strong><p>${e(caption)}</p>${!photo.placement && !record.pin ? '<p>本照片尚無圖上定位，請對照位置說明。</p>' : ''}</figcaption></figure>`);
        }
        pages.push(page(group, `<div class="description">${e(longText ? compactText(fullText).slice(0, 180) + '…（完整說明見續頁）' : fullText)}</div><div class="photos count-${index.perPage}">${cards.join('')}</div>`, 'photo-sheet'));
      }
      for (const text of moreText) for (const [i, chunk] of textChunks(text).entries()) pages.push(page(group, `<h2>補充說明${i ? '（續）' : ''}</h2><div class="description">${e(chunk)}</div>`, 'text-sheet'));
    }
  }
  index.assets = [...includedAssets.values()];
  index.plans = project.plans.filter(p => includedAssets.has(p.mediaId)).map(clone);
  const mapping = JSON.stringify(index, null, 2), digest = await sha256(new TextEncoder().encode(mapping));
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="condition-survey-private" content="attachment"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(index.code)} 現況照片附件</title><style>
  *{box-sizing:border-box}body{margin:0;background:#e7ebea;color:#172f2e;font:14px/1.5 sans-serif}.sheet{width:190mm;min-height:270mm;padding:8mm;margin:8mm auto;background:white;position:relative;break-after:page;overflow-wrap:anywhere}header{border-bottom:1px solid #9badab;padding-bottom:3mm;margin-bottom:4mm}h1{font-size:20px;margin:0 0 2mm}h2{font-size:17px}p{margin:2mm 0;white-space:pre-wrap}footer{margin-top:4mm;border-top:1px solid #9badab;padding-top:2mm;font-size:12px}.description{white-space:pre-wrap;margin-bottom:4mm}figure{margin:0 0 4mm;break-inside:avoid}figure img{width:100%;height:76mm;object-fit:contain;background:#f5f6f5}.count-1 img{height:152mm}figcaption{padding:2mm;border-bottom:1px solid #ddd}.plan{width:100%;height:170mm;object-fit:contain}.archive{max-width:190mm;margin:8mm auto;padding:8mm;background:white;overflow-wrap:anywhere}.archive pre{white-space:pre-wrap;font-size:11px}@page{size:A4;margin:10mm}@media print{body{background:white}.sheet{width:100%;min-height:0;margin:0;padding:0}.archive{display:none}}@media screen and (max-width:760px){.sheet{width:100%;min-height:0;margin:12px 0;padding:16px}figure img{height:auto;max-height:76mm}.count-1 img{max-height:152mm}.plan{height:auto;max-height:170mm}}
  </style></head><body>${pages.join('')}<section class="archive"><p>本檔保存此次選片、文字、圖面及流水編號。請核閱後以瀏覽器列印或另存 PDF，原始媒體另存於案件備份。</p><p>建立時間：${e(index.createdAt)} · 來源案件版次：${index.sourceRevision}<br>編號對照指紋：${digest}</p><details><summary>本次附件編號對照與來源</summary><pre>${e(mapping)}</pre></details></section></body></html>`;
  return { html, index, digest };
}
