function formatSteelMemberComparison(left, right, minimum, unit, factor = 1) {
  const ok = minimum ? left >= right : left <= right;
  const sign = minimum ? (ok ? '≥' : '<') : (ok ? '≤' : '>');
  const a = left * factor;
  const b = right * factor;
  for (let digits = 2; digits <= 8; digits++) {
    const x = a.toFixed(digits);
    const y = b.toFixed(digits);
    if (ok || x !== y) return `${x} ${sign} ${y} ${unit}`;
  }
  return `${a} / ${b} ${unit}（以未四捨五入值判定未通過）`;
}
