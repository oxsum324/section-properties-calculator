/* 112 年混凝土規範 §9.7.1.4、10.7.1.3、25.4.2.2、25.5.1.5。單位 kgf、cm。 */
(function (root) {
  'use strict';
  const label = '伸展／搭接區橫向圍束 Ktr';
  const clauses = { beam:'§9.7.1.4', column:'§10.7.1.3', wall:'§25.4.2.2、25.5.1.5' };
  const pending = '待補';
  function number(value) {
    if (value == null || String(value).trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function checkPlane(member, bar, row) {
    const site = String(row.site || '').trim();
    const prefix = (site || '位置待填') + '／' + bar.label + '，db＝' + bar.db + ' cm';
    const result = (ok, status, detail) => ({ ok, status, detail:prefix + '。' + detail, group:bar.key });
    if (!Number.isFinite(bar.db) || !(bar.db > 0)) return result(null, pending, '請確認主筋直徑。');
    if (!site) return result(null, pending, '請指明伸展或搭接位置與劈裂面。');
    let pitchText = '';
    if (member === 'wall') {
      const measured = number(row.pitch);
      if (measured !== null && measured <= 0) return result(null, pending, '中心距須為正值。');
      if (measured === null && !(bar.spacing > 0 && bar.spacing < 15)) return result(null, pending, '請填伸展／搭接區的最小鋼筋中心距。');
      const pitch = Math.min(measured ?? Infinity, bar.spacing > 0 ? bar.spacing : Infinity);
      pitchText = '採用中心距 ' + Number(pitch.toPrecision(6)) + ' cm（取區段與已知配筋中心距較小值）。';
      if (pitch >= 15) return result(true, '免核', pitchText + '未達中心距小於 15 cm 的觸發條件。');
    }
    const required = 0.5 * bar.db;
    let actual, basis;
    if (row.method === 'project') {
      actual = number(row.ktr);
      if (actual === null || actual < 0 || !String(row.source || '').trim()) {
        return result(null, pending, pitchText + '請填非負的專案 Ktr（cm）及可回查的圖號或計算依據。');
      }
      basis = '專案指定（' + row.source.trim() + '）';
    } else if (row.method === 'area') {
      const area = number(row.area), spacing = number(row.spacing), count = number(row.count);
      if (area === null || area < 0 || !(spacing > 0) || !Number.isInteger(count) || !(count > 0)) {
        return result(null, pending, pitchText + '請填穿越該劈裂面的 Atr ≥ 0、橫向筋間距 s > 0 及該面主筋總根數 n（正整數）。');
      }
      actual = 40 * area / (spacing * count);
      if (!Number.isFinite(actual)) return result(null, pending, '材料或尺寸超出可計算範圍。');
      basis = '40 × ' + area + ' / (' + spacing + ' × ' + count + ')';
    } else {
      return result(null, pending, '請選擇計算方式。');
    }
    const ok = actual >= required;
    return { ...result(ok, ok ? '符合' : '不足', pitchText + 'Ktr＝' + basis + '，' + actual.toPrecision(6) +
      (ok ? ' ≥ ' : ' < ') + '0.5db＝' + required + ' cm。'), actual, required };
  }

  function evaluate(member, fy, bars, data, signature) {
    const clause = clauses[member];
    if (number(fy) > 0 && fy < 5600) return { active:false, ok:null, status:'免核', detail:'fy 小於 5,600 kgf/cm²。', rows:[], clause };
    const rows = [];
    let message = '';
    if (!(number(fy) >= 5600) || !bars.length) message = '請確認 fy 與實配縱向鋼筋直徑。';
    else if (data.invalid) message = '圍束紀錄無法讀取，請重新填寫。';
    else {
      for (const row of data.rows) {
        const bar = bars.find(b => b.key === row.group);
        rows.push(bar && bar.db > 0 ? checkPlane(member, bar, row) :
          { group:null, ok:null, status:pending, detail:'原鋼筋組已變更，請重新指定對應位置。' });
      }
      const missing = bars.filter(b => !rows.some(r => r.group === b.key)).map(b => b.label);
      if (missing.length) message = '請補 ' + missing.join('、') + ' 的控制面資料。';
      else if (rows.some(r => r.ok === null)) message = '請補齊各面的資料。';
      else if (data.confirmed !== signature) message = '請核對本次配筋與各伸展、搭接位置的控制面後勾選確認。';
    }
    const failed = rows.filter(r => r.ok === false);
    const ok = failed.length ? false : message ? null : true;
    const exempt = ok && rows.every(r => r.status === '免核');
    return { active:true, ok, status:ok === false ? '不足' : ok === null ? pending : exempt ? '免核' : '符合',
      detail:[failed.length ? failed.length + ' 個劈裂面不足。' : '', message].filter(Boolean).join(' ') ||
        (exempt ? '各列中心距均達 15 cm。' : '各適用面均符合 Ktr ≥ 0.5db。'), rows, clause };
  }

  function reportRows(check) {
    if (!check?.active) return [];
    return [{ label, formula:check.clause + '；Ktr ≥ 0.5db，式 (25.4.2.4b)', sub:check.detail, value:check.status, ok:check.ok },
      ...check.rows.map((r,i) => ({ label:'圍束紀錄 ' + (i+1), sub:r.detail, value:r.status, ok:r.status === '免核' ? null : r.ok }))];
  }

  function mount(member, recalculate) {
    const host = document.querySelector('[data-bond-confinement]');
    const saved = document.getElementById('bondPlaneData');
    const wall = member === 'wall';
    const node = (tag, txt) => { const el = document.createElement(tag); if (txt !== undefined) el.textContent=txt; return el; };
    const intro = node('p', wall ? '逐組確認伸展／搭接區最小中心距。小於 15 cm 時，填控制劈裂面。' :
      '梁、柱縱筋 fy 達 5,600 kgf/cm² 時，所有伸展與搭接區均須核對。');
    intro.className = 'hint';
    const instructions=node('p','同組有不同配筋或劈裂面時可新增紀錄。Atr 為間距 s 內穿越該面的橫向筋總面積，n 為該面伸展或續接的主筋總根數。');
    instructions.className='hint';
    const rowsHost=node('div'), add=node('button','新增劈裂面'), confirm=node('input'), output=node('p');
    add.type='button'; confirm.type='checkbox'; output.setAttribute('aria-live','polite');
    const approval=node('label'); approval.append(confirm, ' 已核對各組伸展與搭接位置，所列紀錄涵蓋控制劈裂面');
    host.append(node('h3',label),intro,instructions,rowsHost,add,node('div'),approval,output);
    let viewKey, source, data, bars=[], signature='';
    function write(reset=true) {
      if (reset) { data.confirmed = ''; delete data.invalid; }
      saved.value = data.rows.length ? JSON.stringify({rows:data.rows, confirmed:data.confirmed || ''}) : '';
      source = saved.value;
      recalculate();
    }
    function input(row, key, title, type='number', options) {
      const field=node('label',title);
      field.className='form-group'; const control=node(options?'select':'input');
      if (options) for(const [value,text] of options) { const opt=node('option',text); opt.value=value; control.append(opt); }
      else {control.type=type; if(type==='number') control.step=key==='count'?'1':'any';}
      control.dataset.bondKey=key;
      control.value=row[key] ?? '';
      control.addEventListener(options?'change':'input', e => {e.stopPropagation();row[key]=control.value;write();});
      field.append(control); return field;
    }
    const needsValues = row => !wall || !(number(row.pitch) >= 15 && !(bars.find(b=>b.key===row.group)?.spacing < 15));
    function showRows() {
      rowsHost.replaceChildren();
      data.rows.forEach((row,i) => {
        const section=node('fieldset'), legend=node('legend','紀錄 '+(i+1));section.append(legend);
        function line(...items) {const el=node('div');el.className='form-row';el.append(...items);section.append(el);}
        const choices=bars.map(b=>[b.key,b.label]);
        if(!choices.some(([k])=>k===row.group)) choices.unshift([row.group || '', '請重新指定鋼筋組']);
        line(input(row,'group','主筋組','text',choices),input(row,'site','位置與劈裂面（如柱底 X 向）','text'));
        if(wall) line(input(row,'pitch','該區最小中心距（cm）'));
        if(needsValues(row)) {
          line(input(row,'method','Ktr 依據','text',[['area','依圖計算 40Atr/(sn)'],['project','專案指定 Ktr']]));
          if(row.method==='project') line(input(row,'ktr','專案 Ktr（cm）'),input(row,'source','圖號／計算依據','text'));
          else line(input(row,'area','Atr（cm²）'),input(row,'spacing','橫向筋間距 s（cm）'),input(row,'count','主筋總根數 n'));
        }
        const remove=node('button','刪除此面');remove.type='button';remove.addEventListener('click',()=>{data.rows.splice(i,1);viewKey=null;write();});
        section.append(remove,node('p'));rowsHost.append(section);
      });
    }
    add.addEventListener('click',()=>{data.rows.push({group:bars.find(b=>!data.rows.some(r=>r.group===b.key))?.key || bars[0]?.key || '',method:'area'});write();});
    confirm.addEventListener('input',event=>{
      event.stopImmediatePropagation();
      data.confirmed=confirm.checked ? signature : '';
      write(false);
    });
    return function update(fy, groups, context) {
      bars = groups; signature=JSON.stringify([member,fy,bars,context]);
      let restored = false;
      if(source!==saved.value || !data) {
        source=saved.value; restored=true;
        try {
          data=source?JSON.parse(source):{rows:[],confirmed:''};
          if(!Array.isArray(data?.rows)||!data.rows.every(r=>r && typeof r==='object' &&
              Object.values(r).every(v=>typeof v==='string'))) throw Error();
        } catch {data={rows:[],confirmed:'',invalid:true};}
      }
      if(data.confirmed && data.confirmed!==signature) {
        data.confirmed=''; saved.value=JSON.stringify(data);source=saved.value;
      }
      const result=evaluate(member,fy,bars,data,signature);
      host.hidden=!result.active;
      if(result.active) {
        const key=JSON.stringify([bars,data.rows.map(r=>[r.group,r.method,needsValues(r)])]);
        if(restored || key!==viewKey) {showRows();viewKey=key;}
        [...rowsHost.children].forEach((el,i)=>{const r=result.rows[i]; el.lastElementChild.textContent=r ? r.status+'　'+r.detail : '';});
        const ready = !data.invalid && rowsHost.children.length > 0 && bars.every(b => result.rows.some(r => r.group === b.key)) &&
          result.rows.every(r => r.ok !== null);
        confirm.disabled = !ready;
        confirm.checked = ready && data.confirmed === signature;
        output.textContent = result.status + '　' + result.clause + '　' + result.detail;
      } else {viewKey=null;}
      return result;
    };
  }
  root.BondConfinement={ label, evaluate, reportRows, mount };
})(typeof window === 'undefined' ? globalThis : window);
