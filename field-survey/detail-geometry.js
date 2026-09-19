// Preset signs describe an observation, not its measured extent or severity.
export const DETAIL_SYMBOLS = { network: '網裂', damp: '滲水痕', salt: '白華', spall: '剝落', exposedRebar: '鋼筋外露', tileBulge: '磁磚拱起', tileDetached: '磁磚脫落', activeLeak: '正在漏水', tileBroken: '磁磚破損', paintBlister: '油漆起泡' };
export const REGION_TYPES = { damp: '滲水痕', salt: '白華', spall: '剝落' };
// Hand-drawn vector artwork, kept within ±52 × ±36 for the shared move/rotate bounds.
// These are schematic observation icons, not measured outlines or standard code symbols.
export function symbolArtwork(kind) {
  const line = (d, width = 1.8, extra = {}) => ({ d, 'stroke-width': width, ...extra });
  const dots = points => ({ d: points.map(([x,y,r]) => `M${(x-r).toFixed(2)},${y.toFixed(2)} a${r},${r} 0 1,0 ${2*r},0 a${r},${r} 0 1,0 ${-2*r},0`).join(' '), fill: '#25372f', stroke: 'none' });
  // Fixed point patterns keep the canvas, thumbnails and printed diagrams identical.
  const edgeDots = polygon => polygon.flatMap(([x,y], i) => {
    const [bx,by] = polygon[(i+1)%polygon.length], dx=bx-x, dy=by-y, length=Math.hypot(dx,dy), count=Math.max(1,Math.ceil(length/2.2));
    return Array.from({length:count}, (_,j) => { const t=(j+.35)/count, inset=.65+(i+j)%3*.5; return [x+dx*t-dy/length*inset,y+dy*t+dx/length*inset,.35+(i+j)%3*.1]; });
  });
  if (kind === 'network') return [
    line('M-49,1 L-41,-2 -35,0 -27,-5 -20,-4 -13,-9 -5,-10 3,-6 10,-7 19,-2 26,-3 33,2 40,1 49,6', 2.2),
    line('M-27,-5 L-30,3 -26,9 -23,17 -13,19 -6,16 5,18 10,10 15,8 19,-2'),
    line('M-5,-10 L-7,-2 -2,5 -3,10 5,18 16,22 22,18 30,19 33,11 40,1'),
    line('M-5,-10 L-9,-18 -6,-23 -10,-30 M-9,-18 L1,-23 9,-22 16,-27 21,-25 24,-17 20,-10 19,-2', 1.65),
    line('M-27,-5 L-34,-12 -35,-20 -43,-26 M-34,-12 L-43,-13 -49,-10 M-35,-20 L-31,-29', 1.25),
    line('M-23,17 L-30,22 -33,30 M-30,22 L-41,21 -48,26 M-41,21 L-44,13', 1.2),
    line('M5,18 L3,26 8,33 M3,26 L-5,31 M30,19 L38,24 43,32 M38,24 L49,22', 1.2),
    line('M40,1 L42,-7 49,-12 M42,-7 L38,-16 M-10,-30 L-19,-33 M21,-25 L29,-30', 1.15),
    line('M-13,-9 L-17,-17 M-26,9 L-35,8 M10,10 L7,4 M22,18 L24,10', 1.05)
  ];
  if (kind === 'damp') {
    const edge = [[-46,-13],[-42,-23],[-32,-27],[-23,-24],[-14,-31],[-4,-29],[3,-25],[12,-28],[22,-24],[28,-17],[38,-20],[45,-12],[46,-4],[39,1],[31,0],[27,6],[27,17],[24,29],[21,32],[18,29],[19,13],[16,8],[10,8],[7,20],[5,34],[2,32],[3,15],[-1,9],[-8,11],[-10,24],[-13,29],[-16,26],[-15,10],[-21,7],[-26,10],[-29,20],[-32,22],[-35,19],[-34,5],[-42,3],[-47,-4]];
    const last=edge.at(-1), first=edge[0];
    const outline=`M${(last[0]+first[0])/2},${(last[1]+first[1])/2} `+edge.map(([x,y],i)=>{const b=edge[(i+1)%edge.length];return `Q${x},${y} ${(x+b[0])/2},${(y+b[1])/2}`;}).join(' ')+' Z';
    const inner = edge.filter((_,i)=>i%2===0).map(([x,y],i)=>[x*.86,y<0?y+3.8:y-1,.35+i%3*.1]);
    return [
      line(outline,.6,{'stroke-dasharray':'1.6 2.7'}), dots([...edgeDots(edge),...inner]),
      line('M-30,-13 Q-26,-7 -29,1 M-14,-16 Q-10,-9 -12,-1 M9,-15 Q6,-7 8,-1 M27,-10 Q23,-6 24,0',.75),
      line('M-31,7 Q-34,14 -32,18 M-12,9 Q-14,18 -13,24 M5,12 Q3,20 4,29 M23,8 Q25,18 22,27',.8),
      dots([[-29,3,.45],[-30,5,.4],[-13,4,.45],[-12,7,.4],[7,3,.5],[6,7,.4],[24,4,.45],[22,6,.35],[-39,-14,.45],[-22,-18,.45],[-5,-21,.4],[16,-18,.5],[36,-10,.4]])
    ];
  }
  if (kind === 'salt') {
    const dots = [[-36,-7,1.4],[-29,-16,1.1],[-24,-3,1.2],[-19,-22,.9],[-15,-11,1.4],[-9,-19,1.1],[-5,-2,1.6],[2,-13,1.2],[10,-23,1],[15,-7,1.5],[24,-15,1.1],[33,-6,1.3],[39,4,1],[-39,8,1],[-30,15,1.5],[-19,8,1],[-14,20,1.2],[-8,11,1.5],[2,22,1.2],[7,8,1.1],[16,17,1.5],[24,5,1.1],[31,16,1.3],[-2,-27,.9],[43,-10,.9],[-22,26,.9],[20,28,.9]];
    return [
      line('M-46,-2 Q-50,-15 -37,-20 M-31,-25 Q-22,-31 -13,-28 M-5,-29 Q5,-33 15,-27 M25,-24 Q40,-24 46,-14 M48,-2 Q52,10 42,17 M34,24 Q24,31 13,30 M3,28 Q-9,34 -19,30 M-28,27 Q-40,27 -44,17', 1.1),
      ...dots.map(([x,y,r]) => line(`M${x-r},${y} a${r},${r} 0 1,0 ${2*r},0 a${r},${r} 0 1,0 ${-2*r},0`, .5, { fill: '#25372f' })),
      line('M-32,1 l4,-4 3,4 -4,3 Z M-16,0 l4,-3 3,5 -4,2 Z M-3,16 l3,-4 4,3 -3,4 Z M17,2 l3,-4 4,3 -2,4 Z M30,-20 l3,-3 3,4 -4,2 Z', 1.05)
    ];
  }
  if (kind === 'spall') {
    const edge=[[-46,-8],[-41,-12],[-43,-18],[-35,-22],[-31,-19],[-25,-27],[-19,-25],[-14,-30],[-8,-26],[-3,-28],[3,-23],[10,-27],[15,-24],[23,-28],[29,-22],[27,-18],[36,-19],[40,-13],[37,-9],[45,-6],[42,0],[48,5],[43,11],[39,10],[37,18],[30,17],[28,25],[20,23],[16,29],[9,26],[4,30],[-2,26],[-8,29],[-14,25],[-20,27],[-24,20],[-32,23],[-36,17],[-33,13],[-41,12],[-44,6],[-40,1],[-47,-2]];
    const texture=[];
    for(let row=0;row<12;row++) for(let col=0;col<22;col++) {
      const x=-37+col*3.5+Math.sin(row*7+col*3)*.9, y=-20+row*3.8+Math.cos(row*3+col*11)*.7, radial=(x/40)**2+(y/25)**2;
      if(radial<.94 && (radial>.53 || (row*7+col*3)%5<2)) texture.push([x,y,.3+(row+col)%4*.1]);
    }
    return [
      line('M'+edge.map(p=>p.join(',')).join(' L')+' Z',1.2), dots([...edgeDots(edge),...texture]),
      line('M-42,-15 l5,-5 6,2 1,5 -6,3 Z M-22,-26 l5,-4 6,4 -2,5 -5,1 Z M19,-23 l5,-5 6,5 -2,6 -7,-1 Z M35,-4 l7,-2 4,5 -3,6 -6,-2 Z M21,18 l7,-2 3,5 -5,5 -6,-2 Z M-33,14 l7,-3 5,5 -2,5 -7,1 Z M-7,22 l5,-4 6,4 -1,6 -6,2 Z',1.05),
      line('M-49,-12 l3,-2 2,3 -3,2 Z M-35,-29 l4,-2 2,3 -3,2 Z M33,-26 l3,-2 2,4 -3,1 Z M46,17 l3,-2 2,3 -3,2 Z M-43,23 l3,-2 2,4 -3,1 Z M-18,32 l3,-2 2,3 -3,1 Z',.85)
    ];
  }
  if (kind === 'exposedRebar') {
    const edge=[[-46,-10],[-40,-25],[-25,-22],[-16,-30],[-3,-25],[8,-29],[23,-23],[35,-25],[46,-13],[42,-2],[47,10],[37,23],[24,20],[13,29],[0,24],[-14,28],[-25,20],[-40,23],[-45,10],[-42,0]];
    return [line('M'+edge.map(p=>p.join(',')).join(' L')+' Z',1.3),dots(edgeDots(edge)),
      ...[-9,9].flatMap(y=>[line(`M-39,${y-2} H39 M-39,${y+2} H39`,1.6),line(Array.from({length:12},(_,i)=>`M${-35+i*6},${y-4} l3,8`).join(' '),1.1)])];
  }
  if (kind === 'activeLeak') return [
    line('M-46,-26 L-33,-28 -23,-23 -13,-27 -4,-23 5,-27 16,-23 29,-26 44,-24',1.6),
    line('M-21,-19 v9 M0,-19 v12 M0,-3 v5 M24,-18 v6',1.25),
    line('M-21,-4 C-24,2 -30,6 -30,11 A9,9 0 0,0 -12,11 C-12,6 -18,2 -21,-4 Z',1.65),
    line('M0,8 C-3,14 -9,18 -9,23 A9,9 0 0,0 9,23 C9,18 3,14 0,8 Z',1.65),
    line('M24,-7 C21,-1 17,2 17,6 A7,7 0 0,0 31,6 C31,2 27,-1 24,-7 Z',1.65),
    line('M-26,10 Q-27,15 -22,16 M-5,22 Q-6,27 -1,28 M21,5 Q20,9 24,10',.9)
  ];
  if (kind === 'tileBulge') return [
    line('M-48,6 H-22 V27 H-48 Z M22,6 H48 V27 H22 Z',1.4),
    line('M-22,6 Q0,-29 22,6 L22,19 Q0,-16 -22,19 Z',1.8),
    line('M0,-11 V2 M-48,16 H-23 M23,16 H48',1),
    line('M-20,27 H20',.9,{'stroke-dasharray':'2 3'}),
    line('M0,19 V10 M-4,15 L0,10 4,15',1.3)
  ];
  if (['tileDetached','tileBroken'].includes(kind)) {
    const grid=line('M-48,-29 H48 V29 H-48 Z M-16,-29 V29 M16,-29 V29 M-48,0 H48',1.25);
    if(kind==='tileBroken') return [grid,
      line('M-34,-29 L-29,-20 -20,-16 -23,-9 -12,-4 -6,7 4,10 8,22 15,29 M-20,-16 L-10,-20 -5,-29 M-6,7 L-17,14 -23,24 M4,10 L16,5 25,11 37,7 48,13',1.8),
      line('M29,-29 L34,-20 43,-17 48,-9',1.1)];
    const exposed=[[-14,-27],[0,-27],[5,-24],[14,-27],[14,-9],[11,-5],[14,-2],[-14,-2],[-11,-11],[-14,-15]];
    const texture=[];for(let y=-23;y<-3;y+=4)for(let x=-10;x<13;x+=4)texture.push([x+Math.sin(x+y)*.6,y,.4+((x+y+60)%3)*.1]);
    return [grid,line('M'+exposed.map(p=>p.join(',')).join(' L')+' Z',1.05),dots(texture),
      line('M-12,4 L9,7 12,22 -7,26 Z',1.4,{fill:'white'}),line('M-7,9 L6,11 8,20',.85)];
  }
  if (kind === 'paintBlister') return [
    ...[[-29,-14,13],[3,-19,11],[31,-5,12],[-13,13,15],[22,22,10]].flatMap(([x,y,r])=>[
      line(`M${x-r},${y+2} C${x-r},${y-r} ${x+r},${y-r} ${x+r},${y+2} C${x+r},${y+r*.8} ${x-r},${y+r*.8} ${x-r},${y+2} Z`,1.25),
      line(`M${x-r*.6},${y} Q${x-r*.3},${y-r*.55} ${x+r*.25},${y-r*.4}`,.8),
      dots(Array.from({length:6},(_,i)=>[x-r*.7+i*r*.27,y+r*.55+.5*Math.sin(i),.35]))
    ]),line('M-6,7 Q5,5 2,15 L-3,12 Q-1,9 -6,7 Z',1,{fill:'white'})
  ];
  return [];
}
export const symbolPaths = kind => symbolArtwork(kind).map(shape => shape.d);
export function symbolPreview(kind) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -40 120 80" aria-hidden="true"><g fill="none" stroke="#25372f" stroke-linecap="round" stroke-linejoin="round">${symbolArtwork(kind).map(shape => `<path ${Object.entries(shape).map(([key,value]) => `${key}="${value}"`).join(' ')}/>`).join('')}</g></svg>`;
}
export function symbolBox(mark, width, height) {
  const size = mark.size * Math.min(width, height), a = mark.rotation * Math.PI / 180;
  const rx = (Math.abs(Math.cos(a)) * .54 + Math.abs(Math.sin(a)) * .38) * size;
  const ry = (Math.abs(Math.sin(a)) * .54 + Math.abs(Math.cos(a)) * .38) * size;
  return { x: mark.points[0].x - rx / width, y: mark.points[0].y - ry / height, w: rx * 2 / width, h: ry * 2 / height };
}
export function moveDetailMark(mark, dx, dy, width, height) {
  const result = structuredClone(mark), box = mark.type === 'symbol' ? symbolBox(mark, width, height) : { x: Math.min(...mark.points.map(p => p.x)), y: Math.min(...mark.points.map(p => p.y)), w: Math.max(...mark.points.map(p => p.x)) - Math.min(...mark.points.map(p => p.x)), h: Math.max(...mark.points.map(p => p.y)) - Math.min(...mark.points.map(p => p.y)) };
  dx = Math.max(-box.x, Math.min(1 - box.x - box.w, dx)); dy = Math.max(-box.y, Math.min(1 - box.y - box.h, dy));
  result.points.forEach(p => { p.x = Math.max(0, Math.min(1, p.x + dx)); p.y = Math.max(0, Math.min(1, p.y + dy)); }); return result;
}
export function mirrorDetailMarks(marks) {
  return marks.map(mark => { const m = structuredClone(mark); m.points.forEach(p => { p.x = 1 - p.x; }); if (m.type === 'symbol') { m.rotation = (360 - m.rotation) % 360; m.mirror = !m.mirror; } return m; });
}
export function splitDetailLine(mark, segment) {
  if (mark.type !== 'pen' || segment < 0 || segment >= mark.points.length - 1) return [structuredClone(mark)];
  return [mark.points.slice(0, segment + 1), mark.points.slice(segment + 1)].filter(p => p.length >= 2).map(points => ({ ...structuredClone(mark), points: structuredClone(points) }));
}
export const detailMarkName = mark => mark.type === 'opening' ? (mark.kind === 'door' ? '門框' : '窗框') : mark.type === 'symbol' ? DETAIL_SYMBOLS[mark.symbol] : mark.type === 'region' ? REGION_TYPES[mark.condition] + '範圍' : ({ pen: '裂隙線', arrow: '箭頭', circle: '圈選', text: '文字' }[mark.type]);

