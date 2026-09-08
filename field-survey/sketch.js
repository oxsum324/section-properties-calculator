import { emptySketch, validateSketch } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
const area = { x: 24, y: 60, width: 1152, height: 780 };
const twoPoint = type => ['line', 'rect', 'door', 'window'].includes(type);
const distance = (a, b) => Math.hypot((a.x - b.x) * area.width, (a.y - b.y) * area.height);
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
  const point = { x: Math.max(0, Math.min(1, raw.x)), y: Math.max(0, Math.min(1, raw.y)) };
  const locked = anchor && orthogonal && ['line', 'door', 'window'].includes(mode)
    ? Math.abs((point.x - anchor.x) * area.width) >= Math.abs((point.y - anchor.y) * area.height) ? 'horizontal' : 'vertical' : '';
  if (locked === 'horizontal') point.y = anchor.y;
  if (locked === 'vertical') point.x = anchor.x;
  const result = { point, kind: '', locked };
  if (!snap || ['pen', 'text'].includes(mode)) return result;
  const tolerance = 12 / Math.max(.05, scale), candidates = objects(sketch);
  const aligned = p => !locked || Math.abs(p[locked === 'horizontal' ? 'y' : 'x'] - anchor[locked === 'horizontal' ? 'y' : 'x']) < 1e-8;
  const allowed = p => aligned(p) && (!anchor || distance(anchor, p) > .01);
  let closest = null, best = tolerance;
  for (const p of candidates.endpoints) { const d = distance(point, p); if (allowed(p) && d <= best) { closest = p; best = d; } }
  if (closest) return { point: { ...closest }, kind: 'endpoint', locked };
  for (const [a, b] of candidates.segments) {
    const dx = (b.x - a.x) * area.width, dy = (b.y - a.y) * area.height, length2 = dx * dx + dy * dy;
    if (!length2) continue;
    let t;
    if (locked === 'horizontal' && Math.abs(b.y - a.y) > 1e-8) t = (anchor.y - a.y) / (b.y - a.y);
    else if (locked === 'vertical' && Math.abs(b.x - a.x) > 1e-8) t = (anchor.x - a.x) / (b.x - a.x);
    else t = ((point.x - a.x) * area.width * dx + (point.y - a.y) * area.height * dy) / length2;
    if (t < 0 || t > 1) continue;
    const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, d = distance(point, p);
    if (allowed(p) && d <= best) { closest = p; best = d; }
  }
  return closest ? { point: { ...closest }, kind: 'edge', locked } : result;
}
export function doorGeometry(a, b, swing) {
  const dx = b.x - a.x, dy = b.y - a.y;
  return { radius: Math.hypot(dx, dy), open: { x: a.x - swing * dy, y: a.y + swing * dx }, sweep: swing === 1 ? 1 : 0 };
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
  svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 1200 900');
  svg.append(node('rect', { width: 1200, height: 900, fill: '#fffdf7' }));
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
    const points = stroke.points.map(p => ({ x: area.x + p.x * area.width, y: area.y + p.y * area.height }));
    const a = points[0], b = points.at(-1), attrs = { fill: 'none', stroke: '#244644', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (stroke.type === 'line') ink.append(node('line', { ...attrs, x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    if (stroke.type === 'rect') ink.append(node('rect', { ...attrs, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }));
    if (stroke.type === 'pen') ink.append(node('polyline', { ...attrs, points: points.map(p => `${p.x},${p.y}`).join(' ') }));
    if (stroke.type === 'text') ink.append(label(stroke.text, a.x, a.y, 48, '#244644'));
    if (['door', 'window'].includes(stroke.type) && distance(stroke.points[0], stroke.points[1]) > 0) {
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
  }
  svg.append(ink, label('現場示意圖', 24, 36, 26, '#244644'), label('未按比例・僅供辨識位置，尺寸請另行實測', 24, 875, 25, '#667873'));
}
export function createSketcher(stage, initial = emptySketch(), onChange = () => {}, onHint = () => {}, onState = () => {}) {
  let sketch = structuredClone(validateSketch(initial)), draft = null, pointerId = null, mode = 'line', text = '', gesture = 'drag', anchor = null;
  let snap = true, orthogonal = true, swing = -1, snapResult = null;
  const undoHistory = [], redoHistory = [], svg = node('svg', { role: 'img', 'aria-label': '手繪平面簡圖區' });
  stage.replaceChildren(svg);
  const pending = () => !!(draft || anchor);
  const state = () => ({ undoCount: undoHistory.length, redoCount: redoHistory.length, canUndo: pending() || undoHistory.length > 0, canRedo: redoHistory.length > 0, pending: pending(), count: sketch.strokes.length,
    snapLabel: [snapResult?.kind === 'endpoint' ? '端點吸附' : snapResult?.kind === 'edge' ? '牆線吸附' : '', snapResult?.locked === 'horizontal' ? '水平鎖定' : snapResult?.locked === 'vertical' ? '垂直鎖定' : ''].filter(Boolean).join(' · ') });
  const draw = () => {
    paint(svg, sketch, draft);
    const marker = snapResult?.kind ? snapResult.point : anchor;
    if (marker) svg.append(node('circle', { cx: area.x + marker.x * area.width, cy: area.y + marker.y * area.height, r: 15, fill: 'none', stroke: '#c94e32', 'stroke-width': 5, 'data-snap': snapResult?.kind || 'start' }));
    onState(state());
  };
  const remember = () => { undoHistory.push(structuredClone(sketch)); if (undoHistory.length > 50) undoHistory.shift(); redoHistory.length = 0; };
  const changed = () => { draw(); onChange(structuredClone(sketch)); };
  const point = (event, from = null) => {
    const box = svg.getBoundingClientRect();
    const raw = { x: ((event.clientX - box.left) / box.width * 1200 - area.x) / area.width, y: ((event.clientY - box.top) / box.height * 900 - area.y) / area.height };
    snapResult = resolveSketchPoint(sketch, raw, { anchor: from, mode, snap, orthogonal, scale: box.width / 1200 });
    return snapResult.point;
  };
  const cancel = () => {
    const captured = pointerId; pointerId = null; draft = anchor = snapResult = null;
    if (captured !== null && stage.hasPointerCapture(captured)) stage.releasePointerCapture(captured);
  };
  const stroke = (a, b = a) => ({ type: mode, points: mode === 'text' ? [a] : [a, b], ...(mode === 'text' ? { text: text.trim().slice(0, 60) } : {}), ...(mode === 'door' ? { swing } : {}) });
  const finish = () => {
    const value = draft;
    if (twoPoint(value.type) && distance(value.points[0], value.points[1]) < 6) { cancel(); draw(); onHint('兩點太近，請重新指定起點及終點'); return; }
    remember(); sketch.strokes.push(value); cancel(); changed(); onHint('已完成一筆；可繼續繪製，或復原這一步');
  };
  stage.onpointerdown = event => {
    if (pointerId !== null || event.isPrimary === false || event.button > 0 || sketch.strokes.length >= 300) return;
    if (mode === 'text' && !text.trim()) { onHint('請先輸入標記文字，再點圖面'); return; }
    event.preventDefault(); pointerId = event.pointerId; stage.setPointerCapture(pointerId);
    if (gesture === 'tap' && twoPoint(mode)) return;
    draft = stroke(point(event)); draw();
  };
  stage.onpointermove = event => {
    if (event.isPrimary === false) return;
    if (gesture === 'tap' && twoPoint(mode)) {
      if (anchor) draft = stroke(anchor, point(event, anchor)); else point(event);
      draw(); return;
    }
    if (event.pointerId !== pointerId || !draft) return;
    if (mode === 'pen' && draft.points.length < 1500) draft.points.push(point(event));
    else if (twoPoint(mode)) draft.points[1] = point(event, draft.points[0]);
    draw();
  };
  stage.onpointerup = event => {
    if (event.pointerId !== pointerId) return;
    if (gesture === 'tap' && twoPoint(mode)) {
      pointerId = null; const p = point(event, anchor);
      if (!anchor) { anchor = p; draft = stroke(p); draw(); onHint(mode === 'door' ? '起點已選好（門軸），請點門洞另一端' : '起點已選好，請點第二個端點／對角'); return; }
      if (distance(anchor, p) < 6) { draw(); onHint('請點另一個位置完成；復原一步可取消目前起點'); return; }
      draft = stroke(anchor, p); finish(); return;
    }
    if (!draft) return;
    if (twoPoint(mode)) draft.points[1] = point(event, draft.points[0]);
    finish();
  };
  stage.onpointercancel = event => { if (event.pointerId === pointerId) { cancel(); draw(); onHint('觸控中斷，這筆尚未加入；請重新繪製'); } };
  stage.onlostpointercapture = event => { if (event.pointerId === pointerId) { cancel(); draw(); } };
  draw();
  return {
    get pending() { return pending(); },
    get state() { return state(); },
    get sketch() { return structuredClone(sketch); },
    setMode(value) { if (['line', 'rect', 'pen', 'text', 'door', 'window'].includes(value)) { cancel(); mode = value; draw(); } },
    setGesture(value) { cancel(); gesture = value === 'tap' ? 'tap' : 'drag'; draw(); },
    setSnap(value) { snap = !!value; snapResult = null; draw(); },
    setOrthogonal(value) { orthogonal = !!value; snapResult = null; draw(); },
    setSwing(value) { swing = value === 1 ? 1 : -1; if (draft?.type === 'door') draft.swing = swing; draw(); },
    addRoom() { if (sketch.strokes.length >= 300) return; remember(); sketch.strokes.push({ type: 'rect', points: [{ x: .15, y: .15 }, { x: .85, y: .85 }] }); cancel(); changed(); },
    setText(value) { text = value; },
    undo() {
      if (pending()) { cancel(); draw(); onHint('已取消尚未完成的筆畫；已完成的圖形保留'); return; }
      if (!undoHistory.length) { onHint('本次編輯尚無可復原的步驟'); return; }
      redoHistory.push(structuredClone(sketch)); sketch = undoHistory.pop(); cancel(); changed(); onHint('已復原一步；可按重做一步還原');
    },
    redo() {
      if (!redoHistory.length) { onHint('請先復原一步，才有可重做的步驟'); return; }
      undoHistory.push(structuredClone(sketch)); sketch = redoHistory.pop(); cancel(); changed(); onHint('已重做一步');
    },
    clear() { if (sketch.strokes.length) { remember(); sketch.strokes = []; cancel(); changed(); onHint('已清空；按復原一步可恢復整張簡圖'); } else { cancel(); draw(); } },
    dispose() { cancel(); stage.onpointerdown = stage.onpointermove = stage.onpointerup = stage.onpointercancel = stage.onlostpointercapture = null; }
  };
}
export async function sketchImage(sketch) {
  validateSketch(sketch);
  const svg = node('svg', { xmlns: NS, width: 1200, height: 900 }); paint(svg, sketch);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('簡圖預覽產生失敗，請保留編輯畫面重試')); image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('簡圖儲存失敗')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
