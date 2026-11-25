(function () {
  'use strict';

  const config = document.currentScript.dataset;
  const section = document.querySelector('[data-stm-case]');
  const form = section.closest('main');
  const storage = window.ToolProjectStorage;
  const meta = { id: config.toolId, name: document.title };
  const refresh = window[config.refresh];
  const file = section.querySelector('[data-stm-case-file]');
  const status = section.querySelector('[data-stm-case-status]');
  const preview = section.querySelector('[data-stm-case-preview]');
  let pending = null;
  let readVersion = 0;

  function inspect(payload) {
    const review = storage.inspectPayload(payload, meta, form);
    if (payload.tool?.id !== meta.id || payload.storageVersion !== storage.version
        || !payload.fields || typeof payload.fields !== 'object' || Array.isArray(payload.fields)
        || !review.compatible || review.missingFieldIds.length || review.unknownFieldIds.length) {
      throw new Error('案件版本、工具或欄位不相容。');
    }

    for (const [id, field] of Object.entries(payload.fields)) {
      const input = document.getElementById(id);
      if (!field || field.type !== input.type || typeof field.value !== 'string') {
        throw new Error('欄位格式不正確：' + id);
      }
      if (input.type === 'checkbox' && (typeof field.checked !== 'boolean' || field.value !== input.value)) {
        throw new Error('勾選欄位格式不正確：' + id);
      }
      if (input.type === 'number') {
        const probe = input.cloneNode(false);
        probe.value = field.value;
        if (probe.value !== field.value) throw new Error('數字欄位格式不正確：' + id);
      }
      if (input.type === 'select-one' && !Array.from(input.options).some(option => option.value === field.value)) {
        throw new Error('選項不再可用：' + id);
      }
    }
  }

  function write(fields) {
    for (const [id, field] of Object.entries(fields)) {
      const input = document.getElementById(id);
      if (input.type === 'checkbox') input.checked = field.checked;
      else input.value = field.value;
    }
  }

  function closePreview() {
    pending = null;
    preview.hidden = true;
  }

  section.querySelector('[data-stm-case-export]').addEventListener('click', function () {
    try {
      const payload = storage.buildPayload(meta, form);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = meta.id + '-' + payload.savedAt.slice(0, 10) + '.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
      status.textContent = '案件 JSON 已下載。';
    } catch (error) {
      status.textContent = '匯出失敗：' + error.message;
    }
  });

  section.querySelector('[data-stm-case-import]').addEventListener('click', function () { file.click(); });
  file.addEventListener('change', async function () {
    const selected = file.files[0];
    if (!selected) return;
    const currentRead = ++readVersion;
    file.value = '';
    closePreview();
    try {
      const payload = JSON.parse(await selected.text());
      if (currentRead !== readVersion) return;
      inspect(payload);
      pending = payload;
      preview.hidden = false;
      status.textContent = '已驗證「' + selected.name + '」。套用將取代本頁輸入。';
    } catch (error) {
      if (currentRead !== readVersion) return;
      status.textContent = '匯入失敗，已保留原輸入：' + error.message;
    }
  });

  section.querySelector('[data-stm-case-cancel]').addEventListener('click', function () {
    closePreview();
    status.textContent = '已取消匯入，畫面資料已保留。';
  });

  section.querySelector('[data-stm-case-apply]').addEventListener('click', function () {
    if (!pending) return;
    const original = storage.collectFields(form);
    for (const [id, field] of Object.entries(original)) field.value = document.getElementById(id).value;
    try {
      inspect(pending);
      write(pending.fields);
      refresh();
      closePreview();
      status.textContent = '已套用案件並更新檢核結果。';
    } catch (error) {
      write(original);
      refresh();
      closePreview();
      status.textContent = '匯入失敗，已保留原輸入：' + error.message;
    }
  });
})();
