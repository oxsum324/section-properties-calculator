import { clone, DETAIL_TEXTS, UNIT_STATES, assert, attachmentDescription } from './model.js';

export const STANDARD_STYLE = `
.standard-sheet,.standard-sheet *{box-sizing:border-box}
.standard-sheet.sheet{width:190mm;height:276mm;min-height:276mm;padding:0;margin:8mm auto;display:flex;flex-direction:column;background:#fff;color:#222;font:14px/1.5 Arial,"Microsoft JhengHei",sans-serif;overflow-wrap:anywhere;break-after:page}
.standard-sheet header{flex:none;border-bottom:1px solid #333;padding:0 0 3mm;margin:0 0 4mm}
.standard-sheet h1{font-size:20px;line-height:1.5;margin:0 0 2mm}.standard-sheet h2{font-size:17px;line-height:1.5;margin:0 0 3mm}
.standard-sheet p{margin:1mm 0;white-space:pre-wrap}.standard-sheet footer{flex:none;margin:3mm 0 0;border-top:1px solid #333;padding:2mm 0 0;font-size:12px}
.standard-sheet .sheet-content{flex:1;min-height:0}.standard-sheet .plan{display:block;width:100%;height:185mm;max-height:none;object-fit:contain}
.standard-sheet .plan-tiles{display:grid;gap:3mm;height:205mm}.standard-sheet .plan-tile{display:flex;flex-direction:column;min-height:0}.standard-sheet .plan-tile h3{font-size:13px;margin:0}.standard-sheet .plan-tile .plan{flex:1;min-height:0;height:0}
.standard-sheet .legend,.standard-sheet .units-note{font-size:11px;line-height:1.5}
.standard-sheet table{width:100%;table-layout:fixed;border-collapse:collapse;font:12px/1.45 Arial,"Microsoft JhengHei",sans-serif}
.standard-sheet th,.standard-sheet td{border:1px solid #555;padding:1.5mm;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}
.standard-sheet th{font-weight:bold;background:#f1f3f2}.standard-sheet .photo-no{font-weight:bold;text-align:center}.standard-sheet .continued{font-weight:normal;font-size:11px;display:block}
.standard-sheet .row-text{white-space:pre-wrap}.standard-sheet .detail-cell{padding:.8mm;vertical-align:middle}.standard-sheet .detail-fit{position:relative;overflow:hidden;max-width:100%;margin:auto}.standard-sheet .detail-fit .detail-img{position:absolute;display:block;max-width:none;max-height:none;object-fit:fill}.standard-sheet figure{margin:0 0 4mm;border:1px solid #555;break-inside:avoid}
.standard-sheet figcaption{padding:2mm;border:0;border-bottom:1px solid #555;font-size:13px;line-height:1.5}
.standard-sheet figure img{display:block;width:100%;height:94mm;max-height:none;object-fit:contain;background:white}.standard-sheet .count-1 img{height:193mm;max-height:none}.standard-sheet .toc-table td{padding:2mm}.standard-sheet .toc-table a{color:inherit;text-decoration:none}
@media print{.standard-sheet.sheet{margin:0}.standard-sheet.sheet:last-of-type{break-after:auto}}
`;

export const segmentKey = (unitId, floor, index) => index.publicByFloor && index.units?.find(u => u.id === unitId)?.kind === 'public' && floor ? `${unitId}/${floor}` : unitId;
export function dateSummary(records, fallback) {
  records = records.filter(r => r.dateInfo?.confirmed);
  const labels = [...new Set(records.map(r => r.dateInfo?.label).filter(Boolean))];
  if (!labels.length) return fallback;
  if (labels.length <= 2 && labels.join('、').length <= 65) return labels.join('、');
  const starts = records.map(r => r.dateInfo?.start).filter(Boolean).sort(), ends = records.map(r => r.dateInfo?.end).filter(Boolean).sort();
  return `${starts[0]}～${ends.at(-1)}（各筆詳紀錄）`;
}

