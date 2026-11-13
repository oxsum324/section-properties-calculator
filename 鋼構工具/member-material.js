/* Steel beam and column material selection. Lengths in mm, native stress in kgf/cm². */
(function (global) {
  'use strict';
  const field = id => document.getElementById(id);
  const options = () => global.Steel.FY_OPTIONS;
  const selected = () => options().find((item,i) => (item.key || String(i)) === field('matSelect').value);
  const mpaPerKgfCm2 = 0.0980665;
  function selectOptions() {
    const select = field('matSelect'), previous = select.value || '0';
    select.replaceChildren(...options().map((item,i) => {
      const opt = new Option(item.label,item.key || String(i));
      opt.disabled = !!item.archived;
      return opt;
    }));
    select.value = previous;
  }
  function refresh(mode, applyPreset, replayOld) {
    const item = selected(), fy = field('inFy'), basis = field('materialBasis');
    const specified = item?.key === 'specified';
    basis.parentElement.hidden = !specified;
    basis.disabled = !specified;
    fy.readOnly = !!item?.archived || !!(item?.key && !specified);
    let value, note = '', error = '';
    if (!item) error = '請選擇有效的鋼材與產品。';
    else if (item.archived && !replayOld) error = '舊案的 SM490／A572-50 未區分材質。已保留原 Fy；請依材證重選鋼級或專案指定值。';
    else if (item.key && !specified) {
      const t = field('inTf').valueAsNumber;
      const isH = !field('sectionTypeSelect') || field('sectionTypeSelect').value === 'h';
      const grade = isH && global.Steel.lookupMemberGrade(item.key,t);
      if (!grade) {
        fy.value = '';
        error = isH ? '翼板厚度未在所選型鋼表適用範圍，請核對材證。' : '所選材料表適用熱軋 H 型鋼。鋼管請依產品材證選「專案指定 Fy」。';
      } else {
        value = grade.fyMpa / mpaPerKgfCm2;
        fy.value = mode === 'si' ? grade.fyMpa : Number(value.toFixed(4));
        note = item.label + '，翼板厚 ' + t + ' mm，Fy = ' + grade.fyMpa + ' MPa。' + grade.source;
      }
    } else {
      if (applyPreset && item.Fy != null) fy.value = mode === 'si' ? Number((item.Fy*mpaPerKgfCm2).toFixed(1)) : item.Fy;
      value = fy.valueAsNumber / (mode === 'si' ? mpaPerKgfCm2 : 1);
      if (!(Number.isFinite(value) && value > 0)) error = '請填正值 Fy 並核對單位。';
      else if (specified && !basis.value.trim()) error = '請填專案指定 Fy 的材證或設計依據。';
      if (specified) note = item.label + '。依據：' + basis.value.trim();
      else if (!item.archived) note = '選項「' + item.label + '」，採本案 Fy 欄位數值。';
    }
    field('materialNote').textContent = error || note;
    return {value,note,error};
  }
  function initPlateLookup() {
    const thickness = field('plateLookupThickness');
    thickness.addEventListener('input', () => {
      const grade = global.Steel.lookupMemberGrade('sm490-plate',thickness.valueAsNumber);
      field('plateLookupResult').textContent = grade ? '鋼板最低 Fy = ' + grade.fyMpa + ' MPa（' + (grade.fyMpa/mpaPerKgfCm2).toFixed(2) + ' kgf/cm²）。' : '請填型錄範圍內的厚度（6 至 160 mm）。';
    });
  }
  global.SteelMemberMaterial = {selectOptions,refresh,initPlateLookup};
})(globalThis);