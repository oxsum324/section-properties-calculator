// Symbol geometry only: tread spacing does not represent measured dimensions.
export function stairGeometry(stroke, a, b) {
  const type = stroke.stairType, lines = [], poly = points => lines.push(points), end = type === 'unequal' ? -30 + 140 * stroke.shortRatio : 110;
  let route;
  if (type === 'straight') {
    poly([[-42,110],[-42,-110],[42,-110],[42,110],[-42,110]]);
    for (let y = -90; y < 110; y += 20) poly([[-42,y],[42,y]]);
    route = [[0,90],[0,-88]];
  } else if (type === 'l') {
    poly([[-110,110],[-110,-110],[110,-110],[110,-25],[-25,-25],[-25,110],[-110,110]]);
    for (let y = -25; y < 110; y += 20) poly([[-110,y],[-25,y]]);
    for (let x = -25; x < 110; x += 20) poly([[x,-110],[x,-25]]);
    route = [[-67,90],[-67,-67],[90,-67]];
  } else {
    poly([[-110,110],[-110,-110],[110,-110],[110,end],[25,end],[25,-30],[-25,-30],[-25,110],[-110,110]]);
    poly([[-110,-30],[-25,-30]]); poly([[25,-30],[110,-30]]);
    for (let y = -10; y < 110; y += 20) poly([[-110,y],[-25,y]]);
    for (let y = -10; y < end; y += 20) poly([[25,y],[110,y]]);
    route = [[-67,90],[-67,-70],[67,-70],[67,end-12]];
  }
  const cut = stroke.breakLine ? (type === 'straight' ? [[-46,22],[-14,8],[14,32],[46,18]] : [[-114,22],[-82,8],[-53,32],[-21,18]]) : null;
  const transform = ([x, y]) => {
    if (stroke.mirror) x = -x;
    for (let i = 0; i < stroke.rotation / 90; i++) [x, y] = [-y, x];
    const extent = type === 'straight' ? (stroke.rotation % 180 ? [110,42] : [42,110]) : [110,110];
    return { x: (a.x+b.x)/2 + x/extent[0]*Math.abs(b.x-a.x)/2, y: (a.y+b.y)/2 + y/extent[1]*Math.abs(b.y-a.y)/2 };
  };
  const arrow = stroke.direction === 'unknown' ? null : route.map(transform);
  return { lines: lines.map(points => points.map(transform)), cut: cut?.map(transform), arrow, label: arrow ? (stroke.direction === 'up' ? '上' : '下') : '' };
}