// Frame the complete rendered drawing, including text and marks. Only pure white
// outer pixels are excluded; the embedded image and editable coordinates stay intact.
export async function fittedDetailHTML(src) {
  const image = new Image(); image.src = src; await image.decode();
  const width = image.naturalWidth, height = image.naturalHeight;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0, offset = y * width * 4; x < width; x++, offset += 4) {
    if (pixels[offset + 3] && (pixels[offset] < 255 || pixels[offset + 1] < 255 || pixels[offset + 2] < 255)) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  canvas.width = canvas.height = 0;
  if (right < 0) { left = top = 0; right = width - 1; bottom = height - 1; }
  const pad = Math.max(8, Math.ceil(Math.min(right - left + 1, bottom - top + 1) * .025));
  const x = Math.max(0, left - pad), y = Math.max(0, top - pad), w = Math.min(width, right + pad + 1) - x, h = Math.min(height, bottom + pad + 1) - y;
  return `<div class="detail-fit" data-detail-frame="${[x, y, w, h].join(',')}" style="width:${36 * w / h}mm;aspect-ratio:${w}/${h}"><img class="detail-img" src="${src}" alt="細部示意圖" style="width:${100 * width / w}%;height:${100 * height / h}%;left:${-100 * x / w}%;top:${-100 * y / h}%"></div>`;
}

