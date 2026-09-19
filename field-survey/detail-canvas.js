import { svgNode, drawDetailMarks, drawDetailMark } from './detail-render.js';
import { moveDetailMark, splitDetailLine, regionArea } from './detail-geometry.js';

export async function createDetailCanvas(stage, url, initial, onChange, onState) {
  const image = new Image(); image.src = url; await image.decode();
  const w = image.naturalWidth, h = image.naturalHeight, svg = svgNode('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': '細部圖繪製區' });
  const base = svgNode('image', { href: url, width: w, height: h }), objects = svgNode('g'), draftLayer = svgNode('g'), handles = svgNode('g'); svg.append(base, objects, draftLayer, handles); stage.replaceChildren(svg);
  let marks = structuredClone(initial), mode = 'line', selected = -1, vertex = -1, segment = -1, symbol = 'network', condition = 'damp', text = '', tone = 'red', openingPoints = 2, pending = [], ghost, gesture, message = '', frame = 0, disposed = false;
  const screen = { color: true };
  let view = { x: 0, y: 0, w, h }; const history = [], future = [], pointers = new Map();
  const unit = event => { const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return { x: q.x / w, y: q.y / h }; };
  const bounded = p => ({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) });
  const distance = (a, b) => Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
  const scale = () => svg.getScreenCTM()?.a || 1;
  const updateView = () => svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  function state() { onState({ mode, selected, vertex, segment, marks, tone, openingPoints, pending: !!pending.length || !!ghost, count: pending.length, canUndo: !!pending.length || !!history.length, canRedo: !!future.length, message }); }
  function decorate() {
    handles.replaceChildren();
    objects.querySelectorAll('[data-detail-index]').forEach(g => { g.style.opacity = selected < 0 || Number(g.dataset.detailIndex) === selected ? '1' : '.55'; });
    const mark = ghost || marks[selected]; if (selected < 0 || !mark || mode !== 'select') return;
    const g = objects.querySelector(`[data-detail-index="${selected}"]`); if (g) { const b = g.getBBox(); handles.append(svgNode('rect', { x: b.x - 5 / scale(), y: b.y - 5 / scale(), width: b.width + 10 / scale(), height: b.height + 10 / scale(), fill: 'none', stroke: '#176bc1', 'stroke-width': 1 / scale(), 'pointer-events': 'none' })); }
    if (mark.type !== 'symbol') mark.points.forEach((p, i) => { if (mark.points.length > 50 && i !== vertex && i !== mark.points.length - 1 && i % Math.ceil(mark.points.length / 40)) return; handles.append(svgNode('circle', { cx: p.x * w, cy: p.y * h, r: 13 / scale(), fill: 'transparent', 'data-vertex': i }), svgNode('circle', { cx: p.x * w, cy: p.y * h, r: (i === vertex ? 8 : 6) / scale(), fill: 'white', stroke: '#176bc1', 'stroke-width': 2 / scale(), 'pointer-events': 'none' })); });
  }
  function redraw() {
    drawDetailMarks(objects, marks, w, h, screen); draftLayer.replaceChildren();
    if (pending.length) { drawDetailMark(draftLayer, { type: 'pen', tone, points: pending }, w, h, screen); pending.forEach(p => draftLayer.append(svgNode('circle', { cx: p.x * w, cy: p.y * h, r: 4 / scale(), fill: '#176bc1' }))); }
    decorate(); state();
  }
  function commit(next) { if (next.some(m => m.type === 'opening' && (m.points.length === 4 ? regionArea(m.points) * w * h < 9 : (Math.abs(m.points[0].x - m.points[1].x) * w < 3 || Math.abs(m.points[0].y - m.points[1].y) * h < 3)))) { message = '開口太窄或太小，請拉開對角，保留寬度及高度。'; ghost = null; redraw(); return false; } if (next.some(m => m.type === 'region' && regionArea(m.points) <= 1e-8)) { message = '範圍需由至少三個不在同一直線上的點圍成，請調整後再完成。'; ghost = null; redraw(); return false; } if (next.length > 500) { message = '本圖標記已達 500 筆，請先整理標記。'; redraw(); return false; } history.push(structuredClone(marks)); future.length = 0; marks = next; onChange(structuredClone(marks)); message = ''; redraw(); return true; }
  function append(mark) { selected = marks.length; vertex = segment = -1; if (commit([...marks, mark])) pending = []; redraw(); }
  function finish() {
    const minimum = mode === 'region' ? 3 : 2;
    if (pending.length < minimum) { message = `請至少點選 ${minimum} 個位置；也可取消。`; state(); return; }
    if (mode === 'region') append({ type: 'region', condition, points: structuredClone(pending) });
    else append({ type: 'pen', tone, points: structuredClone(pending) });
  }
  function hit(p) {
    const tolerance = 14 / scale(), hits = [];
    marks.forEach((mark, index) => {
      const box = objects.querySelector(`[data-detail-index="${index}"]`).getBBox(), px = p.x * w, py = p.y * h;
      if (['symbol', 'text', 'circle', 'region', 'opening'].includes(mark.type) && px >= box.x - tolerance && px <= box.x + box.width + tolerance && py >= box.y - tolerance && py <= box.y + box.height + tolerance) { hits.push({ index, segment: -1 }); return; }
      let best = Infinity, edge = -1;
      mark.points.slice(1).forEach((b, i) => { const a = mark.points[i], dx = (b.x - a.x) * w, dy = (b.y - a.y) * h, t = Math.max(0, Math.min(1, (((p.x - a.x) * w) * dx + ((p.y - a.y) * h) * dy) / (dx * dx + dy * dy || 1))), d = distance(p, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); if (d < best) { best = d; edge = i; } });
      if (best <= tolerance) hits.push({ index, segment: edge });
    });
    return hits.reverse();
  }
  function cancelGesture() { cancelAnimationFrame(frame); frame = 0; ghost = null; gesture = null; redraw(); }
  svg.onpointerdown = event => {
    if (event.button > 0) return; event.preventDefault(); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size > 2) return;
    if (pointers.size === 2) { cancelGesture(); const [a, b] = [...pointers.values()]; gesture = { type: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), view: { ...view }, anchor: unit({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }) }; return; }
    const p = unit(event), hits = hit(p);
    if (mode === 'erase') { if (hits.length) { selected = -1; commit(marks.filter((_, i) => i !== hits[0].index)); } pointers.delete(event.pointerId); return; }
    try { svg.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer tests do not have an active native pointer. */ }
    if (mode === 'pan') gesture = { type: 'pan', x: event.clientX, y: event.clientY, scale: scale(), view: { ...view } };
    else if (mode === 'select') {
      const handle = event.target.closest('[data-vertex]');
      if (handle && selected >= 0) { vertex = Number(handle.dataset.vertex); gesture = { type: 'vertex', start: p, original: structuredClone(marks[selected]) }; }
      else if (hits.length) { const chosen = hits.find(x => x.index === selected) || hits[0]; selected = chosen.index; segment = chosen.segment; vertex = -1; gesture = { type: 'move', start: p, original: structuredClone(marks[selected]), hits }; }
      else { selected = vertex = segment = -1; gesture = null; }
      decorate(); state(); if (gesture) gesture.start = unit(event);
    } else if (mode === 'pen') { ghost = { type: 'pen', tone, points: [bounded(p)] }; gesture = { type: 'pen', start: p }; state(); }
    else gesture = { type: 'tap', start: p };
  };
  svg.onpointermove = event => {
    if (!pointers.has(event.pointerId) || !gesture) return; pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.type === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()], rect = svg.getBoundingClientRect(), factor = gesture.distance / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const vw = Math.max(w / 10, Math.min(w * 2, gesture.view.w * factor)), vh = vw * h / w, s = Math.min(rect.width / vw, rect.height / vh);
      view = { x: gesture.anchor.x * w - ((a.x + b.x) / 2 - rect.left - (rect.width - vw * s) / 2) / s, y: gesture.anchor.y * h - ((a.y + b.y) / 2 - rect.top - (rect.height - vh * s) / 2) / s, w: vw, h: vh }; updateView(); decorate(); return;
    }
    if (gesture.type === 'pan') { view = { ...gesture.view, x: gesture.view.x - (event.clientX - gesture.x) / gesture.scale, y: gesture.view.y - (event.clientY - gesture.y) / gesture.scale }; updateView(); return; }
    const p = bounded(unit(event));
    if (gesture.type === 'pen') { if (ghost.points.length < 1999 && distance(ghost.points.at(-1), p) > .7 / scale()) ghost.points.push(p); }
    else if (gesture.type === 'vertex') { ghost = structuredClone(gesture.original); ghost.points[vertex] = p; }
    else if (gesture.type === 'move') ghost = moveDetailMark(gesture.original, p.x - gesture.start.x, p.y - gesture.start.y, w, h);
    else return;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (!ghost || disposed) return; if (gesture?.type === 'pen') drawDetailMark(draftLayer, ghost, w, h, screen); else { drawDetailMark(objects.querySelector(`[data-detail-index="${selected}"]`), ghost, w, h, screen); decorate(); } });
  };
  const release = event => {
    if (!pointers.has(event.pointerId)) return; pointers.delete(event.pointerId); cancelAnimationFrame(frame); frame = 0;
    if (event.type === 'pointercancel' || pointers.size || gesture?.type === 'pinch') { cancelGesture(); return; }
    const p = bounded(unit(event)), g = gesture; gesture = null;
    if (g?.type === 'pen') { if (distance(ghost.points[0], p) > 2 / scale() || ghost.points.length > 1) { ghost.points.push(p); const mark = ghost; ghost = null; append(mark); } }
    else if (g?.type === 'move' || g?.type === 'vertex') {
      if (distance(g.start, p) > 2 / scale()) { const mark = g.type === 'move' ? moveDetailMark(g.original, p.x - g.start.x, p.y - g.start.y, w, h) : { ...g.original, points: g.original.points.map((q, i) => i === vertex ? p : q) }; const next = structuredClone(marks); next[selected] = mark; ghost = null; commit(next); }
      else if (g.type === 'move' && g.hits.length > 1) { const next = g.hits[(g.hits.findIndex(x => x.index === selected) + 1) % g.hits.length]; selected = next.index; segment = next.segment; }
    } else if (g?.type === 'tap' && distance(g.start, p) < 12 / scale()) {
      if (mode === 'symbol') append(moveDetailMark({ type: 'symbol', symbol, points: [p], size: .24, rotation: 0, mirror: false }, 0, 0, w, h));
      else if (mode === 'text') { if (text.trim()) append({ type: 'text', tone, text: text.trim().slice(0, 120), points: [p] }); else message = '請先填寫標記文字。'; }
      else if (pending.length < 2000 && (!pending.length || distance(pending.at(-1), p) > 2 / scale())) {
        pending.push(p);
        const target = ['door', 'window'].includes(mode) ? openingPoints : 2;
        if (['arrow', 'circle', 'rect', 'door', 'window'].includes(mode) && pending.length === target) {
          if (['door', 'window'].includes(mode) && target === 4) { if (regionArea(pending) * w * h >= 9) append({ type: 'opening', kind: mode, points: structuredClone(pending) }); else { pending = []; message = '四個角太靠近或交叉，請重新依序點四個角。'; } }
          else if (['door', 'window'].includes(mode)) { const [a, b] = pending; if (Math.abs(a.x - b.x) * w >= 3 && Math.abs(a.y - b.y) * h >= 3) append({ type: 'opening', kind: mode, points: structuredClone(pending) }); else { pending.pop(); message = '開口太窄，請重新點另一個對角。'; } }
          else if (mode === 'rect') { const [a, b] = pending; if (Math.abs(a.x - b.x) * w > 2 && Math.abs(a.y - b.y) * h > 2) append({ type: 'region', condition, points: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] }); }
          else append({ type: mode, tone, points: structuredClone(pending) });
        }
      }
    }
    ghost = null; redraw();
  };
  svg.onpointerup = svg.onpointercancel = release;
  const observer = new ResizeObserver(() => decorate()); observer.observe(stage); redraw();
  return {
    get marks() { return structuredClone(marks); }, get pending() { return !!pending.length || !!ghost; },
    setMode(value) { if (pending.length || ghost) { message = '請先完成或取消目前筆畫，再切換工具。'; state(); return false; } mode = value; selected = vertex = segment = -1; message = ''; redraw(); return true; },
    setText(value) { text = value; }, setSymbol(value) { symbol = value; }, setCondition(value) { condition = value; },
    setTone(value) { tone = ['red', 'blue', 'black'].includes(value) ? value : 'red'; redraw(); },
    setOpeningPoints(value) { openingPoints = value === 4 ? 4 : 2; if (['door', 'window'].includes(mode)) pending = []; redraw(); },
    finish, cancel() { pending = []; ghost = null; message = ''; redraw(); },
    undo() { if (pending.length) pending.pop(); else if (history.length) { future.push(structuredClone(marks)); marks = history.pop(); selected = -1; onChange(structuredClone(marks)); } redraw(); },
    redo() { if (!pending.length && future.length) { history.push(structuredClone(marks)); marks = future.pop(); selected = -1; onChange(structuredClone(marks)); } redraw(); },
    select(index) { if (pending.length) return; mode = 'select'; selected = index; vertex = segment = -1; redraw(); },
    remove(part = 'whole') { if (selected < 0) return; const next = structuredClone(marks), m = next[selected]; if (part === 'segment' && m.type === 'pen') next.splice(selected, 1, ...splitDetailLine(m, segment)); else if (part === 'point' && vertex >= 0 && m.points.length > (m.type === 'region' ? 3 : 2)) m.points.splice(vertex, 1); else if (part === 'whole') next.splice(selected, 1); else return; selected = vertex = segment = -1; commit(next); },
    changeSymbol(factor = 1, angle = 0) { if (marks[selected]?.type !== 'symbol') return; const next = structuredClone(marks), m = next[selected]; m.size = Math.max(.05, Math.min(.7, m.size * factor)); m.rotation = (m.rotation + angle + 360) % 360; next[selected] = moveDetailMark(m, 0, 0, w, h); commit(next); },
    nudge(dx, dy) { if (selected < 0) return; const next = structuredClone(marks), m = next[selected]; if (vertex >= 0) m.points[vertex] = bounded({ x: m.points[vertex].x + dx * view.w / w / 60, y: m.points[vertex].y + dy * view.w / h / 60 }); else next[selected] = moveDetailMark(m, dx * view.w / w / 60, dy * view.w / h / 60, w, h); commit(next); },
    duplicate() { if (selected < 0) return; append(moveDetailMark(marks[selected], .04, .04, w, h)); },
    zoom(factor) { const vw = Math.max(w / 10, Math.min(w * 2, view.w * factor)), vh = vw * h / w; view = { x: view.x + (view.w - vw) / 2, y: view.y + (view.h - vh) / 2, w: vw, h: vh }; updateView(); decorate(); },
    fit() { view = { x: 0, y: 0, w, h }; updateView(); decorate(); },
    dispose() { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); svg.onpointerdown = svg.onpointermove = svg.onpointerup = svg.onpointercancel = null; }
  };
}