export const regionArea = points => Math.abs(points.reduce((sum,a,i) => { const b = points[(i+1)%points.length]; return sum + a.x*b.y - b.x*a.y; },0))/2;

// Oblique preset faces in normalised image coordinates (TL, TR, BR, BL). A flat face keeps the
// two-corner rectangle; a perspective face turns two taps into a four-corner opening that follows the wall.
const face = (...pts) => pts.map(([x, y]) => ({ x: x / 600, y: y / 320 }));
const stageFaces = [face([103, 75], [497, 75], [497, 262], [103, 262]), face([15, 27], [103, 75], [103, 262], [15, 302]), face([497, 75], [585, 27], [585, 302], [497, 262])];
export const PRESET_PLANES = {
  wall: stageFaces, window: stageFaces, door: stageFaces,
  corner: [face([25, 36], [300, 83], [300, 242], [25, 285]), face([300, 83], [575, 36], [575, 285], [300, 242])],
  frame: [face([45, 45], [555, 45], [555, 105], [45, 105]), face([70, 105], [135, 105], [135, 264], [70, 264]), face([135, 105], [465, 105], [465, 264], [135, 264]), face([465, 105], [530, 105], [530, 264], [465, 264])],
  beam: [face([45, 68], [555, 68], [555, 148], [45, 148]), face([45, 148], [555, 148], [496, 210], [104, 210])]
};
// Square-to-quad projective map (Heckbert) with its inverse through the adjugate.
export function planeTransform(plane) {
  const [p0, p1, p2, p3] = plane, sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) { const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, det = dx1 * dy2 - dx2 * dy1; g = (sx * dy2 - dx2 * sy) / det; h = (dx1 * sy - sx * dy1) / det; }
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x, d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y;
  const forward = ({ u, v }) => { const w = g * u + h * v + 1; return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w }; };
  const A = e - f * h, B = c * h - b, C = b * f - c * e, D = f * g - d, E = a - c * g, F = c * d - a * f, G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
  const inverse = ({ x, y }) => { const w = G * x + H * y + I; return { u: (A * x + B * y + C) / w, v: (D * x + E * y + F) / w }; };
  const flat = Math.abs(p0.y - p1.y) < 1e-9 && Math.abs(p1.x - p2.x) < 1e-9 && Math.abs(p2.y - p3.y) < 1e-9 && Math.abs(p3.x - p0.x) < 1e-9;
  return { forward, inverse, flat };
}
export function planeAt(kind, mirror, point) {
  const p = mirror ? { x: 1 - point.x, y: point.y } : point;
  for (const plane of PRESET_PLANES[kind] || []) { const t = planeTransform(plane), l = t.inverse(p); if (l.u >= -1e-6 && l.u <= 1 + 1e-6 && l.v >= -1e-6 && l.v <= 1 + 1e-6) return { plane, ...t }; }
  return null;
}
// Two taps on an oblique face become the face-aligned opening; null means "use the plain rectangle".
export function openingOnPlane(kind, mirror, a, b) {
  const found = planeAt(kind, mirror, a); if (!found) return null;
  const un = p => mirror ? { x: 1 - p.x, y: p.y } : p, clamp = n => Math.max(0, Math.min(1, n));
  const la = found.inverse(un(a)), lb = found.inverse(un(b)), u0 = clamp(Math.min(la.u, lb.u)), u1 = clamp(Math.max(la.u, lb.u)), v0 = clamp(Math.min(la.v, lb.v)), v1 = clamp(Math.max(la.v, lb.v));
  if (u1 - u0 < .01 || v1 - v0 < .01) return null;
  const corners = [{ u: u0, v: v0 }, { u: u1, v: v0 }, { u: u1, v: v1 }, { u: u0, v: v1 }].map(found.forward).map(un);
  return found.flat ? [corners[0], corners[2]] : corners;
}
