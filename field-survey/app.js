import { planTemplateCopy, VERSION, removeRecordPhotos, BUILDING_TYPES, floorConfig, buildingType, floorOptions, spaceOptions, sortedUnits, apartmentUnits, validDate, MARK_TONES, CAPTURE_SOURCES, localDateOf, defaultStamp, photoStampText, applyPhotoDate, exifDate, id, now, clone, newProject, newUnit, newRecord, CONDITIONS, COMPONENTS, UNIT_STATES, ROLES, WIDTH_MODES, CRACK_PATTERNS, widthMode, isNetworkCrack, recordComponents, recordConditions, AREA_CONDITIONS, AREA_METHODS, emptySketch, recordIssues, unitIssues, sha256, restoredCopy, assert } from './model.js';
import { openStore, allProjects, getProject, getMedia, saveProject, backupState, saveBackupState } from './store.js';
import { makeBundle, readBundle, makeReceipt, checkReceipt, consolidateBundles } from './bundle.js';
import { createAnnotator, markedImage, planPreview, photoLocationImage } from './annotation.js';
import { createSketcher, sketchImage } from './sketch.js';
import { isUCrack, isTile, syncRooms, clearWrongFloor, observationText, tileTotal, photoPlacement } from './model.js';
import { createCrackFields, crackLabel } from './cracks.js';
import { individualCracks } from './model.js';
import { createReportController } from './report-ui.js';
import { createOrganisationController, unitHistoryLabel } from './organisation.js';
import { UNIT_KINDS, recordDateInfo, latestUnitHistory } from './model.js';
import { openDetailEditor, detailLabel, detailContextHTML } from './detail.js';
import { COMMON_CONDITIONS, CONDITION_GROUPS, CRACK_LAYERS, LEAK_FORMS } from './model.js';

