import { clone, id, now, sha256, SIGNER_GROUPS, SIGNER_ROLES, SIGNER_STATUSES, UNIT_STATES, assert } from './model.js';
import { proposedSignoff, sealSignoff, signoffChanged, signoffHTML, signoffPNGs } from './signoff.js';
import { getProfileSignature, saveProfileSignature } from './store.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || `UTC${-new Date().getTimezoneOffset() / 60}`;
const roleGroup = role => ['resident', 'proxy', 'management'].includes(role) ? 'resident' : role === 'surveyor' ? 'surveyor' : 'attendee';
const blobFromCanvas = canvas => new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

export function createSignoffController(api) {
  const { $, action, commit, getProject, getMedia, openModal, closeModal, download, render } = api;
  let context = null, overlay = null, drawing = null, held = null;
  const selected = () => {
    const p = getProject(); return (p.signoffs || []).findLast(x => x.level === context.level && x.unitId === context.unitId && x.visitId === context.visitId && (context.level === 'unit' || !context.date || x.date === context.date));
  };
  async function persist(x, asset) {
    const p = clone(getProject());
    if (asset) p.media.push(asset.meta);
    const previous = p.signoffs?.findIndex(y => y.id === x.id) ?? -1;
    p.signoffs ||= [];
    if (previous >= 0) p.signoffs[previous] = x; else p.signoffs.push(x);
    await sealSignoff(p, x);
    await commit(next => {
      if (asset) next.media.push(asset.meta);
      next.signoffs ||= [];
      const at = next.signoffs.findIndex(y => y.id === x.id);
      if (at >= 0) next.signoffs[at] = x; else next.signoffs.push(x);
    }, asset ? [{ id: asset.meta.id, blob: asset.blob }] : []);
  }
  async function assetFromBlob(blob, name, kind) {
    assert(blob instanceof Blob && blob.size > 0 && blob.size <= 60 * 1024 * 1024, '影像檔案大小不正確');
    return { meta: { id: id(), kind, name, type: blob.type, size: blob.size, sha256: await sha256(blob), importedAt: now() }, blob };
  }
  function snapshotForm(x) {
    const form = $('#signoffForm'), data = new FormData(form);
    x.date = String(data.get('date')); x.weather = String(data.get('weather')).trim(); x.status = String(data.get('status'));
    x.reason = String(data.get('reason')).trim(); x.scope = String(data.get('scope')).trim();
    assert(!['partial', 'inaccessible'].includes(x.status) || x.reason, '請填未完成／無法入內原因');
    assert(x.date, '請確認會勘日期');
    const role = String(data.get('role')), status = String(data.get('signerStatus'));
    const signer = { id: id(), role, group: roleGroup(role), name: String(data.get('name')).trim(), org: String(data.get('org')).trim(), title: String(data.get('title')).trim(), relation: String(data.get('relation')).trim(),
      status, reason: String(data.get('signerReason')).trim(), signedAt: now(), timeZone: zone(), source: 'live' };
    assert(status === 'signed' || signer.name, '拒簽、不在場或紙本紀錄請填姓名');
    assert(role !== 'proxy' || signer.relation, '代理人須填與住戶關係');
    if (status === 'refused') assert(signer.reason, '拒簽須填原因');
    if (['refused', 'absent'].includes(status)) {
      const witness = x.signers.find(y => y.group === 'surveyor' && y.status === 'signed' && !y.voided);
      assert(witness, '請先由鑑定人員親簽，才能記錄拒簽或不在場'); signer.attestedBy = witness.id;
    }
    return signer;
  }
  function openVoidForm(button, save) {
    for (const other of $('#modalBody').querySelectorAll('.signoff-void')) other.remove();
    for (const other of $('#modalBody').querySelectorAll('[data-void-signer]')) other.hidden = false;
    const form = document.createElement('form');
    form.className = 'signoff-void'; form.noValidate = true;
    form.innerHTML = '<label>作廢原因（必填）<textarea name="voidReason" rows="2" maxlength="500" required></textarea></label><p class="micro">原簽名與紀錄會保留於案件備份，簽認單改列作廢。</p><p class="signoff-void-error danger-text" role="alert" hidden></p><div class="signoff-void-actions"><button type="button" class="secondary" data-void-cancel>取消</button><button type="submit" class="primary">確認作廢</button></div>';
    button.closest('.panel').append(form); button.hidden = true;
    const field = form.elements.voidReason, error = form.querySelector('.signoff-void-error');
    field.oninput = () => { error.hidden = true; };
    form.querySelector('[data-void-cancel]').onclick = () => { form.remove(); button.hidden = false; button.focus(); };
    form.onsubmit = event => {
      event.preventDefault();
      const reason = field.value.trim();
      if (!reason) { error.textContent = '請填作廢原因；未填原因不會作廢。'; error.hidden = false; field.focus(); return; }
      save(reason);
    };
    field.focus(); form.scrollIntoView({ block: 'nearest' });
  }
  async function open(unitId, visitId, date = '') {
    const p = getProject(); assert(p && p.visits.some(v => v.id === visitId), '請先選擇會勘批次');
    context = { level: unitId ? 'unit' : 'visit', unitId, visitId, date };
    const x = selected() || (unitId ? proposedSignoff(p, unitId, visitId) : {
      id: id(), level: 'visit', visitId, date: date || new Date().toISOString().slice(0, 10), weather: '', status: 'complete', reason: '', scope: '',
      statement: { text: p.signingSettings?.statement?.attendee || '', revision: '1' },
      summary: { records: 0, photos: 0, spaces: [], inaccessible: 0, pending: 0 },
      recordsDigest: '0'.repeat(64), snapshotHash: '0'.repeat(64), signers: [], createdAt: now(), updatedAt: now()
    });
    const u = p.units.find(u => u.id === unitId), changed = x.signers.length && await signoffChanged(p, x);
    const profile = p.signingSettings?.allowProfileSignature ? await getProfileSignature() : null;
    const active = x.signers.filter(y => !y.voided);
    const defaultRole = unitId ? u?.kind === 'public' ? 'management' : 'resident' : 'contractor';
    openModal(unitId ? `${u.code} · 會勘簽認` : '本批次會同人員簽到', `<p>案號：${esc(p.code)}　${unitId ? `戶別：${esc(u.code)} · ${esc(u.address)}` : `批次：${esc(p.visits.find(v => v.id === visitId).name)}`}</p>
      <p class="modal-note">確認下方資料後，向下滑按「交付手機開始觸控簽名」。觸控簽名不必輸入姓名。</p>
      ${changed ? '<p class="modal-note danger-text">簽署後紀錄有更動，請核對簽署時的範圍與目前內容。</p>' : ''}
      <p class="micro">簽署時摘要：${x.summary.records} 處紀錄、${x.summary.photos} 張採用照片、${x.summary.spaces.map(esc).join('、') || '尚無空間'}；待補 ${x.summary.pending} 項。</p>
      <div class="signoff-existing">${active.map(y => `<div class="panel">${esc(y.name || '姓名未另填')} · ${esc(SIGNER_ROLES[y.role])} · ${esc(SIGNER_STATUSES[y.status])}　<small>${esc(y.signedAt)}</small><button type="button" data-void-signer="${esc(y.id)}" class="quiet">作廢</button></div>`).join('') || '<p>尚未簽認。</p>'}</div>
      <form id="signoffForm"><div class="two-col"><label>本戶會勘日期<input type="date" name="date" value="${esc(x.date)}" required></label><label>天氣<select name="weather"><option value="">未記錄</option>${['晴', '陰', '雨', '其他'].map(v => `<option value="${v}" ${x.weather === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <label>本次狀態<select name="status">${Object.entries(UNIT_STATES).map(([v, t]) => `<option value="${v}" ${x.status === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>未完成／無法入內原因<textarea name="reason" rows="2">${esc(x.reason)}</textarea></label><label>本次會勘範圍<textarea name="scope" rows="2">${esc(x.scope)}</textarea></label>
      <div class="statement-preview"><strong>簽署前聲明</strong><p>${esc(x.statement.text)}</p></div><p class="micro">建議完成紀錄後再簽。若先簽，表單會列出簽署時待補項目。</p>
      <label>簽署人角色<select name="role">${Object.entries(SIGNER_ROLES).filter(([key]) => unitId || !['resident', 'proxy', 'management'].includes(key)).map(([v, t]) => `<option value="${v}" ${v === defaultRole ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label><span id="signoffNameLabel">姓名（觸控簽名選填，可直接簽）</span><input name="name" maxlength="200" autocomplete="off"></label><div class="two-col"><label>單位<input name="org" maxlength="200"></label><label>職稱<input name="title" maxlength="200"></label></div><label>與住戶關係（代理人必填）<input name="relation" maxlength="200"></label>
      <label>簽認方式<select name="signerStatus">${Object.entries(SIGNER_STATUSES).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>${profile ? '<label class="check-label"><input name="useProfile" type="checkbox">鑑定人員使用裝置預存簽名（只適用鑑定人員，表上會註明）</label>' : ''}<label>拒簽原因<input name="signerReason" maxlength="500"></label><label>紙本簽章照片<input name="paper" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" capture="environment"></label><p class="micro">拒簽、不在場須先由鑑定人員在本表簽名見證。紙本簽章照片只存於本機案件與匯出的案件檔。</p><button type="submit" class="primary full">交付手機開始觸控簽名</button></form>
      <div class="choice-chips"><button type="button" id="blankSignoff">空白簽認單</button>${x.signers.length ? '<button type="button" id="exportSignoff">預覽／匯出簽認單</button>' : ''}</div>`);
    const updateSignerMode = () => {
      const signed = $('#signoffForm [name=signerStatus]').value === 'signed';
      $('#signoffForm [name=name]').required = !signed;
      $('#signoffNameLabel').textContent = signed ? '姓名（選填，可直接觸控簽名）' : '姓名（此紀錄必填）';
      $('#signoffForm button[type=submit]').textContent = signed ? '交付手機開始觸控簽名' : '保存簽認紀錄';
    };
    $('#signoffForm [name=signerStatus]').onchange = updateSignerMode;
    updateSignerMode();
    $('#signoffForm').onsubmit = event => {
      event.preventDefault();
      const draft = clone(x);
      try {
        const signer = snapshotForm(draft), file = $('#signoffForm [name=paper]').files[0];
        if (signer.status === 'signed' && $('#signoffForm [name=useProfile]')?.checked) action(async () => {
          assert(signer.group === 'surveyor' && p.signingSettings?.allowProfileSignature && profile, '預存簽名只供已啟用的鑑定人員使用');
          const asset = await assetFromBlob(profile.blob, `${signer.name || SIGNER_ROLES[signer.role]}-預存簽名.png`, 'signature');
          signer.mediaId = asset.meta.id; signer.strokes = clone(profile.strokes); signer.source = 'profile'; draft.signers.push(signer);
          await persist(draft, asset); closeModal(true); await render(); await open(unitId, visitId, date);
        });
        else if (signer.status === 'signed') { closeModal(true); startHandoff(draft, signer, p, u); }
        else action(async () => {
          let asset;
          if (signer.status === 'paper') { assert(file, '請拍攝或選取紙本簽章照片'); asset = await assetFromBlob(file, file.name, 'image'); signer.mediaId = asset.meta.id; }
          draft.signers.push(signer); await persist(draft, asset); closeModal(true); await render(); await open(unitId, visitId, date);
        }, '保存簽認紀錄');
      } catch (error) { $('#modalError').textContent = error.message; $('#modalError').hidden = false; }
    };
    $('#modalBody').onclick = event => {
      const voidButton = event.target.closest('[data-void-signer]');
      if (voidButton) openVoidForm(voidButton, reason => action(async () => { const draft = clone(x); draft.signers.find(y => y.id === voidButton.dataset.voidSigner).voided = { at: now(), reason }; await persist(draft); closeModal(true); await render(); await open(unitId, visitId, date); }, '作廢簽認紀錄'));
      if (event.target.closest('#blankSignoff')) action(async () => output(x, true));
      if (event.target.closest('#exportSignoff')) action(async () => output(x, false));
    };
  }
  async function output(x, blank) {
    const p = getProject(), changed = !blank && await signoffChanged(p, x);
    const html = await signoffHTML(p, x, getMedia, { blank, changed });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    openModal(blank ? '空白簽認單' : '簽認單預覽', '<p>請核對戶別、日期、聲明與簽名。列印時選 A4，關閉瀏覽器頁首頁尾。</p><div class="choice-chips"><button id="printSignoff" class="secondary">列印／另存 PDF</button><button id="downloadSignoff" class="primary">下載獨立 HTML</button><button id="downloadSignoffPng" class="secondary">下載 PNG</button></div><iframe id="signoffPreview" title="會勘簽認單預覽"></iframe>', () => URL.revokeObjectURL(url));
    $('#signoffPreview').src = url;
    $('#printSignoff').onclick = () => $('#signoffPreview').contentWindow.print();
    $('#downloadSignoff').onclick = () => download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${p.code}-${x.unitId ? p.units.find(u => u.id === x.unitId).code : '批次簽到'}-會勘簽認${blank ? '-空白' : ''}.html`);
    $('#downloadSignoffPng').onclick = () => action(async () => {
      const images = await signoffPNGs(p, x, getMedia, { blank, changed });
      for (const [i, blob] of images.entries()) download(blob, `${p.code}-${x.unitId ? p.units.find(u => u.id === x.unitId).code : '批次簽到'}-會勘簽認${blank ? '-空白' : ''}${images.length > 1 ? '-第' + (i + 1) + '頁' : ''}.png`);
    }, '產生簽認單 PNG');
  }
  async function settings() {
    const p = getProject(), s = p.signingSettings || { statement: { resident: '', attendee: '' }, attendeePolicy: 'visit-sheet', allowProfileSignature: false };
    const existing = (p.signoffs || []).flatMap(x => x.signers.filter(y => y.group === 'surveyor' && y.status === 'signed' && y.source === 'live' && !y.voided).map(y => ({ y, x })));
    const profile = await getProfileSignature();
    openModal('會勘簽認設定', `<form id="signoffSettings"><label>住戶側聲明<textarea name="resident" rows="5" required>${esc(s.statement.resident)}</textarea></label><label>會同人員聲明<textarea name="attendee" rows="4" required>${esc(s.statement.attendee)}</textarea></label><label>會同人員簽認方式<select name="attendeePolicy"><option value="visit-sheet" ${s.attendeePolicy === 'visit-sheet' ? 'selected' : ''}>每批次每日簽到一次</option><option value="per-unit" ${s.attendeePolicy === 'per-unit' ? 'selected' : ''}>每戶重簽</option></select></label><label class="check-label"><input name="allowProfileSignature" type="checkbox" ${s.allowProfileSignature ? 'checked' : ''}>允許鑑定人員使用本裝置預存簽名</label><button class="primary" type="submit">保存簽認設定</button></form><hr><p>本裝置預存簽名：${profile ? esc(profile.updatedAt) : '尚無'}。先在本案親簽一次，再選擇下方簽名存到本裝置；其他案件可使用，但不會隨程式發布。</p>${existing.length ? `<label>選擇已親簽的鑑定人員<select id="profileSource">${existing.map(({ y }) => `<option value="${esc(y.id)}">${esc(y.name || '姓名未另填')} · ${esc(y.signedAt)}</option>`).join('')}</select></label><button id="saveSignatureProfile" class="secondary">存為本裝置預存簽名</button>` : '<p class="micro">本案尚無鑑定人員親簽。</p>'}`);
    $('#signoffSettings').onsubmit = event => { event.preventDefault(); action(async () => {
      const form = new FormData($('#signoffSettings'));
      await commit(next => { next.signingSettings = { ...next.signingSettings, statement: { resident: String(form.get('resident')).trim(), attendee: String(form.get('attendee')).trim() }, attendeePolicy: String(form.get('attendeePolicy')), allowProfileSignature: form.has('allowProfileSignature'), surveyors: next.signingSettings?.surveyors || [] }; });
      closeModal(true); await render();
    }); };
    if (existing.length) $('#saveSignatureProfile').onclick = () => action(async () => {
      const y = existing.find(({ y }) => y.id === $('#profileSource').value)?.y; assert(y, '找不到簽名來源');
      const asset = await getMedia(y.mediaId); assert(asset?.blob, '找不到簽名影像');
      await saveProfileSignature(asset.blob, y.strokes); closeModal(true); await settings();
    });
  }
  function selectMany() {
    const p = getProject(), units = p.units.filter(u => (p.signoffs || []).some(x => x.level === 'unit' && x.unitId === u.id && x.signers.some(y => !y.voided)));
    assert(units.length, '尚無可匯出的簽認單');
    openModal('選擇簽認單戶別', `<p>勾選要輸出的戶別；每戶採用最近一份簽認紀錄。</p><div class="choice-chips"><button id="selectAllSignoffs">全選</button><button id="clearAllSignoffs">清除</button></div><div id="bulkSignoffUnits">${units.map(u => `<label class="check-label"><input type="checkbox" value="${esc(u.id)}" checked>${esc(u.code)} · ${esc(u.address)}</label>`).join('')}</div><button id="makeBulkSignoffs" class="primary full">製作所選簽認單</button>`);
    $('#selectAllSignoffs').onclick = () => $('#bulkSignoffUnits').querySelectorAll('input').forEach(i => { i.checked = true; });
    $('#clearAllSignoffs').onclick = () => $('#bulkSignoffUnits').querySelectorAll('input').forEach(i => { i.checked = false; });
    $('#makeBulkSignoffs').onclick = () => action(async () => {
      const ids = [...$('#bulkSignoffUnits').querySelectorAll('input:checked')].map(i => i.value);
      assert(ids.length, '請至少勾選一戶');
      const selected = ids.map(uid => (p.signoffs || []).filter(x => x.level === 'unit' && x.unitId === uid).at(-1));
      const parser = new DOMParser(), doc = parser.parseFromString(await signoffHTML(p, selected[0], getMedia, { changed: await signoffChanged(p, selected[0]), page: 1 }), 'text/html');
      let nextPage = doc.querySelectorAll('.sheet').length + 1;
      for (let i = 1; i < selected.length; i++) {
        const x = selected[i], page = parser.parseFromString(await signoffHTML(p, x, getMedia, { changed: await signoffChanged(p, x), page: nextPage }), 'text/html');
        for (const sheet of page.querySelectorAll('.sheet')) doc.body.append(sheet);
        nextPage = doc.querySelectorAll('.sheet').length + 1;
      }
      const html = '<!doctype html>' + doc.documentElement.outerHTML;
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      openModal(`${selected.length} 戶簽認單`, `<p>每戶一頁。請核對各戶日期、簽名與簽後更動提示。</p><div class="choice-chips"><button id="printBulkSignoffs" class="secondary">列印／另存 PDF</button><button id="downloadBulkSignoffs" class="primary">下載 HTML</button><button id="downloadBulkPng" class="secondary">下載各戶 PNG</button></div><iframe id="signoffPreview" title="所選會勘簽認單預覽"></iframe>`, () => URL.revokeObjectURL(url));
      $('#signoffPreview').src = url;
      $('#printBulkSignoffs').onclick = () => $('#signoffPreview').contentWindow.print();
      $('#downloadBulkSignoffs').onclick = () => download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${p.code}-所選${selected.length}戶-會勘簽認.html`);
      $('#downloadBulkPng').onclick = () => action(async () => {
        for (const x of selected) {
          const name = p.units.find(u => u.id === x.unitId).code;
          const images = await signoffPNGs(p, x, getMedia, { changed: await signoffChanged(p, x) });
          for (const [i, blob] of images.entries()) download(blob, `${p.code}-${name}-會勘簽認${images.length > 1 ? '-第' + (i + 1) + '頁' : ''}.png`);
        }
      }, '產生各戶簽認單 PNG');
    }, '製作所選簽認單');
  }
  function startHandoff(draft, signer, p, u) {
    const host = $('#signoffHandoff'); overlay = host;
    host.hidden = false; $('#app').inert = true;
    host.requestFullscreen?.().catch?.(() => {});
    host.innerHTML = `<div class="signoff-handoff-body"><h1>${esc(p.code)} · ${esc(u?.code || '批次簽到')}</h1><p>${esc(draft.date)} · ${esc(draft.scope || '本次會勘範圍如前頁')}</p><p>${esc(draft.statement.text)}</p><p class="micro">本次簽名資料僅用於本案現況鑑定紀錄，保存在本裝置，不會上傳。觸控簽名不是數位簽章。</p><h2>${esc([signer.name, SIGNER_ROLES[signer.role]].filter(Boolean).join(' · '))}</h2><p id="signoffTurnHint" class="micro">請在下方簽名；橫放手機較方便，直放仍可簽。</p><canvas id="signoffCanvas" aria-label="手寫簽名區"></canvas><p id="signoffDrawError" role="alert"></p><div class="choice-chips"><button id="signoffClear" class="secondary">清除重簽</button><button id="signoffSave" class="primary">確認簽名</button></div></div>`;
    drawing = createDrawing($('#signoffCanvas'));
    $('#signoffClear').onclick = () => drawing.clear();
    $('#signoffSave').onclick = async () => {
      if (!drawing.valid()) { $('#signoffDrawError').textContent = '筆跡過短，請重新簽名。'; return; }
      $('#signoffSave').disabled = true;
      try {
        const blob = await drawing.png(), asset = await assetFromBlob(blob, `${signer.name || SIGNER_ROLES[signer.role]}-簽名.png`, 'signature');
        signer.mediaId = asset.meta.id; signer.strokes = drawing.data(); draft.signers.push(signer);
        await persist(draft, asset);
        host.innerHTML = '<div class="signoff-handoff-body signoff-saved"><h1>簽名已保存</h1><p>請將手機交還鑑定人員。</p><button id="signoffReturn" class="primary">長按 1.5 秒：交還確認</button></div>';
        const button = $('#signoffReturn');
        const cancel = () => { clearTimeout(held); held = null; button.classList.remove('holding'); };
        button.onpointerdown = event => { event.preventDefault(); cancel(); button.setPointerCapture(event.pointerId); button.classList.add('holding'); held = setTimeout(async () => { cancel(); endHandoff(); await render(); await open(context.unitId, context.visitId, context.date); }, 1500); };
        button.onpointerup = button.onpointercancel = button.onlostpointercapture = cancel;
      } catch (error) { $('#signoffDrawError').textContent = error.message; $('#signoffSave').disabled = false; }
    };
    history.pushState({ surveySignoff: true }, '');
    window.addEventListener('popstate', keepHandoff);
    window.addEventListener('beforeunload', warnHandoff);
    screen.orientation?.lock?.('landscape')?.catch?.(() => {});
    navigator.wakeLock?.request?.('screen').then(lock => { if (overlay === host) host._wakeLock = lock; else lock.release(); }).catch(() => {});
  }
  function keepHandoff() { if (overlay) history.pushState({ surveySignoff: true }, ''); }
  function warnHandoff(event) { if (overlay) { event.preventDefault(); event.returnValue = ''; } }
  function endHandoff() {
    if (!overlay) return;
    drawing?.dispose(); drawing = null; overlay._wakeLock?.release?.(); overlay.hidden = true; overlay.innerHTML = ''; overlay = null; $('#app').inert = false;
    if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
    window.removeEventListener('popstate', keepHandoff); window.removeEventListener('beforeunload', warnHandoff);
  }
  return { open, output, settings, selectMany };
}

function createDrawing(canvas) {
  let strokes = [], active = null, pointer = null, width = 1, height = 1;
  const ctx = canvas.getContext('2d');
  function resize() {
    const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 3);
    width = Math.max(1, box.width); height = Math.max(1, box.height);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); redraw();
  }
  function redraw() {
    ctx.clearRect(0, 0, width, height); ctx.strokeStyle = '#111'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const stroke of strokes) {
      if (!stroke.length) continue;
      ctx.beginPath(); ctx.moveTo(stroke[0].x * width, stroke[0].y * height);
      for (let i = 1; i < stroke.length; i++) {
        const a = stroke[i - 1], b = stroke[i]; ctx.quadraticCurveTo(a.x * width, a.y * height, (a.x + b.x) * width / 2, (a.y + b.y) * height / 2);
      }
      const last = stroke.at(-1); ctx.lineTo(last.x * width, last.y * height); ctx.stroke();
    }
  }
  const point = event => { const box = canvas.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)), t: Math.max(0, Math.round(performance.now() - canvas._started)), p: event.pressure || .5 }; };
  canvas.onpointerdown = event => { if (pointer !== null) return; pointer = event.pointerId; canvas.setPointerCapture(pointer); canvas._started = performance.now(); active = [point(event)]; strokes.push(active); redraw(); };
  canvas.onpointermove = event => { if (event.pointerId !== pointer || !active) return; active.push(point(event)); redraw(); };
  canvas.onpointerup = canvas.onpointercancel = event => { if (event.pointerId !== pointer) return; if (event.type === 'pointerup' && active) active.push(point(event)); else strokes.pop(); pointer = null; active = null; redraw(); };
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  return {
    clear() { strokes = []; active = null; pointer = null; redraw(); },
    valid() { const points = strokes.flat(); let distance = 0; for (const stroke of strokes) for (let i = 1; i < stroke.length; i++) distance += Math.hypot((stroke[i].x - stroke[i - 1].x) * width, (stroke[i].y - stroke[i - 1].y) * height); return points.length >= 10 && distance >= width * .08; },
    data() { return { aspect: width / height, strokes: clone(strokes) }; },
    async png() {
      const points = strokes.flat(), xs = points.map(p => p.x), ys = points.map(p => p.y);
      const pad = .04, left = Math.max(0, Math.min(...xs) - pad), right = Math.min(1, Math.max(...xs) + pad), top = Math.max(0, Math.min(...ys) - pad), bottom = Math.min(1, Math.max(...ys) + pad);
      const crop = document.createElement('canvas'), scale = Math.min(1, 1200 / Math.max(1, (right - left) * canvas.width));
      crop.width = Math.max(1, Math.ceil((right - left) * canvas.width * scale)); crop.height = Math.max(1, Math.ceil((bottom - top) * canvas.height * scale));
      crop.getContext('2d').drawImage(canvas, left * canvas.width, top * canvas.height, (right - left) * canvas.width, (bottom - top) * canvas.height, 0, 0, crop.width, crop.height);
      return blobFromCanvas(crop);
    },
    dispose() { observer.disconnect(); canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null; }
  };
}
