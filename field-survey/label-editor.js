import { drawPlanOverlay } from './annotation.js';
import { labelAnchor, sameLabelTarget } from './plan-labels.js';
import { attachmentIndex, groupPlanEntries, escapeHTML as e } from './report.js';

export async function openLabelEditor(api, options) {
  const { $, getProject, getMedia, openModal, action, commit } = api;
  const project = getProject(), index = attachmentIndex(project, options);
  const records = index.groups.flatMap(g => g.records), plans = project.plans.map(plan => ({ plan, entries: groupPlanEntries({ records }, plan.id) })).filter(x => x.entries.length);
  if (!plans.length) throw new Error('目前選片尚未定位，請先標示照片拍攝點。');
  let current, geometry, positions, selected = -1, mode = 'label', dirty = false, disposed = false, token = 0, frame, pending, imageURL;
  let view, width = 1200, height = 900, gesture; const pointers = new Map(), history = [], future = [];
  const markDirty = value => { dirty = value; api.setDirty?.(value); };
  const checkpoint = () => { history.push(structuredClone(positions)); future.length = 0; };
  openModal('調整圖面編號', `<div class="label-controls"><label>圖面<select id="labelPlan">${plans.map((x, i) => `<option value="${i}">${e(project.units.find(u => u.id === x.plan.unitId)?.code)} · ${e(x.plan.floor)} · ${e(x.plan.title)}</option>`).join('')}</select></label><div class="label-toolbar"><button id="labelMode" class="secondary" aria-pressed="true" aria-label="調整編號">編號</button><button id="labelPan" class="secondary" aria-pressed="false" aria-label="移動畫面">移動</button><button id="labelAuto" class="secondary" aria-label="自動避讓">避讓</button><button id="labelZoomOut" aria-label="縮小">−</button><button id="labelZoomIn" aria-label="放大">＋</button><button id="labelFit">全圖</button></div><label>照片編號<select id="labelSelect"></select></label><div id="labelActions" class="choice-chips" hidden><button id="labelLock">鎖定位置</button><button id="labelReset">還原自動</button><details class="label-fine"><summary>微調</summary><div class="choice-chips"><button data-label-nudge="-1,0" aria-label="編號左移">←</button><button data-label-nudge="1,0" aria-label="編號右移">→</button><button data-label-nudge="0,-1" aria-label="編號上移">↑</button><button data-label-nudge="0,1" aria-label="編號下移">↓</button></div></details></div><p id="labelHint" class="micro" role="status">點編號，再點空白處；也可拖曳。移位後鎖定，拍攝點與方向不變。</p></div><div id="labelStage"><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="照片編號排版"></svg></div><div class="label-dock"><button id="labelUndo">復原</button><button id="labelRedo">重做</button><button id="saveLabelLayout" class="primary">保存編號位置</button></div>`, () => { disposed = true; cancelAnimationFrame(frame); if (imageURL) URL.revokeObjectURL(imageURL); });
  $('#modal').dataset.mode = 'labels'; const svg = $('#labelStage svg');
  function selectedLabel() { return geometry?.labels[selected]; }
  function updateView() { svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); }
  function fit() { view = { x: 0, y: 0, w: width, h: height }; updateView(); }
  function state() {
    const b = selectedLabel(); $('#labelActions').hidden = !b; $('#labelSelect').value = String(selected);
    $('#labelMode').setAttribute('aria-pressed', String(mode === 'label')); $('#labelPan').setAttribute('aria-pressed', String(mode === 'pan'));
    for (const g of svg.querySelectorAll('[data-plan-arrow]')) { const active = !b || current.entries[Number(g.dataset.planArrow)] === b.entry; g.style.opacity = active ? '1' : '.3'; g.querySelectorAll('path,ellipse').forEach(el => el.setAttribute('stroke', active && b ? '#145ea8' : '#df443a')); }
    $('#labelLock').textContent = b?.preferred?.locked ? '已鎖定' : '鎖定位置'; $('#labelLock').setAttribute('aria-label', b?.preferred?.locked ? '解鎖編號位置' : '鎖定編號位置');
    $('#labelUndo').disabled = !history.length; $('#labelRedo').disabled = !future.length;
    $('#saveLabelLayout').disabled = !geometry || geometry.labels.some(b => b.invalid);
    for (const g of svg.querySelectorAll('[data-plan-label]')) { g.style.cursor = mode === 'label' ? 'move' : 'grab'; g.style.opacity = selected < 0 || Number(g.dataset.planLabel) === selected ? '1' : '.55'; }
    $('#labelHint').textContent = geometry?.labels.some(b => b.invalid) ? '紅框編號重疊或超出圖面，請移位或解鎖後自動避讓。拍攝點不變。' : geometry?.labels.some(b => b.stale) ? '原定位或群組已變更，請核對新排版後保存。' : '點編號，再點空白處；也可拖曳。移位後鎖定，拍攝點與方向不變。';
  }
  function draw() {
    geometry = drawPlanOverlay(svg, current.entries, width, height, positions, false);
    const img = document.createElementNS(svg.namespaceURI, 'image'); img.setAttribute('href', imageURL); img.setAttribute('width', width); img.setAttribute('height', height); svg.prepend(img);
    updateView(); state();
  }
  function setPosition(b, x, y, locked = true) {
    const matches = p => b.entry.targets.some(t => sameLabelTarget(t, p));
    positions = positions.filter(p => !matches(p));
    for (const target of b.entry.targets) positions.push({ ...target, x: Math.max(0, Math.min(1, x / width)), y: Math.max(0, Math.min(1, y / height)), locked, anchor: labelAnchor(b.entry) });
  }
  async function load(i) {
    const epoch = ++token; current = plans[i]; positions = structuredClone(current.plan.labelLayout || []); selected = -1; history.length = future.length = 0;
    const asset = await getMedia(current.plan.mediaId); if (disposed || epoch !== token) return;
    if (imageURL) URL.revokeObjectURL(imageURL); imageURL = URL.createObjectURL(asset.blob);
    const img = new Image(); img.src = imageURL; await img.decode(); if (disposed || epoch !== token) return;
    width = 1200; height = width * img.naturalHeight / img.naturalWidth; fit(); draw();
    $('#labelSelect').innerHTML = '<option value="-1">選擇編號</option>' + geometry.labels.map((b, j) => `<option value="${j}">${e(b.entry.label)}</option>`).join(''); markDirty(false);
  }
  $('#labelPlan').onchange = event => { const i = Number(event.target.value); if (dirty && !confirm('切換圖面將放棄尚未保存的編號調整，是否繼續？')) { event.target.value = String(plans.indexOf(current)); return; } action(() => load(i)); };
  $('#labelSelect').onchange = event => { selected = Number(event.target.value); mode = 'label'; state(); };
  const modeState = () => { $('#labelMode').setAttribute('aria-pressed', String(mode === 'label')); $('#labelPan').setAttribute('aria-pressed', String(mode === 'pan')); state(); };
  $('#labelMode').onclick = () => { mode = 'label'; modeState(); }; $('#labelPan').onclick = () => { mode = 'pan'; modeState(); };
  const zoom = factor => { const w = Math.max(width / 8, Math.min(width * 2, view.w * factor)), h = w * height / width; view = { x: view.x + (view.w - w) / 2, y: view.y + (view.h - h) / 2, w, h }; updateView(); };
  $('#labelZoomIn').onclick = () => zoom(.8); $('#labelZoomOut').onclick = () => zoom(1.25); $('#labelFit').onclick = fit;
  $('#labelLock').onclick = () => { const b = selectedLabel(); if (!b) return; checkpoint(); setPosition(b, b.x, b.y, !b.preferred?.locked); markDirty(true); draw(); };
  $('#labelReset').onclick = () => { const b = selectedLabel(); if (!b) return; checkpoint(); positions = positions.filter(p => !b.entry.targets.some(t => sameLabelTarget(t, p))); markDirty(true); draw(); };
  $('#labelAuto').onclick = () => { checkpoint(); positions = positions.filter(p => p.locked); markDirty(true); draw(); };
  for (const b of $('#labelActions').querySelectorAll('[data-label-nudge]')) b.onclick = () => { const item = selectedLabel(); if (!item) return; const [dx, dy] = b.dataset.labelNudge.split(',').map(Number); checkpoint(); setPosition(item, item.x + dx * view.w / 60, item.y + dy * view.w / 60); markDirty(true); draw(); };
  const undo = (from, to) => { if (!from.length) return; to.push(structuredClone(positions)); positions = from.pop(); markDirty(true); draw(); };
  $('#labelUndo').onclick = () => undo(history, future); $('#labelRedo').onclick = () => undo(future, history);
  const point = event => { const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const screen = event => ({ x: event.clientX, y: event.clientY });
  svg.onpointerdown = event => {
    if (event.button > 0) return; event.preventDefault(); pointers.set(event.pointerId, screen(event)); svg.setPointerCapture(event.pointerId);
    if (pointers.size > 2) return;
    if (pointers.size === 2) { cancelAnimationFrame(frame); frame = 0; pending = null; draw(); const [a, b] = [...pointers.values()]; gesture = { type: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), view: { ...view }, anchor: point({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }) }; return; }
    const g = event.target.closest('[data-plan-label]'), p = point(event);
    if (mode === 'label' && g) { selected = Number(g.dataset.planLabel); state(); const b = selectedLabel(); gesture = { type: 'label', start: p, x: b.x, y: b.y, moved: false }; }
    else if (mode === 'label' && selectedLabel()) gesture = { type: 'place', start: p };
    else gesture = { type: 'pan', screen: screen(event), view: { ...view }, scale: svg.getScreenCTM().a };
  };
  svg.onpointermove = event => {
    if (!pointers.has(event.pointerId)) return; pointers.set(event.pointerId, screen(event));
    if (gesture?.type === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()], rect = svg.getBoundingClientRect(), factor = gesture.distance / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const w = Math.max(width / 8, Math.min(width * 2, gesture.view.w * factor)), h = w * height / width;
      const scale = Math.min(rect.width / w, rect.height / h), left = rect.left + (rect.width - w * scale) / 2, top = rect.top + (rect.height - h * scale) / 2;
      view = { x: gesture.anchor.x - ((a.x + b.x) / 2 - left) / scale, y: gesture.anchor.y - ((a.y + b.y) / 2 - top) / scale, w, h }; updateView(); return;
    }
    if (gesture?.type === 'pan') { view = { ...gesture.view, x: gesture.view.x - (event.clientX - gesture.screen.x) / gesture.scale, y: gesture.view.y - (event.clientY - gesture.screen.y) / gesture.scale }; updateView(); return; }
    if (gesture?.type !== 'label') return;
    const p = point(event); if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) < view.w / 200) return;
    gesture.moved = true; pending = { x: gesture.x + p.x - gesture.start.x, y: gesture.y + p.y - gesture.start.y };
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (!pending || disposed) return; const b = selectedLabel(), g = svg.querySelector(`[data-plan-label="${selected}"]`), line = svg.querySelector(`[data-leader="${selected}"]`); g.setAttribute('transform', `translate(${pending.x} ${pending.y})`); line.setAttribute('x2', Math.max(pending.x, Math.min(pending.x + b.w, b.ax))); line.setAttribute('y2', Math.max(pending.y, Math.min(pending.y + b.h, b.ay))); });
  };
  const finish = event => {
    if (!pointers.has(event.pointerId)) return; pointers.delete(event.pointerId); cancelAnimationFrame(frame); frame = 0;
    if (event.type !== 'pointercancel' && gesture && !pointers.size) {
      const b = selectedLabel(); if (b && (gesture.type === 'label' && gesture.moved || gesture.type === 'place')) { const p = point(event); checkpoint(); setPosition(b, gesture.type === 'place' ? p.x : gesture.x + p.x - gesture.start.x, gesture.type === 'place' ? p.y : gesture.y + p.y - gesture.start.y); markDirty(true); }
    }
    pending = null; gesture = null; draw();
  };
  svg.onpointerup = svg.onpointercancel = finish;
  $('#saveLabelLayout').onclick = () => action(async () => {
    if (geometry.labels.some(b => b.invalid)) throw new Error('請先調整紅框編號。');
    // Persist every visible target, so numbering changes do not move its label.
    for (const b of geometry.labels) setPosition(b, b.x, b.y, !!b.preferred?.locked);
    const saved = structuredClone(positions); await commit(p => { p.plans.find(x => x.id === current.plan.id).labelLayout = saved; });
    current.plan.labelLayout = saved; markDirty(false); api.closeModal(true); await api.render();
  });
  await load(0);
}
