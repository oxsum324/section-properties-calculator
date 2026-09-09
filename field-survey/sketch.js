import { emptySketch, validateSketch } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
export const sketchArea = sketch => ({ x: 24, y: 60, width: sketch.width - 48, height: sketch.height - 120 });
const twoPoint = type => ['line', 'rect', 'door', 'window'].includes(type);
const distance = (a, b, area) => Math.hypot((a.x - b.x) * area.width, (a.y - b.y) * area.height);
function objects(sketch) {
  const endpoints = [], segments = [];
  for (const stroke of sketch.strokes) {
    const a = stroke.points[0], b = stroke.points.at(-1);
    if (stroke.type === 'rect') {
      const corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
      endpoints.push(...corners); corners.forEach((p, i) => segments.push([p, corners[(i + 1) % 4]]));
    } else if (['line', 'door', 'window'].includes(stroke.type)) { endpoints.push(a, b); segments.push([a, b]); }
    else if (stroke.type === 'pen') endpoints.push(a, b);
  }
  return { endpoints, segments };
}
// Distances are measured in the drawing coordinate system, with a screen-pixel tolerance.
export function resolveSketchPoint(sketch, raw, { anchor = null, mode = 'line', snap = true, orthogonal = true, scale = 1 } = {}) {
  const area = sketchArea(sketch);
  const point = { x: Math.max(0, Math.min(1, raw.x)), y: Math.max(0, Math.min(1, raw.y)) };
  const locked = anchor && orthogonal && ['line', 'door', 'window'].includes(mode)
    ? Math.abs((point.x - anchor.x) * area.width) >= Math.abs((point.y - anchor.y) * area.height) ? 'horizontal' : 'vertical' : '';
  if (locked === 'horizontal') point.y = anchor.y;
  if (locked === 'vertical') point.x = anchor.x;
  const result = { point, kind: '', locked };
  if (!snap || ['pen', 'text'].includes(mode)) return result;
  const tolerance = 12 / Math.max(.05, scale), candidates = objects(sketch);
  const aligned = p => !locked || Math.abs(p[locked === 'horizontal' ? 'y' : 'x'] - anchor[locked === 'horizontal' ? 'y' : 'x']) < 1e-8;
  const allowed = p => aligned(p) && (!anchor || distance(anchor, p, area) > .01);
  let closest = null, best = tolerance;
  for (const p of candidates.endpoints) { const d = distance(point, p, area); if (allowed(p) && d <= best) { closest = p; best = d; } }
  if (closest) return { point: { ...closest }, kind: 'endpoint', locked };
  for (const [a, b] of candidates.segments) {
    const dx = (b.x - a.x) * area.width, dy = (b.y - a.y) * area.height, length2 = dx * dx + dy * dy;
    if (!length2) continue;
    let t;
    if (locked === 'horizontal' && Math.abs(b.y - a.y) > 1e-8) t = (anchor.y - a.y) / (b.y - a.y);
    else if (locked === 'vertical' && Math.abs(b.x - a.x) > 1e-8) t = (anchor.x - a.x) / (b.x - a.x);
    else t = ((point.x - a.x) * area.width * dx + (point.y - a.y) * area.height * dy) / length2;
    if (t < 0 || t > 1) continue;
    const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, d = distance(point, p, area);
    if (allowed(p) && d <= best) { closest = p; best = d; }
  }
  return closest ? { point: { ...closest }, kind: 'edge', locked } : result;
}
export function doorGeometry(a, b, swing) {
  const dx = b.x - a.x, dy = b.y - a.y;
  return { radius: Math.hypot(dx, dy), open: { x: a.x - swing * dy, y: a.y + swing * dx }, sweep: swing === 1 ? 1 : 0 };
}
function strokeSegments(stroke) {
  const p = stroke.points, a = p[0], b = p.at(-1);
  const points = stroke.type === 'rect' ? [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a] : p;
  return points.slice(1).map((q, i) => [points[i], q]);
}
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
  const t = d2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / d2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
