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

// 工作頁的可編輯數字也是下一次計算的輸入。切換單位不應套用報表的小數位數。
const steelUnitHistory = new WeakMap();
function setConvertedSteelInput(field, from, to, converted, formatted) {
  const raw = field.value, last = steelUnitHistory.get(field);
  if (last && last.from === to && last.shown === raw) {
    field.value = last.original;
    steelUnitHistory.delete(field);
    return;
  }
  field.value = Number(formatted) === converted ? formatted : String(converted);
  steelUnitHistory.set(field, {from, original:raw, shown:field.value});
}
