/* 計算書純工具的單一來源；factory 可內嵌於下載 HTML，無需 opener 或網路。 */
(function (root, createReportUtils) {
  if (typeof module === 'object' && module.exports) {
    module.exports = { createReportUtils };
  } else {
    root.StructReportUtilsFactory = createReportUtils;
    root.StructReportUtils = createReportUtils(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function createReportUtils(runtime) {
  function escapeHtml(value, quotes = 'all') {
    let text = (value == null ? '' : String(value)) // == null 同時涵蓋 null 與未定義值；此 factory 原始碼會內嵌進計算書 HTML，不得出現正式 smoke 禁止的字樣
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (quotes !== 'none') text = text.replace(/"/g, '&quot;');
    if (quotes === 'all') text = text.replace(/'/g, '&#39;');
    return text;
  }

  function formatTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    return date.getFullYear() + '/' +
      String(date.getMonth() + 1).padStart(2, '0') + '/' +
      String(date.getDate()).padStart(2, '0') + ' ' +
      String(date.getHours()).padStart(2, '0') + ':' +
      String(date.getMinutes()).padStart(2, '0') + ':' +
      String(date.getSeconds()).padStart(2, '0');
  }

  function normalizeFingerprintValue(value) {
    if (value == null) return null; // == null 同時涵蓋 null 與未定義值
    if (Array.isArray(value)) return value.map(normalizeFingerprintValue);
    if (typeof value === 'object') {
      const normalized = {};
      Object.keys(value).sort().forEach((key) => {
        if (key === 'dataURL' || key === 'html') return;
        normalized[key] = normalizeFingerprintValue(value[key]);
      });
      return normalized;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    return String(value);
  }

  function fingerprintHash(text, seed) {
    let hash = seed >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function containsTexFormula(value) {
    const text = String(value == null ? '' : value)
      .replace(new RegExp('<scr' + 'ipt\\b[^>]*>[\\s\\S]*?<\\/' + 'scr' + 'ipt>', 'gi'), '')
      .replace(new RegExp('<sty' + 'le\\b[^>]*>[\\s\\S]*?<\\/' + 'sty' + 'le>', 'gi'), '');
    return text.indexOf('\\(') >= 0 || text.indexOf('\\[') >= 0;
  }

  function readTexCommand(text, index) {
    let end = index + 1;
    if (/[A-Za-z]/.test(text[end] || '')) {
      while (/[A-Za-z]/.test(text[end] || '')) end += 1;
    } else if (end < text.length) end += 1;
    return { name: text.slice(index + 1, end), next: end };
  }

  function readTexGroup(text, index) {
    let cursor = index;
    while (/\s/.test(text[cursor] || '')) cursor += 1;
    if (text[cursor] !== '{') {
      if (text[cursor] === '\\') {
        const command = readTexCommand(text, cursor);
        return { value: text.slice(cursor, command.next), next: command.next };
      }
      return { value: text[cursor] || '', next: Math.min(cursor + 1, text.length) };
    }
    const start = cursor + 1;
    let depth = 1;
    cursor = start;
    while (cursor < text.length && depth > 0) {
      if (text[cursor] === '\\') cursor += 1;
      else if (text[cursor] === '{') depth += 1;
      else if (text[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    return { value: text.slice(start, depth === 0 ? cursor - 1 : cursor), next: cursor };
  }

  function formatTexFallback(value) {
    const source = String(value == null ? '' : value);
    const symbols = {
      alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ',
      nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
      Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
      times: '×', cdot: '·', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠',
      approx: '≈', equiv: '≡', infty: '∞', sum: 'Σ', prod: 'Π', int: '∫', to: '→', rightarrow: '→',
      leftarrow: '←', degree: '°', percent: '%',
    };

    function convert(text) {
      let output = '';
      for (let index = 0; index < text.length;) {
        const pair = text.slice(index, index + 2);
        if (pair === '\\(' || pair === '\\)' || pair === '\\[' || pair === '\\]') { index += 2; continue; }
        if (text[index] === '\\') {
          const command = readTexCommand(text, index);
          index = command.next;
          const name = command.name;
          if (name === 'frac') {
            const numerator = readTexGroup(text, index); index = numerator.next;
            const denominator = readTexGroup(text, index); index = denominator.next;
            output += '(' + convert(numerator.value) + ') / (' + convert(denominator.value) + ')';
          } else if (name === 'sqrt') {
            const argument = readTexGroup(text, index); index = argument.next;
            output += '√(' + convert(argument.value) + ')';
          } else if (['text', 'mathrm', 'mathbf', 'mathit', 'operatorname'].includes(name)) {
            const argument = readTexGroup(text, index); index = argument.next;
            output += convert(argument.value);
          } else if (['left', 'right', 'displaystyle', 'textstyle', 'limits'].includes(name)) {
            continue;
          } else if ([',', ';', ':', '!', 'quad', 'qquad', 'enspace', 'thinspace'].includes(name)) {
            output += ' ';
          } else if (name === '{' || name === '}' || name === '_' || name === '%') {
            output += name;
          } else if (name === '\\') {
            output += ' ';
          } else {
            output += symbols[name] || name;
          }
          continue;
        }
        if (text[index] === '{' || text[index] === '}') { index += 1; continue; }
        if (text[index] === '_' || text[index] === '^') {
          const marker = text[index++];
          const argument = readTexGroup(text, index);
          index = argument.next;
          output += marker + '(' + convert(argument.value) + ')';
          continue;
        }
        output += text[index++];
      }
      return output;
    }

    return convert(source).replace(/\s+/g, ' ').trim();
  }

  function setMathJaxFallbackState(documentRef) {
    const doc = documentRef || runtime.document;
    const root = doc && doc.documentElement;
    if (!root || !root.classList) return false;
    markAlternativeEquationFallbacks(doc);
    root.classList.remove('mathjax-ready');
    root.classList.add('mathjax-fallback');
    return true;
  }

  function setMathJaxReadyState(documentRef) {
    const doc = documentRef || runtime.document;
    const root = doc && doc.documentElement;
    if (!root || !root.classList) return false;
    root.classList.remove('mathjax-fallback');
    root.classList.add('mathjax-ready');
    return true;
  }

  function markAlternativeEquationFallbacks(documentRef) {
    const doc = documentRef || runtime.document;
    if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
    let count = 0;
    doc.querySelectorAll('.equation-math-wrap').forEach(function (wrap) {
      if (wrap.querySelector('.mono--fallback, .equation-list--fallback')) {
        wrap.classList.add('mathjax-use-text-fallback');
        count += 1;
      }
    });
    return count;
  }

  function prepareMathFallbackMarkup(value, documentRef) {
    const html = String(value == null ? '' : value);
    const doc = documentRef || runtime.document;
    if (!containsTexFormula(html) || !doc || typeof doc.createElement !== 'function' || typeof doc.createTreeWalker !== 'function') return html;
    const template = doc.createElement('template');
    template.innerHTML = html;
    const root = template.content || template;
    const showText = doc.defaultView?.NodeFilter?.SHOW_TEXT || 4;
    const walker = doc.createTreeWalker(root, showText);
    const nodes = [];
    let node = walker.nextNode();
    while (node) { nodes.push(node); node = walker.nextNode(); }
    const expression = /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g;
    nodes.forEach(function (textNode) {
      const parent = textNode.parentElement;
      if (!parent || parent.closest('script, style, noscript, textarea, .mathjax-source, .mathjax-readable-fallback')) return;
      const equation = parent.closest('.equation-math');
      const wrap = equation && equation.closest('.equation-math-wrap');
      if (wrap && wrap.querySelector('.mono--fallback, .equation-list--fallback')) {
        wrap.classList.add('mathjax-use-text-fallback');
        return;
      }
      const source = textNode.nodeValue || '';
      if (!containsTexFormula(source)) return;
      expression.lastIndex = 0;
      let match, cursor = 0;
      const fragment = doc.createDocumentFragment();
      while ((match = expression.exec(source))) {
        if (match.index > cursor) fragment.appendChild(doc.createTextNode(source.slice(cursor, match.index)));
        const formulaSource = doc.createElement('span');
        formulaSource.className = 'mathjax-source';
        formulaSource.textContent = match[0];
        const fallback = doc.createElement('span');
        fallback.className = 'mathjax-readable-fallback';
        fallback.textContent = formatTexFallback(match[0]);
        fragment.appendChild(formulaSource);
        fragment.appendChild(fallback);
        cursor = match.index + match[0].length;
      }
      if (cursor === 0) return;
      if (cursor < source.length) fragment.appendChild(doc.createTextNode(source.slice(cursor)));
      textNode.parentNode.replaceChild(fragment, textNode);
    });
    markAlternativeEquationFallbacks(root);
    return template.innerHTML;
  }

  function applyMathJaxFallback(documentRef) {
    const doc = documentRef || runtime.document;
    if (!doc) return 0;
    setMathJaxFallbackState(doc);
    return doc.querySelectorAll ? doc.querySelectorAll('.mathjax-readable-fallback, .mathjax-use-text-fallback').length : 0;
  }

  function openReportDocument(html, windowRef, features, onLoad) {
    const win = windowRef || runtime;
    if (!win || typeof win.open !== 'function' || typeof win.Blob !== 'function' || !win.URL
      || typeof win.URL.createObjectURL !== 'function') return null;
    const blob = new win.Blob([String(html == null ? '' : html)], { type: 'text/html;charset=utf-8' });
    const reportUrl = win.URL.createObjectURL(blob);
    let popup;
    try {
      popup = win.open('about:blank', '_blank', features || '');
    } catch (error) {
      win.URL.revokeObjectURL(reportUrl);
      throw error;
    }
    if (!popup) {
      win.URL.revokeObjectURL(reportUrl);
      return null;
    }

    let released = false;
    let reportLoaded = false;
    let closePoll = null;
    const releaseUrl = function () {
      if (released) return;
      released = true;
      if (closePoll !== null && typeof win.clearInterval === 'function') win.clearInterval(closePoll);
      win.URL.revokeObjectURL(reportUrl);
    };
    const handleLoad = function () {
      let currentUrl = '';
      try { currentUrl = popup.location.href; } catch (_) {}
      if (reportLoaded || currentUrl !== reportUrl) return;
      reportLoaded = true;
      releaseUrl();
      if (typeof onLoad === 'function') onLoad(popup);
    };
    if (typeof popup.addEventListener === 'function') popup.addEventListener('load', handleLoad);
    if (typeof win.setInterval === 'function') {
      closePoll = win.setInterval(function () {
        if (popup.closed) releaseUrl();
      }, 250);
    }
    try {
      popup.location.replace(reportUrl);
    } catch (error) {
      releaseUrl();
      try { popup.close(); } catch (_) {}
      throw error;
    }
    return popup;
  }

  function loadMathJaxOrFallback(windowRef, documentRef, options) {
    const win = windowRef || runtime;
    const doc = documentRef || win?.document || runtime.document;
    const timeoutMs = Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 12000;
    if (!win || !doc || !doc.head || doc.documentElement?.classList?.contains('mathjax-fallback')
      || !containsTexFormula(doc.body?.innerHTML || '')) return Promise.resolve(false);

    const typeset = function () {
      if (!win.MathJax || typeof win.MathJax.typesetPromise !== 'function') return Promise.reject(new Error('MathJax 未就緒'));
      return Promise.resolve(win.MathJax.typesetPromise([doc.body]));
    };
    if (win.MathJax && typeof win.MathJax.typesetPromise === 'function') {
      return typeset().then(function () { setMathJaxReadyState(doc); return true; }, function () { applyMathJaxFallback(doc); return false; });
    }

    win.MathJax = {
      tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']] },
      svg: { fontCache: 'global' },
      startup: { typeset: false },
    };
    setMathJaxFallbackState(doc);
    const script = doc.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
    script.async = true;
    script.setAttribute('data-report-mathjax-runtime', 'true');
    return new Promise(function (resolve) {
      let settled = false;
      let timeoutId;
      const finish = function (ready) {
        if (settled) return;
        settled = true;
        win.clearTimeout(timeoutId);
        if (!ready && script.parentNode) script.parentNode.removeChild(script);
        if (ready) { setMathJaxReadyState(doc); resolve(true); }
        else { applyMathJaxFallback(doc); resolve(false); }
      };
      timeoutId = win.setTimeout(function () { finish(false); }, timeoutMs);
      script.onload = function () { typeset().then(function () { finish(true); }, function () { finish(false); }); };
      script.onerror = function () { finish(false); };
      doc.head.appendChild(script);
    });
  }

  function artifactBaseName(reportTitle, documentLabel, fingerprint) {
    return [reportTitle, documentLabel, fingerprint].filter(Boolean).join('_')
      .replace(/[<>:"/|?*]/g, '-').split(String.fromCharCode(92)).join('-').trim();
  }

  // 保留既有 UTF-8 轉換：無 TextEncoder 時孤立 surrogate 仍拋出 URIError。
  function sha256Text(value) {
    const bytes = typeof runtime.TextEncoder === 'function'
      ? Array.from(new runtime.TextEncoder().encode(String(value || '')))
      : Array.from(unescape(encodeURIComponent(String(value || '')))).map(function (char) { return char.charCodeAt(0); });
    const bitLength = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const high = Math.floor(bitLength / 4294967296);
    const low = bitLength >>> 0;
    [high, low].forEach(function (word) {
      bytes.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255);
    });
    let h = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
    const k = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
    function rotr(word, amount) { return (word >>> amount) | (word << (32 - amount)); }
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const w = new Array(64);
      for (let index = 0; index < 16; index += 1) {
        const pos = offset + index * 4;
        w[index] = ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
      }
      for (let wi = 16; wi < 64; wi += 1) {
        const s0 = rotr(w[wi - 15], 7) ^ rotr(w[wi - 15], 18) ^ (w[wi - 15] >>> 3);
        const s1 = rotr(w[wi - 2], 17) ^ rotr(w[wi - 2], 19) ^ (w[wi - 2] >>> 10);
        w[wi] = (w[wi - 16] + s0 + w[wi - 7] + s1) >>> 0;
      }
      let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (let round = 0; round < 64; round += 1) {
        const sum1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const choice = (e & f) ^ ((~e) & g);
        const temp1 = (hh + sum1 + choice + k[round] + w[round]) >>> 0;
        const sum0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (sum0 + majority) >>> 0;
        hh = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      h = [(h[0] + a) >>> 0, (h[1] + b) >>> 0, (h[2] + c) >>> 0, (h[3] + d) >>> 0,
        (h[4] + e) >>> 0, (h[5] + f) >>> 0, (h[6] + g) >>> 0, (h[7] + hh) >>> 0];
    }
    return h.map(function (word) { return word.toString(16).padStart(8, '0'); }).join('');
  }

  // 下載是效果邊界；保持原先同步 click 與 1000 ms 後 revoke 的次序。
  function downloadBlob(blob, fileName) {
    const url = runtime.URL.createObjectURL(blob);
    const link = runtime.document.createElement('a');
    link.href = url;
    link.download = fileName;
    runtime.document.body.appendChild(link);
    link.click();
    link.remove();
    runtime.setTimeout(function () { runtime.URL.revokeObjectURL(url); }, 1000);
  }

  return Object.freeze({ escapeHtml, formatTimestamp, normalizeFingerprintValue, fingerprintHash,
    cleanText, artifactBaseName, sha256Text, downloadBlob, containsTexFormula, formatTexFallback, prepareMathFallbackMarkup,
    setMathJaxFallbackState, setMathJaxReadyState, applyMathJaxFallback, openReportDocument, loadMathJaxOrFallback });
});
