// 在正規化座標 s=x/L 上積分 EI·v'''' = −w，向上為正。跨內載重用 Macaulay 項，
// 三次項由兩端的實際位移、轉角決定。圖形取樣與跨內極值共用同一條曲線。
function elementDeflectionCurve(element, loads) {
  const { L, EI } = element;
  const [v1, t1, v2, t2] = element.dispLocal;
  const terms = [];
  for (const load of loads) {
    if (load.type === 'udl' || load.type === 'trapezoid') {
      const w = load.type === 'udl' ? load.w : load.w1;
      terms.push({ start:0, power:4, factor:-w * L**4 / (24 * EI) });
      if (load.type === 'trapezoid') {
        terms.push({ start:0, power:5, factor:-(load.w2-load.w1) * L**4 / (120 * EI) });
      }
    } else if (load.a > 0 && load.a < L) {
      if (load.type === 'point') terms.push({ start:load.a/L, power:3, factor:-load.P * L**3 / (6 * EI) });
      if (load.type === 'moment') terms.push({ start:load.a/L, power:2, factor:-load.M * L**2 / (2 * EI) });
    }
  }
  // 由物理跨段左界決定集中項的有效側；集中彎矩處的曲率可跳躍。
  function evaluate(s, order = 0, segmentStart = s) {
    let value = 0;
    for (const { start, power, factor } of terms) {
      if (start > segmentStart || order > power) continue;
      let derivative = factor;
      for (let i = 0; i < order; i++) derivative *= power - i;
      value += derivative * (s - start)**(power - order);
    }
    return value;
  }
  const rise = v2 - v1 - evaluate(1);
  const endSlope = L * t2 - evaluate(1, 1);
  terms.push({ start:0, power:0, factor:v1 }, { start:0, power:1, factor:L*t1 },
    { start:0, power:2, factor:3*rise - 2*L*t1 - endSlope },
    { start:0, power:3, factor:-2*rise + L*t1 + endSlope });
  const breaks = [...new Set([0, 1, ...terms.map(term => term.start)])].sort((a,b) => a-b);
  // v 在每個平滑段至多五次。逐階以導數零點分成單調區間，二分求斜率變號點；
  // 不靠繪圖站距估峰值。內鉸、力矩及荷重分界本身亦列入候選位置。
  function roots(order, lo, hi) {
    if (order === 5) return [];
    const cuts = [lo, ...roots(order+1, lo, hi), hi];
    const found = [];
    for (let i=1; i<cuts.length; i++) {
      let a = cuts[i-1], b = cuts[i];
      const left = evaluate(a, order, lo), right = evaluate(b, order, lo);
      if (left === 0 && i > 1) found.push(a);
      if (left === 0 || right === 0 || Math.sign(left) === Math.sign(right)) continue;
      for (let k=0; k<52; k++) {
        const mid = (a+b)/2, value = evaluate(mid, order, lo);
        if (value === 0) { a = b = mid; break; }
        if (Math.sign(value) === Math.sign(left)) a=mid; else b=mid;
      }
      found.push((a+b)/2);
    }
    return found;
  }
  const stations = [...breaks];
  for (let i=1; i<breaks.length; i++) stations.push(...roots(1, breaks[i-1], breaks[i]));
  function displacement(s) { return s === 0 ? v1 : s === 1 ? v2 : evaluate(s); }
  let peak = { x:0, value:v1 };
  for (const s of stations) {
    const value = displacement(s);
    if (Math.abs(value) > Math.abs(peak.value)) peak = { x:s*L, value };
  }
  return { peak, displacement };
}
