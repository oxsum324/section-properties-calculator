'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const scalar = ['widthCm','depthCm','clearCm','gravityPKgf','curvePKgf','yieldMKgfCm'];
  const descriptions = ['member','source','sectionBasis'];
  let current, report, modified = false, revision = 0;
  function invalidate() {
    revision++;
    current = null; report = null;
    $('exchange').hidden = true; $('results').hidden = true;
    $('status').textContent = ''; $('readStatus').textContent = '';
    $('readFile').value = '';
  }
  $('editor').addEventListener('input', () => { modified = true; invalidate(); });
  async function replace(data) {
    TeaspaPM3.validate(data);
    if (modified) {
      const dlg = $('replace');
      const result = new Promise(resolve => dlg.addEventListener('close',() => resolve(dlg.returnValue),{once:true}));
      dlg.returnValue = 'cancel'; dlg.showModal();
      if (await result !== 'replace') return;
    }
    invalidate();
    for (const key of [...descriptions,...scalar]) $(key).value = data[key];
    for (const key of ['pm','backbone']) $(key).value = data[key].map(row => row.join('\t')).join('\n');
    modified = false; $('status').textContent = '已載入 ' + data.member + '。';
  }
  function download(name,text,type) {
    const url = URL.createObjectURL(new Blob([text],{type}));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  $('example').onclick = async () => {
    try {
      await replace(TeaspaColumnExample);
    } catch (e) { $('status').textContent = e.message; }
  };
  $('sourceFile').onchange = async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try { await replace(JSON.parse(await file.text())); } catch (err) { $('status').textContent = err.message; }
  };
  function points(id) {
    return $(id).value.trim().split(/\r?\n/).filter(line => line.trim()).map(line =>
      line.trim().split(/[\s,]+/).map((v,i) => id === 'backbone' && !i ? v : Number(v)));
  }
  $('prepare').onclick = () => {
    invalidate();
    try {
      const s = {schema:'teaspa-pm3-source/1',pm:points('pm'),backbone:points('backbone')};
      for (const key of descriptions) s[key] = $(key).value.trim();
      for (const key of scalar) s[key] = $(key).valueAsNumber;
      current = {source:s,...TeaspaPM3.tables(s)};
      $('summary').textContent = s.member + '　' + s.pm.length + ' 個互制點、9 個有號背骨點。採用軸力 P = ' + s.curvePKgf + ' kgf；ETABS 表輸入 ' + (-s.curvePKgf) + ' kgf。';
      $('exchange').hidden = false; $('status').textContent = '來源資料已建立，可下載並進行存檔讀回。';
    } catch (e) { $('status').textContent = e.message; }
  };
  $('exportSource').onclick = () => download('teaspa-source.json',JSON.stringify(current.source,null,2),'application/json');
  $('exportHinge').onclick = () => download('pm3.tsv',TeaspaPM3.tsv(current.hinges),'text/tab-separated-values');
  $('exportEnds').onclick = () => download('assign.tsv',TeaspaPM3.tsv(current.ends),'text/tab-separated-values');
  $('exportCheck').onclick = () => download('teaspa-comparison.json',JSON.stringify({source:current.source,...report},null,2),'application/json');
  function renderRows(id, items) {
    $(id).replaceChildren(...items.map(values => {
      const row = document.createElement('tr');
      for (const value of values) row.insertCell().textContent = value ?? '缺值';
      return row;
    }));
  }
  $('readFile').onchange = async e => {
    const file = e.target.files[0], ticket = ++revision;
    e.target.value = ''; report = null; $('results').hidden = true; if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (ticket !== revision) return;
      report = TeaspaPM3.compare(current.source,raw);
      $('readStatus').textContent = report.matched ? '構件鉸讀回一致。' : '讀回有 ' + report.differences.length + ' 項差異。';
      renderRows('signed', report.signed.map(p => [p.label,p.momentRatio,p.rotationRad,p.origin]));
      renderRows('interaction', report.interaction.map(p => [p.point,p.sourcePKgf,p.targetPKgf,p.sourceMKgfCm,p.targetMKgfCm]));
      $('ends').textContent = '柱端實距（距 i 端） ' + report.ends.map(p => p.ActualDist ?? '缺值').join('、') + ' cm。';
      const c = report.criteria;
      $('criteria').textContent = 'ETABS 讀回 IO／LS／CP = ' + [c.IO,c.LS,c.CP].map(v=>v??'缺值').join('／') + '（' + c.source + '）。';
      $('diff').replaceChildren(...report.differences.map(d => {
        const p = document.createElement('p'); p.textContent = d.field + '　預期 ' + d.expected + '；讀回 ' + (d.actual ?? '缺值'); return p;
      }));
      $('results').hidden = false;
    } catch (err) { if (ticket === revision) $('readStatus').textContent = err.message; }
  };
})();
