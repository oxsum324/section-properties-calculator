import { clone, recordIssues, observationText, roomKey, photoIncluded, ROLES, assert, syncRooms } from './model.js';
import { attachmentIndex, defaultPhotoIds, reportPhotos, renderAttachment, moveRoom, REPORT_FORMATS, escapeHTML as e } from './report.js';

export function createReportController(api) {
  const { $, action, commit, getProject, getMedia, mediaURL, openModal, download, busyText, editPhoto, editRecord } = api;
  const settings = { unitId: '', start: 1, perPage: 2, format: 'standard' };
  async function render() {
    const p = getProject(); if (!p) return;
    if (settings.unitId && !p.units.some(u => u.id === settings.unitId)) settings.unitId = '';
    $('#reportScope').innerHTML = '<option value="">全案</option>' + p.units.map(u => `<option value="${u.id}">${e(u.code)}</option>`).join('');
    $('#reportScope').value = settings.unitId;
    $('#reportFormat').value = settings.format;
    $('#reportFormatHelp').textContent = settings.format === 'standard' ? '每戶依序：各樓整體平面圖 → 照片說明表 → 照片。同一圖面集中標示跨房間的照片編號。' : '依房間依序顯示位置圖、現況說明與照片，方便現場核對。';
    const groups = new Map();
    for (const r of p.records.filter(r => !settings.unitId || r.unitId === settings.unitId)) {
      const key = r.roomId || roomKey(r); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r);
    }
    let selected = 0;
    $('#reportRooms').innerHTML = [...groups.entries()].map(([key, records], gi) => {
      const first = records[0], unit = p.units.find(u => u.id === first.unitId);
      return `<section class="panel report-room"><div class="section-heading"><h3>${e(unit.code)} · ${e(first.floor || '未填樓層')} · ${e(first.space || '未填房間')}</h3></div><div class="choice-chips"><button data-room="${e(key)}" data-do="room-up" ${gi === 0 ? 'disabled' : ''}>房間上移</button><button data-room="${e(key)}" data-do="room-down" ${gi === groups.size - 1 ? 'disabled' : ''}>房間下移</button>${first.roomId ? `<button data-room="${e(first.roomId)}" data-do="rename-room">統一房間名稱</button>` : ''}</div>${records.map((r, ri) => {
        const photos = reportPhotos(r), selectedIds = new Set(photos.map(p => p.mediaId)); selected += photos.length;
        const main = r.mainPhotoId || (photos.find(p => p.role === 'close') || photos[0])?.mediaId;
        return `<article class="report-record" data-report-record="${r.id}"><h4>${e(r.location || '位置說明未填')} · ${photos.length} 張納入附件</h4><div class="choice-chips"><button data-do="record-up" ${ri === 0 ? 'disabled' : ''}>位置上移</button><button data-do="record-down" ${ri === records.length - 1 ? 'disabled' : ''}>位置下移</button><button data-do="edit-record">回到現場紀錄</button><button data-do="preset">選全景＋近照</button><button data-do="main-only">只選主照片</button></div><p class="micro">${e(recordIssues(r).length ? '待核對：' + recordIssues(r).join('、') : '本筆必要紀錄已齊')}</p><label>附件現況說明<textarea data-report-text rows="3" maxlength="10000">${e(r.reportText?.trim() || observationText(r))}</textarea></label><div class="choice-chips"><button data-do="save-text">保存說明</button><button data-do="generate-text">產生新版說明預覽</button></div><p class="micro">現場補充說明另行保留並帶入附件。修改過的附件文字不會被快填欄位自動覆蓋。</p><div class="report-photos">${r.photos.map((photo, pi) => `<div class="report-photo" data-report-photo="${photo.mediaId}"><img data-report-image="${photo.mediaId}" alt="${e(photo.caption || ROLES[photo.role])}"><div><label class="check-label"><input type="checkbox" data-report-include ${selectedIds.has(photo.mediaId) ? 'checked' : ''} ${photo.excluded ? 'disabled' : ''}>${photo.excluded ? '不採用（原檔保留）' : '納入本次附件'}</label><p>${e(ROLES[photo.role])}${main === photo.mediaId ? ' · ★ 主照片' : ''}</p><p>${e(photo.caption)}</p><div class="choice-chips"><button data-do="main" ${photo.excluded ? 'disabled' : ''}>設主照片</button><button data-do="photo-up" ${pi === 0 ? 'disabled' : ''}>前移</button><button data-do="photo-down" ${pi === r.photos.length - 1 ? 'disabled' : ''}>後移</button><button data-do="edit-photo">圈註／拍攝位置</button></div></div></div>`).join('') || '<p>尚無照片</p>'}</div></article>`;
      }).join('')}</section>`;
    }).join('') || '<p>目前範圍尚無紀錄。</p>';
    $('#reportSummary').textContent = `${groups.size} 個房間／空間 · ${selected} 張已選照片。未選照片保留在案件備份。`;
    $('#previewReport').disabled = selected === 0;
    for (const img of $('#reportRooms').querySelectorAll('[data-report-image]')) { img.src = await mediaURL(img.dataset.reportImage); }
  }
  async function mutate(fn) { await commit(p => { fn(p); syncRooms(p); }); await render(); }
  $('#reportScope').onchange = () => action(async () => { settings.unitId = $('#reportScope').value; await render(); });
  $('#reportFormat').onchange = () => action(async () => { settings.format = $('#reportFormat').value; await render(); });
  $('#reportRooms').onchange = event => {
    const input = event.target.closest('[data-report-include]'); if (!input) return;
    const recordId = input.closest('[data-report-record]').dataset.reportRecord, mediaId = input.closest('[data-report-photo]').dataset.reportPhoto, checked = input.checked;
    action(() => mutate(p => { const r = p.records.find(r => r.id === recordId), photo = r.photos.find(x => x.mediaId === mediaId); photo.reportInclude = checked; if (!checked && r.mainPhotoId === mediaId) delete r.mainPhotoId; }));
  };
  // Preserve edits before any rerender (selection, sorting, view changes or preview).
  async function saveTextEdits() {
    const p = getProject(); if (!p) return;
    const changed = [...$('#reportRooms').querySelectorAll('[data-report-record]')].filter(el => el.querySelector('[data-report-text]').dataset.edited === 'true').map(el => ({ id: el.dataset.reportRecord, text: el.querySelector('[data-report-text]').value })).filter(x => p.records.some(r => r.id === x.id));
    if (changed.length) await commit(next => { for (const item of changed) next.records.find(r => r.id === item.id).reportText = item.text; });
    for (const el of $('#reportRooms').querySelectorAll('[data-report-text]')) delete el.dataset.edited;
  }
  $('#reportRooms').oninput = event => { if (event.target.matches('[data-report-text]')) event.target.dataset.edited = 'true'; };

  $('#reportRooms').onclick = event => {
    const button = event.target.closest('[data-do]'); if (!button) return;
    const command = button.dataset.do, rid = button.closest('[data-report-record]')?.dataset.reportRecord, mid = button.closest('[data-report-photo]')?.dataset.reportPhoto;
    action(async () => {
      await saveTextEdits();
      if (command === 'edit-photo') return editPhoto(rid, mid);
      if (command === 'edit-record') return editRecord(rid);
      if (command === 'rename-room') {
        const room = getProject().rooms.find(x => x.id === button.dataset.room);
        openModal('統一房間名稱', `<form id="renameRoomForm"><label>房間名稱<input id="roomName" maxlength="100" required value="${e(room.name)}"></label><p>同房間的全部紀錄會一起更新；位置圖上的手寫文字請另行核對。</p><button class="primary">保存房間名稱</button></form>`);
        $('#renameRoomForm').onsubmit = ev => { ev.preventDefault(); const name = $('#roomName').value.trim(); action(async () => { assert(name, '請填房間名稱'); await mutate(p => { assert(!p.rooms.some(x => x.id !== room.id && x.unitId === room.unitId && x.floor === room.floor && x.name === name), '已有同名房間，請使用不同名稱'); p.rooms.find(x => x.id === room.id).name = name; for (const r of p.records.filter(r => r.roomId === room.id)) r.space = name; }); api.closeModal(true); }); }; return;
      }
      if (command === 'generate-text') {
        const r = getProject().records.find(r => r.id === rid), text = observationText(r);
        openModal('新版說明預覽', `<p class="description">${e(text)}</p><p>確認後才替換此筆附件說明。</p><button id="useGeneratedText" class="primary">採用這段說明</button>`);
        $('#useGeneratedText').onclick = () => action(async () => { await mutate(p => { p.records.find(r => r.id === rid).reportText = text; }); api.closeModal(true); }); return;
      }
      await mutate(p => {
        const r = p.records.find(r => r.id === rid);
        if (command === 'save-text') return;
        if (command === 'main') { r.mainPhotoId = mid; r.photos.find(x => x.mediaId === mid).reportInclude = true; }
        if (command === 'preset') { const ids = defaultPhotoIds({ ...r, mainPhotoId: undefined }); delete r.mainPhotoId; r.photos.forEach(x => { x.reportInclude = ids.has(x.mediaId); }); }
        if (command === 'main-only') { const photos = reportPhotos(r), chosen = r.mainPhotoId || (photos.find(p => p.role === 'close') || photos[0])?.mediaId; assert(chosen, '請先選一張主照片'); r.mainPhotoId = chosen; r.photos.forEach(x => { x.reportInclude = x.mediaId === chosen; }); }
        if (command.startsWith('photo-')) { const a = r.photos.findIndex(x => x.mediaId === mid), b = a + (command === 'photo-up' ? -1 : 1); if (b >= 0 && b < r.photos.length) [r.photos[a], r.photos[b]] = [r.photos[b], r.photos[a]]; }
        if (command.startsWith('record-')) { const records = p.records.filter(x => roomKey(x) === roomKey(r)), a = records.indexOf(r), other = records[a + (command === 'record-up' ? -1 : 1)]; if (other) { const ia = p.records.indexOf(r), ib = p.records.indexOf(other); [p.records[ia], p.records[ib]] = [p.records[ib], p.records[ia]]; } }
        if (command.startsWith('room-')) {
          moveRoom(p, button.dataset.room, command === 'room-up' ? -1 : 1, settings.unitId);
        }
      });
    });
  };
  $('#previewReport').onclick = () => action(async () => {
    await saveTextEdits();
    settings.start = Number($('#reportStart').value); settings.perPage = Number($('#reportPerPage').value);
    const p = clone(getProject()); attachmentIndex(p, settings);
    const result = await renderAttachment(p, async mid => (await getMedia(mid))?.blob, settings, (i, n) => busyText(`整理附件照片 ${i}／${n}`));
    const url = URL.createObjectURL(new Blob([result.html], { type: 'text/html;charset=utf-8' }));
    const formatName = REPORT_FORMATS[result.index.format];
    const previewNote = result.index.format === 'standard' ? '圖面、說明表與照片使用同一組編號。' : '依房間核對位置圖、說明與照片。';
    openModal(formatName + ' · 預覽與下載', `<p>${previewNote}請核對選片、位置與文字後，以 A4、100% 比例列印並關閉瀏覽器頁首頁尾。</p><div class="choice-chips"><button id="printAttachment" class="secondary">列印／另存 PDF</button><button id="downloadAttachment" class="primary">下載附件 HTML</button><button id="downloadMapping" class="secondary">下載編號對照 JSON</button></div><iframe id="attachmentPreview" title="現況照片附件預覽"></iframe>`, () => URL.revokeObjectURL(url));
    $('#printAttachment').disabled = true;
    $('#attachmentPreview').onload = () => { if ($('#printAttachment')) $('#printAttachment').disabled = false; };
    $('#attachmentPreview').src = url;
    $('#printAttachment').onclick = () => $('#attachmentPreview').contentWindow.print();
    $('#downloadAttachment').onclick = () => download(new Blob([result.html], { type: 'text/html;charset=utf-8' }), `${p.code}-${formatName}-r${p.revision}.html`);
    $('#downloadMapping').onclick = () => download(new Blob([JSON.stringify({ ...result.index, digest: result.digest }, null, 2)], { type: 'application/json' }), `${p.code}-${formatName}-編號對照-r${p.revision}.json`);
  }, '整理照片附件');
  return { render, saveTextEdits, get dirty() { return !!$('#reportRooms [data-report-text][data-edited="true"]'); } };
}
