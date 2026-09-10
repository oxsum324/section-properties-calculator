import { assert, clone, now, VERSION, observationText, photoPlacement, photoIncluded, roomKey, ROLES, recordIssues, sha256, validateProject, recordComponents, recordConditions, recordDateInfo } from './model.js';
import { markedImage, placementMarks, reportPlanImage } from './annotation.js';
import { detailImage } from './detail.js';
import { STANDARD_STYLE, standardPages, segmentKey, dateSummary, splitVolumes, contentsPages } from './report-standard.js';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const REPORT_FORMATS = { standard: '標準鑑定附件', quick: '現場快速預覽' };
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
export function moveRoom(project, roomId, direction, unitId = '') {
  const key = r => r.roomId || roomKey(r), allKeys = [...new Set(project.records.map(key))];
  const visible = [...new Set(project.records.filter(r => !unitId || r.unitId === unitId).map(key))];
  const from = visible.indexOf(roomId), to = from + direction;
  if (from < 0 || to < 0 || to >= visible.length) return;
  const a = allKeys.indexOf(visible[from]), b = allKeys.indexOf(visible[to]);
  [allKeys[a], allKeys[b]] = [allKeys[b], allKeys[a]];
  project.records.sort((x, y) => allKeys.indexOf(key(x)) - allKeys.indexOf(key(y)));
}
export function attachmentIndex(project, { unitId = '', unitIds, start = 1, perPage = 2, format = 'standard', numbering = 'unit', pageStart = 1, pagePrefix = '', plansPerPage = 1, tableRows = 0, includeEmpty = false, publicByFloor = false, toc = false } = {}) {
  validateProject(project);
  assert(!unitId || project.units.some(u => u.id === unitId), '附件戶別不存在');
  assert(Number.isSafeInteger(start) && start > 0 && start <= 999999, '起始編號須為 1 至 999999 的整數');
  assert([1, 2].includes(perPage), '每頁照片數不正確');
  assert(Object.hasOwn(REPORT_FORMATS, format), '附件格式不正確');
  assert(['unit', 'project'].includes(numbering), '照片編號範圍不正確');
  assert(Number.isSafeInteger(pageStart) && pageStart >= 1 && pageStart <= 999999 && typeof pagePrefix === 'string' && pagePrefix.length <= 20, '附件頁碼不正確');
  assert([1, 2, 3].includes(plansPerPage) && [0, 8].includes(tableRows), '圖表版面不正確');
  assert([includeEmpty, publicByFloor, toc].every(v => typeof v === 'boolean'), '附件選項不正確');
  assert(unitIds === undefined || Array.isArray(unitIds) && unitIds.length > 0 && new Set(unitIds).size === unitIds.length && unitIds.every(id => project.units.some(u => u.id === id)), '請選擇有效且不重複的戶別');
  const selectedUnits = unitId ? project.units.filter(u => u.id === unitId) : unitIds ? unitIds.map(id => project.units.find(u => u.id === id)) : project.units;
  const selectedIds = new Set(selectedUnits.map(u => u.id));
  const groups = new Map();
  for (const r of project.records.filter(r => selectedIds.has(r.unitId))) {
    const photos = reportPhotos(r); if (!photos.length) continue;
    const key = r.roomId || roomKey(r), unit = project.units.find(u => u.id === r.unitId);
    if (!groups.has(key)) groups.set(key, { roomId: key, unitId: unit.id, unit: unit.code, address: unit.address, floor: r.floor, room: r.space, records: [] });
    groups.get(key).records.push({ recordId: r.id, fieldNumber: r.fieldNumber, visitId: r.visitId || '', observedOn: r.observedOn || '', dateInfo: recordDateInfo(project, r), detail: clone(r.detail), components: clone(recordComponents(r)), conditions: clone(recordConditions(r)), text: r.reportText?.trim() || observationText(r), notes: r.notes, issues: recordIssues(r), pin: clone(r.observationPin || null), photos: photos.map(photo => ({ ...clone(photo), placement: clone(photoPlacement(r, photo) || null), main: r.mainPhotoId ? r.mainPhotoId === photo.mediaId : photo.mediaId === (photos.find(p => p.role === 'close') || photos[0]).mediaId })) });
  }
  // One numbering source for both formats; keep each unit contiguous even when
  // field records from different units were interleaved during collection.
  const units = selectedUnits.map(u => u.id);
  const floorRank = value => { const name = value.trim().toUpperCase(); let m; if ((m = name.match(/^B(\d+)(?:F)?$/))) return -Number(m[1]); if (name === 'MF') return 1.5; if ((m = name.match(/^R(\d*)F$/))) return 10000 + Number(m[1] || 1); if ((m = name.match(/^(\d+)(?:F|樓)?$/))) return Number(m[1]); return 5000; };
  const ordered = units.flatMap(id => {
    const found = [...groups.values()].filter(g => g.unitId === id);
    if (!publicByFloor || project.units.find(u => u.id === id)?.kind !== 'public') return found;
    const floors = [...new Set(found.map(g => g.floor))].sort((a, b) => floorRank(a) - floorRank(b) || a.localeCompare(b, 'zh-Hant', { numeric: true }));
    return floors.flatMap(floor => found.filter(g => g.floor === floor));
  });
  let number = start, previousUnit = '';
  for (const group of ordered) { if (numbering === 'unit' && group.unitId !== previousUnit) number = start; previousUnit = group.unitId; for (const record of group.records) for (const photo of record.photos) { assert(number <= 999999, '照片編號超過上限'); photo.number = String(number++).padStart(3, '0'); } }
  assert(ordered.length || format === 'standard' && includeEmpty && selectedUnits.length, '尚未選擇附件照片');
  const visitIds = new Set([...ordered.flatMap(g => g.records.map(r => r.visitId)), ...selectedUnits.flatMap(u => (u.visitHistory || []).map(h => h.visitId))]);
  return { kind: 'condition-survey-attachment', version: 3, format, toolVersion: VERSION, createdAt: now(), projectId: project.id, sourceRevision: project.revision, code: project.code, name: project.name, date: project.date, start, perPage, numbering, pageStart, pagePrefix, plansPerPage, tableRows, includeEmpty, publicByFloor, toc, visits: clone((project.visits || []).filter(v => visitIds.has(v.id))), units: clone(selectedUnits.filter(u => includeEmpty || ordered.some(g => g.unitId === u.id))), groups: ordered };
}
export function attachmentUnits(index, project) {
  const units = new Map();
  for (const u of index.units || []) if (!index.groups.some(g => g.unitId === u.id)) units.set(u.id, { ...clone(u), unitId: u.id, unit: u.code, segmentKey: u.id, groups: [], records: [] });
  for (const group of index.groups) {
    const key = segmentKey(group.unitId, group.floor, index), source = project.units.find(u => u.id === group.unitId);
    if (!units.has(key)) units.set(key, { ...clone(source), unitId: group.unitId, unit: group.unit, address: group.address, segmentKey: key, segmentFloor: key !== group.unitId ? group.floor : '', groups: [], records: [] });
    const unit = units.get(key); unit.groups.push(group); unit.records.push(...group.records);
  }
  return [...units.values()].sort((a, b) => (index.units || project.units).findIndex(u => u.id === a.unitId) - (index.units || project.units).findIndex(u => u.id === b.unitId)).map(unit => {
    const referenced = new Set(unit.records.flatMap(r => [r.pin?.planId, ...r.photos.map(p => p.placement?.planId)]).filter(Boolean));
    // Keep distinct indoor/outdoor plans separate, in the saved plan order.
    return { ...unit, plans: project.plans.filter(p => p.unitId === unit.unitId && referenced.has(p.id)) };
  });
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
  const index = options.plannedIndex ? clone(options.plannedIndex) : attachmentIndex(project, options), e = escapeHTML, pages = [], includedAssets = new Map();
  assert(index.projectId === project.id && index.sourceRevision === project.revision, '案件已修改，請重新規劃分冊');
  const placeholder = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
  let pageNumber = 0, imageCount = 0, outputBytes = 0;
  const total = index.groups.reduce((n, g) => n + g.records.reduce((m, r) => m + r.photos.length, 0), 0);
  const encodeImage = async (mediaId, marks, planEntries) => {
    if (options.layoutOnly) return placeholder;
    const meta = project.media.find(m => m.id === mediaId), blob = await getBlob(mediaId);
    assert(blob && await sha256(blob) === meta.sha256, '附件原始檔核對失敗：' + meta.name);
    includedAssets.set(mediaId, { id: mediaId, name: meta.name, sha256: meta.sha256 });
    const result = planEntries ? await reportPlanImage(blob, planEntries) : await markedImage(blob, marks);
    outputBytes += result.size; assert(outputBytes <= 160 * 1024 * 1024, '附件影像超過 160 MB，請改按戶匯出或減少選片');
    return dataURL(result);
  };
  const encodeDetail = async detail => {
    if (options.layoutOnly) return placeholder;
    const get = async id => { const meta = project.media.find(m => m.id === id), blob = await getBlob(id); assert(meta && blob && await sha256(blob) === meta.sha256, '細部底圖原檔核對失敗'); includedAssets.set(id, { id, name: meta.name, sha256: meta.sha256 }); return blob; };
    const blob = await detailImage(detail, get); outputBytes += blob.size; assert(outputBytes <= 160 * 1024 * 1024, '附件影像超過 160 MB，請縮小每冊頁數或按戶匯出'); return dataURL(blob);
  };
  const page = (group, body, type = '') => `<section class="sheet ${type}"><header><h1>${e(REPORT_FORMATS[index.format])}</h1><div>${e(index.code)} · ${e(index.name)}</div><div>${e([group.unit, group.floor, group.room, group.address].filter(Boolean).join(' · '))}</div></header>${body}<footer>會勘日期：${e(dateSummary(group.records, '尚未確認'))}　｜　第 ${e((index.pagePrefix || '') + ((index.pageStart || 1) + pageNumber++))} 頁</footer></section>`;
  if (index.format === 'standard') pages.push(...await standardPages({ index, project, encodeImage, encodeDetail, progress, e, attachmentUnits, groupPlanEntries, observationMarks, placementMarks }));
  else for (const group of index.groups) {
    const planIds = new Set(group.records.flatMap(r => [r.pin?.planId, ...r.photos.map(p => p.placement?.planId)]).filter(Boolean));
    const photoNumbers = group.records.flatMap(r => r.photos.map(p => p.number));
    for (const planId of planIds) {
      const plan = project.plans.find(p => p.id === planId), entries = groupPlanEntries(group, planId);
      const marks = entries.flatMap(x => x.kind === 'observation' ? observationMarks(x.placement, x.label) : placementMarks(x.placement, x.label));
      pages.push(page(group, `<h2>${e(plan.title)}</h2><img class="plan" src="${await encodeImage(plan.mediaId, marks, entries)}" alt="位置圖"><p>大圓圈為狀況位置；箭頭起點為拍攝點、箭頭為拍攝方向。代號對應照片編號。簡圖未按比例。</p><p>本房間照片：${e(photoNumbers.join('、'))}</p>`, 'plan-sheet'));
    }
    for (const record of group.records) {
      const fullText = [record.text, record.notes, `日期：${record.dateInfo.label}`].filter(Boolean).join('\n'), longText = fullText.length > 180 || fullText.split('\n').length > 4;
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
  const usedPlanIds = new Set(index.groups.flatMap(g => g.records.flatMap(r => [r.pin?.planId, ...r.photos.map(p => p.placement?.planId)]).filter(Boolean)));
  index.plans = project.plans.filter(p => usedPlanIds.has(p.id)).map(clone);
  const mapping = JSON.stringify(index, null, 2), digest = await sha256(new TextEncoder().encode(mapping));
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="condition-survey-private" content="attachment"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(index.code)} ${e(REPORT_FORMATS[index.format])}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#e7ebea;color:#172f2e;font:14px/1.5 sans-serif}.sheet{width:190mm;min-height:270mm;padding:8mm;margin:8mm auto;background:white;position:relative;break-after:page;overflow-wrap:anywhere}header{border-bottom:1px solid #9badab;padding-bottom:3mm;margin-bottom:4mm}h1{font-size:20px;margin:0 0 2mm}h2{font-size:17px}p{margin:2mm 0;white-space:pre-wrap}footer{margin-top:4mm;border-top:1px solid #9badab;padding-top:2mm;font-size:12px}.description{white-space:pre-wrap;margin-bottom:4mm}figure{margin:0 0 4mm;break-inside:avoid}figure img{width:100%;height:76mm;object-fit:contain;background:#f5f6f5}.count-1 img{height:152mm}figcaption{padding:2mm;border-bottom:1px solid #ddd}.plan{width:100%;height:170mm;object-fit:contain}.archive{max-width:190mm;margin:8mm auto;padding:8mm;background:white;overflow-wrap:anywhere}.archive pre{white-space:pre-wrap;font-size:11px}@page{size:A4;margin:10mm}@media print{body{background:white}.sheet{width:100%;min-height:0;margin:0;padding:0}.archive{display:none}}@media screen and (max-width:760px){.sheet{width:100%;min-height:0;margin:12px 0;padding:16px}figure img{height:auto;max-height:76mm}.count-1 img{max-height:152mm}.plan{height:auto;max-height:170mm}}
  ${STANDARD_STYLE}</style></head><body>${pages.join('')}<section class="archive"><p>本檔保存此次選片、文字、圖面及流水編號。請核閱後以瀏覽器列印或另存 PDF，原始媒體另存於案件備份。</p><p>建立時間：${e(index.createdAt)} · 來源案件版次：${index.sourceRevision}<br>編號對照指紋：${digest}</p><details><summary>本次附件編號對照與來源</summary><pre>${e(mapping)}</pre></details></section></body></html>`;
  return { html, index, digest };
}

export async function prepareVolumes(project, options = {}) {
  assert((options.format || 'standard') === 'standard', '快速預覽請直接匯出；分冊適用標準附件');
  const layout = await renderAttachment(project, () => { throw new Error('排版不應讀取原圖'); }, { ...options, toc: false, layoutOnly: true });
  const volumes = splitVolumes(layout.index, project, options.maxPages ?? 200, options.breakBefore || []);
  return { index: layout.index, volumes, entries: volumes.flatMap(v => v.entries), toc: options.toc !== false };
}
export async function renderPlannedVolume(project, getBlob, plan, number, progress) {
  const volume = plan.volumes.find(v => v.number === number); assert(volume, '找不到冊次');
  assert(project.id === plan.index.projectId && project.revision === plan.index.sourceRevision, '案件已修改，請重新規劃分冊');
  const index = clone(plan.index); index.units = index.units.filter(u => volume.unitIds.includes(u.id));
  index.groups = index.groups.filter(g => volume.segmentKeys.includes(segmentKey(g.unitId, g.floor, index)));
  index.segmentKeys = volume.segmentKeys; index.pageStart = volume.start; index.volume = number; index.volumeCount = plan.volumes.length; index.toc = plan.toc;
  delete index.sections; delete index.assets; delete index.plans; delete index.contents;
  const result = await renderAttachment(project, getBlob, { plannedIndex: index }, progress);
  assert(result.index.sections.length === volume.pageCount && result.index.sections[0]?.page === volume.start, '實際排版與分冊計畫不同，請重新規劃');
  return result;
}
export async function masterContentsHTML(plan) {
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-100000px;visibility:hidden'; document.body.append(host); const shadow = host.attachShadow({ mode: 'closed' });
  try {
    await document.fonts.ready;
    const fits = html => { shadow.innerHTML = `<style>${STANDARD_STYLE}</style>${html}`; const el = shadow.querySelector('.sheet-content'); return el.clientHeight > 100 && el.scrollHeight <= el.clientHeight + 1; };
    const pages = contentsPages(plan.index, plan.entries, escapeHTML, '全案分冊目錄', fits);
    return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="condition-survey-private" content="attachment"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHTML(plan.index.code)} 分冊總目錄</title><style>body{margin:0;background:#e7ebea}@page{size:A4;margin:10mm}${STANDARD_STYLE}</style></head><body>${pages.join('')}</body></html>`;
  } finally { host.remove(); }
}
