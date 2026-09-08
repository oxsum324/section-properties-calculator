import { emptySketch, validateSketch } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
const area = { x: 24, y: 60, width: 1152, height: 780 };
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
  for (const stroke of draft ? [...sketch.strokes, draft] : sketch.strokes) {
    const points = stroke.points.map(p => ({ x: area.x + p.x * area.width, y: area.y + p.y * area.height }));
    const a = points[0], b = points.at(-1), attrs = { fill: 'none', stroke: '#244644', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (stroke.type === 'line') ink.append(node('line', { ...attrs, x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    if (stroke.type === 'rect') ink.append(node('rect', { ...attrs, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }));
    if (stroke.type === 'pen') ink.append(node('polyline', { ...attrs, points: points.map(p => `${p.x},${p.y}`).join(' ') }));
    if (stroke.type === 'text') ink.append(label(stroke.text, a.x, a.y, 48, '#244644'));
  }
  svg.append(ink, label('現場示意圖', 24, 36, 26, '#244644'), label('未按比例・僅供辨識位置，尺寸請另行實測', 24, 875, 25, '#667873'));
}
export function createSketcher(stage, initial = emptySketch(), onChange = () => {}) {
  let sketch = structuredClone(validateSketch(initial)), draft = null, pointerId = null, mode = 'line', text = '';
  const undo = [], redo = [], svg = node('svg', { role: 'img', 'aria-label': '手繪平面簡圖區' });
  stage.replaceChildren(svg);
  const draw = () => paint(svg, sketch, draft);
  const remember = () => { undo.push(structuredClone(sketch)); if (undo.length > 50) undo.shift(); redo.length = 0; };
  const changed = () => { draw(); onChange(structuredClone(sketch)); };
  const point = event => {
    const box = svg.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, ((event.clientX - box.left) / box.width * 1200 - area.x) / area.width)), y: Math.max(0, Math.min(1, ((event.clientY - box.top) / box.height * 900 - area.y) / area.height)) };
  };
  const cancel = () => { draft = null; pointerId = null; draw(); };
  svg.onpointerdown = event => {
    if (pointerId !== null || event.isPrimary === false || event.button > 0 || sketch.strokes.length >= 300 || (mode === 'text' && !text.trim())) return;
    event.preventDefault(); pointerId = event.pointerId; svg.setPointerCapture(pointerId);
    const p = point(event); draft = { type: mode, points: mode === 'text' ? [p] : [p, p] };
    if (mode === 'text') draft.text = text.trim().slice(0, 60);
    draw();
  };
  svg.onpointermove = event => {
    if (event.pointerId !== pointerId || !draft) return;
    if (mode === 'pen' && draft.points.length < 1500) draft.points.push(point(event));
    else if (mode !== 'text' && mode !== 'pen') draft.points[1] = point(event);
    draw();
  };
  svg.onpointerup = event => {
    if (event.pointerId !== pointerId || !draft) return;
    if (mode !== 'text' && mode !== 'pen') draft.points[1] = point(event);
    const stroke = draft; draft = null; pointerId = null;
    if (['line', 'rect'].includes(stroke.type) && Math.hypot(stroke.points[0].x - stroke.points[1].x, stroke.points[0].y - stroke.points[1].y) < .006) { draw(); return; }
    remember(); sketch.strokes.push(stroke); changed();
  };
  svg.onpointercancel = event => { if (event.pointerId === pointerId) cancel(); };
  draw();
  return {
    get sketch() { return structuredClone(sketch); },
    setMode(value) { if (['line', 'rect', 'pen', 'text'].includes(value)) { cancel(); mode = value; } },
    setText(value) { text = value; },
    undo() { if (undo.length) { redo.push(structuredClone(sketch)); sketch = undo.pop(); cancel(); changed(); } },
    redo() { if (redo.length) { undo.push(structuredClone(sketch)); sketch = redo.pop(); cancel(); changed(); } },
    clear() { if (sketch.strokes.length) { remember(); sketch.strokes = []; cancel(); changed(); } },
    dispose() { svg.onpointerdown = svg.onpointermove = svg.onpointerup = svg.onpointercancel = null; }
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