const $ = selector => document.querySelector(selector), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opts = object => Object.entries(object).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
const size = bytes => bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const localDate = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
let project = null, unitId = '', recordId = '', activeView = 'work', dirty = false, editGeneration = 0, saveTimer, formSaving = null, working = false, renderToken = 0;
let pendingCapture = null, pendingPlan = null, modalCleanup = () => {}, modalDirty = false, recording = null, toastTimer;
let conflictDraft = null;
let reports, crackFields, organisation, reviewPage = 0;
const preference = { get(key) { try { return localStorage.getItem('survey-' + key); } catch { return null; } }, set(key, value) { try { localStorage.setItem('survey-' + key, value); } catch {} } };
const urls = new Map();
const currentRecord = () => project?.records.find(r => r.id === recordId);
const currentUnit = () => project?.units.find(u => u.id === unitId);
const recordNumber = r => `位置 ${String(r.fieldNumber || project.records.indexOf(r) + 1).padStart(3, '0')}`;
const planLabel = r => $('#fieldLabels').checked ? recordNumber(r) : '';
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500); }
function fail(error) { console.error(error); $('#recoverCopy').hidden = $('#modalRecover').hidden = !conflictDraft; $('#errorText').textContent = error?.name === 'QuotaExceededError' ? '此裝置儲存空間不足，這次操作未完成。請先匯出已有案件；原有資料不會自動刪除。' : error.message || String(error); $('#errorBar').hidden = false; if ($('#modal').open) { $('#modalError').textContent = $('#errorText').textContent; $('#modalError').hidden = false; $('#modalError').scrollIntoView({ block: 'nearest' }); } $('#saveStatus').textContent = dirty ? '有尚未保存的變更' : '請確認上方提示'; }
function busyText(text) { $('#busyText').textContent = text; }
async function action(fn, label = '處理中') {
  if (working) return;
  working = true; $('#busy').hidden = false; busyText(label); $('#app').inert = true; $('#modal').inert = true;
  try { await saveForm(); await reports?.saveTextEdits(); await fn(); } catch (e) { fail(e); } finally { working = false; $('#busy').hidden = true; $('#app').inert = false; $('#modal').inert = false; }
}
function requireNoRecording() { assert(!recording, '請先停止並保存目前錄音，再切換位置或案件。'); }
function openModal(title, body, cleanup = () => {}) {
  $('#modalBody').onclick = null;
  modalCleanup(); delete $('#modal').dataset.mode; modalCleanup = cleanup; modalDirty = false; $('#modalError').hidden = $('#modalRecover').hidden = $('#discardPrompt').hidden = true; $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body;
  if (!$('#modal').open) $('#modal').showModal();
}
function closeModal(force = false) {
  if (!force && modalDirty) { $('#discardPrompt').hidden = false; $('#keepEditing').focus(); return; }
  modalCleanup(); modalCleanup = () => {}; modalDirty = false; $('#discardPrompt').hidden = true; $('#modal').close();
}
function revokeURLs() { for (const value of urls.values()) URL.revokeObjectURL(value); urls.clear(); }
async function mediaURL(mediaId, original = false) {
  const key = mediaId + (original ? '-original' : '');
  if (urls.has(key)) return urls.get(key);
  const asset = await getMedia(mediaId); assert(asset?.blob, '找不到媒體原檔，請從備份還原');
  const url = URL.createObjectURL(original ? asset.blob : asset.thumb || asset.blob); urls.set(key, url); return url;
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_'); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 120000);
}
async function commit(mutator, assets = []) {
  const next = clone(project); mutator(next); syncRooms(next);
  try { project = await saveProject(next, project.revision, assets); conflictDraft = null; $('#saveStatus').textContent = '已保存於本機'; }
  catch (e) { if (e.name === 'RevisionConflictError') conflictDraft = { project: next, assets }; throw e; }
}
function markUnitOpen(next, record) { const u = next.units.find(x => x.id === record.unitId), h = u?.visitHistory?.find(h => h.visitId === record.visitId); if (h?.status === 'complete') h.status = 'open'; const latest = u && latestUnitHistory(next, u); if (u?.status === 'complete' && (!latest || !record.visitId || latest.visitId === record.visitId)) u.status = 'open'; record.updatedAt = now(); }
function formValues() {
  const values = {};
  values.visitId = $('#recordVisit').value; values.observedOn = $('#observedOn').value;
  for (const key of ['floor', 'space', 'location', 'visibility', 'notes', 'resident']) values[key] = $('#' + key).value;
  values.components = [...$('#component').querySelectorAll('input:checked')].map(el => el.value); values.component = values.components[0] || '';
  values.conditions = selectedConditions(); values.condition = values.conditions[0] || '';
  values.measured = $('#measured').checked;
  values.widthMode = $('#widthMode').value;
  values.crackPattern = $('#crackPattern').value;
  values.crackLayer = $('#crackLayer input:checked')?.value || 'unknown';
  values.leakForms = [...$('#leakForms').querySelectorAll('input:checked')].map(el => el.value);
  const countValue = selector => { const el = $(selector); assert(!el.validity.badInput, '數量格式不正確'); const value = el.value === '' ? null : Number(el.value); assert(value === null || Number.isSafeInteger(value) && value >= 0 && value <= 99999, '數量須為 0 至 99999 的整數'); return value; };
  values.crackCount = countValue('#crackCount'); values.countApprox = $('#countApprox').checked;
  values.uScope = $('#uScope').value; values.uPartial = $('#uPartial').checked; values.surface = $('#surface').value;
  values.tiles = { crack: $('#tileCrack').checked && values.surface === 'tile', broken: $('#tileBroken').checked, bulge: $('#tileBulge').checked, approx: $('#tileApprox').checked, crackCount: countValue('#tileCrackCount'), brokenCount: countValue('#tileBrokenCount'), bulgeCount: countValue('#tileBulgeCount'), overlapCount: countValue('#tileOverlapCount') };
  for (const key of ['width', 'length']) { const el = $('#' + key), enabled = values.measured && (key === 'length' || values.widthMode === 'exact'); assert(!enabled || !el.validity.badInput, '量測尺寸格式不正確'); values[key] = enabled && el.value !== '' ? Number(el.value) : null; assert(values[key] === null || (Number.isFinite(values[key]) && values[key] >= 0), '量測尺寸須為非負數值'); }
  values.areas = {};
  for (const key of Object.keys(AREA_CONDITIONS)) {
    const el = $('#area-' + key), method = $('#area-method-' + key).value;
    assert(!el.validity.badInput, '損害面積格式不正確');
    const value = el.value === '' ? null : Number(el.value);
    assert(value === null || Number.isFinite(value) && value >= 0, '損害面積須為非負數值');
    if (value !== null || currentRecord()?.areas?.[key]) values.areas[key] = { value, method };
  }
  Object.assign(values, crackFields?.read());
  if (individualCracks(values)) { values.measured = false; values.width = values.length = null; values.widthMode = 'unknown'; }
  for (const [kind, input] of [['crack', '#tileCrackCount'], ['broken', '#tileBrokenCount'], ['bulge', '#tileBulgeCount']]) {
    values.tiles[kind + 'Text'] = $(input + 'Text')?.value || '';
    if (values.tiles[kind + 'Text']) values.tiles[kind + 'Count'] = null;
  }
  if (values.tiles.crackText || values.tiles.brokenText) values.tiles.overlapCount = null;
  return values;
}
async function saveForm() {
  clearTimeout(saveTimer);
  if (formSaving) { await formSaving; if (dirty) return saveForm(); return; }
  if (!dirty || !currentRecord() || $('#recordEditor').hidden) return;
  const generation = editGeneration, target = recordId, values = formValues(), beforeFloor = currentRecord().floor;
  formSaving = commit(next => {
    const r = next.records.find(x => x.id === target); Object.assign(r, values); markUnitOpen(next, r);
    clearWrongFloor(next, r);
  }).then(async () => {
    if (generation === editGeneration) dirty = false;
    $('#saveStatus').textContent = dirty ? '尚未保存新變更' : '已保存於本機';
    renderRecordList(); renderRecordIssues(); renderFieldDetailCard($('#recordDetail'), currentRecord()); $('#recordDateSummary').textContent = recordDateInfo(project, currentRecord()).label;
    if (beforeFloor !== values.floor && currentRecord()?.id === target) { $('#recordTime').textContent = '樓層變更後請核對位置圖'; await renderLocationCard($('#recordLocation'), currentRecord()); }
  }).finally(() => { formSaving = null; });
  await formSaving;
}
const selectedConditions = () => [...$('#condition').querySelectorAll('input:checked')].map(el => el.value);
function conditionState() {
  const selected = selectedConditions();
  const selectionKey = selected.join(',');
  if ($('#selectedConditions').dataset.selection !== selectionKey) {
    $('#selectedConditions').dataset.selection = selectionKey;
    $('#selectedConditions').innerHTML = selected.map(key => `<button type="button" data-remove-condition="${key}" aria-label="取消選取${esc(CONDITIONS[key])}">${esc(CONDITIONS[key])} ×</button>`).join('');
    $('#conditionSelectionStatus').textContent = selected.length ? `已選 ${selected.length} 項` : '尚未分類';
  }
  $('#measurement').hidden = !selected.includes('crack');
  $('#leakFields').hidden = !selected.includes('activeLeak');
  let anyArea = false;
  for (const key of Object.keys(AREA_CONDITIONS)) {
    const shown = selected.includes(key) && (key !== 'crack' || $('#crackPattern').value === 'network');
    $('[data-area="' + key + '"]').hidden = !shown; anyArea ||= shown;
  }
  $('#areaMeasurements').hidden = !anyArea;
  $('#uCrackFields').hidden = !selected.includes('crack') || $('#crackPattern').value !== 'u';
  $('#tileFields').hidden = $('#surface').value !== 'tile' && !selected.some(c => ['tileBroken', 'tileBulge'].includes(c));
  $('#tileCrackOption').hidden = $('#surface').value !== 'tile';
  $('#tileCrackQuantity').hidden = !$('#tileCrack').checked; $('#tileBrokenQuantity').hidden = !$('#tileBroken').checked;
  $('#tileCrackQuantity').hidden ||= $('#surface').value !== 'tile'; $('#tileBulgeQuantity').hidden = !$('#tileBulge').checked;
  $('#tileOverlapQuantity').hidden = !$('#tileCrack').checked || !$('#tileBroken').checked || !!$('#tileCrackCountText').value || !!$('#tileBrokenCountText').value;
  $('#tileOverlapQuantity').hidden ||= $('#surface').value !== 'tile';
  for (const selector of ['#tileCrackCount', '#tileBrokenCount', '#tileBulgeCount']) $(selector).disabled = !!$(selector + 'Text').value;
  $('#individualCracks').hidden = !selected.includes('crack') || ['network', 'u'].includes($('#crackPattern').value) || $('#surface').value === 'tile';
  try { const values = formValues(), total = tileTotal(values.tiles); $('#tileTotal').textContent = total === null ? '數量或重疊情形未確認時，不自動合計塊數。' : `不重複受損磁磚：${values.tiles.approx ? '約 ' : ''}${total} 塊`; $('#quickDescription').textContent = observationText(values); } catch { $('#quickDescription').textContent = '請先確認數量或尺寸格式。'; }
}
function measurementState() {
  const mode = $('#widthMode').value, measured = $('#measured').checked;
  const data = { conditions: selectedConditions(), components: [...$('#component').querySelectorAll('input:checked')].map(el => el.value), crackPattern: $('#crackPattern').value, surface: $('#surface').value };
  const network = isNetworkCrack(data), u = isUCrack(data), optional = network || u || isTile(data);
  for (const button of $('#widthPresets').querySelectorAll('[data-width]')) button.setAttribute('aria-pressed', String(button.dataset.width === mode));
  const individual = !$('#individualCracks').hidden && crackFields?.active;
  $('#crackLayerFields').hidden = individual;
  for (const selector of ['#widthPresets', '#widthMode', '#widthHint', '#measured', '#width']) { const el = $(selector); (selector === '#widthMode' || selector === '#measured' ? el.parentElement : selector === '#width' ? el.closest('.two-col') : el).hidden = individual; }
  $('#width').disabled = !measured || mode !== 'exact'; $('#length').disabled = !measured;
  $('#widthLabel').textContent = `實測裂縫寬度（mm）${optional ? '・選填' : ''}`; $('#lengthLabel').textContent = `${u ? '單條 U 型裂縫展開長度' : '實測裂縫長度'}（m）${optional ? '・選填' : ''}`;
  if (u || isTile(data)) { $('#widthHint').textContent = u ? '以條數記錄即可。單條展開長度與寬度選填；本工具不計算或列出 U 型裂縫總長。' : '磁磚以受損塊數記錄，寬度與長度選填。'; return; }
  if (network) { $('#widthHint').textContent = '網狀裂隙以照片圈註與現況說明記錄分布；寬度、長度及實測勾選均可略過，不列尺寸待補。若另有實測值，可勾選實際量測後選填。'; return; }
  $('#widthHint').textContent = ['lt03', 'ge03', 'le03', 'gt03'].includes(mode) ? `${measured ? '已實測區間' : '區間初記，尚未實測'}。只保存區間，不代填 0.3 mm；此界線不是安全判定。` : mode === 'exact' ? measured ? '請輸入裂縫規讀值；寬度用 mm，長度用 m。' : '請勾選已實際量測，再輸入裂縫規讀值。' : '未確認時保留空值；可先記裂隙方向及現況說明。';
}
function changed(event) {
  const target = event?.target;
  if (target?.id === 'crackPattern' && target.value === 'u') $('#component input[value="梁"]').checked = true;
  if (target?.name === 'components' && $('#crackPattern').value === 'u' && !$('#component input[value="梁"]').checked) $('#crackPattern').value = '';
  if (target?.id === 'tileCrack' && target.checked) { $('#condition input[value="crack"]').checked = true; $('#condition input[value="normal"]').checked = false; }
  for (const key of ['tileBroken', 'tileBulge']) {
    if (target?.id === key) { $('#condition input[value="' + key + '"]').checked = target.checked; if (target.checked) $('#condition input[value="normal"]').checked = false; }
    if (target?.name === 'conditions' && target.value === key) $('#' + key).checked = target.checked;
  }
  if (target?.name === 'conditions' && target.checked) {
    for (const el of $('#condition').querySelectorAll('input')) if (el !== target && (target.value === 'normal' || el.value === 'normal')) el.checked = false;
  }
  if (target?.name === 'conditions' && (target.value === 'normal' && target.checked || target.value === 'crack' && !target.checked)) $('#tileCrack').checked = false;
  if (target?.name === 'conditions' && target.value === 'normal' && target.checked) $('#tileBroken').checked = $('#tileBulge').checked = false;
  if (target?.id === 'floor' || target?.id === 'space') for (const b of $(target.id === 'floor' ? '#floorChips' : '#spaceChips').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset[target.id] === target.value));
  if (!currentRecord()) return; dirty = true; editGeneration++; $('#saveStatus').textContent = '尚未保存'; clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveForm().catch(fail); }, 500);
  conditionState();
  measurementState();
}
async function projectOptions() {
  const projects = (await allProjects()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $('#caseSelect').innerHTML = projects.length ? projects.map(p => `<option value="${esc(p.id)}">${esc(p.code)} · ${esc(p.name)}</option>`).join('') : '<option value="">尚無案件</option>';
  if (project) $('#caseSelect').value = project.id;
  $('#contextCase').textContent = project ? `${project.code} · ${project.name}` : '尚無案件';
}
async function selectProject(projectId) {
  requireNoRecording(); revokeURLs(); project = projectId ? await getProject(projectId) : null; dirty = false; conflictDraft = null;
  if (project?.records.some(r => !r.fieldNumber || r.floor.trim() && r.space.trim() && !r.roomId)) project = await saveProject(syncRooms(clone(project)), project.revision);
  unitId = project?.units[0]?.id || ''; recordId = project?.records.find(r => r.unitId === unitId)?.id || ''; activeView = 'work'; await render();
}
function renderRecordList() {
  const records = project?.records.filter(r => r.unitId === unitId) || [];
  $('#recordCount').textContent = records.length;
  $('#recordList').innerHTML = records.length ? records.map(r => `<button class="record-item ${r.id === recordId ? 'active' : ''}" data-record="${esc(r.id)}"><strong>${esc(recordNumber(r))} · ${esc(r.space || '未填空間')}</strong><small>${esc(r.floor || '未填樓層')} · ${r.photos.filter(p => !p.excluded).length} 張照片${recordIssues(r).length ? ' · 待補' : ''}</small></button>`).join('') : '<p class="micro">這一戶尚無位置紀錄</p>';
  $('#addRecord').disabled = !unitId; $('#editUnit').disabled = !unitId;
  $('#unitPlans').disabled = !unitId; $('#addAddressRecord').disabled = !unitId;
  const order = project ? sortedUnits(project) : []; $('#nextUnit').disabled = !unitId || order.findIndex(u => u.id === unitId) >= order.length - 1;
  $('#unitPlanSummary').textContent = unitId ? `本戶 ${project.plans.filter(p => p.unitId === unitId).length} 張共用圖面。可先依樓層建圖，再新增位置紀錄。` : '先新增戶別，即可匯入或手繪平面圖。';
  renderContext();
}
function renderContext() {
  if (!project) return;
  const visitOption = $('#visitSelect').value ? $('#visitSelect').selectedOptions[0] : null;
  $('#contextVisit').textContent = visitOption ? visitOption.textContent.split(' · ')[0] : '尚未指定批次';
  const u = currentUnit(); $('#contextUnit').textContent = u ? u.code : '尚無戶別';
  const r = activeView === 'work' ? currentRecord() : null; $('#contextRecord').hidden = !r;
  if (r) $('#contextRecord').textContent = `${recordNumber(r)} · ${[r.floor, r.space].filter(x => x.trim()).join(' ') || '樓層／空間未填'}`;
  const residences = project.units.filter(x => (x.kind || 'residence') === 'residence').length;
  $('#caseUnitSummary').textContent = project.units.length ? `已建 ${project.units.length} 戶：住戶 ${residences}、公設 ${project.units.length - residences}。` : '尚無戶別。';
}
function renderRecordIssues() {
  const r = currentRecord(); if (!r) return;
  const issues = recordIssues(r); $('#recordIssues').textContent = issues.length ? `待補：${issues.join('、')}` : '本筆必要紀錄已齊';
}
async function managePhotos() {
  const r = currentRecord(), context = { projectId: project.id, recordId: r?.id };
  assert(r?.photos.length, '本筆尚無照片');
  openModal('選取照片刪除', `<p class="micro">${esc(recordNumber(r))} · ${esc(r.floor)} · ${esc(r.space)}。勾選多拍的照片，可一次刪除多張。</p><div class="choice-chips"><button id="selectAllPhotos">全選</button><button id="clearPhotoSelection">取消全選</button><span id="photoSelectionCount" role="status">已選 0 張</span></div><div class="photo-grid photo-delete-grid">${r.photos.map((photo, i) => `<label class="photo-delete-card"><input type="checkbox" data-delete-photo="${esc(photo.mediaId)}"><span class="photo-placeholder">讀取照片…</span><span>照片 ${i + 1} · ${esc(ROLES[photo.role])}${photo.mediaId === r.mainPhotoId ? ' · 主照片' : ''}</span><small>${esc(photo.caption)}</small></label>`).join('')}</div><p class="micro">刪除會移除所選照片及其圈註、拍攝方向；此操作無法復原。本筆位置說明與共用細部圖保留。若只想不列入附件，可到照片編輯調整採用狀態。</p><div class="modal-actions"><button id="cancelPhotoDelete" class="secondary">取消</button><button id="deleteSelectedPhotos" class="danger" disabled>刪除所選照片</button></div>`);
  const boxes = [...$('#modalBody').querySelectorAll('[data-delete-photo]')];
  const selected = () => boxes.filter(box => box.checked);
  const update = () => { const n = selected().length; $('#photoSelectionCount').textContent = `已選 ${n} / ${boxes.length} 張`; $('#deleteSelectedPhotos').disabled = !n; $('#deleteSelectedPhotos').textContent = n ? `刪除所選 ${n} 張照片` : '刪除所選照片'; };
  boxes.forEach(box => { box.onchange = update; });
  $('#selectAllPhotos').onclick = () => { boxes.forEach(box => { box.checked = true; }); update(); };
  $('#clearPhotoSelection').onclick = () => { boxes.forEach(box => { box.checked = false; }); update(); };
  $('#cancelPhotoDelete').onclick = () => closeModal(true);
  $('#deleteSelectedPhotos').onclick = () => action(async () => {
    assert(project.id === context.projectId && recordId === context.recordId, '位置已變更，請重新選取照片');
    const chosen = selected(), ids = chosen.map(box => box.dataset.deletePhoto);
    assert(ids.length, '請先勾選照片');
    const numbers = chosen.map(box => boxes.indexOf(box) + 1).join('、');
    if (!confirm(`確定刪除照片 ${numbers}，共 ${ids.length} 張？${ids.includes(r.mainPhotoId) ? '\n包含主照片，刪除後請到附件整理核對主照片。' : ''}${ids.length === boxes.length ? '\n本筆將沒有照片，位置說明與細部圖仍會保留。' : ''}\n照片及其圈註、方向將移除，無法復原。`)) return;
    await commit(next => { removeRecordPhotos(next, context.recordId, ids); markUnitOpen(next, next.records.find(r => r.id === context.recordId)); });
    closeModal(true); revokeURLs(); await render(); toast(`已刪除 ${ids.length} 張照片`);
  }, '刪除所選照片');
  for (const box of boxes) {
    const image = new Image(); image.alt = '照片預覽'; image.loading = 'lazy'; image.src = await mediaURL(box.dataset.deletePhoto);
    box.parentElement.querySelector('.photo-placeholder').replaceWith(image);
  }
}
async function renderMedia() {
  const token = ++renderToken, r = currentRecord();
  if (!r) return;
  $('#managePhotos').disabled = !r.photos.length;
  $('#photoGrid').innerHTML = r.photos.length ? r.photos.map((p, i) => `<button type="button" class="photo-card" data-photo="${esc(p.mediaId)}" aria-label="照片 ${i + 1} 圈註"><span class="photo-placeholder">讀取照片…</span>${p.marks.length ? '<span class="mark-badge">已圈註</span>' : ''}<span class="photo-label"><span>${i + 1} · ${esc(p.excluded ? '不採用' : ROLES[p.role])}</span><span>編輯 ↗</span></span></button>`).join('') : '<div class="photo-empty">先拍一張位置全景，再加入近照或量尺照。</div>';
  $('#audioList').replaceChildren();
  await renderLocationCard($('#recordLocation'), r); if (token !== renderToken) return;
  renderFieldDetailCard($('#recordDetail'), r);
  for (const photo of r.photos) {
    const url = await mediaURL(photo.mediaId); if (token !== renderToken) return;
    const card = $(`[data-photo="${photo.mediaId}"]`), image = new Image(); image.alt = photo.caption || ROLES[photo.role]; image.loading = 'lazy'; image.src = url;
    image.onerror = () => { if (token === renderToken) { const span = document.createElement('span'); span.className = 'photo-placeholder'; span.textContent = '原檔已存・此裝置無法預覽'; image.replaceWith(span); } };
    card.querySelector('.photo-placeholder').replaceWith(image); if (photo.excluded) card.style.opacity = '.55';
  }
  for (const audioId of r.audioIds) {
    const url = await mediaURL(audioId, true); if (token !== renderToken) return;
    const div = document.createElement('div'); div.className = 'audio-item'; const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'metadata'; audio.src = url;
    const label = document.createElement('span'); label.textContent = project.media.find(m => m.id === audioId)?.name || '現場錄音'; div.append(label, audio); $('#audioList').append(div);
  }
}
async function renderEditor() {
  renderToken++;
  const r = currentRecord(); $('#recordEditor').hidden = !r; $('#recordEmpty').hidden = !!r; renderContext(); if (!r) return;
  $('#recordCode').textContent = recordNumber(r); $('#recordTime').textContent = new Date(r.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  $('#recordVisit').innerHTML = '<option value="">未指定／原案紀錄</option>' + (project.visits || []).map(v => `<option value="${esc(v.id)}">${esc(v.name)} · ${v.start}${v.end !== v.start ? '～' + v.end : ''}</option>`).join('');
  $('#recordVisit').value = r.visitId || ''; $('#observedOn').value = r.observedOn || ''; $('#recordDateSummary').textContent = recordDateInfo(project, r).label;
  for (const key of ['floor', 'space', 'location', 'visibility', 'notes', 'resident']) $('#' + key).value = r[key];
  for (const el of $('#component').querySelectorAll('input')) el.checked = recordComponents(r).includes(el.value);
  for (const el of $('#condition').querySelectorAll('input')) el.checked = recordConditions(r).includes(el.value);
  // Recognize legacy tile quantities without rewriting old saved records on load.
  if (isTile(r) && !recordConditions(r).includes('normal')) for (const [key, kind] of [['tileBroken', 'broken'], ['tileBulge', 'bulge']]) if (r.tiles?.[kind]) $('#condition input[value="' + key + '"]').checked = true;
  $('#moreConditions').open = false; $('#areaMeasurements').open = false;
  for (const el of $('#crackLayer').querySelectorAll('input')) el.checked = el.value === (r.crackLayer || 'unknown');
  for (const el of $('#leakForms').querySelectorAll('input')) el.checked = r.leakForms?.includes(el.value) || false;
  for (const key of Object.keys(AREA_CONDITIONS)) { $('#area-' + key).value = r.areas?.[key]?.value ?? ''; $('#area-method-' + key).value = r.areas?.[key]?.method || 'measured'; }
  $('#measured').checked = r.measured;
  $('#widthMode').value = widthMode(r); $('#crackPattern').value = r.crackPattern || '';
  $('#crackCount').value = r.crackCount ?? ''; $('#countApprox').checked = r.countApprox || false; $('#uScope').value = r.uScope || 'representative'; $('#uPartial').checked = r.uPartial || false;
  $('#surface').value = r.surface || ''; $('#tileCrack').checked = r.tiles?.crack || false; $('#tileBroken').checked = $('#condition input[value="tileBroken"]').checked; $('#tileBulge').checked = $('#condition input[value="tileBulge"]').checked; $('#tileApprox').checked = r.tiles?.approx || false;
  for (const [selector, key] of [['#tileCrackCount', 'crackCount'], ['#tileBrokenCount', 'brokenCount'], ['#tileBulgeCount', 'bulgeCount'], ['#tileOverlapCount', 'overlapCount']]) $(selector).value = r.tiles?.[key] ?? '';
  $('#spaces').innerHTML = [...new Set(['客廳', '房間', '廚房', '浴廁', '樓梯', '陽台', ...project.records.filter(x => x.unitId === r.unitId && x.floor === r.floor).map(x => x.space)])].filter(Boolean).map(x => `<option value="${esc(x)}">`).join('');
  renderChips(r);
  for (const k of ['width', 'length']) { $('#' + k).value = r[k] ?? ''; $('#' + k).disabled = !r.measured; }
  crackFields.load(r);
  for (const [kind, selector] of [['crack', '#tileCrackCountText'], ['broken', '#tileBrokenCountText'], ['bulge', '#tileBulgeCountText']]) $(selector).value = r.tiles?.[kind + 'Text'] || '';
  conditionState(); measurementState(); renderRecordIssues(); await renderMedia();
}
async function render() {
  await projectOptions(); $('#welcome').hidden = !!project; $('#workspace').hidden = !project; $('#bottomNav').hidden = !project; $('#contextCrumbs').hidden = !project; $('#gotoCase').hidden = !project || activeView === 'case';
  if (!project) return;
  organisation.render();
  const config = floorConfig(project);
  $('#caseTypeSummary').textContent = `${BUILDING_TYPES[buildingType(project)]} · 地上 ${config.above} 層${config.below ? `、地下 ${config.below} 層` : ''}${config.mezzanine ? '、含夾層' : ''}`;
  $('#reportPublicFloors').closest('label').hidden = buildingType(project) === 'townhouse';
  $('#unitSelect').innerHTML = project.units.length ? sortedUnits(project).map(u => `<option value="${esc(u.id)}">${esc(u.code)}${u.address ? ' · ' + esc(u.address) : ''}</option>`).join('') : '<option value="">請先新增戶別</option>';
  $('#unitSelect').value = unitId; renderRecordList(); await renderEditor(); await showView(activeView);
}
async function showView(view) {
  const previous = activeView; activeView = view;
  for (const key of ['case', 'work', 'review', 'report']) $('#' + key + 'View').hidden = key !== view;
  for (const b of document.querySelectorAll('[data-view]')) { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  $('#gotoCase').hidden = !project || view === 'case';
  if (view === 'review') renderReview(); if (view === 'case') await renderBackup();
  if (view === 'report') await reports.render();
  if (view === 'work' && previous !== 'work') { renderRecordList(); await renderEditor(); }
  renderContext();
}
function renderReview() {
  const totalIssues = project.units.reduce((sum, u) => sum + unitIssues(project, u).length, 0);
  $('#reviewSummary').innerHTML = [[project.units.length, '鑑定單元'], [project.records.length, '位置紀錄'], [totalIssues, '待補項目']].map(([n, label]) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`).join('');
  const search = $('#reviewSearch').value.trim().toLocaleLowerCase(), filter = $('#reviewFilter').value;
  const units = project.units.filter(u => (!search || [u.code, u.address, u.building].join(' ').toLocaleLowerCase().includes(search)) && (!filter || filter === 'public' && u.kind === 'public' || u.status === filter));
  const count = Math.max(1, Math.ceil(units.length / 20)); reviewPage = Math.min(reviewPage, count - 1);
  $('#reviewPager').innerHTML = `<button data-review-page="-1" ${reviewPage === 0 ? 'disabled' : ''}>上一頁</button><span>第 ${reviewPage + 1}／${count} 頁 · ${units.length} 戶</span><button data-review-page="1" ${reviewPage + 1 === count ? 'disabled' : ''}>下一頁</button>`;
  $('#reviewList').innerHTML = units.slice(reviewPage * 20, reviewPage * 20 + 20).map(u => {
    const issues = unitIssues(project, u), records = project.records.filter(r => r.unitId === u.id);
    const photos = records.reduce((n, r) => n + r.photos.filter(p => !p.excluded).length, 0), noDate = records.filter(r => !r.observedOn).length, noDetail = records.filter(r => r.photos.length && !r.detail).length;
    return `<section class="panel review-unit"><div class="section-heading"><div><h3>${esc(u.code)} · ${UNIT_KINDS[u.kind || 'residence']}</h3><span class="micro">${esc([u.building, u.address].filter(Boolean).join(' · '))}</span></div><button class="secondary" data-unit-state="${esc(u.id)}">${esc(UNIT_STATES[u.status])}</button></div><p class="micro">${photos} 張可用照片 · ${noDate} 筆日期未確認 · ${noDetail} 筆尚未選細圖</p>${u.reason ? `<p class="modal-note">${esc(u.reason)}</p>` : ''}${u.visitHistory?.length ? `<details><summary>歷次進場（${u.visitHistory.length}）</summary><p class="description">${esc(unitHistoryLabel(project, u))}</p></details>` : ''}${issues.length ? issues.slice(0, 50).map(issue => `<div class="issue-row"><p>${issue.recordId ? esc(recordNumber(project.records.find(r => r.id === issue.recordId))) + ' · ' : ''}${esc(issue.text)}</p><button class="quiet" data-review-record="${esc(issue.recordId || '')}" data-unit="${esc(u.id)}">前往 →</button></div>`).join('') + (issues.length > 50 ? '<p>其餘待補項目請至本戶逐筆核對。</p>' : '') : '<p class="micro">未列出必要欄位待補；請另核對本次範圍、日期、細圖與照片。</p>'}</section>`;
  }).join('') || '<p>此範圍尚無鑑定單元。</p>';
}
async function renderBackup() {
  const oldScope = $('#exportScope').value;
  $('#exportScope').innerHTML = '<option value="">全案</option>' + project.units.map(u => `<option value="${esc(u.id)}">單戶：${esc(u.code)}</option>`).join('');
  if (project.units.some(u => u.id === oldScope)) $('#exportScope').value = oldScope;
  const bytes = project.media.reduce((s, m) => s + m.size, 0); $('#backupSummary').textContent = `${project.units.length} 戶 · ${project.records.length} 筆紀錄 · ${project.media.length} 個原始媒體 · ${size(bytes)}`;
  $('#handoffHistory').hidden = !project.handoffImports?.length;
  const byRecord = new Map(project.records.map(r => [r.id, r]));
  $('#handoffHistoryList').innerHTML = (project.handoffImports || []).map(s => `<li><strong>${esc(s.label)}</strong>：${esc(s.settings.name)} · ${esc(s.settings.date)} · ${s.records.length} 筆<div class="micro">${s.records.map(old => { const r = byRecord.get(old.id); return r ? `原 ${old.fieldNumber || '未編號'} → 現 ${r.fieldNumber}` : '位置已移除'; }).map(esc).join('、')}</div></li>`).join('');
  const state = await backupState(project.id), entry = state.entries[$('#exportScope').value || 'all'];
  $('#exportState').textContent = !entry ? '尚未匯出此範圍。' : entry.revision !== project.revision ? '匯出後案件已有修改，請重新備份。' : entry.verifiedAt ? '已匯入本版本的接收端核對收據。' : '已產生備份檔；待接收端開啟核對。';
  const estimate = await navigator.storage?.estimate?.();
  $('#storageInfo').textContent = estimate ? `此網站已用 ${size(estimate.usage || 0)}，估計配額 ${size(estimate.quota || 0)}。${await navigator.storage?.persisted?.() ? '已取得持續保存。' : '尚未取得持續保存。'}` : '此瀏覽器無法提供空間估計；請定期匯出備份。';
}

const CASE_TYPE_HELP = { townhouse: '每個門牌一戶，一戶跨樓層；現場以樓層快選鍵填樓層。', apartment: '一層一戶：建立時依地上層數自動建立各樓層戶別與一個公設單元，紀錄自動帶入樓層。', tower: '每層多戶、可多棟：填棟別會為每棟建立一個公設單元；戶別可用名冊匯入並帶固定樓層。', other: '不預設戶別結構，樓層與空間仍提供快選。' };
function caseFormFields(p) {
  const config = floorConfig(p);
  return `<label>案件型態<select name="type">${opts(BUILDING_TYPES)}</select></label><p id="caseTypeHelp" class="micro"></p><div class="two-col"><label>地上層數<input name="above" type="number" min="1" max="99" step="1" inputmode="numeric" required value="${config.above}"></label><label>地下層數<input name="below" type="number" min="0" max="9" step="1" inputmode="numeric" required value="${config.below}"></label></div><label class="check-label"><input name="mezzanine" type="checkbox" ${config.mezzanine ? 'checked' : ''}>有夾層（MF）</label><label class="check-label"><input name="photoStamp" type="checkbox" ${p?.photoStamp === false ? '' : 'checked'}>照片壓年月日戳記（只壓在附件與副本，原圖不變）</label>`;
}
function bindCaseTypeHelp(form) {
  const update = () => { const type = form.querySelector('[name=type]').value; form.querySelector('#caseTypeHelp').textContent = CASE_TYPE_HELP[type]; const b = form.querySelector('#buildingsField'); if (b) b.hidden = type !== 'tower'; };
  form.querySelector('[name=type]').onchange = update; update();
}
function readCaseForm(form) {
  const data = new FormData(form), above = Number(data.get('above')), below = Number(data.get('below'));
  assert(Number.isSafeInteger(above) && above >= 1 && above <= 99 && Number.isSafeInteger(below) && below >= 0 && below <= 9, '層數須為整數：地上 1～99、地下 0～9');
  assert(Object.hasOwn(BUILDING_TYPES, data.get('type')), '請選擇案件型態');
  return { code: data.get('code').trim(), name: data.get('name').trim(), date: data.get('date'), type: data.get('type'), config: { above, below, mezzanine: data.has('mezzanine') }, photoStamp: data.has('photoStamp'), buildings: [...new Set(String(data.get('buildings') || '').split(/[,，、\s]+/).map(x => x.trim()).filter(Boolean))] };
}
function caseDialog() {
  requireNoRecording();
  openModal('建立案件', `<form id="caseForm"><label>案號<input name="code" required maxlength="100" placeholder="公司或公會案號"></label><label>案件名稱<input name="name" required maxlength="180" placeholder="本次現況鑑定名稱"></label><label>本次會勘日期<input name="date" type="date" required value="${localDate()}"></label>${caseFormFields({ floorConfig: { above: 5, below: 0, mezzanine: false } })}<label id="buildingsField" hidden>棟別（以逗號分隔，選填）<input name="buildings" maxlength="500" placeholder="例如 A棟, B棟"></label><p class="modal-note">只在此裝置建立案件，不會上傳照片或住戶資料。型態與層數之後可在「案件設定」修改，戶別可增減。</p><div class="modal-actions"><button class="primary" type="submit">建立案件</button></div></form>`);
  bindCaseTypeHelp($('#caseForm'));
  $('#caseForm').onsubmit = e => { e.preventDefault(); action(async () => {
    const form = readCaseForm(e.target), created = newProject(form.code, form.name, form.date);
    created.buildingType = form.type; created.floorConfig = form.config; created.photoStamp = form.photoStamp;
    if (form.type === 'apartment') created.units.push(...apartmentUnits(form.config));
    if (form.type === 'tower') for (const b of form.buildings) created.units.push({ ...newUnit(`${b}公設`), building: b, kind: 'public' });
    await saveProject(created, 0); closeModal(true); await selectProject(created.id); toast(created.units.length ? `案件已建立，已自動建立 ${created.units.length} 個單元` : '案件已建立，請新增第一戶');
  }); };
}
function caseSettingsDialog() {
  requireNoRecording(); assert(project, '請先建立案件');
  openModal('案件設定', `<form id="caseForm"><label>案號<input name="code" required maxlength="100" value="${esc(project.code)}"></label><label>案件名稱<input name="name" required maxlength="180" value="${esc(project.name)}"></label><label>原案會勘日期<input name="date" type="date" required value="${esc(project.date)}"></label>${caseFormFields(project)}<p class="micro">修改型態與層數只影響樓層與空間快選；既有紀錄與戶別不變，公寓不會重新自動建戶，請用「＋ 戶別」補建。</p><div class="modal-actions"><button class="primary" type="submit">保存設定</button></div></form>`);
  $('#caseForm [name=type]').value = buildingType(project); bindCaseTypeHelp($('#caseForm'));
  $('#caseForm').onsubmit = e => { e.preventDefault(); action(async () => {
    const form = readCaseForm(e.target); assert(form.code && form.name && validDate(form.date), '案號、名稱或日期不正確');
    await commit(next => { next.code = form.code; next.name = form.name; next.date = form.date; next.buildingType = form.type; next.floorConfig = form.config; next.photoStamp = form.photoStamp; });
    closeModal(true); await render(); toast('案件設定已保存');
  }); };
}
function unitDialog(editId = '') {
  requireNoRecording(); assert(project, '請先建立案件');
  const u = project.units.find(x => x.id === editId);
  openModal(u ? '戶別與本次進場情形' : '新增鑑定戶', `<form id="unitForm"><label>鑑定戶編號／名稱<input name="code" required maxlength="150" value="${esc(u?.code || '')}" placeholder="例如 001、A 棟公設"></label><label>地址<input name="address" maxlength="500" value="${esc(u?.address || '')}" placeholder="可於此核對實際門牌"></label>${u ? `<label>本次狀態<select name="status">${opts(UNIT_STATES)}</select></label><label>未完成範圍／無法入內原因<textarea name="reason" maxlength="10000" rows="3">${esc(u.reason)}</textarea></label><p class="micro">部分完成或無法入內請留下原因；完成狀態只表示本次紀錄進度。</p>` : ''}<div class="modal-actions"><button class="primary" type="submit">${u ? '保存戶況' : '新增戶別'}</button></div></form>`);
  if (u) $('#unitForm [name=status]').value = u.status;
  const fields = document.createElement('div'); fields.className = 'two-col'; fields.innerHTML = `<label>棟別／群組<input name="building" maxlength="100" value="${esc(u?.building || '')}"></label><label>鑑定單元<select name="kind">${opts(UNIT_KINDS)}</select></label><label>固定樓層（公寓／大樓，選填）<input name="floor" maxlength="100" value="${esc(u?.floor || '')}" placeholder="例如 3F；新紀錄自動帶入，可改"></label>`; $('#unitForm').prepend(fields); $('#unitForm [name=kind]').value = u?.kind || 'residence';
  const visit = organisation.visit, history = u?.visitHistory?.find(h => h.visitId === visit?.id);
  if (u && visit) {
    $('#unitForm [name=status]').value = history?.status || 'open'; $('#unitForm [name=reason]').value = history?.reason || '';
    const visitFields = document.createElement('div'); visitFields.innerHTML = `<p>本次批次：${esc(visit.name)}（${visit.start}～${visit.end}）</p><label>本戶實際進場日期<input type="date" name="visitDate" value="${esc(history?.date || '')}"></label><label>本次已觀察／未完成範圍<input name="visitScope" maxlength="1000" value="${esc(history?.scope || '')}"></label><details><summary>歷次進場紀錄</summary><p>${esc(unitHistoryLabel(project, u) || '尚無歷次紀錄')}</p></details>`; $('#unitForm .modal-actions').before(visitFields);
  }
  $('#unitForm').onsubmit = e => {
    e.preventDefault(); const data = new FormData(e.target), code = data.get('code').trim();
    action(async () => {
      assert(!project.units.some(x => x.id !== editId && x.code === code), '此案件已有相同戶別編號');
      let chosen = u?.id;
      await commit(next => {
        if (!u) { const item = { ...newUnit(code, data.get('address')), building: data.get('building').trim(), kind: data.get('kind'), floor: data.get('floor').trim() }; chosen = item.id; next.units.push(item); }
        else {
          const item = next.units.find(x => x.id === editId); item.code = code; item.address = data.get('address').trim(); item.status = data.get('status'); item.reason = data.get('reason').trim();
          item.building = data.get('building').trim(); item.kind = data.get('kind'); item.floor = data.get('floor').trim();
          assert(!['partial', 'inaccessible'].includes(item.status) || item.reason, '請補上未完成／無法入內原因');
          if (item.status === 'complete') assert(unitIssues(visit ? { ...next, records: next.records.filter(r => r.visitId === visit.id) } : next, item).length === 0, '本戶仍有待補項目。請補齊，或選擇部分完成並記錄範圍。');
          if (visit) { item.visitHistory ??= []; const h = { visitId: visit.id, date: data.get('visitDate'), scope: data.get('visitScope').trim(), status: item.status, reason: item.reason }; const i = item.visitHistory.findIndex(h => h.visitId === visit.id); if (i < 0) item.visitHistory.push(h); else item.visitHistory[i] = h; const latest = latestUnitHistory(next, item); item.status = latest.status; item.reason = latest.reason; }
        }
      });
      unitId = chosen; if (!u) recordId = ''; closeModal(true); await render(); toast('戶別已保存');
    });
  };
}
async function addRecord() {
  requireNoRecording(); assert(unitId, '請先新增或選擇鑑定戶');
  const previous = currentRecord(), r = newRecord(unitId, previous?.floor || currentUnit()?.floor || '', previous?.space || '');
  const visit = organisation.visit; r.visitId = visit?.id || ''; r.observedOn = visit?.start === visit?.end ? visit?.start || '' : '';
  await commit(next => { next.records.push(r); markUnitOpen(next, r); }); recordId = r.id; await render();
  // Run after action() releases inert; focusing an input here opens the phone keyboard
  // and can scroll past the new position's heading.
  requestAnimationFrame(() => {
    if (recordId !== r.id || activeView !== 'work') return;
    const heading = $('#recordHeading');
    heading.focus({ preventScroll: true });
    const top = window.scrollY + heading.getBoundingClientRect().top - $('#contextStrip').getBoundingClientRect().height - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  });
}
// Quick choices come from the case type and the unit kind; free text stays allowed.
function renderChips(r) {
  const spaces = spaceOptions(project, currentUnit());
  const chip = (attr, value, pressed) => `<button type="button" data-${attr}="${esc(value)}" aria-pressed="${pressed}">${esc(value)}</button>`;
  $('#floorChips').innerHTML = floorOptions(project).map(f => chip('floor', f, f === r.floor)).join('');
  $('#spaceChips').innerHTML = spaces.main.map(s => chip('space', s, s === r.space)).join('') + '<span class="chip-divider" aria-hidden="true"></span>' + spaces.exterior.map(s => chip('space', s, s === r.space)).join('');
}
async function addAddressRecord() {
  requireNoRecording(); assert(unitId, '請先新增或選擇鑑定戶');
  const u = currentUnit(), r = newRecord(unitId, u?.floor || '1F', '外觀');
  Object.assign(r, { location: '門牌', component: '外觀', components: ['外觀'], condition: 'normal', conditions: ['normal'] });
  const visit = organisation.visit; r.visitId = visit?.id || ''; r.observedOn = visit?.start === visit?.end ? visit?.start || '' : '';
  await commit(next => { next.records.push(r); markUnitOpen(next, r); }); recordId = r.id; await render(); toast('已建立門牌外觀紀錄，請拍門牌與外觀'); $('#takePhoto').focus();
}
async function nextUnit() {
  requireNoRecording(); const order = sortedUnits(project), index = order.findIndex(u => u.id === unitId);
  assert(order.length, '尚無戶別'); if (index >= order.length - 1) { toast('已是最後一戶'); return; }
  unitId = order[index + 1].id; recordId = project.records.find(r => r.unitId === unitId)?.id || ''; await render(); toast(`已切換至 ${order[index + 1].code}`);
}
async function prepareAsset(file, kind, source) {
  assert(file.size > 0 && file.size <= 60 * 1024 * 1024, `${file.name || '媒體'}：單一檔案須小於 60 MB`);
  const ext = (file.name || '').split('.').at(-1).toLowerCase();
  const imageTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
  let type = file.type || imageTypes[ext];
  if (kind !== 'audio') assert(Object.values(imageTypes).includes(type), '照片支援 JPEG、PNG、WebP、HEIC／HEIF；位置圖請使用可預覽的圖片');
  else assert(/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)(;|$)/.test(type), '不支援此錄音格式');
  const mediaId = id(), metadata = { id: mediaId, name: file.name || `現場錄音-${Date.now()}`, type, size: file.size, sha256: await sha256(file), kind, source, importedAt: now(), fileModifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null };
  const asset = { id: mediaId, blob: file.slice(0, file.size, type) };
  if (kind !== 'audio') {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; });
      metadata.width = img.naturalWidth; metadata.height = img.naturalHeight;
      const canvas = document.createElement('canvas'), scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight)); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); asset.thumb = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .8));
    } catch { metadata.previewUnavailable = true; } finally { URL.revokeObjectURL(url); }
  }
  // The date is recorded with its source; the stamp drawn on copies is derived from it and stays editable.
  let capture = { on: '', source: '' };
  if (kind === 'image') {
    if (source === 'camera-preview') capture = { on: localDateOf(new Date()), source: 'camera' };
    else {
      let exif = '';
      if (type === 'image/jpeg') { try { exif = exifDate(await file.slice(0, 262144).arrayBuffer()); } catch { exif = ''; } }
      capture = exif ? { on: exif, source: 'exif' } : file.lastModified ? { on: localDateOf(file.lastModified), source: 'file' } : { on: '', source: '' };
    }
  }
  return { metadata, asset, capture };
}
function cameraDialog() {
  requireNoRecording(); assert(currentRecord(), '請先新增位置紀錄');
  const context = { projectId: project.id, recordId, source: 'camera-preview' };
  let stream = null, disposed = false, request = 0, shot = null, shotURL = null, facing = 'environment';
  const stop = () => { request++; stream?.getTracks().forEach(track => track.stop()); stream = null; };
  const pause = () => { stop(); if (!disposed) { video.srcObject = null; shutter.disabled = true; start.disabled = false; start.hidden = !!shot; status.textContent = shot ? '照片尚未保存' : '相機已暫停，返回後請重新啟用'; } };
  const hidden = () => { if (document.hidden) pause(); };
  openModal('現場拍照', '<p id="cameraPermission">點選「同意並啟用相機」，再於瀏覽器提示選擇「允許」。鏡頭只用於本次拍照，不會自動上傳。</p><div class="camera-stage"><video id="cameraPreview" autoplay muted playsinline></video><img id="cameraShot" alt="待保存的照片" hidden></div><p id="cameraStatus" role="status">相機尚未啟用</p><button id="startCamera" class="primary full">同意並啟用相機</button><div class="camera-actions"><button id="switchCamera" class="secondary">切換前／後鏡頭</button><button id="shutter" class="primary" disabled>◎ 拍攝</button><button id="retakeCamera" class="secondary" hidden>重拍</button><button id="saveCamera" class="secondary" hidden>保存這張照片</button><button id="saveCameraNext" class="primary" hidden>保存照片 → 標示方向</button></div><p class="micro">若未出現權限提示，請到瀏覽器的網站設定開啟相機；從 LINE 等程式開啟時，可改用 Safari／Chrome 開啟本頁。也可改用下方的系統相機。</p><button id="nativeCamera" class="text-button">改用系統相機／選檔</button>', () => { disposed = true; stop(); video.srcObject = null; if (shotURL) URL.revokeObjectURL(shotURL); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', pause); });
  $('#modal').dataset.mode = 'camera';
  const cameraControls = document.createElement('div'); cameraControls.className = 'camera-controls';
  for (const child of [...$('#modalBody').children]) if (!child.classList.contains('camera-stage')) cameraControls.append(child);
  $('#modalBody').append(cameraControls);
  const cameraHelp = document.createElement('details'); cameraHelp.innerHTML = '<summary>相機使用說明</summary>';
  for (const paragraph of [...cameraControls.querySelectorAll('p.micro')]) cameraHelp.append(paragraph); cameraControls.append(cameraHelp);
  const video = $('#cameraPreview'), status = $('#cameraStatus'), start = $('#startCamera'), shutter = $('#shutter'), preview = $('#cameraShot');
  document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', pause);
  async function enable() {
    stop(); const token = request; start.disabled = true; shutter.disabled = true; status.textContent = '等待相機權限；請在瀏覽器提示選擇允許。可隨時關閉此視窗。';
    try {
      assert(isSecureContext && navigator.mediaDevices?.getUserMedia, '此開啟方式無法使用鏡頭預覽，請用 HTTPS 網址在 Safari／Chrome 開啟，或改用系統相機');
      const incoming = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 }, aspectRatio: { ideal: 4 / 3 } } });
      if (disposed || token !== request) { incoming.getTracks().forEach(track => track.stop()); return; }
      stream = incoming; video.srcObject = stream; video.muted = true; await video.play();
      if (disposed || token !== request) return;
      if (!video.videoWidth) await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('鏡頭沒有傳回畫面，請重試或改用系統相機')), 8000); video.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true }); });
      if (disposed || token !== request) return;
      $('#cameraPermission').hidden = true; start.hidden = true;
      shutter.disabled = false; status.textContent = `鏡頭已啟用 · ${video.videoWidth} × ${video.videoHeight} · 對準後點拍攝`;
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => { if (!disposed && stream?.getTracks().includes(track)) { stop(); video.srcObject = null; shutter.disabled = true; start.disabled = false; start.hidden = false; status.textContent = '相機已中斷，請重新啟用'; } });
    } catch (e) {
      if (disposed || token !== request) return;
      stop(); video.srcObject = null; start.hidden = false;
      status.textContent = e.name === 'NotAllowedError' ? '尚未取得相機權限。請在瀏覽器網站設定將相機改為允許，再點下方重新啟用。' : e.name === 'NotFoundError' ? '找不到可用相機，請確認裝置鏡頭或改用系統相機。' : e.name === 'NotReadableError' ? '相機可能正被其他程式使用，請關閉其他拍攝程式後重試。' : e.message || '相機啟用失敗，請重試或改用系統相機。';
    } finally { if (!disposed && !shot) { start.disabled = false; start.textContent = stream ? '重新啟用相機' : '同意並啟用相機'; } }
  }
  start.onclick = enable;
  $('#switchCamera').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; if (stream) enable(); else status.textContent = `已選${facing === 'environment' ? '後' : '前'}鏡頭，請點同意並啟用相機`; };
  shutter.onclick = async () => {
    if (!stream || !video.videoWidth || shutter.disabled) return;
    shutter.disabled = true;
    try {
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('拍攝失敗，請重試')), 'image/jpeg', .96));
      if (disposed) return;
      shot = new File([blob], `現場拍照-${Date.now()}.jpg`, { type: 'image/jpeg' }); stop(); video.srcObject = null;
      shotURL = URL.createObjectURL(shot); preview.src = shotURL; preview.hidden = false; video.hidden = true; modalDirty = true;
      start.hidden = shutter.hidden = $('#switchCamera').hidden = $('#nativeCamera').hidden = true; $('#retakeCamera').hidden = $('#saveCamera').hidden = $('#saveCameraNext').hidden = false;
      status.textContent = `待保存 · ${canvas.width} × ${canvas.height}。確認清晰後保存，或重拍。`;
    } catch (e) { if (!disposed) { status.textContent = e.message; shutter.disabled = false; } }
  };
  $('#retakeCamera').onclick = () => { if (shotURL) URL.revokeObjectURL(shotURL); shotURL = shot = null; modalDirty = false; preview.removeAttribute('src'); preview.hidden = true; video.hidden = false; start.hidden = shutter.hidden = $('#switchCamera').hidden = $('#nativeCamera').hidden = false; $('#retakeCamera').hidden = $('#saveCamera').hidden = $('#saveCameraNext').hidden = true; enable(); };
  $('#saveCamera').onclick = () => action(async () => { assert(shot, '請先拍攝照片'); await addPhotos([shot], context); closeModal(true); }, '保存拍攝照片');
  $('#saveCameraNext').onclick = () => action(async () => { assert(shot, '請先拍攝照片'); const ids = await addPhotos([shot], context); closeModal(true); const r = project.records.find(r => r.id === context.recordId); assert(r && r.photos.some(p => p.mediaId === ids[0]), '照片位置已變更，請重新選取'); recordId = r.id; unitId = r.unitId; activeView = 'work'; await render(); await planEntry(false, ids[0]); }, '保存拍攝照片');
  $('#nativeCamera').onclick = () => { closeModal(true); capture('camera'); };
}
function capture(source) {
  requireNoRecording(); assert(currentRecord(), '請先新增位置紀錄');
  pendingCapture = { projectId: project.id, recordId, source };
  $(source === 'camera' ? '#cameraInput' : '#galleryInput').click();
}
async function addPhotos(files, context) {
  assert(context && project?.id === context.projectId && project.records.some(r => r.id === context.recordId), '拍照時的案件或位置已改變，照片尚未歸戶，請回原位置重新選取');
  const errors = [], added = []; let saved = 0;
  for (const [i, file] of files.entries()) {
    busyText(`保存原始照片 ${i + 1} / ${files.length}`);
    try {
      const { metadata, asset, capture } = await prepareAsset(file, 'image', context.source);
      const existing = project.media.find(m => m.sha256 === metadata.sha256 && project.records.find(r => r.id === context.recordId).photos.some(p => p.mediaId === m.id));
      if (existing) { errors.push(`${file.name}：此位置已有相同檔案`); continue; }
      await commit(next => { next.media.push(metadata); const r = next.records.find(x => x.id === context.recordId); r.photos.push({ mediaId: metadata.id, role: r.photos.length ? 'close' : 'overview', caption: '', marks: [], excluded: false, excludedReason: '', capturedOn: capture.on, captureSource: capture.source, stamp: defaultStamp(capture.on, capture.source), stampHidden: false }); applyPhotoDate(next, r, capture.on); markUnitOpen(next, r); }, [asset]); saved++; added.push(metadata.id);
    } catch (e) { if (e.name === 'RevisionConflictError') { e.message = `${file.name} 尚未保存；已暫留原檔供另存副本，其餘照片請在副本重新加入。${e.message}`; throw e; } errors.push(`${file.name}：${e.message || '儲存失敗'}`); }
  }
  await render(); if (saved) toast(`${saved} 張原始照片已保存於本機`);
  if (errors.length) throw new Error(`已保存 ${saved} 張；其餘 ${errors.length} 張未新增：${errors.slice(0, 5).join('；')}`);
  return added;
}
async function renderLocationCard(stage, r, onEdit = () => action(() => planEntry()), photo = null) {
  const position = photo ? photoPlacement(r, photo) : r.placement;
  const plan = project.plans.find(p => p.id === position?.planId);
  stage.innerHTML = `<strong>${esc(recordNumber(r))} · ${esc(r.floor || '未填樓層')} · 位置核對</strong><p class="micro">${plan ? esc(plan.title) + ' · 圓點是拍攝點，箭頭是拍攝方向。' : '尚未定位。可引用本戶同樓層的共用圖面。'}</p>${plan ? '<div class="location-thumbnail"></div>' : ''}<button type="button" class="secondary location-edit">${plan ? '核對／調整位置' : '引用圖面並定位'}</button><p class="micro">照片預設沿用本筆拍攝位置；遠近照片可各自調整機位，不需重建狀況紀錄。</p>`;
  stage.querySelector('.location-edit').onclick = onEdit;
  if (!photo) { const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary'; b.textContent = r.observationPin ? '核對狀況位置點' : '標示狀況位置點'; b.onclick = () => action(() => planDialog('', '', true)); stage.append(b); }
  if (plan) await planPreview(stage.querySelector('.location-thumbnail'), await mediaURL(plan.mediaId, true), [{ placement: position, label: planLabel(r) }]);
  const pinPlan = project.plans.find(p => p.id === r.observationPin?.planId);
  if (!photo && pinPlan) { const div = document.createElement('div'); div.className = 'location-thumbnail'; stage.append(div); await planPreview(div, await mediaURL(pinPlan.mediaId, true), [{ placement: r.observationPin, kind: 'observation', label: planLabel(r) }]); }
}
function assertPlanContext(context) {
  assert(context && project?.id === context.projectId && unitId === context.unitId && project.units.some(u => u.id === context.unitId), '圖面原先的案件或戶別已變更，請重新選取');
  if (context.recordId) assert(recordId === context.recordId && currentRecord()?.floor === context.floor, '位置紀錄或樓層已變更，請重新選取');
  assert(context.floor?.trim(), '請指定圖面樓層');
}
async function afterPlanSaved(plan, context) {
  closeModal(true); renderRecordList();
  if (context.recordId) { await planDialog(plan.id, context.photoId || '', context.observation || false); toast('圖面已保存，請標拍攝點及方向'); }
  else { await planLibrary(plan.floor, plan.id); toast('共用圖面已保存；可繼續建圖或新增位置紀錄'); }
}
async function planLibrary(floor = currentRecord()?.floor || '', preferred = '') {
  assert(currentUnit(), '請先新增戶別');
  const context = { projectId: project.id, unitId, recordId: null }, plans = project.plans.filter(p => p.unitId === unitId);
  openModal('本戶共用平面圖庫', `<p class="micro">${esc(currentUnit().code)}。先繞看整體，畫出房間、入口、樓梯與固定參照物；再建立各位置紀錄引用。每層或範圍太大的區域可另建一張。</p><label>新圖面樓層<input id="libraryFloor" list="floors" maxlength="100" value="${esc(floor)}" placeholder="例如 1F、2F、RF"></label><div class="plan-actions"><button id="libraryImport" class="secondary">匯入平面圖</button><button id="librarySketch" class="primary">＋ 先畫平面圖</button><button id="libraryStandardFloor" class="secondary" ${plans.length ? '' : 'disabled'}>套用標準層／其他樓層圖面</button></div><p class="micro">可匯入 JPG、PNG、WebP，包含紙本草圖照片。樓層名稱需與位置紀錄一致。</p><div id="planLibraryList">${plans.length ? plans.map(p => `<article class="library-plan ${p.id === preferred ? 'latest-plan' : ''}"><strong>${esc(p.floor)} · ${esc(p.title)}</strong><p class="micro">${project.records.filter(r => r.placement?.planId === p.id || r.observationPin?.planId === p.id || r.photos.some(photo=>photo.placement?.planId===p.id)).length} 筆位置引用${p.sketch ? ' · 現場簡圖，未按比例' : ''}</p><div class="library-preview" data-plan-preview="${esc(p.id)}"></div><div class="plan-actions"><button data-plan-template="${esc(p.id)}" class="secondary">當作標準層套用</button><button data-plan-overview="${esc(p.id)}" class="secondary">放大／查看引用位置</button>${p.sketch ? `<button data-library-edit="${esc(p.id)}" class="quiet">編輯簡圖副本</button>` : ''}</div></article>`).join('') : '<p>尚無圖面。可先建圖，不需新增位置紀錄或照片。</p>'}</div><div class="modal-actions"><button id="finishLibrary" class="primary">完成建圖，返回紀錄</button></div>`);
  const prepare = () => { const ctx = { ...context, floor: $('#libraryFloor').value.trim() }; assertPlanContext(ctx); return ctx; };
  $('#libraryImport').onclick = () => { try { pendingPlan = prepare(); $('#planInput').click(); } catch (e) { toast(e.message); $('#libraryFloor').focus(); } };
  $('#librarySketch').onclick = () => action(() => sketchDialog(null, prepare()));
  $('#libraryStandardFloor').onclick = () => action(() => standardFloorDialog({ ...context, floor: $('#libraryFloor').value.trim() }));
  $('#finishLibrary').onclick = () => closeModal(true);
  $('#planLibraryList').onclick = e => { const template = e.target.closest('[data-plan-template]'); if (template) return action(() => standardFloorDialog({ ...context, floor: $('#libraryFloor').value.trim() }, template.dataset.planTemplate)); const overview = e.target.closest('[data-plan-overview]'), edit = e.target.closest('[data-library-edit]'); const plan = plans.find(p => p.id === (overview?.dataset.planOverview || edit?.dataset.libraryEdit)); if (!plan) return; action(() => overview ? planOverview(plan) : sketchDialog(plan, { ...context, floor: plan.floor })); };
  for (const plan of plans) {
    const stage = $(`[data-plan-preview="${plan.id}"]`); if (!stage) return;
    await planPreview(stage, await mediaURL(plan.mediaId, true));
  }
}
async function planOverview(plan) {
  const records = project.records.filter(r => r.placement?.planId === plan.id || r.observationPin?.planId === plan.id || r.photos.some(p => p.placement?.planId === plan.id));
  openModal('平面位置總覽', `<h3>${esc(currentUnit().code)} · ${esc(plan.floor)} · ${esc(plan.title)}</h3><p class="micro">先核對入口、樓梯、房間相對位置及方向；再對照各紀錄編號。箭頭表示拍攝方向，不代表裂隙方向。</p><div id="overviewPlan"></div><div class="choice-chips">${records.map(r => `<button data-location-record="${esc(r.id)}">${esc(recordNumber(r))} · ${esc(r.space || '未填空間')}</button>`).join('') || '<p>尚無紀錄引用；建圖完成後可返回新增位置紀錄。</p>'}</div><p class="micro">圖面修訂會另存副本；既有紀錄仍引用原圖，須逐筆確認後改選新版並重新標箭頭。</p><button id="backToLibrary" class="secondary">返回平面圖庫</button>`);
  $('#backToLibrary').onclick = () => action(() => planLibrary(plan.floor, plan.id));
  for (const b of $('#modalBody').querySelectorAll('[data-location-record]')) b.onclick = () => action(async () => { requireNoRecording(); recordId = b.dataset.locationRecord; closeModal(true); await render(); });
  await planPreview($('#overviewPlan'), await mediaURL(plan.mediaId, true), records.flatMap(r => [{ placement: r.placement, label: planLabel(r) }, { placement: r.observationPin, kind: 'observation', label: planLabel(r) }, ...r.photos.filter(p => p.placement).map(p => ({ placement: p.placement, label: $('#fieldLabels').checked ? `${recordNumber(r)} ${ROLES[p.role]}` : '' }))]).filter(x => x.placement?.planId === plan.id));
}
async function standardFloorDialog(context, preferred = '') {
  assert(project?.id === context.projectId && unitId === context.unitId, '圖面案件或戶別已變更');
  const sources = project.plans.filter(p => p.unitId === context.unitId); assert(sources.length, '請先建立一張來源圖面');
  const initial = sources.find(p => p.id === preferred) || sources.find(p => p.floor !== context.floor) || sources[0];
  let previewToken = 0, disposed = false;
  openModal('套用標準層圖面', `<p>選一張已畫好的圖面作為標準層，套用到相似樓層後可分別修改。</p><label>標準層來源<select id="standardSource">${sources.map(p=>`<option value="${esc(p.id)}">${esc(p.floor)} · ${esc(p.title)}${p.sketch ? '（可編輯簡圖）' : '（圖片）'}</option>`).join('')}</select></label><label>套用到樓層<input id="standardFloor" list="floors" maxlength="100" value="${esc(context.floor || '')}" ${context.recordId ? 'readonly' : ''} placeholder="例如 2F"></label><label>新圖面名稱<input id="standardTitle" maxlength="150" value="${esc((context.floor || '') + ' 平面圖')}" placeholder="例如 2F 平面圖"></label><div id="standardPreview" class="library-preview"></div><p id="standardHint" class="micro"></p><p class="micro">請核對圖中文字、入口、門窗與樓梯配置。各樓層的拍攝位置與箭頭需分別標示；修改此層圖面時，來源圖面仍保留。</p><div class="modal-actions"><button id="standardApply" class="secondary">直接套用</button><button id="standardEdit" class="primary">套用並修改簡圖</button><button id="standardCancel" class="quiet">返回</button></div>`, () => { disposed=true; previewToken++; });
  $('#standardSource').value = initial.id;
  const refresh = async () => { const token=++previewToken, source=sources.find(p=>p.id===$('#standardSource').value); $('#standardEdit').hidden=!source.sketch; $('#standardHint').textContent=source.sketch ? '牆線、門窗、樓梯及文字都可在套用後修改。' : '圖片可直接套用；圖片內的牆線尚不能逐段編輯。'; const url=await mediaURL(source.mediaId,true);if(!disposed&&token===previewToken&&$('#standardPreview'))await planPreview($('#standardPreview'),url); };
  $('#standardSource').onchange = () => action(refresh);
  $('#standardFloor').oninput = () => { if (!$('#standardTitle').dataset.edited) $('#standardTitle').value = `${$('#standardFloor').value.trim()} 平面圖`; };
  $('#standardTitle').oninput = () => { $('#standardTitle').dataset.edited = 'true'; };
  const prepare = () => { const next={...context,floor:$('#standardFloor').value.trim(),copyTitle:$('#standardTitle').value.trim(),standardFloor:true};assertPlanContext(next);assert(next.copyTitle,'請填寫新圖面名稱');const source=project.plans.find(p=>p.id===$('#standardSource').value&&p.unitId===next.unitId);assert(source,'標準層來源已變更');return{source,next}; };
  $('#standardEdit').onclick = () => action(() => { const {source,next}=prepare();assert(source.sketch,'請選擇可編輯簡圖');sketchDialog(source,next); });
  $('#standardApply').onclick = () => action(async () => { const {source,next}=prepare(), original=await getMedia(source.mediaId);assert(original?.blob,'來源圖面原檔遺失');const file=new File([original.blob],`${next.copyTitle}.${original.blob.type==='image/jpeg'?'jpg':original.blob.type==='image/webp'?'webp':'png'}`,{type:original.blob.type}),{metadata,asset}=await prepareAsset(file,'plan','standard-floor');assert(!metadata.previewUnavailable,'來源圖面無法預覽，請核對原檔');const plan=planTemplateCopy(source,{unitId:next.unitId,floor:next.floor,title:next.copyTitle,mediaId:metadata.id});await commit(p=>{p.media.push(metadata);p.plans.push(plan);},[asset]);await afterPlanSaved(plan,next); });
  $('#standardCancel').onclick = () => action(() => context.recordId ? planDialog('',context.photoId || '',context.observation || false) : planLibrary(context.floor));
  await refresh();
}
function fieldDetailStatus(r) { return r.detail ? (r.detail.kind === 'text' ? detailLabel(r.detail) : `已保存細圖 · ${r.detail.marks.length} 筆標記`) : '尚未建立細部示意圖'; }
function renderFieldDetailCard(stage, r) {
  stage.innerHTML = `<strong>本筆細部示意圖</strong><p class="micro">${esc(fieldDetailStatus(r))}。本筆遠拍、近拍共用，附件同步引用。</p>${detailContextHTML(r, esc)}<div class="choice-chips"><button type="button" class="primary" data-field-detail="${esc(r.id)}">${r.detail ? '查看／補畫細圖' : '＋ 畫細部示意圖'}</button>${r.photos.length ? `<button type="button" class="secondary" data-latest-photo="${esc(r.photos.at(-1).mediaId)}">最近照片：核對方向 → 細圖</button>` : ''}</div>`;
  stage.querySelector('[data-field-detail]').onclick = () => action(() => editRecordDetail(r.id));
  const latest = stage.querySelector('[data-latest-photo]'); if(latest) latest.onclick = () => action(() => planEntry(false, latest.dataset.latestPhoto));
}
async function editRecordDetail(rid, origin = 'field', photoId = '') {
  requireNoRecording(); const r = project.records.find(r => r.id === rid); assert(r, '找不到原位置紀錄');
  const unit = project.units.find(u => u.id === r.unitId), photo = photoId ? r.photos.find(p => p.mediaId === photoId) : null;
  assert(!photoId || photo, '照片已不在此位置紀錄，請重新選取');
  const label = [unit?.code, r.floor, r.space, recordNumber(r), photo ? `照片 ${r.photos.indexOf(photo) + 1} · ${ROLES[photo.role]}` : '本筆照片共用'].filter(Boolean).join(' · ');
  await openDetailEditor({ $, getProject: () => project, getMedia, action, commit, openModal, closeModal, prepareAsset, download, esc, contextLabel: label, setDirty: value => { modalDirty = value; }, render: async () => {
    if(origin === 'report') await reports.render();
    else { recordId = rid; unitId = r.unitId; activeView = 'work'; await render(); toast('細圖已保存至本筆狀況，附件同步引用；可繼續拍照。'); }
  } }, rid);
}
async function photoDialog(mediaId) {
  const targetRecord = recordId, photo = currentRecord().photos.find(p => p.mediaId === mediaId), metadata = project.media.find(m => m.id === mediaId), asset = await getMedia(mediaId);
  let annotator = null;
  openModal('照片圈註', `<div class="annotation-tools"><label>照片用途<select id="photoRole">${opts(ROLES)}</select></label><label>標記文字<input id="markText" maxlength="120" placeholder="選文字工具後點圖面"></label></div><div class="annotation-toolbar" id="photoTools"><button data-mode="circle" class="selected">圈選</button><button data-mode="arrow">箭頭</button><button data-mode="pen">畫線</button><button data-mode="text">文字</button><button data-mode="view">查看</button><button data-tone="red" class="selected">紅</button><button data-tone="blue">藍</button><button id="undoMark">復原</button></div><div id="conditionLabels" class="choice-chips" aria-label="現況文字快捷註記">${recordConditions(currentRecord()).filter(c => c !== 'normal').map(c => `<button data-condition-label="${c}">${esc(CONDITIONS[c])}</button>`).join('')}</div><p class="micro">同張照片可分別圈註多種現況。點現況文字，再點照片放置；細節或量尺不清楚時再補拍。</p><div id="photoStage" class="annotation-stage"></div><label>照片說明<input id="photoCaption" maxlength="1000" value="${esc(photo.caption)}" placeholder="可補充拍攝細節"></label><div class="two-col" style="margin-top:12px"><label>日期戳記（壓在附件與副本上）<input id="photoStamp" maxlength="40" value="${esc(photo.stamp || '')}" placeholder="例如 2026-09-19"></label><label class="check-label"><input id="photoStampHidden" type="checkbox" ${photo.stampHidden ? 'checked' : ''}>這張不壓戳記</label></div><div class="two-col" style="margin-top:12px"><label class="check-label"><input id="photoExcluded" type="checkbox" ${photo.excluded ? 'checked' : ''}>不採用此照片（保留原檔）</label><label>不採用原因<input id="excludedReason" maxlength="500" value="${esc(photo.excludedReason || '')}" placeholder="例如 模糊、重拍"></label></div><p class="micro">${esc(metadata.name)} · ${size(metadata.size)} · 拍攝日期 ${esc(photo.capturedOn || '未記')}（${esc(CAPTURE_SOURCES[photo.captureSource || ''])}）· 取得於 ${esc(new Date(metadata.importedAt).toLocaleString('zh-TW'))}<br>戳記只壓在附件與副本；原圖與拍攝日期紀錄不變。</p><div class="modal-actions"><button id="downloadOriginal" class="quiet">下載原圖</button><button id="downloadMarked" class="secondary">註記副本</button><button id="savePhoto" class="primary">保存圈註</button></div>`, () => annotator?.dispose());
  $('#photoStage').insertAdjacentHTML('afterend', '<section id="photoLocation" class="location-card"></section><section id="photoDetail" class="location-card"></section>');
  $('#downloadMarked').insertAdjacentHTML('afterend', '<button id="downloadPhotoLocation" class="secondary">照片＋位置圖副本</button>');
  const locationPlan = project.plans.find(p => p.id === photoPlacement(currentRecord(), photo)?.planId);
  $('#downloadPhotoLocation').disabled = !locationPlan;
  $('#photoRole').value = photo.role;
  try { annotator = await createAnnotator($('#photoStage'), await mediaURL(mediaId, true), photo.marks, () => { modalDirty = true; }, { stamp: photoStampText(project, photo) }); }
  catch (e) { $('#photoStage').textContent = e.message; $('#photoTools').hidden = true; $('#downloadMarked').disabled = true; }
  $('#markText').oninput = e => annotator?.setText(e.target.value);
  const currentStamp = () => project.photoStamp === false || $('#photoStampHidden').checked ? '' : $('#photoStamp').value.trim().slice(0, 40);
  $('#photoStamp').oninput = $('#photoStampHidden').onchange = () => { modalDirty = true; annotator?.setStamp(currentStamp()); };
  $('#photoTools').onclick = e => { const b = e.target.closest('[data-mode]'), t = e.target.closest('[data-tone]'); if (b) { annotator?.setMode(b.dataset.mode); for (const x of $('#photoTools').querySelectorAll('[data-mode]')) x.classList.toggle('selected', x === b); } if (t) { annotator?.setTone(t.dataset.tone); for (const x of $('#photoTools').querySelectorAll('[data-tone]')) x.classList.toggle('selected', x === t); } };
  if (individualCracks(currentRecord())) $('#conditionLabels').insertAdjacentHTML('beforeend', currentRecord().cracks.map((c, i) => `<button data-crack-label="${crackLabel(i)}">裂縫 ${crackLabel(i)}</button>`).join(''));
  $('#conditionLabels').addEventListener('click', e => { const b = e.target.closest('[data-crack-label]'); if (b && annotator) { $('#markText').value = '裂縫 ' + b.dataset.crackLabel; annotator.setText($('#markText').value); $('#photoTools [data-mode="text"]').click(); } });
  $('#conditionLabels').onclick = e => { const b = e.target.closest('[data-condition-label]'); if (!b || !annotator) return; $('#markText').value = CONDITIONS[b.dataset.conditionLabel]; annotator.setText($('#markText').value); $('#photoTools [data-mode="text"]').click(); };
  $('#undoMark').onclick = () => annotator?.undo();
  for (const selector of ['#photoRole', '#photoCaption', '#photoExcluded', '#excludedReason']) $(selector).oninput = () => { modalDirty = true; };
  $('#downloadOriginal').onclick = () => download(asset.blob, metadata.name);
  $('#downloadMarked').onclick = () => action(async () => { download(await markedImage(asset.blob, annotator.marks, { stamp: currentStamp() }), metadata.name.replace(/\.[^.]+$/, '') + '-註記.jpg'); toast('已產生註記副本；原圖不變'); });
  const savePhotoValues = async () => {
    assert(!annotator?.pending, '請先完成目前圈註');
    const values = { role: $('#photoRole').value, caption: $('#photoCaption').value, marks: annotator?.marks || photo.marks, excluded: $('#photoExcluded').checked, excludedReason: $('#excludedReason').value.trim() };
    const stampValue = $('#photoStamp').value.trim().slice(0, 40), stampHidden = $('#photoStampHidden').checked;
    if (stampValue !== (photo.stamp || '') || stampHidden !== !!photo.stampHidden) Object.assign(values, { stamp: stampValue, stampHidden });
    assert(!values.excluded || values.excludedReason, '請填寫不採用原因');
    await commit(next => { const r = next.records.find(x => x.id === targetRecord); Object.assign(r.photos.find(x => x.mediaId === mediaId), values); if (values.excluded && r.mainPhotoId === mediaId) delete r.mainPhotoId; markUnitOpen(next, r); });
  };
  $('#savePhoto').onclick = () => action(async () => { await savePhotoValues(); closeModal(true); await render(); toast('圈註已另存，原圖保留'); });
  await renderLocationCard($('#photoLocation'), currentRecord(), () => action(async () => { await savePhotoValues(); closeModal(true); await render(); await planEntry(false, mediaId); }), photo);
  $('#photoLocation .location-edit').textContent = locationPlan ? '保存圈註並核對位置' : '保存圈註並引用圖面';
  $('#photoDetail').innerHTML = `<strong>本筆細部示意圖</strong><p class="micro">${esc(fieldDetailStatus(currentRecord()))}。同筆狀況的照片共用，附件同步引用。</p>${detailContextHTML(currentRecord(), esc)}<button id="photoDetailNext" class="primary">保存圈註 → ${currentRecord().detail ? '補畫' : '畫'}細圖</button>`;
  $('#photoCaption').closest('label').after($('#photoDetail'));
  $('#photoDetailNext').onclick = () => action(async () => { await savePhotoValues(); closeModal(true); await editRecordDetail(targetRecord, 'field', mediaId); });
  $('#downloadPhotoLocation').onclick = () => action(async () => {
    assert(locationPlan && !annotator?.pending, '請先完成圈註與位置定位');
    const r = currentRecord(), planAsset = await getMedia(locationPlan.mediaId);
    const blob = await photoLocationImage(asset.blob, annotator?.marks || photo.marks, planAsset.blob, photoPlacement(r, photo), { record: planLabel(r), heading: `${project.code} · ${currentUnit().code} · ${r.floor} · ${r.space}`, location: `${r.space} · ${r.location}`, plan: locationPlan.title }, { stamp: currentStamp() });
    download(blob, metadata.name.replace(/\.[^.]+$/, '') + '-位置對照.jpg'); toast('已產生位置對照副本；原始照片與圖面保留');
  });
}
function planEntry(draw = false, photoId = '') {
  assert(currentRecord(), '請先新增位置紀錄');
  if (currentRecord().floor.trim()) return draw ? sketchDialog() : planDialog('', photoId);
  const sourceProject = project.id, sourceRecord = recordId;
  openModal('先指定簡圖樓層', '<form id="planFloorForm"><label>本筆紀錄的樓層<input id="planFloor" required maxlength="100" placeholder="例如 1F、2F、RF" autocomplete="off"></label><p class="micro">圖面會歸到目前戶別及此樓層，供後續位置共用。</p><div class="modal-actions"><button class="primary" type="submit">繼續 →</button></div></form>');
  $('#planFloorForm').onsubmit = e => { e.preventDefault(); const floor = $('#planFloor').value.trim(); if (!floor) return; action(async () => { assert(project.id === sourceProject && recordId === sourceRecord, '原位置紀錄已變更，請重新選取'); await commit(next => { const r = next.records.find(x => x.id === sourceRecord); r.floor = floor; markUnitOpen(next, r); }); $('#floor').value = floor; return draw ? sketchDialog() : planDialog('', photoId); }); };
}
async function planDialog(preferredPlanId = '', photoId = '', observation = false) {
  assert(currentRecord(), '請先新增位置紀錄'); const r = currentRecord(); assert(r.floor.trim(), '請先填寫樓層，再加入位置圖');
  const selectedPhoto = r.photos.find(p => p.mediaId === photoId), currentPlacement = observation ? r.observationPin : selectedPhoto ? photoPlacement(r, selectedPhoto) : r.placement;
  const context = { projectId: project.id, recordId, unitId, floor: r.floor, photoId, observation };
  const plans = project.plans.filter(p => p.unitId === r.unitId && p.floor === r.floor), initial = plans.find(p => p.id === preferredPlanId) || plans.find(p => p.id === currentPlacement?.planId) || plans.at(-1);
  let annotator = null, selected = initial?.id || '', point = null;
  openModal('平面圖上的位置與方向', `<p class="micro">${esc(currentUnit().code)} · ${esc(r.floor)}。先點拍攝點，再點拍攝方向；也可切換拖曳。沒有圖說時，先畫簡圖再定位。</p><div class="annotation-tools"><label>位置圖<select id="planSelect">${plans.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('') || '<option value="">尚無位置圖</option>'}</select></label></div><div class="plan-actions"><button id="addPlanImage" class="secondary">加入既有圖面</button><button id="drawPlan" class="primary">＋ 畫簡圖</button><button id="applyStandardFloor" class="secondary" ${project.plans.some(p=>p.unitId===r.unitId) ? '' : 'disabled'}>套用標準層／其他樓層圖面</button><button id="editSketch" class="quiet" hidden>編輯簡圖副本</button></div><label>標箭頭方式<select id="planGesture"><option value="tap">點兩下：先拍攝點，再拍攝方向</option><option value="drag">按住拖曳箭頭</option></select></label><div id="planStage" class="annotation-stage"></div><p id="planSource" class="micro">可加入 JPG、PNG、WebP，或直接手繪房間與出入口。本版尚不直接讀取 PDF／CAD。</p><div class="modal-actions"><button id="clearPlacement" class="quiet">移除本筆定位</button><button id="savePlacement" class="secondary" ${initial ? '' : 'disabled'}>保存位置</button><button id="savePlacementDetail" class="primary" ${initial ? '' : 'disabled'}>保存位置 → 畫細圖</button></div>`, () => annotator?.dispose());
  if (initial) $('#planSelect').value = initial.id;
  if (observation) { $('#modalTitle').textContent = '標示狀況位置點'; $('#planGesture').parentElement.hidden = true; $('#modalBody > p').textContent = '在圖上點選裂隙或受損部位的位置；此圓圈表示狀況位置，與拍攝箭頭分開。'; }
  if (photoId) { $('#modalTitle').textContent = '這張照片的拍攝位置'; $('#clearPlacement').insertAdjacentHTML('beforebegin', '<button id="inheritPlacement" class="secondary">沿用本筆拍攝位置</button>'); $('#inheritPlacement').onclick = () => action(async () => { await commit(next => { delete next.records.find(x => x.id === r.id).photos.find(x => x.mediaId === photoId).placement; }); closeModal(true); await photoDialog(photoId); }); }
  async function loadPlan(planId) {
    annotator?.dispose(); selected = planId; point = null;
    const plan = plans.find(x => x.id === planId); const q = currentPlacement?.planId === planId ? currentPlacement : null;
    $('#editSketch').hidden = !plan.sketch;
    $('#planSource').textContent = plan.sketch ? '現場手繪示意圖，未按比例。編輯會另存副本，既有紀錄仍連到原圖。' : '既有圖面／草圖照片。請核對戶別、樓層與拍攝方向。';
    const marks = q ? [{ type: observation ? 'circle' : 'arrow', points: observation ? [{ x: q.x - .02, y: q.y - .02 }, { x: q.x + .02, y: q.y + .02 }] : [{ x: q.x, y: q.y }, { x: q.endX, y: q.endY }] }] : [];
    point = q;
    annotator = await createAnnotator($('#planStage'), await mediaURL(plan.mediaId, true), marks, values => {
      const arrow = values.at(-1); if (arrow) { point = observation ? { planId: selected, x: (arrow.points[0].x + arrow.points.at(-1).x) / 2, y: (arrow.points[0].y + arrow.points.at(-1).y) / 2, endX: (arrow.points[0].x + arrow.points.at(-1).x) / 2, endY: (arrow.points[0].y + arrow.points.at(-1).y) / 2 } : { planId: selected, x: arrow.points[0].x, y: arrow.points[0].y, endX: arrow.points.at(-1).x, endY: arrow.points.at(-1).y }; annotator.replace([arrow]); modalDirty = true; }
    }); annotator.setMode(observation ? 'circle' : 'arrow'); annotator.setGesture(observation ? 'drag' : $('#planGesture').value);
  }
  $('#planGesture').onchange = e => annotator?.setGesture(e.target.value);
  const canSwitch = () => { if (!modalDirty) return true; toast('請先保存目前的位置箭頭，再切換或編輯圖面'); return false; };
  $('#planSelect').onchange = e => { if (!canSwitch()) { e.target.value = selected; return; } action(() => loadPlan(e.target.value)); };
  $('#addPlanImage').onclick = () => { if (!canSwitch()) return; pendingPlan = context; $('#planInput').click(); };
  $('#drawPlan').onclick = () => { if (canSwitch()) sketchDialog(null, context); };
  $('#applyStandardFloor').onclick = () => { if (canSwitch()) action(() => standardFloorDialog(context)); };
  $('#editSketch').onclick = () => { if (canSwitch()) sketchDialog(plans.find(p => p.id === selected), context); };
  $('#clearPlacement').onclick = () => action(async () => { await commit(next => { const target = next.records.find(x => x.id === r.id); if (observation) target.observationPin = null; else if (photoId) target.photos.find(x => x.mediaId === photoId).placement = null; else target.placement = null; markUnitOpen(next, target); }); closeModal(true); await renderEditor(); toast('已移除本筆定位，原圖保留'); });
  const saveLocation = async detailNext => { assertPlanContext(context); assert(!annotator?.pending, '請先點第二個位置完成箭頭'); assert(point, '請在圖上先點拍攝點，再點方向，或切換拖曳畫出箭頭'); await commit(next => { const target = next.records.find(x => x.id === r.id); if (observation) target.observationPin = point; else if (photoId) target.photos.find(x => x.mediaId === photoId).placement = point; else target.placement = point; markUnitOpen(next, target); }); closeModal(true); await renderEditor(); if(detailNext) await editRecordDetail(r.id, 'field', photoId); else toast('位置與方向已保存'); };
  $('#savePlacement').onclick = () => action(() => saveLocation(false));
  $('#savePlacementDetail').onclick = () => action(() => saveLocation(true));
  if (initial) await loadPlan(initial.id);
}
function sketchDialog(source = null, context = { projectId: project.id, recordId, unitId, floor: currentRecord()?.floor }) {
  assertPlanContext(context);
  let editor;
  const defaultTitle = (context.copyTitle || (source ? `${source.title.replace(/\.png$/i, '')}（修訂）` : `${currentUnit().code} ${context.floor} 現場簡圖`)).slice(0, 150);
  openModal('手繪平面簡圖', `<p class="micro">選工具後指定兩點。門的第一點是門軸，第二點是門洞另一端。${source ? '此次另存副本，原圖與舊定位均保留。' : ''}</p><div id="sketchTools" class="annotation-toolbar sketch-tools"><button data-sketch-mode="line" class="selected" aria-pressed="true">直線</button><button data-sketch-mode="rect" aria-pressed="false">房間框</button><button data-sketch-mode="door" aria-pressed="false">開門</button><button data-sketch-mode="window" aria-pressed="false">開窗</button><button data-sketch-mode="pen" aria-pressed="false">手繪</button><button data-sketch-mode="text" aria-pressed="false">文字</button><button data-sketch-mode="pan" aria-pressed="false">移動畫面</button><button data-sketch-mode="erase" aria-pressed="false">選取／橡皮擦</button></div><div id="eraseOptions" hidden><label>刪除範圍<select id="eraseScope"><option value="segment">單段（房間框單側／手繪線段）</option><option value="whole">整個圖形／整筆手繪</option></select></label><button id="deleteSelection" class="secondary" disabled>刪除選取</button><p class="micro">先點圖形，橘色為刪除範圍；門、窗、文字以整個符號刪除。刪除門窗後原牆線會顯示，可再刪牆線。</p></div><div class="sketch-history"><button id="undoSketch" class="secondary" disabled>復原一步</button><button id="redoSketch" class="secondary" disabled>重做一步</button></div><p id="sketchHistoryHint" class="micro">先復原一步，才有可重做的步驟。</p><details id="sketchSettings"><summary>名稱與繪圖設定（鎖點／直角）</summary><label>簡圖名稱<input id="sketchTitle" maxlength="150" value="${esc(defaultTitle)}"></label><label>兩點工具操作方式<select id="sketchGesture"><option value="tap">點兩下：起點及終點／對角</option><option value="drag">按住拖曳</option></select></label><label class="check-label"><input type="checkbox" id="sketchSnap" checked>吸附端點及牆線</label><label class="check-label"><input type="checkbox" id="sketchOrtho" checked>直線／門窗鎖定水平或垂直</label><p class="micro">畫斜線或斜牆門窗時，關閉直角鎖定。復原及重做限本次編輯，重新開啟後歷程不保留。</p></details><div id="doorOptions" hidden><label>門扇開啟方向<select id="doorSwing"><option value="-1">由第一點看向第二點的左側</option><option value="1">由第一點看向第二點的右側</option></select></label></div><label id="sketchTextLabel" hidden>標記文字<input id="sketchText" maxlength="60" placeholder="例如 客廳、入口；輸入後點圖面"></label><p id="sketchHint" class="micro" role="status">先點起點，再點終點／對角。手繪則按住拖曳。</p><p id="sketchSnapStatus" class="micro" role="status"></p><div class="sketch-navigation"><button id="zoomOut" aria-label="縮小圖面">−</button><output id="sketchZoom" aria-live="polite">100%</output><button id="zoomIn" aria-label="放大圖面">＋</button><button id="fitSketch">看整張</button></div><p class="micro">雙指撥動可縮放與移動；單指移動請選「移動畫面」。縮放不改變圖紙大小。</p><div class="sketch-stage" id="sketchStage"></div><details id="sketchExpansion"><summary>圖紙不夠大？向外擴展</summary><div id="expandSketch" class="choice-chips"><button data-expand="top">↑ 向上擴展</button><button data-expand="bottom">↓ 向下擴展</button><button data-expand="left">← 向左擴展</button><button data-expand="right">→ 向右擴展</button></div><p class="micro">在指定方向增加空白，原圖形大小保留；可復原／重做。範圍太大時建議依樓層或區域另畫一張。</p></details><div class="sketch-footer"><span id="sketchCount" class="micro"></span><button id="clearSketch" class="quiet" disabled>清空重畫</button></div><button id="addRoomFrame" class="secondary">＋ 插入房間外框</button><p class="micro">未按比例，門窗符號及簡圖只作位置參照；尺寸請另行實測。</p><div class="modal-actions"><button id="saveSketch" class="primary" disabled>${context.recordId ? '保存簡圖並標箭頭 →' : '保存至本戶平面圖庫'}</button></div>`, () => editor?.dispose());
  $('#modal').dataset.mode = 'sketch';
  if (context.standardFloor) $('#modalTitle').textContent = `${context.floor} 平面簡圖（套用 ${source.floor}）`;
  const body = $('#modalBody'), tools = $('#sketchTools'), canvas = $('#sketchStage');
  const stairButton = document.createElement('button'); stairButton.dataset.sketchMode = 'stairs'; stairButton.textContent = '樓梯'; stairButton.setAttribute('aria-pressed', 'false'); tools.insertBefore(stairButton, tools.querySelector('[data-sketch-mode="pen"]'));
  const stairs = document.createElement('div'); stairs.id = 'stairOptions'; stairs.hidden = true;
  stairs.innerHTML = '<label>樓梯型式<select id="stairType"><option value="straight">直梯</option><option value="l">L 型梯</option><option value="u">折返梯</option><option value="unequal">長短梯</option></select></label><label>箭頭<select id="stairDirection"><option value="unknown">方向未確認</option><option value="up">上</option><option value="down">下</option></select></label><label>旋轉<select id="stairRotation"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label><label class="check-label"><input id="stairMirror" type="checkbox">左右鏡射</label><label class="check-label"><input id="stairBreak" type="checkbox">斷線</label><label id="stairRatioLabel" hidden>短梯段比例<select id="stairRatio"><option value="0.25">1/4</option><option value="0.5" selected>1/2</option><option value="0.75">3/4</option><option value="1">等長</option></select></label>';
  body.append(stairs);
  const help = document.createElement('details'); help.id = 'sketchHelp'; help.innerHTML = '<summary>顯示操作說明</summary>'; help.open = preference.get('sketch-help') === 'true'; help.ontoggle = () => preference.set('sketch-help', String(help.open));
  for (const el of [...body.querySelectorAll('p.micro')]) if (!['sketchHint', 'sketchSnapStatus'].includes(el.id)) help.append(el);
  const settings = $('#sketchSettings'); settings.querySelector('summary').textContent = '設定／圖紙／說明';
  settings.append($('#sketchExpansion'), $('#addRoomFrame'), body.querySelector('.sketch-footer'), help);
  const controls = document.createElement('div'); controls.className = 'sketch-controls'; controls.append($('#eraseOptions'), $('#doorOptions'), stairs, $('#sketchTextLabel'), settings);
  $('#undoSketch').textContent = '復原'; $('#redoSketch').textContent = '重做'; $('#saveSketch').textContent = '保存圖面';
  const footer = document.createElement('div'); footer.className = 'sketch-dock'; footer.append(body.querySelector('.sketch-history'), body.querySelector('.sketch-navigation'), $('#saveSketch'));
  const status = document.createElement('div'); status.className = 'sketch-status'; status.append($('#sketchHint'), $('#sketchSnapStatus'));
  body.replaceChildren(tools, controls, canvas, status, footer);
  const updateState = state => {
    $('#sketchCount').textContent = state.count + '／300 筆畫';
    $('#deleteSelection').disabled = !state.selected;
    $('#sketchZoom').textContent = Math.round(state.zoom * 100) + '%';
    $('#zoomIn').disabled = state.zoom >= 8; $('#zoomOut').disabled = state.zoom <= 1;
    for (const b of $('#expandSketch').querySelectorAll('[data-expand]')) b.disabled = state.pending || !state.canExpand[b.dataset.expand];
    $('#undoSketch').disabled = !state.canUndo; $('#redoSketch').disabled = !state.canRedo;
    $('#saveSketch').disabled = state.pending || !state.count; $('#clearSketch').disabled = !state.count && !state.pending;
    $('#sketchHistoryHint').textContent = state.pending ? '目前筆畫尚未完成；復原一步可取消起點。' : state.redoCount ? '可重做 ' + state.redoCount + ' 步；新增筆畫後會改走新的編輯歷程。' : '先復原一步才可重做；要重新畫整張，請用清空重畫。';
    $('#sketchSnapStatus').textContent = state.snapLabel || ($('#sketchSnap').checked ? '靠近端點／牆線時會吸附並顯示圓圈' : '鎖點已關閉');
  };
  editor = createSketcher($('#sketchStage'), source?.sketch || emptySketch(), () => { modalDirty = true; }, hint => { $('#sketchHint').textContent = hint; }, updateState); editor.setGesture('tap');
  $('#eraseScope').onchange = e => editor.setSelectionScope(e.target.value === 'whole');
  $('#deleteSelection').onclick = () => editor.deleteSelected();
  $('#zoomIn').onclick = () => editor.zoomBy(1.4); $('#zoomOut').onclick = () => editor.zoomBy(1 / 1.4); $('#fitSketch').onclick = () => editor.fit();
  $('#expandSketch').onclick = e => { const b = e.target.closest('[data-expand]'); if (b) editor.expand(b.dataset.expand); };
  $('#sketchGesture').onchange = e => { editor.setGesture(e.target.value); $('#sketchHint').textContent = e.target.value === 'tap' ? '請點起點，再點終點／對角；手繪仍按住拖曳。' : '按住圖面後移動，放開完成一筆。'; };
  $('#sketchSnap').onchange = e => editor.setSnap(e.target.checked); $('#sketchOrtho').onchange = e => editor.setOrthogonal(e.target.checked);
  const updateStairs = () => { editor.setStairs({ stairType: $('#stairType').value, direction: $('#stairDirection').value, rotation: Number($('#stairRotation').value), mirror: $('#stairMirror').checked, breakLine: $('#stairBreak').checked, shortRatio: Number($('#stairRatio').value) }); $('#stairRatioLabel').hidden = $('#stairType').value !== 'unequal'; $('#sketchHint').textContent = $('#stairDirection').value === 'unknown' ? '' : '點兩個對角，指定樓梯範圍。'; };
  $('#stairOptions').onchange = updateStairs;
  $('#doorSwing').onchange = e => editor.setSwing(Number(e.target.value));
  $('#addRoomFrame').onclick = () => editor.addRoom();
  $('#sketchTitle').oninput = () => { modalDirty = true; };
  $('#sketchText').oninput = e => editor.setText(e.target.value);
  $('#sketchTools').onclick = e => { const b = e.target.closest('[data-sketch-mode]'); if (!b) return; const mode = b.dataset.sketchMode; editor.setMode(mode); for (const x of $('#sketchTools').querySelectorAll('[data-sketch-mode]')) { x.classList.toggle('selected', x === b); x.setAttribute('aria-pressed', String(x === b)); } $('#stairOptions').hidden = mode !== 'stairs'; $('#eraseOptions').hidden = mode !== 'erase'; $('#doorOptions').hidden = mode !== 'door'; $('#sketchTextLabel').hidden = mode !== 'text'; $('#sketchHint').textContent = mode === 'erase' ? '先點要刪除的線段或符號，確認橘色範圍後按刪除選取。' : mode === 'pan' ? '用單指或滑鼠拖曳移動；雙指可同時縮放。' : mode === 'text' ? '輸入文字後，點圖面放置文字。' : mode === 'pen' ? '在圖面按住並移動手指，放開完成一筆。' : mode === 'door' ? '第一點為門軸，第二點為門洞另一端；方向可在上方切換。' : mode === 'window' ? '點選窗戶兩端；靠近牆線時可吸附。' : $('#sketchGesture').value === 'tap' ? '先點起點，再點終點／對角。' : '按住並拖曳，放開完成。'; if (mode === 'stairs') updateStairs(); if (mode === 'text' && !$('#sketchText').value.trim()) $('#sketchText').focus(); };
  $('#undoSketch').onclick = () => editor.undo(); $('#redoSketch').onclick = () => editor.redo(); $('#clearSketch').onclick = () => editor.clear();
  $('#saveSketch').onclick = () => action(async () => {
    assertPlanContext(context);
    const title = $('#sketchTitle').value.trim(), sketch = editor.sketch;
    assert(title, '請填寫簡圖名稱'); assert(!editor.pending, '請先點第二個位置完成目前筆畫，或切換工具取消'); assert(sketch.strokes.length, '請至少畫一筆房間、隔間或位置文字');
    const file = new File([await sketchImage(sketch)], `${title}.png`, { type: 'image/png' });
    const { metadata, asset } = await prepareAsset(file, 'plan', 'sketch');
    const plan = { id: id(), unitId: context.unitId, floor: context.floor, title, mediaId: metadata.id, sketch };
    await commit(next => { next.media.push(metadata); next.plans.push(plan); }, [asset]);
    await afterPlanSaved(plan, context);
  }, '保存簡圖');
}
async function addPlan(file, context) {
  assertPlanContext(context);
  const { metadata, asset } = await prepareAsset(file, 'plan', 'plan'); assert(!metadata.previewUnavailable, '此圖面無法預覽，請改用 JPG 或 PNG');
  const plan = { id: id(), unitId: context.unitId, floor: context.floor, title: file.name, mediaId: metadata.id };
  await commit(next => { next.media.push(metadata); next.plans.push(plan); }, [asset]); await afterPlanSaved(plan, context);
}
async function audioToggle() {
  if (recording) return stopAudio();
  assert(currentRecord(), '請先新增位置紀錄'); assert(navigator.mediaDevices?.getUserMedia && window.MediaRecorder, '此瀏覽器不支援錄音，請使用文字紀錄');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let recorder;
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)); recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = []; let resolveDone;
    const done = new Promise(resolve => { resolveDone = resolve; });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => resolveDone(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    recorder.onerror = () => { if (recorder.state !== 'inactive') recorder.stop(); toast('錄音中斷，請停止並確認已保存內容'); };
    recorder.start(1000); recording = { recorder, stream, done, projectId: project.id, recordId, startedAt: Date.now(), timer: setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
      $('#audioStatus').textContent = '已達 5 分鐘，正在保存';
      const finish = () => { if (!recording || recording.recorder !== recorder) return; if (working) setTimeout(finish, 250); else action(stopAudio, '保存錄音'); }; finish();
    }, 300000) };
    $('#recordAudio').textContent = '■ 停止並保存錄音'; $('#audioStatus').textContent = '錄音中 · 最長 5 分鐘';
  } catch (e) { stream.getTracks().forEach(t => t.stop()); throw e; }
}
async function stopAudio() {
  const context = recording; if (!context) return;
  clearTimeout(context.timer); if (context.recorder.state !== 'inactive') context.recorder.stop();
  const blob = await context.done; context.stream.getTracks().forEach(t => t.stop());
  const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  const file = new File([blob], `現場錄音-${new Date(context.startedAt).toISOString().replace(/[:.]/g, '-')}.${ext}`, { type: blob.type });
  try {
    const { metadata, asset } = await prepareAsset(file, 'audio', 'microphone');
    assert(project.id === context.projectId, '錄音案件已變更');
    await commit(next => { next.media.push(metadata); const r = next.records.find(x => x.id === context.recordId); r.audioIds.push(metadata.id); markUnitOpen(next, r); }, [asset]); toast('錄音已保存');
  } catch (error) { download(file, file.name); throw new Error(`錄音未寫入案件，已另產生下載檔，請保存並補記對應位置。${error.message}`); }
  finally { recording = null; $('#recordAudio').textContent = '開始錄音'; $('#audioStatus').textContent = ''; await renderMedia(); }
}
async function exportBackup() {
  requireNoRecording();
  const scope = $('#exportScope').value;
  const { blob, manifest } = await makeBundle(project, async mediaId => (await getMedia(mediaId))?.blob, scope, (i, n) => busyText(`核對原始檔 ${i} / ${n}`));
  const unit = project.units.find(u => u.id === scope), name = `${project.code}${unit ? '-' + unit.code : ''}-${localDate()}-r${project.revision}.csurvey`;
  download(blob, name);
  const state = await backupState(project.id); state.entries[scope || 'all'] = { digest: manifest.digest, revision: project.revision, exportedAt: now(), verifiedAt: null }; await saveBackupState(state); await renderBackup(); toast('備份檔已產生，請在接收端開啟核對');
}
async function prepareHandoff() {
  requireNoRecording();
  const scope = $('#exportScope').value, source = clone(project);
  const { blob, manifest } = await makeBundle(source, async mid => (await getMedia(mid))?.blob, scope, (i, n) => busyText(`準備完整案件 ${i} / ${n}`));
  const unit = source.units.find(u => u.id === scope);
  const name = `${source.code}${unit ? '-' + unit.code : ''}-${localDate()}-r${source.revision}.csurvey`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  const file = new File([blob], name, { type: blob.type });
  let canShare = false;
  try { canShare = !!navigator.share && !!navigator.canShare?.({ files: [file] }); } catch {}
  openModal('完整案件已準備好', `<h3>${esc(source.name)}</h3><p>${scope ? '單戶' : '全案'} · ${manifest.payload.project.records.length} 筆紀錄 · ${size(blob.size)}</p><p>包含位置紀錄、文字說明、照片、錄音、平面圖及可編輯細圖。接收端開啟本工具，選「開啟案件檔繼續製作」即可接續工作。</p><div class="handoff-actions"><button id="saveHandoff" class="primary" ${typeof window.showSaveFilePicker !== 'function' ? 'hidden' : ''}>另存到資料夾</button><button id="shareHandoff" class="secondary" ${canShare ? '' : 'hidden'}>分享案件檔</button><button id="downloadHandoff" class="secondary">下載案件檔</button></div><p id="handoffStatus" class="modal-note" role="status">電腦可選已同步的 Google Drive 資料夾；手機可在分享選單選 Google Drive（若裝置提供）。儲存後請等 Drive 顯示同步完成。</p><details><summary>從雲端交接的操作方式</summary><ol><li>下載或另存這份 .csurvey 案件檔。</li><li>存入共用雲端資料夾；若未安裝 Drive，可開啟下方資料夾後手動上傳。</li><li>另一台電腦下載案件檔，在本工具開啟、編輯及製作報告。</li><li>多人交件時先開啟一份主案，再選「彙整同事的案件檔」。</li></ol><p><a href="https://drive.google.com/drive/folders/1jwhulKJvNKLTRFoA1a5rw-PKIN9_5g7J" target="_blank" rel="noopener noreferrer">開啟預設交接資料夾</a></p><p class="micro">工具目前不會直接上傳或列出雲端檔案，也無法確認 Drive 的同步進度。這是完整案件交接，不是照片壓縮檔。</p></details>`);
  const status = $('#handoffStatus');
  const exported = async () => {
    const state = await backupState(source.id);
    state.entries[scope || 'all'] = { digest: manifest.digest, revision: source.revision, exportedAt: now(), verifiedAt: null };
    await saveBackupState(state); await renderBackup();
  };
  // These clicks must reach the native API before awaiting any browser storage work.
  const run = async operation => {
    const buttons = [...$('#modalBody').querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
    try { await operation(); }
    catch (e) { status.textContent = e.name === 'AbortError' ? '已取消，案件仍保留在此裝置，可重新選擇。' : `未完成交接：${e.message}。可改用下載案件檔。`; }
    finally { buttons.forEach(b => b.disabled = false); }
  };
  $('#saveHandoff').onclick = () => run(async () => {
    const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: '現況紀錄案件', accept: { 'application/octet-stream': ['.csurvey'] } }] });
    const stream = await handle.createWritable();
    try { await stream.write(blob); await stream.close(); } catch (e) { await stream.abort().catch(() => {}); throw e; }
    status.textContent = '案件檔已寫入所選資料夾；若為雲端同步資料夾，請在 Drive 確認同步完成。'; await exported();
  });
  $('#shareHandoff').onclick = () => run(async () => {
    await navigator.share({ files: [file], title: source.name });
    status.textContent = '案件檔已交給系統分享功能；請在接收的應用程式確認保存或上傳完成。'; await exported();
  });
  $('#downloadHandoff').onclick = () => run(async () => {
    download(blob, name); status.textContent = '已交給瀏覽器下載；請確認檔案保存完成，再放入共用雲端資料夾。'; await exported();
  });
}
async function inspectColleagueBundles(files) {
  requireNoRecording(); assert(project, '請先開啟作為彙整基礎的案件');
  assert(files.length <= 20, '每次最多彙整 20 份案件檔');
  const base = clone(project), sources = [];
  for (const [i, file] of files.entries()) {
    busyText(`核對第 ${i + 1} / ${files.length} 份案件`);
    sources.push({ ...await readBundle(file), label: file.name.replace(/\.csurvey$/i, '').slice(0, 80) });
  }
  openModal('彙整完整案件', `<p>主案：<strong>${esc(base.name)}</strong>（${base.records.length} 筆紀錄）</p><p class="modal-note">會另建彙整案件，保留主案及同事的全部紀錄、照片、錄音和平面圖／細圖。每份來源的戶別分開保留並加上來源名稱；同一位置的不同內容不會自動合併或覆蓋，製作報告前請核對採用範圍。</p>${sources.map((s, i) => `<label>來源 ${i + 1}：${esc(s.project.name)} · ${s.project.units.length} 戶／${s.project.records.length} 筆<input data-handoff-label="${i}" maxlength="80" value="${esc(s.label)}"></label>`).join('')}<p class="micro">整案設定沿用主案；來檔的案件名稱、日期與設定會記入來源資料。位置代號會重新編排，原代號保留於來源資料；既有圖中文字不會自動改字。同一份未修改的案件檔再次匯入會略過。不同版本仍分開保留。</p><button id="confirmConsolidate" class="primary full">建立彙整案件</button>`);
  $('#confirmConsolidate').onclick = () => action(async () => {
    sources.forEach((s, i) => { s.label = $(`[data-handoff-label="${i}"]`).value.trim(); assert(s.label, '請填寫每份檔案的來源名稱'); });
    const result = await consolidateBundles(base, sources);
    if (!result.added.length) { toast('這些案件檔已在主案內，未重複加入'); closeModal(true); return; }
    // Validate and save everything in one transaction. Originals are retained.
    await saveProject(result.project, 0, result.media); closeModal(true); await selectProject(result.project.id);
    toast(`已彙整 ${result.added.length} 份案件${result.skipped.length ? `，略過 ${result.skipped.length} 份重複檔` : ''}，原案保留`);
  }, '保存完整彙整案件');
}
async function inspectBackup(file) {
  requireNoRecording(); const result = await readBundle(file, (i, n) => busyText(`核對備份原始檔 ${i} / ${n}`));
  const source = result.project, receipt = makeReceipt(result.manifest);
  openModal('備份核對完成', `<p class="eyebrow">${esc(source.code)}</p><h3>${esc(source.name)}</h3><p>${source.units.length} 戶 · ${source.records.length} 筆紀錄 · ${result.media.length} 個原始媒體</p><p class="modal-note">紀錄與全部媒體已通過檔案指紋核對。可下載收據帶回原裝置，或開啟完整案件繼續製作。</p><p class="micro">本次確認的是檔案完整性；不驗證拍攝現場、填寫者身分或鑑定結論。請在另一裝置實際開啟副本後，再確認備份可用。</p><div class="modal-actions"><button id="downloadReceipt" class="secondary">下載核對收據</button><button id="restoreBundle" class="primary">開啟案件並繼續製作</button></div>`);
  $('#downloadReceipt').onclick = () => download(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }), `${source.code}-核對收據.json`);
  $('#restoreBundle').onclick = () => action(async () => {
    const copy = restoredCopy(source), assets = result.media.map(a => ({ ...a, id: copy.remap.get(a.id) }));
    copy.project.handoffDigests = [...new Set([...(copy.project.handoffDigests || []), result.manifest.digest])];
    await saveProject(copy.project, 0, assets); closeModal(true); await selectProject(copy.project.id); toast('案件已開啟，可繼續編輯；原案保留');
  }, '還原原始照片與紀錄');
}
async function receiveReceipt(file) {
  assert(file.size < 65536, '核對收據檔案過大'); const receipt = JSON.parse(await file.text()), state = await backupState(project.id);
  state.entries[receipt.scope || 'all'] = await checkReceipt(receipt, project, state); await saveBackupState(state); await renderBackup(); toast('核對收據已記錄');
}
function helpDialog() {
  openModal('手機使用與保存', `<ol class="help-list"><li>在「案件與備份」建立案件（選透天／公寓／大樓並填層數，公寓會自動建立各樓層戶別）、會勘批次與戶別名冊；到「現場紀錄」選鑑定戶，先從「平面圖庫／先建圖」依樓層匯入或手繪，標上入口、樓梯及房間名稱；再進入各空間新增位置，引用圖面標拍攝箭頭，拍全景、近照或量尺照。</li><li>拍照自動壓年月日戳記在附件與副本（原圖不變；可逐張改，或在案件設定整案關閉），紀錄日期依照片日期帶入。點照片可圈選、畫箭頭與文字（紅＝裂縫、藍＝水分／其他損害）；圈註另存，原圖保留。位置圖可加入圖面或草圖照片；手繪簡圖支援雙指縮放、移動、四向擴展及選取刪除。照片旁可核對定位，另可下載照片與位置圖對照副本。</li><li>現況可複選並共用照片；白華、剝落等面積各自填 m²，不合計重疊範圍。裂隙寬度用 mm、長度用 m。現況欄位會自動保存。切換位置前會先保存；上方有錯誤時請先處理。</li><li>離開一戶前查看「待補檢查」，無法入內或部分完成請記原因。</li><li>從「案件與備份」匯出全案或單戶。在電腦開啟同一工具、核對備份及建立還原副本。</li><li>iPhone 可從瀏覽器分享選單加入主畫面；Android 可從瀏覽器選單安裝。需先在線開啟，等上方顯示「離線已就緒」。手機使用需 HTTPS。</li></ol><p class="modal-note">資料只保存在此瀏覽器及你匯出的備份檔，不自動上傳。換瀏覽器、清除網站資料或移除應用程式前，請先完成外部備份。勿以無痕模式保存工作。</p><p>本工具記錄現場可見情形，不自動判定損害原因、結構安全或責任歸屬。尚須在實際手機上確認相機、容量及中斷操作。</p><p class="help-version">版本 ${VERSION} · 純本機資料 · 現況紀錄工作稿</p><button id="applyUpdate" class="secondary" hidden>保存後套用離線更新</button>`);
  $('#modalBody').insertAdjacentHTML('afterbegin', '<p class="modal-note">V0.10.0：可匯入戶別名冊、分次會勘並保留進場歷程。在附件整理選六種細圖、畫損害標註，再依戶編號與規劃分冊。標準附件依序為整體平面圖、照片說明表、照片；保留快速預覽。分冊設定請於每次匯出前核對。</p><details><summary>既有現場功能說明</summary><p>V0.8.0：一般裂縫可逐條填尺寸並以 A／B／C 圈註；磁磚可選 1／2／5／10／15／20 塊或文字數量。新增大字、橫向拍攝與收合說明的繪圖介面；樓梯提供直梯、L 型、折返及長短梯，方向未確認不加箭頭或文字。梁 U 型裂縫以條數記錄、不列總長；磁磚裂隙與破損可記塊數。在「附件整理」依房間選主照片、排序並自動產生照片流水號與位置圖，可下載 HTML 附件及列印 PDF。照片可各自設定拍攝位置，舊案及舊備份可接續使用。網狀裂隙：網狀裂隙的寬度、長度及實測勾選均可略過，不列尺寸待補。簡圖新增開門、開窗、端點／牆線吸附與水平／垂直鎖定。復原一步後才可重做，清空重畫另有按鈕。拍照先同意啟用相機，再於瀏覽器選允許；可預覽、重拍與保存。部位可複選；裂縫可一鍵選 ≤0.3 mm、>0.3 mm。無圖說可直接「手繪簡圖」，點兩下畫房間／線段，保存後點拍攝點及方向標箭頭。簡圖未按比例，寬度區間不代表安全判定。</p></details>');
  navigator.serviceWorker?.getRegistration().then(reg => { if (reg?.waiting && $('#applyUpdate')) { $('#applyUpdate').hidden = false; $('#applyUpdate').onclick = () => action(async () => { requireNoRecording(); assert(!conflictDraft, '請先另存目前副本，再套用更新'); closeModal(true); navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); reg.waiting.postMessage('ACTIVATE_UPDATE'); }); } });
}
async function initOffline() {
  if (!('serviceWorker' in navigator) || !isSecureContext) { $('#offlineStatus').textContent = '需 HTTPS 才能離線安裝'; return; }
  const registration = await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { scope: new URL('./', import.meta.url).pathname });
  const updateLabel = () => { $('#updateApp').hidden = !registration.waiting; $('#offlineStatus').textContent = registration.waiting ? '有新版 · 使用說明中更新' : navigator.serviceWorker.controller || registration.active ? navigator.onLine ? '離線已就緒' : '離線紀錄中' : '離線資源下載中'; };
  $('#updateApp').onclick = () => action(async () => { requireNoRecording(); assert(!conflictDraft, '請先另存目前副本，再套用更新'); if (!registration.waiting) return; navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); registration.waiting.postMessage('ACTIVATE_UPDATE'); });
  updateLabel(); window.addEventListener('online', updateLabel); window.addEventListener('offline', updateLabel);
  navigator.serviceWorker.addEventListener('controllerchange', updateLabel);
  registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { updateLabel(); if (worker.state === 'redundant') $('#offlineStatus').textContent = '離線準備失敗，請連線重開'; }); });
  navigator.serviceWorker.ready.then(updateLabel);
}

async function recoverCopy() {
  if (working) return;
  requireNoRecording(); clearTimeout(saveTimer);
  working = true; $('#busy').hidden = false; $('#app').inert = $('#modal').inert = true; busyText('另存本視窗紀錄');
  try {
    if (formSaving) await formSaving.catch(() => {});
    const candidate = clone(conflictDraft?.project || project), pendingAssets = new Map((conflictDraft?.assets || []).map(a => [a.id, a]));
    if (dirty && currentRecord()) {
      const r = candidate.records.find(x => x.id === recordId); Object.assign(r, formValues());
      clearWrongFloor(candidate, r);
    }
    syncRooms(candidate); const copy = restoredCopy(candidate), assets = [];
    copy.project.name = candidate.name.slice(0, 200) + '（視窗副本）';
    for (const m of candidate.media) { const asset = pendingAssets.get(m.id) || await getMedia(m.id); assets.push({ ...asset, id: copy.remap.get(m.id) }); }
    await saveProject(copy.project, 0, assets); dirty = false; conflictDraft = null; closeModal(true); $('#errorBar').hidden = true;
    await selectProject(copy.project.id); toast('已另存副本，請核對兩個視窗的內容');
  } catch (e) { fail(e); } finally { working = false; $('#busy').hidden = true; $('#app').inert = $('#modal').inert = false; }
}
$('#recoverCopy').onclick = $('#modalRecover').onclick = () => recoverCopy().catch(fail);
$('#keepEditing').onclick = () => { $('#discardPrompt').hidden = true; };
$('#discardChanges').onclick = () => closeModal(true);
$('#component').innerHTML = COMPONENTS.filter(Boolean).map(x => `<label><input type="checkbox" name="components" value="${esc(x)}"><span>${esc(x === '牆面' ? '牆' : x)}</span></label>`).join('');
const conditionChoices = keys => keys.map(key => `<label><input type="checkbox" name="conditions" value="${key}"><span>${esc(CONDITIONS[key])}</span></label>`).join('');
$('#commonConditions').innerHTML = conditionChoices(COMMON_CONDITIONS);
$('#conditionGroups').innerHTML = CONDITION_GROUPS.map(([label, keys]) => `<fieldset class="component-field"><legend>${esc(label)}</legend><div class="choice-chips">${conditionChoices(keys)}</div></fieldset>`).join('');
$('#normalCondition').innerHTML = conditionChoices(['normal']);
$('#selectedConditions').onclick = event => { const b = event.target.closest('[data-remove-condition]'); if (!b) return; const input = $('#condition input[value="' + b.dataset.removeCondition + '"]'); input.checked = false; changed({ target: input }); $('#moreConditions summary').focus(); };
$('#crackLayer').innerHTML = Object.entries(CRACK_LAYERS).map(([key, label]) => `<label><input type="radio" name="crackLayer" value="${key}" ${key === 'unknown' ? 'checked' : ''}>${label}</label>`).join('');
$('#leakForms').innerHTML = Object.entries(LEAK_FORMS).map(([key, label]) => `<label><input type="checkbox" value="${key}">${label}</label>`).join('');
$('#areaFields').innerHTML = Object.entries(AREA_CONDITIONS).map(([key, label]) => `<div data-area="${key}" class="two-col" hidden><label>${label}面積（m²，選填）<input id="area-${key}" type="number" min="0" step="any" inputmode="decimal" placeholder="未記錄"></label><label>取得方式<select id="area-method-${key}">${opts(AREA_METHODS)}</select></label></div>`).join('');
$('#widthMode').innerHTML = opts(WIDTH_MODES); $('#crackPattern').innerHTML = opts(CRACK_PATTERNS);
$('#widthMode').onchange = () => { if ($('#widthMode').value !== 'exact') $('#width').value = ''; };
$('#widthPresets').onclick = e => { const b = e.target.closest('[data-width]'); if (!b) return; $('#widthMode').value = b.dataset.width; if (b.dataset.width !== 'exact') $('#width').value = ''; changed(); };
$('#recordForm').addEventListener('submit', e => e.preventDefault()); $('#recordForm').addEventListener('input', changed); $('#recordForm').addEventListener('change', changed);
$('#newCase').onclick = $('#startCase').onclick = () => action(caseDialog);
$('#addUnit').onclick = () => action(() => unitDialog()); $('#editUnit').onclick = () => action(() => unitDialog(unitId));
$('#caseSelect').onchange = e => { const selected = e.target.value; action(() => selectProject(selected)).finally(() => { $('#caseSelect').value = project?.id || ''; }); };
$('#unitSelect').onchange = e => { const selected = e.target.value; action(async () => { requireNoRecording(); unitId = selected; recordId = project.records.find(r => r.unitId === unitId)?.id || ''; await render(); }).finally(() => { $('#unitSelect').value = unitId; }); };
$('#addRecord').onclick = $('#nextRecord').onclick = () => action(addRecord);
$('#saveRecord').onclick = () => action(async () => toast('目前紀錄已保存'));
$('#recordList').onclick = e => { const b = e.target.closest('[data-record]'); if (b) action(async () => { requireNoRecording(); recordId = b.dataset.record; renderRecordList(); await renderEditor(); }); };
$('#takePhoto').onclick = () => action(cameraDialog); $('#pickPhotos').onclick = () => { try { capture('gallery'); } catch (e) { fail(e); } };
for (const selector of ['#cameraInput', '#galleryInput']) $(selector).onchange = e => { const files = [...e.target.files], context = pendingCapture; e.target.value = ''; if (files.length) action(() => addPhotos(files, context), '保存原始照片'); };
$('#managePhotos').onclick = () => action(managePhotos);
$('#photoGrid').onclick = e => { const b = e.target.closest('[data-photo]'); if (b) action(() => photoDialog(b.dataset.photo)); };
$('#unitPlans').onclick = () => action(() => planLibrary());
$('#addAddressRecord').onclick = () => action(addAddressRecord); $('#nextUnit').onclick = () => action(nextUnit); $('#editCase').onclick = () => action(caseSettingsDialog);
for (const [container, key] of [['#floorChips', 'floor'], ['#spaceChips', 'space']]) $(container).onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#' + key).value = b.dataset[key]; for (const x of $(container).querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b)); changed({ target: $('#' + key) }); };
$('#showPlan').onclick = () => action(() => planEntry(false)); $('#quickSketch').onclick = () => action(() => planEntry(true)); $('#planInput').onchange = e => { const file = e.target.files[0], context = pendingPlan; e.target.value = ''; if (file) action(() => addPlan(file, context)); };
$('#recordAudio').onclick = () => action(audioToggle, '準備錄音');
$('#bottomNav').onclick = e => { const b = e.target.closest('[data-view]'); if (b && project) action(async () => { requireNoRecording(); await showView(b.dataset.view); window.scrollTo(0, 0); }); };
$('#gotoCase').onclick = () => { if (project) action(async () => { requireNoRecording(); await showView('case'); window.scrollTo(0, 0); }); };
$('#visitSelect').addEventListener('change', renderContext);
$('#reviewList').onclick = e => { const status = e.target.closest('[data-unit-state]'), record = e.target.closest('[data-review-record]'); if (status) action(() => unitDialog(status.dataset.unitState)); if (record) action(async () => { unitId = record.dataset.unit; recordId = record.dataset.reviewRecord; activeView = 'work'; await render(); }); };
for (const selector of ['#reviewSearch', '#reviewFilter']) $(selector).onchange = () => action(async () => { reviewPage = 0; renderReview(); });
$('#reviewPager').onclick = event => { const b = event.target.closest('[data-review-page]'); if (b) action(async () => { reviewPage += Number(b.dataset.reviewPage); renderReview(); $('#reviewPager').scrollIntoView({ block: 'start' }); }); };
$('#exportScope').onchange = () => action(renderBackup); $('#exportBackup').onclick = () => action(exportBackup, '核對備份資料');
$('#prepareHandoff').onclick = () => action(prepareHandoff, '準備完整案件交接檔');
$('#mergeBundles').onclick = () => { try { requireNoRecording(); $('#mergeBundleInput').click(); } catch (e) { fail(e); } };
$('#mergeBundleInput').onchange = e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) action(() => inspectColleagueBundles(files), '核對同事案件'); };
$('#readBackup').onclick = $('#welcomeImport').onclick = () => { try { requireNoRecording(); $('#bundleInput').click(); } catch (e) { fail(e); } };
$('#bundleInput').onchange = e => { const file = e.target.files[0]; e.target.value = ''; if (file) action(() => inspectBackup(file), '核對備份'); };
$('#importReceipt').onclick = () => $('#receiptInput').click(); $('#receiptInput').onchange = e => { const file = e.target.files[0]; e.target.value = ''; if (file) action(() => receiveReceipt(file)); };
$('#persistStorage').onclick = () => action(async () => { const granted = await navigator.storage?.persist?.(); toast(granted ? '已取得持續保存，仍請定期備份' : '瀏覽器未授予持續保存，請完成外部備份'); await renderBackup(); });
$('#fieldLabels').onchange = () => action(async () => { await renderMedia(); });
$('#crackCountPresets').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#crackCount').value = b.dataset.count ?? Math.max(0, Math.min(99999, Number($('#crackCount').value || 0) + Number(b.dataset.countStep))); changed(); };
$('#measurement').prepend($('#crackPattern').parentElement, $('#uCrackFields'));
crackFields = createCrackFields($('#individualCracks'), changed, () => {
  const measured = $('#measured').checked, widthMode = $('#widthMode').value;
  const width = measured && widthMode === 'exact' && $('#width').value !== '' ? Number($('#width').value) : null;
  const length = measured && $('#length').value !== '' ? Number($('#length').value) : null;
  const crackLayer = $('#crackLayer input:checked')?.value || 'unknown';
  return width !== null || length !== null || !['unknown', 'exact'].includes(widthMode) || crackLayer !== 'unknown' ? { measured, widthMode, width, length, crackPattern: $('#crackPattern').value, crackLayer } : undefined;
}, fail);
for (const selector of ['#tileCrackCount', '#tileBrokenCount', '#tileBulgeCount']) {
  const buttons = document.createElement('div'); buttons.className = 'choice-chips';
  buttons.innerHTML = [1, 2, 5, 10, 15, 20].map(n => `<button type="button" data-value="${n}">${n} 塊</button>`).join('') + [-1, 1, 10].map(n => `<button type="button" data-step="${n}">${n > 0 ? '＋' : '−'}${Math.abs(n)}</button>`).join('');
  const description = document.createElement('select'); description.id = selector.slice(1) + 'Text'; description.setAttribute('aria-label', selector.includes('Crack') ? '磁磚裂隙數量記法' : selector.includes('Bulge') ? '磁磚拱起數量記法' : '磁磚破損數量記法'); description.innerHTML = opts({ '': '輸入塊數', '十餘塊': '十餘塊', '二十餘塊': '二十餘塊', '多處': '多處（未計數）' });
  $(selector).parentElement.append(description, buttons);
  description.onchange = () => { if (description.value) { $(selector).value = ''; $('#tileOverlapCount').value = ''; } };
  buttons.onclick = event => { const b = event.target.closest('button'); if (!b) return; if (b.dataset.step && description.value) { toast('請先輸入已確認的塊數，再加減'); return; } description.value = ''; $(selector).value = b.dataset.value ?? Math.max(0, Math.min(99999, Number($(selector).value || 0) + Number(b.dataset.step))); changed(); };
}
const applyFont = large => { document.body.classList.toggle('large-type', large); $('#fontSize').setAttribute('aria-pressed', String(large)); $('#fontSize').textContent = large ? '標準字' : '大字'; preference.set('large-type', String(large)); };
applyFont(preference.get('large-type') === 'true'); $('#fontSize').onclick = () => applyFont(!document.body.classList.contains('large-type'));
$('#fieldPresets').onclick = e => { const b = e.target.closest('[data-field-preset]'); if (!b) return; $('#condition input[value="normal"]').checked = false; if (b.dataset.fieldPreset === 'u') { $('#component input[value="梁"]').checked = true; $('#condition input[value="crack"]').checked = true; $('#crackPattern').value = 'u'; } else { $('#component input[value="牆面"]').checked = true; $('#surface').value = 'tile'; $('#tileCrack').checked = true; $('#condition input[value="crack"]').checked = true; } changed(); };
organisation = createOrganisationController({ $, action, commit, getProject: () => project, openModal, closeModal, render, requireNoRecording, esc });
reports = createReportController({ $, setDirty: value => { modalDirty = value; }, action, commit, getProject: () => project, getMedia, mediaURL, openModal, closeModal, download, busyText, editDetail: rid => editRecordDetail(rid, 'report'), editPhoto: async (rid, mid) => { recordId = rid; unitId = currentRecord().unitId; activeView = 'work'; await render(); await photoDialog(mid); }, editRecord: async rid => { recordId = rid; unitId = currentRecord().unitId; activeView = 'work'; await render(); } });
$('#help').onclick = () => action(helpDialog); $('#closeModal').onclick = () => closeModal(); $('#modal').addEventListener('cancel', e => { e.preventDefault(); closeModal(); }); $('#dismissError').onclick = () => { $('#errorBar').hidden = true; };
window.addEventListener('beforeunload', e => { if (dirty || formSaving || recording || conflictDraft || modalDirty || reports?.dirty) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) saveForm().catch(fail); });
window.addEventListener('unhandledrejection', e => { e.preventDefault(); fail(e.reason); });
async function init() {
  assert(isSecureContext && crypto.subtle && crypto.randomUUID, '請以 HTTPS 或本機 localhost 開啟。手機不能透過一般 HTTP 網址使用此工具。');
  await openStore(); const existing = (await allProjects()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); await selectProject(existing[0]?.id || '');
  initOffline().catch(e => { $('#offlineStatus').textContent = '離線資源尚未就緒'; fail(e); });
}
init().catch(e => { fail(e); $('#offlineStatus').textContent = '資料庫尚未開啟，請依提示處理後重新整理'; for (const selector of ['#startCase', '#welcomeImport']) $(selector).disabled = true; });