export async function standardPages({ index, project, encodeImage, encodeDetail, progress, e, attachmentUnits, groupPlanEntries, observationMarks, placementMarks }) {
  const pages = [], sections = [], total = index.groups.flatMap(g => g.records).reduce((n, r) => n + r.photos.length, 0); let imageCount = 0;
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none'; document.body.append(host); const shadow = host.attachShadow({ mode: 'closed' });
  await document.fonts.ready;
  const label = number => `${index.pagePrefix || ''}${number}`;
  const numberNow = () => (index.pageStart || 1) + pages.length;
  const sheet = (unit, body, type, number = numberNow()) => `<section class="sheet standard-sheet ${type}" data-unit="${e(unit.unitId)}" id="page-${number}"><header><h1>現況鑑定紀錄附件</h1><div>案號：${e(index.code)}　${e(index.name)}</div><div>戶別：${e(unit.unit)}${attachmentDescription(unit.segmentFloor) ? ' · ' + e(attachmentDescription(unit.segmentFloor)) : ''}${unit.address ? '　地址：' + e(unit.address) : ''}</div></header><div class="sheet-content">${body}</div><footer>${type === 'table-sheet' || !dateSummary(unit.records, '') ? '' : `會勘日期：${e(dateSummary(unit.records, ''))}　｜　`}第 ${e(label(number))} 頁</footer></section>`;
  const fits = html => { shadow.innerHTML = `<style>${STANDARD_STYLE}</style>${html}`; const content = shadow.querySelector('.sheet-content'); return content.clientHeight > 100 && content.scrollHeight <= content.clientHeight + 1; };
  const add = (unit, body, type, refs = {}) => { const number = numberNow(), html = sheet(unit, body, type, number); assert(fits(html), '附件頁面放不下，請縮短案名、地址或房間名稱後再匯出'); pages.push(html); sections.push({ page: number, label: label(number), type, unitId: unit.unitId, segmentKey: unit.segmentKey, ...refs }); };
  const tableBody = rows => `<h2>照片說明表</h2><table><colgroup><col style="width:10%"><col style="width:17%"><col style="width:25%"><col style="width:48%"></colgroup><thead><tr><th>照片編號</th><th>樓層、隔間</th><th>細部示意圖</th><th>照片內容</th></tr></thead><tbody>${rows.join('')}</tbody></table><p class="units-note">單位：裂縫寬度 mm；長度 m；面積 m²。細部示意圖未按照比例。</p>`;
  try {
    for (const unit of attachmentUnits(index, project)) {
      if (index.segmentKeys && !index.segmentKeys.includes(unit.segmentKey)) continue;
      const planPages = new Map();
      for (let offset = 0; offset < unit.plans.length; offset += index.plansPerPage || 1) {
        const batch = unit.plans.slice(offset, offset + (index.plansPerPage || 1)), tiles = [], allEntries = [];
        for (const plan of batch) {
          const entries = groupPlanEntries(unit, plan.id), marks = entries.flatMap(x => x.kind === 'observation' ? observationMarks(x.placement, x.label) : placementMarks(x.placement, x.label));
          const src = await encodeImage(plan.mediaId, marks, entries); allEntries.push(...entries); planPages.set(plan.id, numberNow());
          tiles.push(`<div class="plan-tile"><h3>${e(plan.floor)} · ${e(plan.title)}</h3><img class="plan" src="${src}" alt="${e(plan.floor + ' ' + plan.title)}"></div>`);
        }
        add(unit, `<h2>平面示意及照片位置圖</h2><div class="plan-tiles" style="grid-template-rows:repeat(${batch.length},minmax(0,1fr))">${tiles.join('')}</div><p class="legend">小圓圈＝拍攝點；大圓圈＝狀況位置；箭頭＝拍攝方向；虛線＝照片代號引線。簡圖未按比例。</p>`, 'plan-sheet', { planId: batch[0].id, planIds: batch.map(p => p.id), entries: clone(allEntries) });
      }
      const photos = unit.groups.flatMap(group => group.records.flatMap(record => record.photos.map(photo => ({ group, record, photo }))));
      if (!photos.length) { add(unit, `<h2>本次進場紀錄</h2><p>狀態：${e(UNIT_STATES[unit.status] || '待完成')}</p><p>${e(unit.reason || '本單元尚無納入附件的照片。')}</p>${(unit.visitHistory || []).map(h => { const v = project.visits?.find(v => v.id === h.visitId); return `<p>${e(v?.name || '')} · ${e(h.date || '')} · ${e(UNIT_STATES[h.status])}\n${e(h.scope)}\n${e(h.reason)}</p>`; }).join('')}`, 'status-sheet'); continue; }
      let rows = [], rowNumbers = [];
      const flush = (last = false) => {
        if (!rows.length) return;
        if (last && index.tableRows && rows.length < index.tableRows) {
          const blank = '<tr class="blank-row"><td></td><td colspan="3">以下空白</td></tr>';
          if (fits(sheet(unit, tableBody([...rows, blank]), 'table-sheet'))) rows.push(blank);
        }
        add(unit, tableBody(rows), 'table-sheet', { photoNumbers: [...rowNumbers] }); rows = []; rowNumbers = [];
      };
      const detailCache = new Map();
      for (const { group, record, photo } of photos) {
        const refs = [...new Set([record.pin?.planId, photo.placement?.planId].filter(Boolean))].map(id => planPages.get(id)).filter(n => n !== undefined);
        const reference = refs.length ? `詳平面示意圖\n第 ${refs.map(label).join('、')} 頁` : '';
        let detailHTML = e(reference);
        if (record.detail?.kind === 'text' && record.detail.value !== 'plan') detailHTML = e(DETAIL_TEXTS[record.detail.value]);
        else if (record.detail && record.detail.kind !== 'text') {
          if (!detailCache.has(record.recordId)) detailCache.set(record.recordId, await fittedDetailHTML(await encodeDetail(record.detail)));
          detailHTML = detailCache.get(record.recordId);
        }
        const full = [record.contentText, photo.contentCaption].filter(Boolean).join('\n');
        let remaining = Array.from(full), continuation = false;
        const row = text => `<tr data-photo-number="${photo.number}"><td class="photo-no">${photo.number}${continuation ? '<span class="continued">（續）</span>' : ''}</td><td>${e([group.floor, group.room].map(attachmentDescription).filter(Boolean).join('\n'))}</td><td class="detail-cell">${detailHTML}</td><td class="row-text">${e(text)}</td></tr>`;
        // Empty descriptions still need a row, including after a page break.
        while (remaining.length || !continuation) {
          if (index.tableRows && rows.length >= index.tableRows) flush();
          if (fits(sheet(unit, tableBody([...rows, row(remaining.join(''))]), 'table-sheet'))) { rows.push(row(remaining.join(''))); rowNumbers.push(photo.number); break; }
          if (rows.length) { flush(); continue; }
          let lo = 0, hi = remaining.length; while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (fits(sheet(unit, tableBody([row(remaining.slice(0, mid).join(''))]), 'table-sheet'))) lo = mid; else hi = mid - 1; }
          assert(lo > 0, '照片說明表欄位過長，請縮短樓層或房間名稱'); rows.push(row(remaining.slice(0, lo).join(''))); rowNumbers.push(photo.number); flush(); remaining = remaining.slice(lo); continuation = true;
        }
      }
      flush(true);
      for (let offset = 0; offset < photos.length; offset += index.perPage) {
        const batch = photos.slice(offset, offset + index.perPage), cards = [];
        for (const { photo } of batch) { const src = await encodeImage(photo.mediaId, photo.marks); progress(++imageCount, total); cards.push(`<figure data-photo-number="${photo.number}"><figcaption><strong>照片 ${photo.number}</strong>　｜　說明：詳照片說明表</figcaption><img src="${src}" alt="照片 ${photo.number}"></figure>`); }
        add(unit, `<h2>現況照片</h2><div class="photos count-${index.perPage}">${cards.join('')}</div>`, 'photo-sheet', { photoNumbers: batch.map(x => x.photo.number) });
      }
    }
    index.sections = sections;
    if (index.toc) {
      index.contents = contentEntries(index, project);
      const toc = contentsPages(index, index.contents, e, '本冊目錄', fits); index.contentsPageCount = toc.length; pages.unshift(...toc);
    }
    return pages;
  } finally { host.remove(); }
}

