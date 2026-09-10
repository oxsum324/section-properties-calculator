import { clone, recordIssues, observationText, roomKey, photoIncluded, ROLES, assert, syncRooms, photoPlacement, recordDateInfo } from './model.js';
import { attachmentIndex, defaultPhotoIds, reportPhotos, renderAttachment, moveRoom, REPORT_FORMATS, escapeHTML as e, prepareVolumes, renderPlannedVolume, masterContentsHTML } from './report.js';
import { detailLabel } from './detail.js';

export function createReportController(api) {
  const { $, action, commit, getProject, getMedia, mediaURL, openModal, download, busyText, editPhoto, editRecord } = api;
  const settings = { unitId: '', unitIds: null, order: [], breakBefore: [], start: 1, perPage: 2, format: 'standard' };
  let projectId = '', pageNumber = 0, observer, generation = 0; const imageURLs = new Set();
  function clearImages() { observer?.disconnect(); generation++; for (const url of imageURLs) URL.revokeObjectURL(url); imageURLs.clear(); }
  const scopeIds = p => settings.unitId ? [settings.unitId] : settings.unitIds || settings.order;
  function options() { return { ...settings, unitIds: scopeIds(getProject()), start: Number($('#reportStart').value), perPage: Number($('#reportPerPage').value), numbering: $('#reportNumbering').value, pageStart: Number($('#reportPageStart').value), pagePrefix: $('#reportPrefix').value.trim(), plansPerPage: Number($('#reportPlans').value), tableRows: Number($('#reportRows').value), toc: $('#reportToc').checked, includeEmpty: $('#reportEmpty').checked, publicByFloor: $('#reportPublicFloors').checked, maxPages: Number($('#volumeMaxPages').value) }; }
  async function render() {
    const p = getProject(); if (!p) return;
    clearImages(); const token = generation;
    if (projectId !== p.id) { projectId = p.id; settings.unitId = ''; settings.unitIds = null; settings.order = p.units.map(u => u.id); settings.breakBefore = []; pageNumber = 0; }
    settings.order = [...settings.order.filter(id => p.units.some(u => u.id === id)), ...p.units.filter(u => !settings.order.includes(u.id)).map(u => u.id)];
    if (settings.unitIds) settings.unitIds = settings.unitIds.filter(id => p.units.some(u => u.id === id));
    if (settings.unitId && !p.units.some(u => u.id === settings.unitId)) settings.unitId = '';
    $('#reportScope').innerHTML = '<option value="">全案</option><option value="custom">勾選的戶別</option>' + p.units.map(u => `<option value="${u.id}">${e(u.code)}</option>`).join('');
    $('#reportScope').value = settings.unitId || (settings.unitIds ? 'custom' : '');
    const includedUnits = scopeIds(p);
    $('#reportUnits').innerHTML = settings.order.map((id, i) => { const u = p.units.find(u => u.id === id); return `<div class="report-unit-choice" data-report-unit="${id}"><label class="check-label"><input type="checkbox" data-unit-include ${includedUnits.includes(id) ? 'checked' : ''}>${e(u.code)}${u.building ? ' · ' + e(u.building) : ''}</label><div class="choice-chips"><button data-unit-move="-1" ${i === 0 ? 'disabled' : ''}>上移</button><button data-unit-move="1" ${i === settings.order.length - 1 ? 'disabled' : ''}>下移</button><label class="check-label"><input type="checkbox" data-unit-break ${settings.breakBefore.includes(id) ? 'checked' : ''}>本戶另起一冊</label></div></div>`; }).join('');
    $('#reportFormat').value = settings.format;
    $('#reportFormatHelp').textContent = settings.format === 'standard' ? '每戶依序：各樓整體平面圖 → 照片說明表 → 照片。同一圖面集中標示跨房間的照片編號。' : '依房間依序顯示位置圖、現況說明與照片，方便現場核對。';
    const groups = new Map();
    for (const r of p.records.filter(r => includedUnits.includes(r.unitId))) {
      const key = r.roomId || roomKey(r); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r);
    }
    const orderedGroups = [...groups.entries()].sort((a, b) => includedUnits.indexOf(a[1][0].unitId) - includedUnits.indexOf(b[1][0].unitId));
    const selected = [...groups.values()].flat().reduce((n, r) => n + reportPhotos(r).length, 0), query = $('#reportSearch').value.trim().toLocaleLowerCase(), filter = $('#reportFilter').value;
    const visible = orderedGroups.flatMap(([key, records]) => records.filter(r => {
      const u = p.units.find(u => u.id === r.unitId), text = [u.code, u.building, r.floor, r.space, r.location].join(' ').toLocaleLowerCase();
      return (!query || text.includes(query)) && (!filter || filter === 'detail' && !r.detail || filter === 'location' && reportPhotos(r).some(photo => !photoPlacement(r, photo) && !r.observationPin) || filter === 'issues' && recordIssues(r).length);
    }).map(r => ({ key, r })));
    const pageCount = Math.max(1, Math.ceil(visible.length / 8)); pageNumber = Math.min(pageNumber, pageCount - 1); const visibleIds = new Set(visible.slice(pageNumber * 8, pageNumber * 8 + 8).map(x => x.r.id));
    $('#reportPager').innerHTML = `<button data-report-page="-1" ${pageNumber === 0 ? 'disabled' : ''}>上一頁</button><span>第 ${pageNumber + 1}／${pageCount} 頁 · ${visible.length} 筆位置</span><button data-report-page="1" ${pageNumber + 1 === pageCount ? 'disabled' : ''}>下一頁</button>`;
    $('#reportRooms').innerHTML = orderedGroups.map(([key, records], gi) => {
      if (!records.some(r => visibleIds.has(r.id))) return '';
      const first = records[0], unit = p.units.find(u => u.id === first.unitId);
      return `<section class="panel report-room"><div class="section-heading"><h3>${e(unit.code)} · ${e(first.floor || '未填樓層')} · ${e(first.space || '未填房間')}</h3></div><div class="choice-chips"><button data-room="${e(key)}" data-do="room-up" ${gi === 0 ? 'disabled' : ''}>房間上移</button><button data-room="${e(key)}" data-do="room-down" ${gi === groups.size - 1 ? 'disabled' : ''}>房間下移</button>${first.roomId ? `<button data-room="${e(first.roomId)}" data-do="rename-room">統一房間名稱</button>` : ''}</div>${records.map((r, ri) => {
        if (!visibleIds.has(r.id)) return '';
        const photos = reportPhotos(r), selectedIds = new Set(photos.map(p => p.mediaId));
        const main = r.mainPhotoId || (photos.find(p => p.role === 'close') || photos[0])?.mediaId;
        return `<article class="report-record" data-report-record="${r.id}"><h4>${e(r.location || '位置說明未填')} · ${photos.length} 張納入附件</h4><div class="choice-chips"><button data-do="record-up" ${ri === 0 ? 'disabled' : ''}>位置上移</button><button data-do="record-down" ${ri === records.length - 1 ? 'disabled' : ''}>位置下移</button><button data-do="edit-record">回到現場紀錄</button><button data-do="edit-detail">細圖：${e(detailLabel(r.detail))}</button><button data-do="preset">選全景＋近照</button><button data-do="main-only">只選主照片</button></div><p class="micro">${e(recordDateInfo(p, r).label)}</p><p class="micro">${e(recordIssues(r).length ? '待核對：' + recordIssues(r).join('、') : '本筆必要紀錄已齊')}</p><label>附件現況說明<textarea data-report-text rows="3" maxlength="10000">${e(r.reportText?.trim() || observationText(r))}</textarea></label><div class="choice-chips"><button data-do="save-text">保存說明</button><button data-do="generate-text">產生新版說明預覽</button></div><p class="micro">現場補充說明另行保留並帶入附件。修改過的附件文字不會被快填欄位自動覆蓋。</p><div class="report-photos">${r.photos.map((photo, pi) => `<div class="report-photo" data-report-photo="${photo.mediaId}"><img data-report-image="${photo.mediaId}" alt="${e(photo.caption || ROLES[photo.role])}"><div><label class="check-label"><input type="checkbox" data-report-include ${selectedIds.has(photo.mediaId) ? 'checked' : ''} ${photo.excluded ? 'disabled' : ''}>${photo.excluded ? '不採用（原檔保留）' : '納入本次附件'}</label><p>${e(ROLES[photo.role])}${main === photo.mediaId ? ' · ★ 主照片' : ''}</p><p>${e(photo.caption)}</p><div class="choice-chips"><button data-do="main" ${photo.excluded ? 'disabled' : ''}>設主照片</button><button data-do="photo-up" ${pi === 0 ? 'disabled' : ''}>前移</button><button data-do="photo-down" ${pi === r.photos.length - 1 ? 'disabled' : ''}>後移</button><button data-do="edit-photo">圈註／拍攝位置</button></div></div></div>`).join('') || '<p>尚無照片</p>'}</div></article>`;
      }).join('')}</section>`;
    }).join('') || '<p>目前範圍尚無紀錄。</p>';
    $('#reportSummary').textContent = `${groups.size} 個房間／空間 · ${selected} 張已選照片。未選照片保留在案件備份。`;
    $('#previewReport').disabled = !selected && !(settings.format === 'standard' && $('#reportEmpty').checked && includedUnits.length);
    $('#planVolumes').disabled = settings.format !== 'standard' || !includedUnits.length;
    observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { observer?.unobserve(entry.target); const img = entry.target; getMedia(img.dataset.reportImage).then(asset => { if (token !== generation || !img.isConnected) return; if (!asset?.blob) { img.alt = '找不到原檔，請核對備份'; return; } const url = URL.createObjectURL(asset.thumb || asset.blob); imageURLs.add(url); img.src = url; }).catch(() => { img.alt = '讀取照片失敗'; }); } }, { rootMargin: '300px' });
    for (const img of $('#reportRooms').querySelectorAll('[data-report-image]')) { img.loading = 'lazy'; observer.observe(img); }
  }
  async function mutate(fn) { await commit(p => { fn(p); syncRooms(p); }); await render(); }
  $('#reportScope').onchange = () => action(async () => { const value = $('#reportScope').value; settings.unitId = value === 'custom' ? '' : value; settings.unitIds = value === 'custom' ? settings.unitIds || [...settings.order] : null; pageNumber = 0; await render(); });
  $('#reportFormat').onchange = () => action(async () => { settings.format = $('#reportFormat').value; await render(); });
  for (const selector of ['#reportSearch', '#reportFilter']) $(selector).onchange = () => action(async () => { pageNumber = 0; await render(); });
  $('#reportEmpty').onchange = () => action(render);
  $('#reportPager').onclick = event => { const b = event.target.closest('[data-report-page]'); if (b) action(async () => { pageNumber += Number(b.dataset.reportPage); await render(); $('#reportPager').scrollIntoView({ block: 'start' }); }); };
  $('#reportUnits').onchange = event => { const input = event.target.closest('[data-unit-include],[data-unit-break]'); if (!input) return; action(async () => { const id = input.closest('[data-report-unit]').dataset.reportUnit; if (input.hasAttribute('data-unit-break')) settings.breakBefore = input.checked ? [...new Set([...settings.breakBefore, id])] : settings.breakBefore.filter(x => x !== id); else { settings.unitId = ''; settings.unitIds = [...$('#reportUnits').querySelectorAll('[data-unit-include]:checked')].map(el => el.closest('[data-report-unit]').dataset.reportUnit); } pageNumber = 0; await render(); }); };
  $('#reportUnits').onclick = event => { const b = event.target.closest('[data-unit-move]'); if (b) action(async () => { const id = b.closest('[data-report-unit]').dataset.reportUnit, i = settings.order.indexOf(id), j = i + Number(b.dataset.unitMove); if (j >= 0 && j < settings.order.length) [settings.order[i], settings.order[j]] = [settings.order[j], settings.order[i]]; if (settings.unitIds) settings.unitIds = settings.order.filter(id => settings.unitIds.includes(id)); await render(); }); };
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
      if (command === 'edit-detail') return api.editDetail(rid);
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
  function showResult(result, p, back) {
    const url = URL.createObjectURL(new Blob([result.html], { type: 'text/html;charset=utf-8' }));
    const formatName = REPORT_FORMATS[result.index.format], suffix = result.index.volume ? '-第' + result.index.volume + '冊' : settings.unitId ? '-' + (p.units.find(u => u.id === settings.unitId)?.code || '') : '';
    openModal(formatName + suffix + ' · 預覽與下載', '<p>請核對日期、選片、細圖與文字。列印選 A4、100% 比例，關閉瀏覽器頁首頁尾。</p><div class="choice-chips"><button id="printAttachment" class="secondary">列印／另存 PDF</button><button id="downloadAttachment" class="primary">下載附件 HTML</button><button id="downloadMapping" class="secondary">下載編號對照 JSON</button>' + (back ? '<button id="backToVolumes" class="secondary">返回分冊清單</button>' : '') + '</div><iframe id="attachmentPreview" title="現況照片附件預覽"></iframe>', () => URL.revokeObjectURL(url));
    $('#printAttachment').disabled = true;
    $('#attachmentPreview').onload = () => { if ($('#printAttachment')) $('#printAttachment').disabled = false; };
    $('#attachmentPreview').src = url;
    $('#printAttachment').onclick = () => $('#attachmentPreview').contentWindow.print();
    $('#downloadAttachment').onclick = () => download(new Blob([result.html], { type: 'text/html;charset=utf-8' }), p.code + '-' + formatName + suffix + '-r' + p.revision + '.html');
    $('#downloadMapping').onclick = () => download(new Blob([JSON.stringify({ ...result.index, digest: result.digest }, null, 2)], { type: 'application/json' }), p.code + '-' + formatName + suffix + '-編號對照-r' + p.revision + '.json');
    if (back) $('#backToVolumes').onclick = back;
  }
  $('#previewReport').onclick = () => action(async () => {
    await saveTextEdits();
    const p = clone(getProject()), opts = options(); attachmentIndex(p, opts);
    const result = await renderAttachment(p, async mid => (await getMedia(mid))?.blob, opts, (i, n) => busyText('整理附件照片 ' + i + '／' + n));
    showResult(result, p);
  }, '整理照片附件');
  function volumeMenu(p, plan) {
    openModal('標準附件 · 分冊清單', '<p>' + plan.volumes.length + ' 冊 · ' + plan.index.sections.length + ' 頁正文。目錄獨立計頁，各冊正文頁碼接續。</p><label>選擇冊次<select id="volumeSelect">' + plan.volumes.map(v => '<option value="' + v.number + '">第 ' + v.number + ' 冊 · ' + e(plan.index.pagePrefix + v.start) + '～' + e(plan.index.pagePrefix + (v.start + v.pageCount - 1)) + ' · ' + v.unitIds.length + ' 戶' + (v.overLimit ? '（單元超過頁數上限，完整保留）' : '') + '</option>').join('') + '</select></label><div class="choice-chips"><button id="previewVolume" class="primary">開啟本冊／下載</button><button id="downloadContents" class="secondary">下載全案分冊目錄</button><button id="downloadVolumePlan" class="secondary">下載全案編號對照</button></div><p class="micro">逐冊製作影像，減少一次處理的資料量。單冊影像過大時，可返回調整每冊頁數或公設分段。</p>');
    $('#previewVolume').onclick = () => action(async () => { const result = await renderPlannedVolume(p, async mid => (await getMedia(mid))?.blob, plan, Number($('#volumeSelect').value), (i, n) => busyText('整理本冊照片 ' + i + '／' + n)); showResult(result, p, () => volumeMenu(p, plan)); }, '製作本冊附件');
    $('#downloadContents').onclick = () => action(async () => download(new Blob([await masterContentsHTML(plan)], { type: 'text/html;charset=utf-8' }), p.code + '-分冊總目錄-r' + p.revision + '.html'));
    $('#downloadVolumePlan').onclick = () => download(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }), p.code + '-全案編號與分冊對照-r' + p.revision + '.json');
  }
  $('#planVolumes').onclick = () => action(async () => {
    await saveTextEdits(); const p = clone(getProject()), plan = await prepareVolumes(p, options()); volumeMenu(p, plan);
  }, '核對各戶頁數與分冊');
  return { render, saveTextEdits, get dirty() { return !!$('#reportRooms [data-report-text][data-edited="true"]'); } };
}
