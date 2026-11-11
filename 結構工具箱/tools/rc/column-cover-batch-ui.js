(() => {
  'use strict';
  const batch = window.ColumnCoverBatch;
  const core = window.RcColumnCoverDeviationCore;
  const el = id => document.getElementById(id);
  const headers = batch.columns.map(c => c.label);
  const labels = ['匯入記錄序號', ...headers.slice(0,6)];
  const identity = row => [row.record, ...[...batch.identityKeys, 'sourceRow'].map(k => row.raw[k] ?? '')];
  const summaryHeader = [...labels,'狀態','最低容量保留比','保留比控制方向','最高實測利用率','利用率控制方向','量測基準','專案門檻','核心版本','原因','施工容許差','整體安全'];
  const errorHeader = [...labels,'欄位','原值','原因','應填格式'];
  const directionHeader = ['原始列號','柱號','方向','需求 (tf·m)','設計 φMn (tf·m)','實測 φMn (tf·m)','容量保留比','實測利用率','設計／實測軸力檢查','偏移 (mm)','實測原值 上／下／左／右 (mm)','主筋中心距 上／下／左／右 (mm)','Es (kgf/cm²)'];
  let revision = 0, source = '', fileText = null, delimiter = '\t';
  let prepared = null, reviewed = null, timings = {};
  const notice = text => { el('notice').textContent = text; };

  function invalidate() {
    revision++;
    prepared = reviewed = null;
    timings = {};
    el('run').disabled = true;
    el('manual').hidden = el('previewPanel').hidden = el('output').hidden = true;
    for (const id of ['rawTable','extremes','resultTable','directions','errorTable']) el(id).replaceChildren();
    notice('資料已變更，請預覽並重新計算。');
  }
  el('paste').addEventListener('input', () => {
    invalidate();
    fileText = null; delimiter = '\t'; source = '貼上 ' + new Date().toISOString();
    el('file').value = '';
    el('preview').disabled = false;
  });
  el('file').addEventListener('change', async () => {
    const file = el('file').files[0];
    if (!file) return;
    invalidate();
    const selectedRevision = revision;
    el('paste').value = ''; fileText = null; source = file.name;
    el('preview').disabled = true;
    if (!/\.(csv|tsv)$/i.test(file.name)) { notice('請選擇 UTF-8 CSV 或 TSV 檔。'); return; }
    delimiter = /\.csv$/i.test(file.name) ? ',' : '\t';
    try {
      const buffer = await file.arrayBuffer();
      if (revision !== selectedRevision) return;
      fileText = new TextDecoder('utf-8', {fatal:true}).decode(buffer);
      el('preview').disabled = false;
      notice('已讀取 ' + source + '，請預覽對欄。');
    } catch (error) {
      if (revision === selectedRevision) notice('無法讀取 UTF-8 檔案：' + error.message);
    }
  });

  function table(container, heading, rows) {
    const t = document.createElement('table');
    const header = t.createTHead().insertRow();
    for (const value of heading) {
      const th = document.createElement('th');
      th.scope = 'col'; th.textContent = value; header.append(th);
    }
    const body = t.createTBody();
    for (const values of rows) {
      const tr = body.insertRow();
      for (const value of values) tr.insertCell().textContent = value ?? '';
    }
    container.replaceChildren(t);
  }

  el('preview').addEventListener('click', () => {
    invalidate();
    const text = fileText ?? el('paste').value;
    if (!text.trim()) { notice('請先貼入 Excel 資料或選檔。'); return; }
    try {
      const start = performance.now();
      prepared = batch.preview(text, delimiter);
      timings.parseMs = performance.now() - start;
      const keys = prepared.labels.map(label => batch.columns.find(c => c.label === label).key);
      table(el('rawTable'), ['記錄序號',...prepared.labels,'額外欄位'], prepared.rows.map(r => [r.record,...keys.map(k => r.raw[k]),r.extra.join('／')]));
      el('previewPanel').hidden = false; el('previewPanel').open = true;
      el('run').disabled = false;
      notice(source + ' · 已對應 ' + keys.length + ' 欄，' + prepared.rows.length + ' 列。');
    } catch (error) { notice(error.message); }
  });

  function resultValues(row) {
    const r = row.result;
    const reason = r ? r.checks.filter(c => c.passed === false).map(c => c.detail).join('；')
      : row.issues.map(i => i.field + '：' + i.reason).join('；');
    return [...identity(row),row.status,r?.minimumRetentionRatio,r?.criticalRetentionDirectionLabel,
      r?.maximumMeasuredUtilization,r?.governingDemandDirectionLabel,row.raw.measurementMode,row.raw.minimumRetentionRatio,core.version,reason,'本工具未評估','本工具未評估'];
  }
  function errorValues() {
    return reviewed.flatMap(r => r.issues.map(i => [...identity(r),i.field,i.raw,i.reason,i.expected]));
  }
  function directionValues(row) {
    const r = row.result, m = r.measurement;
    const raw = [r.input.measuredTopMm,r.input.measuredBottomMm,r.input.measuredLeftMm,r.input.measuredRightMm].join('／');
    const centers = ['top','bottom','left','right'].map(f => m.measuredCentersMm[f]).join('／');
    const ok = value => value ? '通過' : '未通過';
    return r.directions.map(d => [row.raw.sourceRow,row.raw.columnId,d.label,d.demandTfm,d.design.phiMnTfm,
      d.measured.phiMnTfm,d.retentionRatio,d.measured.utilization,ok(d.design.axialOk)+'／'+ok(d.measured.axialOk),
      m.conversionOffsetMm,raw,centers,r.input.esKgfCm2]);
  }
  function displayExtreme(title, rows, value, direction) {
    if (!rows.length) return;
    const p = document.createElement('p');
    p.textContent = title + ' ' + rows[0].result[value].toFixed(6) + '：' + rows.map(row =>
      batch.identityKeys.map(key => row.raw[key]).join('／') + '（原始列 ' + row.raw.sourceRow + '，' + row.result[direction] + '）').join('、');
    el('extremes').append(p);
  }
  el('run').addEventListener('click', () => {
    if (!prepared) return;
    const start = performance.now();
    reviewed = batch.evaluate(prepared);
    timings.calculateMs = performance.now() - start;
    const summary = batch.summarize(reviewed), c = summary.counts;
    el('summary').textContent = '共 ' + reviewed.length + ' 列　通過 ' + c.pass + '　未通過 ' + c.fail + '　待補 ' + c.missing + '　錯列 ' + c.error;
    el('extremes').replaceChildren();
    if (!summary.minimumRows.length) el('extremes').textContent = '尚無可彙總結果';
    displayExtreme('最低容量保留比',summary.minimumRows,'minimumRetentionRatio','criticalRetentionDirectionLabel');
    displayExtreme('最高實測利用率',summary.maximumRows,'maximumMeasuredUtilization','governingDemandDirectionLabel');
    const visibleRows = reviewed.map(row => resultValues(row).map(value =>
      typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(6) : value));
    table(el('resultTable'),summaryHeader,visibleRows);
    table(el('directions'),directionHeader,reviewed.filter(row => row.result).flatMap(directionValues));
    const errors = errorValues();
    el('errors').hidden = !errors.length;
    table(el('errorTable'),errorHeader,errors);
    el('previewPanel').open = false; el('output').hidden = false;
    notice(source + ' · ' + reviewed.length + ' 列，解析 ' + timings.parseMs.toFixed(1) + ' ms，計算 ' + timings.calculateMs.toFixed(1) + ' ms。');
  });

  function tsvCell(value) {
    let s = String(value ?? '');
    // 文字欄在試算表中仍應作為文字，保留數值輸出的正負號。
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return /["\r\n\t]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s;
  }
  async function copy(title, getRows) {
    const start = performance.now(), currentRevision = revision;
    const text = getRows().map(row => row.map(tsvCell).join('\t')).join('\r\n');
    try {
      await navigator.clipboard.writeText(text);
      if (currentRevision !== revision) return;
      const ms = performance.now() - start;
      if (title === '結果') timings.copyResultsMs = ms;
      if (title === '待補與錯列') timings.copyErrorsMs = ms;
      el('manual').hidden = true;
      notice('已複製' + title + '，耗時 ' + ms.toFixed(1) + ' ms。');
    } catch {
      if (currentRevision !== revision) return;
      el('manual').hidden = false; el('manualText').value = text; el('manualText').select();
      notice('請按 Ctrl+C 或使用裝置的複製功能。');
    }
  }
  el('header').onclick = () => copy('表頭', () => [headers]);
  el('copyResults').onclick = () => copy('結果', () => [summaryHeader,...reviewed.map(resultValues)]);
  el('copyErrors').onclick = () => copy('待補與錯列', () => [errorHeader,...errorValues()]);
  el('export').onclick = () => {
    const payload = { source, coreVersion: core.version, rowCount:reviewed.length, timings, rows:reviewed };
    const json = JSON.stringify(payload, (_key,v) => typeof v === 'number' && !Number.isFinite(v) ? String(v) : v, 2);
    const url = URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = '柱保護層偏差_批次審閱.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
})();