export function contentEntries(index, project) {
  const entries = new Map();
  for (const s of index.sections || []) {
    if (!entries.has(s.segmentKey)) { const u = project.units.find(u => u.id === s.unitId); entries.set(s.segmentKey, { unitId: u.id, segmentKey: s.segmentKey, unit: u.code, address: u.address, status: u.status, start: s.page, end: s.page, label: s.label, floor: s.segmentKey === u.id ? '' : s.segmentKey.slice(u.id.length + 1) }); }
    entries.get(s.segmentKey).end = s.page;
  }
  return [...entries.values()];
}
export function contentsPages(index, entries, e, title = '全案分冊目錄', fits = null) {
  const pages = []; let rows = [];
  const page = rows => `<section class="sheet standard-sheet toc-sheet"><header><h1>${e(title)}</h1><div>案號：${e(index.code)}　${e(index.name)}</div></header><div class="sheet-content"><table class="toc-table"><colgroup><col style="width:23%"><col style="width:45%"><col style="width:12%"><col style="width:20%"></colgroup><thead><tr><th>戶別／範圍</th><th>地址</th><th>冊次</th><th>附件頁次</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><footer>目錄 ${pages.length + 1}　｜　${e(index.createdAt.slice(0, 10))}</footer></section>`;
  for (const entry of entries) {
    const row = `<tr><td>${e(entry.unit)}${attachmentDescription(entry.floor) ? '\n' + e(attachmentDescription(entry.floor)) : ''}</td><td>${e(entry.address)}</td><td>${entry.volume || index.volume || 1}</td><td>${e((index.pagePrefix || '') + entry.start)}${entry.end !== entry.start ? '～' + e((index.pagePrefix || '') + entry.end) : ''}</td></tr>`;
    if (rows.length && (rows.length >= 20 || fits && !fits(page([...rows, row])))) { pages.push(page(rows)); rows = []; }
    assert(!fits || fits(page([row])), '目錄單筆內容過長，請縮短戶別或地址'); rows.push(row);
  }
  if (rows.length) pages.push(page(rows)); return pages;
}

export function splitVolumes(index, project, maxPages = 200, breakBefore = []) {
  assert(Number.isSafeInteger(maxPages) && maxPages >= 1 && maxPages <= 2000, '每冊正文頁數須為 1 至 2000');
  const entries = contentEntries(index, project), volumes = []; let current;
  for (const entry of entries) {
    const count = entry.end - entry.start + 1;
    if (!current || current.pageCount + count > maxPages || breakBefore.includes(entry.unitId) && current.unitIds.at(-1) !== entry.unitId) { current = { number: volumes.length + 1, start: entry.start, pageCount: 0, segmentKeys: [], unitIds: [], entries: [] }; volumes.push(current); }
    current.segmentKeys.push(entry.segmentKey); if (!current.unitIds.includes(entry.unitId)) current.unitIds.push(entry.unitId); current.pageCount += count; current.entries.push({ ...entry, volume: current.number }); current.overLimit = current.pageCount > maxPages;
  }
  return volumes;
}
