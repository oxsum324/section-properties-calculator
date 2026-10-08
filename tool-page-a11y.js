(() => {
  'use strict';

  const text = element => (element?.textContent || '').replace(/\s+/g, ' ').trim();
  let generatedId = 0;
  const uniqueId = prefix => {
    let id;
    do { id = `${prefix}-${++generatedId}`; }
    while (document.getElementById(id));
    return id;
  };

  function queryIncludingRoot(root, selector) {
    const matches = [...root.querySelectorAll(selector)];
    if (root instanceof Element && root.matches(selector)) matches.unshift(root);
    return matches;
  }

  function labelControls(root = document) {
    queryIncludingRoot(root, 'input:not([type="hidden"]), select, textarea').forEach(control => {
      if (control.matches('[type="submit"], [type="button"], [type="reset"], [type="image"]')) return;
      if (control.labels?.length || control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) return;
      const box = control.closest('.form-group, .field, .form-field, .form-row, .input-group, .control-group, .form-item');
      const visibleLabel = box && [...box.querySelectorAll('label')].find(label => text(label));
      const name = text(visibleLabel) || control.getAttribute('title') || control.getAttribute('placeholder')
        || control.getAttribute('aria-description') || control.getAttribute('name') || control.id
        || (control.tagName === 'SELECT' ? '選擇項目' : '輸入欄位');
      control.setAttribute('aria-label', name);
    });
  }

  function buttonName(button) {
    const explicit = button.getAttribute('aria-label') || button.getAttribute('title');
    if (explicit?.trim()) return explicit.trim();
    const labelledBy = button.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelledText = labelledBy.split(/\s+/).map(id => text(document.getElementById(id))).filter(Boolean).join(' ');
      if (labelledText) return labelledText;
    }
    const visualText = text(button);
    const readableText = visualText.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f\s\p{P}\p{S}]/gu, '').trim();
    if (readableText) return visualText;
    const imageAlt = [...button.querySelectorAll('img[alt]')].map(image => image.alt.trim()).filter(Boolean).join(' ');
    if (imageAlt) return imageAlt;
    const svgTitle = [...button.querySelectorAll('svg title')].map(title => text(title)).filter(Boolean).join(' ');
    if (svgTitle) return svgTitle;
    const hint = button.dataset.tooltip || button.dataset.action || button.dataset.label || button.id
      || button.closest('[aria-label]')?.getAttribute('aria-label')
      || text(button.closest('label, .form-group, .field, .card, section')?.querySelector('label, h1, h2, h3, legend'));
    return hint ? `按鈕：${hint.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ')}` : '操作按鈕';
  }

  function labelButtons(root = document) {
    queryIncludingRoot(root, 'button, [role="button"]').forEach(button => {
      if (button.hasAttribute('aria-label') || button.hasAttribute('aria-labelledby')) return;
      const visualText = text(button);
      const readableText = visualText.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f\s\p{P}\p{S}]/gu, '').trim();
      if (readableText && !button.hasAttribute('title')) return;
      const name = buttonName(button);
      if (name) button.setAttribute('aria-label', name);
    });
  }

  function setupTabLists() {
    document.querySelectorAll('.mode-bar__group[role="tablist"], .unit-mode-switch[role="tablist"]').forEach(group => {
      group.setAttribute('role', 'group');
      const sync = () => group.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false'));
      new MutationObserver(sync).observe(group, { subtree: true, attributes: true, attributeFilter: ['class'] });
      sync();
    });

    const groups = [...document.querySelectorAll('.section-tabs')];
    groups.forEach((group, groupIndex) => {
      const tabs = [...group.querySelectorAll(':scope > button')];
      if (!tabs.length) return;
      group.setAttribute('role', 'tablist');
      if (!group.hasAttribute('aria-label')) group.setAttribute('aria-label', text(group.previousElementSibling) || '工具頁分頁');
      const panelFor = tab => {
        const key = tab.dataset.tab || tab.dataset.panel;
        if (!key) return [];
        if (tab.dataset.tab) {
          return [...new Set([
            ...document.querySelectorAll('.subpanel[data-panel]'),
            ...document.querySelectorAll('[data-shows]'),
          ].filter(panel => panel.dataset.panel === key || (panel.dataset.shows || '').split(/\s+/).includes(key)))];
        }
        return [...document.querySelectorAll(`#panel-${CSS.escape(key)}`)];
      };
      tabs.forEach((tab, tabIndex) => {
        if (!tab.id) tab.id = uniqueId(`tool-tab-${groupIndex}-${tabIndex}`);
        tab.setAttribute('role', 'tab');
        const panels = panelFor(tab);
        panels.forEach((panel, panelIndex) => {
          if (!panel.id) panel.id = uniqueId(`tool-panel-${groupIndex}-${tabIndex}-${panelIndex}`);
          panel.setAttribute('role', 'tabpanel');
        });
        if (panels.length) tab.setAttribute('aria-controls', panels.map(panel => panel.id).join(' '));
      });
      const allPanels = [...new Set(tabs.flatMap(panelFor))];
      const visibleTabs = () => [...group.querySelectorAll(':scope > [role="tab"]')]
        .filter(tab => tab.getClientRects().length && getComputedStyle(tab).visibility !== 'hidden');
      const sync = () => {
        const orderedTabs = [...group.querySelectorAll(':scope > [role="tab"]')];
        const current = orderedTabs.find(tab => tab.classList.contains('active')) || orderedTabs.find(tab => tab.getAttribute('aria-selected') === 'true') || orderedTabs[0];
        const currentKey = current?.dataset.tab || current?.dataset.panel;
        tabs.forEach(tab => {
          const selected = tab === current;
          tab.setAttribute('aria-selected', String(selected));
          tab.tabIndex = selected ? 0 : -1;
          if (tab.hasAttribute('aria-pressed')) tab.removeAttribute('aria-pressed');
        });
        allPanels.forEach(panel => {
          const panelIdKey = panel.id.startsWith('panel-') ? panel.id.slice('panel-'.length) : '';
          const panelKey = panel.dataset.panel || panelIdKey;
          const related = orderedTabs.filter(tab => {
            const key = tab.dataset.tab || tab.dataset.panel;
            return panelKey === key || (panel.dataset.shows || '').split(/\s+/).includes(key);
          });
          panel.setAttribute('aria-labelledby', related.map(tab => tab.id).join(' ') || current?.id || '');
          const panelKeys = (panel.dataset.shows || panelKey || '').split(/\s+/).filter(Boolean);
          const active = panelKeys.includes(currentKey) && panel.getClientRects().length > 0;
          panel.setAttribute('aria-hidden', String(!active));
          const containsFocusable = panel.querySelector('a[href],button,input,select,textarea,[tabindex="0"]');
          panel.tabIndex = active && !containsFocusable ? 0 : -1;
        });
      };
      group.addEventListener('keydown', event => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        const shown = visibleTabs();
        if (!shown.length) return;
        const at = shown.indexOf(document.activeElement);
        let next = 0;
        if (event.key === 'End') next = shown.length - 1;
        else if (event.key === 'ArrowRight') next = (Math.max(at, 0) + 1) % shown.length;
        else if (event.key === 'ArrowLeft') next = (Math.max(at, 0) - 1 + shown.length) % shown.length;
        event.preventDefault();
        shown[next].focus();
        shown[next].click();
        sync();
      });
      new MutationObserver(sync).observe(group, { subtree: true, attributes: true, attributeFilter: ['class'] });
      allPanels.forEach(panel => {
        new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class', 'style'] });
      });
      sync();
    });
  }

  function fixScrollAndImages(root = document) {
    queryIncludingRoot(root, '*').forEach(element => {
      if (element.matches('html, body, main')) return;
      if (element.matches('.v2-method-card[role="button"]')) element.setAttribute('role', 'group');
      const style = getComputedStyle(element);
      const canScroll = /(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`) && element.getClientRects().length > 0;
      if (canScroll && !element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0');
      if (canScroll && !element.hasAttribute('role')) element.setAttribute('role', 'region');
      if (canScroll && !element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby')) {
        const caption = text(element.querySelector('caption, h1, h2, h3, th')) || text(element.previousElementSibling);
        element.setAttribute('aria-label', caption || (element.querySelector('table') ? '可捲動資料表' : '可捲動內容區'));
      }
      if (element.matches('.diagram[aria-label], [id="planDiagram"], [id="isoDiagram"]') && !element.hasAttribute('role')) element.setAttribute('role', 'img');
      if (element.tagName.toLowerCase() === 'svg' && element.getAttribute('role') === 'img'
        && !element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby')) {
        const parentName = element.parentElement?.getAttribute('aria-label') || text(element.querySelector('title'))
          || text(element.parentElement?.previousElementSibling) || '工程示意圖';
        element.setAttribute('aria-label', parentName);
      }
      if (element.tagName.toLowerCase() === 'img' && !element.hasAttribute('alt')) {
        const parentName = element.closest('[data-imgcaption]')?.getAttribute('data-imgcaption')
          || element.closest('figure')?.querySelector('figcaption')?.textContent
          || element.getAttribute('title') || '石材固定示意圖片';
        element.setAttribute('alt', parentName.trim());
      }
    });
  }

  const parseColor = value => {
    const m = value.match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const p = m[1].split(',').map(part => Number.parseFloat(part.trim()));
    return p.length >= 3 && p.slice(0, 3).every(Number.isFinite) ? [p[0], p[1], p[2], Number.isFinite(p[3]) ? p[3] : 1] : null;
  };
  const composite = (fg, bg) => {
    const a = fg[3];
    return [0, 1, 2].map(index => fg[index] * a + bg[index] * (1 - a)).concat(1);
  };
  const luminance = rgb => {
    const linear = rgb.slice(0, 3).map(value => {
      const s = value / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const contrast = (a, b) => {
    const l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  function fixContrast(root = document) {
    const candidates = root === document ? [...document.querySelectorAll('body *')] : queryIncludingRoot(root, '*');
    candidates.forEach(element => {
      const hasDirectText = element.childNodes && [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
      const isTextControl = element.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]), select, textarea');
      if ((!hasDirectText && !isTextControl) || element.matches('script, style, option, svg, [aria-hidden="true"]') || !element.getClientRects().length) return;
      const style = getComputedStyle(element);
      if (Number.parseFloat(style.opacity) < 1) {
        element.style.setProperty('opacity', '1', 'important');
        element.dataset.toolA11yStylePending = 'true';
      }
      let foreground = parseColor(style.color);
      if (!foreground || foreground[3] < 1) return;
      const ancestors = [];
      for (let node = element; node && node !== document.documentElement; node = node.parentElement) ancestors.push(node);
      let background = [255, 255, 255, 1];
      for (const node of ancestors.reverse()) {
        const bg = parseColor(getComputedStyle(node).backgroundColor);
        if (bg) background = composite(bg, background);
      }
      const threshold = Number.parseFloat(style.fontSize) >= 24 || (Number.parseFloat(style.fontSize) >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700) ? 3.2 : 4.8;
      if (contrast(foreground, background) >= threshold) return;
      const seek = endpoint => {
        let low = 0, high = 1, result = endpoint;
        for (let index = 0; index < 24; index += 1) {
          const amount = (low + high) / 2;
          const candidate = foreground.slice(0, 3).map((value, channel) => value + (endpoint[channel] - value) * amount).concat(1);
          if (contrast(candidate, background) >= threshold) { result = candidate; high = amount; }
          else low = amount;
        }
        return result;
      };
      const dark = seek([0, 0, 0]);
      const light = seek([255, 255, 255]);
      const distance = color => color.slice(0, 3).reduce((sum, value, index) => sum + (value - foreground[index]) ** 2, 0);
      const adjusted = distance(dark) <= distance(light) ? dark : light;
      element.style.setProperty('color', `rgb(${adjusted.slice(0, 3).map(Math.round).join(', ')})`, 'important');
      element.dataset.toolA11yStylePending = 'true';
    });
  }

  function install() {
    if (!document.body || document.body.dataset.toolA11yReady === 'true') return;
    document.body.dataset.toolA11yReady = 'true';
    const focusStyle = document.createElement('style');
    focusStyle.textContent = ':where(button,a,input,select,textarea,[tabindex]):focus-visible{outline:3px solid #1d4ed8!important;outline-offset:2px!important}';
    document.head.appendChild(focusStyle);
    labelControls();
    labelButtons();
    setupTabLists();
    fixScrollAndImages();
    let contrastQueued = false;
    const observer = new MutationObserver(records => {
      const contrastRoots = new Set();
      for (const record of records) {
        if (record.type === 'attributes' && record.attributeName === 'style' && record.target.dataset.toolA11yStylePending === 'true') {
          delete record.target.dataset.toolA11yStylePending;
          continue;
        }
        if (record.target instanceof Element) {
          labelControls(record.target);
          labelButtons(record.target);
          fixScrollAndImages(record.target);
          contrastRoots.add(record.target);
        }
        for (const node of record.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          labelControls(node);
          labelButtons(node);
          fixScrollAndImages(node);
          contrastRoots.add(node);
        }
      }
      if (!contrastQueued && contrastRoots.size) {
        contrastQueued = true;
        requestAnimationFrame(() => {
          contrastQueued = false;
          contrastRoots.forEach(fixContrast);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    requestAnimationFrame(() => requestAnimationFrame(() => fixContrast()));
    window.addEventListener('load', () => fixContrast(), { once: true });
    window.addEventListener('resize', () => requestAnimationFrame(() => fixContrast()), { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
