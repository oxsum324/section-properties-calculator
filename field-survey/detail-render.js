import { drawMarks } from './annotation.js';
import { symbolPaths, DETAIL_SYMBOLS, REGION_TYPES } from './detail-geometry.js';
export const ns = 'http://www.w3.org/2000/svg';
export function svgNode(tag, attrs = {}) { const el = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); return el; }
export function drawDetailMark(g, mark, width, height) {
  g.replaceChildren();
  if (mark.type === 'opening') {
    const [a, b] = mark.points, x = Math.min(a.x, b.x) * width, y = Math.min(a.y, b.y) * height, w = Math.abs(a.x - b.x) * width, h = Math.abs(a.y - b.y) * height, inset = Math.min(w, h) * .07;
    g.append(svgNode('rect', { x, y, width: w, height: h, fill: 'white', stroke: '#242d32', 'stroke-width': width / 650 }));
    g.append(svgNode('rect', { x: x + inset, y: y + inset, width: w - inset * 2, height: h - inset * 2, fill: 'none', stroke: '#242d32', 'stroke-width': width / 800 }));
    if (mark.kind === 'window') g.append(svgNode('line', { x1: x + w / 2, y1: y + inset, x2: x + w / 2, y2: y + h - inset, stroke: '#242d32', 'stroke-width': width / 800 }));
    else g.append(svgNode('circle', { cx: x + w * .82, cy: y + h * .58, r: Math.min(w, h) * .025, fill: '#242d32' }));
  } else if (mark.type === 'symbol') {
    const p = mark.points[0], scale = mark.size * Math.min(width, height) / 100;
    const shape = svgNode('g', { transform: `translate(${p.x * width} ${p.y * height}) rotate(${mark.rotation}) scale(${mark.mirror ? -scale : scale} ${scale})`, fill: 'none', stroke: '#25372f', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    symbolPaths(mark.symbol).forEach(d => shape.append(svgNode('path', { d }))); g.append(shape);
  } else if (mark.type === 'region') {
    g.append(svgNode('polygon', { points: mark.points.map(p => `${p.x * width},${p.y * height}`).join(' '), fill: '#667b6e', 'fill-opacity': .12, stroke: '#3c5748', 'stroke-width': width / 330, 'stroke-dasharray': `${width / 100} ${width / 180}` }));
    const p = mark.points[0], label = svgNode('text', { x: p.x * width, y: p.y * height, fill: '#25372f', stroke: 'white', 'stroke-width': width / 800, 'paint-order': 'stroke', 'font-size': width / 45, 'font-family': 'sans-serif' }); label.textContent = REGION_TYPES[mark.condition]; g.append(label);
  } else drawMarks(g, [mark], width, height);
}
export function drawDetailMarks(g, marks, width, height) {
  g.replaceChildren();
  // Openings cover base lines only; observation marks remain visible above them.
  for (const opening of [true, false]) marks.forEach((mark, i) => { if ((mark.type === 'opening') !== opening) return; const item = svgNode('g', { 'data-detail-index': i }); drawDetailMark(item, mark, width, height); g.append(item); });
}
export const usedSymbols = marks => [...new Set(marks.filter(m => m.type === 'symbol').map(m => m.symbol))];
export async function renderDetailImage(blob, marks) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const symbols = usedSymbols(marks), scale = Math.min(1, 4094 / img.naturalWidth, 4094 / (img.naturalHeight + (symbols.length ? img.naturalWidth / 20 : 0))), w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale)), legend = symbols.length ? Math.ceil(w / 20) : 0;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h + legend; const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h + legend); ctx.drawImage(img, 0, 0, w, h);
    const svg = svgNode('svg', { xmlns: ns, width: w, height: h + legend, viewBox: `0 0 ${w} ${h + legend}` }); drawDetailMarks(svg, marks, w, h);
    symbols.forEach((symbol,i) => { const g = svgNode('g', { transform: `translate(${w * (.04 + i * .19)} ${h + legend / 2}) scale(${w / 2000})`, fill: 'none', stroke: '#25372f', 'stroke-width': 3, 'stroke-linecap': 'round' }); symbolPaths(symbol).forEach(d => g.append(svgNode('path', { d }))); svg.append(g); });
    const overlay = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try { const picture = new Image(); picture.src = overlay; await picture.decode(); ctx.drawImage(picture, 0, 0); } finally { URL.revokeObjectURL(overlay); }
    if (symbols.length) { ctx.fillStyle = '#25372f'; ctx.font = `${w / 55}px sans-serif`; symbols.forEach((s,i) => ctx.fillText(DETAIL_SYMBOLS[s], w * (.075 + i * .19), h + legend * .64)); ctx.font = `${w / 70}px sans-serif`; ctx.fillText('符號示意，非實測範圍', w * .8, h + legend * .64); }
    return await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('細圖匯出失敗')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
