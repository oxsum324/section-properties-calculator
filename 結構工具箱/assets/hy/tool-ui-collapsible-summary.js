(() => {
  const summaries = [...document.querySelectorAll('.details-summary-badge[data-details-value]')].map(badge => ({
    badge,
    details: badge.closest('details'),
    initialText: badge.textContent.trim()
  }));
  if (!summaries.length) return;

  function displayValue(field) {
    if (field instanceof HTMLSelectElement) return field.selectedOptions[0]?.textContent.trim() || '';
    if (field instanceof HTMLInputElement && field.type === 'checkbox') return field.checked ? '已啟用' : '未啟用';
    return (field.value ?? field.textContent).trim();
  }

  function updateSummaries() {
    for (const { badge, details, initialText } of summaries) {
      const fields = [...details.querySelectorAll(badge.dataset.detailsValue)];
      const value = fields.map(displayValue).find(Boolean);
      const text = value
        ? badge.dataset.detailsFilled || ((badge.dataset.detailsPrefix || '') + value + (badge.dataset.detailsSuffix || ''))
        : fields.length ? '未填寫' : initialText;
      if (badge.textContent !== text) badge.textContent = text;
      badge.title = text;
    }
  }

  let scheduled = false;
  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      updateSummaries();
    });
  }

  for (const type of ['input', 'change', 'click', 'reset']) {
    document.addEventListener(type, scheduleUpdate, true);
  }
  window.addEventListener('pageshow', scheduleUpdate);

  const observer = new MutationObserver(scheduleUpdate);
  for (const status of document.querySelectorAll('[data-details-refresh]')) {
    observer.observe(status, { childList: true, characterData: true, subtree: true });
  }
  // The existing profile script attaches the toolbar once the document is loaded.
  const profileHost = document.querySelector('[data-details-project-profile]');
  if (profileHost) {
    document.addEventListener('DOMContentLoaded', () => {
      const toolbar = document.querySelector('.project-meta-profile-bar');
      if (!toolbar) return;
      profileHost.append(toolbar);
      const status = toolbar.querySelector('[data-project-meta-status]');
      if (status) observer.observe(status, { childList: true, subtree: true });
      scheduleUpdate();
    }, { once: true });
  }
  updateSummaries();
})();
