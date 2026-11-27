(function () {
  'use strict';

  const config = document.currentScript?.dataset;
  if (!config) return;
  const delay = 800;

  function install() {
    const anchor = document.querySelector(config.draftAnchor || '.mode-bar')
      || document.querySelector('header');
    if (!anchor) return;

    const banner = document.createElement('section');
    banner.className = 'tool-draft-guard no-print page-only-tool-actions';
    banner.hidden = true;
    banner.dataset.pageOnly = 'true';
    const text = document.createElement('span');
    text.setAttribute('role', 'status');
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = '恢復草稿';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = '清除';
    banner.append(text, restore, clear);
    anchor.insertAdjacentElement('afterend', banner);

    const style = document.createElement('style');
    style.textContent = [
      '.tool-draft-guard{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;box-sizing:border-box;max-width:100%;padding:8px 12px;margin:8px 0;background:var(--bg-subtle,#eff6ff);color:var(--fg-1,#172554);border:1px solid var(--border-default,#bfdbfe);border-radius:8px;font-size:.9rem;}',
      '.tool-draft-guard[hidden]{display:none;}',
      '.tool-draft-guard button{min-height:36px;padding:4px 10px;font:inherit;}',
      '@media print{.tool-draft-guard{display:none!important;}}',
    ].join('');
    document.head.append(style);

    const fieldsSelector = 'input[id], input[name], select[id], select[name], textarea[id], textarea[name]';
    const excludedInputs = 'input:is([type=file], [type=hidden], [type=button], [type=submit], [type=reset], [type=image], [type=password], [type=search])';
    const excludedSections = 'dialog, .project-storage-bar, .report-paper, .tool-draft-guard, [data-rc-details=force-candidate], [data-draft-ignore]';
    const choices = config.draftChoices ? Array.from(document.querySelectorAll(config.draftChoices)) : [];
    const actions = [config.draftChoices, config.draftActions].filter(Boolean).join(', ');
    const adapter = config.draftAdapter ? window[config.draftAdapter] : null;
    const suffix = adapter?.keySuffix ? ':' + encodeURIComponent(adapter.keySuffix) : '';
    const storageKey = 'tool-draft-guard:v1:' + location.pathname + suffix;
    let timer = null;
    let loadingDraft = false;
    let pendingDraft = null;

    function allowField(field) {
      return !field.readOnly && !field.hasAttribute('data-filter-input') && !field.matches(excludedInputs) && !field.closest(excludedSections)
        && !/attachmentApproval|attachmentApproved|approvalConfirm|CandidateConfirm|reviewResolution/i.test(field.id || field.name);
    }

    function formFields() {
      const occurrences = new Map();
      const fields = new Map();
      for (const field of document.querySelectorAll(fieldsSelector)) {
        if (!allowField(field)) continue;
        const identity = [field.id || '', field.name || '', field.type, field.type === 'radio' ? field.value : ''];
        const prefix = JSON.stringify(identity);
        const occurrence = (occurrences.get(prefix) || 0) + 1;
        occurrences.set(prefix, occurrence);
        fields.set(prefix + ':' + occurrence, field);
      }
      return fields;
    }

    function choiceKey(button) {
      return button.dataset.mode || button.dataset.method || button.id;
    }

    function fieldValue(field) {
      if (field.type === 'checkbox' || field.type === 'radio') return field.checked;
      if (field instanceof HTMLSelectElement && field.multiple) return Array.from(field.selectedOptions, option => option.value);
      return field.value;
    }

    function snapshot() {
      if (adapter) return adapter.capture();
      const activeChoice = choices.find(button => button.classList.contains('active') || button.getAttribute('aria-pressed') === 'true');
      return {
        choice: activeChoice ? choiceKey(activeChoice) : null,
        fields: Array.from(formFields(), ([key, field]) => [key, fieldValue(field)]),
      };
    }

    function signature(state) {
      if (adapter?.signature) return adapter.signature(state);
      if (!adapter) return JSON.stringify(state);
      return JSON.stringify(Object.entries(state).sort(([left], [right]) => left.localeCompare(right)));
    }

    function draftRecord(raw) {
      try {
        const saved = JSON.parse(raw || 'null');
        const state = saved?.state;
        const valid = adapter ? state && typeof state === 'object' && !Array.isArray(state) : Array.isArray(state?.fields);
        if (saved?.version === 1 && Number.isFinite(Date.parse(saved.savedAt))
            && valid) return saved;
      } catch {
        // Ignore data that cannot be read as a draft from this version.
      }
      return null;
    }

    function loadDraft() {
      try {
        return draftRecord(localStorage.getItem(storageKey)) || adapter?.readLegacy?.() || null;
      } catch {
        return null;
      }
    }

    function showDraft(draft) {
      pendingDraft = draft;
      banner.hidden = !draft || signature(snapshot()) === signature(draft.state);
      if (banner.hidden) return;
      const savedTime = new Date(draft.savedAt);
      const label = Number.isFinite(savedTime.getTime()) ? savedTime.toLocaleString('zh-TW', {hour12:false})
        : draft.savedAt || '時間未記錄';
      text.textContent = '偵測到上次暫存草稿（' + label + '）';
    }

    function saveDraft() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      try {
        const draft = { version: 1, savedAt: new Date().toISOString(), state: snapshot() };
        localStorage.setItem(storageKey, JSON.stringify(draft));
        showDraft(draft);
      } catch {
        if (!banner.hidden) text.textContent = '無法儲存新草稿，仍可恢復上次暫存。';
      }
    }

    function scheduleSave() {
      if (loadingDraft) return;
      clearTimeout(timer);
      timer = setTimeout(saveDraft, delay);
    }

    function replaceField(field, value) {
      if (!field || field.disabled || JSON.stringify(fieldValue(field)) === JSON.stringify(value)) return false;
      if (field.type === 'checkbox' || field.type === 'radio') {
        if (typeof value !== 'boolean') return false;
        field.checked = value;
        if (field.type === 'radio' && !value) return true;
      } else if (field instanceof HTMLSelectElement && field.multiple) {
        if (!Array.isArray(value)) return false;
        for (const option of field.options) option.selected = value.includes(option.value);
      } else {
        if (typeof value !== 'string') return false;
        if (field.type === 'select-one' && !Array.from(field.options).some(option => option.value === value)) return false;
        field.value = value;
      }
      field.dispatchEvent(new Event('input', {bubbles:true}));
      field.dispatchEvent(new Event('change', {bubbles:true}));
      return true;
    }

    restore.addEventListener('click', function () {
      if (!pendingDraft) return;
      clearTimeout(timer);
      timer = null;
      loadingDraft = true;
      try {
        const state = pendingDraft.state;
        if (adapter) {
          if (adapter.restore(state) === false) throw Error('draft rejected');
        } else {
          const choice = choices.find(button => choiceKey(button) === state.choice);
          if (choice && !choice.classList.contains('active') && choice.getAttribute('aria-pressed') !== 'true') choice.click();
          let fields = formFields();
          for (const entry of state.fields) {
            if (!Array.isArray(entry)) continue;
            if (replaceField(fields.get(entry[0]), entry[1])) fields = formFields();
          }
        }
        banner.hidden = true;
      } catch {
        text.textContent = '草稿無法套用，請確認目前表單版本。';
      } finally {
        loadingDraft = false;
      }
    });

    clear.addEventListener('click', function () {
      clearTimeout(timer);
      timer = null;
      try {
        localStorage.removeItem(storageKey);
        adapter?.clearLegacy?.();
        showDraft(null);
      } catch {
        text.textContent = '無法清除草稿，請檢查瀏覽器的儲存設定。';
      }
    });

    function onFieldEdit(event) {
      if (event.target instanceof Element && event.target.matches(fieldsSelector) && allowField(event.target)) scheduleSave();
    }

    showDraft(loadDraft());
    document.addEventListener('input', onFieldEdit);
    document.addEventListener('change', onFieldEdit);
    if (actions) document.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest(actions)) scheduleSave();
    });
    document.addEventListener('tool-draft-change', scheduleSave);
    addEventListener('pagehide', saveDraft);
    addEventListener('storage', event => {
      if (event.key === storageKey) showDraft(loadDraft());
    });
  }

  if (document.readyState === 'complete') install();
  else addEventListener('load', install, {once:true});
})();