// Pick visible geometry using screen-pixel tolerance, independently of paper size or zoom.
export function hitSketch(sketch, point, scale = 1) {
  const area = sketchArea(sketch), world = p => ({ x: p.x * area.width, y: p.y * area.height }), q = world(point);
  let best = 16 / Math.max(.05, scale), hit = null;
  const ordered = sketch.strokes.map((stroke, index) => ({ stroke, index })).sort((a, b) => Number(['door', 'window', 'text'].includes(a.stroke.type)) - Number(['door', 'window', 'text'].includes(b.stroke.type)));
  for (const { stroke, index } of ordered) {
    let segments = strokeSegments(stroke).map(pair => pair.map(world));
    const a = world(stroke.points[0]);
    if (stroke.type === 'text') {
      const width = [...stroke.text].reduce((n, c) => n + (/[^\x00-\xff]/.test(c) ? 48 : 29), 0);
      const d = Math.hypot(Math.max(a.x - q.x, 0, q.x - a.x - width), Math.max(a.y - 48 - q.y, 0, q.y - a.y - 8));
      if (d <= best) { best = d; hit = { index, segment: 0 }; } continue;
    }
    if (stroke.type === 'door') {
      const b = world(stroke.points[1]), g = doorGeometry(a, b, stroke.swing), angle = Math.atan2(b.y - a.y, b.x - a.x);
      const arc = Array.from({ length: 25 }, (_, i) => ({ x: a.x + g.radius * Math.cos(angle + stroke.swing * Math.PI / 2 * i / 24), y: a.y + g.radius * Math.sin(angle + stroke.swing * Math.PI / 2 * i / 24) }));
      segments.push([a, g.open], ...arc.slice(1).map((p, i) => [arc[i], p]));
    }
    if (stroke.type === 'window') {
      const b = world(stroke.points[1]), length = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
      const offset = (p, n) => ({ x: p.x + nx * n, y: p.y + ny * n });
      segments.push(...[-8, 8].map(n => [offset(a, n), offset(b, n)]), ...[a, b].map(p => [offset(p, -13), offset(p, 13)]));
    }
    segments.forEach(([a, b], segment) => { const d = segmentDistance(q, a, b); if (d <= best + 1e-8) { best = d; hit = { index, segment }; } });
  }
  return hit;
}
export function deleteSketchSelection(sketch, hit, whole = false) {
  validateSketch(sketch);
  if (!hit || !Number.isInteger(hit.index) || !sketch.strokes[hit.index]) throw new Error('請先點選要刪除的圖形');
  const result = structuredClone(sketch), stroke = result.strokes[hit.index];
  let remaining = [];
  if (!whole && ['rect', 'pen'].includes(stroke.type)) {
    const segments = strokeSegments(stroke);
    if (!Number.isInteger(hit.segment) || !segments[hit.segment]) throw new Error('請重新點選線段');
    remaining = stroke.type === 'rect' ? segments.filter((_, i) => i !== hit.segment).map(points => ({ type: 'line', points }))
      : [stroke.points.slice(0, hit.segment + 1), stroke.points.slice(hit.segment + 1)].filter(points => points.length >= 2).map(points => ({ type: 'pen', points }));
  }
  if (result.strokes.length - 1 + remaining.length > 300) throw new Error('拆分後超過 300 筆畫，請改選整個圖形刪除，或先刪除其他筆畫');
  result.strokes.splice(hit.index, 1, ...remaining);
  return validateSketch(result);
}
const node = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
};
function label(text, x, y, size, color) {
  const el = node('text', { x, y, fill: color, 'font-family': 'sans-serif', 'font-size': size });
  el.textContent = text; return el;
}
function paint(svg, sketch, draft = null) {
  const area = sketchArea(sketch);
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${sketch.width} ${sketch.height}`);
  svg.append(node('rect', { width: sketch.width, height: sketch.height, fill: '#fffdf7' }));
  const grid = node('g', { stroke: '#dfe7df', 'stroke-width': 1 });
  for (let x = area.x; x <= area.x + area.width; x += 48) grid.append(node('line', { x1: x, y1: area.y, x2: x, y2: area.y + area.height }));
  for (let y = area.y; y <= area.y + area.height; y += 48) grid.append(node('line', { x1: area.x, y1: y, x2: area.x + area.width, y2: y }));
  svg.append(grid);
  const defs = node('defs'), clip = node('clipPath', { id: 'sketch-ink' });
  clip.append(node('rect', { x: area.x, y: area.y, width: area.width, height: area.height })); defs.append(clip); svg.append(defs);
  const ink = node('g', { 'clip-path': 'url(#sketch-ink)' });
  const strokes = draft ? [...sketch.strokes, draft] : sketch.strokes;
  // Opening symbols are above walls even when a wall is added later.
  for (const stroke of [...strokes.filter(s => !['door', 'window', 'text'].includes(s.type)), ...strokes.filter(s => ['door', 'window', 'text'].includes(s.type))]) {
    const before = ink.children.length;
    const points = stroke.points.map(p => ({ x: area.x + p.x * area.width, y: area.y + p.y * area.height }));
    const a = points[0], b = points.at(-1), attrs = { fill: 'none', stroke: '#244644', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (stroke.type === 'line') ink.append(node('line', { ...attrs, x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    if (stroke.type === 'rect') ink.append(node('rect', { ...attrs, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }));
    if (stroke.type === 'pen') ink.append(node('polyline', { ...attrs, points: points.map(p => `${p.x},${p.y}`).join(' ') }));
    if (stroke.type === 'text') ink.append(label(stroke.text, a.x, a.y, 48, '#244644'));
    if (['door', 'window'].includes(stroke.type) && distance(stroke.points[0], stroke.points[1], area) > 0) {
      const symbol = node('g', { 'data-sketch-type': stroke.type, 'aria-label': stroke.type === 'door' ? '門扇與開啟弧線' : '窗戶' });
      const line = (p, q, extra = {}) => symbol.append(node('line', { ...attrs, x1: p.x, y1: p.y, x2: q.x, y2: q.y, ...extra }));
      line(a, b, { stroke: '#fffdf7', 'stroke-width': 20, 'stroke-linecap': 'butt' });
      if (stroke.type === 'door') {
        const g = doorGeometry(a, b, stroke.swing);
        line(a, g.open); symbol.append(node('path', { ...attrs, 'stroke-width': 3, d: `M${b.x} ${b.y} A${g.radius} ${g.radius} 0 0 ${g.sweep} ${g.open.x} ${g.open.y}` }));
        symbol.append(node('circle', { cx: a.x, cy: a.y, r: 7, fill: '#244644' }));
      } else {
        const length = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
        const offset = (p, n) => ({ x: p.x + nx * n, y: p.y + ny * n });
        for (const n of [-8, 0, 8]) line(offset(a, n), offset(b, n), { 'stroke-width': 3 });
        for (const p of [a, b]) line(offset(p, -13), offset(p, 13), { 'stroke-width': 4 });
      }
      ink.append(symbol);
    }
    for (const el of [...ink.children].slice(before)) el.setAttribute('data-stroke-index', sketch.strokes.indexOf(stroke));
  }
  svg.append(ink, label('現場示意圖', 24, 36, 26, '#244644'), label('未按比例・僅供辨識位置，尺寸請另行實測', 24, sketch.height - 25, 25, '#667873'));
}
// Paper changes preserve absolute geometry; view changes never touch saved points.
export function expandSketch(sketch, direction) {
  validateSketch(sketch);
  if (!['left', 'right', 'top', 'bottom'].includes(direction)) throw new Error('不支援的擴展方向');
  const horizontal = ['left', 'right'].includes(direction), key = horizontal ? 'width' : 'height';
  const delta = Math.min(4800 - sketch[key], Math.round(sketch[key] / 4 / 48) * 48);
  if (delta <= 0) throw new Error('此方向已達圖紙上限，請依區域另畫一張');
  const result = structuredClone(sketch), before = sketchArea(sketch);
  result.version = 2; result[key] += delta;
  const after = sketchArea(result), dx = direction === 'left' ? delta : 0, dy = direction === 'top' ? delta : 0;
  for (const stroke of result.strokes) for (const p of stroke.points) {
    p.x = (p.x * before.width + dx) / after.width; p.y = (p.y * before.height + dy) / after.height;
  }
  return validateSketch(result);
}
export function sketchView(sketch, aspect, zoom = 1, center = { x: sketch.width / 2, y: sketch.height / 2 }) {
  const fitWidth = Math.max(sketch.width, sketch.height * aspect), width = fitWidth / zoom, height = width / aspect;
  const clampCenter = (value, extent, paper) => extent >= paper ? paper / 2 : Math.max(extent / 2, Math.min(paper - extent / 2, value));
  const x = clampCenter(center.x, width, sketch.width), y = clampCenter(center.y, height, sketch.height);
  return { x: x - width / 2, y: y - height / 2, width, height };
}
export function createSketcher(stage, initial = emptySketch(), onChange = () => {}, onHint = () => {}, onState = () => {}) {
  let sketch = structuredClone(validateSketch(initial)), draft = null, pointerId = null, mode = 'line', text = '', gesture = 'drag', anchor = null;
  let snap = true, orthogonal = true, swing = -1, snapResult = null, zoom = 1, center = { x: sketch.width / 2, y: sketch.height / 2 };
  let navigating = false, navigation = null, selected = null, wholeSelection = false;
  const pointers = new Map(), undoHistory = [], redoHistory = [], svg = node('svg', { role: 'img', 'aria-label': '手繪平面簡圖區' });
  stage.replaceChildren(svg);
  const pending = () => !!(draft || anchor);
  const state = () => ({ selected: !!selected, undoCount: undoHistory.length, redoCount: redoHistory.length, canUndo: pending() || undoHistory.length > 0, canRedo: redoHistory.length > 0, pending: pending(), count: sketch.strokes.length, zoom,
    canExpand: { left: sketch.width < 4800, right: sketch.width < 4800, top: sketch.height < 4800, bottom: sketch.height < 4800 },
    snapLabel: [snapResult?.kind === 'endpoint' ? '端點吸附' : snapResult?.kind === 'edge' ? '牆線吸附' : '', snapResult?.locked === 'horizontal' ? '水平鎖定' : snapResult?.locked === 'vertical' ? '垂直鎖定' : ''].filter(Boolean).join(' · ') });
  const view = () => { const box = svg.getBoundingClientRect(); return sketchView(sketch, box.width / box.height || 4 / 3, zoom, center); };
  const updateView = () => { const v = view(); center = { x: v.x + v.width / 2, y: v.y + v.height / 2 }; svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.width} ${v.height}`); onState(state()); };
  const fit = () => { zoom = 1; center = { x: sketch.width / 2, y: sketch.height / 2 }; updateView(); };
  const draw = () => {
    paint(svg, sketch, draft); updateView();
    const area = sketchArea(sketch), marker = snapResult?.kind ? snapResult.point : anchor, scale = svg.getScreenCTM()?.a || 1;
    if (marker) svg.append(node('circle', { cx: area.x + marker.x * area.width, cy: area.y + marker.y * area.height, r: 6 / scale, fill: 'none', stroke: '#c94e32', 'stroke-width': 2 / scale, 'data-snap': snapResult?.kind || 'start' }));
    if (selected) {
      const stroke = sketch.strokes[selected.index]; let highlight;
      if (!wholeSelection && ['rect', 'pen'].includes(stroke.type)) {
        const [a, b] = strokeSegments(stroke)[selected.segment];
        highlight = node('line', { x1: area.x + a.x * area.width, y1: area.y + a.y * area.height, x2: area.x + b.x * area.width, y2: area.y + b.y * area.height });
      } else highlight = svg.querySelector(`[data-stroke-index="${selected.index}"]`).cloneNode(true);
      highlight.removeAttribute('data-stroke-index'); highlight.setAttribute('data-selection', 'true'); highlight.setAttribute('pointer-events', 'none');
      for (const el of [highlight, ...highlight.querySelectorAll('*')]) {
        if (el.getAttribute('stroke') === '#fffdf7') { el.remove(); continue; }
        el.setAttribute('stroke', '#e36c18'); el.setAttribute('stroke-width', '4'); el.setAttribute('vector-effect', 'non-scaling-stroke');
        el.setAttribute('fill', ['text', 'circle'].includes(el.tagName) ? '#e36c18' : 'none');
      }
      svg.append(highlight);
    }
  };
  const remember = () => { undoHistory.push(structuredClone(sketch)); if (undoHistory.length > 50) undoHistory.shift(); redoHistory.length = 0; };
  const changed = () => { draw(); onChange(structuredClone(sketch)); };
  const world = event => { const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const point = (event, from = null) => {
    const area = sketchArea(sketch), p = world(event), raw = { x: (p.x - area.x) / area.width, y: (p.y - area.y) / area.height };
    snapResult = resolveSketchPoint(sketch, raw, { anchor: from, mode, snap, orthogonal, scale: svg.getScreenCTM().a });
    return snapResult.point;
  };
  const inside = event => { const p = world(event), a = sketchArea(sketch); return p.x >= a.x && p.x <= a.x + a.width && p.y >= a.y && p.y <= a.y + a.height; };
  const cancelDraft = () => { pointerId = null; draft = anchor = snapResult = null; };
  const release = id => { pointers.delete(id); if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id); };
  const cancel = () => { cancelDraft(); selected = null; navigating = false; navigation = null; for (const id of [...pointers.keys()]) release(id); };
  const stroke = (a, b = a) => ({ type: mode, points: mode === 'text' ? [a] : [a, b], ...(mode === 'text' ? { text: text.trim().slice(0, 60) } : {}), ...(mode === 'door' ? { swing } : {}) });
  const finish = () => {
    const value = draft;
    if (twoPoint(value.type) && distance(value.points[0], value.points[1], sketchArea(sketch)) < 6) { cancelDraft(); draw(); onHint('兩點太近，請重新指定起點及終點'); return; }
    remember(); sketch.strokes.push(value); cancelDraft(); changed(); onHint('已完成一筆；可繼續繪製，或復原這一步');
  };
  const touchGeometry = () => {
    const values = [...pointers.values()], a = values[0], b = values[1] || a;
    return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2, distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  };
  const startNavigation = () => {
    cancelDraft(); selected = null; navigating = true;
    const g = touchGeometry(); navigation = { ...g, zoom, world: world(g) }; draw();
  };
  const moveNavigation = () => {
    const g = touchGeometry(), box = svg.getBoundingClientRect();
    zoom = Math.max(1, Math.min(8, navigation.zoom * (navigation.distance > 0 && g.distance > 0 ? g.distance / navigation.distance : 1)));
    const v = view(); center = { x: navigation.world.x - ((g.clientX - box.left) / box.width - .5) * v.width, y: navigation.world.y - ((g.clientY - box.top) / box.height - .5) * v.height };
    updateView();
  };
  stage.onpointerdown = event => {
    if (event.button > 0) return;
    event.preventDefault(); pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY }); stage.setPointerCapture(event.pointerId);
    if (pointers.size > 1 || navigating || mode === 'pan') { startNavigation(); return; }
    if (mode === 'erase') { pointerId = event.pointerId; return; }
    if (sketch.strokes.length >= 300) { onHint('已達 300 筆畫，請另畫一張簡圖'); return; }
    if (!inside(event)) { onHint('請在格線範圍繪製；空間不足可向外擴展'); return; }
    if (mode === 'text' && !text.trim()) { onHint('請先輸入標記文字，再點圖面'); return; }
    pointerId = event.pointerId;
    if (gesture === 'tap' && twoPoint(mode)) return;
    draft = stroke(point(event)); draw();
  };
  stage.onpointermove = event => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (navigating) { if (pointers.has(event.pointerId)) moveNavigation(); return; }
    if (gesture === 'tap' && twoPoint(mode)) {
      if (anchor) draft = stroke(anchor, point(event, anchor)); else if (inside(event)) point(event);
      draw(); return;
    }
    if (event.pointerId !== pointerId || !draft) return;
    if (mode === 'pen' && draft.points.length < 1500) draft.points.push(point(event));
    else if (twoPoint(mode)) draft.points[1] = point(event, draft.points[0]);
    draw();
  };
  stage.onpointerup = event => {
    if (navigating) {
      release(event.pointerId);
      if (pointers.size) startNavigation(); else { navigating = false; navigation = null; draw(); }
      return;
    }
    const active = event.pointerId === pointerId; pointerId = null; release(event.pointerId);
    if (!active) return;
    if (mode === 'erase') {
      const area = sketchArea(sketch), p = world(event);
      selected = hitSketch(sketch, { x: (p.x - area.x) / area.width, y: (p.y - area.y) / area.height }, svg.getScreenCTM().a);
      draw(); onHint(selected ? '橘色為選取範圍，確認後按「刪除選取」；刪錯可復原。' : '此處沒有圖形；請靠近線段、門窗或文字點選，可先放大。'); return;
    }
    if (gesture === 'tap' && twoPoint(mode)) {
      const p = point(event, anchor);
      if (!anchor) { anchor = p; draft = stroke(p); draw(); onHint(mode === 'door' ? '起點已選好（門軸），請點門洞另一端' : '起點已選好，請點第二個端點／對角'); return; }
      if (distance(anchor, p, sketchArea(sketch)) < 6) { draw(); onHint('請點另一個位置完成；復原一步可取消目前起點'); return; }
      draft = stroke(anchor, p); finish(); return;
    }
    if (!draft) return;
    if (twoPoint(mode)) draft.points[1] = point(event, draft.points[0]);
    finish();
  };
  stage.onpointercancel = event => { if (pointers.has(event.pointerId)) { cancel(); draw(); onHint('觸控中斷，未完成的筆畫已取消；已完成圖形保留'); } };
  stage.onlostpointercapture = event => { if (pointers.has(event.pointerId)) { cancel(); draw(); } };
  const observer = new ResizeObserver(updateView); observer.observe(stage); draw();
  const restore = value => { const resized = value.width !== sketch.width || value.height !== sketch.height; sketch = value; cancel(); if (resized) fit(); changed(); };
  return {
    get pending() { return pending(); }, get state() { return state(); }, get sketch() { return structuredClone(sketch); },
    setMode(value) { if (['line', 'rect', 'pen', 'text', 'door', 'window', 'pan', 'erase'].includes(value)) { cancel(); mode = value; draw(); } },
    setSelectionScope(whole) { wholeSelection = !!whole; draw(); },
    deleteSelected() { if (!selected) return; let next; try { next = deleteSketchSelection(sketch, selected, wholeSelection); } catch (e) { onHint(e.message); return; } remember(); sketch = next; cancel(); changed(); onHint('已刪除選取範圍；可復原或切換繪圖工具補畫。'); },
    setGesture(value) { cancel(); gesture = value === 'tap' ? 'tap' : 'drag'; draw(); },
    setSnap(value) { snap = !!value; snapResult = null; draw(); },
    setOrthogonal(value) { orthogonal = !!value; snapResult = null; draw(); },
    setSwing(value) { swing = value === 1 ? 1 : -1; if (draft?.type === 'door') draft.swing = swing; draw(); },
    addRoom() { if (sketch.strokes.length >= 300) return; remember(); sketch.strokes.push({ type: 'rect', points: [{ x: .15, y: .15 }, { x: .85, y: .85 }] }); cancel(); changed(); },
    setText(value) { text = value; },
    zoomBy(factor) { cancel(); zoom = Math.max(1, Math.min(8, zoom * factor)); draw(); },
    fit() { cancel(); fit(); draw(); },
    expand(direction) { if (pending()) return; const expanded = expandSketch(sketch, direction); remember(); sketch = expanded; cancel(); fit(); changed(); onHint('已增加空白圖紙；原圖形大小保留，可復原這一步'); },
    undo() {
      if (pending()) { cancel(); draw(); onHint('已取消尚未完成的筆畫；已完成的圖形保留'); return; }
      if (!undoHistory.length) { onHint('本次編輯尚無可復原的步驟'); return; }
      redoHistory.push(structuredClone(sketch)); restore(undoHistory.pop()); onHint('已復原一步；可按重做一步還原');
    },
    redo() {
      if (!redoHistory.length) { onHint('請先復原一步，才有可重做的步驟'); return; }
      undoHistory.push(structuredClone(sketch)); restore(redoHistory.pop()); onHint('已重做一步');
    },
    clear() { if (sketch.strokes.length) { remember(); sketch.strokes = []; cancel(); changed(); onHint('已清空；按復原一步可恢復整張簡圖'); } else { cancel(); draw(); } },
    dispose() { cancel(); observer.disconnect(); stage.onpointerdown = stage.onpointermove = stage.onpointerup = stage.onpointercancel = stage.onlostpointercapture = null; }
  };
}
export async function sketchImage(sketch) {
  validateSketch(sketch);
  const scale = Math.min(1, 2400 / Math.max(sketch.width, sketch.height)), width = Math.round(sketch.width * scale), height = Math.round(sketch.height * scale);
  const svg = node('svg', { xmlns: NS, width, height }); paint(svg, sketch);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('簡圖預覽產生失敗，請保留編輯畫面重試')); image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('簡圖儲存失敗')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
