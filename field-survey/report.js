import { assert, clone, now, VERSION, observationText, photoPlacement, photoIncluded, roomKey, ROLES, recordIssues, sha256, validateProject, recordComponents, recordConditions, CONDITIONS } from './model.js';
import { markedImage, placementMarks } from './annotation.js';

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
export function attachmentIndex(project, { unitId = '', start = 1, perPage = 2, format = 'standard' } = {}) {
  validateProject(project);
  assert(!unitId || project.units.some(u => u.id === unitId), '附件戶別不存在');
  assert(Number.isSafeInteger(start) && start > 0 && start <= 999999, '起始編號須為 1 至 999999 的整數');
  assert([1, 2].includes(perPage), '每頁照片數不正確');
  assert(Object.hasOwn(REPORT_FORMATS, format), '附件格式不正確');
  const groups = new Map();
  for (const r of project.records.filter(r => !unitId || r.unitId === unitId)) {
    const photos = reportPhotos(r); if (!photos.length) continue;
    const key = r.roomId || roomKey(r), unit = project.units.find(u => u.id === r.unitId);
    if (!groups.has(key)) groups.set(key, { roomId: key, unitId: unit.id, unit: unit.code, address: unit.address, floor: r.floor, room: r.space, records: [] });
    groups.get(key).records.push({ recordId: r.id, components: clone(recordComponents(r)), conditions: clone(recordConditions(r)), text: r.reportText?.trim() || observationText(r), notes: r.notes, issues: recordIssues(r), pin: clone(r.observationPin || null), photos: photos.map(photo => ({ ...clone(photo), placement: clone(photoPlacement(r, photo) || null), main: r.mainPhotoId ? r.mainPhotoId === photo.mediaId : photo.mediaId === (photos.find(p => p.role === 'close') || photos[0]).mediaId })) });
  }
  // One numbering source for both formats; keep each unit contiguous even when
  // field records from different units were interleaved during collection.
  const units = [...new Set([...groups.values()].map(g => g.unitId))];
  const ordered = units.flatMap(id => [...groups.values()].filter(g => g.unitId === id));
  let number = start;
  for (const group of ordered) for (const record of group.records) for (const photo of record.photos) photo.number = String(number++).padStart(3, '0');
  assert(number > start, '尚未選擇附件照片');
  return { kind: 'condition-survey-attachment', version: 2, format, toolVersion: VERSION, createdAt: now(), projectId: project.id, sourceRevision: project.revision, code: project.code, name: project.name, date: project.date, start, perPage, groups: ordered };
}
export function attachmentUnits(index, project) {
  const units = new Map();
  for (const group of index.groups) {
    if (!units.has(group.unitId)) units.set(group.unitId, { unitId: group.unitId, unit: group.unit, address: group.address, groups: [], records: [] });
    const unit = units.get(group.unitId); unit.groups.push(group); unit.records.push(...group.records);
  }
  return [...units.values()].map(unit => {
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
// The preview and print use the same paper dimensions. Measure actual font/table
// layout before freezing the HTML; long descriptions continue without truncation.
const STANDARD_STYLE = `
.standard-sheet,.standard-sheet *{box-sizing:border-box}
.standard-sheet.sheet{width:190mm;height:276mm;min-height:276mm;padding:0;margin:8mm auto;display:flex;flex-direction:column;background:#fff;color:#222;font:14px/1.5 Arial,"Microsoft JhengHei",sans-serif;overflow-wrap:anywhere;break-after:page}
.standard-sheet header{flex:none;border-bottom:1px solid #333;padding:0 0 3mm;margin:0 0 4mm}
.standard-sheet h1{font-size:20px;line-height:1.5;margin:0 0 2mm}.standard-sheet h2{font-size:17px;line-height:1.5;margin:0 0 3mm}
.standard-sheet p{margin:1mm 0;white-space:pre-wrap}.standard-sheet footer{flex:none;margin:3mm 0 0;border-top:1px solid #333;padding:2mm 0 0;font-size:12px}
.standard-sheet .sheet-content{flex:1;min-height:0}.standard-sheet .plan{display:block;width:100%;height:185mm;max-height:none;object-fit:contain}
.standard-sheet .legend,.standard-sheet .units-note{font-size:12px;line-height:1.5}
.standard-sheet table{width:100%;table-layout:fixed;border-collapse:collapse;font:13px/1.5 Arial,"Microsoft JhengHei",sans-serif}
.standard-sheet th,.standard-sheet td{border:1px solid #555;padding:2mm;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}
.standard-sheet th{font-weight:bold;background:#f1f3f2}.standard-sheet .photo-no{font-weight:bold;text-align:center}.standard-sheet .continued{font-weight:normal;font-size:11px;display:block}
.standard-sheet .row-text{white-space:pre-wrap}.standard-sheet figure{margin:0 0 4mm;border:1px solid #555;break-inside:avoid}
.standard-sheet figcaption{padding:2mm;border:0;border-bottom:1px solid #555;font-size:13px;line-height:1.5}
.standard-sheet figure img{display:block;width:100%;height:94mm;max-height:none;object-fit:contain;background:white}.standard-sheet .count-1 img{height:193mm;max-height:none}
@media print{.standard-sheet.sheet{margin:0}.standard-sheet.sheet:last-of-type{break-after:auto}}
`;

async function standardPages({ index, project, encodeImage, progress }) {
  const e = escapeHTML, pages = [], sections = [], total = index.groups.flatMap(g => g.records).reduce((n, r) => n + r.photos.length, 0);
  let imageCount = 0;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  document.body.append(host); const shadow = host.attachShadow({ mode: 'closed' });
  await document.fonts.ready;
  const sheet = (unit, body, type, number = pages.length + 1) => `<section class="sheet standard-sheet ${type}" data-unit="${e(unit.unitId)}"><header><h1>現況鑑定紀錄附件</h1><div>案號：${e(index.code)}　${e(index.name)}</div><div>戶別：${e(unit.unit)}${unit.address ? '　地址：' + e(unit.address) : ''}</div></header><div class="sheet-content">${body}</div><footer>會勘日期：${e(index.date)}　｜　第 ${number} 頁</footer></section>`;
  const fits = html => {
    shadow.innerHTML = `<style>${STANDARD_STYLE}</style>${html}`;
    const content = shadow.querySelector('.sheet-content');
    return content.clientHeight > 100 && content.scrollHeight <= content.clientHeight + 1;
  };
  const add = (unit, body, type, refs = {}) => {
    const html = sheet(unit, body, type);
    assert(fits(html), '附件頁面放不下，請縮短案名、地址或房間名稱後再匯出');
    pages.push(html); sections.push({ page: pages.length, type, unitId: unit.unitId, ...refs });
  };
  const tableBody = rows => `<h2>照片說明表</h2><table><colgroup><col style="width:11%"><col style="width:18%"><col style="width:21%"><col style="width:50%"></colgroup><thead><tr><th>照片編號</th><th>樓層、隔間</th><th>細部示意圖</th><th>照片內容</th></tr></thead><tbody>${rows.join('')}</tbody></table><p class="units-note">單位：裂縫寬度 mm；長度 m；面積 m²；磁磚塊數 塊；梁 U 型裂縫 條。</p>`;
  try {
    for (const unit of attachmentUnits(index, project)) {
      const planPages = new Map();
      for (const plan of unit.plans) {
        const entries = groupPlanEntries(unit, plan.id), marks = entries.flatMap(x => x.kind === 'observation' ? observationMarks(x.placement, x.label) : placementMarks(x.placement, x.label));
        const src = await encodeImage(plan.mediaId, marks);
        add(unit, `<h2>平面示意及照片位置圖 · ${e(plan.floor)} · ${e(plan.title)}</h2><img class="plan" src="${src}" alt="${e(plan.floor + ' ' + plan.title)}"><p class="legend">圓圈為狀況位置；箭頭起點為拍攝點，箭頭表示拍攝方向。圖上代號對應照片編號，簡圖未按比例。</p>`, 'plan-sheet', { planId: plan.id, entries: clone(entries) });
        planPages.set(plan.id, pages.length);
      }
      const photos = unit.groups.flatMap(group => group.records.flatMap(record => record.photos.map(photo => ({ group, record, photo }))));
      let rows = [], rowNumbers = [];
      const flush = () => { if (rows.length) { add(unit, tableBody(rows), 'table-sheet', { photoNumbers: [...rowNumbers] }); rows = []; rowNumbers = []; } };
      for (const { group, record, photo } of photos) {
        const refs = [...new Set([record.pin?.planId, photo.placement?.planId].filter(Boolean))].map(id => planPages.get(id));
        const detail = refs.length ? `詳平面示意圖\n第 ${refs.join('、')} 頁` : '尚未定位\n請核對位置說明';
        const full = [
          `部位：${record.components.join('、') || '未填'}　狀況：${record.conditions.map(c => CONDITIONS[c]).join('、') || '未分類'}`,
          `說明：${record.text}`, record.notes ? `補充：${record.notes}` : '',
          `${ROLES[photo.role]}${photo.main ? '（主要照片）' : ''}${photo.caption ? '：' + photo.caption : ''}`
        ].filter(Boolean).join('\n');
        let remaining = Array.from(full), continuation = false;
        const row = text => `<tr data-photo-number="${photo.number}"><td class="photo-no">${photo.number}${continuation ? '<span class="continued">（續）</span>' : ''}</td><td>${e([group.floor, group.room].filter(Boolean).join('\n') || '未填')}</td><td>${e(detail)}</td><td class="row-text">${e(text)}</td></tr>`;
        while (remaining.length) {
          const whole = row(remaining.join(''));
          if (fits(sheet(unit, tableBody([...rows, whole]), 'table-sheet'))) { rows.push(whole); rowNumbers.push(photo.number); break; }
          if (rows.length) { flush(); continue; }
          // A single very long photo description needs a continued table row.
          let lo = 0, hi = remaining.length;
          while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (fits(sheet(unit, tableBody([row(remaining.slice(0, mid).join(''))]), 'table-sheet'))) lo = mid; else hi = mid - 1; }
          assert(lo > 0, '照片說明表欄位過長，請縮短樓層或房間名稱');
          rows.push(row(remaining.slice(0, lo).join(''))); rowNumbers.push(photo.number); flush(); remaining = remaining.slice(lo); continuation = true;
        }
      }
      flush();
      for (let offset = 0; offset < photos.length; offset += index.perPage) {
        const batch = photos.slice(offset, offset + index.perPage), cards = [];
        for (const { photo } of batch) {
          const src = await encodeImage(photo.mediaId, photo.marks); progress(++imageCount, total);
          cards.push(`<figure data-photo-number="${photo.number}"><figcaption><strong>照片 ${photo.number}</strong>　${e(ROLES[photo.role])}　｜　說明：詳照片說明表</figcaption><img src="${src}" alt="照片 ${photo.number}"></figure>`);
        }
        add(unit, `<h2>現況照片</h2><div class="photos count-${index.perPage}">${cards.join('')}</div>`, 'photo-sheet', { photoNumbers: batch.map(x => x.photo.number) });
      }
    }
    index.sections = sections; return pages;
  } finally { host.remove(); }
}
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
  const page = (group, body, type = '') => `<section class="sheet ${type}"><header><h1>${e(REPORT_FORMATS[index.format])}</h1><div>${e(index.code)} · ${e(index.name)}</div><div>${e([group.unit, group.floor, group.room, group.address].filter(Boolean).join(' · '))}</div></header>${body}<footer>會勘日期：${e(index.date)}　｜　第 ${++pageNumber} 頁</footer></section>`;
  if (index.format === 'standard') pages.push(...await standardPages({ index, project, encodeImage, progress }));
  else for (const group of index.groups) {
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
  const usedPlanIds = new Set(index.groups.flatMap(g => g.records.flatMap(r => [r.pin?.planId, ...r.photos.map(p => p.placement?.planId)]).filter(Boolean)));
  index.plans = project.plans.filter(p => usedPlanIds.has(p.id)).map(clone);
  const mapping = JSON.stringify(index, null, 2), digest = await sha256(new TextEncoder().encode(mapping));
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="condition-survey-private" content="attachment"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(index.code)} ${e(REPORT_FORMATS[index.format])}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#e7ebea;color:#172f2e;font:14px/1.5 sans-serif}.sheet{width:190mm;min-height:270mm;padding:8mm;margin:8mm auto;background:white;position:relative;break-after:page;overflow-wrap:anywhere}header{border-bottom:1px solid #9badab;padding-bottom:3mm;margin-bottom:4mm}h1{font-size:20px;margin:0 0 2mm}h2{font-size:17px}p{margin:2mm 0;white-space:pre-wrap}footer{margin-top:4mm;border-top:1px solid #9badab;padding-top:2mm;font-size:12px}.description{white-space:pre-wrap;margin-bottom:4mm}figure{margin:0 0 4mm;break-inside:avoid}figure img{width:100%;height:76mm;object-fit:contain;background:#f5f6f5}.count-1 img{height:152mm}figcaption{padding:2mm;border-bottom:1px solid #ddd}.plan{width:100%;height:170mm;object-fit:contain}.archive{max-width:190mm;margin:8mm auto;padding:8mm;background:white;overflow-wrap:anywhere}.archive pre{white-space:pre-wrap;font-size:11px}@page{size:A4;margin:10mm}@media print{body{background:white}.sheet{width:100%;min-height:0;margin:0;padding:0}.archive{display:none}}@media screen and (max-width:760px){.sheet{width:100%;min-height:0;margin:12px 0;padding:16px}figure img{height:auto;max-height:76mm}.count-1 img{max-height:152mm}.plan{height:auto;max-height:170mm}}
  ${STANDARD_STYLE}</style></head><body>${pages.join('')}<section class="archive"><p>本檔保存此次選片、文字、圖面及流水編號。請核閱後以瀏覽器列印或另存 PDF，原始媒體另存於案件備份。</p><p>建立時間：${e(index.createdAt)} · 來源案件版次：${index.sourceRevision}<br>編號對照指紋：${digest}</p><details><summary>本次附件編號對照與來源</summary><pre>${e(mapping)}</pre></details></section></body></html>`;
  return { html, index, digest };
}
